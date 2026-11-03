import { prisma } from "@/lib/prisma";

// A deal is always under a sales person (or the Head) - never the Sales
// Coordinator, who prepares things for the sales people.
export async function dealOwnerProblem(ownerId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: ownerId }, select: { role: true, isActive: true } });
  if (!u || !u.isActive) return "Pick the sales person for this deal.";
  if (u.role === "COORDINATOR") return "A deal can't be under the Sales Coordinator - pick the sales person.";
  return null;
}

// Who a deal can be assigned to: the sales people (active).
export async function dealOwnerOptions(): Promise<{ id: string; name: string }[]> {
  return prisma.user.findMany({ where: { isActive: true, role: "SALES_MANAGER" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

// A lead or deal the Head / Sales Coordinator enter without picking the
// sales person goes under the Head of Sales (the Coordinator can't own one).
export async function backOfficeDefaultOwner(user: { id: string; role: string }): Promise<string> {
  if (user.role === "HEAD") return user.id;
  const head = await prisma.user.findFirst({ where: { role: "HEAD", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!head) throw new Error("Pick the sales person.");
  return head.id;
}
