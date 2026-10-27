"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  Label,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { CATEGORY_OTHER_COLOR, CATEGORY_PALETTE, MAX_CATEGORY_SLOTS, OTHER_CATEGORY_LABEL } from "@/lib/category-colors";
import { formatAxisCurrency, formatCompactCurrency } from "@/lib/format";
import { acc, isTime, labelOf, measureInfo, merge, valueOf, type Measure, type Pivot, type PivotField, type PivotGroup } from "./pivot-engine";

export type ChartType =
  | "bar"
  | "column"
  | "clustered"
  | "percent"
  | "line"
  | "area"
  | "donut"
  | "pie"
  | "treemap"
  | "funnel"
  | "radar"
  | "heatmap"
  | "scatter"
  | "column3d"
  | "target";

const INK = "#334155";
const MUTED = "#64748b";
const GRID = "#eef2f6";
const SURFACE = "#ffffff";
const tick = { fontSize: 11, fill: MUTED };
const tipStyle = { contentStyle: { borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12 }, itemStyle: { color: INK }, cursor: { fill: "#f8fafc" } };

// Darker / lighter shade of a hex colour (the 3D faces).
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (c: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => ch(c).toString(16).padStart(2, "0")).join("")}`;
}

// A column with a top and a side face.
function Column3D(props: unknown) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    fill = CATEGORY_PALETTE[0],
  } = props as { x?: number; y?: number; width?: number; height?: number; fill?: string };
  if (!height || height < 0) return null;
  const d = Math.min(12, width * 0.35);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} />
      <polygon points={`${x},${y} ${x + d},${y - d} ${x + width + d},${y - d} ${x + width},${y}`} fill={shade(fill, 0.35)} />
      <polygon points={`${x + width},${y} ${x + width + d},${y - d} ${x + width + d},${y + height - d} ${x + width},${y + height}`} fill={shade(fill, -0.25)} />
    </g>
  );
}

export function PivotChart({
  pivot,
  rowField,
  colField,
  values,
  type,
  top,
  labels,
  height,
  onPick,
}: {
  pivot: Pivot;
  rowField: PivotField | null;
  colField: PivotField | null;
  values: Measure[];
  type: ChartType;
  top: number; // 0 = all
  labels: boolean;
  height: number;
  onPick: (rowKey: string) => void;
}) {
  const m = values[0] ?? "amount";
  const info = measureInfo(m);
  const money = !!info.money;
  const pct = !!info.pct;
  const fmtAxis = (x: unknown) =>
    money ? formatAxisCurrency(Number(x)) : pct ? `${Math.round(Number(x))}%` : Number(x).toLocaleString("en-NG", { maximumFractionDigits: 1 });
  const fmtTip = (x: unknown) =>
    money ? formatCompactCurrency(Number(x)) : pct ? `${Number(x).toFixed(1)}%` : Number(x).toLocaleString("en-NG", { maximumFractionDigits: 2 });
  const fmtLabel = (x: unknown) => (Number(x) ? fmtAxis(x) : "");
  const clickKey = (d: unknown) => {
    const o = d as { payload?: { key?: string }; key?: string } | undefined;
    const k = o?.payload?.key ?? o?.key;
    if (k && rowField) onPick(k);
  };
  const time = isTime(rowField);
  const rows: PivotGroup[] = !time && top ? pivot.rowList.slice(0, top) : pivot.rowList;

  // Series: the Columns field's largest values (8) + "Other", or one series.
  const seriesKeys = colField ? pivot.colList.slice(0, MAX_CATEGORY_SLOTS) : [];
  const hasOther = !!colField && pivot.colList.length > MAX_CATEGORY_SLOTS;
  const series = colField ? [...seriesKeys.map((k) => labelOf(colField, k)), ...(hasOther ? [OTHER_CATEGORY_LABEL] : [])] : [info.short];
  const colors = series.map((_, i) => (hasOther && i === series.length - 1 ? CATEGORY_OTHER_COLOR : CATEGORY_PALETTE[i]));
  const data = rows.map((g) => {
    const d: Record<string, string | number> = { key: g.key, label: labelOf(rowField, g.key), __total: valueOf(g.total, m) };
    if (!colField) d[info.short] = valueOf(g.total, m);
    else {
      seriesKeys.forEach((k, i) => (d[series[i]] = valueOf(g.cells.get(k), m)));
      if (hasOther) {
        const rest = acc();
        for (const k of pivot.colList.slice(MAX_CATEGORY_SLOTS)) merge(rest, g.cells.get(k));
        d[OTHER_CATEGORY_LABEL] = valueOf(rest, m);
      }
    }
    return d;
  });
  const multi = series.length > 1;
  // Legends keep the series order (not A-Z) and use ink for the text.
  const legendText = (v: unknown) => <span style={{ color: INK }}>{String(v)}</span>;
  const inOrder = (names: string[]) => (it: unknown) => names.indexOf(String((it as { value?: unknown }).value));
  const legend = multi ? <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} itemSorter={inOrder(series)} /> : null;

  if (!data.length) return <p className="py-10 text-center text-sm text-slate-500">Nothing to chart.</p>;

  // Slices (donut / pie / treemap / funnel): the rows, the largest 8 + Other.
  const slices = (() => {
    const ranked = [...rows].sort((a, b) => valueOf(b.total, m) - valueOf(a.total, m));
    const keep = ranked.slice(0, MAX_CATEGORY_SLOTS);
    const rest = ranked.slice(MAX_CATEGORY_SLOTS);
    const out = keep.map((g, i) => ({ key: g.key, name: labelOf(rowField, g.key), value: valueOf(g.total, m), fill: CATEGORY_PALETTE[i] }));
    if (rest.length) {
      const a = acc();
      for (const g of rest) merge(a, g.total);
      out.push({ key: "", name: `${OTHER_CATEGORY_LABEL} (${rest.length})`, value: valueOf(a, m), fill: CATEGORY_OTHER_COLOR });
    }
    return out.filter((s) => s.value > 0);
  })();

  if ((type === "target" || values.some((v) => measureInfo(v).target)) && !pivot.targetOk)
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        Targets are set per sales person per month - group by Sales person, Invoice month, quarter or year to see them (not by product or customer).
      </p>
    );

  switch (type) {
    case "target": {
      // Achieved (columns) against the target (line), on one axis.
      const rowsT = rows.map((g) => ({
        key: g.key,
        label: labelOf(rowField, g.key),
        Achieved: g.total.amount,
        Target: g.total.target,
        pct: g.total.target ? (g.total.amount / g.total.target) * 100 : null,
      }));
      // Over time the target is a line; per person / group a marker on each bar.
      const tilt = rowsT.length > 12 || (!time && rowsT.length > 5);
      const marker = (p: unknown) => {
        const { cx, cy, payload } = p as { cx?: number; cy?: number; payload?: { Target?: number } };
        if (cx == null || cy == null || !payload?.Target) return <g />;
        return <line x1={cx - 16} x2={cx + 16} y1={cy} y2={cy} stroke={INK} strokeWidth={3} strokeLinecap="round" />;
      };
      return (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={rowsT} margin={{ top: 20, right: 24, left: 0, bottom: tilt ? 50 : 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={0} angle={tilt ? -35 : 0} textAnchor={tilt ? "end" : "middle"} height={tilt ? 80 : 30} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={64} tickFormatter={(x) => formatAxisCurrency(Number(x))} />
            <Tooltip
              {...tipStyle}
              formatter={(x, n, item) => {
                const p = (item as { payload?: { pct?: number | null } }).payload?.pct;
                return [n === "Achieved" && p != null ? `${formatCompactCurrency(Number(x))} (${p.toFixed(1)}% of target)` : formatCompactCurrency(Number(x)), n];
              }}
            />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} formatter={legendText} />
            <Bar dataKey="Achieved" fill={CATEGORY_PALETTE[0]} radius={[4, 4, 0, 0]} maxBarSize={44} cursor="pointer" onClick={clickKey} isAnimationActive={false}>
              {labels && <LabelList dataKey="pct" position="top" style={{ fontSize: 10, fontWeight: 600, fill: INK }} formatter={(x: unknown) => (x == null ? "" : `${Number(x).toFixed(0)}%`)} />}
            </Bar>
            {time ? (
              <Line dataKey="Target" type="monotone" stroke={INK} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4, fill: SURFACE, stroke: INK, strokeWidth: 2 }} isAnimationActive={false} />
            ) : (
              <Line dataKey="Target" stroke={INK} strokeWidth={0} dot={marker} activeDot={false} legendType="plainline" isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }
    case "bar":
      return (
        <ResponsiveContainer width="100%" height={Math.max(height, data.length * 28 + 60)}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={tick} axisLine={false} tickLine={false} tickFormatter={fmtAxis} />
            <YAxis type="category" dataKey="label" tick={tick} axisLine={false} tickLine={false} width={170} />
            <Tooltip formatter={(x, n) => [fmtTip(x), n]} {...tipStyle} />
            {legend}
            {series.map((s, i) => (
              <Bar
                key={s}
                dataKey={s}
                stackId="s"
                fill={colors[i]}
                stroke={SURFACE}
                strokeWidth={multi ? 2 : 0}
                radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
                maxBarSize={22}
                cursor="pointer"
                onClick={clickKey}
              >
                {labels && !multi && <LabelList dataKey={s} position="right" style={{ fontSize: 11, fontWeight: 600, fill: INK }} formatter={fmtLabel} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    case "column":
    case "clustered":
    case "percent":
    case "column3d": {
      const stacked = type === "column" || type === "percent";
      const is3d = type === "column3d";
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            stackOffset={type === "percent" ? "expand" : undefined}
            margin={{ top: is3d ? 20 : 12, right: 16, left: 0, bottom: data.length > 12 ? 50 : 0 }}
            barGap={is3d ? 8 : 2}
          >
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tick={tick}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={data.length > 12 ? -40 : 0}
              textAnchor={data.length > 12 ? "end" : "middle"}
              height={data.length > 12 ? 70 : 30}
            />
            <YAxis
              tick={tick}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={type === "percent" ? (x) => `${Math.round(Number(x) * 100)}%` : fmtAxis}
            />
            <Tooltip formatter={(x, n) => [fmtTip(x), n]} {...tipStyle} />
            {legend}
            {series.map((s, i) => (
              <Bar
                key={s}
                dataKey={s}
                stackId={stacked ? "s" : undefined}
                fill={colors[i]}
                stroke={is3d ? undefined : SURFACE}
                strokeWidth={is3d || !multi ? 0 : stacked ? 2 : 1}
                radius={is3d ? 0 : stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]}
                maxBarSize={is3d ? 36 : 44}
                shape={is3d ? Column3D : undefined}
                cursor="pointer"
                onClick={clickKey}
              >
                {labels && !multi && type !== "percent" && (
                  <LabelList dataKey={s} position="top" offset={is3d ? 14 : 5} style={{ fontSize: 10, fontWeight: 600, fill: INK }} formatter={fmtLabel} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "line":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 12, right: 24, left: 0, bottom: data.length > 12 ? 50 : 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tick={tick}
              axisLine={false}
              tickLine={false}
              interval={data.length > 24 ? "preserveStartEnd" : 0}
              angle={data.length > 12 ? -40 : 0}
              textAnchor={data.length > 12 ? "end" : "middle"}
              height={data.length > 12 ? 70 : 30}
            />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={64} tickFormatter={fmtAxis} />
            <Tooltip formatter={(x, n) => [fmtTip(x), n]} {...tipStyle} cursor={{ stroke: "#cbd5e1" }} />
            {legend}
            {series.map((s, i) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={colors[i]}
                strokeWidth={2}
                dot={{ r: 4, fill: colors[i], stroke: SURFACE, strokeWidth: 2 }}
                activeDot={{ r: 6, onClick: (_e: unknown, p: unknown) => clickKey(p) }}
              >
                {labels && !multi && <LabelList dataKey={s} position="top" style={{ fontSize: 10, fontWeight: 600, fill: INK }} formatter={fmtLabel} />}
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    case "area":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 12, right: 24, left: 0, bottom: data.length > 12 ? 50 : 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tick={tick}
              axisLine={false}
              tickLine={false}
              interval={data.length > 24 ? "preserveStartEnd" : 0}
              angle={data.length > 12 ? -40 : 0}
              textAnchor={data.length > 12 ? "end" : "middle"}
              height={data.length > 12 ? 70 : 30}
            />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={64} tickFormatter={fmtAxis} />
            <Tooltip formatter={(x, n) => [fmtTip(x), n]} {...tipStyle} cursor={{ stroke: "#cbd5e1" }} />
            {legend}
            {series.map((s, i) => (
              <Area key={s} type="monotone" dataKey={s} stackId="s" stroke={colors[i]} strokeWidth={2} fill={colors[i]} fillOpacity={0.35} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    case "donut":
    case "pie": {
      const total = slices.reduce((t, s) => t + s.value, 0);
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Tooltip formatter={(x, n) => [`${fmtTip(x)} (${total ? ((Number(x) / total) * 100).toFixed(1) : 0}%)`, n]} {...tipStyle} />
            <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} itemSorter={inOrder(slices.map((x) => x.name))} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={type === "donut" ? "55%" : 0}
              outerRadius="80%"
              paddingAngle={type === "donut" ? 1.5 : 0}
              stroke={SURFACE}
              strokeWidth={2}
              cursor="pointer"
              onClick={clickKey}
              label={
                labels
                  ? (p: { x?: number; y?: number; percent?: number; textAnchor?: string }) => (
                      <text x={p.x} y={p.y} fill={INK} fontSize={11} textAnchor={p.textAnchor as "start" | "middle" | "end"} dominantBaseline="central">
                        {`${((p.percent ?? 0) * 100).toFixed(1)}%`}
                      </text>
                    )
                  : false
              }
              labelLine={labels}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.fill} />
              ))}
              {type === "donut" && <Label position="center" value={fmtTip(total)} fill={INK} style={{ fontSize: 14, fontWeight: 700 }} />}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }
    case "treemap":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <Treemap
            data={slices.map((s) => ({ ...s, size: s.value }))}
            dataKey="size"
            nameKey="name"
            stroke={SURFACE}
            isAnimationActive={false}
            onClick={clickKey}
            content={(p: unknown) => {
              const {
                x = 0,
                y = 0,
                width = 0,
                height: h = 0,
                name,
                value,
                fill,
              } = p as { x?: number; y?: number; width?: number; height?: number; name?: string; value?: number; fill?: string };
              return (
                <g style={{ cursor: "pointer" }}>
                  <rect x={x} y={y} width={width} height={h} fill={fill} stroke={SURFACE} strokeWidth={2} rx={4} />
                  {width > 70 && h > 34 && (
                    <>
                      <text x={x + 8} y={y + 18} fill="#fff" style={{ fontSize: 12, fontWeight: 600 }}>
                        {String(name).length > width / 7 ? `${String(name).slice(0, Math.floor(width / 7) - 1)}…` : name}
                      </text>
                      <text x={x + 8} y={y + 34} fill="#fff" style={{ fontSize: 11 }}>
                        {fmtTip(value)}
                      </text>
                    </>
                  )}
                </g>
              );
            }}
          >
            <Tooltip formatter={(x) => fmtTip(x)} {...tipStyle} />
          </Treemap>
        </ResponsiveContainer>
      );
    case "funnel":
      return (
        <ResponsiveContainer width="100%" height={height}>
          <FunnelChart margin={{ right: 160 }}>
            <Tooltip formatter={(x) => fmtTip(x)} {...tipStyle} />
            <Funnel
              data={[...slices].sort((a, b) => b.value - a.value)}
              dataKey="value"
              nameKey="name"
              stroke={SURFACE}
              strokeWidth={2}
              isAnimationActive={false}
              onClick={clickKey}
            >
              <LabelList position="right" dataKey="name" style={{ fontSize: 12, fill: INK }} />
              {labels && <LabelList position="center" dataKey="value" formatter={fmtLabel} style={{ fontSize: 11, fontWeight: 600, fill: "#fff" }} />}
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      );
    case "radar": {
      const axes = data.slice(0, 12);
      return (
        <ResponsiveContainer width="100%" height={height}>
          <RadarChart data={axes} outerRadius="75%">
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} />
            <PolarRadiusAxis tick={{ fontSize: 10, fill: MUTED }} tickFormatter={fmtAxis} angle={90} />
            <Tooltip formatter={(x, n) => [fmtTip(x), n]} {...tipStyle} />
            {legend}
            {series.map((s, i) => (
              <Radar key={s} dataKey={s} stroke={colors[i]} strokeWidth={2} fill={colors[i]} fillOpacity={0.15} dot={{ r: 3, fill: colors[i] }} />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      );
    }
    case "scatter": {
      const m2 = values[1];
      if (!m2)
        return (
          <p className="py-10 text-center text-sm text-slate-500">
            A scatter plots two values against each other - drag a second field into Values (e.g. Sum of qty).
          </p>
        );
      const i2 = measureInfo(m2);
      const fmt2 = (x: unknown) => (i2.money ? formatAxisCurrency(Number(x)) : Number(x).toLocaleString("en-NG", { maximumFractionDigits: 1 }));
      const pts = rows.map((g) => ({ key: g.key, name: labelOf(rowField, g.key), x: valueOf(g.total, m), y: valueOf(g.total, m2), z: g.total.lines }));
      return (
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart margin={{ top: 12, right: 24, left: 0, bottom: 20 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              type="number"
              dataKey="x"
              name={info.short}
              tick={tick}
              tickFormatter={fmtAxis}
              label={{ value: info.label, position: "insideBottom", offset: -12, fontSize: 11, fill: MUTED }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={i2.short}
              tick={tick}
              tickFormatter={fmt2}
              width={64}
              label={{ value: i2.short, angle: -90, position: "insideLeft", fontSize: 11, fill: MUTED }}
            />
            <ZAxis type="number" dataKey="z" range={[60, 400]} name="Lines" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={tipStyle.contentStyle}
              itemStyle={tipStyle.itemStyle}
              formatter={(x, n) => [
                n === info.short
                  ? fmtTip(x)
                  : n === i2.short
                    ? i2.money
                      ? formatCompactCurrency(Number(x))
                      : Number(x).toLocaleString("en-NG")
                    : Number(x).toLocaleString("en-NG"),
                n,
              ]}
              labelFormatter={() => ""}
            />
            <Scatter data={pts} fill={CATEGORY_PALETTE[0]} fillOpacity={0.75} stroke={SURFACE} strokeWidth={1.5} cursor="pointer" onClick={clickKey}>
              {labels && <LabelList dataKey="name" position="top" style={{ fontSize: 10, fill: INK }} />}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      );
    }
    case "heatmap": {
      const cols = colField ? pivot.colList.slice(0, 24) : [];
      const cellsOf = (g: PivotGroup) => (colField ? cols.map((c) => valueOf(g.cells.get(c), m)) : [valueOf(g.total, m)]);
      const all = rows.flatMap(cellsOf);
      const max = Math.max(0, ...all);
      // One hue, light -> dark (sequential).
      const bg = (v: number) => {
        if (v <= 0 || !max) return "#f8fafc";
        const t = 0.12 + 0.88 * (v / max);
        return `color-mix(in oklab, #1c5aa3 ${Math.round(t * 100)}%, #e8f1fc)`;
      };
      return (
        <div className="overflow-auto" style={{ maxHeight: height + 120 }}>
          <table className="w-full border-separate text-[11px]" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th />
                {(colField ? cols.map((c) => labelOf(colField, c)) : [info.short]).map((c) => (
                  <th key={c} className="px-1 py-1 text-center font-medium text-slate-500 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.key}>
                  <td className="pr-2 text-right whitespace-nowrap">
                    <button type="button" onClick={() => rowField && onPick(g.key)} className="text-slate-700 hover:text-indigo-600">
                      {labelOf(rowField, g.key)}
                    </button>
                  </td>
                  {cellsOf(g).map((v, i) => (
                    <td
                      key={i}
                      title={fmtTip(v)}
                      className="rounded px-1.5 py-1.5 text-center tabular-nums"
                      style={{ background: bg(v), color: max && v / max > 0.45 ? "#fff" : INK, minWidth: 54 }}
                    >
                      {labels && v ? fmtAxis(v) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!colField && <p className="mt-2 text-xs text-slate-400">Drag a field into Columns to make a grid (e.g. Invoice month).</p>}
        </div>
      );
    }
  }
}
