export type Format = '3max' | 'hu';
export type Position = 'BTN' | 'SB' | 'BB';
/** What happened before the hero acts, as stated by the source document. */
export type Scenario = 'open' | 'vs-minraise' | 'vs-open' | 'vs-shove' | 'vs-limp';
/** Coarser grouping of scenarios, used for filters and statistics. */
export type SituationType = 'open' | 'vs-raise' | 'vs-shove' | 'vs-limp';

export interface ActionDef {
  /** Canonical id, shared by every range using the same action. */
  id: string;
  /** Normalised label shown in the app. */
  label: string;
  /** Label exactly as printed in the source document. */
  sourceLabel: string;
  /** Colour of the legend swatch in the source (traceability only). */
  sourceColor: string;
}

/** Action id -> frequency in (0, 1]. Frequencies of a hand sum to 1. */
export type Strategy = Record<string, number>;

export interface RangeDef {
  id: string;
  format: Format;
  spot: string;
  hero: Position;
  villain: Position | null;
  stackBb: number;
  scenario: Scenario;
  /** Title and subtitle as printed (e.g. "SB vs BTN", "vs minraise / open shove"). */
  title: string;
  subtitle: string;
  scenarioLabel: string | null;
  source: { page: number };
  /** Actions of the legend, in source order. */
  actions: ActionDef[];
  hands: Record<string, Strategy>;
}

export interface RangeLibrary {
  schemaVersion: number;
  source: { id: string; file: string; title: string; sha256: string; pages: number };
  ranges: RangeDef[];
}
