import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner } from "@/lib/rbac";

// Sheet for uploading a deal's products (Mark Won, New / Edit Deal). Blank
// with examples, or - with ?deal=<id> - pre-filled with that deal's current
// products so they can be edited in Excel and uploaded back.
export async function GET(request: Request) {
  const user = await requireUser();
  const dealId = new URL(request.url).searchParams.get("deal");
  const deal = dealId
    ? await prisma.deal.findUnique({
        where: { id: dealId },
        select: {
          title: true,
          ownerId: true,
          items: { orderBy: { createdAt: "asc" }, select: { qty: true, unitPrice: true, product: { select: { code: true, model: true } } } },
        },
      })
    : null;
  const own = deal && canAccessOwner(user, deal.ownerId) ? deal : null;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products billed");
  ws.addRow(["Product Code", "Model", "Qty", "Rate"]);
  ws.getRow(1).font = { bold: true };
  if (own && own.items.length) {
    for (const i of own.items) ws.addRow([i.product.code, i.product.model, i.qty, i.unitPrice]);
  } else {
    ws.addRow(["1201231677", "MIDEA CAC - example model", 2, 450000]);
    ws.addRow(["", "Model only is fine when the code isn't known", 1, 1250000]);
  }
  ws.getColumn(4).numFmt = "#,##0.00";
  ws.columns.forEach((c, i) => (c.width = [16, 44, 8, 16][i]));
  const buffer = await wb.xlsx.writeBuffer();
  const name = own ? `products-${own.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "deal"}.xlsx` : "products-billed-template.xlsx";
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
