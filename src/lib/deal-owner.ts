import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

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

// The id, if it is an active sales person's (who can own deals).
export async function salesPersonId(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
  return u?.isActive && u.role === "SALES_MANAGER" ? id : null;
}

// A deal made from a quote while it was still under the Head (left on
// "None") moves - with its lead - to the sales person picked on the quote
// afterwards. A deal already under a sales person stays where it is.
export async function moveBackOfficeDeal(dealId: string, to: string | null, userId: string, ref: string): Promise<boolean> {
  if (!to || !(await salesPersonId(to))) return false;
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true, owner: { select: { role: true } } } });
  if (!deal || deal.ownerId === to || deal.owner.role !== "HEAD") return false;
  await prisma.deal.update({ where: { id: dealId }, data: { ownerId: to } });
  await prisma.lead.updateMany({ where: { convertedDealId: dealId, ownerId: deal.ownerId }, data: { ownerId: to } });
  await audit("deal", dealId, userId, "edited", `Moved to the sales person picked on quotation ${ref}, with its lead.`);
  return true;
}
