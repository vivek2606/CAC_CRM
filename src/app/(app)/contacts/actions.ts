"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner, isBackOffice } from "@/lib/rbac";
import { fromDayMonth } from "@/lib/key-dates-shared";

const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  accountId: z.string().optional(),
  ownerId: z.string().min(1),
  birthdayDay: z.string().optional(),
  birthdayMonth: z.string().optional(),
  specialDay: z.string().optional(),
  specialMonth: z.string().optional(),
  specialDateLabel: z.string().optional(),
});

// Birthday and one other date (day and month only).
function keyDates(p: z.infer<typeof contactSchema>) {
  const specialDate = fromDayMonth(p.specialDay, p.specialMonth);
  return {
    birthday: fromDayMonth(p.birthdayDay, p.birthdayMonth),
    specialDate,
    specialDateLabel: specialDate ? toNullable(p.specialDateLabel?.trim()) ?? "Anniversary" : null,
  };
}

function toNullable(value: string | undefined) {
  return value && value.trim() !== "" ? value : null;
}

export async function createContact(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const parsed = contactSchema.parse(raw);
  const ownerId = isBackOffice(user) ? parsed.ownerId : user.id;

  const contact = await prisma.contact.create({
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: toNullable(parsed.email),
      phone: toNullable(parsed.phone),
      whatsappNumber: toNullable(parsed.whatsappNumber),
      jobTitle: toNullable(parsed.jobTitle),
      department: toNullable(parsed.department),
      accountId: toNullable(parsed.accountId),
      ownerId,
      ...keyDates(parsed),
    },
  });

  revalidatePath("/accounts");
  redirect(`/contacts/${contact.id}`);
}

export async function updateContact(contactId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this contact.");

  const raw = Object.fromEntries(formData.entries());
  const parsed = contactSchema.parse(raw);
  const ownerId = isBackOffice(user) ? parsed.ownerId : existing.ownerId;

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: toNullable(parsed.email),
      phone: toNullable(parsed.phone),
      whatsappNumber: toNullable(parsed.whatsappNumber),
      jobTitle: toNullable(parsed.jobTitle),
      department: toNullable(parsed.department),
      accountId: toNullable(parsed.accountId),
      ownerId,
      ...keyDates(parsed),
    },
  });

  revalidatePath("/accounts");
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}`);
}

export async function deleteContact(contactId: string) {
  const user = await requireUser();
  const existing = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this contact.");

  await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath("/accounts");
  redirect("/accounts?tab=contacts");
}
