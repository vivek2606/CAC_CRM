import ExcelJS from "exceljs";
import type { DocumentInput } from "@/lib/sales-document";

// Internal costing sheet for a quote priced from our costs (installation
// quotes from a contractor's bill): per line our cost, the margin %, our
// rates (excl. VAT), and cost / price / margin amounts as live formulas -
// with the totals and the overall margin. Never sent to the client.

const MONEY = "#,##0.00";
const PCT = "0.0%";

export async function buildQuoteCostingXlsx(input: DocumentInput, vatRatePct: number): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Costing", { views: [{ state: "frozen", ySplit: 4, showGridLines: true }] });
  const vf = input.vatMode === "inclusive" ? 1 + vatRatePct / 100 : 1;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  ws.columns = [
    { width: 6 }, { width: 46 }, { width: 7 }, { width: 8 },
    { width: 15 }, { width: 15 }, { width: 10 },
    { width: 15 }, { width: 15 }, { width: 8 },
    { width: 17 }, { width: 17 }, { width: 16 }, { width: 10 },
  ];
  ws.getCell("A1").value = `Costing - ${input.ref || "quotation not downloaded yet"} - ${input.to.split("\n")[0] ?? ""}`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `Internal - not for the client. Margin on our price (not markup): rate = cost / (1 - margin). Quote margin ${input.marginPct}%. Amounts excl. VAT.`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF64748B" } };

  const head = ["#", "Description", "Unit", "Qty", "Cost: supply", "Cost: installation", "Margin %", "Our supply rate", "Our installation rate", "Disc. %", "Cost amount", "Our price (excl. VAT)", "Margin (NGN)", "Margin %"];
  const h = ws.getRow(4);
  head.forEach((t, i) => {
    const c = h.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FF1E3A6E" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFF9" } };
    c.alignment = { wrapText: true, vertical: "middle", horizontal: i >= 3 ? "right" : "left" };
  });
  h.height = 30;

  let row = 5;
  let section = 0;
  let sub = 0;
  const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];
  const first = row;
  for (const r of input.rows) {
    const x = ws.getRow(row);
    if (r.kind === "section") {
      if (!r.label) continue;
      x.getCell(1).value = String.fromCharCode(65 + (section++ % 26));
      x.getCell(2).value = r.label;
      x.font = { bold: true };
      sub = 0;
      row++;
      continue;
    }
    if (!r.description && r.qty === 0) continue;
    x.getCell(1).value = roman[sub++] ?? String(sub);
    x.getCell(2).value = r.description;
    x.getCell(2).alignment = { wrapText: true, vertical: "top" };
    x.getCell(3).value = r.unit;
    x.getCell(4).value = r.qty;
    if (r.costRate != null) x.getCell(5).value = r.costRate;
    if (r.costInstall != null) x.getCell(6).value = r.costInstall;
    if (r.costRate != null || r.costInstall != null) x.getCell(7).value = (r.marginPct ?? input.marginPct) / 100;
    x.getCell(8).value = r2(r.unitPrice / vf);
    if (input.withInstallation) x.getCell(9).value = r2(r.installRate / vf);
    if (r.discountPct) x.getCell(10).value = r.discountPct / 100;
    const n = row;
    // Cost and price of the costed parts only, so the margin compares like with like.
    x.getCell(11).value = { formula: `IF(AND(E${n}="",F${n}=""),"",D${n}*(N(E${n})+N(F${n})))` };
    x.getCell(12).value = { formula: `D${n}*(IF(E${n}="",IF(F${n}="",H${n}*(1-N(J${n})),0),H${n}*(1-N(J${n})))+IF(F${n}="",IF(E${n}="",N(I${n}),0),N(I${n})))` };
    x.getCell(13).value = { formula: `IF(K${n}="","",L${n}-K${n})` };
    x.getCell(14).value = { formula: `IF(OR(K${n}="",L${n}=0),"",M${n}/L${n})` };
    for (const c of [5, 6, 8, 9, 11, 12, 13]) x.getCell(c).numFmt = MONEY;
    for (const c of [7, 10, 14]) x.getCell(c).numFmt = PCT;
    row++;
  }
  const last = row - 1;
  row++;
  const t = ws.getRow(row);
  t.getCell(2).value = "Total (costed lines)";
  t.getCell(11).value = { formula: `SUM(K${first}:K${last})` };
  t.getCell(12).value = { formula: `SUMPRODUCT((K${first}:K${last}<>"")*L${first}:L${last})` };
  t.getCell(13).value = { formula: `L${row}-K${row}` };
  t.getCell(14).value = { formula: `IF(L${row}=0,"",M${row}/L${row})` };
  t.font = { bold: true };
  for (const c of [11, 12, 13]) t.getCell(c).numFmt = MONEY;
  t.getCell(14).numFmt = PCT;
  t.eachCell((c) => (c.border = { top: { style: "thin" }, bottom: { style: "double" } }));
  const q = ws.getRow(row + 1);
  q.getCell(2).value = "Quotation total, all lines (excl. VAT)";
  q.getCell(12).value = { formula: `SUM(L${first}:L${last})` };
  q.getCell(12).numFmt = MONEY;
  q.font = { color: { argb: "FF64748B" } };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
