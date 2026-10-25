import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { actionMeta } from '../../domain/actions';
import { handKind } from '../../domain/cards';
import { explain, formatFrequency } from '../../domain/explain';
import type { Grade } from '../../domain/grading';
import { isMixed } from '../../domain/library';
import { MODE_LABEL } from '../../domain/progress';
import { currentQuestion, isFinished } from '../../domain/quiz';
import { actionBefore, FORMAT_LABEL, spotSubtitle } from '../../domain/situation';
import { Hand } from '../components/PlayingCard';
import { RangeGrid } from '../components/RangeGrid';
import { TableFelt } from '../components/TableFelt';
import { Empty, Sheet } from '../components/common';
import { IconArrowRight, IconCheck, IconClose, IconFlame, IconGrid, IconTimer, IconX } from '../icons';

const KIND_LABEL = { pair: 'paire', suited: 'assortie', offsuit: 'dépareillée' } as const;

function vibrate(pattern: number | number[]) {
  try {
    if (store.data.settings.haptics && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

export function SessionScreen() {
  const library = useLibrary();
  const session = useStore((s) => s.data.session);
  const settings = useStore((s) => s.data.settings);
  const streak = useStore((s) => s.data.progress.streak);
  const [feedback, setFeedback] = useState<{ grade: Grade; questionIndex: number } | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const shownAt = useRef(performance.now());
  const autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const exam = session?.config.mode === 'exam';
  // While feedback is displayed, keep showing the question that was answered.
  const qIndex = feedback ? feedback.questionIndex : (session?.answers.length ?? 0);
  const question = session ? (feedback ? session.questions[feedback.questionIndex] : currentQuestion(session)) : null;
  const range = question ? library.get(question.rangeId) : undefined;
  const total = session?.questions.length ?? 0;

  // Reset the answer timer whenever a new question appears.
  useEffect(() => {
    if (!feedback) shownAt.current = performance.now();
  }, [qIndex, feedback]);

  const finish = useCallback(() => {
    const id = store.closeSession();
    navigate(id ? `/results/${id}` : '/', { replace: true });
  }, []);

  const next = useCallback(() => {
    clearTimeout(autoTimer.current);
    setShowGrid(false);
    setFeedback(null);
    const s = store.data.session;
    if (s && isFinished(s)) finish();
  }, [finish]);

  const answer = useCallback(
    (choice: string | null) => {
      const s = store.data.session;
      if (!s || feedback) return;
      const index = s.answers.length;
      const ms = performance.now() - shownAt.current;
      const grade = store.answer(choice, ms);
      if (!grade) return;
      vibrate(grade.correct ? 12 : [30, 40, 30]);
      if (s.config.mode === 'exam') {
        const after = store.data.session;
        if (after && isFinished(after)) finish();
        return;
      }
      setFeedback({ grade, questionIndex: index });
      if (grade.correct && store.data.settings.autoAdvance) {
        autoTimer.current = setTimeout(() => next(), 900);
      }
    },
    [feedback, finish, next],
  );

  // Exam timer.
  const timerSec = session?.config.timerSec ?? null;
  useEffect(() => {
    if (!exam || !timerSec || feedback || !question) {
      setRemaining(null);
      return;
    }
    const start = performance.now();
    setRemaining(timerSec);
    const id = setInterval(() => {
      const left = timerSec - (performance.now() - start) / 1000;
      if (left <= 0) {
        clearInterval(id);
        answer(null);
      } else setRemaining(left);
    }, 100);
    return () => clearInterval(id);
  }, [exam, timerSec, question, feedback, answer]);

  // Keyboard shortcuts (desktop): 1-9 to answer, Enter/Space to continue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmQuit || e.metaKey || e.ctrlKey || e.altKey) return;
      if (feedback && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      } else if (!feedback && question && /^[1-9]$/.test(e.key)) {
        const opt = question.options[Number(e.key) - 1];
        if (opt) answer(opt);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, question, answer, next, confirmQuit]);

  useEffect(() => () => clearTimeout(autoTimer.current), []);

  const explanation = useMemo(() => (range && question && feedback ? explain(library, range, question.hand) : null), [library, range, question, feedback]);

  if (!session || !question || !range) {
    return (
      <main className="screen no-nav">
        <Empty
          title="Aucune session en cours"
          action={
            <button type="button" className="btn btn-primary" onClick={() => navigate('/ranges', { replace: true })}>
              Choisir des ranges
            </button>
          }
        >
          Lancez un entraînement depuis l’accueil ou la liste des ranges.
        </Empty>
      </main>
    );
  }

  const answered = session.answers.length;
  const progress = Math.min(1, answered / total);
  const grade = feedback?.grade;
  const strategy = range.hands[question.hand] ?? {};
  const label = (id: string) => range.actions.find((a) => a.id === id)?.label ?? id;

  const quit = () => {
    clearTimeout(autoTimer.current);
    const id = store.abandonSession();
    navigate(id ? `/results/${id}` : '/', { replace: true });
  };

  return (
    <main className={`session ${settings.fourColor ? '' : 'two-color'}`} data-range={range.id} data-hand={question.hand}>
      <header className="session-top">
        <button type="button" className="icon-btn plain" aria-label="Quitter la session" onClick={() => (answered > 0 ? setConfirmQuit(true) : quit())}>
          <IconClose />
        </button>
        <div className="session-progress" aria-label={`Question ${Math.min(answered + 1, total)} sur ${total}`}>
          <div className="meter">
            <i style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <span className="session-count num">
          {Math.min(qIndex + 1, total)}/{total}
        </span>
        {!exam && (
          <span className={`streak ${streak > 0 ? 'on' : ''}`} aria-label={`Série de ${streak} bonnes réponses`}>
            <IconFlame /> <b className="num">{streak}</b>
          </span>
        )}
      </header>

      <section className="session-stage">
        <div className="spot-line">
          <span className="badge">{FORMAT_LABEL[range.format]}</span>
          <span className="badge">{range.title}</span>
          {exam && <span className="badge badge-gold">{MODE_LABEL.exam}</span>}
          {question.recall && <span className="badge badge-accent">Rappel</span>}
        </div>

        <TableFelt range={range}>
          <Hand cards={question.cards} dealKey={question.id} />
        </TableFelt>

        <div className="prompt">
          <p className="prompt-context">{actionBefore(range)}</p>
          <p className="prompt-hand">
            <b>{question.hand}</b> <span className="faint">· {KIND_LABEL[handKind(question.hand)]}</span>
          </p>
          {question.rng !== null && (
            <p className="rng-chip">
              RNG <b className="num">{question.rng}</b>
            </p>
          )}
        </div>

        {remaining !== null && (
          <div className="exam-timer" aria-label={`${Math.ceil(remaining)} secondes restantes`}>
            <IconTimer />
            <div className="meter">
              <i style={{ width: `${(remaining / (timerSec ?? 1)) * 100}%` }} />
            </div>
            <span className="num">{Math.ceil(remaining)} s</span>
          </div>
        )}
      </section>

      <section className="session-dock">
        {!grade ? (
          <div className="answers" role="group" aria-label="Réponses possibles">
            {question.options.map((id, i) => (
              <button key={id} type="button" className="answer" onClick={() => answer(id)}>
                <span className="answer-swatch" style={{ background: actionMeta(id).color }} />
                <span className="answer-label">{label(id)}</span>
                <kbd className="answer-key">{i + 1}</kbd>
              </button>
            ))}
          </div>
        ) : (
          <div className={`feedback ${grade.correct ? 'ok' : 'ko'}`} role="status" aria-live="assertive">
            <div className="fb-head">
              <span className="fb-icon">{grade.correct ? <IconCheck /> : <IconX />}</span>
              <div className="fb-title">
                <strong>{grade.correct ? 'Correct' : 'Incorrect'}</strong>
                {!grade.correct && grade.chosen && <span>Votre réponse : {label(grade.chosen)}</span>}
              </div>
            </div>

            <div className="fb-ref">
              <span className="fb-ref-label">Range de référence</span>
              {explanation?.reference.map((r) => (
                <div key={r.id} className="fb-action">
                  <span className="legend-dot" style={{ background: actionMeta(r.id).color }} />
                  <span className="fb-action-label">{r.label}</span>
                  <span className="fb-freq num">{formatFrequency(r.frequency)}</span>
                </div>
              ))}
              <p className="fb-desc">{explanation?.reference[0]?.description}</p>
              {isMixed(strategy) && (
                <p className="hint">
                  Main mixte · règle {grade.rule === 'strict' ? `stricte (RNG ${grade.rng ?? '—'})` : 'tolérante : toute action jouée par la range est acceptée'}.
                </p>
              )}
            </div>

            {explanation && explanation.otherStacks.length > 1 && (
              <div className="fb-stacks" aria-label="Même main aux autres profondeurs">
                {explanation.otherStacks.map((o) => (
                  <div key={o.rangeId} className={`fb-stack ${o.current ? 'current' : ''}`}>
                    <span className="num">{o.stackBb} BB</span>
                    <span className="fb-stack-action">
                      <i className="legend-dot" style={{ background: actionMeta(o.actions[0]?.id ?? '').color }} />
                      {o.actions.map((a) => a.label).join(' / ')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="fb-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowGrid(true)}>
                <IconGrid /> Range
              </button>
              <button type="button" className="btn btn-primary btn-lg fb-next" onClick={next} autoFocus>
                {isFinished(session) ? 'Voir le bilan' : 'Continuer'} <IconArrowRight />
              </button>
            </div>
          </div>
        )}
      </section>

      <Sheet open={showGrid} onClose={() => setShowGrid(false)} label="Grille de la range">
        <div className="sheet-title">
          <div>
            <div className="eyebrow">{spotSubtitle(range)}</div>
            <h2 className="title-sm">
              {range.title} · {range.stackBb} BB
            </h2>
          </div>
        </div>
        <RangeGrid range={range} highlight={question.hand} size="compact" />
        <div className="grid-legend-inline">
          {range.actions.map((a) => (
            <span key={a.id}>
              <i className="legend-dot" style={{ background: actionMeta(a.id).color }} /> {a.label}
            </span>
          ))}
        </div>
        <p className="hint">Source : {library.data.source.file}, page {range.source.page}.</p>
      </Sheet>

      <Sheet open={confirmQuit} onClose={() => setConfirmQuit(false)} label="Quitter la session">
        <h2 className="title-sm">Quitter la session ?</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Vos {answered} réponse{answered > 1 ? 's' : ''} sont déjà enregistrée{answered > 1 ? 's' : ''} dans vos statistiques. Vous pouvez aussi reprendre plus tard depuis l’accueil.
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/', { replace: true })}>
            Mettre en pause
          </button>
          <button type="button" className="btn btn-danger" onClick={quit}>
            Terminer maintenant
          </button>
        </div>
      </Sheet>
    </main>
  );
}
