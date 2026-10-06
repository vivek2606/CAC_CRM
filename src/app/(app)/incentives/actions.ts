"use server";

import { revalidatePath } from "next/cache";
import { requireHead } from "@/lib/rbac";
import { incentiveSettingsSchema, saveIncentiveSettings, type IncentiveSettings } from "@/lib/incentive";

export type SaveSettingsState = { error?: string; ok?: boolean };

export async function saveIncentiveSettingsAction(settings: IncentiveSettings): Promise<SaveSettingsState> {
  await requireHead();
  const parsed = incentiveSettingsSchema.safeParse(settings);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the settings." };
  if (parsed.data.supportStaff.filter((s) => s.coordinator).length > 1) {
    return { error: "Only one support staff member can be the coordinator." };
  }
  const thresholds = parsed.data.tiers.map((t) => t.minAchievementPct);
  if (new Set(thresholds).size !== thresholds.length) return { error: "Two rate tiers have the same achievement threshold." };
  try {
    await saveIncentiveSettings(parsed.data);
  } catch {
    return { error: "Couldn't save - the settings table may not be set up yet (run the SQL shared for this feature)." };
  }
  revalidatePath("/incentives");
  revalidatePath("/incentives/settings");
  return { ok: true };
}
