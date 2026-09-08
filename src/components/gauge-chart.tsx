// Semicircle speedometer/gauge: value as a share of target, filled arc +
// target marker, colored by status zone (behind / near / on-track) rather
// than a categorical hue - this is state, not identity, so it uses the
// app's existing status colors (rose/amber/emerald, the same ones already
// used for LOST/PROPOSAL/WON elsewhere) rather than inventing new ones.
const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 80;
const STROKE = 16;

function pointAt(t: number, radius: number): { x: number; y: number } {
  const angle = ((180 - 180 * t) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER - radius * Math.sin(angle) };
}

function arcPath(t0: number, t1: number, radius: number): string {
  const start = pointAt(t0, radius);
  const end = pointAt(t1, radius);
  const largeArc = t1 - t0 > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function zoneColor(pct: number): string {
  if (pct >= 85) return "#10b981"; // emerald - on track
  if (pct >= 50) return "#f59e0b"; // amber - near
  return "#f43f5e"; // rose - behind
}

export function GaugeChart({
  value,
  target,
  valueLabel,
  targetLabel,
}: {
  value: number;
  target: number;
  valueLabel: string;
  targetLabel: string;
}) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  const filledT = Math.min(1, Math.max(0, pct / 100));
  const color = zoneColor(pct);
  const targetTick = pointAt(1, RADIUS);
  const targetTickInner = pointAt(1, RADIUS - STROKE - 4);

  return (
    <div className="flex flex-col items-center">
      <svg width={SIZE} height={SIZE / 2 + 16} viewBox={`0 0 ${SIZE} ${SIZE / 2 + 16}`}>
        <path d={arcPath(0, 1, RADIUS)} fill="none" stroke="#e2e8f0" strokeWidth={STROKE} strokeLinecap="round" />
        {filledT > 0 && (
          <path d={arcPath(0, filledT, RADIUS)} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
        )}
        <line
          x1={targetTickInner.x}
          y1={targetTickInner.y}
          x2={targetTick.x}
          y2={targetTick.y}
          stroke="#334155"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <text x={CENTER} y={CENTER - 8} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 30, fontWeight: 600 }}>
          {pct}%
        </text>
        <text x={CENTER} y={CENTER + 14} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 11 }}>
          of target
        </text>
      </svg>
      <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
        <span>
          <span className="font-medium text-slate-700">{valueLabel}</span> actual
        </span>
        <span className="text-slate-300">|</span>
        <span>
          <span className="font-medium text-slate-700">{targetLabel}</span> target
        </span>
      </div>
    </div>
  );
}
