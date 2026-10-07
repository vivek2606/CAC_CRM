import { buildSalesDocumentXlsx } from "@/lib/sales-document-xlsx";
import { documentFilename } from "@/lib/sales-document";
import { documentFromRequest } from "../document-request";

export async function POST(request: Request) {
  const result = await documentFromRequest(request);
  if ("error" in result) return result.error;
  const buffer = await buildSalesDocumentXlsx(result.doc);
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${documentFilename(result.doc, "xlsx")}"`,
    },
  });
}
