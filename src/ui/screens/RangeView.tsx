import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { actionMeta } from '../../domain/actions';
import { combos, handKind } from '../../domain/cards';
import { explain, formatFrequency } from '../../domain/explain';
import { itemKey } from '../../domain/progress';
import { actionBefore, spotSubtitle } from '../../domain/situation';
import { BackHeader, Empty, Segmented } from '../components/common';
import { RangeGrid, RangeLegend } from '../components/RangeGrid';
import { pct } from '../format';
import { IconPlay, IconTarget } from '../icons';

export function RangeViewScreen({ id, hand }: { id: string; hand?: string }) {
  const library = useLibrary();
  const progress = useStore((s) => s.data.progress);
  const range = library.get(id);
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(hand ?? null);

  const siblings = useMemo(() => (range ? library.siblings(range) : []), [library, range]);
  const info = useMemo(() => (range && selected ? explain(library, range, selected) : null), [library, range, selected]);

  if (!range) {
    return (
      <main className="screen no-nav">
        <BackHeader title="Range introuvable" fallback="/ranges" />
        <Empty title="Cette range n’existe pas">Elle a peut-être été retirée des données.</Empty>
      </main>
    );
  }

  const item = selected ? progress.items[itemKey(range.id, selected)] : undefined;
  const start = (mode: 'random' | 'targeted') => {
    if (store.startSession(store.buildConfig([range.id], mode))) navigate('/session');
  };

  return (
    <main className="screen no-nav range-view">
      <BackHeader eyebrow={spotSubtitle(range)} title={range.title} fallback="/ranges" />

      {siblings.length > 1 && (
        <Segmented<string>
          label="Profondeur"
          value={range.id}
          onChange={(v) => navigate(`/range/${v}`, { replace: true })}
          options={siblings.map((r) => ({ value: r.id, label: `${r.stackBb} BB` }))}
        />
      )}

      <p className="range-context">
        <span>{actionBefore(range)}</span>
        <span className="faint">
          Source p. {range.source.page}
          {range.scenarioLabel ? ` · ${range.scenarioLabel.toLowerCase()}` : ''}
        </span>
      </p>

      <RangeGrid range={range} focusAction={focus} selected={selected} onSelect={(h) => setSelected(h === selected ? null : h)} />

      <div className="inspector" aria-live="polite">
        {info && selected ? (
          <>
            <div className="inspector-head">
              <strong className="inspector-hand">{selected}</strong>
              <span className="faint">
                {handKind(selected) === 'pair' ? 'paire' : handKind(selected) === 'suited' ? 'assortie' : 'dépareillée'} · {combos(selected)} combos
              </span>
              {item && (
                <span className="badge" style={{ marginLeft: 'auto' }}>
                  Vous : {pct(item.ok / item.n)} · {item.n} rép.
                </span>
              )}
            </div>
            {info.reference.map((r) => (
              <div key={r.id} className="fb-action">
                <span className="legend-dot" style={{ background: actionMeta(r.id).color }} />
                <span className="fb-action-label">{r.label}</span>
                <span className="fb-freq num">{formatFrequency(r.frequency)}</span>
              </div>
            ))}
            <p className="fb-desc">{info.reference[0]?.description}</p>
            {info.otherStacks.length > 1 && (
              <div className="fb-stacks">
                {info.otherStacks.map((o) => (
                  <div key={o.rangeId} className={`fb-stack ${o.current ? 'current' : ''}`}>
                    <span className="num">{o.stackBb} BB</span>
                    <span className="fb-stack-action">
                      <i className="legend-dot" style={{ background: actionMeta(o.actions[0]?.id ?? '').color }} />
                      {o.actions.map((a) => a.label).join(' / ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="faint" style={{ fontSize: 13.5 }}>
            Touchez une main pour voir son action et la comparer aux autres profondeurs. Touchez une action de la légende pour l’isoler.
          </p>
        )}
      </div>

      <RangeLegend range={range} focusAction={focus} onFocus={setFocus} />

      <div className="range-cta">
        <button type="button" className="btn btn-ghost btn-lg" onClick={() => start('targeted')}>
          <IconTarget /> Ciblé
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => start('random')}>
          <IconPlay /> S’entraîner
        </button>
      </div>
    </main>
  );
}
