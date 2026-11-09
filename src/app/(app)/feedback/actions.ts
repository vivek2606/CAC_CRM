"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";
import { feedbackKindFor, feedbackMessage, newFeedbackToken } from "@/lib/feedback";
import { getCompanySettings, pickCompany } from "@/lib/company-profile";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// The feedback link for a delivered / commissioned order (made once, reused
// until answered) and the WhatsApp message to send it with. Logged as a
// WhatsApp activity on the deal.
export async function prepareFeedbackRequest(dealId: string): Promise<{ error?: string; url?: string; message?: string; phone?: string }> {
  const user = await requireUser();
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true, ownerId: true, stage: true, deliveredAt: true, billingCompany: true, customerName: true, customerPhone: true,
      account: { select: { name: true, phone: true } },
      contact: { select: { firstName: true, lastName: true, phone: true } },
      installationJob: { select: { status: true } },
      feedback: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!deal || !canAccessOwner(user, deal.ownerId)) return { error: "Deal not found." };
  const kind = feedbackKindFor(deal);
  if (deal.stage !== "WON" || !kind) return { error: "Ask for feedback once the order is delivered (or, when we install, commissioned)." };
  const last = deal.feedback[0];
  if (last?.respondedAt) return { error: "The customer has already given feedback on this order." };
  const fb = last && last.kind === kind ? last : await prisma.customerFeedback.create({ data: { token: newFeedbackToken(), dealId, kind, createdById: user.id } });
  const url = `${(await origin()).replace(/\/$/, "")}/share/feedback/${fb.token}`;
  const settings = await getCompanySettings();
  const company = pickCompany(settings, deal.billingCompany?.toUpperCase() ?? undefined).name;
  const customer = deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}`.trim() : (deal.account?.name ?? deal.customerName ?? "");
  const phone = deal.contact?.phone ?? deal.customerPhone ?? deal.account?.phone ?? "";
  await prisma.activity.create({
    data: { type: "WHATSAPP", subject: "Feedback request sent", status: "COMPLETED", completedAt: new Date(), ownerId: deal.ownerId, dealId },
  });
  revalidatePath(`/deals/${dealId}`);
  return { url, phone, message: feedbackMessage({ customer, company, kind, url, from: user.name ?? company }) };
}
