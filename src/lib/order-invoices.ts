import { prisma } from "@/lib/prisma";

// All the invoices of an order billed in parts: the deal marked Won and the
// further-invoice deals made from it (orderDealId). Empty unless there are
// two or more.
export type OrderInvoice = {
  id: string;
  title: string;
  invoiceNo: string | null;
  billingCompany: string | null;
  closedAt: Date | null;
  value: number;
  items: { qty: number; unitPrice: number; product: { model: string; code: string } }[];
};

export async function getOrderInvoices(dealId: string): Promise<OrderInvoice[]> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, orderDealId: true } });
  if (!deal) return [];
  const root = deal.orderDealId ?? deal.id;
  const rows = await prisma.deal.findMany({
    where: { OR: [{ id: root }, { orderDealId: root }], stage: "WON" },
    orderBy: [{ closedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      invoiceNo: true,
      billingCompany: true,
      closedAt: true,
      value: true,
      items: { orderBy: { createdAt: "asc" }, select: { qty: true, unitPrice: true, product: { select: { model: true, code: true } } } },
    },
  });
  return rows.length > 1 ? rows : [];
}
