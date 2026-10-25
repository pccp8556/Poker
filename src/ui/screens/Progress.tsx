import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { useLibrary, useStore } from '../../app/store';
import { MODE_LABEL } from '../../domain/progress';
import { breakdown, dailySeries, MIN_SAMPLE, overview, periodStart, reviewQueue, weakHands, wilson, type Dimension, type Period } from '../../domain/stats';
import { rangeShortName } from '../../domain/situation';
import { EvolutionChart } from '../components/EvolutionChart';
import { Empty, Ring, Segmented } from '../components/common';
import { dateTime, duration, pct, plural, seconds } from '../format';
import { IconChart, IconChevron, IconRefresh } from '../icons';
import { describeSelection } from '../selection';

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'range', label: 'Range' },
  { value: 'position', label: 'Position' },
  { value: 'situation', label: 'Spot' },
  { value: 'stack', label: 'Tapis' },
  { value: 'format', label: 'Format' },
];

function ratioClass(acc: number | null, n: number) {
  if (acc === null || n < MIN_SAMPLE) return '';
  return acc >= 0.85 ? 'good' : acc < 0.6 ? 'bad' : '';
}

export function ProgressScreen() {
  const library = useLibrary();
  const progress = useStore((s) => s.data.progress);
  const [period, setPeriod] = useState<Period>('30d');
  const [dim, setDim] = useState<Dimension>('range');
  const now = Date.now();
  const totalHands = library.ranges.length * 169;

  const all = useMemo(() => overview(progress, 'all', now), [progress, now]);
  const week = useMemo(() => overview(progress, '7d', now), [progress, now]);
  const series = useMemo(() => dailySeries(progress, 30, now), [progress, now]);
  const today = series[series.length - 1]!;
  const rows = useMemo(() => breakdown(library, progress, dim, periodStart(period, now)), [library, progress, dim, period, now]);
  const weak = useMemo(() => weakHands(library, progress, now, 8), [library, progress, now]);
  const queue = useMemo(() => reviewQueue(library, progress, now), [library, progress, now]);
  const ci = wilson({ n: all.answered, ok: all.correct });

  if (all.answered === 0) {
    return (
      <main className="screen">
        <header className="screen-head">
          <h1 className="title">Progrès</h1>
        </header>
        <Empty icon={<IconChart />} title="Pas encore de statistiques" action={<button type="button" className="btn btn-primary" onClick={() => navigate('/train')}>Commencer un entraînement</button>}>
          Elles sont calculées uniquement à partir de tes réponses enregistrées.
        </Empty>
      </main>
    );
  }

  return (
    <main className="screen progress">
      <header className="screen-head">
        <h1 className="title">Progrès</h1>
      </header>

      <section className="card progress-card">
        <div className="progress-top">
          <Ring value={all.accuracy} size={124} stroke={10}>
            <span className="ring-value num">{pct(all.accuracy)}</span>
            <span className="ring-label">global</span>
          </Ring>
          <dl className="progress-stats">
            <div>
              <dt>Décisions</dt>
              <dd className="num">{all.answered}</dd>
            </div>
            <div>
              <dt>Mains vues</dt>
              <dd className="num">{pct(all.distinctHands / totalHands)}</dd>
              <span className="num">
                {all.distinctHands} / {totalHands}
              </span>
            </div>
            <div>
              <dt>Série</dt>
              <dd className="num">{progress.streak}</dd>
              <span>record {progress.bestStreak}</span>
            </div>
            <div>
              <dt>Temps moyen</dt>
              <dd className="num">{seconds(all.avgMs)}</dd>
            </div>
          </dl>
        </div>
        <div className="progress-sub">
          <div>
            <span>Aujourd’hui</span>
            <b className="num">
              {today.n} · <em className={ratioClass(today.accuracy, today.n)}>{pct(today.accuracy)}</em>
            </b>
          </div>
          <div>
            <span>7 derniers jours</span>
            <b className="num">
              {week.answered} · <em className={ratioClass(week.accuracy, week.answered)}>{pct(week.accuracy)}</em>
            </b>
          </div>
        </div>
        <p className="hint">
          {all.answered < MIN_SAMPLE ? 'Encore peu de réponses : les pourcentages vont bouger.' : ci ? `Réussite globale probable : ${Math.round(ci[0] * 100)} à ${Math.round(ci[1] * 100)} %.` : ''}
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">Évolution (30 jours)</h2>
        <div className="card">
          <EvolutionChart points={series} />
        </div>
      </section>

      {queue.inReview.length > 0 && (
        <button type="button" className="card row-card" style={{ marginTop: 14 }} onClick={() => navigate('/history/review')}>
          <span className="tile-icon t-gold">
            <IconRefresh />
          </span>
          <div className="row-main">
            <div className="row-title">Mains en révision</div>
            <div className="row-sub">
              {plural(queue.inReview.length, 'main')} suivie{queue.inReview.length > 1 ? 's' : ''} · {queue.dueCount} à revoir maintenant
            </div>
          </div>
          <IconChevron className="chev" />
        </button>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Détail</h2>
        </div>
        <Segmented<Period>
          label="Période"
          value={period}
          onChange={setPeriod}
          options={[
            { value: '7d', label: '7 jours' },
            { value: '30d', label: '30 jours' },
            { value: 'all', label: 'Tout' },
          ]}
        />
        <div className="chips" role="group" aria-label="Regrouper par" style={{ marginTop: 10 }}>
          {DIMENSIONS.map((d) => (
            <button key={d.value} type="button" className="chip" aria-pressed={dim === d.value} onClick={() => setDim(d.value)}>
              {d.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="faint" style={{ marginTop: 12, fontSize: 13.5 }}>
            Aucune réponse sur cette période.
          </p>
        ) : (
          <div className="list" style={{ marginTop: 12 }}>
            {rows.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`row breakdown-row ${r.lowSample ? 'low' : ''}`}
                onClick={dim === 'range' ? () => navigate(`/ranges/${r.key}`) : undefined}
                disabled={dim !== 'range'}
              >
                <div className="row-main">
                  <div className="row-title">{r.label}</div>
                  <div className={`meter ${r.lowSample ? 'low' : ''}`} style={{ marginTop: 7 }}>
                    <i style={{ width: `${(r.accuracy ?? 0) * 100}%` }} />
                  </div>
                </div>
                <div className="row-end">
                  <div className="num" style={{ fontWeight: 650 }}>
                    {pct(r.accuracy)}
                  </div>
                  <div className="faint num" style={{ fontSize: 12 }}>
                    {r.n} rép.{r.lowSample ? ' · peu' : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="hint">Les pourcentages calculés sur moins de {MIN_SAMPLE} réponses sont grisés : ils ne sont pas encore significatifs.</p>
      </section>

      {weak.length > 0 && (
        <section className="section">
          <h2 className="section-title">Mains les plus ratées</h2>
          <div className="list">
            {weak.map((w) => {
              const range = library.get(w.rangeId)!;
              return (
                <button key={`${w.rangeId}|${w.hand}`} type="button" className="row" onClick={() => navigate(`/ranges/${w.rangeId}/${w.hand}`)}>
                  <span className="hand-chip">{w.hand}</span>
                  <div className="row-main">
                    <div className="row-title" style={{ fontSize: 14 }}>
                      {rangeShortName(range)}
                    </div>
                    <div className="dots" aria-label="Derniers résultats">
                      {w.item.recent.map((r, i) => (
                        <i key={i} className={r ? 'ok' : 'ko'} />
                      ))}
                    </div>
                  </div>
                  <span className="row-end num">
                    {w.item.ok}/{w.item.n}
                  </span>
                  <IconChevron className="chev" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Sessions récentes</h2>
          <button type="button" className="link-btn" onClick={() => navigate('/history')}>
            Tout l’historique
          </button>
        </div>
        {progress.sessions.length === 0 ? (
          <p className="faint" style={{ fontSize: 13.5 }}>
            Aucune session terminée pour l’instant.
          </p>
        ) : (
          <div className="list">
            {progress.sessions.slice(0, 5).map((s) => {
              const acc = s.total ? (s.mode === 'exam' ? s.scoreSum : s.correct) / s.total : null;
              return (
                <button key={s.id} type="button" className="row session-row" onClick={() => navigate(`/results/${s.id}`)}>
                  <div className={`score-pill ${acc !== null && acc >= 0.85 ? 'good' : acc !== null && acc < 0.6 ? 'bad' : ''}`}>
                    <span className="num">{acc === null ? '—' : Math.round(acc * 100)}</span>
                    <small>%</small>
                  </div>
                  <div className="row-main">
                    <div className="row-title">{s.label ?? describeSelection(library, s.rangeIds)}</div>
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
        )}
      </section>
    </main>
  );
}
