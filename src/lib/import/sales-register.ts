import { lookupRosterEntry, normalizeSalesmanName } from "./roster";

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
export type TransformedPricelistEntry = {
  itemCode: string;
  month: Date;
  dealerPrice: number;
  exchangeRate: number;
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

export type TransformResult = {
  accounts: TransformedAccount[];
  products: TransformedProduct[];
  users: TransformedUser[];
  deals: TransformedDeal[];
  pricelistEntries: TransformedPricelistEntry[];
  lineItems: TransformedLineItem[];
  summary: {
    totalRowsIn: number;
    excludedServiceRows: number;
    excludedReturnRows: number;
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
  const remaining = rows.filter((r) => r.category !== "Project & Service");
  const excludedReturns = remaining.filter((r) => !(r.netAmt > 0));
  const kept = remaining.filter((r) => r.netAmt > 0);

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
        name: titleCase(roster.name),
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

  // Pricelist: one entry per product per month, qty-weighted average dealer price.
  const priceGroups = new Map<string, { itemCode: string; month: Date; totalAmt: number; totalQty: number; exchangeRate: number }>();
  for (const row of kept) {
    const key = `${row.itemCode}::${monthKey(row.docDate)}`;
    const existing = priceGroups.get(key);
    if (existing) {
      existing.totalAmt += row.netAmt;
      existing.totalQty += row.qty;
    } else {
      priceGroups.set(key, {
        itemCode: row.itemCode,
        month: firstOfMonth(row.docDate),
        totalAmt: row.netAmt,
        totalQty: row.qty,
        exchangeRate: row.exchangeRate,
      });
    }
  }
  const pricelistEntries: TransformedPricelistEntry[] = Array.from(priceGroups.values()).map((g) => ({
    itemCode: g.itemCode,
    month: g.month,
    dealerPrice: g.totalQty > 0 ? g.totalAmt / g.totalQty : 0,
    exchangeRate: g.exchangeRate,
  }));

  // Line items: one per kept row, preserving product-level detail (category,
  // month, value) that gets lost once summed into Deal.value.
  const lineItems: TransformedLineItem[] = kept.map((row, idx) => ({
    sourceKey: `${row.txnNo}-${row.itemCode}-${idx}`,
    itemCode: row.itemCode,
    txnNo: row.txnNo,
    docDate: row.docDate,
    month: firstOfMonth(row.docDate),
    qty: row.qty,
    value: row.netAmt,
    ownerKey: normalizeSalesmanName(row.salesman),
  }));

  return {
    accounts: Array.from(accountMap.values()),
    products: Array.from(productMap.values()),
    users: Array.from(userMap.values()),
    deals,
    pricelistEntries,
    lineItems,
    summary: {
      totalRowsIn,
      excludedServiceRows: excludedService.length,
      excludedReturnRows: excludedReturns.length,
      keptRows: kept.length,
    },
  };
}
