import { prisma } from "@/lib/prisma";
import { requireUser, isBackOffice } from "@/lib/rbac";
import { blockServiceManager } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { SALES_TITLE_IN } from "@/lib/team-titles";
import { getStandards, weeklyCounts, metCount, STANDARD_KEYS, STANDARD_LABEL } from "@/lib/activity-standards";
import { Scorecard } from "./scorecard";
import { StandardsForm } from "./standards-form";

// Activity standards: this week against the weekly minimums, and the last
// 8 weeks. A sales person sees their own; the Head and the Coordinator see
// each sales person; the Head sets the minimums.

const WEEKS = 8;
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function StandardsPage() {
  await blockServiceManager();
  const user = await requireUser();
  const backOffice = isBackOffice(user);
  const people = backOffice
    ? await prisma.user.findMany({ where: { isActive: true, title: SALES_TITLE_IN }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [{ id: user.id, name: user.name ?? "Me" }];
  const [standards, { mondays, byUser }] = await Promise.all([getStandards(), weeklyCounts(people.map((p) => p.id), WEEKS)]);
  const thisWeek = mondays.length - 1;
  const th = "py-1.5 pr-3 text-xs font-medium uppercase tracking-wide text-slate-400";
  const tone = (met: number) => (met === 4 ? "bg-emerald-100 text-emerald-800" : met >= 2 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700");

  return (
    <div>
      <PageHeader
        title="Activity standards"
        description={`Weekly minimums: ${STANDARD_KEYS.map((k) => `${standards[k]} ${STANDARD_LABEL[k].toLowerCase()}`).join(", ")} - week of ${short(mondays[thisWeek])}`}
      />
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        {!backOffice && (
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">This week</h2>
            <Scorecard counts={byUser[user.id][thisWeek]} standards={standards} />
          </Card>
        )}

        {backOffice && (
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">This week, each sales person</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className={th}>Sales person</th>
                    {STANDARD_KEYS.map((k) => (
                      <th key={k} className={`${th} text-right`}>
                        {STANDARD_LABEL[k]} ({standards[k]})
                      </th>
                    ))}
                    <th className={`${th} text-right`}>Met</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {people.map((p) => {
                    const c = byUser[p.id][thisWeek];
                    const met = metCount(c, standards);
                    return (
                      <tr key={p.id}>
                        <td className="py-1.5 pr-3 text-slate-800">{p.name}</td>
                        {STANDARD_KEYS.map((k) => (
                          <td key={k} className={`py-1.5 pr-3 text-right tabular-nums ${c[k] >= standards[k] ? "text-emerald-700" : "text-rose-700"}`}>
                            {c[k]}
                          </td>
                        ))}
                        <td className="py-1.5 pr-3 text-right">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tone(met)}`}>{met} of 4</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">The week runs Monday to Sunday and is still running.</p>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Last {WEEKS} weeks - minimums met (of 4)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className={th}>{backOffice ? "Sales person" : "Week of"}</th>
                  {backOffice
                    ? mondays.map((m) => (
                        <th key={m} className={`${th} text-center`}>
                          {short(m)}
                        </th>
                      ))
                    : STANDARD_KEYS.map((k) => (
                        <th key={k} className={`${th} text-right`}>
                          {STANDARD_LABEL[k]}
                        </th>
                      ))}
                  {!backOffice && <th className={`${th} text-right`}>Met</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backOffice
                  ? people.map((p) => (
                      <tr key={p.id}>
                        <td className="py-1.5 pr-3 text-slate-800">{p.name}</td>
                        {byUser[p.id].map((c, i) => {
                          const met = metCount(c, standards);
                          return (
                            <td key={i} className="py-1.5 pr-1 text-center" title={STANDARD_KEYS.map((k) => `${STANDARD_LABEL[k]} ${c[k]}`).join(", ")}>
                              <span className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${tone(met)}`}>{met}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  : [...mondays.keys()].reverse().map((i) => {
                      const c = byUser[user.id][i];
                      const met = metCount(c, standards);
                      return (
                        <tr key={i}>
                          <td className="py-1.5 pr-3 text-slate-800">
                            {short(mondays[i])}
                            {i === thisWeek && <span className="text-xs text-slate-400"> (this week)</span>}
                          </td>
                          {STANDARD_KEYS.map((k) => (
                            <td key={k} className={`py-1.5 pr-3 text-right tabular-nums ${c[k] >= standards[k] ? "text-emerald-700" : "text-slate-700"}`}>
                              {c[k]}
                            </td>
                          ))}
                          <td className="py-1.5 pr-3 text-right">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tone(met)}`}>{met} of 4</span>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Calls and site visits count when marked done; quotations when issued (not drafts); leads when created.</p>
        </Card>

        {user.role === "HEAD" && (
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Weekly minimums</h2>
            <StandardsForm standards={standards} />
          </Card>
        )}
      </div>
    </div>
  );
}
