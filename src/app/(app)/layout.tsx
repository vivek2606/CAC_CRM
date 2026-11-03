import { requireUser } from "@/lib/rbac";
import { canUseService } from "@/lib/service-access";
import { prisma } from "@/lib/prisma";
import { AppShell } from "./app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { title: true } });
  return <AppShell user={{ ...user, service: await canUseService(user), title: me?.title ?? null }}>{children}</AppShell>;
}
