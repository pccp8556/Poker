import type { Rng } from './rng';

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type HandKind = 'pair' | 'suited' | 'offsuit';

/** Hand class at a given position of the classic 13x13 grid (suited above the diagonal). */
export function handAt(row: number, col: number): string {
  const r = RANKS[row];
  const c = RANKS[col];
  if (r === undefined || c === undefined) throw new RangeError(`Invalid grid position ${row},${col}`);
  if (row === col) return r + c;
  return col > row ? `${r}${c}s` : `${c}${r}o`;
}

/** All 169 hand classes in grid order (row by row). */
export const ALL_HANDS: readonly string[] = Array.from({ length: 169 }, (_, i) =>
  handAt(Math.floor(i / 13), i % 13),
);

const HAND_SET = new Set(ALL_HANDS);

export function isHand(code: string): boolean {
  return HAND_SET.has(code);
}

export function handKind(hand: string): HandKind {
  if (hand.length === 2) return 'pair';
  return hand.endsWith('s') ? 'suited' : 'offsuit';
}

/** Row/column of a hand class in the grid. */
export function handPosition(hand: string): { row: number; col: number } {
  const hi = RANKS.indexOf(hand[0] as Rank);
  const lo = RANKS.indexOf(hand[1] as Rank);
  if (hi < 0 || lo < 0 || !isHand(hand)) throw new RangeError(`Unknown hand ${hand}`);
  const kind = handKind(hand);
  if (kind === 'pair') return { row: hi, col: hi };
  return kind === 'suited' ? { row: hi, col: lo } : { row: lo, col: hi };
}

/** Number of card combinations of a hand class (6 pairs, 4 suited, 12 offsuit). */
export function combos(hand: string): number {
  const kind = handKind(hand);
  return kind === 'pair' ? 6 : kind === 'suited' ? 4 : 12;
}

/** The (up to) 4 orthogonal neighbours of a hand in the grid. */
export function gridNeighbours(hand: string): string[] {
  const { row, col } = handPosition(hand);
  const out: string[] = [];
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < 13 && c >= 0 && c < 13) out.push(handAt(r, c));
  }
  return out;
}

/** Deals two concrete cards matching a hand class, with random suits. */
export function dealHand(hand: string, rng: Rng): [Card, Card] {
  const kind = handKind(hand);
  const r1 = hand[0] as Rank;
  const r2 = hand[1] as Rank;
  const s1 = SUITS[Math.floor(rng() * 4)] as Suit;
  if (kind === 'suited') return [{ rank: r1, suit: s1 }, { rank: r2, suit: s1 }];
  const others = SUITS.filter((s) => s !== s1);
  const s2 = others[Math.floor(rng() * others.length)] as Suit;
  return [
    { rank: r1, suit: s1 },
    { rank: r2, suit: s2 },
  ];
}

export const SUIT_SYMBOL: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function rankLabel(rank: Rank): string {
  return rank === 'T' ? '10' : rank;
}
