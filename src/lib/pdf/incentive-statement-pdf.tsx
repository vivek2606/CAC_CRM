import { Document, Font, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { IncentiveApproval, IncentiveSnapshot } from "@/lib/incentive-approval";
import type { CompanyProfile } from "@/lib/company-profile";

// Approved monthly incentive statement, for finance to approve and pay.
// Built only from the approval's frozen snapshot. Amounts are plain numbers
// under "NGN" headings (the built-in PDF fonts have no ₦ glyph).

Font.registerHyphenationCallback((word) => [word]);

const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = money; // all amounts to 2 decimal places
const pct = (a: number | null) => (a == null ? "-" : `${(a * 100).toFixed(1)}%`);
const rate = (r: number) => (r > 0 ? `${Number((r * 100).toFixed(3))}%` : "Not eligible");
const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");

const ink = "#0f172a";
const muted = "#64748b";
const rule = "#cbd5e1";
const accent = "#1e4f9c";

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 28, fontSize: 8, fontFamily: "Helvetica", color: ink },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 8, marginBottom: 10 },
  logo: { height: 36, width: 134, objectFit: "contain", objectPosition: "left" },
  company: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "right" },
  small: { fontSize: 7.5, color: muted, textAlign: "right", marginTop: 1 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", color: accent },
  strong: { fontFamily: "Helvetica-Bold" },
  label: { fontSize: 7, color: muted, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3, marginTop: 10 },
  table: { borderWidth: 0.75, borderColor: ink },
  th: { flexDirection: "row", backgroundColor: "#e8eff9", borderBottomWidth: 0.75, borderBottomColor: ink },
  tr: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: rule },
  total: { flexDirection: "row", backgroundColor: "#f1f5f9" },
  c: { paddingVertical: 4, paddingHorizontal: 4, borderRightWidth: 0.4, borderRightColor: rule, textAlign: "right" },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#1e3a6e" },
  grand: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  sign: { flexDirection: "row", justifyContent: "space-between", marginTop: 26 },
  signBox: { width: 230 },
  signLine: { borderTopWidth: 0.75, borderTopColor: ink, marginTop: 26, paddingTop: 3 },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 6.5, color: muted, textAlign: "center" },
});

const COLS = [
  { key: "name", label: "Sales person", width: 104 },
  { key: "target", label: "Target", width: 72 },
  { key: "productSales", label: "Product sales", width: 72 },
  { key: "projectSales", label: "Project billing", width: 68 },
  { key: "sales", label: "Total sales", width: 72 },
  { key: "achievement", label: "Achievement", width: 48 },
  { key: "rate", label: "Rate", width: 46 },
  { key: "incentive", label: "Incentive", width: 60 },
  { key: "payout", label: "Share", width: 60 },
  { key: "salarySupport", label: "Salary support", width: 60 },
  { key: "totalToReceive", label: "To receive", width: 0 },
] as const;

export function IncentiveStatementPdf({
  monthLabel,
  approval,
  company,
  draft = false,
}: {
  monthLabel: string;
  approval: IncentiveApproval & { snapshot: IncentiveSnapshot };
  company: CompanyProfile;
  // Live figures for a month not yet approved (Head only) - marked DRAFT.
  draft?: boolean;
}) {
  const docName = draft ? "Sales Incentive Report (DRAFT)" : "Sales Incentive Statement";
  const snap = approval.snapshot;
  const rows = snap.rows;
  const sum = (k: "target" | "productSales" | "projectSales" | "sales" | "incentive" | "payout" | "salarySupport" | "totalToReceive") =>
    rows.reduce((t, r) => t + r[k], 0);
  const supportTotal = snap.support.reduce((t, x) => t + x.amount, 0);
  const grand = sum("totalToReceive") + supportTotal;
  const keep = snap.scheme.salesPersonSharePct;
  const tiers = [...snap.scheme.tiers].sort((a, b) => b.minAchievementPct - a.minAchievementPct);
  const cell = (i: number) => [s.c, COLS[i].width ? { width: COLS[i].width } : { flex: 1, borderRightWidth: 0 }, COLS[i].key === "name" ? { textAlign: "left" as const } : {}];
  const value = (r: (typeof rows)[number], key: (typeof COLS)[number]["key"]) => {
    if (key === "name") return r.name;
    if (key === "achievement") return pct(r.achievement);
    if (key === "rate") return rate(r.rate);
    if (key === "target" || key === "productSales" || key === "projectSales" || key === "sales") return whole(r[key]);
    return money(r[key]);
  };

  return (
    <Document title={`${docName} - ${monthLabel}`} author={company.name}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          {company.logo ? <Image src={company.logo} style={s.logo} /> : <View />}
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.company}>{company.name}</Text>
            {company.addressLines.filter(Boolean).map((l) => (
              <Text key={l} style={s.small}>
                {l}
              </Text>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={s.title}>
              {docName} - {monthLabel}
            </Text>
            <Text style={{ color: muted, marginTop: 2 }}>
              Achievement = month&apos;s sales (product sales + project billing) ÷ target.{" "}
              {tiers.map((t) => `${t.minAchievementPct}%+ earns ${t.ratePct}%`).join(", ")} of sales. Sales person keeps {keep}%; {100 - keep}% goes to support
              staff.
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {draft ? (
              <>
                <Text style={[s.strong, { color: "#b45309" }]}>DRAFT - NOT YET APPROVED</Text>
                <Text style={{ color: muted }}>{approval.status === "SUBMITTED" && approval.submittedBy ? `Submitted by ${approval.submittedBy?.name ?? ""} · ${when(approval.submittedAt)}` : "Live figures - may change"}</Text>
              </>
            ) : (
              <>
                <Text style={[s.strong, { color: "#047857" }]}>APPROVED</Text>
                <Text style={{ color: muted }}>
                  {approval.approvedBy?.name} · {when(approval.approvedAt)}
                </Text>
              </>
            )}
          </View>
        </View>

        <Text style={s.label}>Sales team (amounts in NGN)</Text>
        <View style={s.table}>
          <View style={s.th}>
            {COLS.map((c, i) => (
              <Text key={c.key} style={[...cell(i), s.thText]}>
                {c.key === "payout" ? `Share (${keep}%)` : c.label}
              </Text>
            ))}
          </View>
          {rows.map((r) => (
            <View key={r.userId} style={s.tr} wrap={false}>
              {COLS.map((c, i) => (
                <Text key={c.key} style={[...cell(i), c.key === "totalToReceive" ? s.strong : {}]}>
                  {value(r, c.key)}
                </Text>
              ))}
            </View>
          ))}
          <View style={s.total}>
            {COLS.map((c, i) => {
              const k = c.key;
              const v =
                k === "name"
                  ? "Total"
                  : k === "achievement" || k === "rate"
                    ? ""
                    : k === "target" || k === "productSales" || k === "projectSales" || k === "sales"
                      ? whole(sum(k))
                      : money(sum(k));
              return (
                <Text key={k} style={[...cell(i), s.strong]}>
                  {v}
                </Text>
              );
            })}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 20 }} wrap={false}>
          <View style={{ width: 360 }}>
            <Text style={s.label}>Support staff ({100 - keep}% pool)</Text>
            <View style={s.table}>
              <View style={s.th}>
                <Text style={[s.c, s.thText, { flex: 1, textAlign: "left" }]}>Name</Text>
                <Text style={[s.c, s.thText, { width: 110, textAlign: "left" }]}>Role</Text>
                <Text style={[s.c, s.thText, { width: 90, borderRightWidth: 0 }]}>Amount</Text>
              </View>
              {snap.support.map((x, i) => (
                <View key={i} style={s.tr}>
                  <Text style={[s.c, { flex: 1, textAlign: "left" }]}>{x.name}</Text>
                  <Text style={[s.c, { width: 110, textAlign: "left" }]}>{x.role}</Text>
                  <Text style={[s.c, { width: 90, borderRightWidth: 0 }]}>{money(x.amount)}</Text>
                </View>
              ))}
              <View style={s.total}>
                <Text style={[s.c, s.strong, { flex: 1, textAlign: "left" }]}>Total</Text>
                <Text style={[s.c, { width: 110 }]} />
                <Text style={[s.c, s.strong, { width: 90, borderRightWidth: 0 }]}>{money(supportTotal)}</Text>
              </View>
            </View>
          </View>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <View style={{ borderWidth: 0.75, borderColor: ink, padding: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: muted }}>Sales team (share + salary support)</Text>
                <Text>{money(sum("totalToReceive"))}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 3 }}>
                <Text style={{ color: muted }}>Support staff</Text>
                <Text>{money(supportTotal)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: ink }}>
                <Text style={[s.strong, { fontSize: 10 }]}>Total payable (NGN)</Text>
                <Text style={[s.strong, { fontSize: 10 }]}>{money(grand)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.sign} wrap={false}>
          <View style={s.signBox}>
            <Text style={s.strong}>Prepared by</Text>
            <View style={s.signLine}>
              <Text>{approval.submittedBy?.name ?? ""}</Text>
              <Text style={{ color: muted }}>Sales Coordinator · {when(approval.submittedAt)}</Text>
            </View>
          </View>
          <View style={s.signBox}>
            <Text style={s.strong}>Approved by</Text>
            <View style={s.signLine}>
              <Text>{approval.approvedBy?.name ?? ""}</Text>
              <Text style={{ color: muted }}>Head of Sales · {when(approval.approvedAt)}</Text>
            </View>
          </View>
          <View style={s.signBox}>
            <Text style={s.strong}>Finance - approved for payment</Text>
            <View style={s.signLine}>
              <Text style={{ color: muted }}>Name, signature and date</Text>
            </View>
          </View>
        </View>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${company.name}  ·  ${docName} ${monthLabel}  ·  Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function renderIncentiveStatementPdf(props: Parameters<typeof IncentiveStatementPdf>[0]): Promise<Buffer> {
  return renderToBuffer(<IncentiveStatementPdf {...props} />);
}
