import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

// Every deal starts from a lead. A deal created directly (the New Deal form)
// or from a quotation gets its lead made automatically: dated 2 days before
// the deal, already converted to it, with the deal's customer and details.
const AUTO_LEAD_DAYS_BEFORE = 2;

export async function createLeadForDeal(dealId: string, userId: string, how: string): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      title: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      value: true,
      createdAt: true,
      ownerId: true,
      accountId: true,
      contactId: true,
      equipmentType: true,
      endUseSegment: true,
      competitorBrand: true,
      tags: true,
      sourceLead: { select: { id: true } },
      account: { select: { name: true } },
    },
  });
  if (!deal || deal.sourceLead) return;
  const lead = await prisma.lead.create({
    data: {
      title: deal.title,
      customerName: deal.customerName,
      company: deal.account?.name ?? null,
      phone: deal.customerPhone,
      email: deal.customerEmail,
      value: deal.value,
      status: "CONVERTED",
      source: "DIRECT",
      equipmentType: deal.equipmentType,
      endUseSegment: deal.endUseSegment,
      competitorBrand: deal.competitorBrand,
      tags: deal.tags,
      ownerId: deal.ownerId,
      accountId: deal.accountId,
      contactId: deal.contactId,
      createdAt: new Date(deal.createdAt.getTime() - AUTO_LEAD_DAYS_BEFORE * 86400000),
      convertedDealId: deal.id,
    },
  });
  await audit("lead", lead.id, userId, "created", `Made automatically for the deal (${how}), dated ${AUTO_LEAD_DAYS_BEFORE} days before it.`);
}
