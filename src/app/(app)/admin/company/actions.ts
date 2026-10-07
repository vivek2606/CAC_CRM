"use server";

import { revalidatePath } from "next/cache";
import { requireHead } from "@/lib/rbac";
import { companySettingsSchema, saveCompanySettings } from "@/lib/company-profile";

export type CompanySettingsState = { error?: string; saved?: boolean };

export async function saveCompanySettingsAction(_prev: CompanySettingsState | undefined, formData: FormData): Promise<CompanySettingsState> {
  await requireHead();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("settings") ?? ""));
  } catch {
    return { error: "Couldn't read the form." };
  }
  const parsed = companySettingsSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const s = parsed.data;
  if (!s.companies.some((c) => c.key === s.defaultCompany)) s.defaultCompany = s.companies[0].key;
  await saveCompanySettings(s);
  revalidatePath("/admin/company");
  return { saved: true };
}
