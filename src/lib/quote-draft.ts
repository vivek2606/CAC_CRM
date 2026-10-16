import type { Prisma } from "@prisma/client";

// A quotation saved before it was downloaded: a draft. Kept in the same
// table with type "draft" and a temporary "DRAFT-..." reference (the real
// number is issued at the first download, when the draft is replaced by the
// quotation). Left out of the quote lists, reports and follow-ups.
export const DRAFT_TYPE = "draft";
export const NOT_DRAFT = { type: { not: DRAFT_TYPE } } satisfies Prisma.QuotationWhereInput;
