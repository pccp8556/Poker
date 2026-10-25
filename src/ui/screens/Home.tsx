import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { MODE_LABEL, type SessionMode } from '../../domain/progress';
import { isFinished, isUnlimited, UNLIMITED } from '../../domain/quiz';
import { overview, periodStart, reviewQueue, weakRanges } from '../../domain/stats';
import { Ring, SaveErrorBanner, Segmented, Sheet } from '../components/common';
import { AppMark } from '../components/AppMark';
import { pct, plural, untilLabel } from '../format';
import { IconCalendar, IconChevron, IconCrosshair, IconGrid, IconPlay, IconRefresh, IconSliders, IconStar, IconTarget } from '../icons';
import { describeSelection } from '../selection';

export const COUNT_OPTIONS = [
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: UNLIMITED, label: '∞' },
];

/** Starts a session and opens it; explains why when nothing matches. */
export function launch(rangeIds: string[], mode: SessionMode, count?: number, extra: Parameters<typeof store.buildConfig>[3] = {}) {
  const ok = store.startSession(store.buildConfig(rangeIds, mode, count, extra));
  if (ok) navigate('/session');
  else
    store.showToast(
      mode === 'review' ? 'Aucune main à réviser pour le moment.' : mode === 'errors' ? 'Aucune erreur à corriger : bravo !' : 'Aucune question ne correspond à cette sélection.',
      'info',
    );
  return ok;
}

export function HomeScreen() {
  const library = useLibrary();
  const data = useStore((s) => s.data);
  const { progress, session, favorites, settings } = data;
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const now = Date.now();
  const allIds = library.ranges.map((r) => r.id);
  const totalHands = library.ranges.length * 169;

  const all = useMemo(() => overview(progress, 'all', now), [progress, now]);
  const queue = useMemo(() => reviewQueue(library, progress, now), [library, progress, now]);
  const weak = useMemo(() => weakRanges(library, progress, periodStart('30d', now), 3), [library, progress, now]);
  const resumable = session && !isFinished(session) ? session : null;
  const resumeOk = resumable ? resumable.answers.filter((a) => a.grade.correct).length : 0;

  return (
    <main className="screen home">
      <header className="home-head">
        <AppMark />
        <div>
          <h1 className="title">Expresso Ranges</h1>
          <p className="muted">
            Spin &amp; Go · {library.ranges.length} ranges préflop
          </p>
        </div>
      </header>
      <SaveErrorBanner />

      {resumable && (
        <section className="card resume-card">
          <div className="resume-row">
            <div className="resume-text">
              <span className="eyebrow">Session en cours</span>
              <strong className="resume-title">{resumable.config.label ?? describeSelection(library, resumable.config.rangeIds)}</strong>
              <span className="muted num">
                {plural(resumable.answers.length, 'réponse')}
                {isUnlimited(resumable.config) ? '' : ` sur ${resumable.questions.length}`} · {resumable.answers.length ? pct(resumeOk / resumable.answers.length) : '—'}
              </span>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/session')}>
              <IconPlay /> Reprendre
            </button>
          </div>
          {!isUnlimited(resumable.config) && (
            <div className="meter">
              <i style={{ width: `${(resumable.answers.length / resumable.questions.length) * 100}%` }} />
            </div>
          )}
          <button type="button" className="text-btn" onClick={() => setConfirmAbandon(true)}>
            Abandonner cette session
          </button>
        </section>
      )}

      <section className="card summary-card">
        <Ring value={all.accuracy} size={112} stroke={9}>
          <span className="ring-value num">{pct(all.accuracy)}</span>
        </Ring>
        <dl className="summary-stats">
          <div>
            <dt>Réponses</dt>
            <dd className="num">{all.answered}</dd>
            <span>décisions</span>
          </div>
          <div>
            <dt>Vues</dt>
            <dd className="num">{pct(totalHands ? all.distinctHands / totalHands : 0)}</dd>
            <span className="num">
              {all.distinctHands} / {totalHands}
            </span>
          </div>
          <div>
            <dt>Série</dt>
            <dd className="num">{progress.streak}</dd>
            <span>record {progress.bestStreak}</span>
          </div>
        </dl>
      </section>

      <section className="card quick-card">
        <h2 className="card-heading">Entraînement rapide</h2>
        <p className="muted">Toutes les ranges mélangées, priorité aux révisions dues.</p>
        <Segmented<number> label="Nombre de questions" value={settings.defaultCount} onChange={(v) => store.updateSettings({ defaultCount: v })} options={COUNT_OPTIONS} />
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => launch(allIds, 'random', settings.defaultCount, { label: 'Entraînement rapide' })}>
          <IconPlay /> Commencer
        </button>
      </section>

      <div className="tiles">
        <button type="button" className="tile" onClick={() => navigate('/custom')}>
          <span className="tile-icon t-green">
            <IconSliders />
          </span>
          <strong>Personnalisé</strong>
          <span>Filtres combinés</span>
        </button>
        <button type="button" className="tile" onClick={() => launch(allIds, 'errors', 50, { label: 'Mes erreurs' })}>
          <span className="tile-icon t-red">
            <IconRefresh />
          </span>
          {queue.inReview.length > 0 && <span className="tile-badge num">{queue.inReview.length}</span>}
          <strong>Mes erreurs</strong>
          <span>{queue.inReview.length ? `${queue.inReview.length} à corriger` : 'Aucune erreur'}</span>
        </button>
        <button type="button" className="tile" onClick={() => launch(allIds, 'marginal', settings.defaultCount, { label: 'Mains marginales' })}>
          <span className="tile-icon t-gold">
            <IconCrosshair />
          </span>
          <strong>Mains marginales</strong>
          <span>Frontières &amp; sélection</span>
        </button>
        <button type="button" className="tile" onClick={() => navigate('/ranges')}>
          <span className="tile-icon t-grey">
            <IconGrid />
          </span>
          <strong>Explorateur</strong>
          <span>Les {library.ranges.length} grilles</span>
        </button>
      </div>

      <button
        type="button"
        className="card row-card"
        onClick={() => (queue.dueCount ? launch(allIds, 'review', 50, { label: 'Révisions espacées' }) : navigate('/history/review'))}
      >
        <span className="tile-icon t-green">
          <IconCalendar />
        </span>
        <div className="row-main">
          <div className="row-title">Révisions espacées</div>
          <div className="row-sub">
            {queue.dueCount
              ? `${plural(queue.dueCount, 'situation')} à revoir aujourd’hui`
              : queue.inReview.length
                ? `À jour · prochaine ${queue.nextDue ? untilLabel(queue.nextDue, now) : '—'}`
                : 'Les mains ratées reviendront ici au bon moment'}
          </div>
        </div>
        <IconChevron className="chev" />
      </button>

      {favorites.length > 0 && (
        <section className="section">
          <h2 className="section-title">Favoris</h2>
          <div className="list">
            {favorites.map((f) => (
              <button key={f.id} type="button" className="row" onClick={() => launch(f.rangeIds, f.mode, f.questionCount, { label: f.name })}>
                <IconStar filled className="fav-star" />
                <div className="row-main">
                  <div className="row-title">{f.name}</div>
                  <div className="row-sub">
                    {describeSelection(library, f.rangeIds)} · {MODE_LABEL[f.mode]}
                  </div>
                </div>
                <IconPlay className="chev" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">À travailler en priorité</h2>
        {weak.length === 0 ? (
          <div className="card hint-card">Après quelques sessions, tes ranges les moins maîtrisées apparaîtront ici pour un entraînement ciblé en un geste.</div>
        ) : (
          <div className="list">
            {weak.map((w) => (
              <button key={w.key} type="button" className="row" onClick={() => launch([w.key], 'targeted', undefined, { label: `Ciblé · ${w.label}` })}>
                <IconTarget className="weak-icon" />
                <div className="row-main">
                  <div className="row-title">{w.label}</div>
                  <div className="row-sub">{w.n} réponses sur 30 jours · session ciblée</div>
                </div>
                <span className="row-end num">{pct(w.accuracy)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <Sheet open={confirmAbandon} onClose={() => setConfirmAbandon(false)} label="Abandonner la session">
        <h2 className="title-sm">Abandonner cette session ?</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Les réponses déjà données restent dans tes statistiques ; la session sera classée comme interrompue.
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmAbandon(false)}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              store.abandonSession();
              setConfirmAbandon(false);
            }}
          >
            Abandonner
          </button>
        </div>
      </Sheet>
    </main>
  );
}
