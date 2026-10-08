import { useId, useState } from 'react';
import { toDayNumber } from '@fitapp/domain';

export interface ChartPoint {
  date: string;
  value: number;
}
export interface ChartSeries {
  id: string;
  label: string;
  points: ChartPoint[];
  color: string;
  area?: boolean;
  width?: number;
  dots?: boolean;
  faint?: boolean;
}

const W = 340;

export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw) as number;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function smooth(pts: Array<[number, number]>): string {
  if (pts.length === 0) return '';
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const mx = (x0 + x1) / 2;
    d += ` C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

export function LineChart({ series, height = 220, formatY, formatX, formatTip, ariaLabel }: { series: ChartSeries[]; height?: number; formatY: (v: number) => string; formatX: (date: string) => string; formatTip?: (p: ChartPoint) => string; ariaLabel: string }) {
  const gid = useId();
  const [active, setActive] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  const pl = 40;
  const pr = 12;
  const pt = 18;
  const pb = 26;
  const H = height;
  if (all.length === 0) return null;

  const days = all.map((p) => toDayNumber(p.date));
  let dMin = Math.min(...days);
  let dMax = Math.max(...days);
  if (dMax === dMin) {
    dMin -= 3;
    dMax += 3;
  }
  let vMin = Math.min(...all.map((p) => p.value));
  let vMax = Math.max(...all.map((p) => p.value));
  const pad = (vMax - vMin || 1) * 0.12;
  vMin -= pad;
  vMax += pad;
  const ticks = niceTicks(vMin, vMax, 4);
  vMin = Math.min(vMin, ticks[0] as number);
  vMax = Math.max(vMax, ticks[ticks.length - 1] as number);
  const x = (date: string) => pl + ((toDayNumber(date) - dMin) / (dMax - dMin)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - (v - vMin) / (vMax - vMin)) * (H - pt - pb);

  const primary = series[0]?.points ?? [];
  const xTicks = (() => {
    const n = Math.min(4, Math.max(2, primary.length));
    const out: string[] = [];
    const dates = [...new Set(all.map((p) => p.date))].sort();
    for (let i = 0; i < n; i++) out.push(dates[Math.round((i * (dates.length - 1)) / (n - 1 || 1))] as string);
    return [...new Set(out)];
  })();

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (primary.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bd = Infinity;
    primary.forEach((p, i) => {
      const dd = Math.abs(x(p.date) - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setActive(best);
  };
  const act = active !== null ? primary[active] : undefined;
  const lastPoint = primary[primary.length - 1];
  const shown = act ?? lastPoint;
  const tip = shown ? (formatTip ? formatTip(shown) : `${formatY(shown.value)} · ${formatX(shown.date)}`) : '';
  const tx = shown ? Math.min(Math.max(x(shown.date), pl + 40), W - pr - 40) : 0;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActive(null)}>
      <defs>
        {series.map((s) => (
          <linearGradient key={s.id} id={`${gid}-${s.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="#e8ecf0" strokeWidth="1" />
          <text x={pl - 8} y={y(t) + 4} textAnchor="end">
            {formatY(t)}
          </text>
        </g>
      ))}
      {xTicks.map((d, i) => (
        <text key={d} x={x(d)} y={H - 6} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 && xTicks.length > 1 ? 'end' : 'middle'}>
          {formatX(d)}
        </text>
      ))}
      {series.map((s) => {
        const pts = s.points.map((p) => [x(p.date), y(p.value)] as [number, number]);
        if (pts.length === 0) return null;
        const line = pts.length === 1 ? '' : smooth(pts);
        return (
          <g key={s.id}>
            {s.area && pts.length > 1 && <path d={`${line} L${pts[pts.length - 1]![0]} ${H - pb} L${pts[0]![0]} ${H - pb} Z`} fill={`url(#${gid}-${s.id})`} />}
            {pts.length > 1 && <path d={line} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={s.faint ? 0.55 : 1} />}
            {s.dots && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.6} fill="#fff" stroke={s.color} strokeWidth="1.6" opacity={s.faint ? 0.8 : 1} />)}
          </g>
        );
      })}
      {shown && (
        <g>
          <line x1={x(shown.date)} x2={x(shown.date)} y1={pt} y2={H - pb} stroke="#065f46" strokeOpacity="0.25" strokeDasharray="3 4" />
          <circle cx={x(shown.date)} cy={y(shown.value)} r={5.5} fill="#065f46" stroke="#fff" strokeWidth="2.5" />
          <text className="tip" x={tx} y={pt - 5} textAnchor="middle">
            {tip}
          </text>
        </g>
      )}
    </svg>
  );
}

export function Sparkline({ values, color = '#16a34a', height = 52 }: { values: number[]; color?: string; height?: number }) {
  const gid = useId();
  if (values.length < 2) return null;
  const w = 160;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, 4 + (1 - (v - min) / span) * (height - 8)] as [number, number]);
  const line = smooth(pts);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${height} L0 ${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
