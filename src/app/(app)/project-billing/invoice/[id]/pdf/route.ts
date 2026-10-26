import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { renderSalesDocumentPdf } from "@/lib/pdf/sales-document-pdf";
import { buildServiceInvoice, serviceInvoiceFilename, serviceInvoiceInputSchema } from "@/lib/service-invoice";
import { isServiceInvoiceDraft } from "@/lib/service-invoice-schema";

// Download a saved service / project invoice again, as saved.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireBackOffice();
  const { id } = await params;
  const row = await prisma.serviceInvoice.findUnique({ where: { id } });
  if (!row) return new Response("Not found", { status: 404 });
  if (isServiceInvoiceDraft(row.ref)) return new Response("This is a draft - open it and download it from the invoice form.", { status: 400 });
  const parsed = serviceInvoiceInputSchema.safeParse(row.data);
  if (!parsed.success) return new Response("This saved invoice can't be read.", { status: 500 });
  const doc = await buildServiceInvoice({ ...parsed.data, ref: row.ref });
  const pdf = await renderSalesDocumentPdf(doc);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${serviceInvoiceFilename(doc)}"` },
  });
}
