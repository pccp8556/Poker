import { useSyncExternalStore } from 'react';
import raw from '../data/ranges.json';
import type { Grade } from '../domain/grading';
import { Library, validateLibrary } from '../domain/library';
import { addSession, emptyProgress, recordAnswer, type SessionMode } from '../domain/progress';
import { answerCurrent, createSession, isFinished, summarize, type SessionConfig } from '../domain/quiz';
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
  data: AppData;
  save: SaveStatus;
  saveError: string | null;
  /** Keys that were unreadable at startup (backed up, then reset). */
  recovered: DataKey[];
  toast: Toast | null;
}

type Listener = () => void;

const MAX_RECENTS = 6;

export class AppStore {
  private state: StoreState = {
    status: 'loading',
    error: null,
    library: null,
    data: DEFAULTS(),
    save: 'idle',
    saveError: null,
    recovered: [],
    toast: null,
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

  async init() {
    let library: Library;
    try {
      library = new Library(validateLibrary(raw));
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      return;
    }
    try {
      const { data, recovered } = await loadAll(this.kv);
      // A finished session left over from a previous run is simply closed.
      if (data.session && isFinished(data.session)) data.session = null;
      this.set({ status: 'ready', library, data, recovered });
      if (recovered.length) {
        this.showToast('Des données locales illisibles ont été mises de côté (copie de sauvegarde conservée).', 'error');
      }
    } catch (e) {
      // Storage unavailable (private browsing, blocked cookies…): keep working in memory.
      this.kv = new MemoryStore();
      this.set({
        status: 'ready',
        library,
        data: DEFAULTS(),
        save: 'error',
        saveError: 'Stockage local indisponible : la progression ne sera pas conservée après fermeture.',
      });
    }
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

  buildConfig(rangeIds: string[], mode: SessionMode, questionCount?: number): SessionConfig {
    const s = this.data.settings;
    return {
      rangeIds,
      mode,
      questionCount: questionCount ?? s.defaultCount,
      grading: s.grading,
      focusBoundary: s.focusBoundary,
      recallMistakes: s.recallMistakes,
      timerSec: mode === 'exam' ? s.examTimerSec : null,
    };
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
    this.setData({ ...b, session: null }, ['settings', 'progress', 'favorites', 'recents', 'session']);
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
