import type { RegisterRow } from "@/app/(app)/reports/sales-register/register-table";

// The Sales Register's lines and totals - built here (not in the page) so
// the money in them is covered by tests (tests/sales-register.test.ts).

const iso = (d: Date) => d.toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

// Invoice no. from an imported line's key: "<docKey>-<itemCode>-<n>", docKey
// being "<Txn Code>/<Txn No>" (optionally "~date~customer~salesman").
export function invoiceFromKey(sourceKey: string, itemCode: string): string | null {
  if (sourceKey.startsWith("deal-item:") || sourceKey.startsWith("manual:") || sourceKey.startsWith("upload:")) return null;
  const suffix = `-${itemCode}-`;
  const at = sourceKey.lastIndexOf(suffix);
  const docKey = (at > 0 ? sourceKey.slice(0, at) : sourceKey).split("~")[0];
  const no = docKey.split("/").pop();
  return no && /\d/.test(no) ? no : null;
}

type Account = { name: string; code: string | null } | null;
export type RegisterLine = {
  id: string;
  docDate: Date;
  qty: number;
  value: number;
  sourceKey: string;
  owner: { name: string };
  product: { code: string; model: string; category: string };
  deal: { id: string; sourceTxnNo: number | null; invoiceNo: string | null; title: string; billingCompany: string | null; account: Account } | null;
};
export type RegisterBareDeal = {
  id: string;
  title: string;
  value: number;
  closedAt: Date | null;
  invoiceNo: string | null;
  billingCompany: string | null;
  owner: { name: string };
  account: Account;
};
export type RegisterBilling = {
  id: string;
  docDate: Date;
  value: number;
  txnNo: number | null;
  docKey: string;
  custName: string;
  itemCode: string;
  itemName: string;
  billingCompany: string | null;
  owner: { name: string };
};

// Every line: products sold (Sales Register import and deals won in the
// CRM), won deals with no products (one line at the deal's value), and
// Project & Service billing.
export function buildRegisterRows(lines: RegisterLine[], bareDeals: RegisterBareDeal[], billings: RegisterBilling[], codeByName: Map<string, string | null>): RegisterRow[] {
  return [
    ...lines.map((l) => ({
      id: l.id,
      accountName: l.deal?.account?.name ?? l.deal?.title.split(" — ")[0] ?? "—",
      accountCode: l.deal?.account?.code ?? "",
      salesPerson: l.owner.name,
      productCode: l.product.code,
      product: l.product.model,
      category: l.product.category,
      qty: l.qty,
      rate: l.qty ? round2(l.value / l.qty) : l.value,
      amount: l.value,
      invoiceNo:
        l.deal?.sourceTxnNo != null ? String(l.deal.sourceTxnNo) : (l.deal?.invoiceNo ?? invoiceFromKey(l.sourceKey, l.product.code) ?? ""),
      invoiceDate: iso(l.docDate),
      company: l.deal?.billingCompany ?? "Not recorded",
      dealId: l.deal?.id ?? null,
      accountLinked: !l.deal || !!l.deal.account,
    })),
    ...bareDeals.map((d) => ({
      id: d.id,
      accountName: d.account?.name ?? d.title,
      accountCode: d.account?.code ?? "",
      salesPerson: d.owner.name,
      productCode: "",
      product: d.title,
      category: "No products listed",
      qty: 1,
      rate: d.value,
      amount: d.value,
      invoiceNo: d.invoiceNo ?? "",
      invoiceDate: iso(d.closedAt!),
      company: d.billingCompany ?? "Not recorded",
      dealId: d.id,
      accountLinked: !!d.account,
    })),
    ...billings.map((b) => ({
      id: b.id,
      accountName: b.custName,
      accountCode: codeByName.get(b.custName) ?? "",
      salesPerson: b.owner.name,
      productCode: b.itemCode,
      product: b.itemName,
      category: "Project & Service",
      qty: 1,
      rate: b.value,
      amount: b.value,
      invoiceNo: b.txnNo ? String(b.txnNo) : b.docKey,
      invoiceDate: iso(b.docDate),
      company: b.billingCompany ?? "Not recorded",
      dealId: null,
      billingId: b.id,
      accountLinked: codeByName.has(b.custName),
    })),
  ];
}

// The totals under the register: qty, amount, and invoices - counted per
// entity (Sakuragi's invoice 100 and Somotex's invoice 100 are two).
export function registerTotals(rows: Pick<RegisterRow, "qty" | "amount" | "invoiceNo" | "company">[]): { qty: number; amount: number; invoices: number } {
  return {
    qty: rows.reduce((s, r) => s + r.qty, 0),
    amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
    invoices: new Set(rows.filter((r) => r.invoiceNo).map((r) => `${r.company}|${r.invoiceNo}`)).size,
  };
}
