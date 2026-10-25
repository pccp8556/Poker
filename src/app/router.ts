import { useSyncExternalStore } from 'react';

/**
 * Tiny hash router. Hash URLs work identically on Netlify, inside the
 * Capacitor WebView and from a file, with no server rewrite needed, and keep
 * the browser / Android back button meaningful.
 */
export interface Route {
  path: string;
  parts: string[];
}

function read(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const path = useSyncExternalStore(subscribe, read, () => '/');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent) };
}

export function currentPath(): string {
  return read();
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path}`;
  if (opts.replace) {
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (window.location.hash !== url) {
    window.location.hash = path;
  }
}

/** Back if there is in-app history, otherwise go to `fallback`. */
export function goBack(fallback = '/') {
  if (window.history.length > 1 && (window.history.state as { idx?: number } | null)?.idx !== 0) window.history.back();
  else navigate(fallback, { replace: true });
}
