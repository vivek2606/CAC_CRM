"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";

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
  const dueAtRaw = formData.get("dueAt");
  if (!subject || typeof type !== "string") return;

  await prisma.activity.create({
    data: {
      type: type as "CALL" | "EMAIL" | "MEETING" | "TASK" | "NOTE",
      subject,
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
