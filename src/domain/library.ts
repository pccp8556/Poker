import { ALL_HANDS, combos, gridNeighbours, isHand } from './cards';
import type { Format, Position, RangeDef, RangeLibrary, Scenario, SituationType, Strategy } from './types';

export class RangeDataError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Données de ranges invalides :\n- ${problems.slice(0, 10).join('\n- ')}`);
    this.name = 'RangeDataError';
  }
}

const FORMATS: Format[] = ['3max', 'hu'];
const POSITIONS: Position[] = ['BTN', 'SB', 'BB'];
const SCENARIOS: Scenario[] = ['open', 'vs-minraise', 'vs-open', 'vs-shove', 'vs-limp'];
const EPSILON = 1e-6;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validates raw JSON before the app trusts it. Every problem is collected so
 * that a broken data file is reported precisely instead of silently ignored.
 */
export function validateLibrary(raw: unknown): RangeLibrary {
  const problems: string[] = [];
  if (!isObject(raw)) throw new RangeDataError(['le fichier ne contient pas un objet JSON']);
  if (raw.schemaVersion !== 1) problems.push(`schemaVersion non supportée : ${String(raw.schemaVersion)}`);
  if (!isObject(raw.source)) problems.push('source manquante');
  if (!Array.isArray(raw.ranges) || raw.ranges.length === 0) {
    problems.push('aucune range');
    throw new RangeDataError(problems);
  }
  const ids = new Set<string>();
  for (const [i, r] of raw.ranges.entries()) {
    const where = isObject(r) && typeof r.id === 'string' ? r.id : `ranges[${i}]`;
    if (!isObject(r)) {
      problems.push(`${where} : objet attendu`);
      continue;
    }
    if (typeof r.id !== 'string' || !r.id) problems.push(`${where} : id manquant`);
    else if (ids.has(r.id)) problems.push(`${where} : id dupliqué`);
    else ids.add(r.id);
    if (!FORMATS.includes(r.format as Format)) problems.push(`${where} : format inconnu`);
    if (!POSITIONS.includes(r.hero as Position)) problems.push(`${where} : position inconnue`);
    if (r.villain !== null && !POSITIONS.includes(r.villain as Position)) problems.push(`${where} : adversaire inconnu`);
    if (!SCENARIOS.includes(r.scenario as Scenario)) problems.push(`${where} : scénario inconnu`);
    if (typeof r.stackBb !== 'number' || r.stackBb <= 0) problems.push(`${where} : profondeur invalide`);
    if (!isObject(r.source) || typeof r.source.page !== 'number') problems.push(`${where} : page source manquante`);
    if (!Array.isArray(r.actions) || r.actions.length === 0) {
      problems.push(`${where} : aucune action`);
      continue;
    }
    const actionIds = new Set<string>();
    for (const a of r.actions) {
      if (!isObject(a) || typeof a.id !== 'string' || typeof a.label !== 'string') {
        problems.push(`${where} : action mal formée`);
        continue;
      }
      if (actionIds.has(a.id)) problems.push(`${where} : action ${a.id} dupliquée`);
      actionIds.add(a.id);
    }
    if (!isObject(r.hands)) {
      problems.push(`${where} : mains manquantes`);
      continue;
    }
    const handKeys = Object.keys(r.hands);
    for (const h of handKeys) if (!isHand(h)) problems.push(`${where} : main inconnue ${h}`);
    for (const h of ALL_HANDS) {
      const strat = r.hands[h];
      if (!isObject(strat)) {
        problems.push(`${where} : main ${h} absente`);
        continue;
      }
      let sum = 0;
      for (const [aid, f] of Object.entries(strat)) {
        if (!actionIds.has(aid)) problems.push(`${where} ${h} : action ${aid} absente de la légende`);
        if (typeof f !== 'number' || !(f > 0) || f > 1 + EPSILON) problems.push(`${where} ${h} : fréquence invalide ${String(f)}`);
        else sum += f;
      }
      if (Math.abs(sum - 1) > 1e-3) problems.push(`${where} ${h} : fréquences totales ${sum.toFixed(3)} ≠ 1`);
    }
  }
  if (problems.length) throw new RangeDataError(problems);
  return raw as unknown as RangeLibrary;
}

export function situationType(scenario: Scenario): SituationType {
  switch (scenario) {
    case 'open':
      return 'open';
    case 'vs-minraise':
    case 'vs-open':
      return 'vs-raise';
    case 'vs-shove':
      return 'vs-shove';
    case 'vs-limp':
      return 'vs-limp';
  }
}

/** Actions of a hand with the highest frequency (several when tied). */
export function topActions(strategy: Strategy): string[] {
  const max = Math.max(...Object.values(strategy));
  return Object.entries(strategy)
    .filter(([, f]) => Math.abs(f - max) < EPSILON)
    .map(([a]) => a);
}

export function isMixed(strategy: Strategy): boolean {
  return Object.values(strategy).filter((f) => f > EPSILON).length > 1;
}

export function frequencyOf(strategy: Strategy, actionId: string | null): number {
  if (actionId === null) return 0;
  return strategy[actionId] ?? 0;
}

/**
 * Hands whose main action differs from at least one grid neighbour, or whose
 * strategy is mixed. These are the hands that are easy to confuse.
 */
export function boundaryHands(range: RangeDef): Set<string> {
  const main = (h: string) => topActions(range.hands[h] ?? {}).sort().join('|');
  const out = new Set<string>();
  for (const h of ALL_HANDS) {
    const strat = range.hands[h];
    if (!strat) continue;
    if (isMixed(strat) || gridNeighbours(h).some((n) => main(n) !== main(h))) out.add(h);
  }
  return out;
}

export interface ActionShare {
  actionId: string;
  hands: number;
  /** Weighted number of combos (frequency × combos). */
  combos: number;
  /** Share of the 1326 combos. */
  share: number;
}

export function actionShares(range: RangeDef): ActionShare[] {
  return range.actions.map((a) => {
    let hands = 0;
    let c = 0;
    for (const h of ALL_HANDS) {
      const f = range.hands[h]?.[a.id] ?? 0;
      if (f > 0) hands += 1;
      c += f * combos(h);
    }
    return { actionId: a.id, hands, combos: c, share: c / 1326 };
  });
}

export class Library {
  readonly byId: Map<string, RangeDef>;
  readonly boundaries = new Map<string, Set<string>>();

  constructor(readonly data: RangeLibrary) {
    this.byId = new Map(data.ranges.map((r) => [r.id, r]));
  }

  get ranges(): RangeDef[] {
    return this.data.ranges;
  }

  get(id: string): RangeDef | undefined {
    return this.byId.get(id);
  }

  require(id: string): RangeDef {
    const r = this.byId.get(id);
    if (!r) throw new Error(`Range inconnue : ${id}`);
    return r;
  }

  boundary(id: string): Set<string> {
    let b = this.boundaries.get(id);
    if (!b) {
      b = boundaryHands(this.require(id));
      this.boundaries.set(id, b);
    }
    return b;
  }

  /** Other stack depths of the same spot (same format, positions and spot id). */
  siblings(range: RangeDef): RangeDef[] {
    return this.ranges
      .filter((r) => r.format === range.format && r.spot === range.spot)
      .sort((a, b) => b.stackBb - a.stackBb);
  }

  hasMixedStrategies(): boolean {
    return this.ranges.some((r) => Object.values(r.hands).some(isMixed));
  }
}
