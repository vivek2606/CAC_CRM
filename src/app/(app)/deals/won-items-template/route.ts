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
          stage: true,
          invoiceNo: true,
          closedAt: true,
          billingCompany: true,
          items: { orderBy: { createdAt: "asc" }, select: { qty: true, unitPrice: true, product: { select: { code: true, model: true } } } },
        },
      })
    : null;
  const own = deal && canAccessOwner(user, deal.ownerId) ? deal : null;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products billed");
  // Date and Invoice No: blank for products not billed yet. Lines with the
  // same invoice no. are one invoice; each invoice is recorded on its date.
  ws.addRow(["Date", "Invoice No", "Company", "Item Code", "Item Name", "Quantity", "Rate"]);
  ws.getRow(1).font = { bold: true };
  if (own && own.items.length) {
    const won = own.stage === "WON" && own.invoiceNo;
    for (const i of own.items)
      ws.addRow([won && own.closedAt ? own.closedAt : null, won ? own.invoiceNo : null, won ? own.billingCompany : null, i.product.code, i.product.model, i.qty, i.unitPrice]);
  } else {
    ws.addRow([new Date(Date.UTC(2026, 8, 10)), "2026091005", "Sakuragi", "1201231677", "MIDEA CAC - example model", 2, 450000]);
    ws.addRow([new Date(Date.UTC(2026, 8, 10)), "2026091005", "Sakuragi", "", "Item name only is fine when the code isn't known", 1, 1250000]);
    ws.addRow([new Date(Date.UTC(2026, 8, 24)), "2026091042", "Somotex", "1201231677", "Second invoice, another date", 1, 450000]);
  }
  ws.getColumn(1).numFmt = "dd/mm/yyyy";
  ws.getColumn(7).numFmt = "#,##0.00";
  ws.columns.forEach((c, i) => (c.width = [12, 14, 12, 16, 46, 10, 16][i]));
  // Company: a drop-down of the two billing companies.
  for (let r = 2; r <= 500; r++) ws.getCell(r, 3).dataValidation = { type: "list", allowBlank: true, formulae: ['"Sakuragi,Somotex"'] };
  const buffer = await wb.xlsx.writeBuffer();
  const name = own ? `products-${own.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "deal"}.xlsx` : "products-billed-template.xlsx";
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
