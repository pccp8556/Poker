import raw from '../src/data/ranges.json';
import { ALL_HANDS } from '../src/domain/cards';
import { Library, validateLibrary } from '../src/domain/library';
import type { RangeDef, RangeLibrary, Strategy } from '../src/domain/types';

export const realLibrary = new Library(validateLibrary(raw));

/**
 * Synthetic range used to test mixed frequencies (the real document has none).
 * Pairs: shove; AKs: 60 % minraise-call / 40 % shove; others: fold.
 */
export function syntheticRange(id = 'test-mixed', overrides: Record<string, Strategy> = {}): RangeDef {
  const hands: Record<string, Strategy> = {};
  for (const h of ALL_HANDS) {
    hands[h] = h.length === 2 ? { shove: 1 } : { fold: 1 };
  }
  hands['AKs'] = { 'minraise-call': 0.6, shove: 0.4 };
  Object.assign(hands, overrides);
  return {
    id,
    format: 'hu',
    spot: 'sb',
    hero: 'SB',
    villain: 'BB',
    stackBb: 10,
    scenario: 'open',
    title: 'HU SB',
    subtitle: 'Test',
    scenarioLabel: null,
    source: { page: 99 },
    actions: [
      { id: 'minraise-call', label: 'Minraise / Call', sourceLabel: 'Minraise / Call', sourceColor: '#000000' },
      { id: 'shove', label: 'Open shove', sourceLabel: 'Open shove', sourceColor: '#111111' },
      { id: 'fold', label: 'Fold', sourceLabel: 'Fold', sourceColor: '#222222' },
    ],
    hands,
  };
}

export function syntheticLibrary(ranges: RangeDef[] = [syntheticRange()]): Library {
  const data: RangeLibrary = {
    schemaVersion: 1,
    source: { id: 'test', file: 'test.pdf', title: 'Test', sha256: '', pages: 1 },
    ranges,
  };
  return new Library(validateLibrary(data));
}
