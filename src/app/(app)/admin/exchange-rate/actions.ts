"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";

export type RateState = { error?: string; success?: boolean };

function parseMonthInput(raw: string): Date | null {
  const m = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

const rateSchema = z.object({
  month: z.string().min(1),
  rate: z.coerce.number().positive("Exchange rate must be a positive number"),
});

// The Naira-to-USD rate for one month, used only to convert that month's
// Naira sales into USD for growth reporting - it has nothing to do with
// product pricing or stock costing (those are Naira-only everywhere else
// in the app now).
export async function setExchangeRate(_prevState: RateState | undefined, formData: FormData): Promise<RateState> {
  await requireHead();

  const parsed = rateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const month = parseMonthInput(parsed.data.month);
  if (!month) return { error: "Please choose a valid month." };

  await prisma.monthlyExchangeRate.upsert({
    where: { month },
    create: { month, rate: parsed.data.rate },
    update: { rate: parsed.data.rate },
  });

  revalidatePath("/admin/exchange-rate");
  return { success: true };
}
