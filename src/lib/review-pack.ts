import { prisma } from "@/lib/prisma";
import { getTeamReport, type RepScore } from "@/lib/team-report";
import { getProjectBillings } from "@/lib/project-billing";
import { getForecastAccuracy } from "@/lib/forecast-accuracy";
import { getSla, slaCompliance } from "@/lib/service-sla";
import { serviceMetrics } from "@/lib/service";
import { withLineUnits } from "@/lib/installed-base";
import { SALES_TITLE_IN } from "@/lib/team-titles";
import { LOST_REASON_LABELS } from "@/lib/constants";
import type { LostReason } from "@prisma/client";

// The monthly review pack: one month, for the division or one sales person
// - sales vs target (month, year to date, same month last year), each
// person's figures, wins and losses, the lead funnel, activities, forecast
// accuracy and (division) service. Shown as a printable page and an Excel
// workbook (review-pack-xlsx.ts).

export type ReviewPack = {
  month: string; // YYYY-MM
  monthLabel: string;
  scope: { kind: "division" } | { kind: "rep"; id: string; name: string };
  summary: { target: number; achieved: number; pct: number | null; ytdTarget: number; ytdAchieved: number; ytdPct: number | null; lastYear: number; vsLastYearPct: number | null };
  people: (RepScore & { quotes: number; visits: number; whatsapp: number })[];
  won: { title: string; customer: string; owner: string; value: number; date: string }[];
  lost: { title: string; customer: string; owner: string; value: number; reason: string; brand: string; gapPct: number | null }[];
  funnel: { leads: number; deals: number; quoted: number; won: number };
  forecast: { forecast: number; won: number; pct: number | null } | null;
  service: { registered: number; resolved: number; slaResolvePct: number | null; firstTimeFixPct: number | null; installsCommissioned: number; billed: number } | null;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export async function getReviewPack(month: string, repId: string | null): Promise<ReviewPack> {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const lyStart = new Date(Date.UTC(y - 1, m - 1, 1));
  const lyEnd = new Date(Date.UTC(y - 1, m, 1));
  const monthLabel = start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const reps = await prisma.user.findMany({ where: { isActive: true, title: SALES_TITLE_IN }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const repName = repId ? ((await prisma.user.findUnique({ where: { id: repId }, select: { name: true } }))?.name ?? "") : "";
  const ids = repId ? [repId] : reps.map((r) => r.id);
  const scopeIds = { in: ids };

  const [report, ytdReport, lyDeals, lyProjects, quotes, acts, wonDeals, lostDeals, leads, accuracy] = await Promise.all([
    getTeamReport(start, start, new Date(end.getTime() - 1)),
    getTeamReport(yearStart, start, new Date(end.getTime() - 1)),
    prisma.deal.findMany({ where: { ownerId: scopeIds, stage: "WON", closedAt: { gte: lyStart, lt: lyEnd } }, select: { value: true } }),
    getProjectBillings(scopeIds, lyStart, lyEnd),
    prisma.quotation.groupBy({ by: ["ownerId"], where: { ownerId: scopeIds, type: { not: "draft" }, createdAt: { gte: start, lt: end } }, _count: true }),
    prisma.activity.groupBy({ by: ["ownerId", "type"], where: { ownerId: scopeIds, status: "COMPLETED", completedAt: { gte: start, lt: end }, type: { in: ["SITE_VISIT", "WHATSAPP"] } }, _count: true }),
    prisma.deal.findMany({
      where: { ownerId: scopeIds, stage: "WON", closedAt: { gte: start, lt: end } },
      orderBy: { value: "desc" },
      select: { title: true, value: true, closedAt: true, customerName: true, account: { select: { name: true } }, owner: { select: { name: true } } },
    }),
    prisma.deal.findMany({
      where: { ownerId: scopeIds, stage: "LOST", closedAt: { gte: start, lt: end } },
      orderBy: { value: "desc" },
      select: { title: true, value: true, customerName: true, lostReasonCategory: true, lostToBrand: true, lostToPrice: true, account: { select: { name: true } }, owner: { select: { name: true } } },
    }),
    prisma.lead.findMany({
      where: { ownerId: scopeIds, createdAt: { gte: start, lt: end } },
      select: { convertedDeal: { select: { stage: true, _count: { select: { quotations: { where: { type: { not: "draft" } } } } } } } },
    }),
    getForecastAccuracy(repId ? [{ id: repId, name: repName }] : reps, 24, end),
  ]);

  const pick = (r: { reps: RepScore[]; team: RepScore }) => (repId ? (r.reps.find((x) => x.id === repId) ?? null) : r.team);
  const mo = pick(report);
  const ytd = pick(ytdReport);
  const lastYear = lyDeals.reduce((s, d) => s + d.value, 0) + lyProjects.reduce((s, p) => s + p.value, 0);
  const achieved = mo?.achieved ?? 0;
  const count = (ownerId: string, type: string) => acts.find((a) => a.ownerId === ownerId && a.type === type)?._count ?? 0;
  const people = report.reps
    .filter((r) => ids.includes(r.id))
    .map((r) => ({ ...r, quotes: quotes.find((q) => q.ownerId === r.id)?._count ?? 0, visits: count(r.id, "SITE_VISIT"), whatsapp: count(r.id, "WHATSAPP") }));

  // Forecast accuracy for the month (saved on the 1st, if it was).
  const cells = accuracy.rows.map((row) => row.cells.find((c) => c.month === month)).filter((c): c is NonNullable<typeof c> => !!c);
  const fForecast = cells.reduce((s, c) => s + c.forecast, 0);
  const fWon = cells.reduce((s, c) => s + c.won, 0);

  const deals = leads.filter((l) => l.convertedDeal);
  const funnel = {
    leads: leads.length,
    deals: deals.length,
    quoted: deals.filter((l) => l.convertedDeal!._count.quotations > 0 || l.convertedDeal!.stage === "WON").length,
    won: deals.filter((l) => l.convertedDeal!.stage === "WON").length,
  };

  // Service, for the division.
  let service: ReviewPack["service"] = null;
  if (!repId) {
    const sla = await getSla();
    const [complaints, installs] = await Promise.all([
      prisma.serviceComplaint.findMany({
        where: { registeredAt: { gte: start, lt: end } },
        select: {
          registeredAt: true, status: true, priority: true, assignedAt: true, inWarranty: true, attendedAt: true, resolvedAt: true, visits: true, feedback: true,
          serviceCharge: true, technician: true, nature: true, model: true, serialNo: true, dealId: true,
          parts: { select: { qty: true, unitCost: true, unitPrice: true, chargeable: true } },
        },
      }),
      prisma.installationJob.count({ where: { status: "COMMISSIONED", commissionedAt: { gte: start, lt: end } } }),
    ]);
    const sm = serviceMetrics(await withLineUnits(complaints), end);
    service = {
      registered: sm.total,
      resolved: sm.resolved,
      slaResolvePct: slaCompliance(complaints, sla, end).resolve.pct,
      firstTimeFixPct: sm.firstTimeFixPct == null ? null : Math.round(sm.firstTimeFixPct),
      installsCommissioned: installs,
      billed: sm.billed,
    };
  }

  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  return {
    month,
    monthLabel,
    scope: repId ? { kind: "rep", id: repId, name: repName } : { kind: "division" },
    summary: {
      target: mo?.target ?? 0,
      achieved,
      pct: pct(achieved, mo?.target ?? 0),
      ytdTarget: ytd?.target ?? 0,
      ytdAchieved: ytd?.achieved ?? 0,
      ytdPct: pct(ytd?.achieved ?? 0, ytd?.target ?? 0),
      lastYear,
      vsLastYearPct: lastYear > 0 ? Math.round(((achieved - lastYear) / lastYear) * 100) : null,
    },
    people,
    won: wonDeals.map((d) => ({ title: d.title, customer: d.account?.name ?? d.customerName ?? "", owner: d.owner.name, value: d.value, date: day(d.closedAt) })),
    lost: lostDeals.map((d) => ({
      title: d.title,
      customer: d.account?.name ?? d.customerName ?? "",
      owner: d.owner.name,
      value: d.value,
      reason: d.lostReasonCategory ? LOST_REASON_LABELS[d.lostReasonCategory as LostReason] : "Not recorded",
      brand: d.lostToBrand ?? "",
      gapPct: d.lostToPrice && d.lostToPrice > 0 && d.value > 0 ? Math.round(((d.value - d.lostToPrice) / d.lostToPrice) * 100) : null,
    })),
    funnel,
    forecast: cells.length ? { forecast: fForecast, won: fWon, pct: pct(fWon, fForecast) } : null,
    service,
  };
}
