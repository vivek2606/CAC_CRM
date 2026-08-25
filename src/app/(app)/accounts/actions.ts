"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  industry: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  ownerId: z.string().min(1),
});

function toNullable(value: string | undefined) {
  return value && value.trim() !== "" ? value : null;
}

export async function createAccount(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const parsed = accountSchema.parse(raw);
  const ownerId = user.role === "HEAD" ? parsed.ownerId : user.id;

  const account = await prisma.account.create({
    data: {
      name: parsed.name,
      industry: toNullable(parsed.industry),
      website: toNullable(parsed.website),
      phone: toNullable(parsed.phone),
      address: toNullable(parsed.address),
      city: toNullable(parsed.city),
      country: toNullable(parsed.country),
      ownerId,
    },
  });

  revalidatePath("/accounts");
  redirect(`/accounts/${account.id}`);
}

export async function updateAccount(accountId: string, formData: FormData) {
  const user = await requireUser();
  const existing = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this account.");

  const raw = Object.fromEntries(formData.entries());
  const parsed = accountSchema.parse(raw);
  const ownerId = user.role === "HEAD" ? parsed.ownerId : existing.ownerId;

  await prisma.account.update({
    where: { id: accountId },
    data: {
      name: parsed.name,
      industry: toNullable(parsed.industry),
      website: toNullable(parsed.website),
      phone: toNullable(parsed.phone),
      address: toNullable(parsed.address),
      city: toNullable(parsed.city),
      country: toNullable(parsed.country),
      ownerId,
    },
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  redirect(`/accounts/${accountId}`);
}

export async function deleteAccount(accountId: string) {
  const user = await requireUser();
  const existing = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this account.");

  await prisma.account.delete({ where: { id: accountId } });
  revalidatePath("/accounts");
  redirect("/accounts");
}
