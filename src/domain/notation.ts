import { ALL_HANDS, isHand, RANKS, type Rank } from './cards';

/**
 * Standard preflop range notation, e.g. "22+, A2s+, KTo+, QJ, 98s-95s".
 *
 * - "77", "AKs", "AKo"     a single hand class
 * - "AK"                   both AKs and AKo
 * - "77+"                  77 up to AA
 * - "A2s+" / "KTo+"        kicker up to the rank below the high card (A2s…AKs)
 * - "99-66", "A5s-A2s"     an explicit interval (same high card for non-pairs)
 */

const RANK_INDEX = new Map<string, number>(RANKS.map((r, i) => [r, i]));

function rankOf(ch: string): number | undefined {
  return RANK_INDEX.get(ch.toUpperCase());
}

/** Normalises "kas", "10s"… into "AKs"-like components. */
function parseHand(raw: string): { hi: number; lo: number; kind: 's' | 'o' | 'any' | 'pair' } | null {
  const t = raw.replace(/10/g, 'T');
  const m = /^([AKQJT2-9])([AKQJT2-9])([so]?)$/i.exec(t);
  if (!m) return null;
  let a = rankOf(m[1]!)!;
  let b = rankOf(m[2]!)!;
  const suffix = (m[3] ?? '').toLowerCase();
  if (a === b) return suffix ? null : { hi: a, lo: a, kind: 'pair' };
  if (a > b) [a, b] = [b, a]; // index 0 = Ace: smaller index = higher rank
  return { hi: a, lo: b, kind: suffix === 's' ? 's' : suffix === 'o' ? 'o' : 'any' };
}

function code(hi: number, lo: number, kind: 's' | 'o' | 'pair'): string {
  const h = RANKS[hi] as Rank;
  const l = RANKS[lo] as Rank;
  return kind === 'pair' ? h + h : `${h}${l}${kind}`;
}

function expand(hi: number, lo: number, kind: 's' | 'o' | 'any'): string[] {
  return kind === 'any' ? [code(hi, lo, 's'), code(hi, lo, 'o')] : [code(hi, lo, kind)];
}

export interface ParsedRange {
  hands: string[];
  errors: string[];
}

export function parseRangeNotation(text: string): ParsedRange {
  const out = new Set<string>();
  const errors: string[] = [];
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const plus = token.endsWith('+');
    const body = plus ? token.slice(0, -1) : token;
    const [left, right, ...extra] = body.split('-');
    const a = left ? parseHand(left) : null;
    if (!a || extra.length) {
      errors.push(token);
      continue;
    }
    if (right !== undefined) {
      const b = parseHand(right);
      if (plus || !b || (a.kind === 'pair') !== (b.kind === 'pair') || (a.kind !== 'pair' && (a.hi !== b.hi || a.kind !== b.kind))) {
        errors.push(token);
        continue;
      }
      if (a.kind === 'pair') {
        for (let i = Math.min(a.hi, b.hi); i <= Math.max(a.hi, b.hi); i++) out.add(code(i, i, 'pair'));
      } else {
        for (let k = Math.min(a.lo, b.lo); k <= Math.max(a.lo, b.lo); k++) expand(a.hi, k, a.kind as 's' | 'o' | 'any').forEach((h) => out.add(h));
      }
      continue;
    }
    if (a.kind === 'pair') {
      if (plus) for (let i = a.hi; i >= 0; i--) out.add(code(i, i, 'pair'));
      else out.add(code(a.hi, a.hi, 'pair'));
      continue;
    }
    if (plus) {
      for (let k = a.lo; k > a.hi; k--) expand(a.hi, k, a.kind as 's' | 'o' | 'any').forEach((h) => out.add(h));
    } else expand(a.hi, a.lo, a.kind as 's' | 'o' | 'any').forEach((h) => out.add(h));
  }
  return { hands: ALL_HANDS.filter((h) => out.has(h)), errors };
}

/** Compact notation of a set of hands (inverse of parseRangeNotation). */
export function formatRangeNotation(hands: Iterable<string>): string {
  const set = new Set([...hands].filter(isHand));
  const parts: string[] = [];
  // Pairs: runs of consecutive ranks.
  const pairs = RANKS.map((_, i) => i).filter((i) => set.has(code(i, i, 'pair')));
  for (const run of runs(pairs)) {
    const [first, last] = [run[0]!, run[run.length - 1]!];
    if (run.length === 1) parts.push(code(first, first, 'pair'));
    else if (first === 0) parts.push(`${code(last, last, 'pair')}+`);
    else parts.push(`${code(first, first, 'pair')}-${code(last, last, 'pair')}`);
  }
  for (const kind of ['s', 'o'] as const) {
    for (let hi = 0; hi < 13; hi++) {
      const kickers: number[] = [];
      for (let lo = hi + 1; lo < 13; lo++) if (set.has(code(hi, lo, kind))) kickers.push(lo);
      for (const run of runs(kickers)) {
        const [top, bottom] = [run[0]!, run[run.length - 1]!];
        if (run.length === 1) parts.push(code(hi, top, kind));
        else if (top === hi + 1) parts.push(`${code(hi, bottom, kind)}+`);
        else parts.push(`${code(hi, top, kind)}-${code(hi, bottom, kind)}`);
      }
    }
  }
  return parts.join(', ');
}

function runs(sorted: number[]): number[][] {
  const out: number[][] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && v === last[last.length - 1]! + 1) last.push(v);
    else out.push([v]);
  }
  return out;
}
