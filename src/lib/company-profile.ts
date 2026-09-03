// Letterhead details for the printable Quote page. These are placeholder
// best-guesses from session context (Somotex/CAC, somotexnig.com) - edit
// them with real values (address, phone, bank details) before sending a
// quote generated from this app to an actual customer.
export const COMPANY_PROFILE = {
  name: "Somotex Nigeria Limited",
  addressLines: ["Lagos, Nigeria"],
  phone: "",
  email: "sales@somotexnig.com",
  quoteValidityDays: 14,
  paymentTerms: "50% advance payment, balance before delivery.",
  bankDetails: null as { bankName: string; accountName: string; accountNumber: string } | null,
};
