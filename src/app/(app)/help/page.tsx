import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { isServiceManager } from "@/lib/service-access";
import { PageHeader, Card } from "@/components/ui";
import { MiniMarkdown } from "@/components/mini-markdown";
import { HELP_INTRO, HELP_SECTIONS, helpAudience } from "@/lib/help-guide";

// The user guide, with the sections for the viewer's role (the Head can
// show every section).

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const who = (await isServiceManager(user)) ? "service" : helpAudience(user);
  const showAll = who === "head" || sp.all === "1";
  const sections = showAll ? HELP_SECTIONS : HELP_SECTIONS.filter((s) => s.for.includes(who));
  const hidden = HELP_SECTIONS.length - sections.length;

  return (
    <div>
      <PageHeader title="Help & User Guide" description="How to use the CRM - and get the most out of it" />
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        <Card className="p-5">
          <p className="text-sm leading-relaxed text-slate-700">{HELP_INTRO}</p>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Sections">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                {s.title}
              </a>
            ))}
          </nav>
          {who !== "head" && (
            <p className="mt-3 text-xs text-slate-500">
              {hidden > 0 ? (
                <>
                  Showing the sections for your role.{" "}
                  <Link href="/help?all=1" className="text-indigo-600 hover:underline">
                    Show all sections
                  </Link>
                </>
              ) : sp.all === "1" ? (
                <Link href="/help" className="text-indigo-600 hover:underline">
                  Show only the sections for my role
                </Link>
              ) : null}
            </p>
          )}
        </Card>
        {sections.map((s) => (
          <Card key={s.id} className="scroll-mt-28 p-5">
            <section id={s.id}>
              <h2 className="mb-3 text-base font-semibold text-slate-900">{s.title}</h2>
              <MiniMarkdown text={s.body} />
            </section>
          </Card>
        ))}
      </div>
    </div>
  );
}
