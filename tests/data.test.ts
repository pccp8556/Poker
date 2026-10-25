import { describe, expect, it } from 'vitest';
import raw from '../src/data/ranges.json';
import { actionMeta, knownActionIds } from '../src/domain/actions';
import { ALL_HANDS } from '../src/domain/cards';
import { Library, RangeDataError, validateLibrary } from '../src/domain/library';

const library = new Library(validateLibrary(raw));

function countActions(rangeId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const strat of Object.values(library.require(rangeId).hands)) {
    for (const a of Object.keys(strat)) counts[a] = (counts[a] ?? 0) + 1;
  }
  return counts;
}

describe('ranges.json (extracted from the PDF)', () => {
  it('contains the 18 ranges of the document, one per page 2-19', () => {
    expect(library.ranges).toHaveLength(18);
    expect(library.ranges.map((r) => r.source.page)).toEqual(Array.from({ length: 18 }, (_, i) => i + 2));
    expect(library.data.source.file).toBe('Ranges_Expresso_KillTilt (1).pdf');
  });

  it('covers all 169 hands in every range', () => {
    for (const r of library.ranges) {
      expect(Object.keys(r.hands).sort()).toEqual([...ALL_HANDS].sort());
    }
  });

  it('has the expected spots and stack depths', () => {
    const summary = library.ranges.map((r) => `${r.format}:${r.title}:${r.stackBb}:${r.scenario}`);
    expect(summary).toEqual([
      '3max:BTN:25:open',
      '3max:BTN:15:open',
      '3max:BTN:10:open',
      '3max:SB vs BTN:25:vs-minraise',
      '3max:SB vs BTN:15:vs-minraise',
      '3max:SB vs BTN:10:vs-shove',
      '3max:SB vs BB:25:open',
      '3max:SB vs BB:15:open',
      '3max:SB vs BB:10:open',
      '3max:BB vs SB:25:vs-open',
      '3max:BB vs SB:15:vs-open',
      '3max:BB vs SB:10:vs-shove',
      'hu:HU SB:15:open',
      'hu:HU SB:12:open',
      'hu:HU SB:8:open',
      'hu:HU BB:15:vs-minraise',
      'hu:HU BB:12:vs-limp',
      'hu:HU BB:8:vs-shove',
    ]);
  });

  // Golden counts: number of hands per action, recorded from the PDF legend
  // colours and cross-checked against a raster render (scripts/verify_ranges.py).
  it.each([
    ['3max-btn-open-25', { 'minraise-call': 20, 'minraise-fold': 58, fold: 91 }],
    ['3max-btn-open-15', { 'minraise-call': 21, 'minraise-fold': 25, shove: 20, fold: 103 }],
    ['3max-btn-open-10', { 'minraise-call': 13, 'minraise-fold': 6, shove: 49, fold: 101 }],
    ['3max-sb-vs-btn-25', { '3bet-allin': 23, '3bet-nai-call': 4, '3bet-nai-fold': 2, call: 13, fold: 127 }],
    ['3max-sb-vs-btn-15', { '3bet-allin': 39, '3bet-nai-call': 3, fold: 127 }],
    ['3max-sb-vs-btn-10', { call: 38, fold: 131 }],
    ['3max-sb-open-25', { 'raise3x-call': 18, 'raise3x-fold': 35, 'limp-fold': 19, 'limp-reraise': 7, 'limp-call-vs-3bet': 43, fold: 47 }],
    ['3max-sb-open-15', { 'limp-reraise': 3, 'limp-call-vs-3bet': 31, 'minraise-call': 25, 'minraise-fold': 23, shove: 34, fold: 53 }],
    ['3max-sb-open-10', { 'minraise-call': 15, 'minraise-fold': 6, shove: 88, fold: 60 }],
    ['3max-bb-vs-sb-25', { '3bet-allin': 13, '3bet-nai-call': 6, call: 102, fold: 48 }],
    ['3max-bb-vs-sb-15', { '3bet-allin': 23, '3bet-nai-call': 4, call: 93, fold: 49 }],
    ['3max-bb-vs-sb-10', { call: 58, fold: 111 }],
    ['hu-sb-15', { 'limp-fold': 65, 'limp-reraise': 11, 'limp-call-vs-2.5x': 56, 'minraise-call': 21, 'minraise-fold': 13, shove: 3 }],
    ['hu-sb-12', { 'limp-call': 21, 'limp-fold': 66, 'limp-call-vs-2.5x': 49, 'limp-reraise-vs-2.5x': 14, shove: 19 }],
    ['hu-sb-8', { 'limp-call': 14, 'limp-fold': 74, 'limp-reraise': 11, 'limp-call-vs-2.5x': 7, shove: 63 }],
    ['hu-bb-15', { '3bet-allin': 29, '3bet-nai-call': 6, call: 95, fold: 39 }],
    ['hu-bb-12', { 'iso-call': 29, 'iso-fold': 11, 'iso-allin': 19, check: 110 }],
    ['hu-bb-8', { call: 53, 'profile-dependent': 10, fold: 106 }],
  ])('%s matches the golden action counts', (id, expected) => {
    expect(countActions(id)).toEqual(expected);
  });

  // Hands checked by eye against the rendered PDF pages.
  it.each([
    ['3max-btn-open-15', 'A6s', 'shove'],
    ['3max-btn-open-15', 'K9s', 'minraise-fold'],
    ['3max-btn-open-15', '99', 'minraise-call'],
    ['3max-btn-open-15', '22', 'shove'],
    ['3max-btn-open-15', 'Q6s', 'fold'],
    ['3max-sb-open-25', 'A9o', 'limp-reraise'],
    ['3max-sb-open-25', 'KQo', 'raise3x-fold'],
    ['3max-sb-open-25', 'AA', 'raise3x-call'],
    ['3max-sb-open-25', 'A2o', 'limp-call-vs-3bet'],
    ['3max-sb-open-25', '43s', 'limp-fold'],
    ['3max-sb-open-25', '84s', 'fold'],
    ['hu-sb-15', '44', 'shove'],
    ['hu-sb-15', 'A7s', 'limp-reraise'],
    ['hu-sb-15', 'A4o', 'minraise-fold'],
    ['hu-sb-15', 'AA', 'minraise-call'],
    ['hu-sb-12', 'AKo', 'limp-reraise-vs-2.5x'],
    ['hu-sb-12', 'QJo', 'shove'],
    ['hu-sb-12', 'AA', 'limp-call'],
    ['hu-bb-8', 'K7s', 'profile-dependent'],
    ['hu-bb-8', 'Q9o', 'profile-dependent'],
    ['hu-bb-8', 'A2o', 'call'],
    ['hu-bb-8', '33', 'call'],
    ['hu-bb-8', '22', 'fold'],
    ['hu-bb-8', 'K5s', 'fold'],
  ])('%s %s → %s', (id, hand, action) => {
    expect(library.require(id).hands[hand]).toEqual({ [action]: 1 });
  });

  it('only uses actions present in the legend, all known by the app', () => {
    const known = new Set(knownActionIds());
    for (const r of library.ranges) {
      const legend = new Set(r.actions.map((a) => a.id));
      for (const strat of Object.values(r.hands)) for (const a of Object.keys(strat)) expect(legend.has(a)).toBe(true);
      for (const a of legend) expect(known.has(a)).toBe(true);
    }
  });

  it('gives every action of a range a distinct colour in the app palette', () => {
    for (const r of library.ranges) {
      const colours = r.actions.map((a) => actionMeta(a.id).color);
      expect(new Set(colours).size).toBe(colours.length);
    }
  });

  it('contains only pure strategies (no frequencies in this document)', () => {
    expect(library.hasMixedStrategies()).toBe(false);
  });
});

describe('validateLibrary', () => {
  type Mutable = { ranges: { hands: Record<string, Record<string, number> | undefined> }[] };
  const clone = () => JSON.parse(JSON.stringify(raw)) as Mutable;

  it('rejects a missing hand', () => {
    const bad = clone();
    delete bad.ranges[0]!.hands['AA'];
    expect(() => validateLibrary(bad)).toThrow(RangeDataError);
  });

  it('rejects frequencies that do not sum to 1', () => {
    const bad = clone();
    bad.ranges[0]!.hands['AA'] = { 'minraise-call': 0.5 };
    expect(() => validateLibrary(bad)).toThrow(/fréquences totales/);
  });

  it('rejects an action that is not in the legend', () => {
    const bad = clone();
    bad.ranges[0]!.hands['AA'] = { shove: 1 };
    expect(() => validateLibrary(bad)).toThrow(/absente de la légende/);
  });

  it('accepts mixed strategies that sum to 1', () => {
    const ok = clone();
    ok.ranges[0]!.hands['AA'] = { 'minraise-call': 0.6, 'minraise-fold': 0.4 };
    expect(() => validateLibrary(ok)).not.toThrow();
  });
});
