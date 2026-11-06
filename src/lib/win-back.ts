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

// "Gone quiet": regular customers who have stopped buying - an early
// warning, before they show on the win-back list. Regular = 2+ invoices in
// the last 15 months. Quiet = no purchase for 90+ days AND for more than
// twice their usual gap between orders (a once-a-year buyer isn't late
// after 3 months). Left out once someone is on it: an open deal, or a call /
// visit / any activity with them in the last 30 days.
export const QUIET_MIN_DAYS = 90;
export const QUIET_HANDLED_DAYS = 30;
const DAY = 86400000;

export type GoneQuietRow = {
  accountId: string;
  name: string;
  ownerId: string;
  owner: string;
  lastPurchase: string; // YYYY-MM-DD
  daysQuiet: number;
  usualGapDays: number;
  orders15m: number;
  value15m: number;
};

// Pure: is a customer with these invoice dates gone quiet at `now`?
export function quietCheck(dates: Date[], now: Date): { quiet: boolean; daysQuiet: number; usualGapDays: number } {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const daysQuiet = sorted.length ? Math.floor((now.getTime() - sorted[sorted.length - 1].getTime()) / DAY) : 0;
  const gaps = sorted.slice(1).map((d, i) => (d.getTime() - sorted[i].getTime()) / DAY).filter((g) => g >= 1);
  const usualGapDays = gaps.length ? Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) : 0;
  const quiet = sorted.length >= 2 && daysQuiet >= QUIET_MIN_DAYS && daysQuiet > 2 * usualGapDays && daysQuiet <= 365;
  return { quiet, daysQuiet, usualGapDays };
}

export async function getGoneQuiet(ownerIds: string[], now = new Date()): Promise<GoneQuietRow[]> {
  const since = new Date(now.getTime() - 456 * DAY); // ~15 months
  const invoices = await prisma.$queryRaw<{ accountId: string; dealId: string; date: Date; value: number }[]>`
    SELECT d."accountId", s."dealId", MIN(s."docDate") AS date, SUM(s.value) AS value
    FROM "SaleLineItem" s
    JOIN "Deal" d ON d.id = s."dealId"
    JOIN "Account" a ON a.id = d."accountId"
    WHERE s."docDate" >= ${since} AND a."ownerId" = ANY(${ownerIds})
    GROUP BY d."accountId", s."dealId"
  `;
  const byAccount = new Map<string, { date: Date; value: number }[]>();
  for (const i of invoices) byAccount.set(i.accountId, [...(byAccount.get(i.accountId) ?? []), { date: i.date, value: i.value }]);
  const candidates = [...byAccount.entries()]
    .map(([accountId, inv]) => ({ accountId, inv, ...quietCheck(inv.map((x) => x.date), now) }))
    .filter((c) => c.quiet);
  if (!candidates.length) return [];
  const ids = candidates.map((c) => c.accountId);
  const handledSince = new Date(now.getTime() - QUIET_HANDLED_DAYS * DAY);
  const [accounts, openDeals, recent] = await Promise.all([
    prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, ownerId: true, owner: { select: { name: true } } } }),
    prisma.deal.findMany({ where: { accountId: { in: ids }, stage: { notIn: ["WON", "LOST"] } }, select: { accountId: true } }),
    prisma.activity.findMany({
      where: { createdAt: { gte: handledSince }, OR: [{ accountId: { in: ids } }, { deal: { accountId: { in: ids } } }] },
      select: { accountId: true, deal: { select: { accountId: true } } },
    }),
  ]);
  const handled = new Set([...openDeals.map((d) => d.accountId), ...recent.map((a) => a.accountId ?? a.deal?.accountId)].filter(Boolean));
  const acc = new Map(accounts.map((a) => [a.id, a]));
  return candidates
    .filter((c) => !handled.has(c.accountId) && acc.has(c.accountId) && !POOLED.test(acc.get(c.accountId)!.name))
    .map((c) => {
      const a = acc.get(c.accountId)!;
      const last = c.inv.reduce((m, x) => (x.date > m ? x.date : m), c.inv[0].date);
      return {
        accountId: c.accountId,
        name: a.name,
        ownerId: a.ownerId,
        owner: a.owner.name,
        lastPurchase: last.toISOString().slice(0, 10),
        daysQuiet: c.daysQuiet,
        usualGapDays: c.usualGapDays,
        orders15m: c.inv.length,
        value15m: Math.round(c.inv.reduce((s, x) => s + x.value, 0) * 100) / 100,
      };
    })
    .sort((a, b) => b.value15m - a.value15m);
}
