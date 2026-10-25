import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** Minimal async key-value storage, implemented for the browser and Android. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export class StorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Stockage local indisponible : ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'StorageUnavailableError';
  }
}

/** Browser localStorage (also used inside the Android WebView as a mirror). */
export class WebStore implements KeyValueStore {
  constructor(private readonly storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage) {}

  private get s(): Storage {
    if (!this.storage) throw new StorageUnavailableError('localStorage absent');
    return this.storage;
  }

  async get(key: string) {
    try {
      return this.s.getItem(key);
    } catch (e) {
      throw new StorageUnavailableError(e);
    }
  }

  async set(key: string, value: string) {
    try {
      this.s.setItem(key, value);
    } catch (e) {
      throw new StorageUnavailableError(e);
    }
  }

  async remove(key: string) {
    try {
      this.s.removeItem(key);
    } catch (e) {
      throw new StorageUnavailableError(e);
    }
  }

  async keys() {
    try {
      return Array.from({ length: this.s.length }, (_, i) => this.s.key(i)).filter((k): k is string => k !== null);
    } catch (e) {
      throw new StorageUnavailableError(e);
    }
  }
}

/**
 * Android: Capacitor Preferences (SharedPreferences), which the system does
 * not evict like WebView storage can be.
 */
export class NativeStore implements KeyValueStore {
  async get(key: string) {
    return (await Preferences.get({ key })).value;
  }
  async set(key: string, value: string) {
    await Preferences.set({ key, value });
  }
  async remove(key: string) {
    await Preferences.remove({ key });
  }
  async keys() {
    return (await Preferences.keys()).keys;
  }
}

/** In-memory store, for tests and as a last-resort fallback. */
export class MemoryStore implements KeyValueStore {
  readonly map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
  async remove(key: string) {
    this.map.delete(key);
  }
  async keys() {
    return [...this.map.keys()];
  }
}

export function platformStore(): KeyValueStore {
  return Capacitor.isNativePlatform() ? new NativeStore() : new WebStore();
}
