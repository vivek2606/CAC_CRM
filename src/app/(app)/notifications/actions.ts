"use server";

import { requireUser } from "@/lib/rbac";
import { addSubscription, removeSubscription, sendPush } from "@/lib/push";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

// Called by the bell when someone turns on notifications on a device.
export async function subscribePush(sub: Sub): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys.auth) return { ok: false };
  await addSubscription(user.id, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  return { ok: true };
}

export async function unsubscribePush(endpoint: string) {
  await requireUser();
  await removeSubscription(endpoint);
}

export async function sendTestPush(): Promise<{ sent: number }> {
  const user = await requireUser();
  const sent = await sendPush([user.id], { title: "SAKURAGI CRM", body: "Notifications are working on this device.", url: "/", tag: "test" });
  return { sent };
}
