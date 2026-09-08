"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { Prisma, type AccountType } from "@prisma/client";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  // The identity key the Sales Register import and the ERP system both key
  // customers on - always required, not just at creation, so an account
  // can never drift out of sync with the ERP by having it blanked out later.
  code: z.string().min(1, "Customer code is required"),
  industry: z.string().optional(),
  accountType: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  registrationNumber: z.string().optional(),
  ownerId: z.string().min(1),
});

function toNullable(value: string | undefined) {
  return value && value.trim() !== "" ? value : null;
}

function toAccountType(value: string | undefined): AccountType | null {
  return value && value.trim() !== "" ? (value as AccountType) : null;
}

// Account.code is unique (it's the identity key the Sales Register import
// dedupes customers on) - a manually-typed duplicate should read as a
// normal validation error, not crash the request.
function rethrowFriendly(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new Error("That customer code is already used by another account.");
  }
  throw e;
}

export async function createAccount(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const parsed = accountSchema.parse(raw);
  const ownerId = user.role === "HEAD" ? parsed.ownerId : user.id;

  const account = await prisma.account
    .create({
      data: {
        name: parsed.name,
        code: toNullable(parsed.code),
        industry: toNullable(parsed.industry),
        accountType: toAccountType(parsed.accountType),
        website: toNullable(parsed.website),
        phone: toNullable(parsed.phone),
        address: toNullable(parsed.address),
        city: toNullable(parsed.city),
        state: toNullable(parsed.state),
        country: toNullable(parsed.country),
        registrationNumber: toNullable(parsed.registrationNumber),
        ownerId,
      },
    })
    .catch(rethrowFriendly);

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

  await prisma.account
    .update({
      where: { id: accountId },
      data: {
        name: parsed.name,
        code: toNullable(parsed.code),
        industry: toNullable(parsed.industry),
        accountType: toAccountType(parsed.accountType),
        website: toNullable(parsed.website),
        phone: toNullable(parsed.phone),
        address: toNullable(parsed.address),
        city: toNullable(parsed.city),
        state: toNullable(parsed.state),
        country: toNullable(parsed.country),
        registrationNumber: toNullable(parsed.registrationNumber),
        ownerId,
      },
    })
    .catch(rethrowFriendly);

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  redirect(`/accounts/${accountId}`);
}

export async function deleteAccount(accountId: string) {
  const user = await requireUser();
  const existing = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  if (!canAccessOwner(user, existing.ownerId)) throw new Error("You do not have access to this account.");

  const wonDealCount = await prisma.deal.count({ where: { accountId, stage: "WON" } });
  if (wonDealCount > 0) {
    throw new Error("This account has a completed order and can't be deleted.");
  }

  await prisma.account.delete({ where: { id: accountId } });
  revalidatePath("/accounts");
  redirect("/accounts");
}
