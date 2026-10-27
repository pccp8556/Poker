import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { enterTableMode, leaveTableMode } from '../../app/platform';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { explain, formatFrequency } from '../../domain/explain';
import type { Grade } from '../../domain/grading';
import { isMixed } from '../../domain/library';
import { choiceLabel, describeLine, heroAct, lineChoice, makeMove, planFor, startHand, type HandState } from '../../domain/play';
import { MODE_LABEL } from '../../domain/progress';
import { currentQuestion, expectedActions, isFinished, isUnlimited } from '../../domain/quiz';
import { defaultRng } from '../../domain/rng';
import { FORMAT_LABEL, spotSubtitle } from '../../domain/situation';
import type { Position } from '../../domain/types';
import { ActionBar, type Press } from '../components/ActionBar';
import { PokerTable } from '../components/PokerTable';
import { colorOf, RangeGrid, useColorMode } from '../components/RangeGrid';
import { Empty, Sheet } from '../components/common';
import { playAction, playFeedback } from '../sound';
import { IconArrowRight, IconCheck, IconClose, IconFlame, IconGrid, IconStop, IconTimer, IconX } from '../icons';

/** Time the opponent "thinks" before answering the hero's action (ms). */
const VILLAIN_DELAY = 750;
/** Pause on the final action before the next hand in exam mode (no correction). */
const EXAM_PAUSE = 500;

function vibrate(pattern: number | number[]) {
  try {
    if (store.data.settings.haptics && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

function sound(kind: Parameters<typeof playAction>[0]) {
  if (store.data.settings.sounds) playAction(kind);
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

interface Play {
  key: string;
  hand: HandState;
  /** Opponent currently thinking (null: hero to act or hand over). */
  acting: Position | null;
}

export function SessionScreen() {
  const session = useStore((s) => s.data.session);
  // Landscape + full screen on Android while a session is on screen.
  useEffect(() => {
    if (!session) return;
    enterTableMode();
    return () => leaveTableMode();
  }, [Boolean(session)]);

  if (!session) {
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
  return <TableSession />;
}

function TableSession() {
  const library = useLibrary();
  const session = useStore((s) => s.data.session);
  const settings = useStore((s) => s.data.settings);
  const streak = useStore((s) => s.data.progress.streak);
  const mode = useColorMode();
  const [feedback, setFeedback] = useState<{ grade: Grade; questionIndex: number; line: string } | null>(null);
  const [play, setPlay] = useState<Play | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [examPause, setExamPause] = useState(false);
  const decisionAt = useRef(performance.now());
  const [decisionAtState, setDecisionAtState] = useState(decisionAt.current);
  const thinkMs = useRef(0);
  /** Set synchronously on each hero action: a double tap never plays (or records) twice. */
  const locked = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const exam = session?.config.mode === 'exam';
  const unlimited = session ? isUnlimited(session.config) : false;
  const qIndex = feedback ? feedback.questionIndex : (session?.answers.length ?? 0);
  const question = session ? (feedback ? session.questions[feedback.questionIndex] : currentQuestion(session)) : null;
  const range = question ? library.get(question.rangeId) : undefined;
  const total = session?.questions.length ?? 0;
  const qKey = session && question ? `${session.id}:${qIndex}:${question.id}` : '';

  // A new hand is dealt for every question: blinds posted, actions before the hero applied.
  const dealt = useMemo(
    () => (session && question && range ? startHand(range, expectedActions(library, session, question), defaultRng) : null),
    [qKey, range],
  );
  const current = play?.key === qKey ? play : null;
  const hand = current?.hand ?? dealt;
  const acting = current?.acting ?? null;
  const heroTurn = Boolean(hand && hand.status === 'hero' && acting === null && !feedback && !examPause);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  useEffect(() => {
    thinkMs.current = 0;
    locked.current = false;
    decisionAt.current = performance.now();
    setDecisionAtState(decisionAt.current);
  }, [qKey]);

  const finish = useCallback(() => {
    const id = store.closeSession();
    navigate(id ? `/results/${id}` : '/', { replace: true });
  }, []);

  const next = useCallback(() => {
    clearTimers();
    setShowGrid(false);
    setFeedback(null);
    const s = store.data.session;
    if (s && isFinished(s)) finish();
  }, [finish]);

  /** Records the hand's result in the session (null = time out). */
  const record = useCallback(
    (chosen: string | null, line: string) => {
      const s = store.data.session;
      if (!s) return;
      const index = s.answers.length;
      const grade = store.answer(chosen, thinkMs.current);
      if (!grade) return;
      vibrate(grade.correct ? 12 : [30, 40, 30]);
      if (store.data.settings.sounds) playFeedback(grade.correct ? 'ok' : 'ko');
      if (s.config.mode === 'exam') {
        const after = store.data.session;
        if (after && isFinished(after)) finish();
        return;
      }
      setFeedback({ grade, questionIndex: index, line });
      if (grade.correct && store.data.settings.correction === 'fast') later(() => next(), 1100);
    },
    [finish, next],
  );

  const complete = useCallback(
    (final: HandState) => {
      if (!range) return;
      const chosen = lineChoice(range, final);
      const line = describeLine(final);
      if (exam) {
        // No correction in exam mode: show the last action briefly, then deal the next hand.
        setExamPause(true);
        later(() => {
          setExamPause(false);
          record(chosen, line);
        }, EXAM_PAUSE);
      } else record(chosen, line);
    },
    [range, exam, record],
  );

  const press = useCallback(
    (p: Press) => {
      if (!range || !hand || !heroTurn || locked.current) return;
      locked.current = true;
      const move = makeMove(hand, p.kind, p.kind === 'raise' ? p.to : 0);
      thinkMs.current += performance.now() - decisionAt.current;
      const { afterHero, next: after } = heroAct(range, hand, move, defaultRng);
      sound(move.kind);
      if (after.status === 'done') {
        setPlay({ key: qKey, hand: after, acting: null });
        complete(after);
        return;
      }
      // The opponent answers so that the hero must play the second part of the plan.
      const by = after.reactions[after.reactions.length - 1]?.by ?? null;
      setPlay({ key: qKey, hand: afterHero, acting: by });
      later(() => {
        setPlay({ key: qKey, hand: after, acting: null });
        locked.current = false;
        sound(after.reactions[after.reactions.length - 1]?.kind ?? 'raise');
        decisionAt.current = performance.now();
        setDecisionAtState(decisionAt.current);
      }, VILLAIN_DELAY);
    },
    [range, hand, heroTurn, qKey, complete],
  );

  // Exam timer: time limit for each decision; no answer in time counts as wrong.
  const timerSec = session?.config.timerSec ?? null;
  const decisionKey = `${qKey}:${hand?.decisions.length ?? 0}`;
  const timeout = useRef<() => void>(() => undefined);
  timeout.current = () => {
    if (locked.current) return;
    locked.current = true;
    thinkMs.current += performance.now() - decisionAt.current;
    record(null, 'Temps écoulé');
  };
  useEffect(() => {
    if (!exam || !timerSec || !heroTurn) {
      setRemaining(null);
      return;
    }
    const start = performance.now();
    setRemaining(timerSec);
    const id = setInterval(() => {
      const left = timerSec - (performance.now() - start) / 1000;
      if (left <= 0) {
        clearInterval(id);
        setRemaining(null);
        timeout.current();
      } else setRemaining(left);
    }, 100);
    return () => clearInterval(id);
  }, [exam, timerSec, heroTurn, decisionKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmQuit || showGrid || e.metaKey || e.ctrlKey || e.altKey) return;
      if (feedback && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, next, confirmQuit, showGrid]);

  const explanation = useMemo(() => (range && question && feedback ? explain(library, range, question.hand) : null), [library, range, question, feedback]);

  if (!session || !question || !range || !hand) return null;

  const answered = session.answers.length;
  const progress = unlimited ? 0 : Math.min(1, answered / total);
  const grade = feedback?.grade;
  const strategy = range.hands[question.hand] ?? {};
  const phase = feedback ? 'feedback' : hand.status === 'done' ? 'done' : acting ? 'villain' : 'hero';
  const reaction = hand.reactions[hand.reactions.length - 1];

  const quit = () => {
    clearTimers();
    const id = unlimited ? store.finishSession() : store.abandonSession();
    navigate(id ? `/results/${id}` : '/', { replace: true });
  };

  return (
    <main
      className={`session table-mode${settings.fourColor ? '' : ' two-color'}${feedback ? ' has-feedback' : ''}`}
      data-range={range.id}
      data-hand={question.hand}
      data-phase={phase}
      data-reaction={acting ? '' : (reaction?.kind ?? '')}
    >
      <header className="session-top">
        <button type="button" className="icon-btn plain" aria-label="Quitter la session" onClick={() => (answered > 0 ? setConfirmQuit(true) : quit())}>
          <IconClose />
        </button>
        <div className="session-spot">
          <span className="spot-name">
            {FORMAT_LABEL[range.format]} · {range.title} · <b className="num">{range.stackBb} BB</b>
          </span>
          <span className="spot-badges">
            {exam && <span className="badge badge-gold">{MODE_LABEL.exam}</span>}
            {question.recall && <span className="badge badge-accent">Rappel</span>}
            {question.rng !== null && (
              <span className="rng-chip">
                RNG <b className="num">{question.rng}</b>
              </span>
            )}
            {settings.showTimer && heroTurn && <LiveTimer since={decisionAtState} running={heroTurn} />}
            {remaining !== null && (
              <span className="timer-chip exam-left num" aria-label={`${Math.ceil(remaining)} secondes restantes`}>
                <IconTimer /> {Math.ceil(remaining)} s
              </span>
            )}
          </span>
        </div>
        <div className="session-progress" aria-label={unlimited ? `Main ${answered + 1}` : `Main ${Math.min(answered + 1, total)} sur ${total}`}>
          <div className={`meter ${unlimited ? 'infinite' : ''}`}>
            <i style={{ width: unlimited ? '100%' : `${progress * 100}%` }} />
          </div>
          <span className="session-count num">{unlimited ? `${qIndex + 1} / ∞` : `${Math.min(qIndex + 1, total)} / ${total}`}</span>
        </div>
        {!exam && streak > 0 && (
          <span className="streak on" aria-label={`Série de ${streak} bonnes réponses`}>
            <IconFlame /> <b className="num">{streak}</b>
          </span>
        )}
        {unlimited && (
          <button type="button" className="icon-btn plain end-btn" aria-label={`Terminer la session (${answered} réponse${answered > 1 ? 's' : ''})`} onClick={() => setConfirmQuit(true)}>
            <IconStop />
          </button>
        )}
      </header>

      <div className="play-area">
        <PokerTable hand={hand} cards={question.cards} acting={acting} dealKey={qKey} />
        {remaining !== null && (
          <div className="exam-bar" aria-hidden>
            <i style={{ width: `${(remaining / (timerSec ?? 1)) * 100}%` }} />
          </div>
        )}
      </div>

      <section className={`session-dock${!grade && !heroTurn ? ' waiting' : ''}`}>
        {!grade ? (
          <ActionBar key={decisionKey} hand={hand} disabled={!heroTurn || confirmQuit || showGrid} onPress={press} />
        ) : (
          <div className={`feedback ${grade.correct ? 'ok' : 'ko'}`} role="status" aria-live="assertive">
            <div className="fb-head">
              <span className="fb-icon">{grade.correct ? <IconCheck /> : <IconX />}</span>
              <div className="fb-title">
                <strong>{grade.correct ? 'Correct' : 'Incorrect'}</strong>
                <span className="fb-line">
                  {question.hand} · {grade.chosen === null ? 'Temps écoulé' : `Ta ligne : ${feedback.line}`}
                </span>
                {!grade.correct && grade.chosen !== null && !grade.chosen.startsWith('line:') && <span className="fb-as">= {choiceLabel(range, grade.chosen)}</span>}
              </div>
            </div>

            <div className="fb-ref">
              <span className="fb-ref-label">Range de référence{range.modified ? ' (version modifiée)' : range.origin === 'custom' ? ' (personnalisée)' : ''}</span>
              {explanation?.reference.map((r) => (
                <div key={r.id} className="fb-action-wrap">
                  <div className="fb-action">
                    <span className="legend-dot" style={{ background: colorOf(range, r.id, mode) }} />
                    <span className="fb-action-label">{r.label}</span>
                    <span className="fb-freq num">{formatFrequency(r.frequency)}</span>
                  </div>
                  <p className="fb-plan">{planFor(range, r.id).line}</p>
                </div>
              ))}
              {(strategy['profile-dependent'] ?? 0) > 0 && <p className="hint">Profil dépendant : suivre ou passer sont acceptés, selon l’adversaire.</p>}
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
                {isFinished(session) ? 'Voir le bilan' : 'Main suivante'} <IconArrowRight />
              </button>
            </div>
          </div>
        )}
        <p className="rotate-hint">Tourne ton téléphone pour jouer en paysage.</p>
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
          {answered > 1 ? `Tes ${answered} réponses sont déjà enregistrées` : 'Ta réponse est déjà enregistrée'} dans tes statistiques.
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
