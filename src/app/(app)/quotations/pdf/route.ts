import { renderSalesDocumentPdf } from "@/lib/pdf/sales-document-pdf";
import { documentFilename } from "@/lib/sales-document";
import { documentFromRequest } from "../document-request";

export async function POST(request: Request) {
  const result = await documentFromRequest(request);
  if ("error" in result) return result.error;
  const pdf = await renderSalesDocumentPdf(result.doc);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${documentFilename(result.doc, "pdf")}"`,
    },
  });
}
