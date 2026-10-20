import { z } from "zod";

// The Somotex service / project invoice form (see service-invoice.ts) - kept
// apart so the browser form can use it without the server code.

export const BILLING_TYPES = ["Service", "Project"] as const;

const rowSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("section"), label: z.string().trim().max(200) }),
  z.object({
    kind: z.literal("item"),
    description: z.string().trim().max(1000),
    unit: z.string().trim().max(20).default("Lot"),
    qty: z.number().finite().min(0),
    rate: z.number().finite().min(0),
  }),
]);

export const serviceInvoiceInputSchema = z.object({
  // Blank on a new invoice - the number is given when it's first downloaded.
  ref: z.string().trim().max(80).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the invoice date."),
  billingType: z.enum(BILLING_TYPES),
  to: z.string().trim().max(1000), // first line = customer name
  attention: z.string().trim().max(200).default(""),
  title: z.string().trim().max(300).default(""),
  withVat: z.boolean(),
  rows: z.array(rowSchema).max(200),
  received: z.number().finite().min(0).default(0),
  terms: z.array(z.string()).max(40).default([]),
  signatoryName: z.string().trim().max(120).default(""),
  signatoryDesignation: z.string().trim().max(120).default(""),
  signatoryPhone: z.string().trim().max(60).default(""),
  // The signatory fields above are "Prepared by"; this is "Checked by".
  checkedBy: z.string().trim().max(120).default(""),
});
export type ServiceInvoiceInput = z.infer<typeof serviceInvoiceInputSchema>;
