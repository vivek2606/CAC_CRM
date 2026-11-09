"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { fromLagosInput } from "@/lib/service";

// Visit planner: a planned visit is a Site visit activity due on the day;
// checking in completes it, with a note and (if the phone allows) where.

type Result = { error?: string };
const done = () => {
  revalidatePath("/my-day");
  revalidatePath("/my-day/plan");
};

export async function planVisit(input: { date: string; time: string; target: string; purpose: string }): Promise<Result> {
  const user = await requireUser();
  const at = fromLagosInput(`${input.date}T${/^\d{2}:\d{2}$/.test(input.time) ? input.time : "10:00"}`);
  if (!at) return { error: "Pick the day of the visit." };
  const [kind, id] = input.target.split(":");
  if (!id || (kind !== "account" && kind !== "deal")) return { error: "Pick the customer or deal to visit." };
  let accountId: string | null = null;
  let dealId: string | null = null;
  let label = "";
  if (kind === "deal") {
    const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true, accountId: true } });
    if (!deal || !canAccessOwner(user, deal.ownerId)) return { error: "Deal not found." };
    dealId = deal.id;
    accountId = deal.accountId;
    label = deal.title;
  } else {
    const acc = await prisma.account.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!acc) return { error: "Customer not found." };
    accountId = acc.id;
    label = acc.name;
  }
  const purpose = input.purpose.trim().slice(0, 150);
  await prisma.activity.create({
    data: { type: "SITE_VISIT", subject: `Visit: ${label}${purpose ? ` - ${purpose}` : ""}`.slice(0, 200), dueAt: at, status: "PENDING", ownerId: user.id, accountId, dealId },
  });
  done();
  return {};
}

async function ownVisit(id: string) {
  const user = await requireUser();
  const a = await prisma.activity.findUnique({ where: { id }, select: { id: true, ownerId: true, type: true, description: true, accountId: true, dealId: true } });
  if (!a || a.type !== "SITE_VISIT" || !canAccessOwner(user, a.ownerId)) return null;
  return a;
}

// Checked in: done now, with what happened and - when shared - where.
export async function checkInVisit(id: string, input: { note: string; lat?: number | null; lng?: number | null; accuracy?: number | null }): Promise<Result> {
  const a = await ownVisit(id);
  if (!a) return { error: "Visit not found." };
  const where =
    typeof input.lat === "number" && typeof input.lng === "number"
      ? `Checked in at ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}${input.accuracy ? ` (±${Math.round(input.accuracy)} m)` : ""} - https://maps.google.com/?q=${input.lat},${input.lng}`
      : "Checked in (location not shared)";
  const note = input.note.trim().slice(0, 1000);
  await prisma.activity.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date(), description: [a.description, note, where].filter(Boolean).join("\n") },
  });
  if (a.dealId) revalidatePath(`/deals/${a.dealId}`);
  if (a.accountId) revalidatePath(`/accounts/${a.accountId}`);
  done();
  return {};
}

export async function cancelVisit(id: string): Promise<Result> {
  const a = await ownVisit(id);
  if (!a) return { error: "Visit not found." };
  await prisma.activity.update({ where: { id }, data: { status: "CANCELLED" } });
  done();
  return {};
}
