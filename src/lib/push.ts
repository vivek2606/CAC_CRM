import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// Web push (phone / desktop notifications from the installed app). Needs
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto:...) in the
// environment; without them push is simply off. Each person's devices are
// kept in AppSetting "push-subscriptions" (no schema change).
const KEY = "push-subscriptions";
type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
type Store = Record<string, Sub[]>;

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configured(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

async function load(): Promise<Store> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
    return (row?.value as Store | undefined) ?? {};
  } catch {
    return {};
  }
}
async function save(store: Store) {
  const value = JSON.parse(JSON.stringify(store));
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export async function addSubscription(userId: string, sub: Sub) {
  const store = await load();
  // A device belongs to whoever subscribed on it last.
  for (const id of Object.keys(store)) store[id] = store[id].filter((s) => s.endpoint !== sub.endpoint);
  store[userId] = [...(store[userId] ?? []), { endpoint: sub.endpoint, keys: sub.keys }];
  await save(store);
}

export async function removeSubscription(endpoint: string) {
  const store = await load();
  for (const id of Object.keys(store)) store[id] = store[id].filter((s) => s.endpoint !== endpoint);
  await save(store);
}

export async function subscribedUserIds(): Promise<string[]> {
  const store = await load();
  return Object.keys(store).filter((id) => store[id].length > 0);
}

// Sends to every device of these people; devices that have gone away are
// dropped. Never throws - a failed notification mustn't fail the action
// that triggered it.
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  try {
    if (!configured() || userIds.length === 0) return 0;
    const store = await load();
    const gone: string[] = [];
    let sent = 0;
    await Promise.all(
      userIds.flatMap((id) =>
        (store[id] ?? []).map(async (sub) => {
          try {
            await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
            sent++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) gone.push(sub.endpoint);
          }
        }),
      ),
    );
    if (gone.length) {
      for (const id of Object.keys(store)) store[id] = store[id].filter((s) => !gone.includes(s.endpoint));
      await save(store);
    }
    return sent;
  } catch (e) {
    console.error("sendPush failed", e);
    return 0;
  }
}

export async function pushToRole(role: "HEAD" | "COORDINATOR", payload: PushPayload) {
  const users = await prisma.user.findMany({ where: { role, isActive: true }, select: { id: true } });
  return sendPush(users.map((u) => u.id), payload);
}
