// Upcountry branch sales people: they sell home appliances, and now and then
// CAC items too. No login, no leads or deals of their own - the Head or the
// Sales Coordinator add their sales (by hand or with the Sales Register
// upload), and the register shows them together as "Others". Marked by
// their title.
export const BRANCH_SALES = "Branch Sales";
export const OTHERS = "Others";
export const isBranchSales = (title: string | null | undefined) => title === BRANCH_SALES;
export const BRANCH_SALES_WHERE = { title: BRANCH_SALES };
// Grouped as "Others" from 2026 on; their sales before that keep showing
// under their own name, as they always did.
export const OTHERS_FROM = new Date(Date.UTC(2026, 0, 1));
export const inOthers = (title: string | null | undefined, date: Date) => isBranchSales(title) && date >= OTHERS_FROM;
