import { prisma } from "@/lib/prisma";

export type WinBackRow = {
  accountId: string;
  name: string;
  code: string | null;
  owner: string;
  lastSoldBy: string;
  lastPurchase: string; // YYYY-MM-DD
  monthsSince: number;
  orders: number;
  value24m: number;
  lifetimeValue: number;
  lastProducts: string;
};

// Shared one-time cash / service / retail customer accounts aren't one
// customer to win back.
const POOLED = /cash\s*customer|one\s*time|service\s*customer|retail/i;

// Customers whose last purchase (product lines from the Sales Register and
// deals won in the CRM) was before `cutoff`, with what they bought last.
export async function getWinBackList(ownerIds: string[], cutoff: Date): Promise<WinBackRow[]> {
  const rows = await prisma.$queryRaw<
    {
      accountId: string;
      name: string;
      code: string | null;
      owner: string;
      lastPurchase: Date;
      orders: bigint;
      value24m: number | null;
      lifetimeValue: number | null;
      lastProducts: string | null;
      lastSoldBy: string | null;
    }[]
  >`
    WITH lines AS (
      SELECT d."accountId", s."docDate", s.value, s."dealId", s."ownerId", p.model
      FROM "SaleLineItem" s
      JOIN "Deal" d ON d.id = s."dealId"
      JOIN "Product" p ON p.id = s."productId"
      WHERE d."accountId" IS NOT NULL
    ),
    agg AS (
      SELECT "accountId",
             MAX("docDate") AS "lastPurchase",
             COUNT(DISTINCT "dealId") AS orders,
             SUM(CASE WHEN "docDate" >= NOW() - INTERVAL '24 months' THEN value ELSE 0 END) AS "value24m",
             SUM(value) AS "lifetimeValue"
      FROM lines GROUP BY "accountId"
    ),
    last AS (
      SELECT l."accountId",
             STRING_AGG(DISTINCT l.model, ', ') AS "lastProducts",
             MAX(u.name) AS "lastSoldBy"
      FROM lines l
      JOIN agg a ON a."accountId" = l."accountId" AND a."lastPurchase" = l."docDate"
      JOIN "User" u ON u.id = l."ownerId"
      GROUP BY l."accountId"
    )
    SELECT acc.id AS "accountId", acc.name, acc.code, ow.name AS owner,
           agg."lastPurchase", agg.orders, agg."value24m", agg."lifetimeValue",
           last."lastProducts", last."lastSoldBy"
    FROM agg
    JOIN "Account" acc ON acc.id = agg."accountId"
    JOIN "User" ow ON ow.id = acc."ownerId"
    LEFT JOIN last ON last."accountId" = agg."accountId"
    WHERE agg."lastPurchase" < ${cutoff}
      AND acc."ownerId" = ANY(${ownerIds})
      AND agg."lifetimeValue" > 0
  `;
  const now = Date.now();
  return rows
    .filter((r) => !POOLED.test(r.name))
    .map((r) => ({
      accountId: r.accountId,
      name: r.name,
      code: r.code,
      owner: r.owner,
      lastSoldBy: r.lastSoldBy ?? r.owner,
      lastPurchase: r.lastPurchase.toISOString().slice(0, 10),
      monthsSince: Math.floor((now - r.lastPurchase.getTime()) / (30.44 * 86400000)),
      orders: Number(r.orders),
      value24m: Math.round((r.value24m ?? 0) * 100) / 100,
      lifetimeValue: Math.round((r.lifetimeValue ?? 0) * 100) / 100,
      lastProducts: r.lastProducts ?? "",
    }))
    .sort((a, b) => b.lifetimeValue - a.lifetimeValue);
}
