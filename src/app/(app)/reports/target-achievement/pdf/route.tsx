import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { requireBackOffice } from "@/lib/rbac";
import { getTargetAchievement, rangeFrom, periodLabel, achievementPct, type TARow } from "@/lib/target-achievement";

// Target vs achievement as a PDF (A4 landscape): the summary, then the
// month-by-month detail.

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
  const w = [180, 110, 110, 110, 80];
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

function Months({ rows, team, months }: { rows: TARow[]; team: TARow; months: Date[] }) {
  const nameW = 120;
  const colW = Math.min(70, (786 - nameW - 80) / months.length);
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
        <Text style={[s.cell, { width: 80 }, right]}>Total</Text>
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
          <View style={[s.cell, { width: 80 }]}>
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
        {months.length > 1 && (
          <View break={r.rows.length > 10}>
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
