import { describe, expect, it } from 'vitest';
import { sortActionIds } from '../src/domain/actions';
import { itemKey } from '../src/domain/progress';
import { answerCurrent, buildPool, createSession, currentQuestion, finishSession, isFinished, maxRecalls, pickItems, RECALL_GAP, spreadRepeats, summarize, UNLIMITED, type SessionConfig } from '../src/domain/quiz';
import { updateItem, type ItemStat } from '../src/domain/review';
import { seededRng } from '../src/domain/rng';
import { realLibrary, syntheticLibrary } from './fixtures';

const T0 = new Date('2026-01-10T10:00:00').getTime();

const config = (over: Partial<SessionConfig> = {}): SessionConfig => ({
  rangeIds: ['3max-btn-open-25'],
  mode: 'random',
  questionCount: 20,
  grading: 'tolerant',
  focusBoundary: true,
  recallMistakes: true,
  timerSec: null,
  ...over,
});

describe('question pool', () => {
  it('only contains hands of the selected ranges', () => {
    const pool = buildPool(realLibrary, config({ rangeIds: ['hu-bb-8', '3max-sb-open-15'] }), {}, T0);
    expect(pool).toHaveLength(2 * 169);
    expect(new Set(pool.map((p) => p.rangeId))).toEqual(new Set(['hu-bb-8', '3max-sb-open-15']));
  });

  it('ignores unknown range ids', () => {
    expect(buildPool(realLibrary, config({ rangeIds: ['nope'] }), {}, T0)).toHaveLength(0);
  });

  it('weights boundary hands more when the focus is on', () => {
    const pool = buildPool(realLibrary, config(), {}, T0);
    const w = (h: string) => pool.find((p) => p.hand === h)!.weight;
    expect(w('72o')).toBe(1); // deep fold, surrounded by folds
    expect(w('AA')).toBe(1); // surrounded by the same action
    const boundary = realLibrary.boundary('3max-btn-open-25');
    const anyBoundary = [...boundary][0]!;
    expect(w(anyBoundary)).toBe(3);
    const flat = buildPool(realLibrary, config({ focusBoundary: false }), {}, T0);
    expect(flat.every((p) => p.weight === 1)).toBe(true);
  });

  it('errors mode only keeps hands under review, review mode only due ones', () => {
    const items: Record<string, ItemStat> = {
      [itemKey('3max-btn-open-25', 'AKo')]: updateItem(undefined, false, T0 - 3_600_000), // due
      [itemKey('3max-btn-open-25', 'KQo')]: updateItem(undefined, false, T0), // not due yet
      [itemKey('3max-btn-open-25', 'AA')]: updateItem(undefined, true, T0), // never missed
    };
    const errors = buildPool(realLibrary, config({ mode: 'errors' }), items, T0);
    expect(errors.map((p) => p.hand).sort()).toEqual(['AKo', 'KQo']);
    const review = buildPool(realLibrary, config({ mode: 'review' }), items, T0);
    expect(review.map((p) => p.hand)).toEqual(['AKo']);
  });

  it('targeted mode favours missed hands', () => {
    const items: Record<string, ItemStat> = {};
    let bad = updateItem(undefined, false, T0);
    bad = updateItem(bad, false, T0);
    items[itemKey('3max-btn-open-25', '72o')] = bad;
    let good = updateItem(undefined, true, T0);
    good = updateItem(good, true, T0);
    items[itemKey('3max-btn-open-25', '83o')] = good;
    const pool = buildPool(realLibrary, config({ mode: 'targeted' }), items, T0);
    const w = (h: string) => pool.find((p) => p.hand === h)!.weight;
    expect(w('72o')).toBeGreaterThan(w('83o'));
  });
});

describe('session generation', () => {
  it('creates the requested number of questions with valid options', () => {
    const s = createSession(realLibrary, config({ questionCount: 30 }), {}, T0, seededRng(1))!;
    expect(s.questions).toHaveLength(30);
    const range = realLibrary.require('3max-btn-open-25');
    for (const q of s.questions) {
      expect(q.options).toEqual(sortActionIds(range.actions.map((a) => a.id)));
      expect(q.cards[0].rank + q.cards[1].rank).toBe(q.hand.slice(0, 2));
      expect(q.rng).toBeNull();
    }
  });

  it('does not repeat a hand within a session while the pool allows it', () => {
    const s = createSession(realLibrary, config({ questionCount: 100 }), {}, T0, seededRng(7))!;
    expect(new Set(s.questions.map((q) => q.hand)).size).toBe(100);
  });

  it('cycles through the pool without immediate repeats when more questions than hands are asked', () => {
    const s = createSession(realLibrary, config({ questionCount: 400 }), {}, T0, seededRng(3))!;
    expect(s.questions).toHaveLength(400);
    for (let i = 1; i < s.questions.length; i++) expect(s.questions[i]!.hand).not.toBe(s.questions[i - 1]!.hand);
  });

  it('caps errors sessions at the number of hands to review', () => {
    const items = { [itemKey('3max-btn-open-25', 'AKo')]: updateItem(undefined, false, T0) };
    const s = createSession(realLibrary, config({ mode: 'errors', questionCount: 20 }), items, T0, seededRng(1))!;
    expect(s.questions.map((q) => q.hand)).toEqual(['AKo']);
  });

  it('returns null when nothing matches', () => {
    expect(createSession(realLibrary, config({ mode: 'errors' }), {}, T0, seededRng(1))).toBeNull();
    expect(createSession(realLibrary, config({ rangeIds: [] }), {}, T0, seededRng(1))).toBeNull();
  });

  it('adds a random number to mixed hands only under the strict rule', () => {
    const lib = syntheticLibrary();
    const strict = createSession(lib, config({ rangeIds: ['test-mixed'], grading: 'strict', questionCount: 169 }), {}, T0, seededRng(5))!;
    for (const q of strict.questions) {
      if (q.hand === 'AKs') expect(q.rng).toBeGreaterThanOrEqual(1);
      else expect(q.rng).toBeNull();
    }
    const tolerant = createSession(lib, config({ rangeIds: ['test-mixed'], questionCount: 169 }), {}, T0, seededRng(5))!;
    expect(tolerant.questions.every((q) => q.rng === null)).toBe(true);
  });

  it('spreadRepeats separates consecutive duplicates', () => {
    const out = spreadRepeats([{ hand: 'A' }, { hand: 'A' }, { hand: 'B' }, { hand: 'C' }]);
    for (let i = 1; i < out.length; i++) expect(out[i]!.hand).not.toBe(out[i - 1]!.hand);
  });

  it('pickItems returns nothing for an empty pool', () => {
    expect(pickItems([], config(), seededRng(1))).toEqual([]);
  });
});

describe('answering', () => {
  it('grades answers against the range and records them', () => {
    const rng = seededRng(11);
    let s = createSession(realLibrary, config({ questionCount: 3, recallMistakes: false }), {}, T0, rng)!;
    const range = realLibrary.require('3max-btn-open-25');
    const q = currentQuestion(s)!;
    const truth = Object.keys(range.hands[q.hand]!)[0]!;
    const res = answerCurrent(realLibrary, s, truth, 1200, T0, rng);
    expect(res.grade.correct).toBe(true);
    s = res.session;
    expect(s.answers).toHaveLength(1);
    expect(s.answers[0]!.ms).toBe(1200);
  });

  it('rejects an answer that is not an option', () => {
    const s = createSession(realLibrary, config(), {}, T0, seededRng(2))!;
    expect(() => answerCurrent(realLibrary, s, 'iso-allin', 0, T0, seededRng(2))).toThrow(/invalide/);
  });

  it('re-asks a missed hand a few questions later (once)', () => {
    const rng = seededRng(4);
    const s0 = createSession(realLibrary, config({ questionCount: 10 }), {}, T0, rng)!;
    const q = currentQuestion(s0)!;
    const range = realLibrary.require('3max-btn-open-25');
    const wrong = q.options.find((o) => !(o in range.hands[q.hand]!))!;
    const { session: s1, grade } = answerCurrent(realLibrary, s0, wrong, 900, T0, rng);
    expect(grade.correct).toBe(false);
    expect(s1.questions).toHaveLength(11);
    const recall = s1.questions[1 + RECALL_GAP]!;
    expect(recall.recall).toBe(true);
    expect(recall.hand).toBe(q.hand);
  });

  it('caps the number of re-asks to a third of the session', () => {
    const rng = seededRng(8);
    let s = createSession(realLibrary, config({ questionCount: 12 }), {}, T0, rng)!;
    const range = realLibrary.require('3max-btn-open-25');
    while (!isFinished(s)) {
      const q = currentQuestion(s)!;
      const wrong = q.options.find((o) => !(o in range.hands[q.hand]!))!;
      s = answerCurrent(realLibrary, s, wrong, 500, T0, rng).session;
    }
    expect(s.questions.filter((q) => q.recall)).toHaveLength(maxRecalls(12));
    expect(s.questions).toHaveLength(12 + maxRecalls(12));
  });

  it('never re-asks in exam mode', () => {
    const rng = seededRng(4);
    const s0 = createSession(realLibrary, config({ mode: 'exam', questionCount: 5 }), {}, T0, rng)!;
    const { session: s1, grade } = answerCurrent(realLibrary, s0, null, 15000, T0, rng);
    expect(grade.timedOut).toBe(true);
    expect(s1.questions).toHaveLength(5);
  });

  it('finishes and summarises the session', () => {
    const rng = seededRng(9);
    let s = createSession(realLibrary, config({ questionCount: 4, recallMistakes: false }), {}, T0, rng)!;
    const range = realLibrary.require('3max-btn-open-25');
    let i = 0;
    while (!isFinished(s)) {
      const q = currentQuestion(s)!;
      const truth = Object.keys(range.hands[q.hand]!)[0]!;
      const choice = i % 2 === 0 ? truth : q.options.find((o) => o !== truth)!;
      s = answerCurrent(realLibrary, s, choice, 1000, T0 + i * 1000, rng).session;
      i++;
    }
    expect(s.finishedAt).not.toBeNull();
    const sum = summarize(s, T0 + 10_000);
    expect(sum).toMatchObject({ total: 4, correct: 2, completed: true, durationMs: 4000 });
    expect(sum.errors).toHaveLength(2);
    expect(sum.byRange['3max-btn-open-25']).toEqual({ n: 4, ok: 2 });
  });
});

describe('filters and session options', () => {
  it('keeps only hands whose expected answer matches the action filter', () => {
    const pool = buildPool(realLibrary, config({ rangeIds: ['hu-bb-8'], actionFilter: ['call'] }), {}, T0);
    expect(pool).toHaveLength(53);
    const both = buildPool(realLibrary, config({ rangeIds: ['hu-bb-8'], actionFilter: ['call', 'profile-dependent'] }), {}, T0);
    expect(both).toHaveLength(63);
  });

  it('can leave out the "Profil dépendant" hands', () => {
    const pool = buildPool(realLibrary, config({ rangeIds: ['hu-bb-8'], excludeActions: ['profile-dependent'] }), {}, T0);
    expect(pool).toHaveLength(159);
    expect(pool.find((p) => p.hand === 'K7s')).toBeUndefined();
  });

  it('restricts marginal-hands sessions to the given hand sets', () => {
    const s = createSession(realLibrary, config({ mode: 'marginal', handSets: { '3max-btn-open-25': ['A8s', 'K9o', '22'] }, questionCount: 10 }), {}, T0, seededRng(2))!;
    expect(new Set(s.questions.map((q) => q.hand))).toEqual(new Set(['A8s', 'K9o', '22']));
  });

  it('gives due reviews a higher weight in random sessions', () => {
    const items = { [itemKey('3max-btn-open-25', '72o')]: updateItem(undefined, false, T0 - 3_600_000) };
    const pool = buildPool(realLibrary, config({ focusBoundary: false }), items, T0);
    expect(pool.find((p) => p.hand === '72o')!.weight).toBe(3);
    expect(pool.find((p) => p.hand === '83o')!.weight).toBe(1);
  });

  it('keeps adding questions in unlimited sessions until the player stops', () => {
    const rng = seededRng(6);
    let s = createSession(realLibrary, config({ questionCount: UNLIMITED, recallMistakes: false }), {}, T0, rng)!;
    const range = realLibrary.require('3max-btn-open-25');
    for (let i = 0; i < 70; i++) {
      const q = currentQuestion(s)!;
      s = answerCurrent(realLibrary, s, Object.keys(range.hands[q.hand]!)[0]!, 500, T0 + i, rng).session;
      expect(isFinished(s)).toBe(false);
    }
    s = finishSession(s, T0 + 100);
    expect(isFinished(s)).toBe(true);
    expect(s.questions).toHaveLength(70);
    expect(summarize(s, T0 + 100)).toMatchObject({ total: 70, correct: 70, completed: true });
  });
});
