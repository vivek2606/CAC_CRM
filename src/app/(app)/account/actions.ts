"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";

export type ChangePasswordState = { error?: string; success?: boolean };

export async function changePassword(
  _prevState: ChangePasswordState | undefined,
  formData: FormData
): Promise<ChangePasswordState> {
  const sessionUser = await requireUser();

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Fill in all three fields." };
  }
  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New password and confirmation don't match." };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    return { error: "Current password is incorrect." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { success: true };
}
