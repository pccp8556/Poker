import { useState } from 'react';
import { MIN_SAMPLE, type DayPoint } from '../../domain/stats';
import { pct, shortDay } from '../format';

/**
 * Daily accuracy columns (single series, so no legend box). Days with fewer
 * than MIN_SAMPLE answers are drawn in a muted tone: their percentage is not
 * reliable. Tap/hover a column for details; a hidden table backs the chart.
 */
export function DailyChart({ points }: { points: DayPoint[] }) {
  const lastWithData = [...points].reverse().find((p) => p.n > 0) ?? null;
  const [active, setActive] = useState<DayPoint | null>(null);
  const shown = active ?? lastWithData;
  const W = 320;
  const H = 132;
  const top = 8;
  const bottom = 20;
  const left = 30;
  const plotH = H - top - bottom;
  const plotW = W - left - 4;
  const band = plotW / points.length;
  const bar = Math.min(18, Math.max(3, band - 2));
  const y = (v: number) => top + plotH * (1 - v);
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
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Précision par jour">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={left} x2={W - 2} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={left - 6} y={y(v) + 3.5} className="chart-tick" textAnchor="end">
              {v * 100}%
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = left + band * i + band / 2;
          const h = p.accuracy === null ? 0 : Math.max(2, plotH * p.accuracy);
          const isActive = shown?.day === p.day;
          return (
            <g key={p.day}>
              {p.n === 0 ? (
                <circle cx={cx} cy={y(0) - 1} r={1.4} className="chart-empty" />
              ) : (
                <path
                  d={(() => {
                    const r = Math.min(4, bar / 2, h);
                    return `M${cx - bar / 2},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${bar - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
                  })()}
                  className={`chart-bar ${p.n < MIN_SAMPLE ? 'low' : ''} ${isActive ? 'active' : ''}`}
                />
              )}
              {(points.length - 1 - i) % labelEvery === 0 && (
                <text x={cx} y={H - 5} className="chart-tick" textAnchor="middle">
                  {shortDay(p.day).replace('.', '')}
                </text>
              )}
              <rect
                x={left + band * i}
                y={top}
                width={band}
                height={plotH + 4}
                fill="transparent"
                onMouseEnter={() => setActive(p)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive(p)}
              />
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Précision par jour</caption>
        <thead>
          <tr>
            <th>Jour</th>
            <th>Réponses</th>
            <th>Précision</th>
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
