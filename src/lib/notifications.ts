import { prisma } from "@/lib/prisma";
import { getQuoteFollowUps, FOLLOW_UP_RED_DAYS } from "@/lib/quote-followups";
import { isBackOffice, visibleOwnerIds, type SessionUser } from "@/lib/rbac";
import { computeDealDiscount } from "@/lib/discount";
import { getAvailableStockByProduct, getLatestPriceByProduct } from "@/lib/pricing";
import { getIncentiveApproval } from "@/lib/incentive-approval";
import { canUseService } from "@/lib/service-access";
import { RENEWAL_NOTICE_DAYS } from "@/lib/amc";
import { claimableWhere } from "@/lib/warranty-claims";
import { getSla, slaSummary, STAGE_LABEL } from "@/lib/service-sla";
import { awaitingHandoverWhere } from "@/lib/installation";
import { getGoneQuiet } from "@/lib/win-back";
import { STALE_DAYS, lastContact, stalledWhere } from "@/lib/stalled";

export type NotificationItem = { label: string; sub?: string; href: string };
export type NotificationGroup = { key: string; label: string; count: number; href: string; items: NotificationItem[] };
// pushKey: the server's public push key when phone / desktop notifications
// are set up (added by the route).
export type Notifications = { total: number; groups: NotificationGroup[]; pushKey?: string | null };

// An open deal in the same stage this long: move it on, or close it.
const STUCK_DAYS = 30;
const SHOW = 5;
const day = 86400000;
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// What needs attention now, for the bell in the top bar: your tasks due,
// your deals gone quiet or past their expected close, won deals missing an
// invoice no.; for the Head, discounts and incentives waiting on approval;
// for the Sales Coordinator, incentives the Head has approved. The Head and
// Coordinator see the team's deal reminders.
export async function getNotifications(user: SessionUser): Promise<Notifications> {
  const team = isBackOffice(user);
  const own = team ? {} : { ownerId: user.id };
  const now = new Date();
  const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const groups: NotificationGroup[] = [];
  const who = (name: string) => (team ? ` · ${name}` : "");

  const stuckBefore = new Date(now.getTime() - STUCK_DAYS * day);
  const [tasks, pastClose, quiet, noInvoice, followUps, stuck] = await Promise.all([
    prisma.activity.findMany({
      where: { ownerId: user.id, status: "PENDING", dueAt: { lt: endOfToday } },
      orderBy: { dueAt: "asc" },
      select: { id: true, subject: true, dueAt: true, dealId: true, leadId: true },
      take: 50,
    }),
    prisma.deal.findMany({
      where: { ...own, isBalance: false, stage: { notIn: ["WON", "LOST"] }, expectedCloseDate: { lt: new Date(endOfToday.getTime() - day) } },
      orderBy: { expectedCloseDate: "asc" },
      select: { id: true, title: true, expectedCloseDate: true, owner: { select: { name: true } } },
      take: 200,
    }),
    // Stalled: no real contact for STALE_DAYS (stalled.ts) - not the last edit.
    prisma.deal.findMany({
      where: { ...own, ...stalledWhere(now) },
      select: {
        id: true,
        title: true,
        createdAt: true,
        owner: { select: { name: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, completedAt: true } },
      },
      take: 200,
    }),
    prisma.deal.findMany({
      where: { ...own, stage: "WON", sourceTxnNo: null, invoiceNo: null },
      select: { id: true, title: true, owner: { select: { name: true } } },
      take: 200,
    }),
    // Quotations sent and not converted, due a follow-up (quote-followups.ts).
    getQuoteFollowUps(team ? null : [user.id], { now }),
    // Same stage for 30+ days (deals from before the stage date was kept:
    // since they were created).
    prisma.deal.findMany({
      where: {
        ...own,
        // A balance order waits on stock - its own reminder below.
        isBalance: false,
        stage: { notIn: ["WON", "LOST"] },
        OR: [{ stageChangedAt: { lt: stuckBefore } }, { stageChangedAt: null, createdAt: { lt: stuckBefore } }],
      },
      orderBy: [{ stageChangedAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, stage: true, stageChangedAt: true, createdAt: true, owner: { select: { name: true } } },
      take: 200,
    }),
  ]);

  if (tasks.length) {
    const overdue = tasks.filter((t) => t.dueAt! < new Date(endOfToday.getTime() - day)).length;
    groups.push({
      key: "tasks",
      label: `Tasks due today${overdue ? ` (${overdue} overdue)` : ""}`,
      count: tasks.length,
      href: "/leads?tab=activities",
      items: tasks.slice(0, SHOW).map((t) => ({
        label: t.subject,
        sub: `Due ${fmt(t.dueAt!)}`,
        href: t.dealId ? `/deals/${t.dealId}` : t.leadId ? `/leads/${t.leadId}` : "/leads?tab=activities",
      })),
    });
  }
  if (pastClose.length) {
    groups.push({
      key: "pastClose",
      label: "Deals past their expected close date",
      count: pastClose.length,
      href: "/deals",
      items: pastClose.slice(0, SHOW).map((d) => ({ label: d.title, sub: `Expected ${fmt(d.expectedCloseDate!)}${who(d.owner.name)}`, href: `/deals/${d.id}` })),
    });
  }
  if (quiet.length) {
    const byLast = quiet.map((d) => ({ d, last: lastContact(d) })).sort((a, b) => a.last.getTime() - b.last.getTime());
    groups.push({
      key: "quiet",
      label: `Deals with no customer contact for ${STALE_DAYS}+ days`,
      count: quiet.length,
      href: "/deals",
      items: byLast.slice(0, SHOW).map(({ d, last }) => ({
        label: d.title,
        sub: `${d.activities.length ? `Last contact ${fmt(last)}` : `No contact logged since ${fmt(d.createdAt)}`}${who(d.owner.name)}`,
        href: `/deals/${d.id}`,
      })),
    });
  }
  if (followUps.length) {
    const red = followUps.filter((q) => q.level === "red").length;
    groups.push({
      key: "quoteFollowUp",
      label: `Quotations due a follow-up${red ? ` (${red} over ${FOLLOW_UP_RED_DAYS} days)` : ""}`,
      count: followUps.length,
      href: "/quotations/follow-ups",
      items: followUps.slice(0, SHOW).map((q) => ({
        label: q.dealTitle ?? q.customerName,
        sub: `${q.ref} sent ${fmt(q.sentOn)} · ${q.ageDays} days${who(q.ownerName)}`,
        href: "/quotations/follow-ups",
      })),
    });
  }
  // Prices changed since an open quotation went out - revise before re-sending.
  const repriced = followUps.filter((q) => q.priceChanges.length);
  if (repriced.length) {
    groups.push({
      key: "quotePrices",
      label: `Prices changed on ${repriced.length} open quotation${repriced.length === 1 ? "" : "s"}`,
      count: repriced.length,
      href: "/quotations/follow-ups",
      items: repriced.slice(0, SHOW).map((q) => {
        const c = q.priceChanges[0];
        const verb = c.upcoming ? (c.to > c.from ? "increases" : "drops") : c.to > c.from ? "increased" : "dropped";
        return { label: `${q.ref} - ${q.customerName}`, sub: `${c.description} ${verb} on ${fmt(c.on)}${q.priceChanges.length > 1 ? ` (+${q.priceChanges.length - 1} more)` : ""}${who(q.ownerName)}`, href: `/quotations?quote=${q.id}` };
      }),
    });
  }
  // Balance orders (part-billed, awaiting stock) whose products are now all
  // in stock: bill them.
  const balances = await prisma.deal.findMany({
    where: { ...own, isBalance: true, stage: { notIn: ["WON", "LOST"] } },
    select: { id: true, title: true, owner: { select: { name: true } }, items: { select: { productId: true, qty: true, product: { select: { model: true } } } } },
  });
  if (balances.length) {
    const stock = await getAvailableStockByProduct();
    const ready = balances.filter((b) => b.items.length && b.items.every((i) => (stock.get(i.productId) ?? 0) >= i.qty));
    if (ready.length) {
      groups.push({
        key: "balanceStock",
        label: "Stock arrived for balance orders - bill them",
        count: ready.length,
        href: `/deals/${ready[0].id}`,
        items: ready.slice(0, SHOW).map((b) => ({
          label: b.title,
          sub: `${b.items.map((i) => `${i.qty} × ${i.product.model}`).join(", ")} in stock${who(b.owner.name)}`,
          href: `/deals/${b.id}`,
        })),
      });
    }
  }
  if (stuck.length) {
    const stageLabel: Record<string, string> = { QUALIFICATION: "Qualification", NEEDS_ANALYSIS: "Needs Analysis", PROPOSAL: "Quotation", NEGOTIATION: "Negotiation" };
    groups.push({
      key: "stuck",
      label: `Deals in the same stage for ${STUCK_DAYS}+ days`,
      count: stuck.length,
      href: "/deals",
      items: stuck.slice(0, SHOW).map((d) => ({
        label: d.title,
        sub: `${stageLabel[d.stage] ?? d.stage} since ${fmt(d.stageChangedAt ?? d.createdAt)}${who(d.owner.name)}`,
        href: `/deals/${d.id}`,
      })),
    });
  }
  if (noInvoice.length) {
    groups.push({
      key: "invoice",
      label: "Won deals missing an invoice no.",
      count: noInvoice.length,
      href: "/reports/sales-register",
      items: noInvoice.slice(0, SHOW).map((d) => ({ label: d.title, sub: team ? d.owner.name : undefined, href: `/deals/${d.id}` })),
    });
  }

  // Won orders (entered in the CRM) not marked delivered a week on - within
  // the last 60 days, so old sales don't flood the bell.
  const undelivered = await prisma.deal.findMany({
    where: { ...own, stage: "WON", sourceTxnNo: null, deliveredAt: null, closedAt: { gte: new Date(now.getTime() - 60 * day), lt: new Date(now.getTime() - 7 * day) } },
    orderBy: { closedAt: "asc" },
    select: { id: true, title: true, closedAt: true, owner: { select: { name: true } } },
    take: 100,
  });
  if (undelivered.length)
    groups.push({
      key: "undelivered",
      label: "Won orders not marked delivered",
      count: undelivered.length,
      href: `/deals/${undelivered[0].id}`,
      items: undelivered.slice(0, SHOW).map((d) => ({ label: d.title, sub: `Won ${fmt(d.closedAt!)}${who(d.owner.name)}`, href: `/deals/${d.id}` })),
    });

  // Won supply + installation orders not handed over to service yet (the
  // Service Manager sees these on the Installations tab instead).
  const notHandedOver = await prisma.deal.findMany({
    where: { ...own, ...awaitingHandoverWhere(now) },
    orderBy: { closedAt: "desc" },
    select: { id: true, title: true, owner: { select: { name: true } } },
    take: 100,
  });
  if (notHandedOver.length) {
    groups.push({
      key: "handover",
      label: "Won with installation - hand over to service",
      count: notHandedOver.length,
      href: `/deals/${notHandedOver[0].id}`,
      items: notHandedOver.slice(0, SHOW).map((d) => ({ label: d.title, sub: team ? d.owner.name : undefined, href: `/deals/${d.id}` })),
    });
  }

  // Regular customers gone quiet (win-back.ts) - the account owner's, or the
  // team's for the Head / Coordinator.
  const quietCustomers = await getGoneQuiet(team ? await visibleOwnerIds(user) : [user.id], now);
  if (quietCustomers.length)
    groups.push({
      key: "goneQuiet",
      label: "Regular customers gone quiet - call them",
      count: quietCustomers.length,
      href: "/accounts?tab=winback",
      items: quietCustomers.slice(0, SHOW).map((c) => ({ label: c.name, sub: `No order for ${c.daysQuiet} days (usually every ${c.usualGapDays})${who(c.owner)}`, href: `/accounts/${c.accountId}` })),
    });

  if (user.role === "HEAD") {
    // Discounts beyond the threshold, not yet approved.
    const [open, prices] = await Promise.all([
      prisma.deal.findMany({
        where: { stage: { notIn: ["WON", "LOST"] }, discountApprovedAt: null, items: { some: {} } },
        select: { id: true, title: true, owner: { select: { name: true } }, items: { select: { qty: true, unitPrice: true, productId: true } } },
      }),
      getLatestPriceByProduct(),
    ]);
    const pending = open
      .map((d) => ({ d, disc: computeDealDiscount(d.items, prices, null) }))
      .filter((x) => x.disc?.needsApproval);
    if (pending.length) {
      groups.unshift({
        key: "discount",
        label: "Discounts waiting for your approval",
        count: pending.length,
        href: "/deals",
        items: pending.slice(0, SHOW).map(({ d, disc }) => ({ label: d.title, sub: `${disc!.discountPct.toFixed(1)}% below list · ${d.owner.name}`, href: `/deals/${d.id}` })),
      });
    }
  }

  // Quotation discounts over an item's maximum: the Head approves them;
  // whoever the quote is for / made it hears back for a week.
  if (user.role === "HEAD") {
    const held = await prisma.quotation.findMany({
      where: { discountStatus: "pending" },
      orderBy: { discountRequestedAt: "asc" },
      select: { id: true, ref: true, customerName: true, owner: { select: { name: true } } },
    });
    if (held.length) {
      groups.unshift({
        key: "quoteDiscount",
        label: "Quotes below permissible discount, sent to you",
        count: held.length,
        href: "/quotations/approvals",
        items: held.slice(0, SHOW).map((q) => ({ label: `${q.ref} - ${q.customerName}`, sub: q.owner.name, href: "/quotations/approvals" })),
      });
    }
  } else {
    const decidedQuotes = await prisma.quotation.findMany({
      where: { OR: [{ ownerId: user.id }, { createdById: user.id }], discountStatus: { in: ["approved", "rejected", "pending"] } },
      select: { id: true, ref: true, customerName: true, discountStatus: true, discountDecidedAt: true },
      take: 50,
    });
    const recent = decidedQuotes.filter((q) => q.discountStatus === "pending" || (q.discountDecidedAt && now.getTime() - q.discountDecidedAt.getTime() < 7 * day));
    if (recent.length) {
      groups.push({
        key: "quoteDiscount",
        label: "Quotation discounts",
        count: recent.length,
        href: "/quotations/saved",
        items: recent.slice(0, SHOW).map((q) => ({
          label: `${q.ref} - ${q.customerName}`,
          sub: q.discountStatus === "approved" ? "Approved by the Head - download it from Saved quotations" : q.discountStatus === "rejected" ? "Declined - bring the discount within the limit" : "Sent to the Head of Sales",
          href: q.discountStatus === "approved" ? "/quotations/saved" : `/quotations?quote=${q.id}`,
        })),
      });
    }
  }

  // Data health (Head / Coordinator): won sales with details missing, the
  // same invoice recorded twice, register lines with no deal - the clean-up
  // jobs on the Data health page.
  if (team) {
    const [incomplete, orphans, crmInvoices] = await Promise.all([
      prisma.deal.count({
        where: { stage: "WON", sourceTxnNo: null, OR: [{ accountId: null }, { billingCompany: null }, { invoiceNo: null }, { items: { none: {} } }] },
      }),
      prisma.saleLineItem.count({ where: { dealId: null } }),
      prisma.deal.findMany({
        where: { stage: "WON", sourceTxnNo: null, invoiceNo: { not: null } },
        select: { id: true, invoiceNo: true, billingCompany: true, value: true },
      }),
    ]);
    // A CRM invoice also on another won sale (same number, type and company - or company not recorded).
    const nos = [...new Set(crmInvoices.map((d) => d.invoiceNo!.trim()))];
    const others = nos.length
      ? await prisma.deal.findMany({
          where: {
            stage: "WON",
            OR: [{ invoiceNo: { in: nos, mode: "insensitive" } }, { sourceTxnNo: { in: nos.filter((n) => /^\d+$/.test(n)).map(Number) } }],
          },
          select: { id: true, invoiceNo: true, sourceTxnNo: true, billingCompany: true, value: true },
        })
      : [];
    const duplicates = crmInvoices.filter((d) =>
      others.some(
        (o) =>
          o.id !== d.id &&
          ((o.invoiceNo ?? "").trim().toLowerCase() === d.invoiceNo!.trim().toLowerCase() || String(o.sourceTxnNo ?? "") === d.invoiceNo!.trim()) &&
          o.value < 0 === d.value < 0 &&
          (!o.billingCompany || !d.billingCompany || o.billingCompany === d.billingCompany),
      ),
    ).length;
    const items: NotificationItem[] = [];
    if (duplicates) items.push({ label: `${duplicates} sale${duplicates === 1 ? "" : "s"} with an invoice recorded twice`, sub: "Counted twice - fix first", href: "/admin/data-health#dup" });
    if (incomplete) items.push({ label: `${incomplete} won sale${incomplete === 1 ? "" : "s"} with details missing`, sub: "Account, company, invoice no. or products", href: "/admin/data-health#won" });
    if (orphans) items.push({ label: `${orphans} Sales Register line${orphans === 1 ? "" : "s"} with no deal`, href: "/admin/data-health#orphan" });
    if (items.length) {
      const group = { key: "dataHealth", label: "Data health - to fix", count: duplicates + incomplete + orphans, href: "/admin/data-health", items };
      // The Coordinator's main job list: first in her bell and morning push.
      if (user.role === "COORDINATOR") groups.unshift(group);
      else groups.push(group);
    }
  }

  // Service (Head, Coordinator, Service Manager): AMC visits overdue or due
  // this week, AMC renewals in the next 30 days, and warranties ending in 30
  // days with no AMC - the AMCs to offer.
  if (await canUseService(user)) {
    const week = new Date(now.getTime() + 7 * day);
    // Complaints against their service levels (service-sla.ts): breached
    // and at risk now, and resolved ones waiting to be closed.
    const sla = await getSla();
    const [open, toClose] = await Promise.all([
      prisma.serviceComplaint.findMany({
        where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "AWAITING_SPARES"] } },
        orderBy: { registeredAt: "asc" },
        select: { id: true, ref: true, customerName: true, nature: true, registeredAt: true, priority: true, status: true, assignedAt: true, attendedAt: true, resolvedAt: true },
        take: 500,
      }),
      prisma.serviceComplaint.findMany({
        where: { status: "RESOLVED", resolvedAt: { lt: new Date(now.getTime() - sla.closeDays * day) } },
        select: { id: true, ref: true, customerName: true, resolvedAt: true },
        take: 200,
      }),
    ]);
    // Installations: handed over and not scheduled; past their date.
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const installs = await prisma.installationJob.findMany({
      where: { OR: [{ status: "PENDING" }, { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, scheduledDate: { lt: startOfToday } }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, ref: true, customerName: true, status: true, scheduledDate: true, preferredDate: true, createdAt: true },
      take: 200,
    });
    const toSchedule = installs.filter((j) => j.status === "PENDING");
    const lateInstalls = installs.filter((j) => j.status !== "PENDING");
    if (toSchedule.length)
      groups.push({
        key: "installSchedule",
        label: "Installations to schedule",
        count: toSchedule.length,
        href: "/service/installations?status=PENDING",
        items: toSchedule.slice(0, SHOW).map((j) => ({
          label: `${j.ref} - ${j.customerName}`,
          sub: j.preferredDate ? `Customer prefers ${fmt(j.preferredDate)}` : `Handed over ${fmt(j.createdAt)}`,
          href: `/service/installations/${j.id}`,
        })),
      });
    if (lateInstalls.length)
      groups.push({
        key: "installLate",
        label: "Installations past their date - commission or reschedule",
        count: lateInstalls.length,
        href: "/service/installations",
        items: lateInstalls.slice(0, SHOW).map((j) => ({ label: `${j.ref} - ${j.customerName}`, sub: `Scheduled ${fmt(j.scheduledDate!)}`, href: `/service/installations/${j.id}` })),
      });

    const withSla = open.map((c) => ({ c, s: slaSummary(c, sla, now) }));
    const breached = withSla.filter((x) => x.s.state === "breached");
    const atRisk = withSla.filter((x) => x.s.state === "at_risk");
    const slaItem = ({ c, s: x }: (typeof withSla)[number]) => ({
      label: `${c.ref} - ${c.customerName}${c.priority === "URGENT" ? " (URGENT)" : ""}`,
      sub: `${STAGE_LABEL[x.stage!]} ${x.state === "breached" ? "overdue since" : "due"} ${x.due!.toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      href: `/service/${c.id}`,
    });
    if (breached.length)
      groups.unshift({ key: "slaBreached", label: "Complaints past their service level", count: breached.length, href: "/service?sla=breached", items: breached.slice(0, SHOW).map(slaItem) });
    if (atRisk.length)
      groups.push({ key: "slaRisk", label: "Complaints at risk of missing their service level", count: atRisk.length, href: "/service?sla=at_risk", items: atRisk.slice(0, SHOW).map(slaItem) });
    if (toClose.length)
      groups.push({
        key: "complaintClose",
        label: `Resolved complaints to close (over ${sla.closeDays} days)`,
        count: toClose.length,
        href: "/service?status=RESOLVED",
        items: toClose.slice(0, SHOW).map((c) => ({ label: `${c.ref} - ${c.customerName}`, sub: `Resolved ${fmt(c.resolvedAt!)}`, href: `/service/${c.id}` })),
      });
    // Warranty claims: resolved complaints with spares given free a week ago
    // and no claim; claims sent 30+ days ago with no decision; approved ones
    // not credited after 30 days.
    const month = new Date(now.getTime() - 30 * day);
    const [unclaimed, claimsWaiting] = await Promise.all([
      prisma.serviceComplaint.findMany({
        where: { ...claimableWhere, warrantyClaim: null, resolvedAt: { lt: new Date(now.getTime() - 7 * day) } },
        select: { id: true, ref: true, customerName: true },
        take: 200,
      }),
      prisma.warrantyClaim.findMany({
        where: { OR: [{ status: "SUBMITTED", submittedAt: { lt: month } }, { status: "APPROVED", decidedAt: { lt: month } }] },
        select: { id: true, ref: true, status: true, submittedAt: true, decidedAt: true, complaint: { select: { customerName: true } } },
        take: 200,
      }),
    ]);
    if (unclaimed.length)
      groups.push({
        key: "claimsToRaise",
        label: "Spares given free - raise the warranty claim",
        count: unclaimed.length,
        href: "/service/claims",
        items: unclaimed.slice(0, SHOW).map((c) => ({ label: `${c.ref} - ${c.customerName}`, href: `/service/${c.id}` })),
      });
    if (claimsWaiting.length)
      groups.push({
        key: "claimsWaiting",
        label: "Warranty claims to chase with the manufacturer",
        count: claimsWaiting.length,
        href: "/service/claims",
        items: claimsWaiting.slice(0, SHOW).map((c) => ({
          label: `${c.ref} - ${c.complaint.customerName}`,
          sub: c.status === "SUBMITTED" ? `No decision since ${fmt(c.submittedAt!)}` : `Approved ${fmt(c.decidedAt!)}, not credited`,
          href: `/service/claims/${c.id}`,
        })),
      });
    const [visits, renewals, ending] = await Promise.all([
      prisma.amcVisit.findMany({
        where: { doneAt: null, dueDate: { lte: week }, contract: { cancelled: false, endDate: { gte: new Date(now.getTime() - day) } } },
        orderBy: { dueDate: "asc" },
        select: { dueDate: true, contract: { select: { id: true, ref: true, customerName: true } } },
        take: 200,
      }),
      prisma.amcContract.findMany({
        where: { cancelled: false, endDate: { gte: now, lte: new Date(now.getTime() + RENEWAL_NOTICE_DAYS * day) }, NOT: { id: { in: (await prisma.amcContract.findMany({ where: { renewedFromId: { not: null } }, select: { renewedFromId: true } })).map((r) => r.renewedFromId!) } } },
        orderBy: { endDate: "asc" },
        select: { id: true, ref: true, customerName: true, endDate: true, value: true },
      }),
      prisma.installedUnit.findMany({
        where: { amcId: null, warrantyUntil: { gte: now, lte: new Date(now.getTime() + 30 * day) } },
        orderBy: { warrantyUntil: "asc" },
        select: { id: true, customerName: true, model: true, qty: true, warrantyUntil: true },
        take: 200,
      }),
    ]);
    if (visits.length) {
      const overdue = visits.filter((v) => v.dueDate < now).length;
      groups.push({
        key: "amcVisits",
        label: `AMC service visits due${overdue ? ` (${overdue} overdue)` : ""}`,
        count: visits.length,
        href: "/service/amc",
        items: visits.slice(0, SHOW).map((v) => ({ label: `${v.contract.ref} - ${v.contract.customerName}`, sub: `Due ${fmt(v.dueDate)}`, href: `/service/amc/${v.contract.id}` })),
      });
    }
    if (renewals.length) {
      groups.push({
        key: "amcRenewals",
        label: "AMCs to renew (ending in 30 days)",
        count: renewals.length,
        href: "/service/amc?status=RENEWAL_DUE",
        items: renewals.slice(0, SHOW).map((c) => ({ label: `${c.ref} - ${c.customerName}`, sub: `Ends ${fmt(c.endDate)}`, href: `/service/amc/${c.id}` })),
      });
    }
    if (ending.length) {
      groups.push({
        key: "warrantyEnding",
        label: "Warranties ending in 30 days - offer an AMC",
        count: ending.length,
        href: "/service/units?w=ending",
        items: ending.slice(0, SHOW).map((u) => ({ label: u.customerName, sub: `${u.qty} × ${u.model} · warranty ends ${fmt(u.warrantyUntil!)}`, href: `/service/amc/new?unit=${u.id}` })),
      });
    }
  }

  // Incentives: the last three months.
  if (team) {
    const months = [1, 2, 3].map((i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
    const approvals = await Promise.all(months.map((m) => getIncentiveApproval(m)));
    const items: NotificationItem[] = [];
    months.forEach((m, i) => {
      const a = approvals[i];
      const label = m.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
      const href = `/incentives?month=${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
      if (user.role === "HEAD" && a?.status === "SUBMITTED") items.push({ label: `${label} incentives`, sub: `Submitted by ${a.submittedBy?.name ?? "the coordinator"} - waiting for you`, href });
      if (user.role === "COORDINATOR" && a?.status === "APPROVED" && a.approvedAt && now.getTime() - new Date(a.approvedAt).getTime() < 7 * day)
        items.push({ label: `${label} incentives approved`, sub: "Statement ready to download for finance", href });
      if (user.role === "COORDINATOR" && a?.status === "RETURNED") items.push({ label: `${label} incentives returned`, sub: a.note ? `Note: ${a.note}` : "Returned by the Head", href });
    });
    if (items.length) groups.unshift({ key: "incentives", label: "Incentives", count: items.length, href: "/incentives", items });
  }

  return { total: groups.reduce((t, g) => t + g.count, 0), groups };
}
