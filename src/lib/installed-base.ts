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

// Serial nos. are kept one per unit, in order (unit 1, unit 2, ...) - blank
// where not recorded yet.
export function serialSlots(u: { qty: number; serialNos: string[] }): string[] {
  return Array.from({ length: Math.max(u.qty, u.serialNos.length) }, (_, i) => u.serialNos[i]?.trim() ?? "");
}

// A serial no. already recorded on another unit, if any ("MSAF-12 of
// Customer, unit 2").
export async function serialElsewhere(serial: string, unitId: string, slot: number): Promise<string | null> {
  const s = serial.trim();
  if (!s) return null;
  const units = await prisma.installedUnit.findMany({ where: { serialNos: { has: s } }, select: { id: true, model: true, customerName: true, serialNos: true } });
  for (const u of units)
    u.serialNos.forEach((x, i) => {
      if (x.trim() === s && !(u.id === unitId && i === slot)) throw new SerialTaken(`${u.model} of ${u.customerName}, unit ${i + 1}`);
    });
  return null;
}
export class SerialTaken extends Error {}

// Records the serial no. of one unit of a sale line.
async function setUnitSerial(unitId: string, slot: number, serial: string) {
  const u = await prisma.installedUnit.findUnique({ where: { id: unitId }, select: { qty: true, serialNos: true } });
  if (!u || slot < 0 || slot >= Math.max(u.qty, u.serialNos.length)) return;
  const slots = serialSlots(u);
  slots[slot] = serial.trim();
  while (slots.length && !slots[slots.length - 1]) slots.pop();
  await prisma.installedUnit.update({ where: { id: unitId }, data: { serialNos: slots } });
}

// The serial no. found on site for a unit of a sale line: recorded in the
// line's next free place (already there: nothing to do). Returns why it
// can't be, if it can't.
export async function assignSerial(unitId: string, serial: string): Promise<string | null> {
  const sn = serial.trim();
  if (!sn) return null;
  const u = await prisma.installedUnit.findUnique({ where: { id: unitId }, select: { qty: true, serialNos: true, model: true } });
  if (!u) return null;
  const slots = serialSlots(u);
  if (slots.includes(sn)) return null;
  const free = slots.findIndex((x) => !x);
  try {
    await serialElsewhere(sn, unitId, -1);
  } catch (e) {
    if (e instanceof SerialTaken) return `Serial no. ${sn} is already recorded on ${e.message} - check it.`;
    throw e;
  }
  if (free < 0) return `All ${u.qty} × ${u.model} on this invoice already have serial nos. - check it on Installed units.`;
  await setUnitSerial(unitId, free, sn);
  return null;
}

// The installed-base line a complaint's unit belongs to (its sale + model).
export async function unitLineFor(c: { dealId: string | null; productId: string | null; model: string | null }) {
  if (!c.dealId) return null;
  return prisma.installedUnit.findFirst({
    where: { dealId: c.dealId, ...(c.productId ? { productId: c.productId } : c.model ? { model: c.model } : {}) },
    select: { id: true },
  });
}

// Adds to each complaint how many units of its model its invoice had, so a
// complaint without a serial no. is only taken as the same unit as another
// when there was just one.
export async function withLineUnits<T extends { dealId: string | null; model: string | null }>(list: T[]): Promise<(T & { lineUnits: number | null })[]> {
  const dealIds = [...new Set(list.map((c) => c.dealId).filter((d): d is string => !!d))];
  const lines = dealIds.length ? await prisma.installedUnit.findMany({ where: { dealId: { in: dealIds } }, select: { dealId: true, model: true, qty: true, product: { select: { model: true } } } }) : [];
  const qty = new Map<string, number>();
  for (const l of lines)
    for (const m of new Set([l.model, l.product?.model].filter((x): x is string => !!x).map((x) => x.trim().toUpperCase()))) {
      const k = `${l.dealId}:${m}`;
      qty.set(k, (qty.get(k) ?? 0) + l.qty);
    }
  return list.map((c) => ({ ...c, lineUnits: c.dealId && c.model ? (qty.get(`${c.dealId}:${c.model.trim().toUpperCase()}`) ?? null) : null }));
}
