import { readQuoteShareToken, savedQuotePdf } from "@/lib/quote-share";

// A quotation's PDF opened from the link sent to the customer (no login).
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readQuoteShareToken(token);
  const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (!id) return text("This link has expired - please ask us for a fresh copy of the quotation.", 404);
  const res = await savedQuotePdf(id);
  if ("error" in res) return text(res.error, 404);
  return new Response(new Uint8Array(res.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${res.filename}"`, "Cache-Control": "private, no-store" },
  });
}
