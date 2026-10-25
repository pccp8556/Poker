import { sortActionIds } from './actions';
import { ALL_HANDS, dealHand, type Card } from './cards';
import { grade, type Grade, type GradingRule } from './grading';
import { isMixed, type Library } from './library';
import { itemKey, type SessionMode, type SessionSummary } from './progress';
import { isDue, isInReview, MASTERED_BOX, weakness, type ItemStat } from './review';
import { randomId, shuffle, type Rng } from './rng';

export interface SessionConfig {
  rangeIds: string[];
  mode: SessionMode;
  questionCount: number;
  /** Rule for training modes; the exam mode always uses the "exam" rule. */
  grading: 'tolerant' | 'strict';
  /** Ask more often the hands located at a frontier between two actions. */
  focusBoundary: boolean;
  /** Ask a missed hand again a few questions later (not in exam mode). */
  recallMistakes: boolean;
  /** Seconds per question in exam mode (null = no limit). */
  timerSec: number | null;
  /** Only hands whose expected answer includes one of these actions. */
  actionFilter?: string[];
  /** Hands whose strategy includes one of these actions are left out. */
  excludeActions?: string[];
  /** Restricts each range to these hands (marginal-hands mode). */
  handSets?: Record<string, string[]>;
  /** Display name of the session (e.g. "Entraînement personnalisé"). */
  label?: string;
}

/** questionCount value meaning "no limit": questions are added as the session goes. */
export const UNLIMITED = 0;
const UNLIMITED_BATCH = 30;

export function isUnlimited(config: SessionConfig): boolean {
  return config.questionCount === UNLIMITED;
}

export interface Question {
  id: string;
  rangeId: string;
  hand: string;
  cards: [Card, Card];
  /** Answer options: the legend actions of the range, in canonical order. */
  options: string[];
  /** Random number 1-100 shown for mixed hands under the strict rule. */
  rng: number | null;
  /** Re-ask of a hand missed earlier in the same session. */
  recall: boolean;
}

export interface SessionAnswer {
  questionId: string;
  grade: Grade;
  ms: number;
  at: number;
}

export interface SessionState {
  id: string;
  config: SessionConfig;
  questions: Question[];
  /** answers[i] is the answer to questions[i]. */
  answers: SessionAnswer[];
  startedAt: number;
  finishedAt: number | null;
}

export interface PoolItem {
  rangeId: string;
  hand: string;
  weight: number;
}

/** Gap (in questions) before a missed hand is asked again. */
export const RECALL_GAP = 3;

/** Re-asks are capped so that a session never grows by more than a third. */
export function maxRecalls(plannedQuestions: number): number {
  return Math.max(3, Math.ceil(plannedQuestions / 3));
}
const BOUNDARY_WEIGHT = 3;
/** Hands whose spaced review is due are asked more often in random sessions. */
const DUE_WEIGHT = 3;

export function ruleFor(config: SessionConfig): GradingRule {
  return config.mode === 'exam' ? 'exam' : config.grading;
}

/** Candidate hands of a session with their sampling weight. */
export function buildPool(
  library: Library,
  config: SessionConfig,
  items: Record<string, ItemStat>,
  now: number,
): PoolItem[] {
  const pool: PoolItem[] = [];
  for (const rangeId of config.rangeIds) {
    const range = library.get(rangeId);
    if (!range) continue;
    const boundary = library.boundary(rangeId);
    const allowed = config.handSets?.[rangeId] ? new Set(config.handSets[rangeId]) : null;
    for (const hand of ALL_HANDS) {
      if (allowed && !allowed.has(hand)) continue;
      const strategy = range.hands[hand] ?? {};
      if (config.excludeActions?.some((a) => (strategy[a] ?? 0) > 0)) continue;
      if (config.actionFilter?.length && !config.actionFilter.some((a) => (strategy[a] ?? 0) > 0)) continue;
      const item = items[itemKey(rangeId, hand)];
      const base = config.focusBoundary && boundary.has(hand) ? BOUNDARY_WEIGHT : 1;
      let weight: number;
      switch (config.mode) {
        case 'random':
          weight = base * (item && isDue(item, now) ? DUE_WEIGHT : 1);
          break;
        case 'exam':
          weight = base;
          break;
        case 'marginal':
          weight = item && isDue(item, now) ? DUE_WEIGHT : 1;
          break;
        case 'targeted':
          weight = (config.focusBoundary && boundary.has(hand) ? 1.5 : 1) * weakness(item, now);
          break;
        case 'errors':
          weight = item && isInReview(item) ? 1 + item.lapses + (MASTERED_BOX - item.box) : 0;
          break;
        case 'review':
          weight = item && isDue(item, now) ? 1 + item.lapses + (MASTERED_BOX - item.box) : 0;
          break;
      }
      if (weight > 0) pool.push({ rangeId, hand, weight });
    }
  }
  return pool;
}

/** Weighted sampling without replacement (Efraimidis–Spirakis). */
export function weightedSample(pool: readonly PoolItem[], k: number, rng: Rng): PoolItem[] {
  return pool
    .map((p) => ({ p, key: Math.pow(rng() || Number.MIN_VALUE, 1 / p.weight) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, k)
    .map((x) => x.p);
}

/** Reorders so that the same hand never appears twice in a row when avoidable. */
export function spreadRepeats<T extends { hand: string }>(list: T[]): T[] {
  const out = list.slice();
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.hand !== out[i - 1]!.hand) continue;
    const j = out.findIndex((q, idx) => idx > i && q.hand !== out[i - 1]!.hand && (idx + 1 >= out.length || out[idx + 1]!.hand !== out[i]!.hand));
    if (j > 0) [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function makeQuestion(library: Library, config: SessionConfig, rangeId: string, hand: string, rng: Rng, recall = false): Question {
  const range = library.require(rangeId);
  const strategy = range.hands[hand] ?? {};
  const mixed = isMixed(strategy);
  return {
    id: randomId(rng),
    rangeId,
    hand,
    cards: dealHand(hand, rng),
    options: sortActionIds(range.actions.map((a) => a.id)),
    rng: config.mode !== 'exam' && config.grading === 'strict' && mixed ? 1 + Math.floor(rng() * 100) : null,
    recall,
  };
}

/** Picks the hands of a session. Errors/review sessions never repeat a hand. */
export function pickItems(pool: readonly PoolItem[], config: SessionConfig, rng: Rng, howMany?: number): PoolItem[] {
  if (pool.length === 0) return [];
  const count = Math.max(1, Math.floor(howMany ?? (isUnlimited(config) ? UNLIMITED_BATCH : config.questionCount)));
  if ((config.mode === 'errors' || config.mode === 'review') && !isUnlimited(config)) {
    return weightedSample(pool, Math.min(count, pool.length), rng);
  }
  const picked: PoolItem[] = [];
  while (picked.length < count) {
    const batch = weightedSample(pool, Math.min(count - picked.length, pool.length), rng);
    picked.push(...(config.mode === 'targeted' ? batch : shuffle(batch, rng)));
  }
  return spreadRepeats(picked);
}

export function createSession(
  library: Library,
  config: SessionConfig,
  items: Record<string, ItemStat>,
  now: number,
  rng: Rng,
): SessionState | null {
  const pool = buildPool(library, config, items, now);
  const picked = pickItems(pool, config, rng);
  if (picked.length === 0) return null;
  return {
    id: randomId(rng),
    config,
    questions: picked.map((p) => makeQuestion(library, config, p.rangeId, p.hand, rng)),
    answers: [],
    startedAt: now,
    finishedAt: null,
  };
}

export function currentQuestion(session: SessionState): Question | null {
  return session.questions[session.answers.length] ?? null;
}

export function isFinished(session: SessionState): boolean {
  return session.answers.length >= session.questions.length;
}

export function answerCurrent(
  library: Library,
  session: SessionState,
  chosen: string | null,
  ms: number,
  now: number,
  rng: Rng,
): { session: SessionState; grade: Grade; question: Question } {
  const question = currentQuestion(session);
  if (!question) throw new Error('La session est terminée');
  if (chosen !== null && !question.options.includes(chosen)) throw new Error(`Réponse invalide : ${chosen}`);
  const range = library.require(question.rangeId);
  const g = grade(range.hands[question.hand] ?? {}, chosen, ruleFor(session.config), {
    rng: question.rng,
    order: question.options,
  });
  const answers = [...session.answers, { questionId: question.id, grade: g, ms, at: now }];
  let questions = session.questions;
  if (isUnlimited(session.config) && questions.length - answers.length <= 3) {
    const more = pickItems(buildPool(library, session.config, {}, now), session.config, rng);
    // Avoid asking the same hand twice in a row at the junction.
    const last = questions[questions.length - 1];
    if (more.length > 1 && last && more[0]!.hand === last.hand) more.push(more.shift()!);
    questions = [...questions, ...more.map((p) => makeQuestion(library, session.config, p.rangeId, p.hand, rng))];
  }
  const recalls = questions.filter((q) => q.recall).length;
  const planned = questions.length - recalls;
  if (!g.correct && session.config.recallMistakes && session.config.mode !== 'exam' && !question.recall && recalls < maxRecalls(planned)) {
    const at = Math.min(answers.length + RECALL_GAP, questions.length);
    const recall = makeQuestion(library, session.config, question.rangeId, question.hand, rng, true);
    questions = [...questions.slice(0, at), recall, ...questions.slice(at)];
  }
  const next: SessionState = { ...session, questions, answers };
  if (isFinished(next)) next.finishedAt = now;
  return { session: next, grade: g, question };
}

/** Ends a session now (unlimited sessions, or stopping early): unanswered questions are dropped. */
export function finishSession(session: SessionState, now: number): SessionState {
  return { ...session, questions: session.questions.slice(0, session.answers.length), finishedAt: session.finishedAt ?? now };
}

export function summarize(session: SessionState, now: number): SessionSummary {
  const byRange: SessionSummary['byRange'] = {};
  const errors: SessionSummary['errors'] = [];
  let correct = 0;
  let scoreSum = 0;
  let durationMs = 0;
  session.answers.forEach((ans, i) => {
    const q = session.questions[i];
    if (!q) return;
    const entry = (byRange[q.rangeId] ??= { n: 0, ok: 0 });
    entry.n += 1;
    if (ans.grade.correct) {
      entry.ok += 1;
      correct += 1;
    } else {
      errors.push({ r: q.rangeId, h: q.hand, c: ans.grade.chosen, a: ans.grade.accepted });
    }
    scoreSum += ans.grade.score;
    durationMs += ans.ms;
  });
  return {
    id: session.id,
    mode: session.config.mode,
    label: session.config.label,
    rangeIds: session.config.rangeIds,
    startedAt: session.startedAt,
    endedAt: session.finishedAt ?? now,
    durationMs,
    total: session.answers.length,
    correct,
    scoreSum,
    completed: isFinished(session),
    byRange,
    errors,
  };
}
