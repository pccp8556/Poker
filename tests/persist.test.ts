import { describe, expect, it } from 'vitest';
import { grade } from '../src/domain/grading';
import { emptyProgress, recordAnswer } from '../src/domain/progress';
import { createSession } from '../src/domain/quiz';
import { seededRng } from '../src/domain/rng';
import { MemoryStore, WebStore } from '../src/storage/kv';
import { DEFAULT_SETTINGS, KEYS, loadAll, makeBackup, parseBackup, parseSettings, saveKey, DEFAULTS } from '../src/storage/persist';
import { realLibrary } from './fixtures';

const T0 = new Date('2026-03-15T12:00:00').getTime();

function sampleProgress() {
  const strat = realLibrary.require('3max-btn-open-25').hands['AA']!;
  return recordAnswer(emptyProgress(), {
    sessionId: 's',
    mode: 'random',
    rangeId: '3max-btn-open-25',
    hand: 'AA',
    grade: grade(strat, 'fold', 'tolerant'),
    ms: 1500,
    now: T0,
  });
}

describe('persistence', () => {
  it('returns defaults on first launch', async () => {
    const { data, recovered } = await loadAll(new MemoryStore());
    expect(data).toEqual(DEFAULTS());
    expect(recovered).toEqual([]);
  });

  it('round-trips settings, progress, favorites and the active session', async () => {
    const store = new MemoryStore();
    const progress = sampleProgress();
    const session = createSession(
      realLibrary,
      { rangeIds: ['hu-sb-8'], mode: 'random', questionCount: 5, grading: 'tolerant', focusBoundary: true, recallMistakes: true, timerSec: null },
      {},
      T0,
      seededRng(1),
    );
    await saveKey(store, 'settings', { ...DEFAULT_SETTINGS, fourColor: false });
    await saveKey(store, 'progress', progress);
    await saveKey(store, 'favorites', [{ id: 'f', name: 'HU', rangeIds: ['hu-sb-8'], mode: 'random', questionCount: 20, createdAt: T0 }]);
    await saveKey(store, 'session', session);
    const { data, recovered } = await loadAll(store);
    expect(recovered).toEqual([]);
    expect(data.settings.fourColor).toBe(false);
    expect(data.progress).toEqual(progress);
    expect(data.favorites[0]!.name).toBe('HU');
    expect(data.session).toEqual(session);
  });

  it('backs up corrupted data instead of silently dropping it', async () => {
    const store = new MemoryStore();
    await store.set(KEYS.progress, '{not json');
    await store.set(KEYS.settings, JSON.stringify({ grading: 'strict' }));
    const { data, recovered } = await loadAll(store, T0);
    expect(recovered).toEqual(['progress']);
    expect(data.progress).toEqual(emptyProgress());
    expect(data.settings.grading).toBe('strict');
    expect(await store.get(`${KEYS.progress}.corrupt.${T0}`)).toBe('{not json');
  });

  it('accepts a cleared session (null) without reporting corruption', async () => {
    const store = new MemoryStore();
    await saveKey(store, 'session', null);
    const { data, recovered } = await loadAll(store);
    expect(recovered).toEqual([]);
    expect(data.session).toBeNull();
  });

  it('migrates the 1.0 auto-advance setting to the fast correction mode', () => {
    expect(parseSettings({ autoAdvance: true })!.correction).toBe('fast');
    expect(parseSettings({ autoAdvance: false })!.correction).toBe('detailed');
    expect(parseSettings({ defaultCount: 0 })!.defaultCount).toBe(0);
  });

  it('round-trips user ranges and keeps them in backups', async () => {
    const store = new MemoryStore();
    const ranges = { version: 1 as const, edits: { 'hu-bb-8': { hands: realLibrary.require('hu-bb-8').hands, updatedAt: 3 } }, custom: [], marginal: { 'hu-bb-8': ['AA'] } };
    await saveKey(store, 'ranges', ranges);
    const { data } = await loadAll(store);
    expect(data.ranges).toEqual(ranges);
    const restored = parseBackup(JSON.stringify(makeBackup({ ...DEFAULTS(), ranges }, T0)));
    expect(restored.ranges).toEqual(ranges);
    // Backups made before ranges existed still import.
    const old = { ...makeBackup(DEFAULTS(), T0) } as Record<string, unknown>;
    delete old.ranges;
    expect(parseBackup(JSON.stringify(old)).ranges.custom).toEqual([]);
  });

  it('sanitises settings with unknown or invalid values', () => {
    expect(parseSettings({ grading: 'weird', defaultCount: -3, haptics: false })).toEqual({ ...DEFAULT_SETTINGS, haptics: false });
    expect(parseSettings('x')).toBeNull();
  });

  it('exports and re-imports a backup', () => {
    const data = { ...DEFAULTS(), progress: sampleProgress() };
    const text = JSON.stringify(makeBackup(data, T0));
    const restored = parseBackup(text);
    expect(restored.progress).toEqual(data.progress);
    expect(() => parseBackup('{}')).toThrow(/pas une sauvegarde/);
    expect(() => parseBackup('nope')).toThrow(/JSON/);
  });

  it('reports storage failures (quota, private mode) as errors', async () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;
    await expect(new WebStore(failing).set('k', 'v')).rejects.toThrow(/Stockage local indisponible/);
  });
});
