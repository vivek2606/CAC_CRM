import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

// Recycle bin: before a deal or lead is deleted (or the imported leads are
// cleared in one go, or a Project & Service Billing line is deleted), a snapshot of it - and of
// what is deleted with it (a deal's products, Sales Register lines and
// contact roles) - is kept for 30 days, so it can be restored. Activities,
// notes and quotations aren't deleted with the record (they're only
// unlinked), so a restore links them back.

export const KEEP_DAYS = 30;

type Row = Record<string, unknown>;
type DealSnapshot = {
  deal: Row;
  items: Row[];
  saleLines: Row[];
  contactRoles: Row[];
  activityIds: string[];
  noteIds: string[];
  quotationIds: string[];
  leadId: string | null;
};
type LeadSnapshot = { lead: Row; activityIds: string[]; noteIds: string[] };
type LeadBatchSnapshot = { leads: Row[]; contacts: Row[]; activities: { id: string; leadId: string }[]; notes: { id: string; leadId: string }[] };
type BillingSnapshot = { billing: Row };

// JSON turns dates into strings - turn the date fields back into dates.
const DATE_KEYS = /(At|Date|docDate|month)$/;
function revive<T extends Row>(row: T): T {
  const out: Row = { ...row };
  for (const [k, v] of Object.entries(out)) if (typeof v === "string" && DATE_KEYS.test(k) && !isNaN(Date.parse(v))) out[k] = new Date(v);
  return out as T;
}

export async function binDeal(dealId: string, deletedById: string): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      items: true,
      lineItems: true,
      contactRoles: true,
      activities: { select: { id: true } },
      notes: { select: { id: true } },
      quotations: { select: { id: true } },
      sourceLead: { select: { id: true } },
      owner: { select: { name: true } },
    },
  });
  if (!deal) return;
  const { items, lineItems, contactRoles, activities, notes, quotations, sourceLead, owner, ...row } = deal;
  const data: DealSnapshot = {
    deal: row,
    items,
    saleLines: lineItems,
    contactRoles,
    activityIds: activities.map((a) => a.id),
    noteIds: notes.map((n) => n.id),
    quotationIds: quotations.map((q) => q.id),
    leadId: sourceLead?.id ?? null,
  };
  await prisma.deletedRecord.create({
    data: {
      kind: "deal",
      recordId: deal.id,
      label: `${deal.title}${deal.stage === "WON" ? ` - won${deal.invoiceNo ? `, invoice ${deal.invoiceNo}` : ""}` : ""}`,
      ownerName: owner.name,
      value: deal.value,
      data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      deletedById,
    },
  });
}

export async function binLead(leadId: string, deletedById: string): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { activities: { select: { id: true } }, noteItems: { select: { id: true } }, owner: { select: { name: true } } },
  });
  if (!lead) return;
  const { activities, noteItems, owner, ...row } = lead;
  const data: LeadSnapshot = { lead: row, activityIds: activities.map((a) => a.id), noteIds: noteItems.map((n) => n.id) };
  await prisma.deletedRecord.create({
    data: {
      kind: "lead",
      recordId: lead.id,
      label: lead.title,
      ownerName: owner.name,
      value: lead.value ?? 0,
      data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      deletedById,
    },
  });
}

// The imported leads (and their contacts) about to be cleared together -
// kept as one entry, restored together.
export async function binLeadBatch(
  leadWhere: Prisma.LeadWhereInput,
  contactWhere: Prisma.ContactWhereInput,
  deletedById: string,
): Promise<void> {
  const [leads, contacts] = await Promise.all([prisma.lead.findMany({ where: leadWhere }), prisma.contact.findMany({ where: contactWhere })]);
  if (!leads.length && !contacts.length) return;
  const ids = leads.map((l) => l.id);
  const [activities, notes] = await Promise.all([
    prisma.activity.findMany({ where: { leadId: { in: ids } }, select: { id: true, leadId: true } }),
    prisma.note.findMany({ where: { leadId: { in: ids } }, select: { id: true, leadId: true } }),
  ]);
  const data: LeadBatchSnapshot = {
    leads,
    contacts,
    activities: activities.map((a) => ({ id: a.id, leadId: a.leadId! })),
    notes: notes.map((n) => ({ id: n.id, leadId: n.leadId! })),
  };
  await prisma.deletedRecord.create({
    data: {
      kind: "leadBatch",
      recordId: `leadBatch:${Date.now()}`,
      label: `Imported leads cleared - ${leads.length} lead${leads.length === 1 ? "" : "s"}, ${contacts.length} contact${contacts.length === 1 ? "" : "s"}`,
      value: leads.reduce((t, l) => t + (l.value ?? 0), 0),
      data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      deletedById,
    },
  });
}

export async function binProjectBilling(id: string, deletedById: string): Promise<void> {
  const row = await prisma.projectBilling.findUnique({ where: { id }, include: { owner: { select: { name: true } } } });
  if (!row) return;
  const { owner, ...billing } = row;
  const data: BillingSnapshot = { billing };
  await prisma.deletedRecord.create({
    data: {
      kind: "billing",
      recordId: row.id,
      label: `${row.custName} - ${row.itemName} (no. ${row.txnNo})`,
      ownerName: owner.name,
      value: row.value,
      data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
      deletedById,
    },
  });
}

// Puts a deleted deal or lead back. Returns where to find it, or an error
// (e.g. its sales person or account was deleted since).
export async function restoreRecord(id: string, restoredById: string): Promise<{ href?: string; error?: string }> {
  const rec = await prisma.deletedRecord.findUnique({ where: { id } });
  if (!rec) return { error: "Not in the recycle bin any more." };
  try {
    if (rec.kind === "deal") {
      const s = rec.data as unknown as DealSnapshot;
      if (await prisma.deal.findUnique({ where: { id: rec.recordId }, select: { id: true } })) return { error: "This deal already exists." };
      // Its order's first deal may have been deleted since - then it comes back on its own.
      const dealRow = revive(s.deal) as Prisma.DealUncheckedCreateInput;
      if (dealRow.orderDealId && !(await prisma.deal.findUnique({ where: { id: dealRow.orderDealId }, select: { id: true } }))) dealRow.orderDealId = null;
      await prisma.$transaction(async (tx) => {
        await tx.deal.create({ data: dealRow });
        if (s.items.length) await tx.dealLineItem.createMany({ data: s.items.map((r) => revive(r) as Prisma.DealLineItemCreateManyInput) });
        if (s.saleLines.length) await tx.saleLineItem.createMany({ data: s.saleLines.map((r) => revive(r) as Prisma.SaleLineItemCreateManyInput), skipDuplicates: true });
        if (s.contactRoles.length) await tx.dealContactRole.createMany({ data: s.contactRoles.map((r) => revive(r) as Prisma.DealContactRoleCreateManyInput) });
        if (s.activityIds.length) await tx.activity.updateMany({ where: { id: { in: s.activityIds }, dealId: null }, data: { dealId: rec.recordId } });
        if (s.noteIds.length) await tx.note.updateMany({ where: { id: { in: s.noteIds }, dealId: null }, data: { dealId: rec.recordId } });
        if (s.quotationIds.length) await tx.quotation.updateMany({ where: { id: { in: s.quotationIds }, dealId: null }, data: { dealId: rec.recordId } });
        if (s.leadId) await tx.lead.updateMany({ where: { id: s.leadId, convertedDealId: null }, data: { convertedDealId: rec.recordId, status: "CONVERTED" } });
        await tx.note.create({ data: { body: "✎ Restored from the recycle bin.", authorId: restoredById, dealId: rec.recordId } });
        await tx.deletedRecord.delete({ where: { id: rec.id } });
      });
      await audit("deal", rec.recordId, restoredById, "restored", "Restored from the recycle bin.");
      return { href: `/deals/${rec.recordId}` };
    }
    if (rec.kind === "leadBatch") {
      const s = rec.data as unknown as LeadBatchSnapshot;
      // Anything already back (e.g. a fresh import brought the same rows in
      // again) is skipped rather than duplicated.
      await prisma.$transaction(async (tx) => {
        if (s.contacts.length) await tx.contact.createMany({ data: s.contacts.map((r) => revive(r) as Prisma.ContactCreateManyInput), skipDuplicates: true });
        if (s.leads.length) await tx.lead.createMany({ data: s.leads.map((r) => revive(r) as Prisma.LeadCreateManyInput), skipDuplicates: true });
        for (const a of s.activities) await tx.activity.updateMany({ where: { id: a.id, leadId: null }, data: { leadId: a.leadId } });
        for (const n of s.notes) await tx.note.updateMany({ where: { id: n.id, leadId: null }, data: { leadId: n.leadId } });
        await tx.deletedRecord.delete({ where: { id: rec.id } });
      }, { timeout: 60000 });
      return { href: "/leads" };
    }
    if (rec.kind === "billing") {
      const s = rec.data as unknown as BillingSnapshot;
      const row = revive(s.billing) as Prisma.ProjectBillingUncheckedCreateInput;
      if (await prisma.projectBilling.findUnique({ where: { sourceKey: row.sourceKey }, select: { id: true } })) return { error: "This billing line already exists." };
      await prisma.$transaction([prisma.projectBilling.create({ data: row }), prisma.deletedRecord.delete({ where: { id: rec.id } })]);
      return { href: "/project-billing" };
    }
    const s = rec.data as unknown as LeadSnapshot;
    if (await prisma.lead.findUnique({ where: { id: rec.recordId }, select: { id: true } })) return { error: "This lead already exists." };
    // Its deal may have been deleted since - then it comes back unlinked.
    const lead = revive(s.lead) as Prisma.LeadUncheckedCreateInput;
    if (lead.convertedDealId && !(await prisma.deal.findUnique({ where: { id: lead.convertedDealId }, select: { id: true } }))) lead.convertedDealId = null;
    await prisma.$transaction(async (tx) => {
      await tx.lead.create({ data: lead });
      if (s.activityIds.length) await tx.activity.updateMany({ where: { id: { in: s.activityIds }, leadId: null }, data: { leadId: rec.recordId } });
      if (s.noteIds.length) await tx.note.updateMany({ where: { id: { in: s.noteIds }, leadId: null }, data: { leadId: rec.recordId } });
      await tx.deletedRecord.delete({ where: { id: rec.id } });
    });
    await audit("lead", rec.recordId, restoredById, "restored", "Restored from the recycle bin.");
    return { href: `/leads/${rec.recordId}` };
  } catch (e) {
    console.error("restoreRecord", e);
    return { error: "Couldn't restore it - something it was linked to (its sales person, account or contact) may have been deleted since." };
  }
}

// Clears what's been in the bin longer than KEEP_DAYS.
export async function purgeRecycleBin(): Promise<void> {
  await prisma.deletedRecord.deleteMany({ where: { deletedAt: { lt: new Date(Date.now() - KEEP_DAYS * 86400000) } } });
}
