"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner, isBackOffice } from "@/lib/rbac";
import { parseTagsInput } from "@/lib/tags";
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

export type AccountFormResult = { error: string } | void;

// Account.code is unique (it's the identity key the Sales Register import
// dedupes customers on) - a duplicate comes back to the form as a message
// naming the account that has it, instead of an error page.
async function codeTakenMessage(code: string, exceptId?: string): Promise<string | null> {
  const clash = await prisma.account.findFirst({
    where: { code: { equals: code.trim(), mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true, owner: { select: { name: true } } },
  });
  return clash ? `Customer code ${code.trim()} is already used by "${clash.name}" (${clash.owner.name}). Check the code, or open that account instead.` : null;
}

function friendlyError(e: unknown): { error: string } {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { error: "That customer code is already used by another account." };
  }
  throw e;
}

// Optional contact, picked via a mode toggle on the form - "existing" links
// an already-created contact to this account, "new" creates one inline so a
// rep never has to leave the account form just to get a contact on file.
// Shared between create and edit, since both forms offer the same toggle.
async function linkOrCreateContact(formData: FormData, accountId: string, ownerId: string) {
  const contactMode = String(formData.get("contactMode") ?? "none");
  if (contactMode === "existing") {
    const contactId = String(formData.get("contactId") ?? "").trim();
    if (contactId) {
      await prisma.contact.update({ where: { id: contactId }, data: { accountId } });
    }
  } else if (contactMode === "new") {
    const firstName = String(formData.get("contactFirstName") ?? "").trim();
    const lastName = String(formData.get("contactLastName") ?? "").trim();
    if (firstName && lastName) {
      await prisma.contact.create({
        data: {
          firstName,
          lastName,
          jobTitle: toNullable(String(formData.get("contactJobTitle") ?? "")),
          email: toNullable(String(formData.get("contactEmail") ?? "")),
          phone: toNullable(String(formData.get("contactPhone") ?? "")),
          accountId,
          ownerId,
        },
      });
    }
  }
}

export async function createAccount(formData: FormData): Promise<AccountFormResult> {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const result = accountSchema.safeParse(raw);
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Check the form." };
  const parsed = { ...result.data, name: result.data.name.trim(), code: result.data.code.trim() };
  const ownerId = isBackOffice(user) ? parsed.ownerId : user.id;
  const taken = await codeTakenMessage(parsed.code);
  if (taken) return { error: taken };

  let account;
  try {
    account = await prisma.account.create({
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
        tags: parseTagsInput(formData.get("tags")),
        ownerId,
      },
    });
  } catch (e) {
    return friendlyError(e);
  }

  await linkOrCreateContact(formData, account.id, ownerId);

  revalidatePath("/accounts");
  revalidatePath("/contacts");
  redirect(`/accounts/${account.id}`);
}

export async function updateAccount(accountId: string, formData: FormData): Promise<AccountFormResult> {
  const user = await requireUser();
  const existing = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  if (!canAccessOwner(user, existing.ownerId)) return { error: "You do not have access to this account." };

  const raw = Object.fromEntries(formData.entries());
  const result = accountSchema.safeParse(raw);
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Check the form." };
  const parsed = { ...result.data, name: result.data.name.trim(), code: result.data.code.trim() };
  const ownerId = isBackOffice(user) ? parsed.ownerId : existing.ownerId;
  const taken = await codeTakenMessage(parsed.code, accountId);
  if (taken) return { error: taken };

  try {
    await prisma.account.update({
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
        tags: parseTagsInput(formData.get("tags")),
        ownerId,
      },
    });
  } catch (e) {
    return friendlyError(e);
  }

  await linkOrCreateContact(formData, accountId, ownerId);

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/contacts");
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
