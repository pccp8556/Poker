import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { combos, handKind } from '../../domain/cards';
import { explain, formatFrequency } from '../../domain/explain';
import { parseRangeNotation } from '../../domain/notation';
import { itemKey } from '../../domain/progress';
import { situationSentence } from '../../domain/situation';
import { marginalHands } from '../../domain/userRanges';
import { Sheet } from '../components/common';
import { colorOf, RangeGrid, RangeLegend, useColorMode } from '../components/RangeGrid';
import { RangePicker } from '../components/RangePicker';
import { pct } from '../format';
import { IconCopy, IconCrosshair, IconPalette, IconPencil, IconPlay, IconPlus, IconRefresh, IconSearch, IconTrash, IconZoomIn, IconZoomOut } from '../icons';
import { launch } from './Home';

let lastId: string | null = null;

const KIND = { pair: 'paire', suited: 'assortie', offsuit: 'dépareillée' } as const;

export function ExplorerScreen({ id, hand }: { id?: string; hand?: string }) {
  const library = useLibrary();
  const progress = useStore((s) => s.data.progress);
  const userRanges = useStore((s) => s.data.ranges);
  const settings = useStore((s) => s.data.settings);
  const mode = useColorMode();
  const range = library.get(id ?? lastId ?? '') ?? library.ranges[0]!;
  lastId = range.id;
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(hand ?? null);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(false);
  const [showMarginal, setShowMarginal] = useState(false);
  const [confirm, setConfirm] = useState<'restore' | 'delete' | null>(null);

  const search = useMemo(() => (query.trim() ? parseRangeNotation(query) : null), [query]);
  const searchHit = search && search.hands.length === 1 ? search.hands[0]! : null;
  const shownHand = searchHit ?? selected;
  const info = useMemo(() => (shownHand ? explain(library, range, shownHand) : null), [library, range, shownHand]);
  const marginal = useMemo(() => marginalHands(range, userRanges), [range, userRanges]);
  const marks = search && search.hands.length > 1 ? new Set(search.hands) : showMarginal ? marginal : null;
  const item = shownHand ? progress.items[itemKey(range.id, shownHand)] : undefined;

  const go = (rid: string) => {
    setSelected(null);
    setFocus(null);
    navigate(`/ranges/${rid}`, { replace: true });
  };

  return (
    <main className="screen explorer">
      <header className="screen-head">
        <h1 className="title">Ranges</h1>
        <div className="head-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={mode === 'pdf' ? 'Couleurs du thème sombre' : 'Couleurs fidèles au PDF'}
            title={mode === 'pdf' ? 'Couleurs : PDF' : 'Couleurs : thème sombre'}
            onClick={() => {
              store.updateSettings({ matrixColors: mode === 'pdf' ? 'dark' : 'pdf' });
              store.showToast(mode === 'pdf' ? 'Couleurs du thème sombre' : 'Couleurs fidèles au PDF', 'info');
            }}
          >
            <IconPalette />
          </button>
          <button type="button" className="icon-btn" aria-label="Nouvelle range" onClick={() => navigate('/new')}>
            <IconPlus />
          </button>
        </div>
      </header>

      <RangePicker library={library} value={range.id} onChange={go} />

      <div className="range-title">
        <div>
          <h2>
            {range.title} <span className="gold">{range.stackBb} BB</span>
          </h2>
          <p className="muted">{situationSentence(range)}</p>
          <p className="range-code">RANGE — {range.stackBb}BB{range.scenarioLabel ? ` ${range.scenarioLabel}` : ''}</p>
        </div>
        <div className="range-badges">
          {range.source.page !== null && <span className="badge">PDF p.{String(range.source.page).padStart(2, '0')}</span>}
          {range.origin === 'custom' && <span className="badge badge-gold">Personnalisée</span>}
          {range.modified && <span className="badge badge-gold">Modifiée</span>}
        </div>
      </div>

      <div className="grid-tools">
        <label className="search">
          <IconSearch />
          <input
            id="hand-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Main (ex. KTo, A5s, 77+)"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Chercher une main"
          />
        </label>
        <button type="button" className="icon-btn square" aria-pressed={zoom} aria-label={zoom ? 'Réduire la grille' : 'Agrandir la grille'} onClick={() => setZoom(!zoom)}>
          {zoom ? <IconZoomOut /> : <IconZoomIn />}
        </button>
        <button type="button" className="icon-btn square" aria-pressed={showMarginal} aria-label="Afficher les mains marginales" onClick={() => setShowMarginal(!showMarginal)}>
          <IconCrosshair />
        </button>
      </div>
      {search && search.errors.length > 0 && <p className="hint error-text">Non reconnu : {search.errors.join(', ')}</p>}
      {marks && (
        <p className="hint">
          {search && search.hands.length > 1 ? `${search.hands.length} mains trouvées (point blanc).` : `${marginal.size} mains marginales (point blanc).`}
        </p>
      )}

      <div className={zoom ? 'grid-scroll' : ''}>
        <RangeGrid range={range} focusAction={focus} selected={shownHand} marks={marks} size={zoom ? 'large' : 'normal'} onSelect={(h) => setSelected(h === selected ? null : h)} />
      </div>

      <div className="inspector" aria-live="polite">
        {info && shownHand ? (
          <>
            <div className="inspector-head">
              <strong className="inspector-hand">{shownHand}</strong>
              <span className="faint">
                {KIND[handKind(shownHand)]} · {combos(shownHand)} combos
              </span>
              {item && (
                <span className="badge" style={{ marginLeft: 'auto' }}>
                  Toi : {pct(item.ok / item.n)} · {item.n} rép.
                </span>
              )}
            </div>
            {info.reference.map((r) => (
              <div key={r.id} className="fb-action">
                <span className="legend-dot" style={{ background: colorOf(range, r.id, mode) }} />
                <span className="fb-action-label">{r.label}</span>
                <span className="fb-freq num">{formatFrequency(r.frequency)}</span>
              </div>
            ))}
            {info.reference[0]?.description && <p className="fb-desc">{info.reference[0].description}</p>}
            {info.otherStacks.length > 1 && (
              <div className="fb-stacks">
                {info.otherStacks.map((o) => {
                  const r = library.require(o.rangeId);
                  return (
                    <button key={o.rangeId} type="button" className={`fb-stack ${o.current ? 'current' : ''}`} onClick={() => navigate(`/ranges/${o.rangeId}/${shownHand}`, { replace: true })}>
                      <span className="num">{o.stackBb} BB</span>
                      <span className="fb-stack-action">
                        <i className="legend-dot" style={{ background: colorOf(r, o.actions[0]?.id ?? '', mode) }} />
                        {o.actions.map((a) => a.label).join(' / ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p className="faint" style={{ fontSize: 13.5 }}>
            Touche une main (ou cherche-la) pour voir son action et la comparer aux autres profondeurs. Touche une action de la légende pour l’isoler.
          </p>
        )}
      </div>

      <RangeLegend range={range} focusAction={focus} onFocus={setFocus} />

      <div className="explorer-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => launch([range.id], 'random', settings.defaultCount, { label: `${range.title} · ${range.stackBb} BB` })}>
          <IconPlay /> S’entraîner
        </button>
        <button type="button" className="btn btn-lg" onClick={() => navigate(`/edit/${range.id}`)}>
          <IconPencil /> Modifier
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => navigate(`/new/${range.id}`)}>
          <IconCopy /> Dupliquer
        </button>
        {range.modified && (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm('restore')}>
            <IconRefresh /> Restaurer le PDF
          </button>
        )}
        {range.origin === 'custom' && (
          <button type="button" className="btn btn-danger" onClick={() => setConfirm('delete')}>
            <IconTrash /> Supprimer
          </button>
        )}
      </div>

      <Sheet open={confirm !== null} onClose={() => setConfirm(null)} label="Confirmation">
        <h2 className="title-sm">{confirm === 'delete' ? 'Supprimer cette range ?' : 'Restaurer la version du PDF ?'}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {confirm === 'delete'
            ? `${range.title} ${range.stackBb} BB sera supprimée de cet appareil. Tes statistiques passées sur cette range ne seront plus affichées.`
            : `Tes modifications de ${range.title} ${range.stackBb} BB seront remplacées par la grille d’origine (page ${range.source.page}).`}
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (confirm === 'delete') {
                store.deleteCustomRange(range.id);
                lastId = null;
                navigate('/ranges', { replace: true });
                store.showToast('Range supprimée', 'success');
              } else {
                store.restoreRange(range.id);
                store.showToast('Version du PDF restaurée', 'success');
              }
              setConfirm(null);
            }}
          >
            {confirm === 'delete' ? 'Supprimer' : 'Restaurer'}
          </button>
        </div>
      </Sheet>
    </main>
  );
}
