import { useSyncExternalStore } from 'react';
import raw from '../data/ranges.json';
import type { Grade } from '../domain/grading';
import { Library, validateLibrary } from '../domain/library';
import { addSession, emptyProgress, recordAnswer, type SessionMode } from '../domain/progress';
import { answerCurrent, createSession, finishSession, isFinished, summarize, type SessionConfig } from '../domain/quiz';
import type { RangeDef, RangeLibrary, Strategy } from '../domain/types';
import { buildLibrary, marginalHands, pdfColorsById, sameHands } from '../domain/userRanges';
import { defaultRng, randomId } from '../domain/rng';
import { platformStore, MemoryStore, type KeyValueStore } from '../storage/kv';
import {
  DEFAULTS,
  loadAll,
  makeBackup,
  parseBackup,
  saveKey,
  type AppData,
  type DataKey,
  type Favorite,
  type Settings,
} from '../storage/persist';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export interface StoreState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  library: Library | null;
  /** Ranges exactly as extracted from the PDF (never modified). */
  base: RangeLibrary | null;
  data: AppData;
  save: SaveStatus;
  saveError: string | null;
  /** Keys that were unreadable at startup (backed up, then reset). */
  recovered: DataKey[];
  toast: Toast | null;
  /** Whether the browser granted persistent storage (always true on Android). */
  storagePersisted: boolean | null;
}

type Listener = () => void;

const MAX_RECENTS = 6;

export class AppStore {
  private state: StoreState = {
    status: 'loading',
    error: null,
    library: null,
    base: null,
    data: DEFAULTS(),
    save: 'idle',
    saveError: null,
    recovered: [],
    toast: null,
    storagePersisted: null,
  };
  private listeners = new Set<Listener>();
  private queue: Promise<void> = Promise.resolve();
  private pending = new Set<DataKey>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private kv: KeyValueStore) {}

  getState = () => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<StoreState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private setData(patch: Partial<AppData>, keys: DataKey[]) {
    this.set({ data: { ...this.state.data, ...patch } });
    this.persist(keys);
  }

  get library(): Library {
    if (!this.state.library) throw new Error('Bibliothèque non chargée');
    return this.state.library;
  }

  get data(): AppData {
    return this.state.data;
  }

  get base(): RangeLibrary {
    if (!this.state.base) throw new Error('Bibliothèque non chargée');
    return this.state.base;
  }

  async init() {
    let base: RangeLibrary;
    try {
      base = validateLibrary(raw);
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      return;
    }
    try {
      const { data, recovered } = await loadAll(this.kv);
      // A finished session left over from a previous run is simply closed.
      if (data.session && isFinished(data.session)) data.session = null;
      const { library, problems } = buildLibrary(base, data.ranges);
      // A session on a range that no longer exists cannot be resumed.
      if (data.session && data.session.config.rangeIds.some((id) => !library.get(id))) data.session = null;
      this.set({ status: 'ready', base, library, data, recovered });
      if (recovered.length) {
        this.showToast('Des données locales illisibles ont été mises de côté (copie de sauvegarde conservée).', 'error');
      } else if (problems.length) {
        this.showToast(problems[0]!, 'error');
      }
    } catch (e) {
      // Storage unavailable (private browsing, blocked cookies…): keep working in memory.
      this.kv = new MemoryStore();
      this.set({
        status: 'ready',
        base,
        library: buildLibrary(base, DEFAULTS().ranges).library,
        data: DEFAULTS(),
        save: 'error',
        saveError: 'Stockage local indisponible : la progression ne sera pas conservée après fermeture.',
      });
    }
  }

  private rebuild(ranges = this.data.ranges) {
    const { library, problems } = buildLibrary(this.base, ranges);
    this.set({ library });
    if (problems.length) this.showToast(problems[0]!, 'error');
  }

  // --- persistence ------------------------------------------------------

  private persist(keys: DataKey[]) {
    keys.forEach((k) => this.pending.add(k));
    this.set({ save: 'saving' });
    this.queue = this.queue.then(async () => {
      const todo = [...this.pending];
      this.pending.clear();
      if (!todo.length) return;
      try {
        for (const k of todo) await saveKey(this.kv, k, this.state.data[k]);
        if (!this.pending.size) this.set({ save: 'saved', saveError: null });
      } catch (e) {
        todo.forEach((k) => this.pending.add(k));
        this.set({ save: 'error', saveError: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  setStoragePersisted(value: boolean) {
    this.set({ storagePersisted: value });
  }

  /** Resolves once every pending write has been attempted. */
  flush(): Promise<void> {
    return this.queue;
  }

  retrySave() {
    this.persist([]);
  }

  // --- toasts -----------------------------------------------------------

  showToast(text: string, kind: Toast['kind'] = 'info') {
    clearTimeout(this.toastTimer);
    this.set({ toast: { id: Date.now(), text, kind } });
    this.toastTimer = setTimeout(() => this.set({ toast: null }), kind === 'error' ? 6000 : 2800);
  }

  dismissToast() {
    clearTimeout(this.toastTimer);
    this.set({ toast: null });
  }

  // --- settings & favourites -------------------------------------------

  updateSettings(patch: Partial<Settings>) {
    this.setData({ settings: { ...this.data.settings, ...patch } }, ['settings']);
  }

  saveFavorite(name: string, rangeIds: string[], mode: SessionMode, questionCount: number): Favorite {
    const fav: Favorite = { id: randomId(), name: name.trim() || 'Favori', rangeIds, mode, questionCount, createdAt: Date.now() };
    this.setData({ favorites: [fav, ...this.data.favorites] }, ['favorites']);
    return fav;
  }

  removeFavorite(id: string) {
    this.setData({ favorites: this.data.favorites.filter((f) => f.id !== id) }, ['favorites']);
  }

  // --- sessions -----------------------------------------------------------

  buildConfig(rangeIds: string[], mode: SessionMode, questionCount?: number, extra: Partial<SessionConfig> = {}): SessionConfig {
    const s = this.data.settings;
    const config: SessionConfig = {
      rangeIds,
      mode,
      questionCount: questionCount ?? s.defaultCount,
      grading: s.grading,
      focusBoundary: s.focusBoundary,
      recallMistakes: s.recallMistakes,
      timerSec: mode === 'exam' ? s.examTimerSec : null,
      ...(s.includeProfileDependent ? {} : { excludeActions: ['profile-dependent'] }),
      ...extra,
    };
    if (mode === 'marginal') {
      const sets: Record<string, string[]> = {};
      for (const id of rangeIds) {
        const r = this.library.get(id);
        if (r) sets[id] = [...marginalHands(r, this.data.ranges)];
      }
      config.handSets = sets;
    }
    return config;
  }

  /** Returns false when no question matches (e.g. no mistakes to review). */
  startSession(config: SessionConfig): boolean {
    if (this.data.session && this.data.session.answers.length > 0) this.abandonSession();
    const session = createSession(this.library, config, this.data.progress.items, Date.now(), defaultRng);
    if (!session) return false;
    const recents = [
      { rangeIds: config.rangeIds, mode: config.mode, at: Date.now() },
      ...this.data.recents.filter((r) => !(r.mode === config.mode && sameIds(r.rangeIds, config.rangeIds))),
    ].slice(0, MAX_RECENTS);
    this.setData({ session, recents }, ['session', 'recents']);
    return true;
  }

  answer(chosen: string | null, ms: number): Grade | null {
    const session = this.data.session;
    if (!session || isFinished(session)) return null;
    const now = Date.now();
    const res = answerCurrent(this.library, session, chosen, ms, now, defaultRng);
    let progress = recordAnswer(this.data.progress, {
      sessionId: session.id,
      mode: session.config.mode,
      rangeId: res.question.rangeId,
      hand: res.question.hand,
      grade: res.grade,
      ms,
      now,
    });
    if (isFinished(res.session)) progress = addSession(progress, summarize(res.session, now));
    this.setData({ session: res.session, progress }, ['session', 'progress']);
    return res.grade;
  }

  /** Ends an unlimited session (or stops early) and records it as completed. */
  finishSession(): string | null {
    const s = this.data.session;
    if (!s) return null;
    if (s.answers.length === 0) {
      this.setData({ session: null }, ['session']);
      return null;
    }
    const done = finishSession(s, Date.now());
    const progress = addSession(this.data.progress, summarize(done, Date.now()));
    this.setData({ session: null, progress }, ['session', 'progress']);
    return s.id;
  }

  /** Closes a finished session (its summary is already recorded). */
  closeSession(): string | null {
    const s = this.data.session;
    if (!s) return null;
    this.setData({ session: null }, ['session']);
    return s.id;
  }

  /** Stops an unfinished session; answers already given are kept. */
  abandonSession(): string | null {
    const s = this.data.session;
    if (!s) return null;
    let progress = this.data.progress;
    if (s.answers.length > 0) progress = addSession(progress, summarize(s, Date.now()));
    this.setData({ session: null, progress }, ['session', 'progress']);
    return s.answers.length > 0 ? s.id : null;
  }

  // --- data management ------------------------------------------------------

  exportBackup(): string {
    return JSON.stringify(makeBackup(this.data), null, 1);
  }

  importBackup(text: string) {
    const b = parseBackup(text);
    this.setData({ ...b, session: null }, ['settings', 'progress', 'favorites', 'recents', 'session', 'ranges']);
    this.rebuild(b.ranges);
  }

  // --- ranges: edits, custom ranges, marginal hands ---------------------------

  pdfColors(): Record<string, string> {
    return pdfColorsById(this.base);
  }

  private setRanges(ranges: AppData['ranges']) {
    // A running session keeps its questions; answers are graded against the saved version.
    this.setData({ ranges }, ['ranges']);
    this.rebuild(ranges);
  }

  /** Saves the hands of a range (an edit for a PDF range, the range itself for a custom one). */
  saveRangeHands(id: string, hands: Record<string, Strategy>) {
    const ranges = this.data.ranges;
    const original = this.base.ranges.find((r) => r.id === id);
    if (original) {
      const edits = { ...ranges.edits };
      if (sameHands(original.hands, hands)) delete edits[id];
      else edits[id] = { hands, updatedAt: Date.now() };
      this.setRanges({ ...ranges, edits });
      return;
    }
    const custom = ranges.custom.map((r) => (r.id === id ? { ...r, hands, updatedAt: Date.now() } : r));
    this.setRanges({ ...ranges, custom });
  }

  /** Restores the PDF version of a range. */
  restoreRange(id: string) {
    const edits = { ...this.data.ranges.edits };
    delete edits[id];
    this.setRanges({ ...this.data.ranges, edits });
  }

  saveCustomRange(range: RangeDef) {
    const custom = this.data.ranges.custom.filter((r) => r.id !== range.id);
    const { origin: _o, modified: _m, ...clean } = range;
    this.setRanges({ ...this.data.ranges, custom: [...custom, { ...clean, updatedAt: Date.now() }] });
  }

  deleteCustomRange(id: string) {
    if (this.data.session?.config.rangeIds.includes(id)) this.abandonSession();
    const marginal = { ...this.data.ranges.marginal };
    delete marginal[id];
    this.setRanges({ ...this.data.ranges, custom: this.data.ranges.custom.filter((r) => r.id !== id), marginal });
  }

  /** Sets the marginal hands of a range; null restores the computed frontier. */
  setMarginal(id: string, hands: string[] | null) {
    const marginal = { ...this.data.ranges.marginal };
    if (hands === null) delete marginal[id];
    else marginal[id] = hands;
    this.setRanges({ ...this.data.ranges, marginal });
  }

  resetProgress() {
    this.setData({ progress: emptyProgress(), session: null }, ['progress', 'session']);
  }
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export const store = new AppStore(platformStore());

export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

/** Library accessor for components rendered after initialisation. */
export function useLibrary(): Library {
  const lib = useStore((s) => s.library);
  if (!lib) throw new Error('Bibliothèque non chargée');
  return lib;
}
