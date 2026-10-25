import { ALL_HANDS } from './cards';
import type { RangeDef, Strategy } from './types';

/** Pure helpers used by the range editor. Every function returns new objects. */

export type Hands = Record<string, Strategy>;

export function paintHands(hands: Hands, targets: Iterable<string>, actionId: string): Hands {
  const next = { ...hands };
  for (const h of targets) next[h] = { [actionId]: 1 };
  return next;
}

/**
 * Sets a (possibly mixed) strategy from percentages. Values are clamped,
 * zeros removed and the total normalised to 100 %.
 */
export function strategyFromPercents(percents: Record<string, number>): Strategy | null {
  const entries = Object.entries(percents)
    .map(([a, p]) => [a, Math.max(0, Math.min(100, Number.isFinite(p) ? p : 0))] as const)
    .filter(([, p]) => p > 0);
  const total = entries.reduce((s, [, p]) => s + p, 0);
  if (total <= 0) return null;
  const out: Strategy = {};
  let acc = 0;
  entries.forEach(([a, p], i) => {
    // Rounded to 0.1 %; the last action absorbs the rounding so the sum stays exactly 1.
    const f = i === entries.length - 1 ? Math.round((1 - acc) * 1000) / 1000 : Math.round((p / total) * 1000) / 1000;
    acc += f;
    if (f > 0) out[a] = f;
  });
  return out;
}

export function setHandStrategy(hands: Hands, hand: string, strategy: Strategy): Hands {
  return { ...hands, [hand]: strategy };
}

export function fillAll(actionId: string): Hands {
  const out: Hands = {};
  for (const h of ALL_HANDS) out[h] = { [actionId]: 1 };
  return out;
}

/** Hands where the action is played (frequency > 0). */
export function handsWithAction(hands: Hands, actionId: string): string[] {
  return ALL_HANDS.filter((h) => (hands[h]?.[actionId] ?? 0) > 0);
}

/** Removes an action from a range; its hands are given to `replacement`. */
export function removeAction(range: RangeDef, actionId: string, replacement: string): RangeDef {
  const hands: Hands = {};
  for (const h of ALL_HANDS) {
    const s = { ...(range.hands[h] ?? {}) };
    const f = s[actionId] ?? 0;
    delete s[actionId];
    if (f > 0) s[replacement] = (s[replacement] ?? 0) + f;
    hands[h] = s;
  }
  return { ...range, actions: range.actions.filter((a) => a.id !== actionId), hands };
}

export function countByAction(hands: Hands): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of ALL_HANDS) for (const [a, f] of Object.entries(hands[h] ?? {})) if (f > 0) out[a] = (out[a] ?? 0) + 1;
  return out;
}

export function changedHands(a: Hands, b: Hands): string[] {
  return ALL_HANDS.filter((h) => JSON.stringify(a[h] ?? {}) !== JSON.stringify(b[h] ?? {}));
}
