import { useEffect, useState } from 'react';
import { formatBB, heroOptions, r2, type HandState } from '../../domain/play';

export type Press = { kind: 'fold' } | { kind: 'checkOrCall' } | { kind: 'raise'; to: number };

/**
 * Real-client controls: Passer / Suivre / Relancer à X, sizing presets and slider.
 * Mount it with a key per decision so the raise amount restarts at the minimum.
 */
export function ActionBar({ hand, disabled, onPress }: { hand: HandState; disabled: boolean; onPress: (p: Press) => void }) {
  const o = heroOptions(hand);
  const [to, setTo] = useState(o.minTo);
  const clamp = (v: number) => r2(Math.min(o.maxTo, Math.max(o.minTo, Math.round(v * 2) / 2)));
  const amount = clamp(to);
  const allIn = amount >= o.maxTo;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === '1') onPress({ kind: 'fold' });
      else if (e.key === '2') onPress({ kind: 'checkOrCall' });
      else if (e.key === '3' && o.canRaise) onPress({ kind: 'raise', to: amount });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, onPress, o.canRaise, amount]);

  return (
    <div className={`actionbar${o.canRaise ? '' : ' no-raise'}`} aria-busy={disabled}>
      {o.canRaise && (
        <div className="ab-sizing">
          <div className="ab-presets" role="group" aria-label="Montants de relance">
            <button type="button" disabled={disabled} aria-pressed={amount === o.minTo} onClick={() => setTo(o.minTo)}>
              Min.
            </button>
            <button type="button" disabled={disabled} aria-pressed={amount === o.presetTo} onClick={() => setTo(o.presetTo)}>
              {o.presetLabel}
            </button>
            <button type="button" disabled={disabled} aria-pressed={amount === o.potTo} onClick={() => setTo(o.potTo)}>
              Pot
            </button>
            <button type="button" disabled={disabled} aria-pressed={allIn} onClick={() => setTo(o.maxTo)}>
              Max.
            </button>
          </div>
          <div className="ab-slider">
            <button type="button" className="ab-step" aria-label="Diminuer la relance" disabled={disabled || amount <= o.minTo} onClick={() => setTo(clamp(amount - 0.5))}>
              −
            </button>
            <input
              type="range"
              min={o.minTo}
              max={o.maxTo}
              step={0.5}
              value={amount}
              disabled={disabled}
              onChange={(e) => setTo(clamp(Number(e.target.value)))}
              style={{ '--fill': `${o.maxTo > o.minTo ? ((amount - o.minTo) / (o.maxTo - o.minTo)) * 100 : 100}%` } as React.CSSProperties}
              aria-label="Montant de la relance"
              aria-valuetext={formatBB(amount)}
            />
            <button type="button" className="ab-step" aria-label="Augmenter la relance" disabled={disabled || allIn} onClick={() => setTo(clamp(amount + 0.5))}>
              +
            </button>
            <output className="ab-amount num">{String(amount).replace('.', ',')}</output>
          </div>
        </div>
      )}
      <div className="ab-main">
        <button type="button" className="ab-btn ab-fold" disabled={disabled} onClick={() => onPress({ kind: 'fold' })}>
          Passer
        </button>
        <button type="button" className="ab-btn ab-call" disabled={disabled} onClick={() => onPress({ kind: 'checkOrCall' })}>
          {o.canCheck ? (
            'Parole'
          ) : (
            <>
              {o.callIsAllIn ? 'Suivre tapis' : 'Suivre'}
              <small className="num">{formatBB(o.toCall)}</small>
            </>
          )}
        </button>
        {o.canRaise && (
          <button type="button" className={`ab-btn ab-raise${allIn ? ' all-in' : ''}`} disabled={disabled} onClick={() => onPress({ kind: 'raise', to: amount })}>
            {allIn ? 'Tapis' : 'Relancer à'}
            <small className="num">{formatBB(amount)}</small>
          </button>
        )}
      </div>
    </div>
  );
}
