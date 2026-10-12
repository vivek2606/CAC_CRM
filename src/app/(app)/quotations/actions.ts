"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { nextQuoteRef } from "@/lib/quote-ref";

// Issues the next unique quotation reference for the logged-in user.
export async function reserveQuoteRef(): Promise<string> {
  const user = await requireUser();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  return nextQuoteRef(me?.name ?? user.name ?? "");
}
