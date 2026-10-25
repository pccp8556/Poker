import { useMemo, useRef } from 'react';
import { actionColor, sortActionIds, type ColorMode } from '../../domain/actions';
import { ALL_HANDS } from '../../domain/cards';
import { actionShares } from '../../domain/library';
import type { RangeDef, Strategy } from '../../domain/types';
import { useStore } from '../../app/store';
import { inkFor } from '../format';

/** Colour mode chosen in the settings (dark palette or PDF colours). */
export function useColorMode(): ColorMode {
  return useStore((s) => s.data.settings.matrixColors);
}

export function colorOf(range: RangeDef, actionId: string, mode: ColorMode): string {
  return actionColor(range.actions.find((a) => a.id === actionId), mode, actionId);
}

/** Cell background: solid for a pure hand, hard-stop stripes for a mixed one. */
export function strategyFill(range: RangeDef, strategy: Strategy | undefined, mode: ColorMode): string {
  const entries = Object.entries(strategy ?? {}).filter(([, f]) => f > 0);
  if (entries.length === 0) return 'var(--surface-3)';
  if (entries.length === 1) return colorOf(range, entries[0]![0], mode);
  let acc = 0;
  const stops = sortActionIds(entries.map(([a]) => a)).map((a) => {
    const f = (strategy?.[a] ?? 0) * 100;
    const s = `${colorOf(range, a, mode)} ${acc}% ${acc + f}%`;
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
  /** Overrides the hands (editor draft). */
  hands?: Record<string, Strategy>;
  /** Hand to highlight (pulsing ring). */
  highlight?: string | null;
  /** Hand selected by the user (inspector). */
  selected?: string | null;
  /** Only show this action in colour (others dimmed). */
  focusAction?: string | null;
  /** Hands marked with a dot (marginal hands). */
  marks?: Set<string> | null;
  /** Dims every hand outside this set (marginal-hands editor). */
  only?: Set<string> | null;
  onSelect?: (hand: string) => void;
  /** Drag painting: called for every cell the finger or mouse passes over. */
  onPaint?: (hand: string, first: boolean) => void;
  size?: 'normal' | 'compact' | 'large';
}

export function RangeGrid({ range, hands, highlight, selected, focusAction, marks, only, onSelect, onPaint, size = 'normal' }: GridProps) {
  const mode = useColorMode();
  const data = hands ?? range.hands;
  const painting = useRef(false);
  const lastPainted = useRef<string | null>(null);

  const paintAt = (x: number, y: number, first: boolean) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const hand = el?.closest<HTMLElement>('[data-hand]')?.dataset.hand;
    if (hand && hand !== lastPainted.current) {
      lastPainted.current = hand;
      onPaint?.(hand, first);
    }
  };

  const paintHandlers = onPaint
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          painting.current = true;
          lastPainted.current = null;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          paintAt(e.clientX, e.clientY, true);
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (painting.current) paintAt(e.clientX, e.clientY, false);
        },
        onPointerUp: () => {
          painting.current = false;
        },
        onPointerCancel: () => {
          painting.current = false;
        },
      }
    : {};

  return (
    <div
      className={`rgrid ${size === 'normal' ? '' : size}${onPaint ? ' paint' : ''}`}
      role="grid"
      aria-label={`Grille de la range ${range.title} ${range.stackBb} BB`}
      {...paintHandlers}
    >
      {ALL_HANDS.map((h) => {
        const strategy = data[h];
        const main = mainAction(strategy);
        const color = main ? colorOf(range, main, mode) : '#333';
        const dim = (focusAction ? !(strategy && (strategy[focusAction] ?? 0) > 0) : false) || (only ? !only.has(h) : false);
        const cls = `rcell${dim ? ' dim' : ''}${highlight === h ? ' hl' : ''}${selected === h ? ' sel' : ''}${marks?.has(h) ? ' mark' : ''}`;
        const label = `${h} : ${range.actions.find((a) => a.id === main)?.label ?? ''}`;
        const style = { background: strategyFill(range, strategy, mode), color: inkFor(color) };
        return onSelect && !onPaint ? (
          <button key={h} type="button" className={cls} style={style} aria-label={label} data-hand={h} onClick={() => onSelect(h)}>
            {h}
          </button>
        ) : (
          <div key={h} className={cls} style={style} role="gridcell" aria-label={label} data-hand={h}>
            {h}
          </div>
        );
      })}
    </div>
  );
}

interface LegendProps {
  range: RangeDef;
  hands?: Record<string, Strategy>;
  focusAction?: string | null;
  onFocus?: (actionId: string | null) => void;
}

export function RangeLegend({ range, hands, focusAction, onFocus }: LegendProps) {
  const mode = useColorMode();
  const shares = useMemo(() => actionShares(hands ? { ...range, hands } : range), [range, hands]);
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
            <span className="legend-dot" style={{ background: colorOf(range, id, mode) }} />
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
