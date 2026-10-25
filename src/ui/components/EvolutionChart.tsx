import { useState } from 'react';
import { MIN_SAMPLE, type DayPoint } from '../../domain/stats';
import { pct, shortDay } from '../format';

/**
 * Two aligned charts sharing the day axis (never a dual axis): the success
 * rate per day (line, 0-100 %) and the number of answers per day (columns).
 * Days with fewer than MIN_SAMPLE answers are drawn hollow. Tap a day for details.
 */
export function EvolutionChart({ points }: { points: DayPoint[] }) {
  const last = [...points].reverse().find((p) => p.n > 0) ?? null;
  const [active, setActive] = useState<DayPoint | null>(null);
  const shown = active ?? last;
  const W = 320;
  const left = 30;
  const right = 6;
  const plotW = W - left - right;
  const band = plotW / points.length;
  const x = (i: number) => left + band * i + band / 2;
  // Rate chart
  const RT = 8;
  const RH = 96;
  const ry = (v: number) => RT + RH * (1 - v);
  // Volume chart
  const VT = RT + RH + 18;
  const VH = 34;
  const maxN = Math.max(1, ...points.map((p) => p.n));
  const H = VT + VH + 18;
  const bar = Math.min(10, Math.max(2, band - 2));
  const withData = points.map((p, i) => ({ p, i })).filter(({ p }) => p.n > 0);
  const line = withData.map(({ p, i }, k) => `${k ? 'L' : 'M'}${x(i)},${ry(p.accuracy ?? 0)}`).join(' ');
  const labelEvery = points.length > 14 ? 7 : points.length > 7 ? 2 : 1;

  return (
    <div className="chart">
      <div className="chart-readout" aria-live="polite">
        {shown ? (
          <>
            <strong>{shortDay(shown.day)}</strong>
            <span className="num">{shown.n ? pct(shown.accuracy) : '—'}</span>
            <span className="faint num">
              {shown.n} réponse{shown.n > 1 ? 's' : ''}
              {shown.n > 0 && shown.n < MIN_SAMPLE ? ' · peu de données' : ''}
            </span>
          </>
        ) : (
          <span className="faint">Aucune réponse sur la période</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Réussite et nombre de réponses par jour">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={left} x2={W - right} y1={ry(v)} y2={ry(v)} className="chart-grid" />
            <text x={left - 6} y={ry(v) + 3.5} className="chart-tick" textAnchor="end">
              {v * 100}%
            </text>
          </g>
        ))}
        <text x={left} y={VT - 5} className="chart-tick">
          Réponses (max {maxN})
        </text>
        <line x1={left} x2={W - right} y1={VT + VH} y2={VT + VH} className="chart-grid" />
        {points.map((p, i) => {
          const h = p.n ? Math.max(2, (p.n / maxN) * VH) : 0;
          const r = Math.min(3, bar / 2, h);
          const isActive = shown?.day === p.day;
          return (
            <g key={p.day}>
              {h > 0 && (
                <path
                  d={`M${x(i) - bar / 2},${VT + VH} v${-(h - r)} q0,${-r} ${r},${-r} h${bar - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                  className={`chart-vol ${isActive ? 'active' : ''}`}
                />
              )}
              {(points.length - 1 - i) % labelEvery === 0 && (
                <text x={x(i)} y={H - 4} className="chart-tick" textAnchor="middle">
                  {shortDay(p.day).replace('.', '')}
                </text>
              )}
            </g>
          );
        })}
        {line && <path d={line} className="chart-line" />}
        {withData.map(({ p, i }) => (
          <circle key={p.day} cx={x(i)} cy={ry(p.accuracy ?? 0)} r={shown?.day === p.day ? 5 : 4} className={`chart-dot ${p.n < MIN_SAMPLE ? 'low' : ''}`} />
        ))}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.day}`}
            x={left + band * i}
            y={0}
            width={band}
            height={H - 14}
            fill="transparent"
            onMouseEnter={() => setActive(p)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(p)}
          />
        ))}
      </svg>
      <table className="sr-only">
        <caption>Réussite et réponses par jour</caption>
        <thead>
          <tr>
            <th>Jour</th>
            <th>Réponses</th>
            <th>Réussite</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <td>{p.day}</td>
              <td>{p.n}</td>
              <td>{p.n ? pct(p.accuracy) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
