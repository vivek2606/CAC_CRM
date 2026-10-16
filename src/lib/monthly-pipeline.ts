import { prisma } from "@/lib/prisma";

// Per sales person, per month: open deals (at the month's end - or now, for
// the current month), deals converted from a lead in the month, and deals
// won in the month (by closing / invoice date).

export type PipelineCell = {
  open: number;
  openValue: number;
  converted: number;
  won: number;
  wonValue: number;
  // CRM deals closed in the month (for win rate): won and lost.
  wonCrm: number;
  lost: number;
};
export type MonthlyPipeline = {
  months: Date[]; // first-of-month, oldest first
  people: { id: string; name: string }[];
  cells: Map<string, PipelineCell>; // `${personId}|${monthIndex}`
};

const OPEN = new Set(["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION"]);
export const monthsBetween = (from: Date, to: Date): Date[] => {
  const out: Date[] = [];
  for (let d = new Date(from); d <= to && out.length < 36; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) out.push(d);
  return out;
};

export async function getMonthlyPipeline(people: { id: string; name: string }[], months: Date[], now = new Date()): Promise<MonthlyPipeline> {
  const cells = new Map<string, PipelineCell>();
  if (!people.length || !months.length) return { months, people, cells };
  const last = months[months.length - 1];
  const rangeEnd = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
  const deals = await prisma.deal.findMany({
    where: { ownerId: { in: people.map((p) => p.id) }, createdAt: { lt: rangeEnd } },
    select: { ownerId: true, stage: true, value: true, createdAt: true, closedAt: true, sourceTxnNo: true, sourceLead: { select: { id: true } } },
  });
  const thisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  months.forEach((m, i) => {
    const start = m.getTime();
    const end = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1);
    const current = start === thisMonth;
    for (const p of people) cells.set(`${p.id}|${i}`, { open: 0, openValue: 0, converted: 0, won: 0, wonValue: 0, wonCrm: 0, lost: 0 });
    for (const d of deals) {
      const c = cells.get(`${d.ownerId}|${i}`);
      if (!c) continue;
      const created = d.createdAt.getTime();
      // Open: now (current month), or at the month's end - created by then
      // and not closed by then. Register imports are sales, never open.
      if (d.sourceTxnNo == null && created < end) {
        const isOpen = current
          ? OPEN.has(d.stage)
          : OPEN.has(d.stage)
            ? true
            : d.closedAt != null && d.closedAt.getTime() >= end;
        if (isOpen) {
          c.open++;
          c.openValue += d.value;
        }
      }
      if (d.sourceLead && created >= start && created < end) c.converted++;
      const closedIn = d.closedAt != null && d.closedAt.getTime() >= start && d.closedAt.getTime() < end;
      if (d.stage === "WON" && closedIn) {
        if (d.value > 0) c.won++;
        c.wonValue += d.value;
        if (d.sourceTxnNo == null) c.wonCrm++;
      }
      if (d.stage === "LOST" && closedIn && d.sourceTxnNo == null) c.lost++;
    }
  });
  return { months, people, cells };
}
