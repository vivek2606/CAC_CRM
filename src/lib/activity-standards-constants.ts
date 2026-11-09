// Activity standards: the four weekly minimums (safe to use in the browser).
export type Standards = { calls: number; visits: number; quotes: number; leads: number };
export const DEFAULT_STANDARDS: Standards = { calls: 25, visits: 5, quotes: 5, leads: 3 };
export const STANDARD_LABEL: Record<keyof Standards, string> = { calls: "Calls", visits: "Site visits", quotes: "Quotations", leads: "New leads" };
export const STANDARD_KEYS = Object.keys(DEFAULT_STANDARDS) as (keyof Standards)[];
