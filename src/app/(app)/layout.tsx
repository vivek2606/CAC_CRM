import { requireUser } from "@/lib/rbac";
import { canUseService } from "@/lib/service-access";
import { AppShell } from "./app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return <AppShell user={{ ...user, service: await canUseService(user) }}>{children}</AppShell>;
}
