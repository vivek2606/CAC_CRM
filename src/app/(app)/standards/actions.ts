"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac";
import { saveStandards, type Standards } from "@/lib/activity-standards";

// The Head sets the weekly minimums.
export async function saveActivityStandards(s: Standards): Promise<{ error?: string }> {
  const user = await requireUser();
  if (user.role !== "HEAD") return { error: "Only the Head of Sales sets the weekly minimums." };
  const n = (x: number) => Math.min(500, Math.max(0, Math.round(Number(x) || 0)));
  await saveStandards({ calls: n(s.calls), visits: n(s.visits), quotes: n(s.quotes), leads: n(s.leads) });
  revalidatePath("/standards");
  revalidatePath("/my-day");
  return {};
}
