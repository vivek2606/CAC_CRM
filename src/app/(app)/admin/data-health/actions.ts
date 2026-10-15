"use server";

import { revalidatePath } from "next/cache";
import { requireBackOffice } from "@/lib/rbac";
import { fixLateConversions } from "@/lib/conversion-date";

// Deals converted after they closed: conversion date -> 3 days before the
// invoice date (and the lead's date, if later still).
export async function fixConversionDates(): Promise<{ moved?: number; error?: string }> {
  await requireBackOffice();
  const moved = await fixLateConversions();
  revalidatePath("/admin/data-health");
  revalidatePath("/deals");
  revalidatePath("/reports", "layout");
  return { moved };
}
