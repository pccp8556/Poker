import { describe, expect, it } from 'vitest';
import { ALL_HANDS } from '../src/domain/cards';
import {
  addAttempt,
  blankAction,
  drawingStats,
  emptyDrawings,
  gradeDrawing,
  groupMistakes,
  MAX_ATTEMPTS,
  parseDrawings,
  setDraft,
  type Drawing,
  type DrawingAttempt,
} from '../src/domain/drawing';
import { DEFAULTS, loadAll, makeBackup, parseBackup, saveKey } from '../src/storage/persist';
import { MemoryStore } from '../src/storage/kv';
import { realLibrary, syntheticRange } from './fixtures';

/** The reference drawing of a range: each hand painted with its first action. */
function reference(rangeId: string, skipFold = false): Drawing {
  const r = realLibrary.require(rangeId);
  const d: Drawing = {};
  for (const h of ALL_HANDS) {
    const a = Object.keys(r.hands[h] ?? {})[0]!;
    if (!(skipFold && a === 'fold')) d[h] = a;
  }
  return d;
}

const attempt = (over: Partial<DrawingAttempt> = {}): DrawingAttempt => ({ t: 1, r: '3max-btn-open-25', ok: 150, sc: 0.9, w: [], ms: 60_000, help: false, ...over });

describe('grading a drawing', () => {
  it('every range of the document drawn from its own grid scores 169/169', () => {
    for (const r of realLibrary.data.ranges) {
      const g = gradeDrawing(r, reference(r.id));
      expect(g.correct, r.id).toBe(169);
      expect(g.score).toBe(1);
      expect(g.comboScore).toBe(1);
      expect(g.mistakes).toEqual([]);
    }
  });

  it('unpainted hands count as Fold when the range has a Fold action', () => {
    const r = realLibrary.require('3max-btn-open-25');
    expect(blankAction(r)).toBe('fold');
    expect(gradeDrawing(r, reference(r.id, true)).correct).toBe(169);
    expect(gradeDrawing(r, {}).correct).toBe(91); // the 91 Fold hands of BTN 25 BB
  });

  it('without a Fold action (HU BB vs limp), unpainted hands are wrong', () => {
    const r = realLibrary.require('hu-bb-12');
    expect(blankAction(r)).toBeNull();
    const d = reference(r.id);
    delete d['AA'];
    delete d['72o'];
    const g = gradeDrawing(r, d);
    expect(g.correct).toBe(167);
    expect(g.empty).toBe(2);
    expect(g.mistakes.map((m) => m.drawn)).toEqual([null, null]);
  });

  it('counts per action: expected, right, missed, extra; scores weighted by combos', () => {
    const r = realLibrary.require('3max-btn-open-25');
    const d = reference(r.id);
    d['A5o'] = 'fold'; // Minraise / Fold in the PDF
    d['72o'] = 'minraise-call'; // Fold in the PDF
    const g = gradeDrawing(r, d);
    expect(g.correct).toBe(167);
    expect(g.comboScore).toBeCloseTo((1326 - 24) / 1326, 10); // two offsuit hands, 12 combos each
    const by = Object.fromEntries(g.byAction.map((a) => [a.id, a]));
    expect(by['minraise-fold']).toEqual({ id: 'minraise-fold', expected: 58, drawn: 57, correct: 57, missed: 1, extra: 0 });
    expect(by['minraise-call']).toEqual({ id: 'minraise-call', expected: 20, drawn: 21, correct: 20, missed: 0, extra: 1 });
    expect(by['fold']).toEqual({ id: 'fold', expected: 91, drawn: 91, correct: 90, missed: 1, extra: 1 });
  });

  it('a mixed hand accepts any action it plays', () => {
    const r = syntheticRange(); // AKs: 60 % Minraise / Call, 40 % shove
    const d: Drawing = {};
    for (const h of ALL_HANDS) d[h] = Object.keys(r.hands[h]!)[0]!;
    d['AKs'] = 'shove';
    expect(gradeDrawing(r, d).correct).toBe(169);
    d['AKs'] = 'fold';
    expect(gradeDrawing(r, d).mistakes).toEqual([{ hand: 'AKs', drawn: 'fold', expected: ['minraise-call', 'shove'] }]);
  });

  it('groups mistakes by "painted X instead of Y", largest group first', () => {
    const groups = groupMistakes([
      { hand: 'A5o', drawn: 'fold', expected: ['minraise-fold'] },
      { hand: '72o', drawn: 'minraise-call', expected: ['fold'] },
      { hand: 'A4o', drawn: 'fold', expected: ['minraise-fold'] },
    ]);
    expect(groups).toEqual([
      { drawn: 'fold', expected: ['minraise-fold'], hands: ['A5o', 'A4o'] },
      { drawn: 'minraise-call', expected: ['fold'], hands: ['72o'] },
    ]);
  });
});

describe('drawing history and drafts', () => {
  it('a validated drawing clears the draft of its range and keeps the others', () => {
    let s = setDraft(emptyDrawings(), '3max-btn-open-25', { AA: 'minraise-call' }, 5);
    s = setDraft(s, 'hu-bb-8', { AA: 'call' }, 6);
    s = addAttempt(s, attempt());
    expect(Object.keys(s.drafts)).toEqual(['hu-bb-8']);
    expect(s.attempts).toHaveLength(1);
    expect(setDraft(s, 'hu-bb-8', {}, 7).drafts).toEqual({});
  });

  it('keeps the most recent attempts only', () => {
    let s = emptyDrawings();
    for (let i = 0; i < MAX_ATTEMPTS + 5; i++) s = addAttempt(s, attempt({ t: i }));
    expect(s.attempts).toHaveLength(MAX_ATTEMPTS);
    expect(s.attempts[0]!.t).toBe(MAX_ATTEMPTS + 4);
  });

  it('best attempt: most hands right, then fastest; last attempt kept', () => {
    let s = emptyDrawings();
    s = addAttempt(s, attempt({ t: 1, ok: 160, ms: 90_000 }));
    s = addAttempt(s, attempt({ t: 2, ok: 160, ms: 50_000 }));
    s = addAttempt(s, attempt({ t: 3, ok: 140 }));
    const st = drawingStats(s).get('3max-btn-open-25')!;
    expect(st.attempts).toBe(3);
    expect(st.best.t).toBe(2);
    expect(st.last.t).toBe(3);
  });

  it('reads back stored data and rejects malformed values', async () => {
    const store = new MemoryStore();
    const drawings = addAttempt(setDraft(emptyDrawings(), 'hu-bb-8', { AA: 'call' }, 4), attempt());
    await saveKey(store, 'drawings', drawings);
    expect((await loadAll(store)).data.drawings).toEqual(drawings);
    expect(parseDrawings({ version: 2 })).toBeNull();
    expect(parseDrawings({ version: 1, attempts: [{ t: 'x' }, attempt()], drafts: { a: null } })).toEqual({ version: 1, attempts: [attempt()], drafts: {} });
  });

  it('is part of backups; older backups without drawings still import', () => {
    const drawings = addAttempt(emptyDrawings(), attempt());
    const restored = parseBackup(JSON.stringify(makeBackup({ ...DEFAULTS(), drawings }, 0)));
    expect(restored.drawings).toEqual(drawings);
    const old = { ...makeBackup(DEFAULTS(), 0) } as Record<string, unknown>;
    delete old.drawings;
    expect(parseBackup(JSON.stringify(old)).drawings).toEqual(emptyDrawings());
  });
});
