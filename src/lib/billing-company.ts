// The company that raised an invoice: both bill CAC sales.
export const BILLING_COMPANIES = ["Sakuragi", "Somotex"] as const;
export type BillingCompany = (typeof BILLING_COMPANIES)[number];

// "SAKURAGI INDUSTRIES NIGERIA LTD", "somotex" ... -> the company; anything
// else -> null.
export function billingCompanyOf(text: string | null | undefined): BillingCompany | null {
  const t = (text ?? "").toLowerCase();
  if (t.includes("somotex")) return "Somotex";
  if (t.includes("sakuragi")) return "Sakuragi";
  return null;
}
