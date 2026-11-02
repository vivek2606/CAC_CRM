// Upcountry branch sales people: they sell home appliances, and now and then
// CAC items too. No login, no leads or deals of their own - the Head or the
// Sales Coordinator add their sales (by hand or with the Sales Register
// upload), and the register shows them together as "Others". Marked by
// their title.
export const BRANCH_SALES = "Branch Sales";
export const OTHERS = "Others";
export const isBranchSales = (title: string | null | undefined) => title === BRANCH_SALES;
export const BRANCH_SALES_WHERE = { title: BRANCH_SALES };
