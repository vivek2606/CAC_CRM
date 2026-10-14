"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";
import { notifyQuoteDiscountDecided } from "@/lib/push-events";

// The Head approves (the discounts asked for become the approved ones - a
// download within them goes ahead) or rejects a quotation's discount.
export async function decideQuoteDiscount(quoteId: string, approve: boolean): Promise<{ error?: string }> {
  const head = await requireHead();
  const q = await prisma.quotation.findUnique({ where: { id: quoteId }, select: { discountStatus: true, discountRequest: true } });
  if (!q || q.discountStatus !== "pending") return { error: "This request has already been dealt with." };
  await prisma.quotation.update({
    where: { id: quoteId },
    data: {
      discountStatus: approve ? "approved" : "rejected",
      ...(approve ? { discountApproved: (q.discountRequest ?? []) as Prisma.InputJsonValue } : {}),
      discountDecidedAt: new Date(),
      discountDecidedById: head.id,
    },
  });
  await notifyQuoteDiscountDecided(quoteId, approve);
  revalidatePath("/quotations/approvals");
  revalidatePath("/quotations/saved");
  revalidatePath("/notifications");
  return {};
}
