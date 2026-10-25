import { describe, expect, it } from 'vitest';
import { grade } from '../src/domain/grading';
import { addSession, dayKey, emptyProgress, MAX_ANSWERS, recordAnswer, type ProgressState } from '../src/domain/progress';
import { breakdown, dailySeries, MIN_SAMPLE, overview, periodStart, reviewQueue, weakHands, weakRanges, wilson } from '../src/domain/stats';
import { realLibrary } from './fixtures';

const T0 = new Date('2026-03-15T12:00:00').getTime();
const DAY = 86_400_000;

function answer(state: ProgressState, rangeId: string, hand: string, chosen: string, now: number, ms = 1000) {
  const strat = realLibrary.require(rangeId).hands[hand]!;
  return recordAnswer(state, { sessionId: 's1', mode: 'random', rangeId, hand, grade: grade(strat, chosen, 'tolerant'), ms, now });
}

describe('recordAnswer', () => {
  it('updates items, days, log and streaks', () => {
    let s = emptyProgress();
    s = answer(s, '3max-btn-open-25', 'AA', 'minraise-call', T0);
    s = answer(s, '3max-btn-open-25', 'AA', 'minraise-call', T0 + 1);
    s = answer(s, '3max-btn-open-25', '72o', 'minraise-call', T0 + 2);
    expect(s.items['3max-btn-open-25|AA']).toMatchObject({ n: 2, ok: 2 });
    expect(s.items['3max-btn-open-25|72o']).toMatchObject({ n: 1, ok: 0, lapses: 1 });
    expect(s.days[dayKey(T0)]).toMatchObject({ n: 3, ok: 2, ms: 3000 });
    expect(s.answers).toHaveLength(3);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
  });

  it('caps the answer log without losing aggregated totals', () => {
    let s = emptyProgress();
    for (let i = 0; i < MAX_ANSWERS + 50; i++) s = answer(s, '3max-btn-open-25', 'AA', 'minraise-call', T0 + i);
    expect(s.answers).toHaveLength(MAX_ANSWERS);
    expect(s.items['3max-btn-open-25|AA']!.n).toBe(MAX_ANSWERS + 50);
    expect(s.days[dayKey(T0)]!.n).toBe(MAX_ANSWERS + 50);
  });

  it('keeps sessions most recent first and deduplicated', () => {
    const base = { mode: 'random' as const, rangeIds: [], startedAt: 0, endedAt: 0, durationMs: 0, total: 0, correct: 0, scoreSum: 0, completed: true, byRange: {}, errors: [] };
    let s = addSession(emptyProgress(), { ...base, id: 'a' });
    s = addSession(s, { ...base, id: 'b' });
    s = addSession(s, { ...base, id: 'a', total: 5 });
    expect(s.sessions.map((x) => x.id)).toEqual(['a', 'b']);
    expect(s.sessions[0]!.total).toBe(5);
  });
});

describe('statistics', () => {
  let s = emptyProgress();
  // 10 days ago: 4 answers on BTN 25 (all right)
  for (const h of ['AA', 'KK', 'QQ', 'JJ']) s = answer(s, '3max-btn-open-25', h, 'minraise-call', T0 - 10 * DAY);
  // today: 3 answers on HU BB 8 (1 right, 2 wrong)
  s = answer(s, 'hu-bb-8', 'AA', 'call', T0, 2000);
  s = answer(s, 'hu-bb-8', '22', 'call', T0, 2000);
  s = answer(s, 'hu-bb-8', 'K7s', 'fold', T0, 2000);

  it('computes all-time and recent overviews from recorded answers', () => {
    const all = overview(s, 'all', T0);
    expect(all).toMatchObject({ answered: 7, correct: 5, distinctHands: 7, distinctRanges: 2, activeDays: 2 });
    expect(all.accuracy).toBeCloseTo(5 / 7);
    expect(all.avgMs).toBeCloseTo((4 * 1000 + 3 * 2000) / 7);
    const week = overview(s, '7d', T0);
    expect(week).toMatchObject({ answered: 3, correct: 1, distinctHands: 3, distinctRanges: 1 });
    expect(week.truncated).toBe(false);
  });

  it('starts periods at the beginning of the day', () => {
    const start = periodStart('7d', T0)!;
    expect(new Date(start).getHours()).toBe(0);
    expect(T0 - start).toBeLessThan(7 * DAY);
    expect(periodStart('all', T0)).toBeNull();
  });

  it('breaks results down by range, position, situation, format and stack', () => {
    const byRange = breakdown(realLibrary, s, 'range', null);
    expect(byRange.map((r) => [r.key, r.n, r.ok])).toEqual([
      ['3max-btn-open-25', 4, 4],
      ['hu-bb-8', 3, 1],
    ]);
    expect(byRange.every((r) => r.lowSample)).toBe(true); // < MIN_SAMPLE answers
    expect(breakdown(realLibrary, s, 'position', null).map((r) => r.key)).toEqual(['BTN', 'BB']);
    expect(breakdown(realLibrary, s, 'situation', null).map((r) => r.key)).toEqual(['open', 'vs-shove']);
    expect(breakdown(realLibrary, s, 'format', null).map((r) => r.key)).toEqual(['3max', 'hu']);
    expect(breakdown(realLibrary, s, 'stack', null).map((r) => r.key)).toEqual(['25', '8']);
    expect(breakdown(realLibrary, s, 'range', periodStart('7d', T0)).map((r) => r.key)).toEqual(['hu-bb-8']);
  });

  it('flags small samples and only ranks ranges with enough answers', () => {
    expect(weakRanges(realLibrary, s, null)).toEqual([]);
    let big = s;
    for (let i = 0; i < MIN_SAMPLE; i++) big = answer(big, 'hu-bb-8', '22', i % 2 ? 'fold' : 'call', T0 + i);
    const weak = weakRanges(realLibrary, big, null);
    expect(weak.map((r) => r.key)).toEqual(['hu-bb-8']);
    expect(weak[0]!.lowSample).toBe(false);
  });

  it('builds a daily series including empty days', () => {
    const series = dailySeries(s, 14, T0);
    expect(series).toHaveLength(14);
    expect(series[13]).toMatchObject({ day: dayKey(T0), n: 3, ok: 1 });
    expect(series[3]).toMatchObject({ n: 4, ok: 4 });
    expect(series[0]).toMatchObject({ n: 0, accuracy: null });
  });

  it('lists weak hands and the review queue', () => {
    const weak = weakHands(realLibrary, s, T0);
    expect(weak.map((w) => w.hand).sort()).toEqual(['22', 'K7s']);
    const q0 = reviewQueue(realLibrary, s, T0);
    expect(q0.inReview).toHaveLength(2);
    expect(q0.dueCount).toBe(0);
    expect(q0.nextDue).toBe(T0 + 10 * 60_000);
    const q1 = reviewQueue(realLibrary, s, T0 + 11 * 60_000);
    expect(q1.dueCount).toBe(2);
    expect(reviewQueue(realLibrary, s, T0, ['3max-btn-open-25']).inReview).toHaveLength(0);
  });

  it('computes a Wilson interval that narrows with more data', () => {
    const small = wilson({ n: 5, ok: 4 })!;
    const large = wilson({ n: 500, ok: 400 })!;
    expect(small[1] - small[0]).toBeGreaterThan(large[1] - large[0]);
    expect(wilson({ n: 0, ok: 0 })).toBeNull();
  });
});
