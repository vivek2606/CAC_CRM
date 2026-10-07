import { prisma } from "@/lib/prisma";
import { isBackOffice, type SessionUser } from "@/lib/rbac";
import { computeDealDiscount } from "@/lib/discount";
import { getLatestPriceByProduct } from "@/lib/pricing";
import { getIncentiveApproval } from "@/lib/incentive-approval";

export type NotificationItem = { label: string; sub?: string; href: string };
export type NotificationGroup = { key: string; label: string; count: number; href: string; items: NotificationItem[] };
export type Notifications = { total: number; groups: NotificationGroup[] };

const STALE_DAYS = 14;
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
  const staleBefore = new Date(now.getTime() - STALE_DAYS * day);
  const groups: NotificationGroup[] = [];
  const who = (name: string) => (team ? ` · ${name}` : "");

  const [tasks, pastClose, quiet, noInvoice] = await Promise.all([
    prisma.activity.findMany({
      where: { ownerId: user.id, status: "PENDING", dueAt: { lt: endOfToday } },
      orderBy: { dueAt: "asc" },
      select: { id: true, subject: true, dueAt: true, dealId: true, leadId: true },
      take: 50,
    }),
    prisma.deal.findMany({
      where: { ...own, stage: { notIn: ["WON", "LOST"] }, expectedCloseDate: { lt: new Date(endOfToday.getTime() - day) } },
      orderBy: { expectedCloseDate: "asc" },
      select: { id: true, title: true, expectedCloseDate: true, owner: { select: { name: true } } },
      take: 200,
    }),
    prisma.deal.findMany({
      where: {
        ...own,
        stage: { notIn: ["WON", "LOST"] },
        updatedAt: { lt: staleBefore },
        activities: { none: { createdAt: { gte: staleBefore } } },
      },
      orderBy: { updatedAt: "asc" },
      select: { id: true, title: true, updatedAt: true, owner: { select: { name: true } } },
      take: 200,
    }),
    prisma.deal.findMany({
      where: { ...own, stage: "WON", sourceTxnNo: null, invoiceNo: null },
      select: { id: true, title: true, owner: { select: { name: true } } },
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
    groups.push({
      key: "quiet",
      label: `Deals with no activity for ${STALE_DAYS}+ days`,
      count: quiet.length,
      href: "/deals",
      items: quiet.slice(0, SHOW).map((d) => ({ label: d.title, sub: `Last touched ${fmt(d.updatedAt)}${who(d.owner.name)}`, href: `/deals/${d.id}` })),
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
