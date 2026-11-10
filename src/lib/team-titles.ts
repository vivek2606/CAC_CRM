// Designations. Sales people are "Sales Manager" or "Senior Sales Manager" -
// the same access and the same place in targets, reports and incentives;
// the Service Manager handles service. The designation is what's shown; the
// role (Head / Sales Manager / Sales Coordinator) decides what they can do.
export const SALES_TITLES = ["Sales Manager", "Senior Sales Manager"];
export const isSalesTitle = (t: string | null | undefined) => !!t && SALES_TITLES.includes(t);
// For queries: a sales person by designation.
export const SALES_TITLE_IN = { in: SALES_TITLES };
// The designations offered on Team & Logins.
export const DESIGNATIONS = ["Sales Manager", "Senior Sales Manager", "Service Manager", "Sales Coordinator", "Head of Sales"];
