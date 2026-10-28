"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser, type SessionUser } from "@/lib/rbac";
import { canSeeQuotation, DRAFT_TYPE } from "@/lib/saved-quotes";
import { quoteSendProblem, quoteShareUrl, savedQuotePdf } from "@/lib/quote-share";
import { waNumber } from "@/lib/whatsapp";
import { FOLLOW_UP_DAYS } from "@/lib/quote-followups";

// Sending a saved quotation to the customer from the CRM - by WhatsApp
// (a message with a link to its PDF) or email (the PDF attached, through
// Resend when it's set up; otherwise the person's own mail app with the
// link) - logged as an activity on the deal, and its follow-up reminder
// started.

const day = 86400000;
const TYPE_LABEL: Record<string, string> = { quote: "quotation", proforma: "proforma invoice", boq: "bill of quantity" };

export type SendInfo = {
  error?: string;
  ref?: string;
  link?: string;
  phones?: string[];
  emails?: string[];
  subject?: string;
  message?: string;
  // Email goes out from the CRM with the PDF attached (RESEND_API_KEY and
  // QUOTE_EMAIL_FROM set); otherwise through the person's mail app.
  canEmail?: boolean;
};

// quoteId: the saved quotation's id, or its reference no. (from the builder).
async function loadQuote(user: SessionUser, quoteId: string) {
  const q = await prisma.quotation.findFirst({
    where: { OR: [{ id: quoteId }, { ref: quoteId }] },
    include: {
      deal: {
        select: {
          ownerId: true,
          customerPhone: true,
          accountId: true,
          contactRoles: { select: { contact: { select: { phone: true, email: true } } } },
          account: { select: { phone: true, contacts: { select: { phone: true, email: true }, take: 10 } } },
        },
      },
      owner: { select: { name: true, phone: true } },
    },
  });
  if (!q || !canSeeQuotation(user, q) || q.type === DRAFT_TYPE) return null;
  return q;
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function prepareQuoteSend(quoteId: string): Promise<SendInfo> {
  const user = await requireUser();
  const q = await loadQuote(user, quoteId);
  if (!q) return { error: "Quotation not found." };
  const problem = await quoteSendProblem(q.id);
  if (problem) return { error: problem };

  // The customer's numbers / emails on file: the deal's, its contacts', its account's.
  const accountId = q.deal?.accountId ?? ((q.data as { accountId?: string } | null)?.accountId || null);
  const account =
    q.deal?.account ??
    (accountId ? await prisma.account.findUnique({ where: { id: accountId }, select: { phone: true, contacts: { select: { phone: true, email: true }, take: 10 } } }) : null);
  const contacts = [...(q.deal?.contactRoles.map((r) => r.contact) ?? []), ...(account?.contacts ?? [])];
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x))];
  const phones = uniq([q.deal?.customerPhone, ...contacts.map((c) => c.phone), account?.phone]).filter((p) => waNumber(p));
  const emails = uniq(contacts.map((c) => c.email)).filter((e) => /@/.test(e));

  const kind = TYPE_LABEL[q.type] ?? "quotation";
  const link = quoteShareUrl(q.id, await origin());
  const message = `Dear ${q.customerName},\n\nPlease find our ${kind} ${q.ref} here:\n${link}\n\nDo let me know if you have any questions.\n\nRegards,\n${q.owner.name}${q.owner.phone ? `\n${q.owner.phone}` : ""}`;
  return {
    ref: q.ref,
    link,
    phones,
    emails,
    subject: `${kind[0].toUpperCase()}${kind.slice(1)} ${q.ref}`,
    message,
    canEmail: !!(process.env.RESEND_API_KEY && process.env.QUOTE_EMAIL_FROM),
  };
}

// Logged on the deal (or its account) as done; the quotation counts as sent
// from now (a re-send counts as a follow-up), with its reminder in 7 days.
async function logSent(user: SessionUser, q: NonNullable<Awaited<ReturnType<typeof loadQuote>>>, channel: "WHATSAPP" | "EMAIL", to: string, note?: string) {
  const now = new Date();
  await prisma.activity.create({
    data: {
      type: channel === "EMAIL" ? "EMAIL" : "NOTE",
      subject: `Quotation ${q.ref} sent by ${channel === "EMAIL" ? "email" : "WhatsApp"}${to ? ` to ${to}` : ""}`.slice(0, 200),
      description: note?.slice(0, 2000) || null,
      status: "COMPLETED",
      completedAt: now,
      ownerId: user.id,
      dealId: q.dealId,
      accountId: q.deal?.accountId ?? ((q.data as { accountId?: string } | null)?.accountId || null),
    },
  });
  await prisma.quotation.update({
    where: { id: q.id },
    data: {
      ...(q.sentAt ? { lastFollowUpAt: now } : { sentAt: now }),
      nextFollowUpAt: q.nextFollowUpAt && q.nextFollowUpAt > now ? q.nextFollowUpAt : new Date(now.getTime() + FOLLOW_UP_DAYS * day),
    },
  });
  // No revalidatePath: it would re-render the page under the open send
  // dialog (and drop the quote from a follow-up list, dialog and all) -
  // the dialog refreshes the page when it's closed.
}

// WhatsApp opens on the person's phone / computer; this records it.
export async function logQuoteSent(quoteId: string, channel: "WHATSAPP" | "EMAIL", to: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const q = await loadQuote(user, quoteId);
  if (!q) return { error: "Quotation not found." };
  await logSent(user, q, channel, to.trim().slice(0, 120));
  return {};
}

// Email with the PDF attached, from the CRM (Resend).
export async function emailQuote(quoteId: string, to: string, subject: string, message: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const q = await loadQuote(user, quoteId);
  if (!q) return { error: "Quotation not found." };
  const key = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_EMAIL_FROM;
  if (!key || !from) return { error: "Email from the CRM isn't set up - use your mail app." };
  const recipients = to
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  if (!recipients.length || recipients.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return { error: "Enter the customer's email address." };
  const pdf = await savedQuotePdf(q.id);
  if ("error" in pdf) return { error: pdf.error };
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true, name: true } });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: recipients.slice(0, 5),
      ...(me?.email ? { reply_to: me.email, cc: [me.email] } : {}),
      subject: subject.trim().slice(0, 200) || `Quotation ${q.ref}`,
      text: message.slice(0, 10000),
      attachments: [{ filename: pdf.filename, content: pdf.pdf.toString("base64") }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Resend", res.status, body);
    return { error: `The email couldn't be sent (${res.status}) - try again or use your mail app.` };
  }
  await logSent(user, q, "EMAIL", recipients.join(", "), `Subject: ${subject}`);
  return {};
}
