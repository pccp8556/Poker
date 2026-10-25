/**
 * Presentation metadata of the canonical actions found in the ranges.
 * Colours are the app's own palette (consistent across every range), not the
 * colours of the source PDF.
 */
export interface ActionMeta {
  /** Sort key: answer buttons are grouped by first action (fold → call → limp → raise → all-in). */
  order: number;
  color: string;
  /** Short French explanation, faithful to the source label. */
  description: string;
}

// Assigned per action family, then stepped in lightness so that every pair of
// actions appearing together in a range stays distinguishable, including for
// colour-blind users (validated with OKLab ΔE ≥ 15 normal vision, ≥ 8 under
// protan/deutan simulation — see docs/DESIGN.md).
const PALETTE = {
  fold: '#2b3533',
  check: '#3e4a56',
  call: '#8cbcf2',
  raiseCall: '#199e70',
  raiseFold: '#f4a3a3',
  allIn: '#5a48c8',
  limpCall: '#005c00',
  limpFold: '#ecc94b',
  limpCond: '#d95926',
  limpRaise: '#97305a',
  special: '#d55181',
};

const META: Record<string, ActionMeta> = {
  fold: { order: 0, color: PALETTE.fold, description: 'Se coucher.' },
  check: { order: 1, color: PALETTE.check, description: 'Checker derrière, sans relancer.' },
  'profile-dependent': {
    order: 2,
    color: PALETTE.special,
    description:
      'Le document ne fixe pas d’action unique : la décision dépend du profil de l’adversaire.',
  },
  call: { order: 3, color: PALETTE.call, description: 'Payer (suivre la mise ou le tapis adverse).' },
  'limp-fold': {
    order: 10,
    color: PALETTE.limpFold,
    description: 'Compléter (limp), puis se coucher si l’adversaire relance.',
  },
  'limp-call-vs-3bet': {
    order: 11,
    color: PALETTE.limpCond,
    description: 'Compléter (limp), puis payer face à un 3bet ; se coucher dans les autres cas.',
  },
  'limp-call-vs-2.5x': {
    order: 11,
    color: PALETTE.limpCond,
    description: 'Compléter (limp), puis payer face à une relance à 2,5x ; se coucher dans les autres cas.',
  },
  'limp-call': {
    order: 12,
    color: PALETTE.limpCall,
    description: 'Compléter (limp), puis payer si l’adversaire relance.',
  },
  'limp-reraise': {
    order: 13,
    color: PALETTE.limpRaise,
    description: 'Compléter (limp), puis sur-relancer si l’adversaire relance.',
  },
  'limp-reraise-vs-2.5x': {
    order: 13,
    color: PALETTE.limpRaise,
    description: 'Compléter (limp), puis sur-relancer face à une relance à 2,5x.',
  },
  'minraise-fold': {
    order: 20,
    color: PALETTE.raiseFold,
    description: 'Relancer au minimum (2 BB), puis se coucher face à une relance.',
  },
  'minraise-call': {
    order: 21,
    color: PALETTE.raiseCall,
    description: 'Relancer au minimum (2 BB), puis payer face à une relance.',
  },
  'raise3x-fold': {
    order: 22,
    color: PALETTE.raiseFold,
    description: 'Relancer à 3 BB, puis se coucher face à une relance.',
  },
  'raise3x-call': {
    order: 23,
    color: PALETTE.raiseCall,
    description: 'Relancer à 3 BB, puis payer face à une relance.',
  },
  'iso-fold': {
    order: 24,
    color: PALETTE.raiseFold,
    description: 'Relancer le limp adverse (iso), puis se coucher face à une sur-relance.',
  },
  'iso-call': {
    order: 25,
    color: PALETTE.raiseCall,
    description: 'Relancer le limp adverse (iso), puis payer face à une sur-relance.',
  },
  '3bet-nai-fold': {
    order: 30,
    color: PALETTE.raiseFold,
    description: 'Sur-relancer sans faire tapis (3bet non all-in), puis se coucher face à une relance.',
  },
  '3bet-nai-call': {
    order: 31,
    color: PALETTE.raiseCall,
    description: 'Sur-relancer sans faire tapis (3bet non all-in), puis payer face à une relance.',
  },
  shove: { order: 40, color: PALETTE.allIn, description: 'Faire tapis directement (open shove).' },
  '3bet-allin': { order: 41, color: PALETTE.allIn, description: 'Sur-relancer à tapis (3bet all-in).' },
  'iso-allin': { order: 42, color: PALETTE.allIn, description: 'Relancer à tapis sur le limp adverse.' },
};

const FALLBACK: ActionMeta = { order: 50, color: '#8a8f98', description: '' };

export function actionMeta(id: string): ActionMeta {
  return META[id] ?? FALLBACK;
}

export function knownActionIds(): string[] {
  return Object.keys(META);
}

/** True for actions drawn as "neutral" cells in grids (fold / check). */
export function isPassive(id: string): boolean {
  return id === 'fold' || id === 'check';
}

export function sortActionIds(ids: readonly string[]): string[] {
  return ids.slice().sort((a, b) => actionMeta(a).order - actionMeta(b).order);
}

export const GLOSSARY: { term: string; definition: string }[] = [
  { term: 'BB', definition: 'Big blind (grosse blinde) ; les tapis sont exprimés en BB.' },
  { term: 'Minraise', definition: 'Relance minimale, à 2 BB.' },
  { term: '3x', definition: 'Relance à 3 BB.' },
  { term: 'Limp', definition: 'Compléter la blinde sans relancer.' },
  { term: 'Iso', definition: 'Relance d’isolation sur un limp adverse.' },
  { term: '3bet', definition: 'Sur-relance après une première relance.' },
  { term: 'NAI', definition: 'Non all-in : sur-relance qui ne met pas tout le tapis.' },
  { term: 'Open shove', definition: 'Faire tapis en premier dans le coup.' },
  { term: 'X / Y', definition: 'Plan en deux temps : action X, puis Y si l’adversaire relance.' },
];
