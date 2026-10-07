import ExcelJS from "exceljs";
import type { SalesDocument } from "@/lib/sales-document";

// Editable Excel version of a quotation / proforma / BOQ - same layout as
// the PDF. Each line's amount, the subtotal, VAT and the total are live
// formulas, so changing a quantity or rate (or filling one of the spare rows
// left inside the table) recalculates everything.

const MONEY = "#,##0.00";
const ACCENT = "FF1E4F9C"; // Sakuragi logo blue
const muted = { color: { argb: "FF64748B" } };

export async function buildSalesDocumentXlsx(doc: SalesDocument): Promise<ArrayBuffer> {
  const c = doc.company;
  const wb = new ExcelJS.Workbook();
  wb.creator = c.name;
  const ws = wb.addWorksheet({ quote: "Quotation", proforma: "Proforma Invoice", boq: "Bill of Quantity" }[doc.type], {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.45, right: 0.45, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 6 }, { width: 56 }, { width: 7 }, { width: 8 }, { width: 17 }, { width: 19 }];
  const put = (row: number, col: number, value: ExcelJS.CellValue, style: Partial<ExcelJS.Style> = {}) => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    Object.assign(cell, style);
    return cell;
  };

  // Letterhead: logo (left), company name + address (right)
  const logo = c.logo.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (logo) {
    const id = wb.addImage({ base64: logo[2], extension: logo[1] === "png" ? "png" : "jpeg" });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 162, height: 44 }, editAs: "oneCell" });
  }
  const reg = [c.rcNumber && `RC ${c.rcNumber.replace(/^RC[\s.:#-]*/i, "")}`, doc.tin && `TIN ${doc.tin.replace(/^TIN[\s.:#-]*/i, "")}`].filter(Boolean).join("  |  ");
  const headLines = [...c.addressLines.filter(Boolean), [c.phone, c.email, c.website].filter(Boolean).join("  |  "), reg].filter(Boolean);
  let r = 1;
  put(r, 6, c.name, { font: { bold: true, size: 12 }, alignment: { horizontal: "right" } });
  headLines.forEach((l) => put(++r, 6, l, { font: { size: 9, ...muted }, alignment: { horizontal: "right" } }));
  r = Math.max(r, 3);
  for (let col = 1; col <= 6; col++) ws.getCell(r, col).border = { bottom: { style: "medium", color: { argb: ACCENT } } };

  // To / kind attention (left), document title + details (right)
  r += 2;
  const top = r;
  put(r, 1, doc.type === "proforma" ? "BILL TO" : "TO", { font: { size: 8, bold: true, ...muted } });
  const toLines = doc.to.length ? doc.to : [""];
  toLines.forEach((l, i) => put(r + 1 + i, 1, l, { font: { bold: i === 0, size: i === 0 ? 11 : 10 } }));
  r += toLines.length;
  if (doc.attention) {
    r += 2;
    put(r, 1, "KIND ATTENTION", { font: { size: 8, bold: true, ...muted } });
    put(++r, 1, doc.attention, { font: { bold: true } });
  }
  put(top, 6, doc.heading, { font: { bold: true, size: 14, color: { argb: ACCENT } }, alignment: { horizontal: "right" } });
  const meta: [string, ExcelJS.CellValue, string?][] = [
    ...(doc.ref ? ([["Ref", doc.ref]] as [string, ExcelJS.CellValue][]) : []),
    ["Date", doc.date, "dd mmm yyyy"],
    ...(doc.validUntil ? ([["Valid until", doc.validUntil, "dd mmm yyyy"]] as [string, ExcelJS.CellValue, string][]) : []),
  ];
  meta.forEach(([label, value, fmt], i) => {
    put(top + 1 + i, 5, label, { font: { size: 9, ...muted }, alignment: { horizontal: "right" } });
    const cell = put(top + 1 + i, 6, value, { font: { size: 9, bold: true }, alignment: { horizontal: "right" } });
    if (fmt) cell.numFmt = fmt;
  });
  r = Math.max(r, top + meta.length);
  if (doc.title) {
    r += 2;
    put(r, 1, `Re: ${doc.title}`, { font: { bold: true } });
  }

  // Items
  r += 2;
  const headerRow = r;
  ["#", "Description", "Unit", "Qty", doc.vatInclusive ? "Rate incl. VAT (NGN)" : "Rate (NGN)", doc.vatInclusive ? "Amount incl. VAT (NGN)" : "Amount (NGN)"].forEach((h, i) =>
    put(r, i + 1, h, {
      font: { bold: true, size: 9, color: { argb: "FF1E3A6E" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFF9" } },
      alignment: { horizontal: i >= 2 ? (i === 2 ? "center" : "right") : "left", vertical: "middle" },
      border: { top: { style: "thin", color: { argb: "FFB9CBE8" } }, bottom: { style: "thin", color: { argb: "FFB9CBE8" } } },
    }),
  );
  const rowBorder = { bottom: { style: "hair" as const, color: { argb: "FFE2E8F0" } } };
  const first = r + 1;
  for (const row of doc.rows) {
    r++;
    for (let col = 1; col <= 6; col++) ws.getCell(r, col).border = rowBorder;
    if (row.kind === "section") {
      put(r, 1, row.sn, { font: { bold: true }, border: rowBorder });
      put(r, 2, row.label, { font: { bold: true }, border: rowBorder });
      for (let col = 1; col <= 6; col++) ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      continue;
    }
    put(r, 1, row.sn, { font: muted, alignment: { vertical: "top" }, border: rowBorder });
    put(r, 2, row.detail ? { richText: [{ text: row.description }, { text: `\n${row.detail}`, font: { size: 9, color: { argb: "FF64748B" } } }] } : row.description, {
      alignment: { wrapText: true, vertical: "top" },
      border: rowBorder,
    });
    put(r, 3, row.unit, { alignment: { horizontal: "center", vertical: "top" }, border: rowBorder });
    put(r, 4, row.qty, { numFmt: "#,##0.##", alignment: { vertical: "top" }, border: rowBorder });
    put(r, 5, row.unitPrice, { numFmt: MONEY, alignment: { vertical: "top" }, border: rowBorder });
    put(r, 6, { formula: `D${r}*E${r}`, result: row.amount }, { numFmt: MONEY, alignment: { vertical: "top" }, border: rowBorder });
  }
  // Spare rows inside the summed range, for items added later in Excel.
  for (let k = 0; k < 3; k++) {
    r++;
    for (let col = 1; col <= 6; col++) ws.getCell(r, col).border = rowBorder;
    put(r, 6, { formula: `IF(D${r}="","",D${r}*E${r})`, result: "" }, { numFmt: MONEY, border: rowBorder });
  }
  const last = r;

  const total = (label: string, value: ExcelJS.CellValue, bold = false) => {
    r++;
    put(r, 5, label, { font: { bold, ...(bold ? {} : muted) }, alignment: { horizontal: "right" } });
    return put(r, 6, value, { numFmt: MONEY, font: { bold } });
  };
  r++;
  let grand: ExcelJS.Cell;
  if (doc.vatInclusive) {
    // Rates already include VAT - just the total, no separate VAT line.
    grand = total(`Total inclusive of VAT (@${doc.vatRatePct}%) (NGN)`, { formula: `SUM(F${first}:F${last})`, result: doc.total }, true);
  } else {
    total("Subtotal (excl. VAT)", { formula: `SUM(F${first}:F${last})`, result: doc.subtotal });
    const subRow = r;
    total(`VAT @ ${doc.vatRatePct}%`, { formula: `ROUND(F${subRow}*${doc.vatRatePct / 100},2)`, result: doc.vat });
    const vatRow = r;
    grand = total("Total incl. VAT (NGN)", { formula: `F${subRow}+F${vatRow}`, result: doc.total }, true);
  }
  grand.border = { top: { style: "medium" } };
  ws.getCell(r, 5).border = { top: { style: "medium" } };

  r += 2;
  ws.mergeCells(r, 1, r, 6);
  put(r, 1, `Amount in words: ${doc.totalInWords}`, {
    font: { size: 9 },
    alignment: { wrapText: true, vertical: "middle" },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } },
  });
  ws.getRow(r).height = 30;

  // Terms, then bank details + TIN
  r += 2;
  put(r, 1, "TERMS & CONDITIONS", { font: { size: 8, bold: true, ...muted } });
  const bank: [string, string][] = (
    [
      ["Bank", doc.bank.bankName],
      ["Account name", doc.bank.accountName],
      ["Account number", doc.bank.accountNumber],
      ["TIN", doc.tin],
    ] as [string, string][]
  ).filter(([, v]) => v);
  doc.terms.forEach((t, i) => put(r + 1 + i, 1, `• ${t}`, { font: { size: 9 } }));
  r += doc.terms.length;

  // Bank details in their own block, one full-width line each ("Account
  // name: ...") so long names are never cut off by a narrow column.
  if (bank.length) {
    r += 2;
    put(r, 1, "BANK DETAILS FOR PAYMENT", { font: { size: 8, bold: true, ...muted } });
    for (const [label, value] of bank) {
      r++;
      ws.mergeCells(r, 1, r, 6);
      put(r, 1, {
        richText: [
          { text: `${label}: `, font: { size: 10, color: { argb: "FF64748B" } } },
          { text: value, font: { size: 10, bold: true } },
        ],
      });
    }
  }

  // Signatory (left), customer acceptance (right)
  r += 2;
  put(r, 1, `For ${c.name}`, { font: { bold: true } });
  put(r, 5, "Customer acceptance", { font: { bold: true } });
  r += 3;
  for (const col of [1, 2, 5, 6]) ws.getCell(r, col).border = { top: { style: "thin" } };
  put(r, 1, doc.signatory.name || "Name", { font: { bold: Boolean(doc.signatory.name), ...(doc.signatory.name ? {} : muted) }, border: { top: { style: "thin" } } });
  put(r, 5, "Name, signature and date", { font: { size: 9, ...muted }, border: { top: { style: "thin" } } });
  if (doc.signatory.designation) put(++r, 1, doc.signatory.designation, { font: { size: 9, ...muted } });
  if (doc.signatory.phone) put(++r, 1, doc.signatory.phone, { font: { size: 9, ...muted } });

  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
