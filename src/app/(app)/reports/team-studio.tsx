"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Copy, Pencil, Save, Trash2 } from "lucide-react";
import { ChartStudio, type StudioView } from "@/components/chart-studio/studio";
import type { Dataset, StudioConfig } from "@/components/chart-studio/engine";
import type { TeamStudioData } from "@/lib/team-studio-data";
import { TEAM_DATASETS } from "./team-datasets";
import { deleteStudioView, moveStudioView, renameStudioView, saveStudioView } from "./studio-actions";

// A Team Reports tab: the chart studio over deals / leads / activities /
// accounts, opened on the tab's saved layout. Changes are kept with Save
// changes (or as a new tab); a new tab is saved with a name.

export function TeamStudio({ data, tab }: { data: TeamStudioData; tab: StudioView | null }) {
  const router = useRouter();
  const datasets = useMemo<Dataset[]>(
    () => TEAM_DATASETS.map((d) => ({ ...d, rows: data[d.key as "deals" | "leads" | "activities" | "accounts"], targets: d.key === "deals" ? data.targets : undefined })),
    [data],
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(tab?.name ?? "");

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const run = async <T,>(f: () => Promise<T>) => {
    setBusy(true);
    try {
      return await f();
    } finally {
      setBusy(false);
    }
  };
  const saveNew = async (cfg: StudioConfig, suggested: string) => {
    const n = window.prompt("Name the tab", suggested)?.trim();
    if (!n) return;
    const res = await run(() => saveStudioView("team", { name: n, cfg }));
    if (res.error) return window.alert(res.error);
    setDirty(false);
    router.push(`/reports?tab=${res.id}`);
  };
  const save = async (cfg: StudioConfig) => {
    if (!tab) return saveNew(cfg, "My report");
    const res = await run(() => saveStudioView("team", { id: tab.id, name, cfg }));
    if (res.error) return window.alert(res.error);
    setDirty(false);
    router.refresh();
  };
  const rename = async () => {
    if (!tab) return;
    const n = window.prompt("Rename the tab", name)?.trim();
    if (!n || n === name) return;
    const res = await run(() => renameStudioView("team", tab.id, n));
    if (res.error) return window.alert(res.error);
    setName(n);
    router.refresh();
  };
  const move = async (by: -1 | 1) => {
    if (!tab) return;
    await run(() => moveStudioView("team", tab.id, by));
    router.refresh();
  };
  const remove = async () => {
    if (!tab || !window.confirm(`Delete the tab "${name}"? This can't be undone.`)) return;
    await run(() => deleteStudioView("team", tab.id));
    setDirty(false);
    router.push("/reports");
  };

  const btn = "inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  return (
    <ChartStudio
      datasets={datasets}
      initial={tab?.cfg ?? null}
      periodControl
      onChange={() => setDirty(true)}
      header={(cfg) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          {dirty && <span className="text-xs font-medium text-amber-600">Unsaved changes</span>}
          <button
            type="button"
            disabled={busy || (!!tab && !dirty)}
            onClick={() => save(cfg)}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {tab ? "Save changes" : "Save as tab"}
          </button>
          {tab && (
            <>
              <button type="button" disabled={busy} onClick={() => saveNew(cfg, `${name} (copy)`)} className={btn} title="Save this layout as a new tab">
                <Copy className="h-3.5 w-3.5" />
                Save as new tab
              </button>
              <button type="button" disabled={busy} onClick={rename} className={btn}>
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </button>
              <button type="button" disabled={busy} onClick={() => move(-1)} className={btn} title="Move the tab left">
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={busy} onClick={() => move(1)} className={btn} title="Move the tab right">
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={busy} onClick={remove} className={`${btn} text-rose-600 hover:bg-rose-50`}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete tab
              </button>
            </>
          )}
        </span>
      )}
    />
  );
}
