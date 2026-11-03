import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isBackOffice, requireUser, type SessionUser } from "@/lib/rbac";

// Service & Complaints: the Head, the Sales Coordinator and the Service
// Manager (Sikiru) - not the sales people.
export const SERVICE_MANAGER = "Service Manager";

export async function canUseService(user: SessionUser): Promise<boolean> {
  if (isBackOffice(user)) return true;
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { title: true, isActive: true } });
  return !!u?.isActive && u.title === SERVICE_MANAGER;
}

export async function requireService(): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await canUseService(user))) redirect("/");
  return user;
}

// The Service Manager (Sikiru): a service-only view - his own dashboard and
// notifications, quotations, Service & Complaints; no leads, deals or
// incentives (his billing is entered by the Head / Coordinator).
export async function isServiceManager(user: SessionUser): Promise<boolean> {
  if (user.role !== "SALES_MANAGER") return false;
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { title: true } });
  return u?.title === SERVICE_MANAGER;
}
export async function blockServiceManager(): Promise<void> {
  const user = await requireUser();
  if (await isServiceManager(user)) redirect("/");
}
