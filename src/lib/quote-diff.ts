// What changed between two saved versions of a quotation's document (the
// builder's input): the header, and line by line (matched by description),
// for the change history.

type Line = { kind?: string; description?: string; label?: string; qty?: number; unitPrice?: number; discountPct?: number; installRate?: number; unit?: string };
type Doc = {
  type?: string;
  companyKey?: string;
  date?: string;
  to?: string;
  attention?: string;
  title?: string;
  rows?: Line[];
  terms?: string[];
  validityDays?: number;
  vatMode?: string;
  withInstallation?: boolean;
  showAvailability?: boolean;
  commissionPct?: number;
  marginPct?: number;
};

const money = (v: number) => `₦${v.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const asDoc = (d: unknown): Doc | null => (d && typeof d === "object" ? (d as Doc) : null);
const items = (d: Doc) => (d.rows ?? []).filter((r) => r.kind !== "section");
const short = (s: string | undefined, n = 60) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || "(no description)";
};
const net = (r: Line) => (r.unitPrice ?? 0) * (1 - (r.discountPct ?? 0) / 100);

export function quoteSummary(data: unknown): string {
  const d = asDoc(data);
  if (!d) return "";
  const lines = items(d);
  const total = lines.reduce((s, r) => s + net(r) * (r.qty ?? 0), 0);
  return `${(d.to ?? "").split("\n")[0] || "no customer"}, ${lines.length} line${lines.length === 1 ? "" : "s"}, ${money(Math.round(total * 100) / 100)} before VAT`;
}

export function quoteChanges(beforeData: unknown, afterData: unknown): string[] {
  const b = asDoc(beforeData);
  const a = asDoc(afterData);
  if (!b || !a) return [];
  const out: string[] = [];
  const field = (label: string, x: unknown, y: unknown, fmt: (v: unknown) => string = (v) => (v == null || v === "" ? "-" : String(v))) => {
    if (JSON.stringify(x ?? null) !== JSON.stringify(y ?? null)) out.push(`${label}: ${fmt(x)} → ${fmt(y)}`);
  };
  field("Document", b.type, a.type);
  field("Company", b.companyKey, a.companyKey);
  field("Date", b.date, a.date);
  const bTo = (b.to ?? "").split("\n");
  const aTo = (a.to ?? "").split("\n");
  field("Customer", bTo[0], aTo[0]);
  if (bTo.slice(1).join("\n") !== aTo.slice(1).join("\n")) out.push("Customer address / phone changed");
  field("Attention", b.attention, a.attention);
  field("Title", b.title, a.title);
  field("Valid for (days)", b.validityDays, a.validityDays);
  field("VAT", b.vatMode, a.vatMode);
  field("Installation column", b.withInstallation, a.withInstallation, (v) => (v ? "on" : "off"));
  field("Commission %", b.commissionPct, a.commissionPct);
  field("Margin %", b.marginPct, a.marginPct);
  if (JSON.stringify(b.terms ?? []) !== JSON.stringify(a.terms ?? [])) out.push("Terms & conditions changed");

  // Lines, matched by description (the first unmatched one with the same).
  const left = items(b).map((r) => ({ r, used: false }));
  for (const r of items(a)) {
    const m = left.find((x) => !x.used && short(x.r.description, 500) === short(r.description, 500));
    if (!m) {
      out.push(`Line added: ${short(r.description)} - ${r.qty ?? 0} × ${money(r.unitPrice ?? 0)}${r.discountPct ? ` less ${r.discountPct}%` : ""}`);
      continue;
    }
    m.used = true;
    const o = m.r;
    const d: string[] = [];
    if ((o.qty ?? 0) !== (r.qty ?? 0)) d.push(`qty ${o.qty ?? 0} → ${r.qty ?? 0}`);
    if ((o.unitPrice ?? 0) !== (r.unitPrice ?? 0)) d.push(`rate ${money(o.unitPrice ?? 0)} → ${money(r.unitPrice ?? 0)}`);
    if ((o.discountPct ?? 0) !== (r.discountPct ?? 0)) d.push(`discount ${o.discountPct ?? 0}% → ${r.discountPct ?? 0}%`);
    if ((o.installRate ?? 0) !== (r.installRate ?? 0)) d.push(`installation ${money(o.installRate ?? 0)} → ${money(r.installRate ?? 0)}`);
    if ((o.unit ?? "") !== (r.unit ?? "")) d.push(`unit ${o.unit || "-"} → ${r.unit || "-"}`);
    if (d.length) out.push(`Line ${short(r.description)}: ${d.join(", ")}`);
  }
  for (const x of left.filter((x) => !x.used)) out.push(`Line removed: ${short(x.r.description)} - ${x.r.qty ?? 0} × ${money(x.r.unitPrice ?? 0)}`);
  return out;
}
