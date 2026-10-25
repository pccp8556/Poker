import { useMemo, useState } from 'react';
import { store, useLibrary, useStore } from '../../app/store';
import { actionMeta, sortActionIds } from '../../domain/actions';
import { MODE_LABEL, type SessionMode } from '../../domain/progress';
import { buildPool } from '../../domain/quiz';
import type { Format } from '../../domain/types';
import { BackHeader, Segmented } from '../components/common';
import { colorOf, useColorMode } from '../components/RangeGrid';
import { IconPlay, IconRefresh, IconStar } from '../icons';
import { describeSelection } from '../selection';
import { COUNT_OPTIONS, launch } from './Home';

type FormatFilter = 'all' | Format;

const GROUPS: { title: string; test: (order: number) => boolean }[] = [
  { title: 'Fold', test: (o) => o === 0 },
  { title: 'Check · Call · Profil', test: (o) => o >= 1 && o < 10 },
  { title: 'Limp', test: (o) => o >= 10 && o < 20 },
  { title: 'Relance', test: (o) => o >= 20 && o < 40 },
  { title: 'Tapis', test: (o) => o >= 40 && o < 50 },
  { title: 'Autres', test: (o) => o >= 50 },
];

const MODES: SessionMode[] = ['random', 'targeted', 'marginal', 'exam'];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function CustomScreen() {
  const library = useLibrary();
  const settings = useStore((s) => s.data.settings);
  const userRanges = useStore((s) => s.data.ranges);
  const mode = useColorMode();
  const [format, setFormat] = useState<FormatFilter>('all');
  const [spots, setSpots] = useState<string[]>([]);
  const [stacks, setStacks] = useState<number[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [sessionMode, setSessionMode] = useState<SessionMode>('random');
  const [count, setCount] = useState(settings.defaultCount);
  const [favName, setFavName] = useState<string | null>(null);

  const byFormat = library.ranges.filter((r) => format === 'all' || r.format === format);
  const spotOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of byFormat) seen.set(`${r.format}:${r.spot}`, r.title);
    return [...seen.entries()].map(([key, title]) => ({ key, title }));
  }, [byFormat]);
  const bySpot = byFormat.filter((r) => !spots.length || spots.includes(`${r.format}:${r.spot}`));
  const stackOptions = [...new Set(bySpot.map((r) => r.stackBb))].sort((a, b) => b - a);
  const candidates = bySpot.filter((r) => !stacks.length || stacks.includes(r.stackBb));
  const chosen = picked.filter((id) => candidates.some((r) => r.id === id));
  const rangeIds = chosen.length ? chosen : candidates.map((r) => r.id);
  const selectedRanges = rangeIds.map((id) => library.require(id));

  // Action types present in the selection, with their exact labels.
  const actionOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const r of selectedRanges) for (const a of r.actions) if (!labels.has(a.id)) labels.set(a.id, a.label);
    return sortActionIds([...labels.keys()]).map((id) => ({ id, label: labels.get(id)! }));
  }, [selectedRanges]);
  const activeActions = actions.filter((a) => actionOptions.some((o) => o.id === a));

  const config = store.buildConfig(rangeIds, sessionMode, count, {
    actionFilter: activeActions.length ? activeActions : undefined,
    label: 'Entraînement personnalisé',
  });
  const pool = useMemo(
    () => buildPool(library, config, store.data.progress.items, Date.now()),
    [library, JSON.stringify(config), userRanges], // config is rebuilt on every render: compare its content
  );
  const distinctHands = new Set(pool.map((p) => p.hand)).size;
  const sampleRange = selectedRanges[0];

  const reset = () => {
    setFormat('all');
    setSpots([]);
    setStacks([]);
    setPicked([]);
    setActions([]);
  };

  return (
    <main className="screen no-nav custom">
      <BackHeader
        title="Personnalisé"
        eyebrow="Combine les filtres librement"
        fallback="/train"
        right={
          <button type="button" className="link-btn with-icon" onClick={reset}>
            <IconRefresh /> Réinitialiser
          </button>
        }
      />

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">01</span> Format
        </h2>
        <Segmented<FormatFilter>
          label="Format"
          value={format}
          onChange={(v) => {
            setFormat(v);
            setSpots([]);
            setStacks([]);
          }}
          options={[
            { value: 'all', label: 'Les deux' },
            { value: '3max', label: '3-max' },
            { value: 'hu', label: 'Heads-Up' },
          ]}
        />
      </section>

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">02</span> Situation <span className="step-note">{spots.length ? `${spots.length} choisie${spots.length > 1 ? 's' : ''}` : 'Toutes'}</span>
        </h2>
        <div className="chip-wrap">
          {spotOptions.map((o) => (
            <button key={o.key} type="button" className="chip" aria-pressed={spots.includes(o.key)} onClick={() => setSpots(toggle(spots, o.key))}>
              {o.title}
            </button>
          ))}
        </div>
      </section>

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">03</span> Profondeur <span className="step-note">Tapis présents dans les grilles</span>
        </h2>
        <div className="chip-wrap">
          {stackOptions.map((st) => (
            <button key={st} type="button" className="chip" aria-pressed={stacks.includes(st)} onClick={() => setStacks(toggle(stacks, st))}>
              {st} BB
            </button>
          ))}
        </div>
      </section>

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">04</span> Ranges{' '}
          <span className="step-note num">
            {rangeIds.length} / {library.ranges.length}
          </span>
        </h2>
        <div className="chip-wrap">
          {candidates.map((r) => (
            <button key={r.id} type="button" className="chip" aria-pressed={chosen.includes(r.id)} onClick={() => setPicked(toggle(chosen, r.id))}>
              {r.title} {r.stackBb}
              {r.origin === 'custom' ? ' ★' : r.modified ? ' ✎' : ''}
            </button>
          ))}
        </div>
        <p className="hint">Sans sélection, toutes les ranges ci-dessus sont incluses.</p>
      </section>

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">05</span> Type d’action <span className="step-note">Bonne réponse attendue, libellés exacts</span>
        </h2>
        {GROUPS.map((g) => {
          const items = actionOptions.filter((o) => g.test(actionMeta(o.id).order));
          if (!items.length) return null;
          return (
            <div key={g.title} className="action-group">
              <div className="action-group-title">{g.title}</div>
              <div className="chip-wrap">
                {items.map((o) => (
                  <button key={o.id} type="button" className="chip chip-action" aria-pressed={activeActions.includes(o.id)} onClick={() => setActions(toggle(activeActions, o.id))}>
                    <i className="legend-dot" style={{ background: sampleRange ? colorOf(sampleRange, o.id, mode) : actionMeta(o.id).color }} />
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <p className="hint">Sans sélection, toutes les mains sont posées.</p>
      </section>

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">06</span> Session
        </h2>
        <Segmented<SessionMode> label="Mode" value={sessionMode} onChange={setSessionMode} options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] === 'Mains marginales' ? 'Marginales' : MODE_LABEL[m] }))} />
        <div style={{ height: 8 }} />
        <Segmented<number> label="Nombre de questions" value={count} onChange={setCount} options={COUNT_OPTIONS} />
        {favName === null ? (
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setFavName(describeSelection(library, rangeIds))}>
            <IconStar /> Enregistrer en favori
          </button>
        ) : (
          <div className="fav-form">
            <input className="input" id="fav-name" value={favName} onChange={(e) => setFavName(e.target.value)} aria-label="Nom du favori" maxLength={40} autoFocus />
            <button
              type="button"
              className="btn"
              onClick={() => {
                store.saveFavorite(favName, rangeIds, sessionMode, count);
                setFavName(null);
                store.showToast('Favori enregistré sur l’accueil', 'success');
              }}
            >
              OK
            </button>
          </div>
        )}
      </section>

      <div className="launch-bar">
        <p className="launch-info">
          <b className="num">{pool.length}</b> situations disponibles · <span className="num">{distinctHands}</span> mains · <span className="num">{rangeIds.length}</span> range
          {rangeIds.length > 1 ? 's' : ''}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={!pool.length}
          onClick={() => launch(rangeIds, sessionMode, count, { actionFilter: activeActions.length ? activeActions : undefined, label: 'Entraînement personnalisé' })}
        >
          <IconPlay /> {count ? `Lancer ${count} questions` : 'Lancer (illimité)'}
        </button>
      </div>
    </main>
  );
}
