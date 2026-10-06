"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
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

const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#0ea5e9"];
const ROLES = ["SALES_MANAGER", "COORDINATOR"] as const;

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  title: z.string().trim().max(80),
  role: z.enum(ROLES),
});

export type CreateUserState = { error?: string; created?: { name: string; email: string; tempPassword: string } };

export async function createUser(
  _prevState: CreateUserState | undefined,
  formData: FormData
): Promise<CreateUserState> {
  const head = await requireHead();
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    title: formData.get("title") ?? "",
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { name, email, title, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { isActive: true } });
  if (existing?.isActive) return { error: `${email} already has a login - use Reset password instead.` };

  const tempPassword = randomPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const data = {
    name,
    passwordHash,
    role,
    title: title || (role === "COORDINATOR" ? "Sales Coordinator" : "Sales Manager"),
    isActive: true,
    managerId: head.id,
  };
  try {
    if (existing) {
      // A former login with this email - bring it back rather than fail.
      await prisma.user.update({ where: { email }, data });
    } else {
      const count = await prisma.user.count();
      await prisma.user.create({ data: { ...data, email, avatarColor: AVATAR_COLORS[count % AVATAR_COLORS.length] } });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (role === "COORDINATOR" && /COORDINATOR|enum/i.test(msg)) {
      return { error: `The database doesn't know the Sales Coordinator role yet - run: ALTER TYPE "Role" ADD VALUE 'COORDINATOR';` };
    }
    throw e;
  }

  revalidatePath("/admin/team");
  return { created: { name, email, tempPassword } };
}

// Switch an existing login between Sales Manager and Sales Coordinator.
export async function setUserRole(userId: string, role: string) {
  const head = await requireHead();
  const parsed = z.enum(ROLES).safeParse(role);
  if (!parsed.success) throw new Error("Unknown role.");
  if (userId === head.id) throw new Error("You can't change your own role.");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target || target.role === "HEAD") throw new Error("Not allowed.");
  await prisma.user.update({ where: { id: userId }, data: { role: parsed.data } });
  revalidatePath("/admin/team");
}
