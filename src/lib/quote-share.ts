import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildDocument, documentFilename, documentInputSchema } from "@/lib/sales-document";
import { renderSalesDocumentPdf } from "@/lib/pdf/sales-document-pdf";
import { coveredByApproval, excessDiscounts } from "@/lib/quote-discount";
import { DRAFT_TYPE } from "@/lib/quote-draft";

// A link to a saved quotation's PDF the customer can open without logging
// in (sent by WhatsApp / email): the quotation's id and an expiry, signed
// with the app's secret so it can't be guessed or altered.

const LINK_DAYS = 60;
const day = 86400000;

function sign(payload: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return createHmac("sha256", secret).update(`quote-share:${payload}`).digest("base64url").slice(0, 32);
}

export function quoteShareToken(quoteId: string, now = Date.now()): string {
  const payload = `${quoteId}.${Math.floor((now + LINK_DAYS * day) / 1000).toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

// The quotation id, or null when the token is altered or expired.
export function readQuoteShareToken(token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const want = sign(`${id}.${exp}`);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  if (parseInt(exp, 36) * 1000 < now) return null;
  return id;
}

export function quoteShareUrl(quoteId: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/share/q/${quoteShareToken(quoteId)}`;
}

// The saved quotation's document - refused while a discount over an item's
// maximum waits on (or was declined by) the Head, as for a download.
async function savedQuoteDocument(quoteId: string) {
  const q = await prisma.quotation.findUnique({ where: { id: quoteId }, include: { createdBy: { select: { role: true } } } });
  if (!q || q.type === DRAFT_TYPE) return { error: "This quotation is no longer available." };
  const parsed = documentInputSchema.safeParse(q.data);
  if (!parsed.success) return { error: "This quotation can't be read." };
  const doc = await buildDocument(parsed.data);
  if (q.createdBy.role !== "HEAD") {
    const excess = await excessDiscounts(doc);
    if (excess.length && !(q.discountStatus === "approved" && coveredByApproval(excess, q.discountApproved)))
      return { error: `Quotation ${q.ref} is waiting on a discount approval - it can't be sent yet.` };
  }
  return { doc, ref: q.ref };
}
export async function quoteSendProblem(quoteId: string): Promise<string | null> {
  const res = await savedQuoteDocument(quoteId);
  return "error" in res ? (res.error ?? null) : null;
}
export async function savedQuotePdf(quoteId: string): Promise<{ pdf: Buffer; filename: string; ref: string } | { error: string }> {
  const res = await savedQuoteDocument(quoteId);
  if ("error" in res) return { error: res.error ?? "Not available." };
  const pdf = await renderSalesDocumentPdf(res.doc);
  return { pdf: Buffer.from(pdf), filename: documentFilename(res.doc, "pdf"), ref: res.ref };
}
