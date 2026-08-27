"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";

export type SetTargetState = { error?: string; success?: boolean };

const setTargetSchema = z.object({
  userId: z.string().min(1),
  month: z.string().min(1),
  targetValue: z.coerce.number().min(0, "Target must be zero or more"),
});

export async function setTarget(_prevState: SetTargetState | undefined, formData: FormData): Promise<SetTargetState> {
  await requireHead();

  const parsed = setTargetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const m = parsed.data.month.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return { error: "Please choose a valid month." };
  const month = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));

  await prisma.target.upsert({
    where: { userId_month: { userId: parsed.data.userId, month } },
    create: { userId: parsed.data.userId, month, targetValue: parsed.data.targetValue },
    update: { targetValue: parsed.data.targetValue },
  });

  revalidatePath("/targets");
  return { success: true };
}
