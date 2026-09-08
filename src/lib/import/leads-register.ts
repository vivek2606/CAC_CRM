import type { LeadStatus, LeadSource, EquipmentType, EndUseSegment, PurchaseTimeframe } from "@prisma/client";
import type { RawLeadRow } from "./parse-leads-register";
import {
  LEAD_STATUS_LABELS,
  WIN_PROBABILITY_OPTIONS,
  LEAD_SOURCE_LABELS,
  EQUIPMENT_TYPE_LABELS,
  END_USE_SEGMENT_LABELS,
  PURCHASE_TIMEFRAME_LABELS,
} from "@/lib/constants";

export type TransformedAccount = { name: string; ownerKey: string };
export type TransformedContact = {
  key: string; // accountName::fullName, for dedup within the import batch
  importKey: string;
  accountName: string;
  firstName: string;
  lastName: string;
  phone: string | null;
};
export type TransformedLead = {
  importKey: string;
  title: string;
  customerName: string;
  company: string | null;
  status: LeadStatus;
  winProbability: number | null;
  source: LeadSource;
  equipmentType: EquipmentType | null;
  endUseSegment: EndUseSegment | null;
  competitorBrand: string | null;
  budgetConfirmed: boolean | null;
  expectedPurchaseTimeframe: PurchaseTimeframe | null;
  value: number | null;
  email: string | null;
  phone: string;
  notes: string | null;
  createdAt: Date | null;
  ownerKey: string;
  accountName: string;
  contactKey: string;
};

export type TransformResult = {
  accounts: TransformedAccount[];
  contacts: TransformedContact[];
  leads: TransformedLead[];
  summary: {
    totalRowsIn: number;
    keptRows: number;
    byStatus: Record<LeadStatus, number>;
  };
};

// Builds a "label text (lowercased) -> enum key" lookup from one of the
// Record<Enum, string> label maps in constants.ts, so the sheet's Status /
// Source / Equipment type / etc. columns can use the exact same wording as
// their dropdown in the Lead form and match case-insensitively.
function reverseLabelMap<T extends string>(labels: Partial<Record<T, string>>): Map<string, T> {
  const map = new Map<string, T>();
  for (const key of Object.keys(labels) as T[]) {
    const label = labels[key];
    if (label) map.set(label.trim().toLowerCase(), key);
  }
  return map;
}

// CONVERTED is a system-managed status (set only by actually converting a
// lead to a deal) - never importable directly.
const STATUS_MAP = reverseLabelMap<LeadStatus>({
  NEW: LEAD_STATUS_LABELS.NEW,
  CONTACTED: LEAD_STATUS_LABELS.CONTACTED,
  QUALIFIED: LEAD_STATUS_LABELS.QUALIFIED,
  UNQUALIFIED: LEAD_STATUS_LABELS.UNQUALIFIED,
});
const SOURCE_MAP = reverseLabelMap<LeadSource>(LEAD_SOURCE_LABELS);
const EQUIPMENT_MAP = reverseLabelMap<EquipmentType>(EQUIPMENT_TYPE_LABELS);
const END_USE_MAP = reverseLabelMap<EndUseSegment>(END_USE_SEGMENT_LABELS);
const TIMEFRAME_MAP = reverseLabelMap<PurchaseTimeframe>(PURCHASE_TIMEFRAME_LABELS);

function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Fixes all-caps/all-lower entries (common when typed in a hurry); leaves
// intentionally-cased names (e.g. "McKenzie") alone.
function canonicalizeName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const isAllCaps = trimmed === trimmed.toUpperCase();
  const isAllLower = trimmed === trimmed.toLowerCase();
  return isAllCaps || isAllLower ? titleCase(trimmed) : trimmed;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function dedupeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function transformLeadsRegister(rows: RawLeadRow[]): TransformResult {
  const totalRowsIn = rows.length;

  const accountMap = new Map<string, TransformedAccount>();
  const contactMap = new Map<string, TransformedContact>();
  const leads: TransformedLead[] = [];
  const byStatus: Record<LeadStatus, number> = {
    NEW: 0,
    CONTACTED: 0,
    QUALIFIED: 0,
    UNQUALIFIED: 0,
    CONVERTED: 0,
  };

  for (const row of rows) {
    const ownerKey = dedupeKey(row.assignedTo);

    // The account is whichever the sheet named most specifically: an
    // explicit Linked account, else the Company, else the customer's own
    // name (an individual with no company).
    const rawAccountName = (row.linkedAccount?.trim() || row.company?.trim() || row.customerName).trim();
    const accountDedupeKey = dedupeKey(rawAccountName);
    let account = accountMap.get(accountDedupeKey);
    if (!account) {
      account = { name: canonicalizeName(rawAccountName), ownerKey };
      accountMap.set(accountDedupeKey, account);
    }
    const accountName = account.name;

    const rawContactName = (row.linkedContact?.trim() || row.customerName).trim();
    const { firstName, lastName } = splitName(canonicalizeName(rawContactName));
    const contactDedupeKey = `${accountDedupeKey}::${dedupeKey(rawContactName)}`;
    let contact = contactMap.get(contactDedupeKey);
    if (!contact) {
      contact = {
        key: contactDedupeKey,
        importKey: `leadsheet:contact:${contactDedupeKey}`,
        accountName,
        firstName,
        lastName,
        phone: row.phone,
      };
      contactMap.set(contactDedupeKey, contact);
    }

    const status = (row.status && STATUS_MAP.get(row.status.trim().toLowerCase())) || "NEW";
    byStatus[status]++;

    const winProbability =
      row.winProbability != null && WIN_PROBABILITY_OPTIONS.includes(row.winProbability) ? row.winProbability : null;

    const source = (row.source ? SOURCE_MAP.get(row.source.trim().toLowerCase()) : undefined) ?? "DIRECT";
    const equipmentType = (row.equipmentType ? EQUIPMENT_MAP.get(row.equipmentType.trim().toLowerCase()) : undefined) ?? null;
    const endUseSegment = (row.endUseSegment ? END_USE_MAP.get(row.endUseSegment.trim().toLowerCase()) : undefined) ?? null;
    const expectedPurchaseTimeframe =
      (row.expectedPurchaseTimeframe
        ? TIMEFRAME_MAP.get(row.expectedPurchaseTimeframe.trim().toLowerCase())
        : undefined) ?? null;

    const budgetConfirmed =
      row.budgetConfirmed == null
        ? null
        : /^y(es)?$/i.test(row.budgetConfirmed.trim())
          ? true
          : /^no?$/i.test(row.budgetConfirmed.trim())
            ? false
            : null;

    leads.push({
      // Stable per-row identity for a safe re-run: title + phone, since
      // neither the sheet nor the CRM assigns a row number of its own.
      // Re-uploading a row with the same title+phone updates it instead of
      // duplicating it; changing either is treated as a new lead.
      importKey: `leadsheet:${dedupeKey(row.title)}::${dedupeKey(row.phone)}`,
      title: row.title,
      customerName: canonicalizeName(row.customerName),
      company: row.company ? canonicalizeName(row.company) : null,
      status,
      winProbability,
      source,
      equipmentType,
      endUseSegment,
      competitorBrand: row.competitorBrand,
      budgetConfirmed,
      expectedPurchaseTimeframe,
      value: row.value,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
      createdAt: row.date,
      ownerKey,
      accountName,
      contactKey: contact.key,
    });
  }

  return {
    accounts: Array.from(accountMap.values()),
    contacts: Array.from(contactMap.values()),
    leads,
    summary: { totalRowsIn, keptRows: leads.length, byStatus },
  };
}
