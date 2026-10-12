"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { restoreRecord } from "@/lib/recycle-bin";

export async function restoreDeleted(id: string): Promise<{ href?: string; error?: string }> {
  const user = await requireBackOffice();
  const res = await restoreRecord(id, user.id);
  revalidatePath("/admin/recycle-bin");
  revalidatePath("/deals");
  revalidatePath("/leads");
  revalidatePath("/reports/sales-register");
  revalidatePath("/");
  return res;
}

export async function deleteForever(id: string): Promise<void> {
  await requireBackOffice();
  await prisma.deletedRecord.deleteMany({ where: { id } });
  revalidatePath("/admin/recycle-bin");
}
