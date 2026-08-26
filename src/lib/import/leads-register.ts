import type { RawLeadRow } from "./parse-leads-register";
import { normalizeSalesmanName } from "./roster";

export type LeadStatusValue = "QUALIFIED" | "UNQUALIFIED";
export type LeadTemperatureValue = "HOT" | "WARM" | "COLD" | "LOST";
export type LeadSourceValue =
  | "WEBSITE"
  | "REFERRAL"
  | "COLD_CALL"
  | "CONTRACTOR"
  | "CONSULTANT"
  | "ARCHITECT"
  | "DIRECT"
  | "EVENT";
export type EquipmentTypeValue = "VRF" | "ATOM" | "FLOOR_STANDING" | "ROOFTOP" | "LARGE_DUCT" | "MIXED_PRODUCT";

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
  status: LeadStatusValue;
  temperature: LeadTemperatureValue;
  source: LeadSourceValue;
  equipmentType: EquipmentTypeValue;
  value: number | null;
  phone: string | null;
  notes: string;
  ownerKey: string;
  accountName: string;
  contactKey: string;
};

export type TransformResult = {
  accounts: TransformedAccount[];
  contacts: TransformedContact[];
  leads: TransformedLead[];
  summary: { totalRowsIn: number; excludedWonRows: number; keptRows: number };
};

// The 5 nicknames used in the Leads sheet, mapped to the real rep accounts
// created by the Sales Register import (see roster.ts).
const SALES_PERSON_MAP: Record<string, string> = {
  CHRIS: "CHRIS- CAC",
  ABISOLA: "UDOH ABISOLA",
  CHIOMA: "CHIOMA ADUMEKWE",
  BUNMI: "ODUJEBE OLUWABUNMI AMINAT",
  CELINAH: "CELINAH OLUWAMAYO OJO",
};

// Confirmed same real-world company under a different name in the Sales
// Register import — merge into the account that already exists there.
export const ACCOUNT_NAME_ALIASES: Record<string, string> = {
  "meczonetts engineering": "MECZONETTS ENGINEERING SERVICES NIG LTD",
};

// Lead Source values that are actually a person's name rather than a real
// source category. Per instruction: rewrite these to "Contractor" and push
// the person's name into Influencer Details (unless it's the same person as
// the row's Contact Person).
const PERSON_NAME_LEAD_SOURCES = new Set([
  "OREVA",
  "ABAYOMI",
  "LAWAL SAID",
  "ADEYEYE",
  "SAMUEL",
  "AFEEZ",
  "ABIODUN IDRIS",
  "JBK WALE",
  "ANRE PETERS",
  "ENGR. STEVE, IBADAN",
  "HELEN",
  "EMMANUEL",
  "UCHE",
  "LANRE PETERS",
  "BIMPE",
  "ENGR ANWO",
  "ANU",
  "JIDE",
  "MAYOWA",
  "EBENEZER",
  "SEUN",
  "DANIEL",
  "SOLA",
  "IFEOMA",
  "NJOKU",
  "MRS DUKE",
  "ENGR. AYO",
]);

// Cleaned (canonicalized) Lead Source text -> the closed LeadSource enum.
// Anything not listed here falls back to DIRECT (if it matches the row's own
// account name — i.e. the customer named itself as the source) or CONSULTANT
// (an unrecognized named company/institution acting as an intermediary).
const LEAD_SOURCE_ENUM_MAP: Record<string, LeadSourceValue> = {
  CONTRACTOR: "CONTRACTOR",
  "TURN KEY CONTRACTOR": "CONTRACTOR",
  "CONTRACTOR/CONSULTANT": "CONTRACTOR",
  CONSULTANT: "CONSULTANT",
  RESELLER: "REFERRAL",
  CLIENT: "DIRECT",
  "PROJECT MANAGER": "CONTRACTOR",
  NONE: "DIRECT",
  DIRECT: "DIRECT",
  ARCH: "ARCHITECT",
  CHAIRMAN: "DIRECT",
  "OPERATION MANAGER": "DIRECT",
};

// Raw Equipment text -> the closed 6-value canonical set. "RT" (as in RTU,
// RT & CCD, RT,ATOM) means Rooftop. Per instruction: DX, Ceiling Concealed,
// and PAC are Large Duct, HRV is VRF, a lone mention of "atom" falls under
// Atom (see the substring check in mapEquipmentType below) - but whenever
// two distinct product types are combined (joined by "&", "+", "/", ",", or
// "and"), the row becomes Mixed Product, atom included; the original text is
// always kept in the notes either way.
const EQUIPMENT_TYPE_MAP: Record<string, EquipmentTypeValue> = {
  VRF: "VRF",
  "VRF AND SPLIT": "MIXED_PRODUCT",
  ATOM: "ATOM",
  "ATOM UNIT": "ATOM",
  "ATOM WALL MOUNTED": "ATOM",
  "ATOM WALL MOUNTED/CASSETTE": "ATOM",
  "ATOM HIWALL": "ATOM",
  "ATOM & CONCEALED": "MIXED_PRODUCT",
  HIWALL: "ATOM",
  SPLIT: "ATOM",
  DUCT: "LARGE_DUCT",
  "DUCTED UNIT": "LARGE_DUCT",
  DX: "LARGE_DUCT",
  "CEILING CONCEALED": "LARGE_DUCT",
  "LARGE CEILNG CONCEALED": "LARGE_DUCT",
  HRV: "VRF",
  PAC: "LARGE_DUCT",
  ROOFTOP: "ROOFTOP",
  RTU: "ROOFTOP",
  "RT & CCD": "MIXED_PRODUCT",
  "RT,ATOM": "MIXED_PRODUCT",
  FS: "FLOOR_STANDING",
  "MIXED PRODUCT": "MIXED_PRODUCT",
};

// Separators that indicate two distinct product types were combined in one
// cell (",", "&", "+", "/", or the word "and").
const EQUIPMENT_COMBINATOR = /[&+,/]|\bAND\b/;

const EMPTY_ISH = new Set(["", "NONE", "NIL", "NA", "N/A"]);

function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isEmptyish(s: string | null): boolean {
  return s == null || EMPTY_ISH.has(s.trim().toUpperCase());
}

// Strips common honorifics/punctuation so "Madam Helen" and "HELEN" compare equal.
function normalizeForCompare(s: string): string {
  return s
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\b(MR|MRS|MS|MADAM|MADAME|ENGR|ARCH|PROF|DR)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function samePerson(a: string, b: string): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Cleans a raw Lead Source value. Real source categories (Contractor,
 * Consultant, Reseller, ...) are canonicalized for consistent casing.
 * Values that are actually a person's name are rewritten to "Contractor",
 * with the name folded into the Influencer Details field.
 */
function cleanLeadSource(
  rawLeadSource: string | null,
  contactPerson: string,
  rawInfluencer: string | null
): { leadSource: string; influencerDetails: string | null; rawWasPersonName: boolean } {
  if (isEmptyish(rawLeadSource)) {
    return { leadSource: "None", influencerDetails: normalizeInfluencer(rawInfluencer), rawWasPersonName: false };
  }

  const trimmed = rawLeadSource!.trim();
  const normalized = trimmed.toUpperCase();

  if (PERSON_NAME_LEAD_SOURCES.has(normalized)) {
    const personName = titleCase(trimmed);
    let influencerDetails = normalizeInfluencer(rawInfluencer);
    if (!samePerson(trimmed, contactPerson)) {
      influencerDetails = influencerDetails ? `${influencerDetails}; ${personName}` : personName;
    }
    return { leadSource: "Contractor", influencerDetails, rawWasPersonName: true };
  }

  // Canonicalize casing for real categories: title-case if the source value
  // was entered in all-caps or all-lowercase; leave intentional mixed case as-is.
  const isAllCaps = trimmed === trimmed.toUpperCase();
  const isAllLower = trimmed === trimmed.toLowerCase();
  const cleaned = isAllCaps || isAllLower ? titleCase(trimmed) : trimmed;

  return { leadSource: cleaned, influencerDetails: normalizeInfluencer(rawInfluencer), rawWasPersonName: false };
}

function normalizeInfluencer(raw: string | null): string | null {
  return isEmptyish(raw) ? null : raw!.trim();
}

function mapLeadSourceEnum(cleanedLeadSource: string, accountName: string): LeadSourceValue {
  const key = cleanedLeadSource.trim().toUpperCase();
  if (LEAD_SOURCE_ENUM_MAP[key]) return LEAD_SOURCE_ENUM_MAP[key];
  if (key === accountName.trim().toUpperCase()) return "DIRECT";
  return "CONSULTANT";
}

function mapEquipmentType(rawEquipment: string | null): EquipmentTypeValue {
  if (!rawEquipment) return "MIXED_PRODUCT";
  const key = rawEquipment.trim().replace(/\s+/g, " ").toUpperCase();
  if (EQUIPMENT_TYPE_MAP[key]) return EQUIPMENT_TYPE_MAP[key];
  if (EQUIPMENT_COMBINATOR.test(key)) return "MIXED_PRODUCT"; // two types combined in one cell.
  if (key.includes("ATOM")) return "ATOM"; // a lone mention of atom falls under Atom.
  return "MIXED_PRODUCT";
}

// The standard pipeline status: Hot/Warm/Cold and unrecognized values are all
// real, active leads (Qualified); Lost leads didn't pan out (Unqualified).
// Won rows never reach here - they're filtered out before the transform runs
// (see transformLeadsRegister), since a won lead means it's already been
// billed and will come in later through the Sales Register import instead.
function mapStatus(rawStatus: string | null): LeadStatusValue {
  const s = (rawStatus ?? "").trim().toUpperCase();
  if (s === "LOST") return "UNQUALIFIED";
  return "QUALIFIED";
}

// The sheet's own Hot/Warm/Cold/Lost vocabulary, kept as a separate tag.
function mapTemperature(rawStatus: string | null): LeadTemperatureValue {
  const s = (rawStatus ?? "").trim().toUpperCase();
  if (s === "HOT") return "HOT";
  if (s === "COLD") return "COLD";
  if (s === "LOST") return "LOST";
  return "WARM"; // Warm, and anything unrecognized (e.g. "indoors supplied"), defaults here.
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Same casing cleanup as cleanLeadSource: fix all-caps/all-lower entries,
// leave intentionally-cased names alone.
function canonicalizeName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const alias = ACCOUNT_NAME_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  const isAllCaps = trimmed === trimmed.toUpperCase();
  const isAllLower = trimmed === trimmed.toLowerCase();
  return isAllCaps || isAllLower ? titleCase(trimmed) : trimmed;
}

function dedupeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// The display name an aliased account would have had before merging (so a
// leftover duplicate row under the old name can be cleaned up post-import).
export function aliasedAwayDisplayNames(): string[] {
  return Object.keys(ACCOUNT_NAME_ALIASES).map(titleCase);
}

export function transformLeadsRegister(rows: RawLeadRow[]): TransformResult {
  const totalRowsIn = rows.length;

  // Won rows are already-billed sales, not leads - they'll come in later via
  // the Sales Register import (which creates a real Deal with an accurate
  // value/date), so skip them entirely here rather than fabricating a lead.
  const wonRows = rows.filter((r) => (r.status ?? "").trim().toUpperCase() === "WON");
  const keptRows = rows.filter((r) => (r.status ?? "").trim().toUpperCase() !== "WON");

  const accountMap = new Map<string, TransformedAccount>();
  const contactMap = new Map<string, TransformedContact>();
  const leads: TransformedLead[] = [];

  for (const row of keptRows) {
    const mappedName = SALES_PERSON_MAP[row.salesPerson.trim().toUpperCase()];
    const ownerKey = normalizeSalesmanName(mappedName ?? row.salesPerson);

    const rawAccountName = isEmptyish(row.customerName) ? row.contactPerson.trim() : row.customerName!.trim();
    const accountDedupeKey = dedupeKey(ACCOUNT_NAME_ALIASES[dedupeKey(rawAccountName)] ?? rawAccountName);
    let account = accountMap.get(accountDedupeKey);
    if (!account) {
      account = { name: canonicalizeName(rawAccountName), ownerKey };
      accountMap.set(accountDedupeKey, account);
    }
    const accountName = account.name;

    const { firstName, lastName } = splitName(canonicalizeName(row.contactPerson));
    const contactDedupeKey = `${accountDedupeKey}::${dedupeKey(row.contactPerson)}`;
    let contact = contactMap.get(contactDedupeKey);
    if (!contact) {
      contact = {
        key: contactDedupeKey,
        importKey: `leadsheet:contact:${contactDedupeKey}`,
        accountName,
        firstName,
        lastName,
        phone: row.contactNo,
      };
      contactMap.set(contactDedupeKey, contact);
    }
    const contactKey = contact.key;

    const { leadSource, influencerDetails, rawWasPersonName } = cleanLeadSource(
      row.leadSource,
      row.contactPerson,
      row.influencerDetails
    );

    const noteLines = [
      row.projectName ? `Project: ${row.projectName}` : null,
      row.equipment ? `Equipment: ${row.equipment}` : null,
      row.site && row.site.trim().toUpperCase() !== "NA" ? `Site: ${row.site}` : null,
      row.location ? `Location: ${row.location}` : null,
      `Lead Source: ${leadSource}${rawWasPersonName ? ` (originally listed as a name: "${row.leadSource!.trim()}")` : ""}`,
      influencerDetails ? `Influencer: ${influencerDetails}` : null,
      row.currentStatus ? `Current Status: ${row.currentStatus}` : null,
      row.quoteSent ? `Quote Sent: ${row.quoteSent}` : null,
      row.status ? `Original tracker status: ${row.status}` : null,
    ].filter((l): l is string => !!l);

    leads.push({
      importKey: `leadsheet:${row.slNo}`,
      title: row.projectName?.trim() || row.equipment?.trim() || `Lead — ${accountName}`,
      status: mapStatus(row.status),
      temperature: mapTemperature(row.status),
      source: mapLeadSourceEnum(leadSource, accountName),
      equipmentType: mapEquipmentType(row.equipment),
      value: row.amount,
      phone: row.contactNo,
      notes: noteLines.join("\n"),
      ownerKey,
      accountName,
      contactKey,
    });
  }

  return {
    accounts: Array.from(accountMap.values()),
    contacts: Array.from(contactMap.values()),
    leads,
    summary: { totalRowsIn, excludedWonRows: wonRows.length, keptRows: leads.length },
  };
}
