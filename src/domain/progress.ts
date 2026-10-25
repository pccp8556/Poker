import type { Grade } from './grading';
import { emptyItem, updateItem, type ItemStat } from './review';

export type SessionMode = 'random' | 'targeted' | 'errors' | 'review' | 'exam';

export const MODE_LABEL: Record<SessionMode, string> = {
  random: 'Aléatoire',
  targeted: 'Ciblé',
  errors: 'Erreurs',
  review: 'Révision',
  exam: 'Examen',
};

/** One recorded answer (compact keys: this log is persisted). */
export interface AnswerRecord {
  /** timestamp */
  t: number;
  /** session id */
  s: string;
  /** range id */
  r: string;
  /** hand */
  h: string;
  /** chosen action (null = time out) */
  c: string | null;
  /** accepted actions */
  a: string[];
  ok: boolean;
  /** score 0..1 */
  sc: number;
  /** response time (ms) */
  ms: number;
  m: SessionMode;
}

export interface DayStat {
  n: number;
  ok: number;
  /** Sum of scores (exam precision). */
  sc: number;
  ms: number;
}

export interface SessionError {
  r: string;
  h: string;
  c: string | null;
  a: string[];
}

export interface SessionSummary {
  id: string;
  mode: SessionMode;
  rangeIds: string[];
  startedAt: number;
  endedAt: number;
  /** Active answering time (ms), pauses excluded. */
  durationMs: number;
  total: number;
  correct: number;
  scoreSum: number;
  completed: boolean;
  /** Per range: answered / correct. */
  byRange: Record<string, { n: number; ok: number }>;
  errors: SessionError[];
}

export interface ProgressState {
  version: 1;
  items: Record<string, ItemStat>;
  days: Record<string, DayStat>;
  answers: AnswerRecord[];
  sessions: SessionSummary[];
  streak: number;
  bestStreak: number;
}

export const MAX_ANSWERS = 3000;
export const MAX_SESSIONS = 300;

export function emptyProgress(): ProgressState {
  return { version: 1, items: {}, days: {}, answers: [], sessions: [], streak: 0, bestStreak: 0 };
}

export function itemKey(rangeId: string, hand: string): string {
  return `${rangeId}|${hand}`;
}

export function splitItemKey(key: string): { rangeId: string; hand: string } {
  const i = key.lastIndexOf('|');
  return { rangeId: key.slice(0, i), hand: key.slice(i + 1) };
}

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface AnswerInput {
  sessionId: string;
  mode: SessionMode;
  rangeId: string;
  hand: string;
  grade: Grade;
  ms: number;
  now: number;
}

/** Pure update of the progress after one answer. */
export function recordAnswer(state: ProgressState, input: AnswerInput): ProgressState {
  const { grade, now } = input;
  const key = itemKey(input.rangeId, input.hand);
  const dk = dayKey(now);
  const day = state.days[dk] ?? { n: 0, ok: 0, sc: 0, ms: 0 };
  const streak = grade.correct ? state.streak + 1 : 0;
  const record: AnswerRecord = {
    t: now,
    s: input.sessionId,
    r: input.rangeId,
    h: input.hand,
    c: grade.chosen,
    a: grade.accepted,
    ok: grade.correct,
    sc: grade.score,
    ms: Math.max(0, Math.round(input.ms)),
    m: input.mode,
  };
  const answers = [...state.answers, record];
  return {
    ...state,
    items: { ...state.items, [key]: updateItem(state.items[key] ?? emptyItem(), grade.correct, now) },
    days: {
      ...state.days,
      [dk]: {
        n: day.n + 1,
        ok: day.ok + (grade.correct ? 1 : 0),
        sc: day.sc + grade.score,
        ms: day.ms + record.ms,
      },
    },
    answers: answers.length > MAX_ANSWERS ? answers.slice(answers.length - MAX_ANSWERS) : answers,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
  };
}

export function addSession(state: ProgressState, summary: SessionSummary): ProgressState {
  const sessions = [summary, ...state.sessions.filter((s) => s.id !== summary.id)].slice(0, MAX_SESSIONS);
  return { ...state, sessions };
}
