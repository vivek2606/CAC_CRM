import { prisma } from "@/lib/prisma";
import {
  ACCOUNT_TYPE_LABELS,
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  CALL_OUTCOME_LABELS,
  DEAL_STAGE_LABELS,
  END_USE_SEGMENT_LABELS,
  EQUIPMENT_TYPE_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LOST_REASON_LABELS,
  PAYMENT_TERMS_LABELS,
  PURCHASE_TIMEFRAME_LABELS,
} from "@/lib/constants";
import type { Rec, TargetRec } from "@/components/chart-studio/engine";

// The records behind the Team Reports chart studio, one flat record each
// (labels applied, dates as YYYY-MM-DD, 0/1 flags to count). Deals, leads
// and activities of the last few years (and every open deal); all accounts.

const YEARS = 4;
const DAY = 86400000;
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const flag = (b: boolean) => (b ? 1 : 0);
const sizeBand = (v: number) =>
  v <= 0 ? "No value" : v < 5e6 ? "Under ₦5M" : v < 20e6 ? "₦5M - 20M" : v < 50e6 ? "₦20M - 50M" : v < 100e6 ? "₦50M - 100M" : "₦100M and over";

export type TeamStudioData = { deals: Rec[]; leads: Rec[]; activities: Rec[]; accounts: Rec[]; targets: TargetRec[] };

export async function getTeamStudioData(now = new Date()): Promise<TeamStudioData> {
  const since = new Date(Date.UTC(now.getUTCFullYear() - YEARS, 0, 1));
  const today = day(now)!;
  const [deals, leads, activities, accounts, targets] = await Promise.all([
    prisma.deal.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { closedAt: { gte: since } }, { stage: { notIn: ["WON", "LOST"] } }] },
      select: {
        id: true,
        title: true,
        stage: true,
        value: true,
        probability: true,
        createdAt: true,
        expectedCloseDate: true,
        closedAt: true,
        equipmentType: true,
        endUseSegment: true,
        competitorBrand: true,
        customerName: true,
        lostReasonCategory: true,
        lostToBrand: true,
        billingCompany: true,
        paymentTerms: true,
        sourceTxnNo: true,
        owner: { select: { name: true } },
        account: { select: { name: true, code: true } },
      },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: since } },
      select: {
        status: true,
        source: true,
        company: true,
        customerName: true,
        title: true,
        equipmentType: true,
        endUseSegment: true,
        competitorBrand: true,
        expectedPurchaseTimeframe: true,
        budgetConfirmed: true,
        value: true,
        createdAt: true,
        convertedDealId: true,
        owner: { select: { name: true } },
      },
    }),
    prisma.activity.findMany({
      where: { createdAt: { gte: since } },
      select: { type: true, status: true, callOutcome: true, createdAt: true, dueAt: true, completedAt: true, leadId: true, dealId: true, accountId: true, contactId: true, owner: { select: { name: true } } },
    }),
    prisma.account.findMany({
      select: {
        name: true,
        code: true,
        accountType: true,
        city: true,
        state: true,
        industry: true,
        createdAt: true,
        owner: { select: { name: true } },
        deals: { select: { stage: true, value: true, closedAt: true } },
      },
    }),
    prisma.target.findMany({ where: { month: { gte: since } }, select: { month: true, targetValue: true, user: { select: { name: true } } } }),
  ]);
  // A deal's lead source, from the lead it was converted from.
  const sourceOf = new Map(
    (await prisma.lead.findMany({ where: { convertedDealId: { not: null } }, select: { convertedDealId: true, source: true } })).map((l) => [l.convertedDealId!, LEAD_SOURCE_LABELS[l.source]]),
  );

  const dealRecs: Rec[] = deals.map((d) => {
    const won = d.stage === "WON";
    const lost = d.stage === "LOST";
    const open = !won && !lost;
    const closed = (won || lost) && d.closedAt;
    return {
      stage: DEAL_STAGE_LABELS[d.stage],
      status: won ? "Won" : lost ? "Lost" : "Open",
      owner: d.owner.name,
      account: d.account?.name ?? d.customerName ?? d.title,
      accountCode: d.account?.code ?? "",
      source: sourceOf.get(d.id) ?? (d.sourceTxnNo ? "Sales Register import" : "Direct (no lead)"),
      origin: d.sourceTxnNo ? "Sales Register import" : "CRM",
      equipment: d.equipmentType ? EQUIPMENT_TYPE_LABELS[d.equipmentType] : "",
      segment: d.endUseSegment ? END_USE_SEGMENT_LABELS[d.endUseSegment] : "",
      competitor: d.competitorBrand ?? "",
      lostReason: lost ? (d.lostReasonCategory ? LOST_REASON_LABELS[d.lostReasonCategory] : "Not given") : "",
      lostTo: lost ? (d.lostToBrand ?? "") : "",
      entity: d.billingCompany ?? "Not recorded",
      paymentTerms: d.paymentTerms ? PAYMENT_TERMS_LABELS[d.paymentTerms] : "",
      size: sizeBand(d.value),
      createdAt: day(d.createdAt),
      expectedClose: day(d.expectedCloseDate),
      closedAt: day(d.closedAt),
      value: d.value,
      open: flag(open),
      openValue: open ? d.value : 0,
      weighted: open ? (d.value * d.probability) / 100 : 0,
      won: flag(won),
      wonValue: won ? d.value : 0,
      lost: flag(lost),
      lostValue: lost ? d.value : 0,
      closed: flag(!!closed && !d.sourceTxnNo),
      cycleDays: closed && !d.sourceTxnNo ? Math.max(0, Math.round((d.closedAt!.getTime() - d.createdAt.getTime()) / DAY)) : 0,
      overdue: flag(open && !!d.expectedCloseDate && day(d.expectedCloseDate)! < today),
    };
  });
  const leadRecs: Rec[] = leads.map((l) => ({
    status: LEAD_STATUS_LABELS[l.status],
    source: LEAD_SOURCE_LABELS[l.source],
    owner: l.owner.name,
    company: l.company ?? l.customerName ?? l.title,
    converted: l.convertedDealId ? "Yes" : "No",
    equipment: l.equipmentType ? EQUIPMENT_TYPE_LABELS[l.equipmentType] : "",
    segment: l.endUseSegment ? END_USE_SEGMENT_LABELS[l.endUseSegment] : "",
    competitor: l.competitorBrand ?? "",
    timeframe: l.expectedPurchaseTimeframe ? PURCHASE_TIMEFRAME_LABELS[l.expectedPurchaseTimeframe] : "",
    budget: l.budgetConfirmed == null ? "Not asked" : l.budgetConfirmed ? "Yes" : "No",
    createdAt: day(l.createdAt),
    convertedN: flag(!!l.convertedDealId),
    value: l.value ?? 0,
    hasValue: flag(!!l.value),
  }));
  const activityRecs: Rec[] = activities.map((a) => ({
    type: ACTIVITY_TYPE_LABELS[a.type],
    status: ACTIVITY_STATUS_LABELS[a.status],
    outcome: a.callOutcome ? CALL_OUTCOME_LABELS[a.callOutcome] : a.type === "CALL" ? "Not logged" : "",
    owner: a.owner.name,
    relatedTo: a.dealId ? "Deal" : a.leadId ? "Lead" : a.accountId ? "Account" : a.contactId ? "Contact" : "Nothing",
    createdAt: day(a.createdAt),
    dueAt: day(a.dueAt),
    completedAt: day(a.completedAt),
    done: flag(a.status === "COMPLETED"),
    overdue: flag(a.status === "PENDING" && !!a.dueAt && a.dueAt < now),
    call: flag(a.type === "CALL"),
    meeting: flag(a.type === "MEETING"),
    callLogged: flag(a.type === "CALL" && !!a.callOutcome),
    connected: flag(a.callOutcome === "CONNECTED"),
  }));
  const accountRecs: Rec[] = accounts.map((a) => {
    const won = a.deals.filter((d) => d.stage === "WON");
    const lastWon = won.reduce<Date | null>((m, d) => (d.closedAt && (!m || d.closedAt > m) ? d.closedAt : m), null);
    return {
      name: a.name,
      type: a.accountType ? ACCOUNT_TYPE_LABELS[a.accountType] : "",
      owner: a.owner.name,
      city: a.city ?? "",
      state: a.state ?? "",
      industry: a.industry ?? "",
      hasCode: a.code ? "Yes" : "No",
      buyer: won.length ? "Yes" : "No",
      createdAt: day(a.createdAt),
      lastWon: day(lastWon),
      wonValue: won.reduce((s, d) => s + d.value, 0),
      won: won.length,
      openValue: a.deals.filter((d) => d.stage !== "WON" && d.stage !== "LOST").reduce((s, d) => s + d.value, 0),
    };
  });
  const q = (m: string) => `${m.slice(0, 4)}-Q${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`;
  const targetRecs: TargetRec[] = targets.map((t) => {
    const m = t.month.toISOString().slice(0, 7);
    return { value: t.targetValue, dims: { owner: t.user.name, "closedAt:month": m, "closedAt:quarter": q(m), "closedAt:year": m.slice(0, 4) } };
  });
  return { deals: dealRecs, leads: leadRecs, activities: activityRecs, accounts: accountRecs, targets: targetRecs };
}
