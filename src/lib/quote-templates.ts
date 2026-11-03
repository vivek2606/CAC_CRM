import type { CompanyProfile, CompanySettings } from "@/lib/company-profile";

// Quotation templates: equipment (the usual - Sakuragi only), servicing and
// spare parts (issued by Sakuragi or Somotex). Each has its own heading,
// default title and terms; the reference shows the company and SVC.

export const QUOTE_TEMPLATES = ["equipment", "service", "spares"] as const;
export type QuoteTemplate = (typeof QUOTE_TEMPLATES)[number];
export const TEMPLATE_LABEL: Record<QuoteTemplate, string> = { equipment: "Equipment", service: "Servicing", spares: "Spare parts" };

export const TEMPLATE_TITLE: Record<QuoteTemplate, string> = {
  equipment: "SUPPLY OF AIR-CONDITIONING EQUIPMENT",
  service: "SERVICING / REPAIR OF AIR-CONDITIONING UNITS",
  spares: "SUPPLY OF AIR-CONDITIONING SPARE PARTS",
};

// The heading printed on the document.
export function templateHeading(template: QuoteTemplate, type: "quote" | "proforma" | "boq", base: string): string {
  if (template === "equipment") return base;
  const what = template === "service" ? "SERVICE" : "SPARE PARTS";
  return type === "quote" ? `${what} QUOTATION` : `${base} - ${what}`;
}

// The terms a new document of the template starts with (editable).
export function templateTerms(template: QuoteTemplate, equipmentTerms: string[], validityDays: number): string[] {
  if (template === "equipment") return equipmentTerms;
  const validity = `Price Validity - The above prices are valid for ${validityDays === 7 ? "one week" : `${validityDays} days`} from the date of quotation.`;
  return template === "service"
    ? [
        "Payment Terms: 100% advance before commencement of work.",
        validity,
        "Scope - as listed above; any further fault found or spare part needed will be quoted separately.",
        "Access to the site and the units, and power, to be provided by the client.",
        "Warranty - 3 months on the work done and the spare parts replaced.",
      ]
    : [
        "Payment Terms: 100% advance along with PO.",
        validity,
        "Delivery - from our Lagos warehouse; delivery outside Lagos is charged extra.",
        "Spare parts once sold are not returnable.",
        "Warranty - 3 months from the date of supply against manufacturing defects (not for damage from voltage fluctuation or wrong installation).",
      ];
}

// Somotex Nigeria Limited, for servicing and spare parts documents.
export const SOMOTEX_KEY = "SOMOTEX";
export function somotexProfile(settings: CompanySettings, logo: string): CompanyProfile {
  const sakuragi = settings.companies[0];
  return {
    key: SOMOTEX_KEY,
    name: "Somotex Nigeria Limited",
    refPrefix: "SOM",
    addressLines: sakuragi.addressLines,
    phone: sakuragi.phone,
    email: "",
    website: "",
    rcNumber: "",
    tin: "01341019-0001",
    bankName: "Zenith Bank",
    accountName: "Somotex Nigeria Limited",
    accountNumber: "1014618203",
    logo,
  };
}

// Reference prefix: SNIL/CAC/LAG for equipment; <company>/SVC/LAG for
// servicing and spare parts.
export function refPrefixFor(template: QuoteTemplate, companyKey: string): string {
  if (template === "equipment") return "SNIL/CAC/LAG";
  return `${companyKey === SOMOTEX_KEY ? "SOM" : "SNIL"}/SVC/LAG`;
}
