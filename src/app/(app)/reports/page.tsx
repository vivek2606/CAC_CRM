import Link from "next/link";
import { requireBackOffice } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { formatCompactCurrency, formatDuration } from "@/lib/format";
import { DEAL_STAGE_LABELS, LEAD_SOURCE_LABELS, END_USE_SEGMENT_LABELS, LOST_REASON_LABELS } from "@/lib/constants";
import { getMonthlyPipeline, monthsBetween } from "@/lib/monthly-pipeline";
import { MonthlyPipelineTables } from "@/components/monthly-pipeline-table";
import { ExportCsvButton } from "@/components/export-csv-button";
import { getTeamReport, type RepScore } from "@/lib/team-report";
import type { LeadSource, EndUseSegment, LostReason } from "@prisma/client";
import { Wallet, TrendingUp, Target, Percent, Gauge, Timer, Repeat, Layers } from "lucide-react";

// Team Reports, laid out like the standard CRM sales reports: headline KPIs,
// a scorecard per sales person, the monthly trend, pipeline health and
// forecast, win / loss, and where the business comes from - all for one
// period (whole months; the last 6 by default).

function parseMonthParam(raw: string | undefined, fallback: Date): Date {
  const m = raw?.match(/^(\d{4})-(\d{1,2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : fallback;
}
const monthInput = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLong = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const money = (v: number | null | undefined) => (v ? formatCompactCurrency(v) : "-");
const num = (v: number | null | undefined) => (v ? String(v) : "-");
const pctTxt = (v: number | null) => (v == null ? "-" : `${v}%`);
const days = (v: number | null) => (v == null ? "-" : `${Math.round(v)} d`);
const hrs = (v: number | null) => (v == null ? "-" : formatDuration(v * 3600000));

// A thin bar behind a figure, scaled to the column's largest value.
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  if (!(value > 0) || !(max > 0)) return null;
  const w = Math.max(3, Math.round((value / max) * 100));
  return (
    <div className="mt-0.5 h-1 w-full rounded-full bg-slate-100">
      <div className={`h-1 rounded-full ${color} transition-all duration-700`} style={{ width: `${w}%` }} />
    </div>
  );
}

function Section({ id, title, note, children, right }: { id?: string; title: string; note?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div id={id} className="mb-3 flex flex-wrap items-end justify-between gap-2 scroll-mt-24">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {note && <p className="text-xs text-slate-500">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireBackOffice();
  const params = await searchParams;

  const now = new Date();
  const nowMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let to = parseMonthParam(params.to, nowMonth);
  let from = parseMonthParam(params.from, new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 5, 1)));
  if (from > to) [from, to] = [to, from];
  const monthList = monthsBetween(from, to).slice(-24);
  from = monthList[0];

  const r = await getTeamReport(from, to, now);
  const pipeline = await getMonthlyPipeline(r.reps.map((x) => ({ id: x.id, name: x.name })), monthList, now);
  const t = r.team;
  const period = `${monthLong(from)} - ${monthLong(to)}`;
  const wonChange = r.prevWonValue > 0 ? Math.round(((t.wonValue - r.prevWonValue) / r.prevWonValue) * 100) : null;
  const coverage = r.thisMonthTarget > 0 ? t.openValue / r.thisMonthTarget : null;
  const max = (k: keyof RepScore) => Math.max(0, ...r.reps.map((x) => Number(x[k] ?? 0)));
  const achPct = (x: RepScore) => (x.target > 0 ? Math.round((x.achieved / x.target) * 100) : null);
  const tone = (p: number | null) => (p == null ? "text-slate-400" : p >= 100 ? "text-emerald-700" : p >= 70 ? "text-amber-700" : "text-rose-700");

  const scoreCols: { label: string; key: string; title?: string; cell: (x: RepScore) => React.ReactNode; csv: (x: RepScore) => string | number; group: string }[] = [
    { group: "Target", label: "Target", key: "target", cell: (x) => money(x.target), csv: (x) => Math.round(x.target) },
    { group: "Target", label: "Achieved", key: "achieved", title: "Won deals + project billing", cell: (x) => money(x.achieved), csv: (x) => Math.round(x.achieved) },
    { group: "Target", label: "%", key: "ach", cell: (x) => <span className={`font-semibold ${tone(achPct(x))}`}>{pctTxt(achPct(x))}</span>, csv: (x) => achPct(x) ?? "" },
    { group: "Won", label: "Deals", key: "wonCount", cell: (x) => num(x.wonCount), csv: (x) => x.wonCount },
    { group: "Won", label: "Value", key: "wonValue", cell: (x) => (<>{money(x.wonValue)}<Bar value={x.wonValue} max={max("wonValue")} color="bg-emerald-400" /></>), csv: (x) => Math.round(x.wonValue) },
    { group: "Won", label: "Win rate", key: "winRate", title: "Won ÷ (won + lost), deals closed in the CRM", cell: (x) => pctTxt(x.winRate), csv: (x) => x.winRate ?? "" },
    { group: "Won", label: "Avg deal", key: "avgDeal", cell: (x) => money(x.avgDeal), csv: (x) => Math.round(x.avgDeal ?? 0) },
    { group: "Pipeline (now)", label: "Open", key: "openCount", cell: (x) => num(x.openCount), csv: (x) => x.openCount },
    { group: "Pipeline (now)", label: "Value", key: "openValue", cell: (x) => (<>{money(x.openValue)}<Bar value={x.openValue} max={max("openValue")} color="bg-sky-400" /></>), csv: (x) => Math.round(x.openValue) },
    { group: "Pipeline (now)", label: "Weighted", key: "weighted", title: "Value × win probability", cell: (x) => money(x.weighted), csv: (x) => Math.round(x.weighted) },
    { group: "Pipeline (now)", label: "Overdue", key: "overdue", title: "Past expected close", cell: (x) => <span className={x.overdue ? "text-rose-700 font-semibold" : ""}>{num(x.overdue)}</span>, csv: (x) => x.overdue },
    { group: "Pipeline (now)", label: "Stale", key: "stale", title: "No activity for 14+ days", cell: (x) => <span className={x.stale ? "text-amber-700 font-semibold" : ""}>{num(x.stale)}</span>, csv: (x) => x.stale },
    { group: "Leads", label: "New", key: "newLeads", cell: (x) => num(x.newLeads), csv: (x) => x.newLeads },
    { group: "Leads", label: "→ Deal", key: "convRate", title: "Converted to a deal", cell: (x) => (x.newLeads ? `${x.converted} · ${pctTxt(x.convRate)}` : "-"), csv: (x) => x.convRate ?? "" },
    { group: "Speed", label: "Cycle", key: "cycleDays", title: "Deal created → won", cell: (x) => days(x.cycleDays), csv: (x) => (x.cycleDays == null ? "" : Math.round(x.cycleDays)) },
    { group: "Speed", label: "Response", key: "responseHrs", title: "Deal created → first call / email / meeting", cell: (x) => hrs(x.responseHrs), csv: (x) => (x.responseHrs == null ? "" : Math.round(x.responseHrs * 10) / 10) },
    { group: "Activity", label: "Calls", key: "calls", cell: (x) => num(x.calls), csv: (x) => x.calls },
    { group: "Activity", label: "Meet", key: "meetings", cell: (x) => num(x.meetings), csv: (x) => x.meetings },
    { group: "Activity", label: "Connect", key: "connectRate", title: "Calls that reached Connected", cell: (x) => pctTxt(x.connectRate), csv: (x) => x.connectRate ?? "" },
    { group: "Activity", label: "New a/c", key: "newAccounts", title: "Accounts with their first won deal in the period", cell: (x) => num(x.newAccounts), csv: (x) => x.newAccounts },
  ];
  const groups = scoreCols.reduce<{ name: string; span: number }[]>((acc, c) => {
    const last = acc.at(-1);
    if (last && last.name === c.group) last.span++;
    else acc.push({ name: c.group, span: 1 });
    return acc;
  }, []);
  const groupTint: Record<string, string> = {
    Target: "bg-violet-100 text-violet-800",
    Won: "bg-emerald-100 text-emerald-800",
    "Pipeline (now)": "bg-sky-100 text-sky-800",
    Leads: "bg-amber-100 text-amber-800",
    Speed: "bg-rose-100 text-rose-800",
    Activity: "bg-slate-200 text-slate-700",
  };

  const stageMax = Math.max(0, ...r.stages.map((s) => s.value));
  const lostTotal = r.lostReasons.reduce((s, x) => s + x.count, 0);
  const th = "px-2 py-1.5 font-medium";

  return (
    <div>
      <PageHeader
        title="Team Reports"
        description={`${r.reps.length} sales people · ${period}`}
        action={
          <form action="/reports" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">
              From
              <input type="month" name="from" defaultValue={monthInput(from)} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              To
              <input type="month" name="to" defaultValue={monthInput(to)} className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
            </label>
            <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white">
              Show
            </button>
            {(params.from || params.to) && (
              <Link href="/reports" className="pb-1.5 text-sm text-slate-500 hover:text-slate-800">
                Last 6 months
              </Link>
            )}
          </form>
        }
      />

      <div className="p-6 space-y-5">
        {/* Headline KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Won revenue"
            value={formatCompactCurrency(t.wonValue)}
            sub={`${t.wonCount} deals${wonChange == null ? "" : ` · ${wonChange >= 0 ? "▲" : "▼"} ${Math.abs(wonChange)}% vs previous ${r.months} mo`}`}
            icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
            accent="emerald"
          />
          <StatCard
            label="Target achievement"
            value={pctTxt(achPct(t))}
            sub={`${formatCompactCurrency(t.achieved)} of ${t.target ? formatCompactCurrency(t.target) : "no target"} (incl. project billing)`}
            icon={<Target className="h-4 w-4 text-violet-600" />}
            accent="violet"
          />
          <StatCard
            label="Open pipeline"
            value={formatCompactCurrency(t.openValue)}
            sub={`${t.openCount} deals · weighted ${formatCompactCurrency(t.weighted)}`}
            icon={<Wallet className="h-4 w-4 text-sky-600" />}
            accent="sky"
          />
          <StatCard
            label="Pipeline coverage"
            value={coverage == null ? "-" : `${coverage.toFixed(1)}×`}
            sub={coverage == null ? "No target this month" : "Open pipeline ÷ this month's target (3× is healthy)"}
            icon={<Layers className="h-4 w-4 text-indigo-600" />}
            accent="indigo"
          />
          <StatCard label="Win rate" value={pctTxt(t.winRate)} sub="Won ÷ closed, CRM deals in the period" icon={<Percent className="h-4 w-4 text-amber-600" />} accent="amber" />
          <StatCard label="Avg deal size" value={money(t.avgDeal)} sub="Won deals in the period" icon={<Gauge className="h-4 w-4 text-rose-600" />} accent="rose" />
          <StatCard
            label="Avg sales cycle"
            value={days(t.cycleDays)}
            sub={`Response to new deals: ${hrs(t.responseHrs)}`}
            icon={<Timer className="h-4 w-4 text-sky-600" />}
            accent="sky"
          />
          <StatCard
            label="Lead → deal conversion"
            value={pctTxt(t.convRate)}
            sub={`${t.converted} of ${t.newLeads} new leads`}
            icon={<Repeat className="h-4 w-4 text-indigo-600" />}
            accent="indigo"
          />
        </div>

        {/* Scorecard */}
        <Section
          title="Sales scorecard"
          note={`Per sales person for ${period}; pipeline columns are as of now. Hover a heading for how it's worked out.`}
          right={
            <ExportCsvButton
              filename={`sales-scorecard-${monthInput(from)}-${monthInput(to)}.csv`}
              headers={["Sales person", ...scoreCols.map((c) => `${c.group} - ${c.label}`)]}
              rows={[...r.reps, t].map((x) => [x.name, ...scoreCols.map((c) => c.csv(x))])}
            />
          }
        >
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs" data-own-head>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide">
                  <th className="bg-slate-100" />
                  {groups.map((g) => (
                    <th key={g.name} colSpan={g.span} className={`px-2 py-1 text-center font-semibold ${groupTint[g.name]}`}>
                      {g.name}
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className={`${th} text-left`}>Sales person</th>
                  {scoreCols.map((c) => (
                    <th key={c.key} title={c.title} className={`${th} text-right whitespace-nowrap ${c.title ? "cursor-help underline decoration-dotted" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.reps.map((x) => (
                  <tr key={x.id} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <Link href={`/deals?owner=${x.id}`} className="font-medium text-indigo-700 hover:underline">
                        {x.name}
                      </Link>
                    </td>
                    {scoreCols.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {c.cell(x)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-indigo-50 font-semibold text-indigo-950">
                  <td className="px-2 py-1.5">Team</td>
                  {scoreCols.map((c) => (
                    <td key={c.key} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {c.key === "wonValue" ? money(t.wonValue) : c.key === "openValue" ? money(t.openValue) : c.cell(t)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>

        {/* Monthly trend */}
        <Section id="pipeline-months" title="Monthly trend" note="Open deals at each month's end (this month: now), deals converted from a lead, and deals won - per sales person.">
          <MonthlyPipelineTables data={pipeline} filename={`deals-by-month-${monthInput(from)}-${monthInput(to)}.csv`} />
        </Section>

        {/* Pipeline health + forecast */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Section title="Pipeline by stage" note="Open deals now - how much sits where, how long, and how many are past their expected close.">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide">
                  <th className={th}>Stage</th>
                  <th className={`${th} text-right`}>Deals</th>
                  <th className={`${th} text-right`}>Value</th>
                  <th className={`${th} text-right`}>Weighted</th>
                  <th className={`${th} text-right`} title="Days since the deal entered this stage">
                    Avg age
                  </th>
                  <th className={`${th} text-right`}>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {r.stages.map((s) => (
                  <tr key={s.stage} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-medium text-slate-800">{DEAL_STAGE_LABELS[s.stage]}</td>
                    <td className="px-2 py-1.5 text-right">{num(s.count)}</td>
                    <td className="px-2 py-1.5 text-right w-40">
                      {money(s.value)}
                      <Bar value={s.value} max={stageMax} color="bg-gradient-to-r from-sky-400 to-indigo-500" />
                    </td>
                    <td className="px-2 py-1.5 text-right">{money(s.weighted)}</td>
                    <td className={`px-2 py-1.5 text-right ${s.avgAgeDays != null && s.avgAgeDays > 30 ? "text-amber-700 font-semibold" : ""}`}>{days(s.avgAgeDays)}</td>
                    <td className={`px-2 py-1.5 text-right ${s.overdue ? "text-rose-700 font-semibold" : ""}`}>{num(s.overdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Forecast" note="Open deals by expected close month. Commit = deals 70%+ likely; weighted = value × probability.">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide">
                  <th className={th}>Expected close</th>
                  <th className={`${th} text-right`}>Deals</th>
                  <th className={`${th} text-right`}>Pipeline</th>
                  <th className={`${th} text-right`}>Weighted</th>
                  <th className={`${th} text-right`}>Commit</th>
                </tr>
              </thead>
              <tbody>
                {r.forecast.map((f, i) => (
                  <tr key={f.label} className={`border-t border-slate-100 ${i === 0 && f.count ? "bg-rose-50/60" : ""}`}>
                    <td className={`px-2 py-1.5 font-medium ${i === 0 ? "text-rose-700" : "text-slate-800"}`}>{f.label}</td>
                    <td className="px-2 py-1.5 text-right">{num(f.count)}</td>
                    <td className="px-2 py-1.5 text-right">{money(f.value)}</td>
                    <td className="px-2 py-1.5 text-right">{money(f.weighted)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-emerald-700">{money(f.commit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>

        {/* Win / loss */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Section title="Why deals are lost" note={`${lostTotal} deal${lostTotal === 1 ? "" : "s"} lost in the period.`}>
            {r.lostReasons.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No lost deals in the period.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide">
                      <th className={th}>Reason</th>
                      <th className={`${th} text-right`}>Deals</th>
                      <th className={`${th} text-right`}>Share</th>
                      <th className={`${th} text-right`}>Value lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.lostReasons.map((x) => (
                      <tr key={x.reason} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-800">{x.reason === "UNSPECIFIED" ? "Not recorded" : LOST_REASON_LABELS[x.reason as LostReason]}</td>
                        <td className="px-2 py-1.5 text-right">{x.count}</td>
                        <td className="px-2 py-1.5 text-right w-32">
                          {Math.round((x.count / lostTotal) * 100)}%
                          <Bar value={x.count} max={lostTotal} color="bg-rose-400" />
                        </td>
                        <td className="px-2 py-1.5 text-right">{money(x.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.lostTo.length > 0 && (
                  <p className="mt-3 text-xs text-slate-600">
                    <span className="font-semibold">Lost to:</span> {r.lostTo.map((b) => `${b.brand} (${b.count})`).join(", ")}
                  </p>
                )}
              </>
            )}
          </Section>

          <Section title="Win rate against competitors" note="Closed deals where a competing brand was quoted.">
            {r.competitors.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No closed deals with a competing brand recorded in the period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide">
                    <th className={th}>Competing brand</th>
                    <th className={`${th} text-right`}>Won</th>
                    <th className={`${th} text-right`}>Lost</th>
                    <th className={`${th} text-right`}>Win rate</th>
                  </tr>
                </thead>
                <tbody>
                  {r.competitors.map((c) => (
                    <tr key={c.label} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-medium text-slate-800">{c.label}</td>
                      <td className="px-2 py-1.5 text-right text-emerald-700">{c.won}</td>
                      <td className="px-2 py-1.5 text-right text-rose-700">{c.lost}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${c.winRate >= 50 ? "text-emerald-700" : "text-rose-700"}`}>{c.winRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* Where the business comes from */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Section title="Lead sources" note="Leads created in the period - how many became deals, and the revenue won from them.">
            {r.sources.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No leads in the period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide">
                    <th className={th}>Source</th>
                    <th className={`${th} text-right`}>Leads</th>
                    <th className={`${th} text-right`}>→ Deal</th>
                    <th className={`${th} text-right`}>Won revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {r.sources.map((s) => (
                    <tr key={s.source} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-medium text-slate-800">{LEAD_SOURCE_LABELS[s.source as LeadSource] ?? s.source}</td>
                      <td className="px-2 py-1.5 text-right">{s.leads}</td>
                      <td className="px-2 py-1.5 text-right">
                        {s.converted} · {s.convRate}%
                      </td>
                      <td className="px-2 py-1.5 text-right">{money(s.wonValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="End-use segments" note="Open pipeline now, and deals won in the period, by vertical.">
            {r.segments.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No deals with a segment set.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide">
                    <th className={th}>Segment</th>
                    <th className={`${th} text-right`}>Open</th>
                    <th className={`${th} text-right`}>Open value</th>
                    <th className={`${th} text-right`}>Won</th>
                    <th className={`${th} text-right`}>Won value</th>
                    <th className={`${th} text-right`}>Win rate</th>
                  </tr>
                </thead>
                <tbody>
                  {r.segments.map((s) => (
                    <tr key={s.segment} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-medium text-slate-800">{END_USE_SEGMENT_LABELS[s.segment as EndUseSegment] ?? s.segment}</td>
                      <td className="px-2 py-1.5 text-right">{num(s.open)}</td>
                      <td className="px-2 py-1.5 text-right">{money(s.openValue)}</td>
                      <td className="px-2 py-1.5 text-right">{num(s.won)}</td>
                      <td className="px-2 py-1.5 text-right">{money(s.wonValue)}</td>
                      <td className="px-2 py-1.5 text-right">{pctTxt(s.winRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        <p className="text-xs text-slate-500">
          Revenue counts every won deal, Sales Register imports included. Win rate, sales cycle, stages and forecast use deals run through the CRM only (the
          register has no lost deals or stage history).{" "}
          <Link href="/reports/sales-register" className="text-indigo-600 hover:text-indigo-700">
            Sales by product category → Sales Register
          </Link>
        </p>
      </div>
    </div>
  );
}
