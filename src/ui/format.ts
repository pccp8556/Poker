export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(digits)} %`;
}

export function seconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m} min ${String(r).padStart(2, '0')}` : `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const TIME_FMT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const WEEKDAY_FMT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

export function dateTime(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `Aujourd’hui, ${TIME_FMT.format(d)}`;
  if (same(d, yesterday)) return `Hier, ${TIME_FMT.format(d)}`;
  return `${DATE_FMT.format(d)}, ${TIME_FMT.format(d)}`;
}

export function shortDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return DATE_FMT.format(new Date(y!, (m ?? 1) - 1, d));
}

export function weekdayInitial(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return WEEKDAY_FMT.format(new Date(y!, (m ?? 1) - 1, d)).charAt(0).toUpperCase();
}

/** "dans 2 j", "dans 3 h", "maintenant" */
export function untilLabel(ts: number, now = Date.now()): string {
  const diff = ts - now;
  if (diff <= 0) return 'maintenant';
  const min = Math.round(diff / 60_000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `dans ${h} h`;
  return `dans ${Math.round(h / 24)} j`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Readable text colour (near-black or white) for a filled background. */
export function inkFor(hex: string): string {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  return L > 0.33 ? '#0b1110' : '#ffffff';
}
