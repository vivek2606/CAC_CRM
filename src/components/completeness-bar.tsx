// HubSpot-style property-completeness nudge: which optional-but-valuable
// fields are still blank on this record. Computed from the form's own
// defaultValues (the record as it currently stands), not live per-keystroke
// - the form fields it tracks are mostly uncontrolled inputs, and turning
// this into a live progress bar would mean controlling every one of them
// just to feed a hint. A static "here's what's missing" read on load still
// does the job: it's the same signal a Head sees reviewing a record.
export function CompletenessBar({ fields }: { fields: { label: string; filled: boolean }[] }) {
  const filledCount = fields.filter((f) => f.filled).length;
  const pct = fields.length > 0 ? Math.round((filledCount / fields.length) * 100) : 100;
  const missing = fields.filter((f) => !f.filled).map((f) => f.label);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-600">Profile completeness</span>
        <span className="text-xs font-semibold text-slate-700">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {missing.length > 0 && <p className="mt-1.5 text-xs text-slate-400">Missing: {missing.join(", ")}</p>}
    </div>
  );
}
