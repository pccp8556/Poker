import { describe, expect, it } from 'vitest';
import raw from '../src/data/ranges.json';
import { ALL_HANDS } from '../src/domain/cards';
import { countByAction, fillAll, handsWithAction, paintHands, removeAction, strategyFromPercents } from '../src/domain/editor';
import { validateLibrary } from '../src/domain/library';
import { parseRangeNotation } from '../src/domain/notation';
import {
  buildLibrary,
  createRange,
  emptyUserRanges,
  findDuplicate,
  makeAction,
  marginalHands,
  newRangeId,
  pdfColorsById,
  sameHands,
  spotChoices,
  type UserRanges,
} from '../src/domain/userRanges';

const base = validateLibrary(raw);
const colors = pdfColorsById(base);

describe('library built from PDF + user ranges', () => {
  it('keeps the 18 PDF ranges untouched without user data', () => {
    const { library, problems } = buildLibrary(base, emptyUserRanges());
    expect(problems).toEqual([]);
    expect(library.ranges).toHaveLength(18);
    expect(library.ranges.every((r) => r.origin === 'pdf' && !r.modified)).toBe(true);
  });

  it('applies an edit to a PDF range and flags it as modified, original data unchanged', () => {
    const original = base.ranges[0]!;
    const hands = paintHands(original.hands, ['72o'], 'minraise-call');
    const user: UserRanges = { ...emptyUserRanges(), edits: { [original.id]: { hands, updatedAt: 1 } } };
    const { library } = buildLibrary(base, user);
    const r = library.require(original.id);
    expect(r.modified).toBe(true);
    expect(r.hands['72o']).toEqual({ 'minraise-call': 1 });
    expect(original.hands['72o']).toEqual({ fold: 1 });
  });

  it('ignores (and reports) an invalid edit instead of crashing', () => {
    const user: UserRanges = { ...emptyUserRanges(), edits: { '3max-btn-open-25': { hands: { AA: { shove: 1 } }, updatedAt: 1 } } };
    const { library, problems } = buildLibrary(base, user);
    expect(problems).toHaveLength(1);
    expect(library.require('3max-btn-open-25').modified).toBeUndefined();
  });

  it('creates a custom range that joins the same spot as the PDF ranges', () => {
    const { library } = buildLibrary(base, emptyUserRanges());
    const input = { format: '3max' as const, hero: 'BTN' as const, villain: null, scenario: 'open' as const, stackBb: 20 };
    expect(findDuplicate(library, input)).toBeUndefined();
    expect(findDuplicate(library, { ...input, stackBb: 25 })?.id).toBe('3max-btn-open-25');
    const actions = ['fold', 'minraise-call', 'shove'].map((a) => makeAction(a, colors));
    const id = newRangeId(input, new Set(library.byId.keys()));
    const range = createRange({ ...input, actions, fill: 'fold' }, id, 5);
    range.hands = paintHands(range.hands, parseRangeNotation('22+, A2s+').hands, 'shove');
    const built = buildLibrary(base, { ...emptyUserRanges(), custom: [range] });
    expect(built.problems).toEqual([]);
    const r = built.library.require(id);
    expect(r.origin).toBe('custom');
    expect(r.title).toBe('BTN');
    expect(built.library.siblings(r).map((s) => s.stackBb)).toEqual([25, 20, 15, 10]);
    expect(countByAction(r.hands)).toEqual({ shove: 25, fold: 144 });
  });

  it('offers only coherent preflop situations', () => {
    const hu = spotChoices('hu');
    expect(hu.every((c) => (c.hero === 'SB' ? c.scenario === 'open' : c.villain === 'SB'))).toBe(true);
    const tm = spotChoices('3max');
    expect(tm.find((c) => c.hero === 'BTN' && c.scenario !== 'open')).toBeUndefined();
  });

  it('creates custom actions with their own id and colour', () => {
    const a = makeAction('Raise 2.5x / Fold', colors, 2);
    expect(a.id).toBe('custom:raise-2.5x-fold');
    expect(a.color).toBeDefined();
    expect(makeAction('call', colors).label).toBe('Call');
    expect(makeAction('minraise / call', colors).id).toBe('minraise-call');
  });

  it('uses the user marginal hands when defined, else the computed frontier', () => {
    const r = base.ranges[0]!;
    const computed = marginalHands(r, emptyUserRanges());
    expect(computed.size).toBeGreaterThan(0);
    expect([...marginalHands(r, { ...emptyUserRanges(), marginal: { [r.id]: ['AA', 'KK'] } })]).toEqual(['AA', 'KK']);
  });
});

describe('editor helpers', () => {
  it('normalises mixed frequencies to 100 %', () => {
    expect(strategyFromPercents({ call: 60, fold: 40 })).toEqual({ call: 0.6, fold: 0.4 });
    expect(strategyFromPercents({ call: 1, fold: 1, shove: 1 })).toEqual({ call: 0.333, fold: 0.333, shove: 0.334 });
    expect(strategyFromPercents({ call: 0, fold: 0 })).toBeNull();
    const s = strategyFromPercents({ a: 33, b: 33, c: 34 })!;
    expect(Object.values(s).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 6);
  });

  it('paints, fills and removes actions', () => {
    const hands = paintHands(fillAll('fold'), ['AA', 'KK'], 'shove');
    expect(handsWithAction(hands, 'shove')).toEqual(['AA', 'KK']);
    const range = { ...base.ranges[0]!, hands };
    const removed = removeAction({ ...range, actions: [...range.actions, makeAction('shove', colors)] }, 'shove', 'fold');
    expect(handsWithAction(removed.hands, 'shove')).toEqual([]);
    expect(removed.hands['AA']).toEqual({ fold: 1 });
    expect(sameHands(removed.hands, fillAll('fold'))).toBe(true);
    expect(ALL_HANDS.every((h) => removed.hands[h])).toBe(true);
  });
});
