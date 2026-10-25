import { useMemo } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { actionLabel } from '../../domain/explain';
import { MODE_LABEL } from '../../domain/progress';
import { reviewQueue } from '../../domain/stats';
import { rangeShortName } from '../../domain/situation';
import { BackHeader, Empty, Ring } from '../components/common';
import { colorOf, useColorMode } from '../components/RangeGrid';
import { dateTime, duration, pct, plural, seconds } from '../format';
import { IconCheck, IconChevron, IconHome, IconPlay, IconRefresh } from '../icons';
import { describeSelection } from '../selection';

function verdict(acc: number | null): string {
  if (acc === null) return '';
  if (acc >= 0.95) return 'Excellent, range maîtrisée';
  if (acc >= 0.85) return 'Très bon niveau';
  if (acc >= 0.7) return 'Solide, quelques zones à revoir';
  if (acc >= 0.5) return 'En progrès';
  return 'À retravailler';
}

export function ResultsScreen({ id }: { id: string }) {
  const library = useLibrary();
  const progress = useStore((s) => s.data.progress);
  const mode = useColorMode();
  const summary = progress.sessions.find((s) => s.id === id);
  const queue = useMemo(() => (summary ? reviewQueue(library, progress, Date.now(), summary.rangeIds) : null), [library, progress, summary]);

  if (!summary) {
    return (
      <main className="screen no-nav">
        <BackHeader title="Bilan" />
        <Empty title="Session introuvable">Ce bilan n’est plus disponible.</Empty>
      </main>
    );
  }

  const exam = summary.mode === 'exam';
  const acc = summary.total ? summary.correct / summary.total : null;
  const precision = summary.total ? summary.scoreSum / summary.total : null;
  const headline = exam ? precision : acc;
  const rows = Object.entries(summary.byRange)
    .map(([rid, t]) => ({ rid, range: library.get(rid), ...t }))
    .filter((r) => r.range)
    .sort((a, b) => a.ok / a.n - b.ok / b.n);
  const weakest = rows.find((r) => r.n >= 3 && r.ok / r.n < 0.8);
  // Unique errors (a recalled hand can be missed twice).
  const errors = summary.errors.filter((e, i, arr) => arr.findIndex((x) => x.r === e.r && x.h === e.h && x.c === e.c) === i);

  const replay = () => {
    if (store.startSession(store.buildConfig(summary.rangeIds, summary.mode === 'review' ? 'random' : summary.mode, undefined, { label: summary.label }))) navigate('/session', { replace: true });
  };
  const reviewErrors = () => {
    if (store.startSession(store.buildConfig(summary.rangeIds, 'errors', 50, { label: 'Mes erreurs' }))) navigate('/session', { replace: true });
    else store.showToast('Aucune main à revoir dans ces ranges.', 'info');
  };

  return (
    <main className="screen no-nav results">
      <BackHeader eyebrow={`${MODE_LABEL[summary.mode]} · ${dateTime(summary.endedAt)}`} title={summary.completed ? 'Session terminée' : 'Session interrompue'} />

      <section className="results-hero card">
        <Ring value={headline}>
          <span className="ring-value num">{pct(headline)}</span>
          <span className="ring-label">{exam ? 'précision' : 'réussite'}</span>
        </Ring>
        <div className="results-side">
          <p className="results-verdict">{verdict(headline)}</p>
          <p className="muted">{summary.label ?? describeSelection(library, summary.rangeIds)}</p>
          <dl className="results-facts">
            <div>
              <dt>Bonnes réponses</dt>
              <dd className="num">
                {summary.correct}/{summary.total}
              </dd>
            </div>
            <div>
              <dt>Temps actif</dt>
              <dd className="num">{duration(summary.durationMs)}</dd>
            </div>
            <div>
              <dt>Moyenne</dt>
              <dd className="num">{seconds(summary.total ? summary.durationMs / summary.total : null)}</dd>
            </div>
          </dl>
        </div>
      </section>

      {rows.length > 1 && (
        <section className="section">
          <h2 className="section-title" style={{ marginBottom: 10 }}>
            Par range
          </h2>
          <div className="list">
            {rows.map((r) => (
              <button key={r.rid} type="button" className="row" onClick={() => navigate(`/ranges/${r.rid}`)}>
                <div className="row-main">
                  <div className="row-title">{rangeShortName(r.range!)}</div>
                  <div className={`meter ${r.n < 3 ? 'low' : ''}`} style={{ marginTop: 7 }}>
                    <i style={{ width: `${(r.ok / r.n) * 100}%` }} />
                  </div>
                </div>
                <span className="row-end num">
                  {r.ok}/{r.n}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Erreurs</h2>
          <span className="faint num" style={{ fontSize: 13 }}>
            {errors.length}
          </span>
        </div>
        {errors.length === 0 ? (
          <div className="banner banner-info">
            <IconCheck />
            <span>Aucune erreur sur cette session.</span>
          </div>
        ) : (
          <div className="list">
            {errors.map((e, i) => {
              const range = library.get(e.r);
              if (!range) return null;
              return (
                <button key={`${e.r}-${e.h}-${i}`} type="button" className="row error-row" onClick={() => navigate(`/ranges/${e.r}/${e.h}`)}>
                  <span className="hand-chip">{e.h}</span>
                  <div className="row-main">
                    <div className="row-sub">{rangeShortName(range)}</div>
                    <div className="err-line">
                      <span className="err-yours">{e.c ? actionLabel(range, e.c) : 'Temps écoulé'}</span>
                      <span className="faint">→</span>
                      <span className="err-right">
                        <i className="legend-dot" style={{ background: colorOf(range, e.a[0] ?? '', mode) }} />
                        {e.a.map((a) => actionLabel(range, a)).join(' / ')}
                      </span>
                    </div>
                  </div>
                  <IconChevron className="chev" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {(weakest || (queue && queue.inReview.length > 0)) && (
        <section className="section">
          <h2 className="section-title" style={{ marginBottom: 10 }}>
            Suggestions
          </h2>
          <div className="list">
            {queue && queue.inReview.length > 0 && (
              <button type="button" className="row" onClick={reviewErrors}>
                <IconRefresh className="weak-icon" />
                <div className="row-main">
                  <div className="row-title">Revoir les mains ratées</div>
                  <div className="row-sub">{plural(queue.inReview.length, 'main')} en suivi dans ces ranges</div>
                </div>
                <IconChevron className="chev" />
              </button>
            )}
            {weakest && (
              <button
                type="button"
                className="row"
                onClick={() => {
                  if (store.startSession(store.buildConfig([weakest.rid], 'targeted'))) navigate('/session', { replace: true });
                }}
              >
                <IconPlay className="weak-icon" />
                <div className="row-main">
                  <div className="row-title">Session ciblée · {rangeShortName(weakest.range!)}</div>
                  <div className="row-sub">
                    {weakest.ok}/{weakest.n} sur cette session
                  </div>
                </div>
                <IconChevron className="chev" />
              </button>
            )}
          </div>
        </section>
      )}

      <div className="results-cta">
        <button type="button" className="btn btn-ghost btn-lg" onClick={() => navigate('/', { replace: true })}>
          <IconHome /> Accueil
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={replay}>
          <IconPlay /> Rejouer
        </button>
      </div>
    </main>
  );
}
