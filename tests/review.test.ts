import { describe, expect, it } from 'vitest';
import { INTERVALS, MASTERED_BOX, isDue, isInReview, smoothedAccuracy, updateItem, weakness } from '../src/domain/review';

const T0 = new Date('2026-01-10T10:00:00').getTime();
const DAY = 86_400_000;

describe('spaced review (Leitner)', () => {
  it('a never-missed hand is not in review', () => {
    const it1 = updateItem(undefined, true, T0);
    expect(it1).toMatchObject({ n: 1, ok: 1, lapses: 0 });
    expect(isInReview(it1)).toBe(false);
  });

  it('a mistake puts the hand in box 0, due 10 minutes later', () => {
    const it1 = updateItem(undefined, false, T0);
    expect(it1).toMatchObject({ n: 1, ok: 0, lapses: 1, box: 0, due: T0 + INTERVALS[0] });
    expect(isDue(it1, T0)).toBe(false);
    expect(isDue(it1, T0 + INTERVALS[0])).toBe(true);
  });

  it('correct answers before the due date do not advance the box', () => {
    const missed = updateItem(undefined, false, T0);
    const early = updateItem(missed, true, T0 + 60_000);
    expect(early.box).toBe(0);
    expect(early.due).toBe(missed.due);
    expect(early.ok).toBe(1);
  });

  it('spaced correct answers master the hand after MASTERED_BOX reviews', () => {
    let item = updateItem(undefined, false, T0);
    let now = T0;
    for (let box = 1; box <= MASTERED_BOX; box++) {
      now = item.due;
      item = updateItem(item, true, now);
      expect(item.box).toBe(box);
    }
    expect(isInReview(item)).toBe(false);
    expect(now - T0).toBeLessThan(15 * DAY);
  });

  it('a new mistake resets a mastered hand', () => {
    let item = updateItem(undefined, false, T0);
    while (isInReview(item)) item = updateItem(item, true, item.due);
    item = updateItem(item, false, T0 + 30 * DAY);
    expect(item).toMatchObject({ box: 0, lapses: 2 });
    expect(isInReview(item)).toBe(true);
  });

  it('keeps the last 8 results only', () => {
    let item = updateItem(undefined, true, T0);
    for (let i = 0; i < 12; i++) item = updateItem(item, i % 2 === 0, T0 + i);
    expect(item.recent).toHaveLength(8);
  });

  it('weakness is higher for missed hands than for mastered ones', () => {
    let good = updateItem(undefined, true, T0);
    for (let i = 0; i < 5; i++) good = updateItem(good, true, T0);
    const bad = updateItem(updateItem(undefined, false, T0), false, T0);
    expect(weakness(bad, T0)).toBeGreaterThan(weakness(good, T0));
    expect(smoothedAccuracy(undefined)).toBe(0.5);
  });
});
