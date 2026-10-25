import { emptyProgress, type ProgressState, type SessionMode } from '../domain/progress';
import type { SessionState } from '../domain/quiz';
import type { KeyValueStore } from './kv';

export interface Settings {
  grading: 'tolerant' | 'strict';
  autoAdvance: boolean;
  focusBoundary: boolean;
  recallMistakes: boolean;
  examTimerSec: number | null;
  defaultCount: number;
  fourColor: boolean;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  grading: 'tolerant',
  autoAdvance: false,
  focusBoundary: true,
  recallMistakes: true,
  examTimerSec: null,
  defaultCount: 20,
  fourColor: true,
  haptics: true,
};

export interface Favorite {
  id: string;
  name: string;
  rangeIds: string[];
  mode: SessionMode;
  questionCount: number;
  createdAt: number;
}

export interface Recent {
  rangeIds: string[];
  mode: SessionMode;
  at: number;
}

export interface AppData {
  settings: Settings;
  progress: ProgressState;
  favorites: Favorite[];
  recents: Recent[];
  session: SessionState | null;
}

export const KEYS = {
  settings: 'rl.settings.v1',
  progress: 'rl.progress.v1',
  favorites: 'rl.favorites.v1',
  recents: 'rl.recents.v1',
  session: 'rl.session.v1',
} as const;

export type DataKey = keyof typeof KEYS;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const MODES: SessionMode[] = ['random', 'targeted', 'errors', 'review', 'exam'];

export function parseSettings(v: unknown): Settings | null {
  if (!isObject(v)) return null;
  const s = { ...DEFAULT_SETTINGS };
  if (v.grading === 'tolerant' || v.grading === 'strict') s.grading = v.grading;
  for (const k of ['autoAdvance', 'focusBoundary', 'recallMistakes', 'fourColor', 'haptics'] as const) {
    if (typeof v[k] === 'boolean') s[k] = v[k];
  }
  if (v.examTimerSec === null || (typeof v.examTimerSec === 'number' && v.examTimerSec > 0)) s.examTimerSec = v.examTimerSec;
  if (typeof v.defaultCount === 'number' && v.defaultCount >= 1 && v.defaultCount <= 500) s.defaultCount = Math.round(v.defaultCount);
  return s;
}

export function parseProgress(v: unknown): ProgressState | null {
  if (!isObject(v) || v.version !== 1) return null;
  if (!isObject(v.items) || !isObject(v.days) || !Array.isArray(v.answers) || !Array.isArray(v.sessions)) return null;
  for (const it of Object.values(v.items)) {
    if (!isObject(it) || typeof it.n !== 'number' || typeof it.ok !== 'number' || typeof it.box !== 'number') return null;
  }
  for (const d of Object.values(v.days)) {
    if (!isObject(d) || typeof d.n !== 'number' || typeof d.ok !== 'number') return null;
  }
  return {
    ...emptyProgress(),
    ...(v as unknown as ProgressState),
    streak: typeof v.streak === 'number' ? v.streak : 0,
    bestStreak: typeof v.bestStreak === 'number' ? v.bestStreak : 0,
  };
}

export function parseFavorites(v: unknown): Favorite[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter(
    (f): f is Favorite =>
      isObject(f) && typeof f.id === 'string' && typeof f.name === 'string' && Array.isArray(f.rangeIds) && MODES.includes(f.mode as SessionMode),
  );
}

export function parseRecents(v: unknown): Recent[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((r): r is Recent => isObject(r) && Array.isArray(r.rangeIds) && MODES.includes(r.mode as SessionMode));
}

export function parseSession(v: unknown): SessionState | null {
  if (v === null) return null;
  if (!isObject(v) || typeof v.id !== 'string' || !Array.isArray(v.questions) || !Array.isArray(v.answers) || !isObject(v.config)) return null;
  return v as unknown as SessionState;
}

const PARSERS: { [K in DataKey]: (v: unknown) => AppData[K] | null } = {
  settings: parseSettings,
  progress: parseProgress,
  favorites: parseFavorites,
  recents: parseRecents,
  session: parseSession,
};

export const DEFAULTS: () => AppData = () => ({
  settings: { ...DEFAULT_SETTINGS },
  progress: emptyProgress(),
  favorites: [],
  recents: [],
  session: null,
});

export interface LoadResult {
  data: AppData;
  /** Keys whose stored value was unreadable; the raw value was backed up. */
  recovered: DataKey[];
}

/**
 * Loads every key. A corrupted value is never silently dropped: it is copied
 * under a backup key before the default value is used, and reported.
 */
export async function loadAll(store: KeyValueStore, now = Date.now()): Promise<LoadResult> {
  const data = DEFAULTS();
  const recovered: DataKey[] = [];
  for (const k of Object.keys(KEYS) as DataKey[]) {
    const raw = await store.get(KEYS[k]);
    if (raw === null) continue;
    let parsed: unknown = undefined;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    const value = parsed === undefined ? null : PARSERS[k](parsed);
    if (value === null && !(k === 'session' && parsed === null)) {
      await store.set(`${KEYS[k]}.corrupt.${now}`, raw);
      recovered.push(k);
      continue;
    }
    (data as unknown as Record<DataKey, unknown>)[k] = value;
  }
  return { data, recovered };
}

export async function saveKey<K extends DataKey>(store: KeyValueStore, key: K, value: AppData[K]): Promise<void> {
  await store.set(KEYS[key], JSON.stringify(value));
}

export interface BackupFile {
  app: 'range-lab';
  format: 1;
  exportedAt: string;
  settings: Settings;
  progress: ProgressState;
  favorites: Favorite[];
  recents: Recent[];
}

export function makeBackup(data: AppData, now = Date.now()): BackupFile {
  return {
    app: 'range-lab',
    format: 1,
    exportedAt: new Date(now).toISOString(),
    settings: data.settings,
    progress: data.progress,
    favorites: data.favorites,
    recents: data.recents,
  };
}

export function parseBackup(text: string): Omit<BackupFile, 'app' | 'format' | 'exportedAt'> {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error('Le fichier n’est pas un JSON valide.');
  }
  if (!isObject(v) || v.app !== 'range-lab' || v.format !== 1) throw new Error('Ce fichier n’est pas une sauvegarde Range Lab.');
  const progress = parseProgress(v.progress);
  if (!progress) throw new Error('La progression contenue dans la sauvegarde est illisible.');
  return {
    settings: parseSettings(v.settings) ?? { ...DEFAULT_SETTINGS },
    progress,
    favorites: parseFavorites(v.favorites) ?? [],
    recents: parseRecents(v.recents) ?? [],
  };
}
