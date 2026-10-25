import { useMemo } from 'react';
import { actionMeta, sortActionIds } from '../../domain/actions';
import { ALL_HANDS } from '../../domain/cards';
import { actionShares } from '../../domain/library';
import type { RangeDef, Strategy } from '../../domain/types';
import { inkFor } from '../format';

/** Cell background: solid for a pure hand, hard-stop stripes for a mixed one. */
export function strategyFill(strategy: Strategy | undefined): string {
  const entries = Object.entries(strategy ?? {}).filter(([, f]) => f > 0);
  if (entries.length === 0) return 'var(--surface-3)';
  if (entries.length === 1) return actionMeta(entries[0]![0]).color;
  let acc = 0;
  const stops = sortActionIds(entries.map(([a]) => a)).map((a) => {
    const f = (strategy?.[a] ?? 0) * 100;
    const s = `${actionMeta(a).color} ${acc}% ${acc + f}%`;
    acc += f;
    return s;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function mainAction(strategy: Strategy | undefined): string | null {
  const entries = Object.entries(strategy ?? {});
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0]![0];
}

interface GridProps {
  range: RangeDef;
  /** Hand to highlight (pulsing ring). */
  highlight?: string | null;
  /** Hand selected by the user (inspector). */
  selected?: string | null;
  /** Only show this action in colour (others dimmed). */
  focusAction?: string | null;
  onSelect?: (hand: string) => void;
  size?: 'normal' | 'compact' | 'tiny';
  hideLabels?: boolean;
}

export function RangeGrid({ range, highlight, selected, focusAction, onSelect, size = 'normal' }: GridProps) {
  const interactive = Boolean(onSelect);
  return (
    <div
      className={`rgrid ${size === 'normal' ? '' : size}`}
      role="grid"
      aria-label={`Grille de la range ${range.title} ${range.stackBb} BB`}
    >
      {ALL_HANDS.map((h) => {
        const strategy = range.hands[h];
        const main = mainAction(strategy);
        const color = main ? actionMeta(main).color : '#333';
        const dim = focusAction ? !(strategy && (strategy[focusAction] ?? 0) > 0) : false;
        const cls = `rcell${dim ? ' dim' : ''}${highlight === h ? ' hl' : ''}${selected === h ? ' sel' : ''}`;
        const label = `${h} : ${range.actions.find((a) => a.id === main)?.label ?? ''}`;
        const style = { background: strategyFill(strategy), color: inkFor(color) };
        return interactive ? (
          <button key={h} type="button" className={cls} style={style} aria-label={label} onClick={() => onSelect?.(h)}>
            {size === 'tiny' ? '' : h}
          </button>
        ) : (
          <div key={h} className={cls} style={style} role="gridcell" aria-label={label}>
            {size === 'tiny' ? '' : h}
          </div>
        );
      })}
    </div>
  );
}

interface LegendProps {
  range: RangeDef;
  focusAction?: string | null;
  onFocus?: (actionId: string | null) => void;
}

export function RangeLegend({ range, focusAction, onFocus }: LegendProps) {
  const shares = useMemo(() => actionShares(range), [range]);
  const ids = sortActionIds(range.actions.map((a) => a.id));
  return (
    <div className="legend">
      {ids.map((id) => {
        const a = range.actions.find((x) => x.id === id)!;
        const s = shares.find((x) => x.actionId === id)!;
        const pressed = focusAction === id;
        return (
          <button
            key={id}
            type="button"
            className={`legend-item${focusAction && !pressed ? ' faded' : ''}`}
            aria-pressed={pressed}
            onClick={() => onFocus?.(pressed ? null : id)}
          >
            <span className="legend-dot" style={{ background: actionMeta(id).color }} />
            <span className="lg-label">{a.label}</span>
            <span className="lg-count">
              {s.hands} mains · {Math.round(s.share * 100)} %
            </span>
          </button>
        );
      })}
    </div>
  );
}
