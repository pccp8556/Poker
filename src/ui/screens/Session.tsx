import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { handKind } from '../../domain/cards';
import { explain, formatFrequency } from '../../domain/explain';
import type { Grade } from '../../domain/grading';
import { isMixed } from '../../domain/library';
import { MODE_LABEL } from '../../domain/progress';
import { currentQuestion, isFinished, isUnlimited } from '../../domain/quiz';
import { actionBefore, FORMAT_LABEL, spotSubtitle } from '../../domain/situation';
import { Hand } from '../components/PlayingCard';
import { colorOf, RangeGrid, useColorMode } from '../components/RangeGrid';
import { TableFelt } from '../components/TableFelt';
import { Empty, Sheet } from '../components/common';
import { playFeedback } from '../sound';
import { IconArrowRight, IconCheck, IconClose, IconFlame, IconGrid, IconStop, IconTimer, IconX } from '../icons';

const KIND_LABEL = { pair: 'Paire', suited: 'Suited', offsuit: 'Offsuit' } as const;

function vibrate(pattern: number | number[]) {
  try {
    if (store.data.settings.haptics && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

/** Thinking time shown live when the "Chronomètre" setting is on. */
function LiveTimer({ since, running }: { since: number; running: boolean }) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  const s = Math.max(0, (now - since) / 1000);
  return (
    <span className="timer-chip num" aria-label={`${Math.floor(s)} secondes`}>
      <IconTimer /> {s.toFixed(1).replace('.', ',')} s
    </span>
  );
}

export function SessionScreen() {
  const library = useLibrary();
  const session = useStore((s) => s.data.session);
  const settings = useStore((s) => s.data.settings);
  const streak = useStore((s) => s.data.progress.streak);
  const mode = useColorMode();
  const [feedback, setFeedback] = useState<{ grade: Grade; questionIndex: number } | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const shownAt = useRef(performance.now());
  const [shownAtState, setShownAtState] = useState(shownAt.current);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const exam = session?.config.mode === 'exam';
  const unlimited = session ? isUnlimited(session.config) : false;
  const qIndex = feedback ? feedback.questionIndex : (session?.answers.length ?? 0);
  const question = session ? (feedback ? session.questions[feedback.questionIndex] : currentQuestion(session)) : null;
  const range = question ? library.get(question.rangeId) : undefined;
  const total = session?.questions.length ?? 0;

  useEffect(() => {
    if (!feedback) {
      shownAt.current = performance.now();
      setShownAtState(shownAt.current);
    }
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
      if (store.data.settings.sounds) playFeedback(grade.correct ? 'ok' : 'ko');
      if (s.config.mode === 'exam') {
        const after = store.data.session;
        if (after && isFinished(after)) finish();
        return;
      }
      setFeedback({ grade, questionIndex: index });
      if (grade.correct && store.data.settings.correction === 'fast') {
        autoTimer.current = setTimeout(() => next(), 850);
      }
    },
    [feedback, finish, next],
  );

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
            <button type="button" className="btn btn-primary" onClick={() => navigate('/train', { replace: true })}>
              Choisir un entraînement
            </button>
          }
        >
          Lance un entraînement depuis l’accueil ou l’onglet Entraîner.
        </Empty>
      </main>
    );
  }

  const answered = session.answers.length;
  const progress = unlimited ? 0 : Math.min(1, answered / total);
  const grade = feedback?.grade;
  const strategy = range.hands[question.hand] ?? {};
  const label = (id: string) => range.actions.find((a) => a.id === id)?.label ?? id;

  const quit = () => {
    clearTimeout(autoTimer.current);
    const id = unlimited ? store.finishSession() : store.abandonSession();
    navigate(id ? `/results/${id}` : '/', { replace: true });
  };

  return (
    <main className={`session ${settings.fourColor ? '' : 'two-color'}`} data-range={range.id} data-hand={question.hand}>
      <header className="session-top">
        <button type="button" className="icon-btn plain" aria-label="Quitter la session" onClick={() => (answered > 0 ? setConfirmQuit(true) : quit())}>
          <IconClose />
        </button>
        <div className="session-progress" aria-label={unlimited ? `Question ${answered + 1}` : `Question ${Math.min(answered + 1, total)} sur ${total}`}>
          <div className={`meter ${unlimited ? 'infinite' : ''}`}>
            <i style={{ width: unlimited ? '100%' : `${progress * 100}%` }} />
          </div>
        </div>
        <span className="session-count num">{unlimited ? `${qIndex + 1} / ∞` : `${Math.min(qIndex + 1, total)} / ${total}`}</span>
        {!exam && streak > 0 && (
          <span className="streak on" aria-label={`Série de ${streak} bonnes réponses`}>
            <IconFlame /> <b className="num">{streak}</b>
          </span>
        )}
      </header>

      <section className="session-stage">
        <div className="spot-line">
          <span className="badge">{FORMAT_LABEL[range.format]}</span>
          <span className="badge">{range.title}</span>
          <span className="badge badge-gold num">{range.stackBb} BB</span>
          {exam && <span className="badge badge-gold">{MODE_LABEL.exam}</span>}
          {question.recall && <span className="badge badge-accent">Rappel</span>}
          {settings.showTimer && !feedback && <LiveTimer since={shownAtState} running={!feedback} />}
        </div>

        <TableFelt range={range}>
          <Hand cards={question.cards} dealKey={question.id} />
        </TableFelt>

        <div className="prompt">
          <p className="prompt-hand">
            <b>{question.hand}</b> <span className="kind-chip">{KIND_LABEL[handKind(question.hand)]}</span>
          </p>
          <p className="prompt-context">{actionBefore(range)} · Meilleure décision selon la range ?</p>
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
                <span className="answer-dot" style={{ background: colorOf(range, id, mode) }} />
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
                {!grade.correct && grade.chosen && <span>Ta réponse : {label(grade.chosen)}</span>}
              </div>
            </div>

            <div className="fb-ref">
              <span className="fb-ref-label">Range de référence{range.modified ? ' (version modifiée)' : range.origin === 'custom' ? ' (personnalisée)' : ''}</span>
              {explanation?.reference.map((r) => (
                <div key={r.id} className="fb-action">
                  <span className="legend-dot" style={{ background: colorOf(range, r.id, mode) }} />
                  <span className="fb-action-label">{r.label}</span>
                  <span className="fb-freq num">{formatFrequency(r.frequency)}</span>
                </div>
              ))}
              {explanation?.reference[0]?.description && <p className="fb-desc">{explanation.reference[0].description}</p>}
              {isMixed(strategy) && (
                <p className="hint">
                  Main mixte · règle {grade.rule === 'strict' ? `stricte (RNG ${grade.rng ?? '—'})` : 'tolérante : toute action jouée par la range est acceptée'}.
                </p>
              )}
            </div>

            {explanation && explanation.otherStacks.length > 1 && (
              <div className="fb-stacks" aria-label="Même main aux autres profondeurs">
                {explanation.otherStacks.map((o) => {
                  const r = library.require(o.rangeId);
                  return (
                    <div key={o.rangeId} className={`fb-stack ${o.current ? 'current' : ''}`}>
                      <span className="num">{o.stackBb} BB</span>
                      <span className="fb-stack-action">
                        <i className="legend-dot" style={{ background: colorOf(r, o.actions[0]?.id ?? '', mode) }} />
                        {o.actions.map((a) => a.label).join(' / ')}
                      </span>
                    </div>
                  );
                })}
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
        {unlimited && (
          <button type="button" className="text-btn end-btn" onClick={() => setConfirmQuit(true)}>
            <IconStop /> Terminer la session ({answered} réponse{answered > 1 ? 's' : ''})
          </button>
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
              <i className="legend-dot" style={{ background: colorOf(range, a.id, mode) }} /> {a.label}
            </span>
          ))}
        </div>
        <p className="hint">{range.source.page !== null ? `Source : ${library.data.source.file}, page ${range.source.page}${range.modified ? ' (modifiée par toi)' : ''}.` : 'Range personnalisée.'}</p>
      </Sheet>

      <Sheet open={confirmQuit} onClose={() => setConfirmQuit(false)} label="Quitter la session">
        <h2 className="title-sm">{unlimited ? 'Terminer la session ?' : 'Quitter la session ?'}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Tes {answered} réponse{answered > 1 ? 's' : ''} {answered > 1 ? 'sont' : 'est'} déjà enregistrée{answered > 1 ? 's' : ''} dans tes statistiques.
          {unlimited ? '' : ' Tu peux aussi reprendre plus tard depuis l’accueil.'}
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/', { replace: true })}>
            Mettre en pause
          </button>
          <button type="button" className={`btn ${unlimited ? 'btn-primary' : 'btn-danger'}`} onClick={quit}>
            {unlimited ? 'Voir le bilan' : 'Terminer maintenant'}
          </button>
        </div>
      </Sheet>
    </main>
  );
}
