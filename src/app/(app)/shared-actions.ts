"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import type { ActivityType } from "@prisma/client";

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

export async function addActivity(
  params: { leadId?: string; dealId?: string; contactId?: string; ownerId?: string },
  formData: FormData
) {
  const user = await requireUser();
  const type = formData.get("type");
  const subject = String(formData.get("subject") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueAtRaw = formData.get("dueAt");
  if (!subject || typeof type !== "string") return;

  await prisma.activity.create({
    data: {
      type: type as "CALL" | "EMAIL" | "MEETING" | "TASK" | "NOTE",
      subject,
      description: description || null,
      dueAt: dueAtRaw ? new Date(String(dueAtRaw)) : null,
      status: "PENDING",
      ownerId: params.ownerId ?? user.id,
      leadId: params.leadId ?? null,
      dealId: params.dealId ?? null,
      contactId: params.contactId ?? null,
    },
  });

  if (params.leadId) revalidatePath(`/leads/${params.leadId}`);
  if (params.dealId) revalidatePath(`/deals/${params.dealId}`);
  if (params.contactId) revalidatePath(`/contacts/${params.contactId}`);
  revalidatePath("/activities");
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
  revalidatePath("/");
}

export async function updateActivity(
  activityId: string,
  path: string,
  data: { type: ActivityType; subject: string; description: string; dueAt: string }
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
    },
  });
  revalidatePath(path);
  revalidatePath("/activities");
  revalidatePath("/");
}

export async function deleteActivity(activityId: string, path: string) {
  const user = await requireUser();
  const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } });
  if (!canAccessOwner(user, activity.ownerId)) throw new Error("You do not have access to this activity.");

  await prisma.activity.delete({ where: { id: activityId } });
  revalidatePath(path);
  revalidatePath("/activities");
  revalidatePath("/");
}
