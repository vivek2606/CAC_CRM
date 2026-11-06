import { prisma } from "@/lib/prisma";
import { OPEN_DEAL_STAGES } from "@/lib/constants";

// Forecast vs actual. At the start of each month (the first time the CRM
// runs that month - the morning cron, or a visit to Targets) each sales
// person's forecast is saved: their open deals expected to close by the end
// of the month (overdue ones too), the value weighted by winning probability.
// Afterwards: how much of those same deals was won in the month. Won ÷
// forecast shows who over-forecasts (well under 100%, month after month)
// and who sandbags (well over). Kept in AppSetting "forecast-snapshots".

const KEY = "forecast-snapshots";
const KEEP_MONTHS = 24;

type Snap = { weighted: number; value: number; ids: string[] };
type MonthSnap = { takenAt: string; byUser: Record<string, Snap> };
type Store = Record<string, MonthSnap>; // "YYYY-MM"

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

async function load(): Promise<Store> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return (row?.value as Store | undefined) ?? {};
}

// Saves this month's forecast if it isn't saved yet. Cheap to call often.
export async function ensureForecastSnapshot(now = new Date()): Promise<void> {
  const key = monthKey(now);
  const store = await load();
  if (store[key]) return;
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const deals = await prisma.deal.findMany({
    where: { stage: { in: OPEN_DEAL_STAGES }, isBalance: false, expectedCloseDate: { lt: monthEnd } },
    select: { id: true, ownerId: true, value: true, probability: true },
  });
  const byUser: Record<string, Snap> = {};
  for (const d of deals) {
    const s = (byUser[d.ownerId] ??= { weighted: 0, value: 0, ids: [] });
    s.weighted += (d.value * (d.probability ?? 0)) / 100;
    s.value += d.value;
    s.ids.push(d.id);
  }
  for (const s of Object.values(byUser)) {
    s.weighted = Math.round(s.weighted * 100) / 100;
    s.value = Math.round(s.value * 100) / 100;
  }
  store[key] = { takenAt: now.toISOString(), byUser };
  // Keep the last KEEP_MONTHS months.
  for (const k of Object.keys(store).sort().slice(0, -KEEP_MONTHS)) delete store[k];
  const value = JSON.parse(JSON.stringify(store));
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export type AccuracyCell = { month: string; forecast: number; won: number; pct: number | null; takenAt: string; current: boolean };
export type AccuracyRow = { userId: string; name: string; cells: AccuracyCell[]; avgPct: number | null };

// The last `months` months that have a forecast saved, per sales person.
export async function getForecastAccuracy(reps: { id: string; name: string }[], months = 6, now = new Date()): Promise<{ months: string[]; rows: AccuracyRow[] }> {
  const store = await load();
  const keys = Object.keys(store).sort().slice(-months);
  const allIds = [...new Set(keys.flatMap((k) => Object.values(store[k].byUser).flatMap((s) => s.ids)))];
  const won = allIds.length
    ? await prisma.deal.findMany({ where: { id: { in: allIds }, stage: "WON" }, select: { id: true, value: true, closedAt: true } })
    : [];
  const wonById = new Map(won.map((d) => [d.id, d]));
  const current = monthKey(now);
  const rows = reps.map((r) => {
    const cells = keys.map((k) => {
      const snap = store[k].byUser[r.id];
      const forecast = snap?.weighted ?? 0;
      const wonValue = (snap?.ids ?? []).reduce((t, id) => {
        const d = wonById.get(id);
        return d?.closedAt && monthKey(d.closedAt) === k ? t + d.value : t;
      }, 0);
      return { month: k, forecast, won: Math.round(wonValue * 100) / 100, pct: forecast > 0 ? Math.round((wonValue / forecast) * 100) : null, takenAt: store[k].takenAt, current: k === current };
    });
    // Average over finished months only.
    const done = cells.filter((c) => !c.current && c.pct != null);
    return { userId: r.id, name: r.name, cells, avgPct: done.length ? Math.round(done.reduce((s, c) => s + c.pct!, 0) / done.length) : null };
  });
  return { months: keys, rows };
}
