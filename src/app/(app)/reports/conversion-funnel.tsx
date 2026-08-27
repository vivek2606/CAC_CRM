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

  // Each stage's width as a % of the track, floored so a real but small
  // value still reads as a sliver rather than disappearing.
  const widthPcts = stages.map((s) => (total > 0 ? Math.max((s.value / total) * 100, s.value > 0 ? 8 : 0) : 0));

  return (
    <div className="space-y-0.5">
      {stages.map((stage, i) => {
        const pct = total > 0 ? Math.round((stage.value / total) * 100) : 0;
        const topPct = widthPcts[i];
        const bottomPct = i < stages.length - 1 ? widthPcts[i + 1] : widthPcts[i];
        const shadeIdx = stages.length > 1 ? Math.round((i / (stages.length - 1)) * (STAGE_SHADES.length - 1)) : 0;
        const shade = STAGE_SHADES[shadeIdx];

        return (
          <div key={stage.label}>
            <div className="flex items-baseline justify-between text-sm mb-1">
              <span className="font-medium text-slate-700">{stage.label}</span>
              <span className="text-slate-500">
                {formatValue(stage.value)} <span className="text-slate-400">({pct}%)</span>
              </span>
            </div>
            <div className="relative h-14 rounded-md bg-slate-50">
              <div
                title={`${stage.label}: ${formatValue(stage.value)} (${pct}%)`}
                className="absolute inset-0 transition-all"
                style={{
                  backgroundColor: stage.value > 0 ? shade : "transparent",
                  clipPath: `polygon(${50 - topPct / 2}% 0%, ${50 + topPct / 2}% 0%, ${50 + bottomPct / 2}% 100%, ${50 - bottomPct / 2}% 100%)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
