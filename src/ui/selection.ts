import type { Library } from '../domain/library';
import { FORMAT_LABEL } from '../domain/situation';
import type { RangeDef } from '../domain/types';

export interface SpotGroup {
  key: string;
  format: RangeDef['format'];
  title: string;
  subtitle: string;
  ranges: RangeDef[];
}

/** Groups ranges by spot (same format + spot id), preserving document order. */
export function spotGroups(ranges: readonly RangeDef[]): SpotGroup[] {
  const groups = new Map<string, SpotGroup>();
  for (const r of ranges) {
    const key = `${r.format}:${r.spot}`;
    const g = groups.get(key) ?? { key, format: r.format, title: r.title, subtitle: r.subtitle, ranges: [] };
    g.ranges.push(r);
    groups.set(key, g);
  }
  for (const g of groups.values()) g.ranges.sort((a, b) => b.stackBb - a.stackBb);
  return [...groups.values()];
}

/** Short human description of a set of ranges. */
export function describeSelection(library: Library, ids: readonly string[]): string {
  const ranges = ids.map((id) => library.get(id)).filter((r): r is RangeDef => Boolean(r));
  if (ranges.length === 0) return 'Aucune range';
  if (ranges.length === library.ranges.length) return `Toutes les ranges (${ranges.length})`;
  const groups = spotGroups(ranges);
  const parts = groups.map((g) => {
    const full = library.ranges.filter((r) => r.format === g.format && r.spot === g.ranges[0]!.spot).length;
    const stacks = g.ranges.map((r) => r.stackBb).join('/');
    return g.ranges.length === full ? `${g.title} (tous tapis)` : `${g.title} ${stacks} BB`;
  });
  const formats = new Set(ranges.map((r) => r.format));
  if (parts.length > 2) {
    const prefix = formats.size === 1 ? `${FORMAT_LABEL[ranges[0]!.format]} · ` : '';
    return `${prefix}${parts.slice(0, 2).join(', ')} +${parts.length - 2}`;
  }
  return parts.join(', ');
}
