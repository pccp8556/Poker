import { situationType } from './library';
import type { Format, Position, RangeDef, SituationType } from './types';

export const FORMAT_LABEL: Record<Format, string> = { '3max': '3-max', hu: 'Heads-up' };

export const SITUATION_LABEL: Record<SituationType, string> = {
  open: 'Premier à parler',
  'vs-raise': 'Face à une relance',
  'vs-shove': 'Face à un tapis',
  'vs-limp': 'Face à un limp',
};

export const POSITION_LABEL: Record<Position, string> = {
  BTN: 'Bouton',
  SB: 'Small blind',
  BB: 'Big blind',
};

export interface SeatState {
  position: Position;
  hero: boolean;
  /** Short label of what this player did, if anything. */
  action: string | null;
  kind: 'hero' | 'folded' | 'raised' | 'allin' | 'limped' | 'waiting';
  dealer: boolean;
}

/** Seats of the table for the situation, in clockwise order starting from the hero. */
export function seatsFor(range: RangeDef): SeatState[] {
  const villainAction = (): Pick<SeatState, 'action' | 'kind'> => {
    switch (range.scenario) {
      case 'vs-minraise':
        return { action: 'Minraise', kind: 'raised' };
      case 'vs-open':
        return { action: 'Open raise', kind: 'raised' };
      case 'vs-shove':
        return { action: 'Tapis', kind: 'allin' };
      case 'vs-limp':
        return { action: 'Limp', kind: 'limped' };
      default:
        return { action: null, kind: 'waiting' };
    }
  };
  const seat = (position: Position, extra: Partial<SeatState> = {}): SeatState => ({
    position,
    hero: position === range.hero,
    action: null,
    kind: position === range.hero ? 'hero' : 'waiting',
    dealer: range.format === '3max' ? position === 'BTN' : position === 'SB',
    ...extra,
  });

  if (range.format === 'hu') {
    const other: Position = range.hero === 'SB' ? 'BB' : 'SB';
    const villain = range.hero === 'BB' ? villainAction() : {};
    return [seat(range.hero), seat(other, villain)];
  }
  // 3-max preflop order: BTN, SB, BB.
  const order: Position[] = ['BTN', 'SB', 'BB'];
  const heroIdx = order.indexOf(range.hero);
  const seats = order.map((p, i) => {
    if (p === range.hero) return seat(p);
    if (p === range.villain && range.scenario !== 'open') return seat(p, villainAction());
    // Players acting before the hero who are not the villain have folded.
    if (i < heroIdx) return seat(p, { action: 'Fold', kind: 'folded' });
    return seat(p);
  });
  return [...seats.slice(heroIdx), ...seats.slice(0, heroIdx)];
}

/** One-line description of the action before the hero, e.g. "BTN minraise". */
export function actionBefore(range: RangeDef): string {
  const folds = seatsFor(range).filter((s) => s.kind === 'folded').map((s) => `${s.position} fold`);
  const v = range.villain;
  const villain = (() => {
    switch (range.scenario) {
      case 'vs-minraise':
        return `${v} minraise (2 BB)`;
      case 'vs-open':
        return `${v} relance (open raise)`;
      case 'vs-shove':
        return `${v} fait tapis`;
      case 'vs-limp':
        return `${v} complète (limp)`;
      default:
        return null;
    }
  })();
  const parts = [...folds, ...(villain ? [villain] : [])];
  return parts.length ? parts.join(' · ') : 'Tu es premier à parler';
}

/** Format + spot description without repeating the format (e.g. "3-max · Open raise"). */
export function spotSubtitle(range: RangeDef): string {
  if (range.format === 'hu') return range.subtitle;
  return `${FORMAT_LABEL[range.format]} · ${range.subtitle.replace(/\s*·\s*3-max$/i, '')}`;
}

const POSITION_PHRASE: Record<Position, string> = {
  BTN: 'au bouton',
  SB: 'en small blind',
  BB: 'en big blind',
};

/** Sentence describing the spot, e.g. "Le BTN relance au minimum (2 BB). Tu es en small blind." */
export function situationSentence(range: RangeDef): string {
  const pos = range.format === 'hu' && range.hero === 'SB' ? 'en small blind (bouton)' : POSITION_PHRASE[range.hero];
  const prefix = range.format === 'hu' ? 'Heads-up : ' : '';
  const folds = seatsFor(range)
    .filter((s) => s.kind === 'folded')
    .map((s) => `le ${s.position} se couche`);
  const v = range.villain ? `${range.villain === 'BTN' ? 'le bouton' : range.villain === 'SB' ? 'la small blind' : 'la big blind'}` : '';
  const villain = (() => {
    switch (range.scenario) {
      case 'vs-minraise':
        return `${v} relance au minimum (2 BB)`;
      case 'vs-open':
        return `${v} relance`;
      case 'vs-shove':
        return `${v} fait tapis`;
      case 'vs-limp':
        return `${v} complète (limp)`;
      default:
        return null;
    }
  })();
  const before = [...folds, ...(villain ? [villain] : [])];
  if (!before.length) return `${prefix}${prefix ? 'tu' : 'Tu'} es ${pos}, premier à parler.`;
  const text = before.join(', ');
  return `${prefix}${prefix ? text : text.charAt(0).toUpperCase() + text.slice(1)}. Tu es ${pos}.`;
}

export function rangeShortName(range: RangeDef): string {
  return `${range.title} · ${range.stackBb} BB`;
}

export function rangeLongName(range: RangeDef): string {
  return `${FORMAT_LABEL[range.format]} · ${range.title} · ${range.stackBb} BB`;
}

export function rangeSituation(range: RangeDef): SituationType {
  return situationType(range.scenario);
}

/** Human description of the spot used in the question header. */
export function questionPrompt(range: RangeDef): string {
  const pos = range.format === 'hu' && range.hero === 'SB' ? 'SB (bouton)' : range.hero;
  return `Tu es ${pos}, tapis ${range.stackBb} BB.`;
}
