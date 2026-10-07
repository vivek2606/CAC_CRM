import { z } from "zod";
import { getCompanySettings, pickCompany, type CompanyProfile } from "@/lib/company-profile";
import { nairaInWords, serialNumbers, isAvailabilityNote } from "@/lib/document-format";

export { nairaInWords, serialNumbers, defaultRef } from "@/lib/document-format";

// A quotation / proforma invoice / bill of quantity, as rendered to PDF and
// Excel. Built on the server from what the user entered in the Quotations
// builder (rates are ex-VAT; VAT is added on the subtotal), so the totals
// in both files always agree.

export const DOCUMENT_TYPES = { quote: "QUOTATION", proforma: "PROFORMA INVOICE", boq: "BILL OF QUANTITY" } as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

const rowSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("section"), label: z.string().trim().max(200) }),
  z.object({
    kind: z.literal("item"),
    description: z.string().trim().max(1000),
    detail: z.string().trim().max(300).default(""), // e.g. "Available" / "In Transit (ETA ...)"
    unit: z.string().trim().max(20).default("No."),
    qty: z.number().finite().min(0),
    unitPrice: z.number().finite().min(0),
  }),
]);

export const documentInputSchema = z.object({
  type: z.enum(["quote", "proforma", "boq"]),
  companyKey: z.string(),
  ref: z.string().trim().max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date."),
  to: z.string().trim().max(1000), // first line = customer name
  attention: z.string().trim().max(200).default(""),
  title: z.string().trim().max(300).default(""),
  rows: z.array(rowSchema).max(300),
  terms: z.array(z.string()).max(40).default([]),
  validityDays: z.number().int().min(0).max(365).default(7),
  // "separate": rates excl. VAT, VAT added below. "inclusive": the rates
  // entered already include VAT and no VAT line is shown.
  vatMode: z.enum(["separate", "inclusive"]).default("separate"),
  // Off: the stock status filled in from the product list ("Available",
  // "Not Available", "In Transit (ETA ...)") is left off the document.
  showAvailability: z.boolean().default(true),
  // Pre-filled from Company Details, editable per document.
  tin: z.string().trim().max(60).default(""),
  bankName: z.string().trim().max(120).default(""),
  accountName: z.string().trim().max(160).default(""),
  accountNumber: z.string().trim().max(40).default(""),
  // Printed under "For <company>" - pre-filled from the user's login.
  signatoryName: z.string().trim().max(120).default(""),
  signatoryDesignation: z.string().trim().max(120).default(""),
  signatoryPhone: z.string().trim().max(60).default(""),
});
export type DocumentInput = z.infer<typeof documentInputSchema>;

export type DocRow =
  | { kind: "section"; label: string; sn: string }
  | { kind: "item"; sn: string; description: string; detail: string; unit: string; qty: number; unitPrice: number; amount: number };

export type SalesDocument = {
  type: DocumentType;
  heading: (typeof DOCUMENT_TYPES)[DocumentType];
  ref: string;
  date: Date;
  company: CompanyProfile;
  to: string[];
  attention: string;
  title: string;
  validUntil: Date | null;
  tin: string;
  bank: { bankName: string; accountName: string; accountNumber: string };
  signatory: { name: string; designation: string; phone: string };
  rows: DocRow[];
  vatInclusive: boolean;
  subtotal: number;
  vatRatePct: number;
  vat: number;
  total: number;
  totalInWords: string;
  terms: string[];
};

export async function buildDocument(input: DocumentInput): Promise<SalesDocument> {
  const settings = await getCompanySettings();
  const sns = serialNumbers(input.rows);
  const rows: DocRow[] = input.rows
    .map((r, i): DocRow | null => {
      if (r.kind === "section") return r.label ? { kind: "section", label: r.label, sn: sns[i] } : null;
      if (!r.description && r.qty === 0) return null;
      const detail = !input.showAvailability && isAvailabilityNote(r.detail) ? "" : r.detail;
      return { ...r, detail, sn: sns[i], amount: round2(r.qty * r.unitPrice) };
    })
    .filter((r): r is DocRow => r != null);
  const vatInclusive = input.vatMode === "inclusive";
  const subtotal = round2(rows.reduce((s, r) => s + (r.kind === "item" ? r.amount : 0), 0));
  const vat = vatInclusive ? 0 : round2((subtotal * settings.vatRatePct) / 100);
  const total = round2(subtotal + vat);
  return {
    type: input.type,
    heading: DOCUMENT_TYPES[input.type],
    ref: input.ref,
    date: new Date(`${input.date}T00:00:00Z`),
    company: pickCompany(settings, input.companyKey),
    to: input.to.split("\n").map((l) => l.trim()).filter(Boolean),
    attention: input.attention,
    title: input.title,
    validUntil: input.validityDays > 0 ? addDays(new Date(`${input.date}T00:00:00Z`), input.validityDays) : null,
    tin: input.tin,
    bank: { bankName: input.bankName, accountName: input.accountName, accountNumber: input.accountNumber },
    signatory: { name: input.signatoryName, designation: input.signatoryDesignation, phone: input.signatoryPhone },
    rows,
    vatInclusive,
    subtotal,
    vatRatePct: settings.vatRatePct,
    vat,
    total,
    totalInWords: nairaInWords(total),
    terms: input.terms.map((t) => t.trim()).filter(Boolean),
  };
}

export function documentFilename(doc: SalesDocument, ext: "pdf" | "xlsx"): string {
  const kind = { quote: "Quotation", proforma: "Proforma", boq: "BOQ" }[doc.type];
  const who = (doc.to[0] ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  const ref = doc.ref.replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${[kind, ref, who].filter(Boolean).join("_")}.${ext}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

