import { actionMeta } from './actions';
import { combos } from './cards';
import { actionShares, type Library } from './library';
import { actionBefore } from './situation';
import type { RangeDef } from './types';

export interface StackComparison {
  rangeId: string;
  stackBb: number;
  actions: { id: string; label: string; frequency: number }[];
  current: boolean;
}

export interface Explanation {
  /** Actions of the range for the hand, most frequent first. */
  reference: { id: string; label: string; frequency: number; description: string }[];
  context: string;
  /** e.g. "Minraise / Call : 20 mains sur 169 (14 % des combos)". */
  share: string;
  combos: number;
  /** Same hand at the other stack depths of the same spot. */
  otherStacks: StackComparison[];
}

export function actionLabel(range: RangeDef, id: string): string {
  return range.actions.find((a) => a.id === id)?.label ?? id;
}

export function explain(library: Library, range: RangeDef, hand: string): Explanation {
  const strategy = range.hands[hand] ?? {};
  const reference = Object.entries(strategy)
    .sort((a, b) => b[1] - a[1])
    .map(([id, frequency]) => ({ id, label: actionLabel(range, id), frequency, description: actionMeta(id).description }));
  const main = reference[0];
  const shareInfo = main ? actionShares(range).find((s) => s.actionId === main.id) : undefined;
  const share =
    main && shareInfo
      ? `${main.label} : ${shareInfo.hands} main${shareInfo.hands > 1 ? 's' : ''} sur 169 dans cette range (${Math.round(shareInfo.share * 100)} % des combos).`
      : '';
  const otherStacks = library.siblings(range).map((r) => ({
    rangeId: r.id,
    stackBb: r.stackBb,
    current: r.id === range.id,
    actions: Object.entries(r.hands[hand] ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([id, frequency]) => ({ id, label: actionLabel(r, id), frequency })),
  }));
  return { reference, context: actionBefore(range), share, combos: combos(hand), otherStacks };
}

export function formatFrequency(f: number): string {
  return `${Math.round(f * 100)} %`;
}
