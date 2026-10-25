import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { situationType } from '../../domain/library';
import { itemKey, MODE_LABEL, type SessionMode } from '../../domain/progress';
import { reviewQueue } from '../../domain/stats';
import { FORMAT_LABEL, SITUATION_LABEL } from '../../domain/situation';
import type { Format, Position, RangeDef, SituationType } from '../../domain/types';
import { Segmented, Sheet } from '../components/common';
import { pct, plural } from '../format';
import { IconCheck, IconExam, IconEye, IconPlay, IconRefresh, IconShuffle, IconStar, IconTarget } from '../icons';
import { describeSelection, spotGroups } from '../selection';

type FormatFilter = 'all' | Format;

const SITUATION_SHORT: Record<SituationType, string> = {
  open: 'Open',
  'vs-raise': 'vs relance',
  'vs-shove': 'vs tapis',
  'vs-limp': 'vs limp',
};

const MODES: { mode: SessionMode; icon: typeof IconShuffle; text: string }[] = [
  { mode: 'random', icon: IconShuffle, text: 'Mains tirées au hasard dans la sélection.' },
  { mode: 'targeted', icon: IconTarget, text: 'Priorité aux mains ratées et jamais vues.' },
  { mode: 'errors', icon: IconRefresh, text: 'Uniquement vos mains ratées, jusqu’à maîtrise.' },
  { mode: 'exam', icon: IconExam, text: 'Correction à la fin, score de précision.' },
];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function RangesScreen() {
  const library = useLibrary();
  const progress = useStore((s) => s.data.progress);
  const settings = useStore((s) => s.data.settings);
  const recents = useStore((s) => s.data.recents);

  const [selected, setSelected] = useState<string[]>(() => recents[0]?.rangeIds.filter((id) => library.get(id)) ?? []);
  const [format, setFormat] = useState<FormatFilter>('all');
  const [positions, setPositions] = useState<Position[]>([]);
  const [situations, setSituations] = useState<SituationType[]>([]);
  const [stacks, setStacks] = useState<number[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);

  // Filter values are derived from the data: no empty category is shown.
  const values = useMemo(() => {
    const rs = library.ranges;
    return {
      formats: [...new Set(rs.map((r) => r.format))],
      positions: (['BTN', 'SB', 'BB'] as Position[]).filter((p) => rs.some((r) => r.hero === p)),
      situations: (['open', 'vs-raise', 'vs-limp', 'vs-shove'] as SituationType[]).filter((s) => rs.some((r) => situationType(r.scenario) === s)),
      stacks: [...new Set(rs.map((r) => r.stackBb))].sort((a, b) => b - a),
    };
  }, [library]);

  const visible = useMemo(
    () =>
      library.ranges.filter(
        (r) =>
          (format === 'all' || r.format === format) &&
          (!positions.length || positions.includes(r.hero)) &&
          (!situations.length || situations.includes(situationType(r.scenario))) &&
          (!stacks.length || stacks.includes(r.stackBb)),
      ),
    [library, format, positions, situations, stacks],
  );
  const groups = useMemo(() => spotGroups(visible), [visible]);
  const filtered = format !== 'all' || positions.length + situations.length + stacks.length > 0;

  const accuracyOf = (r: RangeDef) => {
    let n = 0;
    let ok = 0;
    for (const h of Object.keys(r.hands)) {
      const it = progress.items[itemKey(r.id, h)];
      if (it) {
        n += it.n;
        ok += it.ok;
      }
    }
    return { n, acc: n ? ok / n : null, seen: Object.keys(r.hands).filter((h) => progress.items[itemKey(r.id, h)]).length };
  };

  const visibleIds = visible.map((r) => r.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  return (
    <main className="screen ranges">
      <header className="screen-head">
        <div>
          <p className="eyebrow">{library.ranges.length} ranges · Spin &amp; Go</p>
          <h1 className="title">Ranges</h1>
        </div>
        <button
          type="button"
          className="link-btn"
          onClick={() => setSelected(allVisibleSelected ? selected.filter((id) => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])])}
        >
          {allVisibleSelected ? 'Tout désélectionner' : filtered ? 'Sélectionner l’affichage' : 'Tout sélectionner'}
        </button>
      </header>

      <Segmented<FormatFilter>
        label="Format"
        value={format}
        onChange={setFormat}
        options={[{ value: 'all', label: 'Tous' }, ...values.formats.map((f) => ({ value: f as FormatFilter, label: FORMAT_LABEL[f] }))]}
      />

      <div className="chips filter-chips" role="group" aria-label="Filtres">
        {values.positions.map((p) => (
          <button key={p} type="button" className="chip" aria-pressed={positions.includes(p)} onClick={() => setPositions(toggle(positions, p))}>
            {p}
          </button>
        ))}
        <span className="chip-sep" aria-hidden />
        {values.situations.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={situations.includes(s)} onClick={() => setSituations(toggle(situations, s))} title={SITUATION_LABEL[s]}>
            {SITUATION_SHORT[s]}
          </button>
        ))}
        <span className="chip-sep" aria-hidden />
        {values.stacks.map((st) => (
          <button key={st} type="button" className="chip" aria-pressed={stacks.includes(st)} onClick={() => setStacks(toggle(stacks, st))}>
            {st} BB
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="empty" style={{ marginTop: 18 }}>
          <h3>Aucune range ne correspond</h3>
          <p>Ces filtres ne correspondent à aucune range du document.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setFormat('all');
              setPositions([]);
              setSituations([]);
              setStacks([]);
            }}
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}

      <div className="spot-list">
        {groups.map((g) => {
          const ids = g.ranges.map((r) => r.id);
          const all = ids.every((id) => selected.includes(id));
          return (
            <section key={g.key} className="spot-card">
              <header className="spot-head">
                <div className="spot-titles">
                  <span className="badge">{FORMAT_LABEL[g.format]}</span>
                  <h2>{g.title}</h2>
                  <p>{g.subtitle}</p>
                </div>
                <button
                  type="button"
                  className={`select-all ${all ? 'on' : ''}`}
                  aria-pressed={all}
                  onClick={() => setSelected(all ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])}
                >
                  {all ? 'Retirer' : 'Tout'}
                </button>
              </header>
              <div className="stack-rows">
                {g.ranges.map((r) => {
                  const on = selected.includes(r.id);
                  const a = accuracyOf(r);
                  return (
                    <div key={r.id} className={`stack-row ${on ? 'on' : ''}`}>
                      <button type="button" className="stack-toggle" aria-pressed={on} onClick={() => setSelected(toggle(selected, r.id))}>
                        <span className="check" aria-hidden>
                          {on && <IconCheck />}
                        </span>
                        <span className="stack-main">
                          <span className="stack-bb num">{r.stackBb} BB</span>
                          <span className="stack-scn">{r.scenarioLabel ? r.scenarioLabel.toLowerCase() : SITUATION_LABEL[situationType(r.scenario)].toLowerCase()}</span>
                        </span>
                        <span className="stack-stat">
                          {a.n ? (
                            <>
                              <b className="num">{pct(a.acc)}</b>
                              <small className="num">{a.seen}/169</small>
                            </>
                          ) : (
                            <small>nouveau</small>
                          )}
                        </span>
                      </button>
                      <button type="button" className="icon-btn plain" aria-label={`Voir la grille ${r.title} ${r.stackBb} BB`} onClick={() => navigate(`/range/${r.id}`)}>
                        <IconEye />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className={`select-bar ${selected.length ? 'show' : ''}`}>
        <div className="select-bar-info">
          <strong>{plural(selected.length, 'range')}</strong>
          <span className="faint">{selected.length ? `${selected.length * 169} mains` : 'Sélectionnez des ranges'}</span>
        </div>
        <button type="button" className="btn btn-primary" disabled={!selected.length} onClick={() => setSetupOpen(true)}>
          <IconPlay /> S’entraîner
        </button>
      </div>

      <SetupSheet open={setupOpen} onClose={() => setSetupOpen(false)} rangeIds={selected} defaultCount={settings.defaultCount} />
    </main>
  );
}

function SetupSheet({ open, onClose, rangeIds, defaultCount }: { open: boolean; onClose: () => void; rangeIds: string[]; defaultCount: number }) {
  const library = useLibrary();
  const progress = useStore((s) => s.data.progress);
  const settings = useStore((s) => s.data.settings);
  const [mode, setMode] = useState<SessionMode>('random');
  const [count, setCount] = useState(defaultCount);
  const [favName, setFavName] = useState<string | null>(null);
  const errorsCount = useMemo(() => reviewQueue(library, progress, Date.now(), rangeIds).inReview.length, [library, progress, rangeIds]);
  const counts = [...new Set([10, 20, 30, 50, defaultCount])].sort((a, b) => a - b);

  const launch = () => {
    const config = store.buildConfig(rangeIds, mode, count);
    if (store.startSession(config)) {
      onClose();
      navigate('/session');
    } else store.showToast('Aucune question ne correspond à cette configuration.', 'info');
  };

  const saveFav = () => {
    store.saveFavorite(favName ?? '', rangeIds, mode, count);
    setFavName(null);
    store.showToast('Favori enregistré', 'success');
  };

  return (
    <Sheet open={open} onClose={onClose} label="Configurer la session">
      <p className="eyebrow">Nouvelle session</p>
      <h2 className="title-sm" style={{ marginTop: 2 }}>
        {describeSelection(library, rangeIds)}
      </h2>

      <div className="field-label">Mode</div>
      <div className="mode-grid">
        {MODES.map(({ mode: m, icon: Icon, text }) => {
          const disabled = m === 'errors' && errorsCount === 0;
          return (
            <button key={m} type="button" className="mode-card" aria-pressed={mode === m} disabled={disabled} onClick={() => setMode(m)}>
              <Icon />
              <strong>{MODE_LABEL[m]}</strong>
              <span>{m === 'errors' ? (errorsCount ? `${plural(errorsCount, 'main')} à revoir` : 'Aucune erreur à revoir') : text}</span>
            </button>
          );
        })}
      </div>

      <div className="field-label">Questions</div>
      <Segmented<number> label="Nombre de questions" value={count} onChange={setCount} options={counts.map((c) => ({ value: c, label: String(c) }))} />
      {mode === 'errors' && <p className="hint">Une session « Erreurs » s’arrête quand toutes les mains à revoir ont été posées.</p>}
      {mode === 'exam' && (
        <>
          <div className="field-label">Temps par question</div>
          <Segmented<number>
            label="Temps par question"
            value={settings.examTimerSec ?? 0}
            onChange={(v) => store.updateSettings({ examTimerSec: v || null })}
            options={[
              { value: 0, label: 'Libre' },
              { value: 8, label: '8 s' },
              { value: 15, label: '15 s' },
              { value: 30, label: '30 s' },
            ]}
          />
          <p className="hint">Sans réponse dans le temps imparti, la question est comptée fausse.</p>
        </>
      )}

      {favName === null ? (
        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 18 }} onClick={() => setFavName(describeSelection(library, rangeIds))}>
          <IconStar /> Enregistrer en favori
        </button>
      ) : (
        <div className="fav-form">
          <input className="input" value={favName} onChange={(e) => setFavName(e.target.value)} aria-label="Nom du favori" maxLength={40} autoFocus onKeyDown={(e) => e.key === 'Enter' && saveFav()} />
          <button type="button" className="btn" onClick={saveFav}>
            OK
          </button>
        </div>
      )}

      <button type="button" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 10 }} onClick={launch} disabled={mode === 'errors' && errorsCount === 0}>
        <IconPlay /> Démarrer · {mode === 'errors' ? Math.min(count, errorsCount) : count} questions
      </button>
    </Sheet>
  );
}
