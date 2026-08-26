"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireHead } from "@/lib/rbac";

function randomPassword(): string {
  return crypto.randomBytes(6).toString("base64url");
}

export type ResetPasswordState = { error?: string; tempPassword?: string };

export async function resetPassword(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ResetPasswordState | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ResetPasswordState> {
  await requireHead();

  const tempPassword = randomPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  revalidatePath("/admin/team");
  return { tempPassword };
}
