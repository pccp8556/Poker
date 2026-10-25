import { useMemo } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { boundaryHands } from '../../domain/library';
import { marginalHands } from '../../domain/userRanges';
import { BackHeader } from '../components/common';
import { RangeGrid } from '../components/RangeGrid';
import { RangePicker } from '../components/RangePicker';
import { IconPlay, IconRefresh } from '../icons';
import { launch } from './Home';

let lastId: string | null = null;

export function MarginalScreen({ id }: { id?: string }) {
  const library = useLibrary();
  const userRanges = useStore((s) => s.data.ranges);
  const settings = useStore((s) => s.data.settings);
  const range = library.get(id ?? lastId ?? '') ?? library.ranges[0]!;
  lastId = range.id;
  const current = useMemo(() => marginalHands(range, userRanges), [range, userRanges]);
  const computed = useMemo(() => boundaryHands(range), [range]);
  const custom = Boolean(userRanges.marginal[range.id]);
  const customCount = Object.keys(userRanges.marginal).filter((rid) => library.get(rid)).length;

  const toggle = (hand: string) => {
    const next = new Set(current);
    if (next.has(hand)) next.delete(hand);
    else next.add(hand);
    store.setMarginal(range.id, [...next]);
  };

  return (
    <main className="screen no-nav marginal">
      <BackHeader
        eyebrow="Définir mes mains marginales"
        title="Mains marginales"
        fallback="/train"
        right={
          custom ? (
            <button type="button" className="link-btn with-icon" onClick={() => store.setMarginal(range.id, null)}>
              <IconRefresh /> Calculées
            </button>
          ) : undefined
        }
      />

      <RangePicker library={library} value={range.id} onChange={(rid) => navigate(`/marginal/${rid}`, { replace: true })} />

      <div className="card marginal-info">
        <p>
          <b className="num">{current.size}</b> mains marginales sur cette range ·{' '}
          {custom ? <span className="gold">sélection personnelle</span> : <span className="muted">frontières calculées</span>}
        </p>
        <p className="muted">
          Par défaut, une main est marginale quand une de ses voisines dans la grille a une autre action ({computed.size} mains ici). Touche une main pour l’ajouter ou la retirer
          de ta sélection.
        </p>
      </div>

      <RangeGrid range={range} marks={current} only={current} onSelect={toggle} />

      <div className="explorer-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => launch([range.id], 'marginal', settings.defaultCount, { label: `Marginales · ${range.title} ${range.stackBb} BB` })}>
          <IconPlay /> S’entraîner sur ces mains
        </button>
      </div>
      <p className="hint">
        {customCount ? `${customCount} range${customCount > 1 ? 's' : ''} avec une sélection personnelle.` : 'Aucune sélection personnelle pour l’instant.'} Le mode « Mains marginales » de l’accueil utilise ces
        sélections pour toutes les ranges.
      </p>
    </main>
  );
}
