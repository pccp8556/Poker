import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { sortActionIds } from '../../domain/actions';
import { blankAction, drawingStats, gradeDrawing, groupMistakes, type Drawing, type DrawingResult } from '../../domain/drawing';
import { actionShares } from '../../domain/library';
import { situationSentence, spotSubtitle } from '../../domain/situation';
import type { RangeDef, Strategy } from '../../domain/types';
import { BackHeader, Empty, Ring, Segmented, Switch } from '../components/common';
import { colorOf, RangeGrid, useColorMode } from '../components/RangeGrid';
import { dateTime, duration, pct, plural } from '../format';
import { IconCheck, IconPlay, IconRefresh, IconTrash, IconUndo } from '../icons';
import { spotGroups } from '../selection';
import { launch } from './Home';

const ERASER = '__erase__';

function asHands(drawing: Drawing): Record<string, Strategy> {
  return Object.fromEntries(Object.entries(drawing).map(([h, a]) => [h, { [a]: 1 }]));
}

function labelOf(range: RangeDef, id: string | null): string {
  if (id === null) return 'Non peinte';
  return range.actions.find((a) => a.id === id)?.label ?? id;
}

/** "Dessine ta range": choice of the range, with the best score of each one. */
export function DrawPickerScreen() {
  const library = useLibrary();
  const drawings = useStore((s) => s.data.drawings);
  const stats = useMemo(() => drawingStats(drawings), [drawings]);
  const groups = useMemo(() => spotGroups(library.ranges), [library]);
  const recent = drawings.attempts.slice(0, 5).filter((a) => library.get(a.r));

  return (
    <main className="screen no-nav draw-picker">
      <BackHeader eyebrow="Exercice" title="Dessine ta range" fallback="/train" />
      <p className="muted draw-intro">
        Choisis une range et peins ses 169 mains de mémoire avec les actions de la légende. La correction se fait case par case, contre ta version de la range.
      </p>

      <div className="list">
        {groups.map((g) => (
          <div key={g.key} className="row by-range draw-row">
            <div className="row-main">
              <div className="row-title">{g.title}</div>
              <div className="row-sub ellipsis">{spotSubtitle(g.ranges[0]!)}</div>
            </div>
            <div className="stack-btns">
              {g.ranges.map((r) => {
                const s = stats.get(r.id);
                const draft = drawings.drafts[r.id];
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`stack-btn draw-stack num ${r.origin === 'custom' ? 'custom' : ''} ${r.modified ? 'modified' : ''}`}
                    aria-label={`Dessiner ${r.title} ${r.stackBb} BB${s ? `, record ${s.best.ok} sur 169` : ''}${draft ? ', dessin en cours' : ''}`}
                    onClick={() => navigate(`/draw/${r.id}`)}
                  >
                    <b>{r.stackBb}</b>
                    <small className={s?.best.ok === 169 ? 'perfect' : ''}>{s ? pct(s.best.ok / 169) : draft ? 'en cours' : '—'}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="hint">Sous chaque profondeur : ton meilleur score (mains justes sur 169).</p>

      {recent.length > 0 && (
        <section className="section">
          <h2 className="section-title">Derniers dessins</h2>
          <div className="list">
            {recent.map((a) => {
              const r = library.require(a.r);
              return (
                <button key={`${a.r}-${a.t}`} type="button" className="row" onClick={() => navigate(`/draw/${a.r}`)}>
                  <div className="row-main">
                    <div className="row-title">
                      {r.title} · {r.stackBb} BB
                    </div>
                    <div className="row-sub">
                      {dateTime(a.t)} · {duration(a.ms)}
                      {a.help ? ' · avec aide' : ''}
                    </div>
                  </div>
                  <span className="draw-recent-score num">
                    {a.ok}/169
                    <small>{pct(a.ok / 169)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

/** Painting a range from memory, then the hand-by-hand correction. */
export function DrawScreen({ id }: { id: string }) {
  const library = useLibrary();
  const range = library.get(id);
  if (!range) {
    return (
      <main className="screen no-nav">
        <BackHeader title="Range introuvable" fallback="/draw" />
        <Empty title="Cette range n’existe pas">Elle a peut-être été supprimée.</Empty>
      </main>
    );
  }
  return <DrawExercise key={range.id} range={range} />;
}

function DrawExercise({ range }: { range: RangeDef }) {
  const mode = useColorMode();
  const drawings = useStore((s) => s.data.drawings);
  const [drawing, setDrawing] = useState<Drawing>(() => store.data.drawings.drafts[range.id]?.drawing ?? {});
  const [resumed] = useState(() => Object.keys(store.data.drawings.drafts[range.id]?.drawing ?? {}).length > 0);
  const [history, setHistory] = useState<Drawing[]>([]);
  const ids = useMemo(() => sortActionIds(range.actions.map((a) => a.id)), [range]);
  const [brush, setBrush] = useState<string>(() => ids.find((a) => a !== 'fold' && a !== 'check') ?? ids[0] ?? ERASER);
  const [help, setHelp] = useState(false);
  const [usedHelp, setUsedHelp] = useState(false);
  const [result, setResult] = useState<{ grade: DrawingResult; record: boolean; previousBest: number | null; ms: number } | null>(null);
  const [view, setView] = useState<'fix' | 'mine' | 'ref'>('fix');
  const startedAt = useRef(Date.now());

  const blank = blankAction(range);
  const painted = Object.keys(drawing).length;
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of Object.values(drawing)) out[a] = (out[a] ?? 0) + 1;
    return out;
  }, [drawing]);
  const expectedCounts = useMemo(() => Object.fromEntries(actionShares(range).map((s) => [s.actionId, s.hands])), [range]);
  const best = drawingStats(drawings).get(range.id)?.best ?? null;

  // The drawing in progress is kept, so leaving (or closing the app) loses nothing.
  useEffect(() => {
    if (result) return;
    const t = setTimeout(() => store.saveDrawingDraft(range.id, drawing), 400);
    return () => clearTimeout(t);
  }, [drawing, range.id, result]);

  const snapshot = () => setHistory((h) => [...h.slice(-79), drawing]);
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setDrawing(last);
    setHistory(history.slice(0, -1));
  };

  const onPaint = (hand: string, first: boolean) => {
    if (first) snapshot();
    setDrawing((d) => {
      if (brush === ERASER) {
        if (!(hand in d)) return d;
        const next = { ...d };
        delete next[hand];
        return next;
      }
      return d[hand] === brush ? d : { ...d, [hand]: brush };
    });
  };

  const clearAll = () => {
    if (!painted) return;
    snapshot();
    setDrawing({});
  };

  const validate = () => {
    const grade = gradeDrawing(range, drawing);
    const ms = Date.now() - startedAt.current;
    const previousBest = best?.ok ?? null;
    const record = store.recordDrawing({ t: Date.now(), r: range.id, ok: grade.correct, sc: grade.comboScore, w: grade.mistakes.map((m) => m.hand), ms, help: usedHelp });
    setResult({ grade, record, previousBest, ms });
    setView('fix');
    window.scrollTo(0, 0);
  };

  const restart = () => {
    store.saveDrawingDraft(range.id, null);
    setDrawing({});
    setHistory([]);
    setUsedHelp(help);
    setResult(null);
    startedAt.current = Date.now();
    window.scrollTo(0, 0);
  };

  const title = `${range.title} · ${range.stackBb} BB`;
  const eyebrow = `Dessine ta range${range.modified ? ' · version modifiée' : range.origin === 'custom' ? ' · personnalisée' : ''}`;

  if (result) {
    const { grade } = result;
    const wrong = new Map(grade.mistakes.map((m) => [m.hand, m.drawn]));
    const groups = groupMistakes(grade.mistakes);
    const wrongHands = grade.mistakes.map((m) => m.hand);
    return (
      <main className="screen no-nav draw done">
        <BackHeader eyebrow={eyebrow} title={title} fallback="/draw" />

        <section className="draw-score card">
          <Ring value={grade.score} size={112} stroke={9}>
            <span className="ring-value num">{pct(grade.score)}</span>
            <span className="ring-label">justes</span>
          </Ring>
          <dl className="draw-facts">
            <div>
              <dt>Mains justes</dt>
              <dd className="num">
                {grade.correct} / {grade.total}
              </dd>
            </div>
            <div>
              <dt>Combos justes</dt>
              <dd className="num">{pct(grade.comboScore)}</dd>
            </div>
            <div>
              <dt>Temps</dt>
              <dd className="num">{duration(result.ms)}</dd>
            </div>
            <div>
              <dt>Record</dt>
              <dd className="num">{result.previousBest === null ? 'premier essai' : result.record ? `battu (${result.previousBest})` : `${result.previousBest} / 169`}</dd>
            </div>
          </dl>
        </section>
        {grade.correct === grade.total ? (
          <div className="banner banner-info draw-perfect">
            <IconCheck />
            <span>Parfait : les 169 mains sont justes{usedHelp ? ' (avec l’aide des nombres de mains)' : ''}. Range maîtrisée.</span>
          </div>
        ) : (
          usedHelp && <p className="hint">Essai fait avec l’aide « nombre de mains par action ».</p>
        )}

        <div className="draw-view">
          <Segmented
            label="Grille affichée"
            value={view}
            onChange={setView}
            options={[
              { value: 'fix', label: 'Correction' },
              { value: 'mine', label: 'Mon dessin' },
              { value: 'ref', label: 'Référence' },
            ]}
          />
        </div>
        <RangeGrid range={range} hands={view === 'mine' ? asHands(drawing) : undefined} wrong={view === 'ref' ? null : wrong} size="normal" />
        <div className="grid-legend-inline">
          {ids.map((aid) => (
            <span key={aid}>
              <i className="legend-dot" style={{ background: colorOf(range, aid, mode) }} /> {labelOf(range, aid)}
            </span>
          ))}
        </div>
        {view !== 'ref' && grade.mistakes.length > 0 && (
          <p className="hint">
            <i className="wrong-key" aria-hidden /> Contour rouge : main fausse ; {view === 'fix' ? 'la case montre la bonne action, le point la couleur que tu as peinte.' : 'la case montre ton dessin.'}
          </p>
        )}

        <section className="section">
          <h2 className="section-title">Par action</h2>
          <div className="draw-table" role="table" aria-label="Résultat par action">
            <div className="dt-row dt-head" role="row">
              <span role="columnheader">Action</span>
              <span role="columnheader">Attendues</span>
              <span role="columnheader">Justes</span>
              <span role="columnheader">Oubliées</span>
              <span role="columnheader">En trop</span>
            </div>
            {grade.byAction.map((a) => (
              <div key={a.id} className="dt-row" role="row">
                <span role="cell" className="dt-action">
                  <i className="legend-dot" style={{ background: colorOf(range, a.id, mode) }} />
                  {labelOf(range, a.id)}
                </span>
                <span role="cell" className="num">
                  {a.expected}
                </span>
                <span role="cell" className="num ok">
                  {a.correct}
                </span>
                <span role="cell" className={`num ${a.missed ? 'ko' : ''}`}>
                  {a.missed}
                </span>
                <span role="cell" className={`num ${a.extra ? 'ko' : ''}`}>
                  {a.extra}
                </span>
              </div>
            ))}
          </div>
        </section>

        {groups.length > 0 && (
          <section className="section">
            <h2 className="section-title">Tes erreurs</h2>
            <div className="mistake-groups">
              {groups.map((g) => (
                <div key={`${g.drawn}-${g.expected.join('+')}`} className="mistake-group">
                  <div className="mg-head">
                    <span className="mg-from">
                      <i className="legend-dot" style={{ background: g.drawn ? colorOf(range, g.drawn, mode) : 'var(--surface-3)' }} />
                      {labelOf(range, g.drawn)}
                    </span>
                    <span className="faint">au lieu de</span>
                    <span className="mg-to">
                      <i className="legend-dot" style={{ background: colorOf(range, g.expected[0] ?? '', mode) }} />
                      {g.expected.map((e) => labelOf(range, e)).join(' / ')}
                    </span>
                    <span className="mg-count num">{g.hands.length}</span>
                  </div>
                  <div className="mg-hands">
                    {g.hands.map((h) => (
                      <span key={h} className="mini-chip">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="launch-bar draw-bar">
          {wrongHands.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              onClick={() =>
                launch([range.id], 'random', wrongHands.length, {
                  handSets: { [range.id]: wrongHands },
                  label: `Erreurs de dessin · ${title}`,
                })
              }
            >
              <IconPlay /> Rejouer mes erreurs à la table ({wrongHands.length})
            </button>
          )}
          <div className="draw-bar-row">
            <button type="button" className="btn btn-ghost" onClick={restart}>
              <IconRefresh /> Redessiner
            </button>
            <button type="button" className={`btn ${wrongHands.length ? 'btn-ghost' : 'btn-primary'}`} onClick={() => navigate('/draw', { replace: true })}>
              Autre range
            </button>
          </div>
        </div>
      </main>
    );
  }

  const left = 169 - painted;
  return (
    <main className="screen no-nav draw">
      <BackHeader
        eyebrow={eyebrow}
        title={title}
        fallback="/draw"
        right={
          <button type="button" className="icon-btn square" onClick={undo} disabled={!history.length} aria-label="Annuler le dernier coup de pinceau">
            <IconUndo />
          </button>
        }
      />
      <p className="draw-context">{situationSentence(range)}</p>
      {resumed && painted > 0 && history.length === 0 && <p className="hint">Dessin en cours repris là où tu l’avais laissé.</p>}

      <div className="brushes" role="radiogroup" aria-label="Action à peindre">
        {ids.map((aid) => (
          <button key={aid} type="button" role="radio" aria-checked={brush === aid} className="brush" onClick={() => setBrush(aid)}>
            <i className="legend-dot" style={{ background: colorOf(range, aid, mode) }} />
            <span>{labelOf(range, aid)}</span>
            <small className="num">{help ? `${counts[aid] ?? 0}/${expectedCounts[aid] ?? 0}` : (counts[aid] ?? 0)}</small>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={brush === ERASER} className="brush eraser" onClick={() => setBrush(ERASER)}>
          <IconTrash />
          <span>Gomme</span>
        </button>
      </div>

      <RangeGrid range={range} hands={asHands(drawing)} size="normal" onPaint={onPaint} />

      <div className="draw-options">
        <div className="draw-option">
          <div>
            <div className="row-title">Aide : nombre de mains par action</div>
            <div className="row-sub">Affiche « peintes / attendues » sur chaque pinceau (noté dans le résultat).</div>
          </div>
          <Switch
            checked={help}
            label="Afficher le nombre de mains attendu par action"
            onChange={(v) => {
              setHelp(v);
              if (v) setUsedHelp(true);
            }}
          />
        </div>
        <button type="button" className="text-btn" onClick={clearAll} disabled={!painted}>
          <IconTrash /> Tout effacer
        </button>
      </div>

      <div className="launch-bar draw-bar">
        <p className="launch-info">
          {left === 0
            ? 'Les 169 mains sont peintes.'
            : blank
              ? `${plural(left, 'main')} non ${left > 1 ? 'peintes' : 'peinte'} : ${left > 1 ? 'elles comptent' : 'elle compte'} comme ${labelOf(range, blank)}.`
              : `${plural(left, 'main')} non ${left > 1 ? 'peintes' : 'peinte'} (comptée${left > 1 ? 's' : ''} fausse${left > 1 ? 's' : ''}).`}
        </p>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={validate} disabled={painted === 0}>
          <IconCheck /> Valider mon dessin
        </button>
      </div>
    </main>
  );
}
