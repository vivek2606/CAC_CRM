import { prisma } from "@/lib/prisma";
import { STANDARD_WARRANTY_MONTHS, warrantyUntil } from "@/lib/service";

// The installed base (InstalledUnit): every unit sold, from the sale lines
// of won deals (Sales Register uploads and deals won in the CRM). New sale
// lines are added; units already there keep what service added to them.
export async function syncInstalledUnits(): Promise<number> {
  const existing = new Set((await prisma.installedUnit.findMany({ where: { saleKey: { not: null } }, select: { saleKey: true } })).map((u) => u.saleKey!));
  const lines = await prisma.saleLineItem.findMany({
    where: { qty: { gt: 0 }, dealId: { not: null } },
    select: {
      sourceKey: true,
      docDate: true,
      qty: true,
      productId: true,
      product: { select: { model: true, category: true } },
      deal: {
        select: {
          id: true,
          title: true,
          invoiceNo: true,
          sourceTxnNo: true,
          billingCompany: true,
          customerName: true,
          customerPhone: true,
          warrantyMonths: true,
          accountId: true,
          account: { select: { name: true, phone: true, address: true, city: true } },
        },
      },
    },
  });
  const data = lines
    .filter((l) => !existing.has(l.sourceKey) && l.deal)
    .map((l) => {
      const d = l.deal!;
      const months = d.warrantyMonths ?? STANDARD_WARRANTY_MONTHS;
      return {
        saleKey: l.sourceKey,
        customerName: d.account?.name ?? d.customerName ?? d.title.split(" — ")[0],
        accountId: d.accountId,
        dealId: d.id,
        invoiceNo: d.invoiceNo ?? (d.sourceTxnNo != null ? String(d.sourceTxnNo) : null),
        invoiceDate: l.docDate,
        billingCompany: d.billingCompany,
        productId: l.productId,
        model: l.product.model,
        category: l.product.category,
        qty: Math.max(1, Math.round(l.qty)),
        phone: d.customerPhone ?? d.account?.phone ?? null,
        siteAddress: [d.account?.address, d.account?.city].filter(Boolean).join(", ") || null,
        warrantyMonths: months,
        warrantyUntil: warrantyUntil(l.docDate, months),
      };
    });
  for (let i = 0; i < data.length; i += 1000) await prisma.installedUnit.createMany({ data: data.slice(i, i + 1000), skipDuplicates: true });
  return data.length;
}

// A sale's warranty changed (special terms): its units follow.
export async function applyDealWarranty(dealId: string, months: number) {
  const units = await prisma.installedUnit.findMany({ where: { dealId }, select: { id: true, invoiceDate: true } });
  for (const u of units)
    await prisma.installedUnit.update({ where: { id: u.id }, data: { warrantyMonths: months, warrantyUntil: u.invoiceDate ? warrantyUntil(u.invoiceDate, months) : null } });
}
