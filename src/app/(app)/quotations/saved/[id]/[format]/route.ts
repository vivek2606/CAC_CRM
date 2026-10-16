import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { buildDocument, documentFilename, documentInputSchema } from "@/lib/sales-document";
import { renderSalesDocumentPdf } from "@/lib/pdf/sales-document-pdf";
import { buildSalesDocumentXlsx } from "@/lib/sales-document-xlsx";
import { canSeeQuotation, DRAFT_TYPE } from "@/lib/saved-quotes";
import { coveredByApproval, excessDiscounts } from "@/lib/quote-discount";

// Download a saved quotation again, rebuilt from what was saved.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const user = await requireUser();
  const { id, format } = await params;
  if (format !== "pdf" && format !== "xlsx") return new Response("Not found", { status: 404 });
  const q = await prisma.quotation.findUnique({ where: { id }, include: { deal: { select: { ownerId: true } } } });
  if (!q || !canSeeQuotation(user, q)) return new Response("Not found", { status: 404 });
  if (q.type === DRAFT_TYPE) return new Response("This is a draft - open it in the Quotations builder and download it there.", { status: 400 });
  const parsed = documentInputSchema.safeParse(q.data);
  if (!parsed.success) return new Response("This saved quotation can't be read.", { status: 500 });
  const doc = await buildDocument(parsed.data);
  // A discount over an item's maximum downloads only once the Head approved it.
  if (user.role !== "HEAD") {
    const excess = await excessDiscounts(doc);
    if (excess.length && !(q.discountStatus === "approved" && coveredByApproval(excess, q.discountApproved))) {
      const why = q.discountStatus === "rejected" ? "was declined by the Head of Sales - revise it with the discount within the limit" : "is below the permissible discount - only the Head of Sales can prepare it (it has been sent to them)";
      return new Response(`Quotation ${q.ref}: the discount (${excess.map((l) => l.description).join("; ")}) ${why}.`, {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }
  if (format === "pdf") {
    const pdf = await renderSalesDocumentPdf(doc);
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${documentFilename(doc, "pdf")}"` },
    });
  }
  const buffer = await buildSalesDocumentXlsx(doc);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${documentFilename(doc, "xlsx")}"`,
    },
  });
}
