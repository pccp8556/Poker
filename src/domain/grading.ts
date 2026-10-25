import { frequencyOf, isMixed, topActions } from './library';
import type { Strategy } from './types';

/**
 * Correction rules.
 *
 * - tolerant: any action played by the range (frequency > 0) is correct.
 * - strict:   the answer must reproduce the frequencies. For a mixed hand the
 *             question carries a random number (1-100); the correct action is
 *             the one whose cumulative frequency bucket contains it. For a
 *             pure hand, only the single action of the range is correct.
 * - exam:     scored by precision: the score is the frequency of the chosen
 *             action (1 for a pure hand answered correctly, 0.3 for an action
 *             played 30 % of the time, 0 otherwise). An answer is counted as
 *             correct when its frequency is > 0. No feedback until the end.
 */
export type GradingRule = 'tolerant' | 'strict' | 'exam';

export interface Grade {
  rule: GradingRule;
  correct: boolean;
  /** 0..1 */
  score: number;
  chosen: string | null;
  chosenFrequency: number;
  /** Actions accepted as correct under the rule. */
  accepted: string[];
  /** Every action of the range for this hand with its frequency. */
  strategy: Strategy;
  /** Random number used by the strict rule for mixed hands (1-100). */
  rng: number | null;
  timedOut: boolean;
}

/** Action selected by a 1-100 random number, following `order` to stack buckets. */
export function actionForRng(strategy: Strategy, rng: number, order: readonly string[]): string {
  const ordered = [...order.filter((a) => (strategy[a] ?? 0) > 0), ...Object.keys(strategy).filter((a) => !order.includes(a))];
  let cumulative = 0;
  for (const a of ordered) {
    cumulative += (strategy[a] ?? 0) * 100;
    if (rng <= cumulative + 1e-9) return a;
  }
  return ordered[ordered.length - 1] as string;
}

export function grade(
  strategy: Strategy,
  chosen: string | null,
  rule: GradingRule,
  options: { rng?: number | null; order?: readonly string[] } = {},
): Grade {
  const chosenFrequency = frequencyOf(strategy, chosen);
  const played = Object.keys(strategy).filter((a) => (strategy[a] ?? 0) > 0);
  const rng = options.rng ?? null;
  let accepted: string[];
  if (rule === 'strict') {
    if (!isMixed(strategy)) accepted = played;
    else if (rng !== null) accepted = [actionForRng(strategy, rng, options.order ?? Object.keys(strategy))];
    else accepted = topActions(strategy);
  } else {
    accepted = played;
  }
  const correct = chosen !== null && accepted.includes(chosen);
  const score = rule === 'exam' ? chosenFrequency : correct ? 1 : 0;
  return {
    rule,
    correct,
    score,
    chosen,
    chosenFrequency,
    accepted,
    strategy,
    rng: rule === 'strict' && isMixed(strategy) ? rng : null,
    timedOut: chosen === null,
  };
}
