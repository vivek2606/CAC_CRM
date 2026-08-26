export type FunnelStage = { label: string; value: number };

// Sequential single-hue ramp (indigo), lightest -> darkest, one shade per
// ordered stage - these stages are a progression of one metric, not
// independent categories, so they don't get distinct categorical hues.
const STAGE_SHADES = ["#e0e7ff", "#c7d2fe", "#a5b4fc", "#6366f1", "#4338ca"];

export function ConversionFunnel({
  stages,
  formatValue = (n) => String(n),
}: {
  stages: FunnelStage[];
  formatValue?: (n: number) => string;
}) {
  const total = stages[0]?.value ?? 0;

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const pct = total > 0 ? Math.round((stage.value / total) * 100) : 0;
        const widthPct = total > 0 ? Math.max((stage.value / total) * 100, stage.value > 0 ? 6 : 0) : 0;
        const shadeIdx = stages.length > 1 ? Math.round((i / (stages.length - 1)) * (STAGE_SHADES.length - 1)) : 0;
        const shade = STAGE_SHADES[shadeIdx];
        const lightShade = shadeIdx <= 1;
        return (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between text-sm mb-1">
              <span className="font-medium text-slate-700">{stage.label}</span>
              <span className="text-slate-500">
                {formatValue(stage.value)} <span className="text-slate-400">({pct}%)</span>
              </span>
            </div>
            <div className="h-7 rounded-md bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-md flex items-center justify-end px-2 text-xs font-medium transition-all ${
                  lightShade ? "text-slate-700" : "text-white"
                }`}
                style={{ width: `${widthPct}%`, backgroundColor: shade, minWidth: stage.value > 0 ? "2.5rem" : 0 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
