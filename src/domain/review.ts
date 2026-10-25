/**
 * Spaced review of missed hands (Leitner boxes) — deliberately simple:
 *
 * - A wrong answer puts the hand in box 0, due again 10 minutes later.
 * - A correct answer given when the hand is due moves it up one box; the next
 *   review is scheduled after INTERVALS[box]. Correct answers given before the
 *   due date do not move it (spacing is what makes the memory stick).
 * - After MASTERED_BOX successful spaced reviews the hand leaves the review
 *   list. A new mistake brings it back to box 0.
 *
 * Hands that were never missed are not part of the review list.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Delay before the next review, indexed by box. */
export const INTERVALS = [10 * MINUTE, 1 * DAY, 3 * DAY, 7 * DAY] as const;
export const MASTERED_BOX = INTERVALS.length;

export interface ItemStat {
  /** Answers given. */
  n: number;
  /** Correct answers. */
  ok: number;
  /** Number of mistakes. */
  lapses: number;
  box: number;
  /** Timestamp of the next review (ms). */
  due: number;
  /** Timestamp of the last answer. */
  last: number;
  /** Last results, most recent last (1 = correct), at most 8. */
  recent: number[];
}

export function emptyItem(): ItemStat {
  return { n: 0, ok: 0, lapses: 0, box: 0, due: 0, last: 0, recent: [] };
}

export function updateItem(item: ItemStat | undefined, correct: boolean, now: number): ItemStat {
  const prev = item ?? emptyItem();
  const next: ItemStat = {
    ...prev,
    n: prev.n + 1,
    ok: prev.ok + (correct ? 1 : 0),
    last: now,
    recent: [...prev.recent, correct ? 1 : 0].slice(-8),
  };
  if (!correct) {
    next.lapses = prev.lapses + 1;
    next.box = 0;
    next.due = now + INTERVALS[0];
  } else if (prev.lapses > 0 && prev.box < MASTERED_BOX && now >= prev.due) {
    next.box = prev.box + 1;
    next.due = next.box < MASTERED_BOX ? now + (INTERVALS[next.box] ?? 0) : 0;
  }
  return next;
}

/** Hand missed at least once and not yet mastered. */
export function isInReview(item: ItemStat): boolean {
  return item.lapses > 0 && item.box < MASTERED_BOX;
}

export function isDue(item: ItemStat, now: number): boolean {
  return isInReview(item) && item.due <= now;
}

/** Smoothed accuracy (Laplace): an unseen hand counts as 50 %. */
export function smoothedAccuracy(item: ItemStat | undefined): number {
  if (!item) return 0.5;
  return (item.ok + 1) / (item.n + 2);
}

/**
 * Priority of a hand for targeted training: higher means more useful to ask.
 * Unseen hands get a moderate priority so they are discovered progressively.
 */
export function weakness(item: ItemStat | undefined, now: number): number {
  if (!item || item.n === 0) return 2;
  let w = 1 + 6 * (1 - smoothedAccuracy(item));
  const recentMiss = item.recent.slice(-3).filter((r) => r === 0).length;
  w += recentMiss;
  if (isDue(item, now)) w *= 2;
  return w;
}
