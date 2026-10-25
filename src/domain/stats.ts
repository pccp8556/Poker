import type { Library } from './library';
import { situationType } from './library';
import { dayKey, MAX_ANSWERS, splitItemKey, type ProgressState } from './progress';
import { isDue, isInReview, smoothedAccuracy, type ItemStat } from './review';
import { FORMAT_LABEL, POSITION_LABEL, SITUATION_LABEL, rangeShortName } from './situation';
import type { RangeDef } from './types';

/** Below this number of answers a percentage is shown as unreliable. */
export const MIN_SAMPLE = 10;

export type Period = '7d' | '30d' | 'all';
export const PERIOD_DAYS: Record<Period, number | null> = { '7d': 7, '30d': 30, all: null };

export interface Tally {
  n: number;
  ok: number;
}

export interface BreakdownRow extends Tally {
  key: string;
  label: string;
  accuracy: number | null;
  lowSample: boolean;
}

export type Dimension = 'range' | 'position' | 'situation' | 'format' | 'stack';

interface Observation extends Tally {
  rangeId: string;
  hand: string;
}

export function accuracy(t: Tally): number | null {
  return t.n > 0 ? t.ok / t.n : null;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** First timestamp included in the period (start of day, N-1 days ago). */
export function periodStart(period: Period, now: number): number | null {
  const days = PERIOD_DAYS[period];
  if (days === null) return null;
  return startOfDay(now) - (days - 1) * 86_400_000;
}

function observations(state: ProgressState, since: number | null): Observation[] {
  if (since === null) {
    return Object.entries(state.items).map(([key, it]) => ({ ...splitItemKey(key), n: it.n, ok: it.ok }));
  }
  return state.answers.filter((a) => a.t >= since).map((a) => ({ rangeId: a.r, hand: a.h, n: 1, ok: a.ok ? 1 : 0 }));
}

function dimensionKey(range: RangeDef, dim: Dimension): { key: string; label: string; order: number } {
  switch (dim) {
    case 'range':
      return { key: range.id, label: rangeShortName(range) + (range.format === 'hu' ? '' : ''), order: 0 };
    case 'position':
      return { key: range.hero, label: `${range.hero} · ${POSITION_LABEL[range.hero]}`, order: ['BTN', 'SB', 'BB'].indexOf(range.hero) };
    case 'situation': {
      const s = situationType(range.scenario);
      return { key: s, label: SITUATION_LABEL[s], order: ['open', 'vs-raise', 'vs-limp', 'vs-shove'].indexOf(s) };
    }
    case 'format':
      return { key: range.format, label: FORMAT_LABEL[range.format], order: range.format === '3max' ? 0 : 1 };
    case 'stack':
      return { key: String(range.stackBb), label: `${range.stackBb} BB`, order: -range.stackBb };
  }
}

export function breakdown(library: Library, state: ProgressState, dim: Dimension, since: number | null): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow & { order: number }>();
  for (const o of observations(state, since)) {
    const range = library.get(o.rangeId);
    if (!range) continue; // data of a range that no longer exists
    const { key, label, order } = dimensionKey(range, dim);
    const row = rows.get(key) ?? { key, label, order, n: 0, ok: 0, accuracy: null, lowSample: true };
    row.n += o.n;
    row.ok += o.ok;
    rows.set(key, row);
  }
  const list = [...rows.values()].map((r) => ({ ...r, accuracy: accuracy(r), lowSample: r.n < MIN_SAMPLE }));
  if (dim === 'range') {
    const index = new Map(library.ranges.map((r, i) => [r.id, i]));
    list.sort((a, b) => (index.get(a.key) ?? 0) - (index.get(b.key) ?? 0));
  } else list.sort((a, b) => a.order - b.order);
  return list.map(({ order: _order, ...r }) => r);
}

export interface Overview {
  period: Period;
  answered: number;
  correct: number;
  accuracy: number | null;
  /** Mean exam-style precision (sum of scores / answers). */
  precision: number | null;
  avgMs: number | null;
  distinctHands: number;
  distinctRanges: number;
  activeDays: number;
  streak: number;
  bestStreak: number;
  /** True when the period is older than the kept answer log. */
  truncated: boolean;
}

export function overview(state: ProgressState, period: Period, now: number): Overview {
  const since = periodStart(period, now);
  const sinceDay = since === null ? null : dayKey(since);
  let answered = 0;
  let correct = 0;
  let sc = 0;
  let ms = 0;
  let activeDays = 0;
  for (const [day, d] of Object.entries(state.days)) {
    if (sinceDay !== null && day < sinceDay) continue;
    answered += d.n;
    correct += d.ok;
    sc += d.sc;
    ms += d.ms;
    if (d.n > 0) activeDays += 1;
  }
  const obs = observations(state, since).filter((o) => o.n > 0);
  const oldest = state.answers[0]?.t ?? now;
  return {
    period,
    answered,
    correct,
    accuracy: answered ? correct / answered : null,
    precision: answered ? sc / answered : null,
    avgMs: answered ? ms / answered : null,
    distinctHands: new Set(obs.map((o) => `${o.rangeId}|${o.hand}`)).size,
    distinctRanges: new Set(obs.map((o) => o.rangeId)).size,
    activeDays,
    streak: state.streak,
    bestStreak: state.bestStreak,
    truncated: since !== null && state.answers.length >= MAX_ANSWERS && oldest > since,
  };
}

export interface DayPoint {
  day: string;
  n: number;
  ok: number;
  accuracy: number | null;
}

export function dailySeries(state: ProgressState, days: number, now: number): DayPoint[] {
  const out: DayPoint[] = [];
  const today = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    // Noon avoids DST edge cases when stepping back whole days.
    const key = dayKey(today - i * 86_400_000 + 12 * 3_600_000);
    const d = state.days[key];
    out.push({ day: key, n: d?.n ?? 0, ok: d?.ok ?? 0, accuracy: d && d.n ? d.ok / d.n : null });
  }
  return out;
}

export interface WeakHand {
  rangeId: string;
  hand: string;
  item: ItemStat;
  accuracy: number;
  inReview: boolean;
  due: boolean;
}

/** Hands with the lowest smoothed accuracy (at least one mistake). */
export function weakHands(library: Library, state: ProgressState, now: number, limit = 10): WeakHand[] {
  return Object.entries(state.items)
    .filter(([key, it]) => it.lapses > 0 && it.ok < it.n && library.get(splitItemKey(key).rangeId))
    .map(([key, item]) => ({
      ...splitItemKey(key),
      item,
      accuracy: smoothedAccuracy(item),
      inReview: isInReview(item),
      due: isDue(item, now),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.item.lapses - a.item.lapses || b.item.last - a.item.last)
    .slice(0, limit);
}

export interface ReviewQueue {
  inReview: WeakHand[];
  dueCount: number;
  nextDue: number | null;
}

export function reviewQueue(library: Library, state: ProgressState, now: number, rangeIds?: readonly string[]): ReviewQueue {
  const filter = rangeIds ? new Set(rangeIds) : null;
  const inReview = Object.entries(state.items)
    .map(([key, item]) => ({ ...splitItemKey(key), item }))
    .filter(({ rangeId, item }) => isInReview(item) && library.get(rangeId) && (!filter || filter.has(rangeId)))
    .map(({ rangeId, hand, item }) => ({
      rangeId,
      hand,
      item,
      accuracy: smoothedAccuracy(item),
      inReview: true,
      due: isDue(item, now),
    }))
    .sort((a, b) => Number(b.due) - Number(a.due) || a.item.due - b.item.due);
  const future = inReview.filter((w) => !w.due).map((w) => w.item.due);
  return {
    inReview,
    dueCount: inReview.filter((w) => w.due).length,
    nextDue: future.length ? Math.min(...future) : null,
  };
}

/** Ranges with enough answers, weakest first. */
export function weakRanges(library: Library, state: ProgressState, since: number | null, limit = 3): BreakdownRow[] {
  return breakdown(library, state, 'range', since)
    .filter((r) => !r.lowSample && r.accuracy !== null && r.accuracy < 1)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .slice(0, limit);
}

/** Wilson score interval (95 %) — used to express uncertainty on small samples. */
export function wilson(t: Tally): [number, number] | null {
  if (t.n === 0) return null;
  const z = 1.96;
  const p = t.ok / t.n;
  const denom = 1 + (z * z) / t.n;
  const centre = (p + (z * z) / (2 * t.n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / t.n + (z * z) / (4 * t.n * t.n))) / denom;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}
