import { ACTION_LABELS, CUSTOM_COLORS } from './actions';
import { ALL_HANDS } from './cards';
import { boundaryHands, Library, validateRange } from './library';
import type { ActionDef, Format, Position, RangeDef, RangeLibrary, Scenario, Strategy } from './types';

/**
 * Everything the user changed about the ranges. The PDF data itself is never
 * modified: an edit is stored separately and can be reverted at any time.
 */
export interface RangeEdit {
  hands: Record<string, Strategy>;
  updatedAt: number;
}

export interface UserRanges {
  version: 1;
  /** Edited hands of PDF ranges, by range id. */
  edits: Record<string, RangeEdit>;
  /** Ranges created in the app. */
  custom: RangeDef[];
  /** Hands chosen by the user as "marginal", by range id (absent = computed frontier). */
  marginal: Record<string, string[]>;
}

export function emptyUserRanges(): UserRanges {
  return { version: 1, edits: {}, custom: [], marginal: {} };
}

export interface BuiltLibrary {
  library: Library;
  /** User ranges that failed validation and were left out (never silently). */
  problems: string[];
}

/** Merges the PDF ranges, the user's edits and the user's own ranges. */
export function buildLibrary(base: RangeLibrary, user: UserRanges): BuiltLibrary {
  const problems: string[] = [];
  const ranges: RangeDef[] = base.ranges.map((r) => {
    const edit = user.edits[r.id];
    if (!edit) return { ...r, origin: 'pdf' };
    const edited: RangeDef = { ...r, origin: 'pdf', hands: edit.hands, modified: true, updatedAt: edit.updatedAt };
    const errs = validateRange(edited, r.id);
    if (errs.length) {
      problems.push(`Modification de ${r.title} ${r.stackBb} BB ignorée : ${errs[0]}`);
      return { ...r, origin: 'pdf' };
    }
    return edited;
  });
  const ids = new Set(ranges.map((r) => r.id));
  for (const c of user.custom) {
    const errs = validateRange(c, c?.id ?? 'range');
    if (errs.length || ids.has(c.id)) {
      problems.push(`Range personnalisée ${c?.title ?? ''} ignorée : ${errs[0] ?? 'identifiant en double'}`);
      continue;
    }
    ids.add(c.id);
    ranges.push({ ...c, origin: 'custom' });
  }
  return { library: new Library({ ...base, ranges }), problems };
}

// --- spots -------------------------------------------------------------------

export interface SpotChoice {
  hero: Position;
  villain: Position | null;
  scenario: Scenario;
  label: string;
}

const SCENARIO_TEXT: Record<Scenario, string> = {
  open: 'Open',
  'vs-minraise': 'vs minraise',
  'vs-open': 'vs open raise',
  'vs-shove': 'vs open shove',
  'vs-limp': 'vs limp',
};

/** Situations that make sense preflop for each format (who acted before the hero). */
export function spotChoices(format: Format): SpotChoice[] {
  const c = (hero: Position, villain: Position | null, scenario: Scenario): SpotChoice => ({
    hero,
    villain,
    scenario,
    label: `${spotTitle(format, hero, villain, scenario)} · ${SCENARIO_TEXT[scenario]}`,
  });
  if (format === 'hu') {
    return [c('SB', 'BB', 'open'), c('BB', 'SB', 'vs-minraise'), c('BB', 'SB', 'vs-open'), c('BB', 'SB', 'vs-limp'), c('BB', 'SB', 'vs-shove')];
  }
  return [
    c('BTN', null, 'open'),
    c('SB', 'BB', 'open'),
    c('SB', 'BTN', 'vs-minraise'),
    c('SB', 'BTN', 'vs-open'),
    c('SB', 'BTN', 'vs-shove'),
    c('BB', 'SB', 'vs-minraise'),
    c('BB', 'SB', 'vs-open'),
    c('BB', 'SB', 'vs-limp'),
    c('BB', 'SB', 'vs-shove'),
    c('BB', 'BTN', 'vs-minraise'),
    c('BB', 'BTN', 'vs-open'),
    c('BB', 'BTN', 'vs-shove'),
  ];
}

/** Spot id shared with the PDF ranges, so new stack depths join the same group. */
export function spotId(format: Format, hero: Position, villain: Position | null, scenario: Scenario): string {
  if (format === 'hu') return hero === 'SB' ? 'sb' : 'bb';
  if (hero === 'BTN') return 'btn-open';
  if (hero === 'SB') return scenario === 'open' ? 'sb-open' : 'sb-vs-btn';
  return villain === 'BTN' ? 'bb-vs-btn' : 'bb-vs-sb';
}

export function spotTitle(format: Format, hero: Position, villain: Position | null, scenario: Scenario): string {
  if (format === 'hu') return `HU ${hero}`;
  if (hero === 'BTN') return 'BTN';
  if (hero === 'SB' && scenario === 'open') return 'SB vs BB';
  return `${hero} vs ${villain}`;
}

// --- creation ------------------------------------------------------------------

export interface NewRangeInput {
  format: Format;
  hero: Position;
  villain: Position | null;
  scenario: Scenario;
  stackBb: number;
  actions: ActionDef[];
  /** Action given to every hand at creation. */
  fill: string;
}

export function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, '-')
      .replace(/^-|-$/g, '') || 'action'
  );
}

/** Action definition for the editor: a known action, or a custom label. */
export function makeAction(idOrLabel: string, pdfColors: Record<string, string>, index = 0): ActionDef {
  const byLabel = Object.keys(ACTION_LABELS).find((k) => ACTION_LABELS[k]!.toLowerCase() === idOrLabel.trim().toLowerCase());
  const knownId = ACTION_LABELS[idOrLabel] ? idOrLabel : byLabel;
  if (knownId) {
    const known = ACTION_LABELS[knownId]!;
    return { id: knownId, label: known, sourceLabel: known, sourceColor: pdfColors[knownId] ?? '#9aa5b1' };
  }
  const label = idOrLabel.trim();
  const color = CUSTOM_COLORS[index % CUSTOM_COLORS.length]!;
  return { id: `custom:${slug(label)}`, label, sourceLabel: label, sourceColor: color, color };
}

export function newRangeId(input: Pick<NewRangeInput, 'format' | 'hero' | 'villain' | 'scenario' | 'stackBb'>, taken: Set<string>): string {
  const base = `custom-${input.format}-${spotId(input.format, input.hero, input.villain, input.scenario)}-${input.scenario}-${input.stackBb}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

export function createRange(input: NewRangeInput, id: string, now: number): RangeDef {
  const hands: Record<string, Strategy> = {};
  for (const h of ALL_HANDS) hands[h] = { [input.fill]: 1 };
  return {
    id,
    format: input.format,
    spot: spotId(input.format, input.hero, input.villain, input.scenario),
    hero: input.hero,
    villain: input.villain,
    stackBb: input.stackBb,
    scenario: input.scenario,
    title: spotTitle(input.format, input.hero, input.villain, input.scenario),
    subtitle: `${SCENARIO_TEXT[input.scenario]} · personnalisée`,
    scenarioLabel: null,
    source: { page: null },
    origin: 'custom',
    updatedAt: now,
    actions: input.actions,
    hands,
  };
}

/** Same situation and depth already present (PDF or custom). */
export function findDuplicate(library: Library, input: Pick<NewRangeInput, 'format' | 'hero' | 'villain' | 'scenario' | 'stackBb'>, exceptId?: string): RangeDef | undefined {
  const spot = spotId(input.format, input.hero, input.villain, input.scenario);
  return library.ranges.find(
    (r) => r.id !== exceptId && r.format === input.format && r.spot === spot && r.scenario === input.scenario && r.stackBb === input.stackBb,
  );
}

/** Legend colour of each canonical action in the PDF (first occurrence). */
export function pdfColorsById(base: RangeLibrary): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of base.ranges) for (const a of r.actions) out[a.id] ??= a.sourceColor;
  return out;
}

// --- marginal hands --------------------------------------------------------------

/** Hands used by the "marginal hands" mode: the user's choice, else the computed frontier. */
export function marginalHands(range: RangeDef, user: UserRanges): Set<string> {
  const chosen = user.marginal[range.id];
  return chosen ? new Set(chosen) : boundaryHands(range);
}

/** True when the hands of an edited range are identical to the original. */
export function sameHands(a: Record<string, Strategy>, b: Record<string, Strategy>): boolean {
  return ALL_HANDS.every((h) => {
    const x = a[h] ?? {};
    const y = b[h] ?? {};
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    return [...keys].every((k) => Math.abs((x[k] ?? 0) - (y[k] ?? 0)) < 1e-6);
  });
}
