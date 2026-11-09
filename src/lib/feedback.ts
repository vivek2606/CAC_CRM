import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Customer feedback after delivery (supply only) or commissioning (when we
// install): a link the customer opens without logging in - a 1-5 rating and
// a comment. One request per order; a rating of 1-2 alerts the Head and the
// sales person.

export type FeedbackKind = "DELIVERY" | "INSTALLATION";
export { FEEDBACK_KIND_LABEL, LOW_RATING, RATING_LABEL } from "@/lib/feedback-labels";

// What the order is ready for feedback on: installation once commissioned;
// delivery once delivered, when we're not installing it.
export function feedbackKindFor(deal: { deliveredAt: Date | null; installationJob: { status: string } | null }): FeedbackKind | null {
  const job = deal.installationJob;
  if (job && job.status !== "CANCELLED") return job.status === "COMMISSIONED" ? "INSTALLATION" : null;
  return deal.deliveredAt ? "DELIVERY" : null;
}

export const newFeedbackToken = () => randomBytes(18).toString("base64url");

export function feedbackMessage(o: { customer: string; company: string; kind: string; url: string; from: string }) {
  const what = o.kind === "INSTALLATION" ? "the installation of your equipment" : "the delivery of your order";
  return `Dear ${o.customer || "Customer"},\n\nThank you for choosing ${o.company}. How did we do with ${what}? Please take a moment to rate us - it takes less than a minute:\n${o.url}\n\nThank you,\n${o.from}`;
}

// Won orders delivered / commissioned in the last 30 days with no feedback
// asked for yet.
export async function feedbackToAsk(ownerIds: string[] | null, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86400000);
  const deals = await prisma.deal.findMany({
    where: {
      ...(ownerIds ? { ownerId: { in: ownerIds } } : {}),
      stage: "WON",
      feedback: { none: {} },
      OR: [{ deliveredAt: { gte: since } }, { installationJob: { status: "COMMISSIONED", commissionedAt: { gte: since } } }],
    },
    select: { id: true, title: true, deliveredAt: true, customerName: true, account: { select: { name: true } }, owner: { select: { name: true } }, installationJob: { select: { status: true } } },
    take: 100,
  });
  return deals.filter((d) => feedbackKindFor(d));
}
