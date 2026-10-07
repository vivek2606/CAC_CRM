import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Letterhead and document settings for quotations and proforma invoices.
// All quotations and proformas are issued by Sakuragi Industries Nigeria
// Limited (no billing through Somotex). Edited by the Head under Company
// Details and stored in AppSetting "company"; DEFAULT_COMPANY_SETTINGS
// applies until then.

const companySchema = z.object({
  key: z.string().trim().min(1),
  name: z.string().trim().min(1, "Every company needs a name."),
  // First part of the Ref no., e.g. "SNL" in SNL/VIV/20262109.
  refPrefix: z.string().trim().default(""),
  addressLines: z.array(z.string().trim()).default([]),
  phone: z.string().trim().default(""),
  email: z.string().trim().default(""),
  website: z.string().trim().default(""),
  rcNumber: z.string().trim().default(""),
  tin: z.string().trim().default(""),
  bankName: z.string().trim().default(""),
  accountName: z.string().trim().default(""),
  accountNumber: z.string().trim().default(""),
  // PNG/JPEG as a data: URL (uploaded under Company Details), printed on the
  // letterhead of quotations and proforma invoices.
  logo: z
    .string()
    .default("")
    .refine((v) => v === "" || /^data:image\/(png|jpeg);base64,/.test(v), "The logo must be a PNG or JPG image.")
    .refine((v) => v.length <= 700_000, "The logo is too large - use an image under 500 KB."),
});
export type CompanyProfile = z.infer<typeof companySchema>;

export const companySettingsSchema = z.object({
  companies: z.array(companySchema).min(1),
  defaultCompany: z.string(),
  vatRatePct: z.number().min(0).max(100),
  quoteValidityDays: z.number().int().min(1).max(365),
  proformaValidityDays: z.number().int().min(1).max(365),
  // Used when the deal has no payment terms of its own.
  defaultPaymentTerms: z.string().trim(),
  // Printed under the totals, one line each.
  terms: z.array(z.string().trim()).default([]),
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  companies: [
    {
      key: "SAKURAGI",
      name: "Sakuragi Industries Nigeria Limited",
      refPrefix: "SNL",
      addressLines: ["1, Olorunfunmi Street, Off. Kudirat Obiola St.,", "Ojota, Lagos."],
      phone: "",
      email: "",
      website: "www.mohinani.com",
      rcNumber: "",
      tin: "22377683-0001",
      bankName: "Zenith Bank",
      accountName: "Sakuragi Industries Nigeria Limited",
      accountNumber: "1312253223",
      logo: "",
    },
  ],
  defaultCompany: "SAKURAGI",
  vatRatePct: 7.5,
  quoteValidityDays: 7,
  proformaValidityDays: 7,
  defaultPaymentTerms: "100% Advance along with PO before Invoicing.",
  terms: [
    "Warranty - One year from the date of Supply of Goods.",
    "Delivery Charges - free within Lagos",
    "Loading - Done Free at our Ware House",
    "Offloading - Client's Scope",
  ],
};

// The terms block a new document starts with (editable per document).
export function defaultTermsLines(settings: CompanySettings, validityDays = settings.quoteValidityDays): string[] {
  const validity = validityDays === 7 ? "one week" : `${validityDays} days`;
  return [
    `Payment Terms: ${settings.defaultPaymentTerms}`,
    `Price Validity - The above prices are valid for ${validity} from the date of quotation.`,
    ...settings.terms.filter(Boolean),
  ];
}

const SETTINGS_KEY = "company";

export async function getCompanySettings(): Promise<CompanySettings> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    const parsed = row ? companySettingsSchema.safeParse(row.value) : null;
    return parsed?.success ? sakuragiOnly(parsed.data) : DEFAULT_COMPANY_SETTINGS;
  } catch {
    return DEFAULT_COMPANY_SETTINGS;
  }
}

// Documents only ever go out under Sakuragi - drop any other company that an
// earlier save may still hold.
function sakuragiOnly(settings: CompanySettings): CompanySettings {
  const sakuragi = settings.companies.find((c) => c.key === "SAKURAGI") ?? DEFAULT_COMPANY_SETTINGS.companies[0];
  return { ...settings, companies: [sakuragi], defaultCompany: sakuragi.key };
}

export async function saveCompanySettings(settings: CompanySettings) {
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: settings },
    update: { value: settings },
  });
}

// The company a document is issued under: the requested one, else the default.
export function pickCompany(settings: CompanySettings, key: string | undefined): CompanyProfile {
  return (
    settings.companies.find((c) => c.key === key) ??
    settings.companies.find((c) => c.key === settings.defaultCompany) ??
    settings.companies[0]
  );
}

// Letterhead fields still empty - shown as a reminder to the Head.
export function missingCompanyDetails(c: CompanyProfile): string[] {
  return [
    c.addressLines.filter(Boolean).length === 0 && "address",
    !c.phone && "phone",
    !c.bankName && "bank details",
  ].filter((x): x is string => Boolean(x));
}

// "RC 1234567  |  TIN 0123-4567" - without doubling a prefix already typed in.
export function registrationLine(c: CompanyProfile): string {
  const strip = (v: string, prefix: string) => v.replace(new RegExp(`^${prefix}[\\s.:#-]*`, "i"), "").trim();
  return [c.rcNumber && `RC ${strip(c.rcNumber, "RC")}`, c.tin && `TIN ${strip(c.tin, "TIN")}`].filter(Boolean).join("  |  ");
}
