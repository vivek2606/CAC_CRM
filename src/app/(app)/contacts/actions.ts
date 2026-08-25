"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";

const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  accountId: z.string().optional(),
  ownerId: z.string().min(1),
});

function toNullable(value: string | undefined) {
  return value && value.trim() !== "" ? value : null;
}

export async function createContact(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const parsed = contactSchema.parse(raw);
  const ownerId = user.role === "HEAD" ? parsed.ownerId : user.id;

  const contact = await prisma.contact.create({
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: toNullable(parsed.email),
      phone: toNullable(parsed.phone),
      jobTitle: toNullable(parsed.jobTitle),
      accountId: toNullable(parsed.accountId),
      ownerId,
    },
  });

  revalidatePath("/contacts");
  redirect(`/contacts/${contact.id}`);
}

export async function updateContact(contactId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this contact.");

  const raw = Object.fromEntries(formData.entries());
  const parsed = contactSchema.parse(raw);
  const ownerId = user.role === "HEAD" ? parsed.ownerId : existing.ownerId;

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: toNullable(parsed.email),
      phone: toNullable(parsed.phone),
      jobTitle: toNullable(parsed.jobTitle),
      accountId: toNullable(parsed.accountId),
      ownerId,
    },
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}`);
}

export async function deleteContact(contactId: string) {
  const user = await requireUser();
  const existing = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this contact.");

  await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath("/contacts");
  redirect("/contacts");
}
