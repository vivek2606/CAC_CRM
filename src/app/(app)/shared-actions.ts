"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import type { ActivityType, CallOutcome } from "@prisma/client";

function toCallOutcome(type: string, value: FormDataEntryValue | null): CallOutcome | null {
  if (type !== "CALL" || typeof value !== "string" || value.trim() === "") return null;
  return value as CallOutcome;
}

export async function addNote(params: { leadId?: string; dealId?: string; contactId?: string }, formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await prisma.note.create({
    data: {
      body,
      authorId: user.id,
      leadId: params.leadId ?? null,
      dealId: params.dealId ?? null,
      contactId: params.contactId ?? null,
    },
  });

  if (params.leadId) revalidatePath(`/leads/${params.leadId}`);
  if (params.dealId) revalidatePath(`/deals/${params.dealId}`);
  if (params.contactId) revalidatePath(`/contacts/${params.contactId}`);
}

function fromForm(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function addActivity(
  params: { leadId?: string; dealId?: string; contactId?: string; accountId?: string; ownerId?: string },
  formData: FormData
) {
  const user = await requireUser();
  const type = formData.get("type");
  const subject = String(formData.get("subject") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueAtRaw = formData.get("dueAt");
  if (!subject || typeof type !== "string") return;

  // Record-detail contexts (Record Timeline) always fix owner/contact via
  // params, since the activity plainly belongs to that record's own owner.
  // The standalone Activities tab leaves these unset instead, so a Head can
  // log a call/meeting attributed to whichever sales manager it's actually
  // for (and tag the account/contact it's about), while a rep just gets
  // their own id back.
  const ownerId = params.ownerId ?? fromForm(formData.get("ownerId")) ?? user.id;
  if (!canAccessOwner(user, ownerId)) {
    throw new Error("You do not have access to log activities for this sales person.");
  }
  const leadId = params.leadId ?? fromForm(formData.get("leadId"));
  const dealId = params.dealId ?? fromForm(formData.get("dealId"));
  const contactId = params.contactId ?? fromForm(formData.get("contactId"));
  const accountId = params.accountId ?? fromForm(formData.get("accountId"));

  await prisma.activity.create({
    data: {
      type: type as "CALL" | "EMAIL" | "MEETING" | "TASK" | "NOTE",
      subject,
      description: description || null,
      dueAt: dueAtRaw ? new Date(String(dueAtRaw)) : null,
      status: "PENDING",
      callOutcome: toCallOutcome(type, formData.get("callOutcome")),
      ownerId,
      leadId,
      dealId,
      contactId,
      accountId,
    },
  });

  if (leadId) revalidatePath(`/leads/${leadId}`);
  if (dealId) revalidatePath(`/deals/${dealId}`);
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  if (accountId) revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/activities");
  revalidatePath("/leads");
}

export async function toggleActivityStatus(activityId: string, path: string) {
  const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } });
  await prisma.activity.update({
    where: { id: activityId },
    data:
      activity.status === "COMPLETED"
        ? { status: "PENDING", completedAt: null }
        : { status: "COMPLETED", completedAt: new Date() },
  });
  revalidatePath(path);
  revalidatePath("/activities");
  revalidatePath("/leads");
  revalidatePath("/");
}

export async function updateActivity(
  activityId: string,
  path: string,
  data: { type: ActivityType; subject: string; description: string; dueAt: string; callOutcome?: CallOutcome | null }
) {
  const user = await requireUser();
  const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } });
  if (!canAccessOwner(user, activity.ownerId)) throw new Error("You do not have access to this activity.");
  if (!data.subject.trim()) return;

  await prisma.activity.update({
    where: { id: activityId },
    data: {
      type: data.type,
      subject: data.subject.trim(),
      description: data.description.trim() || null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      callOutcome: data.type === "CALL" ? (data.callOutcome ?? null) : null,
    },
  });
  revalidatePath(path);
  revalidatePath("/activities");
  revalidatePath("/leads");
  revalidatePath("/");
}

export async function deleteActivity(activityId: string, path: string) {
  const user = await requireUser();
  const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } });
  if (!canAccessOwner(user, activity.ownerId)) throw new Error("You do not have access to this activity.");

  await prisma.activity.delete({ where: { id: activityId } });
  revalidatePath(path);
  revalidatePath("/activities");
  revalidatePath("/leads");
  revalidatePath("/");
}

// While a lead / account / deal is being entered: is this customer already
// in the CRM (same phone, or same company / customer name)? Says whose it
// is; links only what the user can open.
export async function checkExistingCustomer(input: { phone?: string; name?: string; exclude?: { kind: "account" | "contact" | "lead" | "deal"; id: string } }) {
  const user = await requireUser();
  const { findExisting } = await import("@/lib/existing-customer");
  const matches = await findExisting({ phone: String(input.phone ?? "").slice(0, 40), name: String(input.name ?? "").slice(0, 200), exclude: input.exclude });
  return matches.map((m) => ({ kind: m.kind, label: m.label, owner: m.owner, mine: m.ownerId === user.id, why: m.why, href: canAccessOwner(user, m.ownerId) ? m.href : null }));
}
