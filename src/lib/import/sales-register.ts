import { lookupRosterEntry, normalizeSalesmanName } from "./roster";
import { computeCapacityKw } from "@/lib/capacity";

export type RawSalesRow = {
  txnNo: number;
  docDate: Date;
  custCode: string;
  custName: string;
  locnName: string | null;
  category: string;
  subCategory: string | null;
  itemCode: string;
  itemName: string;
  qty: number;
  rate: number;
  netAmt: number;
  exchangeRate: number;
  salesman: string;
};

export type TransformedAccount = { name: string; code: string; city: string | null; ownerKey: string };
export type TransformedProduct = {
  code: string;
  brand: "MIDEA";
  category: string;
  subCategory: string;
  model: string;
  capacityKw: number | null;
};
export type TransformedUser = {
  key: string;
  name: string;
  email: string;
  isActive: boolean;
  title: string;
};
export type TransformedDeal = {
  txnNo: number;
  title: string;
  value: number;
  closedAt: Date;
  custName: string;
  ownerKey: string;
};
export type TransformedLineItem = {
  sourceKey: string;
  itemCode: string;
  txnNo: number;
  docDate: Date;
  month: Date;
  qty: number;
  value: number;
  ownerKey: string;
};
export type TransformedExchangeRate = { month: Date; rate: number };

export type TransformResult = {
  accounts: TransformedAccount[];
  products: TransformedProduct[];
  users: TransformedUser[];
  deals: TransformedDeal[];
  lineItems: TransformedLineItem[];
  exchangeRates: TransformedExchangeRate[];
  summary: {
    totalRowsIn: number;
    excludedServiceRows: number;
    creditNoteRowsNetted: number;
    keptRows: number;
  };
};

function titleCase(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function placeholderEmail(name: string): string {
  const slug = normalizeSalesmanName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
  return `${slug}.imported@caccrm.local`;
}

export function transformSalesRegister(rows: RawSalesRow[]): TransformResult {
  const totalRowsIn = rows.length;

  const excludedService = rows.filter((r) => r.category === "Project & Service");
  // Return/credit-note rows (negative Qty and Net Amt) are kept, not dropped
  // - excluding them entirely used to leave a product's total quantity/value
  // sold overstated by whatever was later returned. They're netted into
  // quantities, values, and pricing below; only Deal creation (further down)
  // still requires a transaction's rows to net to a positive value.
  const kept = rows.filter((r) => r.category !== "Project & Service");
  const creditNoteRows = kept.filter((r) => r.netAmt < 0);

  // Sort ascending by date so "last write wins" == "most recent" for dedup maps.
  const sorted = [...kept].sort((a, b) => a.docDate.getTime() - b.docDate.getTime());

  // Accounts: most recent Cust Code + city per customer name.
  const accountMap = new Map<string, TransformedAccount>();
  for (const row of sorted) {
    accountMap.set(row.custName, {
      name: row.custName,
      code: row.custCode,
      city: row.locnName ?? null,
      ownerKey: normalizeSalesmanName(row.salesman),
    });
  }

  // Products: most recent category/sub-category per item code; brand is always MIDEA per instruction.
  const productMap = new Map<string, TransformedProduct>();
  const productLastNonBlankSubCat = new Map<string, string>();
  for (const row of sorted) {
    if (row.subCategory && row.subCategory.trim() !== "") {
      productLastNonBlankSubCat.set(row.itemCode, row.subCategory.trim());
    }
  }
  for (const row of sorted) {
    productMap.set(row.itemCode, {
      code: row.itemCode,
      brand: "MIDEA",
      category: row.category,
      subCategory: productLastNonBlankSubCat.get(row.itemCode) ?? "Uncategorized",
      model: row.itemName,
      capacityKw: computeCapacityKw(row.category, row.itemName),
    });
  }

  // Users: every distinct salesman resolved against the roster.
  const userMap = new Map<string, TransformedUser>();
  for (const row of kept) {
    const key = normalizeSalesmanName(row.salesman);
    if (userMap.has(key)) continue;
    const roster = lookupRosterEntry(row.salesman);
    if (roster?.active) {
      userMap.set(key, {
        key,
        name: roster.displayName ?? titleCase(roster.name),
        email: roster.email!,
        isActive: true,
        title: roster.title ?? "Sales Manager",
      });
    } else {
      userMap.set(key, {
        key,
        name: row.salesman.trim().replace(/\s+/g, " "),
        email: placeholderEmail(row.salesman),
        isActive: false,
        title: roster ? `Former ${roster.division} Staff` : "Historical Record",
      });
    }
  }

  // Deals: one per transaction (Txn No), summing line item values.
  const dealGroups = new Map<number, RawSalesRow[]>();
  for (const row of kept) {
    const group = dealGroups.get(row.txnNo);
    if (group) group.push(row);
    else dealGroups.set(row.txnNo, [row]);
  }
  const deals: TransformedDeal[] = [];
  for (const [txnNo, group] of dealGroups) {
    const value = group.reduce((sum, r) => sum + r.netAmt, 0);
    // A transaction that's a pure return/credit note, or a partial return
    // that wipes out its own order's value, doesn't become a Won deal - but
    // its rows still feed the line items below either way, so the product
    // quantities/values they affected are still netted correctly.
    if (!(value > 0)) continue;
    const first = group[0];
    deals.push({
      txnNo,
      title: `${first.custName} — Order #${txnNo}`,
      value,
      closedAt: first.docDate,
      custName: first.custName,
      ownerKey: normalizeSalesmanName(first.salesman),
    });
  }

  // Deliberately no Pricelist entries here - current dealer pricing only ever
  // comes from a Stock & Price List upload or a manually-added price, never
  // from historical sales, so the average rate a product sold at in the past
  // can't leak in as "the current price."

  // Line items: one per kept row (including returns/credit notes, with their
  // true negative qty/value), preserving product-level detail (category,
  // month, value) that gets lost once summed into Deal.value. A row whose
  // transaction didn't become a Deal still gets a line item here, just with
  // no dealId - see the sales-register import action.
  //
  // sourceKey identifies "the Nth row for this Txn No + Item Code" rather
  // than a row's raw position in the whole file - a position-based key
  // shifts for every row once ANY earlier row in the file is filtered
  // differently (e.g. this fix itself, which stopped filtering out returns),
  // so re-uploading the same file could silently create duplicate line
  // items instead of being recognized as already-imported.
  const pairOccurrence = new Map<string, number>();
  const lineItems: TransformedLineItem[] = kept.map((row) => {
    const pairKey = `${row.txnNo}::${row.itemCode}`;
    const occurrence = pairOccurrence.get(pairKey) ?? 0;
    pairOccurrence.set(pairKey, occurrence + 1);
    return {
      sourceKey: `${row.txnNo}-${row.itemCode}-${occurrence}`,
      itemCode: row.itemCode,
      txnNo: row.txnNo,
      docDate: row.docDate,
      month: firstOfMonth(row.docDate),
      qty: row.qty,
      value: row.netAmt,
      ownerKey: normalizeSalesmanName(row.salesman),
    };
  });

  // Exchange rate: the sheet's rate is normally constant across a month's
  // rows, so average whatever's there per month (rows with no rate recorded
  // read as 0 and are excluded) rather than requiring it be entered by hand
  // elsewhere.
  const rateGroups = new Map<string, { month: Date; total: number; count: number }>();
  for (const row of kept) {
    if (!(row.exchangeRate > 0)) continue;
    const key = monthKey(row.docDate);
    const existing = rateGroups.get(key);
    if (existing) {
      existing.total += row.exchangeRate;
      existing.count += 1;
    } else {
      rateGroups.set(key, { month: firstOfMonth(row.docDate), total: row.exchangeRate, count: 1 });
    }
  }
  const exchangeRates: TransformedExchangeRate[] = Array.from(rateGroups.values()).map((g) => ({
    month: g.month,
    rate: g.total / g.count,
  }));

  return {
    accounts: Array.from(accountMap.values()),
    products: Array.from(productMap.values()),
    users: Array.from(userMap.values()),
    deals,
    lineItems,
    exchangeRates,
    summary: {
      totalRowsIn,
      excludedServiceRows: excludedService.length,
      creditNoteRowsNetted: creditNoteRows.length,
      keptRows: kept.length,
    },
  };
}
