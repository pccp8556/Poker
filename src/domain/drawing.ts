import { sortActionIds } from './actions';
import { ALL_HANDS, combos } from './cards';
import type { RangeDef } from './types';

/**
 * "Draw the range" exercise: the player paints the 169 hands from memory
 * with the legend actions, then the drawing is compared hand by hand with
 * the reference range (the saved version: PDF, edited or custom).
 */

/** Hand → action painted by the player. Unpainted hands are absent. */
export type Drawing = Record<string, string>;

/** Action given to unpainted hands when the range has one ("Fold"), else none. */
export function blankAction(range: RangeDef): string | null {
  return range.actions.some((a) => a.id === 'fold') ? 'fold' : null;
}

/** Actions accepted for a hand: every action the range plays (frequency > 0). */
export function expectedFor(range: RangeDef, hand: string): string[] {
  const strategy = range.hands[hand] ?? {};
  return sortActionIds(Object.keys(strategy).filter((a) => (strategy[a] ?? 0) > 0));
}

export interface DrawingMistake {
  hand: string;
  /** Painted action (or the blank action); null = left empty with no blank action. */
  drawn: string | null;
  expected: string[];
}

export interface ActionReport {
  id: string;
  /** Hands of the reference range that play this action. */
  expected: number;
  /** Hands painted (or left blank) with this action. */
  drawn: number;
  /** Painted hands where this action is right. */
  correct: number;
  /** Reference hands of this action painted with something else. */
  missed: number;
  /** Hands painted with this action that the range does not play this way. */
  extra: number;
}

export interface DrawingResult {
  correct: number;
  total: number;
  /** Share of the 169 hands drawn right. */
  score: number;
  /** Same, weighted by combos (pairs 6, suited 4, offsuit 12): 1326 in all. */
  comboScore: number;
  mistakes: DrawingMistake[];
  byAction: ActionReport[];
  /** Hands left empty in a range without a blank action. */
  empty: number;
}

/** The action a hand counts as at validation. */
export function drawnAction(range: RangeDef, drawing: Drawing, hand: string): string | null {
  return drawing[hand] ?? blankAction(range);
}

export function gradeDrawing(range: RangeDef, drawing: Drawing): DrawingResult {
  let correct = 0;
  let correctCombos = 0;
  let totalCombos = 0;
  let empty = 0;
  const mistakes: DrawingMistake[] = [];
  const ids = sortActionIds(range.actions.map((a) => a.id));
  const report = new Map<string, ActionReport>(ids.map((id) => [id, { id, expected: 0, drawn: 0, correct: 0, missed: 0, extra: 0 }]));

  for (const hand of ALL_HANDS) {
    const expected = expectedFor(range, hand);
    const drawn = drawnAction(range, drawing, hand);
    const ok = drawn !== null && expected.includes(drawn);
    const weight = combos(hand);
    totalCombos += weight;
    if (drawn === null) empty++;
    if (ok) {
      correct++;
      correctCombos += weight;
    } else {
      mistakes.push({ hand, drawn, expected });
    }
    for (const id of expected) {
      const r = report.get(id);
      if (!r) continue;
      r.expected++;
      if (!ok) r.missed++;
    }
    if (drawn !== null) {
      const r = report.get(drawn);
      if (r) {
        r.drawn++;
        if (ok) r.correct++;
        else r.extra++;
      }
    }
  }
  return {
    correct,
    total: ALL_HANDS.length,
    score: correct / ALL_HANDS.length,
    comboScore: totalCombos ? correctCombos / totalCombos : 0,
    mistakes,
    byAction: [...report.values()],
    empty,
  };
}

export interface MistakeGroup {
  drawn: string | null;
  expected: string[];
  hands: string[];
}

/** Mistakes grouped by "painted X instead of Y", largest groups first, hands in grid order. */
export function groupMistakes(mistakes: DrawingMistake[]): MistakeGroup[] {
  const groups = new Map<string, MistakeGroup>();
  for (const m of mistakes) {
    const key = `${m.drawn ?? ''}>${m.expected.join('+')}`;
    const g = groups.get(key) ?? { drawn: m.drawn, expected: m.expected, hands: [] };
    g.hands.push(m.hand);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.hands.length - a.hands.length);
}

// --- history -----------------------------------------------------------------------

/** One validated drawing (compact keys: this log is persisted). */
export interface DrawingAttempt {
  /** timestamp */
  t: number;
  /** range id */
  r: string;
  /** hands drawn right (out of 169) */
  ok: number;
  /** combo-weighted score 0..1 */
  sc: number;
  /** hands drawn wrong */
  w: string[];
  /** drawing time (ms) */
  ms: number;
  /** expected counts per action were shown */
  help: boolean;
}

export interface DrawingsState {
  version: 1;
  /** Most recent first. */
  attempts: DrawingAttempt[];
  /** Unfinished drawings, by range id (kept when the app is closed). */
  drafts: Record<string, { drawing: Drawing; updatedAt: number }>;
}

export const MAX_ATTEMPTS = 500;

export function emptyDrawings(): DrawingsState {
  return { version: 1, attempts: [], drafts: {} };
}

export function addAttempt(state: DrawingsState, attempt: DrawingAttempt): DrawingsState {
  const drafts = { ...state.drafts };
  delete drafts[attempt.r];
  return { ...state, attempts: [attempt, ...state.attempts].slice(0, MAX_ATTEMPTS), drafts };
}

export function setDraft(state: DrawingsState, rangeId: string, drawing: Drawing | null, now: number): DrawingsState {
  const drafts = { ...state.drafts };
  if (drawing && Object.keys(drawing).length) drafts[rangeId] = { drawing, updatedAt: now };
  else delete drafts[rangeId];
  return { ...state, drafts };
}

export interface RangeDrawingStats {
  attempts: number;
  best: DrawingAttempt;
  last: DrawingAttempt;
}

/** Best (most hands right, then fastest) and last attempt per range. */
export function drawingStats(state: DrawingsState): Map<string, RangeDrawingStats> {
  const out = new Map<string, RangeDrawingStats>();
  // Attempts are stored most recent first.
  for (const a of state.attempts) {
    const s = out.get(a.r);
    if (!s) {
      out.set(a.r, { attempts: 1, best: a, last: a });
      continue;
    }
    s.attempts++;
    if (a.ok > s.best.ok || (a.ok === s.best.ok && a.ms < s.best.ms)) s.best = a;
  }
  return out;
}

export function parseDrawings(v: unknown): DrawingsState | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.attempts) || typeof o.drafts !== 'object' || o.drafts === null || Array.isArray(o.drafts)) return null;
  const attempts = o.attempts.filter(
    (a): a is DrawingAttempt =>
      typeof a === 'object' && a !== null && typeof a.t === 'number' && typeof a.r === 'string' && typeof a.ok === 'number' && typeof a.sc === 'number' && Array.isArray(a.w),
  );
  const drafts: DrawingsState['drafts'] = {};
  for (const [id, d] of Object.entries(o.drafts as Record<string, unknown>)) {
    const draft = d as { drawing?: unknown; updatedAt?: unknown } | null;
    if (!draft || typeof draft.drawing !== 'object' || draft.drawing === null || typeof draft.updatedAt !== 'number') continue;
    const drawing: Drawing = {};
    for (const [h, a] of Object.entries(draft.drawing as Record<string, unknown>)) if (typeof a === 'string') drawing[h] = a;
    drafts[id] = { drawing, updatedAt: draft.updatedAt };
  }
  return { version: 1, attempts: attempts.map((a) => ({ ...a, ms: typeof a.ms === 'number' ? a.ms : 0, help: a.help === true })), drafts };
}
