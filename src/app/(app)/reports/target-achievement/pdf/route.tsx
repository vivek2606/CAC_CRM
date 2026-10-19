import { Document, Font, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { requireBackOffice } from "@/lib/rbac";
import { getTargetAchievement, rangeFrom, periodLabel, achievementPct, type TARow } from "@/lib/target-achievement";

// Target vs achievement as a PDF (A4 landscape): the summary, then the
// month-by-month detail.

// Whole words only - no "Ami-nat" style hyphenation in names.
Font.registerHyphenationCallback((word) => [word]);

const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const compact = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toFixed(0));
const pctTxt = (p: number | null) => (p == null ? "-" : `${p.toFixed(1)}%`);
const tone = (p: number | null) => (p == null ? "#94a3b8" : p >= 100 ? "#047857" : p >= 70 ? "#b45309" : "#be123c");

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#3730a3" },
  sub: { fontSize: 8.5, color: "#64748b", marginTop: 2, marginBottom: 12 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  th: { backgroundColor: "#e0e7ff", color: "#1e3a8a", fontFamily: "Helvetica-Bold", fontSize: 8 },
  cell: { paddingVertical: 4, paddingHorizontal: 5 },
  team: { backgroundColor: "#eef2ff", fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, fontSize: 7, color: "#94a3b8", textAlign: "center" },
});

function Summary({ rows, team }: { rows: TARow[]; team: TARow }) {
  const w = [246, 140, 140, 150, 110];
  const right = { textAlign: "right" as const };
  return (
    <View>
      <View style={[s.row, s.th]}>
        {["Sales person", "Target (NGN)", "Achieved (NGN)", "Shortfall / excess", "% Achieved"].map((h, i) => (
          <Text key={h} style={[s.cell, { width: w[i] }, i ? right : {}]}>
            {h}
          </Text>
        ))}
      </View>
      {[...rows, team].map((x) => {
        const gap = x.achieved - x.target;
        return (
          <View key={x.id} style={[s.row, x.id === "team" ? s.team : {}]} wrap={false}>
            <Text style={[s.cell, { width: w[0] }]}>{x.name}</Text>
            <Text style={[s.cell, { width: w[1] }, right]}>{x.target ? money(x.target) : "-"}</Text>
            <Text style={[s.cell, { width: w[2] }, right]}>{money(x.achieved)}</Text>
            <Text style={[s.cell, { width: w[3] }, right, { color: !x.target ? "#94a3b8" : gap >= 0 ? "#047857" : "#be123c" }]}>{x.target ? `${gap >= 0 ? "+" : ""}${money(gap)}` : "-"}</Text>
            <Text style={[s.cell, { width: w[4] }, right, { color: tone(x.pct), fontFamily: "Helvetica-Bold" }]}>{pctTxt(x.pct)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// A bullet chart: per sales person, achieved as a bar (coloured by %
// achieved) with the target as a dark marker, and the % at the end.
function BulletChart({ rows }: { rows: TARow[] }) {
  const W = 486;
  const max = Math.max(1, ...rows.map((x) => Math.max(x.achieved, x.target)));
  const fill = (p: number | null) => (p == null ? "#94a3b8" : p >= 100 ? "#10b981" : p >= 70 ? "#f59e0b" : "#f43f5e");
  return (
    <View wrap={false} style={{ marginTop: 14, padding: 10, borderWidth: 0.5, borderColor: "#e2e8f0", borderRadius: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>Achieved vs target</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 10, height: 6, backgroundColor: "#10b981", marginRight: 3 }} />
          <Text style={{ fontSize: 7, color: "#64748b", marginRight: 8 }}>100%+</Text>
          <View style={{ width: 10, height: 6, backgroundColor: "#f59e0b", marginRight: 3 }} />
          <Text style={{ fontSize: 7, color: "#64748b", marginRight: 8 }}>70-99%</Text>
          <View style={{ width: 10, height: 6, backgroundColor: "#f43f5e", marginRight: 3 }} />
          <Text style={{ fontSize: 7, color: "#64748b", marginRight: 8 }}>under 70%</Text>
          <View style={{ width: 2, height: 9, backgroundColor: "#1e293b", marginRight: 3 }} />
          <Text style={{ fontSize: 7, color: "#64748b" }}>target</Text>
        </View>
      </View>
      {rows.map((x) => (
        <View key={x.id} style={{ flexDirection: "row", alignItems: "center", marginVertical: 2.5 }}>
          <Text style={{ width: 130, fontSize: 8 }}>{x.name}</Text>
          <View style={{ width: W, height: 11, backgroundColor: "#f1f5f9", borderRadius: 2, position: "relative" }}>
            <View style={{ position: "absolute", left: 0, top: 0, height: 11, width: Math.max(1, (x.achieved / max) * W), backgroundColor: fill(x.pct), borderRadius: 2 }} />
            {x.target > 0 && <View style={{ position: "absolute", top: -2, height: 15, width: 2, left: Math.min(W - 2, (x.target / max) * W), backgroundColor: "#1e293b" }} />}
          </View>
          <Text style={{ width: 70, fontSize: 8, textAlign: "right", fontFamily: "Helvetica-Bold", color: tone(x.pct) }}>{pctTxt(x.pct)}</Text>
          <Text style={{ width: 80, fontSize: 7.5, textAlign: "right", color: "#64748b" }}>{compact(x.achieved)} / {x.target ? compact(x.target) : "-"}</Text>
        </View>
      ))}
    </View>
  );
}

function Months({ rows, team, months }: { rows: TARow[]; team: TARow; months: Date[] }) {
  const nameW = 150;
  const colW = (786 - nameW - 90) / months.length;
  const right = { textAlign: "right" as const };
  return (
    <View>
      <View style={[s.row, s.th]} fixed>
        <Text style={[s.cell, { width: nameW }]}>Sales person</Text>
        {months.map((m) => (
          <Text key={m.toISOString()} style={[s.cell, { width: colW }, right]}>
            {m.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}
          </Text>
        ))}
        <Text style={[s.cell, { width: 90 }, right]}>Total</Text>
      </View>
      {[...rows, team].map((x) => (
        <View key={x.id} style={[s.row, x.id === "team" ? s.team : {}]} wrap={false}>
          <Text style={[s.cell, { width: nameW }]}>{x.name}</Text>
          {x.months.map((c, i) => {
            const p = achievementPct(c.achieved, c.target);
            return (
              <View key={i} style={[s.cell, { width: colW }]}>
                <Text style={right}>
                  {c.achieved ? compact(c.achieved) : "-"} / {c.target ? compact(c.target) : "-"}
                </Text>
                <Text style={[right, { color: tone(p), fontSize: 7.5, fontFamily: "Helvetica-Bold" }]}>{pctTxt(p)}</Text>
              </View>
            );
          })}
          <View style={[s.cell, { width: 90 }]}>
            <Text style={right}>
              {compact(x.achieved)} / {x.target ? compact(x.target) : "-"}
            </Text>
            <Text style={[right, { color: tone(x.pct), fontSize: 7.5, fontFamily: "Helvetica-Bold" }]}>{pctTxt(x.pct)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export async function GET(request: Request) {
  await requireBackOffice();
  const url = new URL(request.url);
  const { from, to, months } = rangeFrom({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  const r = await getTargetAchievement(from, to, months);
  const printed = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
  const pdf = await renderToBuffer(
    <Document title={`Target vs Achievement ${periodLabel(r)}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>Target vs Achievement</Text>
        <Text style={s.sub}>
          {periodLabel(r)} · {r.rows.length} sales people · achieved = won deals (by invoice date) + project billing, excl. VAT · printed {printed}
        </Text>
        <Text style={s.h2}>Summary</Text>
        <Summary rows={r.rows} team={r.team} />
        {r.rows.length > 0 && <BulletChart rows={r.rows} />}
        {months.length > 1 && (
          <View break>
            <Text style={[s.h2, { marginTop: 16 }]}>Month by month (achieved / target, % achieved)</Text>
            <Months rows={r.rows} team={r.team} months={months} />
          </View>
        )}
        <Text style={s.footer} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Target-vs-Achievement_${months[0].toISOString().slice(0, 7)}_to_${to.toISOString().slice(0, 7)}.pdf"`,
    },
  });
}
