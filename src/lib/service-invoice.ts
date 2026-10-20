import { prisma } from "@/lib/prisma";
import { getCompanySettings, pickCompany, type CompanyProfile } from "@/lib/company-profile";
import { nairaInWords, serialNumbers } from "@/lib/document-format";
import { SOMOTEX_LOGO } from "@/lib/brand/somotex-logo";
import type { DocRow, SalesDocument } from "@/lib/sales-document";
import type { ServiceInvoiceInput } from "@/lib/service-invoice-schema";
export { BILLING_TYPES, serviceInvoiceInputSchema, type ServiceInvoiceInput } from "@/lib/service-invoice-schema";

// Invoices for service and project billing, issued under Somotex Nigeria
// Limited: free-text line items (no products), with or without VAT, and
// the payment received so far with the balance due. Rendered with the
// quotation PDF layout (sales-document-pdf.tsx).

export const SOMOTEX: CompanyProfile = {
  key: "SOMOTEX",
  name: "Somotex Nigeria Limited",
  refPrefix: "SOM",
  addressLines: [],
  phone: "",
  email: "",
  website: "",
  rcNumber: "",
  tin: "01341019-0001",
  bankName: "Zenith Bank",
  accountName: "Somotex Nigeria Limited",
  accountNumber: "1014618203",
  logo: SOMOTEX_LOGO,
};
export const SOMOTEX_VAT_REG_NO = "IKV 16002468331";
export const SOMOTEX_BANK_BRANCH = "Oba Akran Avenue, Ikeja";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function buildServiceInvoice(input: ServiceInvoiceInput): Promise<SalesDocument> {
  const settings = await getCompanySettings();
  const { vatRatePct } = settings;
  const sns = serialNumbers(input.rows);
  // With VAT, the rates are typed in VAT-inclusive: each line prints at its
  // basic rate (excl. VAT), and VAT is the entered total less the basic
  // amount - so the total is exactly what was entered.
  const f = input.withVat ? 1 + vatRatePct / 100 : 1;
  let entered = 0;
  const rows: DocRow[] = input.rows
    .map((r, i): DocRow | null => {
      if (r.kind === "section") return r.label ? { kind: "section", label: r.label, sn: sns[i] } : null;
      if (!r.description && r.qty === 0) return null;
      const lineTotal = round2(r.qty * r.rate);
      entered += lineTotal;
      const rate = round2(r.rate / f);
      return { kind: "item", sn: sns[i], description: r.description, detail: "", unit: r.unit || "Lot", qty: r.qty, unitPrice: rate, discountPct: 0, netRate: rate, installRate: 0, amount: round2(lineTotal / f) };
    })
    .filter((r): r is DocRow => r != null);
  const subtotal = round2(rows.reduce((s, r) => s + (r.kind === "item" ? r.amount : 0), 0));
  const total = round2(entered);
  const vat = round2(total - subtotal);
  const received = round2(input.received);
  return {
    type: "proforma", // "Bill to" on the document
    heading: "PROJECT & SERVICE INVOICE",
    ref: input.ref,
    date: new Date(`${input.date}T00:00:00Z`),
    // Same address as Sakuragi (from Company Details).
    company: { ...SOMOTEX, addressLines: pickCompany(settings, "SAKURAGI").addressLines },
    to: input.to.split("\n").map((l) => l.trim()).filter(Boolean),
    attention: input.attention,
    title: input.title,
    validUntil: null,
    tin: SOMOTEX.tin,
    bank: { bankName: SOMOTEX.bankName, branch: SOMOTEX_BANK_BRANCH, accountName: SOMOTEX.accountName, accountNumber: SOMOTEX.accountNumber },
    signatory: { name: input.signatoryName, designation: input.signatoryDesignation, phone: input.signatoryPhone },
    rows,
    vatInclusive: false,
    withInstallation: false,
    supplyTotal: subtotal,
    installTotal: 0,
    subtotal,
    vatRatePct,
    vat,
    total,
    totalInWords: nairaInWords(total),
    terms: input.terms.map((t) => t.trim()).filter(Boolean),
    subtotalLabel: "Basic amount (excl. VAT)",
    regLines: [`VAT Reg. No. ${SOMOTEX_VAT_REG_NO}`, `TIN ${SOMOTEX.tin}`],
    noVat: !input.withVat,
    payment: { received, balance: round2(total - received) },
    signBlocks: [
      { title: "Prepared by", lines: [input.signatoryName, input.signatoryDesignation, input.signatoryPhone].filter(Boolean) },
      { title: "Checked by", lines: [input.checkedBy].filter(Boolean) },
      { title: `For ${SOMOTEX.name}`, lines: ["Authorised Signatory"] },
    ],
  };
}

// Next invoice number: SOM/INV/<year>/<running no.>, a per-year counter in
// AppSetting bumped in one statement (two downloads at once can't clash).
export async function nextServiceInvoiceRef(now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const key = `service-invoice-seq:${year}`;
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    INSERT INTO "AppSetting" ("key", "value", "updatedAt")
    VALUES (${key}, '1'::jsonb, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = to_jsonb((("AppSetting"."value") #>> '{}')::int + 1), "updatedAt" = NOW()
    RETURNING (("value") #>> '{}')::int AS n
  `;
  return `SOM/INV/${year}/${String(Number(rows[0]?.n ?? 1)).padStart(4, "0")}`;
}

export function serviceInvoiceFilename(doc: SalesDocument): string {
  const who = (doc.to[0] ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  return `${["Invoice", doc.ref.replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), who].filter(Boolean).join("_")}.pdf`;
}
