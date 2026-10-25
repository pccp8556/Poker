import { useMemo } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { dayKey, MODE_LABEL, type SessionMode } from '../../domain/progress';
import { isFinished } from '../../domain/quiz';
import { overview, periodStart, reviewQueue, weakRanges } from '../../domain/stats';
import { SaveErrorBanner } from '../components/common';
import { pct, plural, untilLabel } from '../format';
import { IconArrowRight, IconChevron, IconFlame, IconPlay, IconRefresh, IconSparkle, IconStar, IconTarget } from '../icons';
import { describeSelection } from '../selection';

function start(rangeIds: string[], mode: SessionMode, count?: number) {
  const ok = store.startSession(store.buildConfig(rangeIds, mode, count));
  if (ok) navigate('/session');
  else store.showToast(mode === 'review' ? 'Aucune main à réviser pour le moment.' : 'Aucune question ne correspond à cette sélection.', 'info');
}

export function HomeScreen() {
  const library = useLibrary();
  const data = useStore((s) => s.data);
  const now = Date.now();
  const { progress, session, favorites, recents, settings } = data;

  const week = useMemo(() => overview(progress, '7d', now), [progress, now]);
  const todayCount = progress.days[dayKey(now)]?.n ?? 0;
  const queue = useMemo(() => reviewQueue(library, progress, now), [library, progress, now]);
  const weak = useMemo(() => weakRanges(library, progress, periodStart('30d', now), 3), [library, progress, now]);
  const firstRun = Object.keys(progress.days).length === 0;
  const allIds = library.ranges.map((r) => r.id);
  const quick = recents[0] ?? { rangeIds: allIds, mode: 'random' as SessionMode };
  const resumable = session && !isFinished(session) ? session : null;

  return (
    <main className="screen home">
      <header className="screen-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <i />
          </span>
          <div>
            <h1 className="title">Range Lab</h1>
            <p className="faint" style={{ fontSize: 13 }}>
              Spin &amp; Go · {library.ranges.length} ranges préflop
            </p>
          </div>
        </div>
      </header>
      <SaveErrorBanner />

      {resumable && (
        <button type="button" className="card pressable resume-card" onClick={() => navigate('/session')}>
          <div className="resume-top">
            <span className="badge badge-accent">Session en cours</span>
            <span className="faint num" style={{ fontSize: 13 }}>
              {resumable.answers.length}/{resumable.questions.length}
            </span>
          </div>
          <div className="resume-title">{describeSelection(library, resumable.config.rangeIds)}</div>
          <div className="meter" style={{ marginTop: 10 }}>
            <i style={{ width: `${(resumable.answers.length / resumable.questions.length) * 100}%` }} />
          </div>
          <div className="resume-cta">
            {MODE_LABEL[resumable.config.mode]} · Reprendre <IconArrowRight />
          </div>
        </button>
      )}

      {firstRun && !resumable && (
        <div className="card welcome">
          <IconSparkle className="welcome-icon" />
          <h2 className="title-sm">Bienvenue</h2>
          <p className="muted">
            Les {library.ranges.length} ranges du guide « {library.data.source.title.split('—')[1]?.split('·')[0]?.trim() || 'Ranges'} » sont prêtes : BTN, SB et BB en 3-max, SB et BB en heads-up, de 8 à 25 BB.
            Chaque question vous place dans un spot réel ; la correction s’appuie uniquement sur ces ranges.
          </p>
        </div>
      )}

      <section className="hero-card">
        <div className="hero-card-body">
          <span className="eyebrow">Entraînement rapide</span>
          <h2 className="hero-title">{describeSelection(library, quick.rangeIds)}</h2>
          <p className="muted" style={{ fontSize: 13.5 }}>
            {MODE_LABEL[quick.mode === 'review' || quick.mode === 'errors' ? 'random' : quick.mode]} · {settings.defaultCount} questions
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => start(quick.rangeIds, quick.mode === 'review' || quick.mode === 'errors' ? 'random' : quick.mode)}>
            <IconPlay /> Lancer
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => navigate('/ranges')}>
            Choisir
          </button>
        </div>
      </section>

      {queue.inReview.length > 0 && (
        <button type="button" className={`card pressable review-card ${queue.dueCount ? 'due' : ''}`} onClick={() => (queue.dueCount ? start(allIds, 'review', 30) : navigate('/history/review'))}>
          <span className="review-icon">
            <IconRefresh />
          </span>
          <div className="row-main">
            <div className="row-title">{queue.dueCount ? `${plural(queue.dueCount, 'main')} à réviser` : 'Révisions à jour'}</div>
            <div className="row-sub">
              {queue.dueCount
                ? 'Mains ratées dont la révision est due'
                : `${plural(queue.inReview.length, 'main')} en suivi · prochaine ${queue.nextDue ? untilLabel(queue.nextDue, now) : '—'}`}
            </div>
          </div>
          {queue.dueCount > 0 ? <span className="btn btn-primary" style={{ minHeight: 38 }}>Réviser</span> : <IconChevron className="chev" />}
        </button>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Progression</h2>
          <button type="button" className="link-btn" onClick={() => navigate('/stats')}>
            Détails
          </button>
        </div>
        <div className="mini-kpis">
          <div className="kpi">
            <div className="kpi-label">Aujourd’hui</div>
            <div className="kpi-value num">{todayCount}</div>
            <div className="kpi-sub">questions</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Précision 7 j</div>
            <div className="kpi-value num">{week.answered ? pct(week.accuracy) : '—'}</div>
            <div className="kpi-sub">{week.answered ? `${week.answered} réponses` : 'aucune réponse'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Série</div>
            <div className="kpi-value num streak-value">
              <IconFlame /> {progress.streak}
            </div>
            <div className="kpi-sub">record {progress.bestStreak}</div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Favoris</h2>
        </div>
        {favorites.length === 0 ? (
          <p className="faint" style={{ fontSize: 13.5 }}>
            Enregistrez une sélection de ranges avec <IconStar style={{ width: 14, height: 14, verticalAlign: -2 }} /> depuis l’écran Ranges pour la lancer d’un geste.
          </p>
        ) : (
          <div className="list">
            {favorites.map((f) => (
              <button key={f.id} type="button" className="row" onClick={() => start(f.rangeIds, f.mode, f.questionCount)}>
                <IconStar filled className="fav-star" />
                <div className="row-main">
                  <div className="row-title">{f.name}</div>
                  <div className="row-sub">
                    {describeSelection(library, f.rangeIds)} · {MODE_LABEL[f.mode]} · {f.questionCount} q.
                  </div>
                </div>
                <IconPlay className="chev" />
              </button>
            ))}
          </div>
        )}
      </section>

      {weak.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">À travailler</h2>
            <span className="faint" style={{ fontSize: 12 }}>30 derniers jours</span>
          </div>
          <div className="list">
            {weak.map((w) => (
              <button key={w.key} type="button" className="row" onClick={() => start([w.key], 'targeted')}>
                <IconTarget className="weak-icon" />
                <div className="row-main">
                  <div className="row-title">{w.label}</div>
                  <div className="row-sub">{w.n} réponses · session ciblée</div>
                </div>
                <span className="row-end num">{pct(w.accuracy)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {recents.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Récemment</h2>
          </div>
          <div className="list">
            {recents.slice(0, 3).map((r) => (
              <button key={`${r.mode}-${r.rangeIds.join()}`} type="button" className="row" onClick={() => start(r.rangeIds, r.mode)}>
                <div className="row-main">
                  <div className="row-title">{describeSelection(library, r.rangeIds)}</div>
                  <div className="row-sub">{MODE_LABEL[r.mode]}</div>
                </div>
                <IconPlay className="chev" />
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
