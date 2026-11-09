import { prisma } from "@/lib/prisma";
import { isBackOffice, type SessionUser } from "@/lib/rbac";

// Whose review pack: a sales person their own; the Head / Coordinator the
// division (no rep) or anyone's. The month defaults to last month.
export async function reviewScope(user: SessionUser, params: { month?: string | null; rep?: string | null }) {
  const now = new Date();
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : last.toISOString().slice(0, 7);
  if (!isBackOffice(user)) return { month, repId: user.id };
  const rep = params.rep && (await prisma.user.findUnique({ where: { id: params.rep }, select: { id: true } })) ? params.rep : null;
  return { month, repId: rep };
}
