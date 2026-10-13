import { prisma } from "@/lib/prisma";

export type AccountInput = { accountId: string } | { name: string; code: string; city?: string };

// An existing account picked from the list, or a new one created from a
// name and customer code (refused when either is already taken).
export async function resolveAccountInput(input: AccountInput, ownerId: string): Promise<{ id: string; name: string } | { error: string }> {
  if ("accountId" in input) {
    const acc = await prisma.account.findUnique({ where: { id: input.accountId }, select: { id: true, name: true } });
    return acc ?? { error: "Pick an account from the list." };
  }
  const name = input.name.trim().replace(/\s+/g, " ");
  const code = input.code.trim();
  if (!name) return { error: "Enter the account name." };
  if (!code) return { error: "Enter the customer code (the account code in the ERP)." };
  const clash = await prisma.account.findFirst({ where: { code: { equals: code, mode: "insensitive" } }, select: { name: true } });
  if (clash) return { error: `Customer code ${code} is already used by "${clash.name}" - pick that account from the list instead.` };
  const sameName = await prisma.account.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { name: true } });
  if (sameName) return { error: `An account named "${sameName.name}" already exists - pick it from the list instead.` };
  return prisma.account.create({ data: { name, code, city: input.city?.trim() || null, ownerId }, select: { id: true, name: true } });
}
