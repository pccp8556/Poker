import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { useLibrary, useStore } from '../../app/store';
import { breakdown, dailySeries, MIN_SAMPLE, overview, periodStart, weakHands, wilson, type Dimension, type Period } from '../../domain/stats';
import { rangeShortName } from '../../domain/situation';
import { DailyChart } from '../components/DailyChart';
import { Empty, Segmented } from '../components/common';
import { pct, seconds } from '../format';
import { IconChart, IconChevron } from '../icons';

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'range', label: 'Range' },
  { value: 'position', label: 'Position' },
  { value: 'situation', label: 'Spot' },
  { value: 'stack', label: 'Tapis' },
  { value: 'format', label: 'Format' },
];

export function StatsScreen() {
  const library = useLibrary();
  const progress = useStore((s) => s.data.progress);
  const [period, setPeriod] = useState<Period>('30d');
  const [dim, setDim] = useState<Dimension>('range');
  const now = Date.now();

  const ov = useMemo(() => overview(progress, period, now), [progress, period, now]);
  const all = useMemo(() => overview(progress, 'all', now), [progress, now]);
  const recent = useMemo(() => overview(progress, '7d', now), [progress, now]);
  const series = useMemo(() => dailySeries(progress, period === '7d' ? 7 : period === '30d' ? 30 : 30, now), [progress, period, now]);
  const rows = useMemo(() => breakdown(library, progress, dim, periodStart(period, now)), [library, progress, dim, period, now]);
  const weak = useMemo(() => weakHands(library, progress, now, 8), [library, progress, now]);
  const ci = wilson({ n: ov.answered, ok: ov.correct });

  if (all.answered === 0) {
    return (
      <main className="screen">
        <header className="screen-head">
          <h1 className="title">Statistiques</h1>
        </header>
        <Empty icon={<IconChart />} title="Pas encore de statistiques" action={<button type="button" className="btn btn-primary" onClick={() => navigate('/ranges')}>Commencer un entraînement</button>}>
          Elles sont calculées uniquement à partir de vos réponses enregistrées.
        </Empty>
      </main>
    );
  }

  // Recent vs. history: only shown when both samples are large enough.
  const trend =
    recent.answered >= MIN_SAMPLE && all.answered - recent.answered >= MIN_SAMPLE && recent.accuracy !== null
      ? recent.accuracy - (all.correct - recent.correct) / (all.answered - recent.answered)
      : null;

  return (
    <main className="screen stats">
      <header className="screen-head">
        <h1 className="title">Statistiques</h1>
      </header>

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

      <div className="kpis" style={{ marginTop: 14 }}>
        <div className="kpi kpi-hero">
          <div className="kpi-label">Réussite</div>
          <div className="kpi-value num">{pct(ov.accuracy)}</div>
          <div className="kpi-sub">
            {ov.answered < MIN_SAMPLE
              ? ov.answered
                ? 'peu de données'
                : 'aucune réponse'
              : ci
                ? `fourchette probable ${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)} %`
                : ''}
          </div>
          {trend !== null && period !== '7d' && (
            <div className={`kpi-sub ${trend >= 0 ? 'delta-up' : 'delta-down'}`}>
              {trend >= 0 ? '+' : '−'}
              {Math.abs(Math.round(trend * 100))} pts sur 7 j vs avant
            </div>
          )}
        </div>
        <div className="kpi">
          <div className="kpi-label">Questions</div>
          <div className="kpi-value num">{ov.answered}</div>
          <div className="kpi-sub">{ov.activeDays} jour{ov.activeDays > 1 ? 's' : ''} actif{ov.activeDays > 1 ? 's' : ''}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Mains travaillées</div>
          <div className="kpi-value num">
            {ov.distinctHands}
            <small>/{library.ranges.length * 169}</small>
          </div>
          <div className="kpi-sub">
            {ov.distinctRanges} range{ov.distinctRanges > 1 ? 's' : ''}
            {ov.truncated ? ' · historique partiel' : ''}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Temps moyen</div>
          <div className="kpi-value num">{seconds(ov.avgMs)}</div>
          <div className="kpi-sub">par réponse</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Série record</div>
          <div className="kpi-value num">{ov.bestStreak}</div>
          <div className="kpi-sub">en cours : {ov.streak}</div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Évolution</h2>
          <span className="faint" style={{ fontSize: 12 }}>
            réussite par jour{period === 'all' ? ' · 30 derniers jours' : ''}
          </span>
        </div>
        <div className="card">
          <DailyChart points={series} />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Détail</h2>
        </div>
        <div className="chips" role="group" aria-label="Regrouper par">
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
                onClick={dim === 'range' ? () => navigate(`/range/${r.key}`) : undefined}
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
          <div className="section-head">
            <h2 className="section-title">Mains les plus ratées</h2>
            <button type="button" className="link-btn" onClick={() => navigate('/history/review')}>
              Révision
            </button>
          </div>
          <div className="list">
            {weak.map((w) => {
              const range = library.get(w.rangeId)!;
              return (
                <button key={`${w.rangeId}|${w.hand}`} type="button" className="row" onClick={() => navigate(`/range/${w.rangeId}/${w.hand}`)}>
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
    </main>
  );
}
