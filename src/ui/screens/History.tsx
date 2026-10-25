import { useMemo } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { MODE_LABEL } from '../../domain/progress';
import { INTERVALS, MASTERED_BOX } from '../../domain/review';
import { reviewQueue } from '../../domain/stats';
import { rangeShortName } from '../../domain/situation';
import { Empty, Segmented } from '../components/common';
import { dateTime, duration, pct, plural, untilLabel } from '../format';
import { IconChevron, IconClock, IconRefresh } from '../icons';
import { describeSelection } from '../selection';

export function HistoryScreen({ tab }: { tab: 'sessions' | 'review' }) {
  const library = useLibrary();
  const progress = useStore((s) => s.data.progress);
  const now = Date.now();
  const queue = useMemo(() => reviewQueue(library, progress, now), [library, progress, now]);
  const allIds = library.ranges.map((r) => r.id);

  const start = (mode: 'review' | 'errors') => {
    if (store.startSession(store.buildConfig(allIds, mode, 50))) navigate('/session');
    else store.showToast('Aucune main à réviser pour le moment.', 'info');
  };

  return (
    <main className="screen history">
      <header className="screen-head">
        <h1 className="title">Historique</h1>
      </header>

      <Segmented<'sessions' | 'review'>
        label="Vue"
        value={tab}
        onChange={(v) => navigate(v === 'review' ? '/history/review' : '/history', { replace: true })}
        options={[
          { value: 'sessions', label: 'Sessions' },
          { value: 'review', label: queue.dueCount ? `À réviser · ${queue.dueCount}` : 'À réviser' },
        ]}
      />

      {tab === 'sessions' ? (
        progress.sessions.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <Empty icon={<IconClock />} title="Aucune session" action={<button type="button" className="btn btn-primary" onClick={() => navigate('/ranges')}>Choisir des ranges</button>}>
              Vos sessions terminées ou interrompues apparaîtront ici.
            </Empty>
          </div>
        ) : (
          <div className="list" style={{ marginTop: 16 }}>
            {progress.sessions.map((s) => {
              const acc = s.total ? (s.mode === 'exam' ? s.scoreSum : s.correct) / s.total : null;
              return (
                <button key={s.id} type="button" className="row session-row" onClick={() => navigate(`/results/${s.id}`)}>
                  <div className={`score-pill ${acc !== null && acc >= 0.85 ? 'good' : acc !== null && acc < 0.6 ? 'bad' : ''}`}>
                    <span className="num">{acc === null ? '—' : Math.round(acc * 100)}</span>
                    <small>%</small>
                  </div>
                  <div className="row-main">
                    <div className="row-title">{describeSelection(library, s.rangeIds)}</div>
                    <div className="row-sub">
                      {MODE_LABEL[s.mode]} · {s.correct}/{s.total} · {duration(s.durationMs)}
                      {!s.completed && ' · interrompue'}
                    </div>
                    <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                      {dateTime(s.endedAt, now)}
                    </div>
                  </div>
                  <IconChevron className="chev" />
                </button>
              );
            })}
          </div>
        )
      ) : (
        <>
          <div className="card review-explain">
            <p>
              Chaque main ratée revient après <b>10 min</b>, puis <b>1 j</b>, <b>3 j</b> et <b>7 j</b> si vous répondez juste. Après {INTERVALS.length} bonnes réponses espacées, elle
              est considérée comme maîtrisée. Une nouvelle erreur la remet au départ.
            </p>
            <div className="review-cta">
              <button type="button" className="btn btn-primary" disabled={!queue.dueCount} onClick={() => start('review')}>
                <IconRefresh /> Réviser · {queue.dueCount}
              </button>
              <button type="button" className="btn btn-ghost" disabled={!queue.inReview.length} onClick={() => start('errors')}>
                Toutes · {queue.inReview.length}
              </button>
            </div>
          </div>

          {queue.inReview.length === 0 ? (
            <div style={{ marginTop: 16 }}>
              <Empty icon={<IconRefresh />} title="Rien à réviser">
                Les mains que vous ratez apparaîtront ici, avec leur prochaine date de révision.
              </Empty>
            </div>
          ) : (
            <div className="list" style={{ marginTop: 14 }}>
              {queue.inReview.map((w) => {
                const range = library.get(w.rangeId)!;
                return (
                  <button key={`${w.rangeId}|${w.hand}`} type="button" className="row" onClick={() => navigate(`/range/${w.rangeId}/${w.hand}`)}>
                    <span className="hand-chip">{w.hand}</span>
                    <div className="row-main">
                      <div className="row-title" style={{ fontSize: 14 }}>
                        {rangeShortName(range)}
                      </div>
                      <div className="row-sub">
                        {plural(w.item.lapses, 'erreur')} · {pct(w.item.ok / w.item.n)} de réussite
                      </div>
                    </div>
                    <div className="row-end">
                      <div className="boxes" aria-label={`Étape ${w.item.box} sur ${MASTERED_BOX}`}>
                        {Array.from({ length: MASTERED_BOX }, (_, i) => (
                          <i key={i} className={i < w.item.box ? 'on' : ''} />
                        ))}
                      </div>
                      <div className={`due-label ${w.due ? 'now' : ''}`}>{w.due ? 'à revoir' : untilLabel(w.item.due, now)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
