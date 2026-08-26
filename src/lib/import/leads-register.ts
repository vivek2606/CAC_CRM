import type { RawLeadRow } from "./parse-leads-register";
import { normalizeSalesmanName } from "./roster";

export type TransformedAccount = { name: string; ownerKey: string };
export type TransformedContact = {
  key: string; // accountName::fullName, for dedup within the import batch
  accountName: string;
  firstName: string;
  lastName: string;
  phone: string | null;
};
export type TransformedLead = {
  title: string;
  status: "QUALIFIED" | "CONVERTED" | "UNQUALIFIED";
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
  summary: { totalRowsIn: number; keptRows: number };
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

function mapStatus(rawStatus: string | null): "QUALIFIED" | "CONVERTED" | "UNQUALIFIED" {
  const s = (rawStatus ?? "").trim().toUpperCase();
  if (s === "WON") return "CONVERTED";
  if (s === "LOST") return "UNQUALIFIED";
  return "QUALIFIED"; // Hot/Warm/Cold, and anything else unrecognized, default here.
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
  const isAllCaps = trimmed === trimmed.toUpperCase();
  const isAllLower = trimmed === trimmed.toLowerCase();
  return isAllCaps || isAllLower ? titleCase(trimmed) : trimmed;
}

function dedupeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function transformLeadsRegister(rows: RawLeadRow[]): TransformResult {
  const totalRowsIn = rows.length;

  const accountMap = new Map<string, TransformedAccount>();
  const contactMap = new Map<string, TransformedContact>();
  const leads: TransformedLead[] = [];

  for (const row of rows) {
    const mappedName = SALES_PERSON_MAP[row.salesPerson.trim().toUpperCase()];
    const ownerKey = normalizeSalesmanName(mappedName ?? row.salesPerson);

    const rawAccountName = isEmptyish(row.customerName) ? row.contactPerson.trim() : row.customerName!.trim();
    const accountDedupeKey = dedupeKey(rawAccountName);
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
      title: row.projectName?.trim() || row.equipment?.trim() || `Lead — ${accountName}`,
      status: mapStatus(row.status),
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
    summary: { totalRowsIn, keptRows: leads.length },
  };
}
