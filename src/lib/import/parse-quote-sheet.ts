// Reads a quotation a sales person made in Excel (any layout) into rows for
// the Quotations builder: finds the header row (Description / Qty / Rate,
// in whatever words), takes the item and heading rows under it up to the
// totals, and picks up the customer, attention and subject lines above it.
// Items are matched to the product list by code or model so they print in
// the standard format; anything else comes in as a custom item.

export type Cell = string | number | Date | null;
export type SheetProduct = { id: string; code: string; model: string };

export type ImportedQuoteRow =
  | { kind: "section"; label: string }
  | { kind: "item"; productId: string | null; description: string; sourceText: string; unit: string; qty: number; unitPrice: number; installRate: number };

export type ImportedQuote = {
  rows: ImportedQuoteRow[];
  to: string;
  attention: string;
  title: string;
  vatInclusive: boolean | null; // null: the sheet doesn't say
  // A supply rate and an installation rate column (supply & installation).
  withInstallation: boolean;
  problems: string[];
};

const text = (v: Cell) => (v == null ? "" : v instanceof Date ? "" : String(v).replace(/\s+/g, " ").trim());
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const toNum = (v: Cell): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = text(v).replace(/[₦,\s]|NGN|N(?=\d)/gi, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};

const HEAD = {
  desc: /^(item )?(description|particulars|details|item|items|product|products|equipment|item description|description of (goods|items?)|goods)\b/i,
  model: /^(model|model no\.?|model number|item code|product code|code|part no\.?|sku)$/i,
  qty: /^(qty|qty\.|quantity|qnty|nos?\.?|no\. of units|units? qty)\b/i,
  unit: /^(unit|uom|unit of measure)$/i,
  rate: /(unit (price|rate|cost)|rate|price)/i,
  amount: /(amount|total|line total|ext(ended)? price)/i,
  install: /install/i,
  sn: /^(s\/?n|s\.n\.?|#|no\.?|sl\.? ?no\.?|item no\.?)$/i,
};
const STOP = /^(sub[\s-]?total|total|grand total|vat|v\.a\.t|value added tax|amount in words|terms|terms (and|&) conditions|note|notes|bank|warranty|delivery|payment)\b/i;
const LABEL = /^(to|bill to|customer|client|messrs\.?|m\/s|attn\.?|attention|kind attention|subject|sub|re|project|ref|ref\. ?no\.?|reference|date|valid)\b/i;

export function parseQuoteGrid(grid: Cell[][], products: SheetProduct[]): ImportedQuote {
  const problems: string[] = [];
  const out: ImportedQuote = { rows: [], to: "", attention: "", title: "", vatInclusive: null, withInstallation: false, problems };

  // 1. Header row: a description column, a quantity column and a rate column.
  let h = -1;
  let col = { desc: -1, model: -1, qty: -1, unit: -1, rate: -1, install: -1, amount: -1 };
  for (let r = 0; r < Math.min(grid.length, 80) && h === -1; r++) {
    const cells = grid[r].map(text);
    const find = (re: RegExp, skip: number[] = []) => cells.findIndex((c, i) => c && re.test(c) && !skip.includes(i));
    const qty = find(HEAD.qty);
    if (qty === -1) continue;
    const model = find(HEAD.model);
    const desc = find(HEAD.desc, [model]);
    // An installation column: "Installation", "Installation rate / cost".
    // On its own (no supply rate column) it's just the rate.
    const installCol = cells.findIndex((c, i) => c && HEAD.install.test(c) && !/^(total|amount)/i.test(c) && i !== qty && i !== desc);
    const amount = cells.findIndex(
      (c, i) => c && HEAD.amount.test(c) && !HEAD.rate.test(c.replace(/total price/i, "")) && i !== qty && i !== installCol,
    );
    let rate = cells.findIndex((c, i) => c && HEAD.rate.test(c) && i !== amount && i !== qty && i !== installCol && !/^total/i.test(c));
    let install = installCol;
    if (rate === -1 && install !== -1) [rate, install] = [install, -1];
    if ((desc === -1 && model === -1) || (rate === -1 && amount === -1)) continue;
    h = r;
    col = { desc, model, qty, unit: find(HEAD.unit), rate, install, amount };
    out.withInstallation = install !== -1;
    const rateHead = rate === -1 ? "" : cells[rate];
    if (/incl/i.test(rateHead)) out.vatInclusive = true;
    else if (/excl/i.test(rateHead)) out.vatInclusive = false;
  }
  if (h === -1) {
    problems.push("Couldn't find the item table - the sheet needs a header row with Description, Qty and Rate (or Unit Price) columns.");
    return out;
  }

  // 2. Customer details above the table.
  const above = grid.slice(0, h).map((row) => row.map(text));
  const valueAt = (r: number, c: number): { lines: string[] } => {
    const m = above[r][c].match(/^[^:\-–]*[:\-–]\s*(.*)$/);
    const below = above[r + 1]?.[c] ?? "";
    const right = above[r].slice(c + 1, c + 3).find(Boolean) ?? "";
    // "To: X" -> X; "To" with the name under it -> the lines below; "To" | X
    // side by side -> X and the lines under X.
    const inline = m?.[1]?.trim() ?? "";
    const useRight = !inline && Boolean(right) && !(below && !LABEL.test(below));
    const first = inline || (useRight ? right : "");
    const lines = first ? [first] : [];
    const lineCol = useRight ? above[r].indexOf(right, c + 1) : c;
    // Following lines in the same column, until a gap or another label.
    for (let k = r + 1; k < above.length && lines.length < 5; k++) {
      const v = above[k][lineCol] ?? "";
      if (!v || LABEL.test(v)) break;
      lines.push(v);
    }
    return { lines };
  };
  for (let r = 0; r < above.length; r++) {
    for (let c = 0; c < above[r].length; c++) {
      const v = above[r][c];
      if (!v) continue;
      if (!out.to && /^(to|bill to|customer( name)?|client|messrs\.?|m\/s)\s*([:\-–]|$)/i.test(v)) out.to = valueAt(r, c).lines.join("\n");
      else if (!out.attention && /^(attn\.?|attention|kind attention)\s*([:\-–]|$)/i.test(v)) out.attention = valueAt(r, c).lines[0] ?? "";
      else if (!out.title && /^(subject|sub|re|project)\s*([:\-–]|$)/i.test(v)) out.title = valueAt(r, c).lines[0] ?? "";
    }
  }

  // 3. Item and heading rows, up to the totals.
  const byCode = new Map(products.map((p) => [norm(p.code), p]));
  const byModel = new Map<string, SheetProduct>();
  for (const p of products) if (norm(p.model) && !byModel.has(norm(p.model))) byModel.set(norm(p.model), p);
  // Longest model first, so "MVC-M280W" wins over "MVC-M28".
  const models = [...byModel.entries()].filter(([m]) => m.length >= 6).sort((a, b) => b[0].length - a[0].length);
  // Model codes inside the product names ("MCD-24CRN1" in "MIDEA CAC
  // CASSETTE MCD-24CRN1 3HP / PNL/ KIT"): letters and digits, 5+ long,
  // belonging to one model only (products with the same model name - e.g.
  // a code and its "SN" twin - count as one, the first listed).
  const tokenOwners = new Map<string, Set<string>>();
  const byId = new Map([...byModel.values()].map((p) => [p.id, p]));
  const isCode = (n: string) => n.length >= 5 && /[A-Z]/.test(n) && /\d/.test(n);
  for (const p of byModel.values()) {
    const parts = p.model.split(/[\s/,()]+/).map(norm).filter(Boolean);
    // Single words, and pairs written with a space ("MCD-24 CRN1").
    const cands = [...parts, ...parts.slice(1).map((t, i) => parts[i] + t)];
    for (const n of cands) {
      if (!isCode(n)) continue;
      if (!tokenOwners.has(n)) tokenOwners.set(n, new Set());
      tokenOwners.get(n)!.add(p.id);
    }
  }
  const tokens = [...tokenOwners.entries()].filter(([, ids]) => ids.size === 1).map(([t, ids]) => [t, [...ids][0]] as const);
  tokens.sort((a, b) => b[0].length - a[0].length);
  const match = (codeText: string, desc: string): SheetProduct | null => {
    for (const t of [codeText, desc]) {
      if (!t) continue;
      const n = norm(t);
      const hit = byCode.get(n) ?? byModel.get(n);
      if (hit) return hit;
    }
    const all = `${codeText} ${desc}`;
    // A product code written anywhere in the row.
    for (const w of all.split(/[^A-Za-z0-9]+/)) {
      const hit = w.length >= 6 ? byCode.get(norm(w)) : undefined;
      if (hit) return hit;
    }
    const n = norm(all);
    for (const [m, p] of models) if (n.includes(m)) return p;
    // A model code from the product names, as a whole word in the row...
    const words = all.toUpperCase().split(/[\s/,()]+/).map(norm).filter(Boolean);
    for (const [t, id] of tokens) if (words.includes(t)) return byId.get(id) ?? null;
    // ...or inside it ("MCD24" in "MCD-24CRN1")...
    for (const [t, id] of tokens) if (t.length >= 5 && n.includes(t)) return byId.get(id) ?? null;
    // ...or shortened ("MVC-M280W" for "MVC-M280WV2GN1"), if only one
    // product's model starts that way.
    for (const w of words.filter((x) => x.length >= 7 && isCode(x))) {
      const ids = new Set(tokens.filter(([t]) => t.startsWith(w)).map(([, id]) => id));
      for (const [t, owners] of tokenOwners) if (owners.size > 1 && t.startsWith(w)) owners.forEach((id) => ids.add(id));
      if (ids.size === 1) return byId.get([...ids][0]) ?? null;
    }
    return null;
  };

  let blanks = 0;
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r];
    const cells = row.map(text);
    if (cells.every((c) => !c)) {
      if (++blanks >= 6 && out.rows.length > 0) break;
      continue;
    }
    blanks = 0;
    const desc = col.desc === -1 ? "" : cells[col.desc];
    const codeText = col.model === -1 ? "" : cells[col.model];
    const label = desc || codeText;
    // Totals / terms: the item table is over.
    const firstText = cells.find((c) => c && toNum(c) == null) ?? "";
    if (STOP.test(firstText) || STOP.test(label)) break;
    const qty = toNum(row[col.qty] ?? null);
    let rate = col.rate === -1 ? null : toNum(row[col.rate] ?? null);
    const installRate = col.install === -1 ? null : toNum(row[col.install] ?? null);
    const amount = col.amount === -1 ? null : toNum(row[col.amount] ?? null);
    if (rate == null && qty && amount != null) rate = Math.round((amount / qty - (installRate ?? 0)) * 100) / 100;
    if (!label) continue;
    if (qty == null && rate == null && installRate == null && amount == null) {
      out.rows.push({ kind: "section", label });
      continue;
    }
    const p = match(codeText, desc);
    if (qty == null || qty === 0) problems.push(`Row ${r + 1}: no quantity for "${label}" - check it.`);
    if (!rate && !installRate) problems.push(`Row ${r + 1}: no rate for "${label}" - check it.`);
    out.rows.push({
      kind: "item",
      productId: p?.id ?? null,
      description: p ? p.model : label,
      sourceText: [codeText, desc].filter(Boolean).join(" "),
      unit: (col.unit === -1 ? "" : cells[col.unit]) || (p ? "No." : "Lot"),
      qty: qty ?? 0,
      unitPrice: rate == null ? 0 : Math.round(rate * 100) / 100,
      installRate: installRate == null ? 0 : Math.round(installRate * 100) / 100,
    });
  }
  if (!out.rows.some((x) => x.kind === "item")) problems.push("No items found under the header row.");
  // A VAT line under the table means the rates were before VAT.
  if (out.vatInclusive == null && grid.slice(h + 1).some((row) => row.some((c) => /^(vat|v\.a\.t|value added tax)\b/i.test(text(c))))) {
    out.vatInclusive = false;
  }
  return out;
}
