import type { Rng } from './rng';
import type { Format, Position, RangeDef } from './types';

/**
 * Simulated preflop hand. The hero plays with real poker actions (fold,
 * check, call, raise to X, all-in) and the opponent "goes to the end of the
 * action": whenever the range plan has a second part ("Minraise / Call",
 * "3bet non all-in / Fold", "Limp / Reraise"…), the opponent plays the line
 * that forces the hero to make that second decision.
 *
 * Sizes (all in big blinds):
 * - minraise = raise to exactly 2 BB, "3x" = raise to exactly 3 BB;
 * - "3bet non all-in" / "Iso": any raise that is not all-in;
 * - opponent's raise after the hero's raise: 3 × the hero's raise (all-in if it exceeds the stack);
 * - opponent's 4-bet after the hero's non all-in 3-bet or iso: all-in;
 * - after a limp: 2.5 BB in heads-up, 3 to 5 BB in 3-max;
 * - "Limp/call vs 3bet, fold sinon": 3 to 5 BB (call expected) or all-in (fold expected);
 * - "Limp/call vs 2.5x, fold sinon": 2.5 BB (call expected) or all-in (fold expected).
 */

export type MoveKind = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface Move {
  kind: MoveKind;
  /** Hero's total bet after the move (BB). */
  to: number;
}

export interface Reaction {
  by: Position;
  kind: 'raise' | 'allin';
  to: number;
}

export interface PlaySeat {
  position: Position;
  name: string;
  hero: boolean;
  /** Starting stack (BB). */
  stack: number;
  /** Chips committed in the hand (BB). */
  bet: number;
  folded: boolean;
  dealer: boolean;
  /** Last action, shown next to the seat. */
  action: string | null;
}

interface Decision {
  move: Move;
  /** Highest bet the hero was facing. */
  facing: number;
  /** Hero's bet before deciding. */
  heroBet: number;
}

export interface HandState {
  format: Format;
  stackBb: number;
  /** Seats clockwise starting from the hero. */
  seats: PlaySeat[];
  currentBet: number;
  /** Size of the last raise increment (minimum re-raise). */
  lastRaise: number;
  decisions: Decision[];
  reactions: Reaction[];
  log: string[];
  status: 'hero' | 'done';
  /** Accepted plans for this hand (from the grading rule). */
  expected: string[];
  /** Plan the opponent is testing (chosen after the first decision). */
  target: string | null;
  correct: boolean | null;
}

// --- helpers ------------------------------------------------------------------

export const r2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

export function formatBB(n: number): string {
  return `${String(r2(n)).replace('.', ',')} BB`;
}

const NAMES = ['Nova', 'Orion', 'Kraken', 'Lynx', 'Atlas', 'Delta', 'Milo', 'Zéphyr', 'Ruby', 'Vega', 'Titan', 'Echo'];

function pickNames(rng: Rng, n: number): string[] {
  const pool = NAMES.slice();
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0] ?? `Joueur ${i + 2}`);
  return out;
}

export function hero(s: HandState): PlaySeat {
  return s.seats[0]!;
}

function seat(s: HandState, p: Position): PlaySeat {
  const found = s.seats.find((x) => x.position === p);
  if (!found) throw new Error(`Siège ${p} absent`);
  return found;
}

export function pot(s: HandState): number {
  return r2(s.seats.reduce((t, x) => t + x.bet, 0));
}

function clone(s: HandState): HandState {
  return { ...s, seats: s.seats.map((x) => ({ ...x })), decisions: [...s.decisions], reactions: [...s.reactions], log: [...s.log] };
}

/** Puts chips in front of a seat ("raise to" semantics). */
function betTo(s: HandState, p: Position, to: number, label: string) {
  const x = seat(s, p);
  const amount = Math.min(to, x.stack);
  if (amount > s.currentBet) {
    s.lastRaise = Math.max(s.lastRaise, r2(amount - s.currentBet));
    s.currentBet = r2(amount);
  }
  x.bet = r2(amount);
  x.action = label;
  s.log.push(`${x.position} : ${label}`);
}

function fold(s: HandState, p: Position) {
  const x = seat(s, p);
  x.folded = true;
  x.action = 'Passe';
  s.log.push(`${x.position} : passe`);
}

/** Opener's raise size in "vs open raise" spots (sizes used by the SB ranges of the document). */
export function openSize(stackBb: number): number {
  return stackBb >= 20 ? 3 : 2;
}

// --- hand start -------------------------------------------------------------------

/** Deals the table: blinds posted, actions before the hero applied from the range scenario. */
export function startHand(range: RangeDef, expected: string[], rng: Rng): HandState {
  const order: Position[] = range.format === 'hu' ? (range.hero === 'SB' ? ['SB', 'BB'] : ['BB', 'SB']) : rotate(['BTN', 'SB', 'BB'], range.hero);
  const names = pickNames(rng, order.length - 1);
  const s: HandState = {
    format: range.format,
    stackBb: range.stackBb,
    seats: order.map((p, i) => ({
      position: p,
      name: i === 0 ? 'Toi' : names[i - 1]!,
      hero: i === 0,
      stack: range.stackBb,
      bet: 0,
      folded: false,
      dealer: range.format === '3max' ? p === 'BTN' : p === 'SB',
      action: null,
    })),
    currentBet: 0,
    lastRaise: 1,
    decisions: [],
    reactions: [],
    log: [],
    status: 'hero',
    expected,
    target: null,
    correct: null,
  };
  betTo(s, 'SB', 0.5, 'SB 0,5');
  betTo(s, 'BB', 1, 'BB 1');
  seat(s, 'SB').action = null;
  seat(s, 'BB').action = null;
  s.lastRaise = 1;
  s.log = ['Blindes 0,5 / 1 BB'];

  const villain = range.villain;
  // Players acting before the hero (3-max preflop order: BTN, SB, BB).
  if (range.format === '3max') {
    const preflop: Position[] = ['BTN', 'SB', 'BB'];
    for (const p of preflop.slice(0, preflop.indexOf(range.hero))) {
      if (p === villain && range.scenario !== 'open') applyVillainOpen(s, range, p);
      else fold(s, p);
    }
  } else if (range.hero === 'BB' && villain) {
    applyVillainOpen(s, range, villain);
  }
  return s;
}

function rotate(order: Position[], first: Position): Position[] {
  const i = order.indexOf(first);
  return [...order.slice(i), ...order.slice(0, i)];
}

function applyVillainOpen(s: HandState, range: RangeDef, p: Position) {
  switch (range.scenario) {
    case 'vs-minraise':
      betTo(s, p, 2, 'Relance à 2 BB');
      break;
    case 'vs-open': {
      const size = openSize(range.stackBb);
      betTo(s, p, size, `Relance à ${formatBB(size)}`);
      break;
    }
    case 'vs-shove':
      betTo(s, p, seat(s, p).stack, 'Tapis');
      break;
    case 'vs-limp':
      betTo(s, p, 1, 'Limp');
      break;
    default:
      break;
  }
}

// --- hero options ---------------------------------------------------------------------

export interface HeroOptions {
  toCall: number;
  canCheck: boolean;
  callIsAllIn: boolean;
  canRaise: boolean;
  minTo: number;
  maxTo: number;
  /** Pot-sized raise. */
  potTo: number;
  /** Second preset: 3 BB when nobody raised yet, else 3 × the current bet. */
  presetTo: number;
  presetLabel: string;
}

export function heroOptions(s: HandState): HeroOptions {
  const h = hero(s);
  const toCall = r2(Math.max(0, Math.min(s.currentBet, h.stack) - h.bet));
  const maxTo = h.stack;
  const opponentsCanAct = s.seats.some((x) => !x.hero && !x.folded && x.bet < x.stack);
  const canRaise = s.currentBet < maxTo && opponentsCanAct;
  const clamp = (v: number) => r2(Math.min(maxTo, Math.max(minTo, v)));
  const minTo = r2(Math.min(maxTo, s.currentBet + Math.max(s.lastRaise, 1)));
  const unraised = near(s.currentBet, 1);
  return {
    toCall,
    canCheck: toCall === 0,
    callIsAllIn: h.bet + toCall >= h.stack,
    canRaise,
    minTo,
    maxTo,
    potTo: clamp(s.currentBet + pot(s) + toCall),
    presetTo: clamp(unraised ? 3 : 3 * s.currentBet),
    presetLabel: unraised ? '3 BB' : '3×',
  };
}

/** Builds the move for a button press (raise amounts are clamped to the legal range). */
export function makeMove(s: HandState, kind: 'fold' | 'checkOrCall' | 'raise', raiseTo = 0): Move {
  const o = heroOptions(s);
  const h = hero(s);
  if (kind === 'fold') return { kind: 'fold', to: h.bet };
  if (kind === 'checkOrCall') return o.canCheck ? { kind: 'check', to: h.bet } : { kind: 'call', to: r2(h.bet + o.toCall) };
  const to = r2(Math.min(o.maxTo, Math.max(o.minTo, raiseTo)));
  return to >= o.maxTo ? { kind: 'allin', to: o.maxTo } : { kind: 'raise', to };
}

// --- plans --------------------------------------------------------------------------------

interface Ctx {
  facing: number;
  heroBet: number;
  format: Format;
}

interface ReactionSpec {
  kind: 'raise' | 'allin';
  to?: number;
}

export interface Plan {
  first: (m: Move, c: Ctx) => boolean;
  react?: (m: Move, c: Ctx, rng: Rng) => ReactionSpec;
  second?: (m: Move, r: Reaction) => boolean;
  /** Short description of the expected line, with sizes. */
  line: string;
}

const FOLD = (m: Move) => m.kind === 'fold';
const CALL = (m: Move) => m.kind === 'call';
const CHECK = (m: Move) => m.kind === 'check';
const ALLIN = (m: Move) => m.kind === 'allin';
const RAISE_ANY = (m: Move) => m.kind === 'raise' || m.kind === 'allin';
const NAI = (m: Move) => m.kind === 'raise';
const RAISE_TO = (n: number) => (m: Move) => m.kind === 'raise' && near(m.to, n);
/** Completing the blind (or calling 1 BB) when nobody raised. */
const LIMP = (m: Move, c: Ctx) => m.kind === 'call' && near(c.facing, 1);

const R3X: Plan['react'] = (m) => ({ kind: 'raise', to: 3 * m.to });
const SHOVE: Plan['react'] = () => ({ kind: 'allin' });
const LIMP_RAISE: Plan['react'] = (_m, c, rng) => ({ kind: 'raise', to: c.format === 'hu' ? 2.5 : 3 + Math.floor(rng() * 5) * 0.5 });
const SPLIT = (raiseTo: (c: Ctx, rng: Rng) => number): Plan['react'] => (_m, c, rng) => (rng() < 0.65 ? { kind: 'raise', to: raiseTo(c, rng) } : { kind: 'allin' });
const CALL_IF_RAISE_FOLD_IF_ALLIN = (m: Move, r: Reaction) => (r.kind === 'allin' ? FOLD(m) : CALL(m));

const PLANS: Record<string, Plan> = {
  fold: { first: FOLD, line: 'Passer' },
  check: { first: CHECK, line: 'Parole' },
  call: { first: CALL, line: 'Suivre' },
  'profile-dependent': { first: (m) => CALL(m) || FOLD(m), line: 'Suivre ou passer (selon le profil)' },
  shove: { first: ALLIN, line: 'Tapis' },
  '3bet-allin': { first: ALLIN, line: 'Tapis (3bet all-in)' },
  'iso-allin': { first: ALLIN, line: 'Tapis sur le limp' },
  'minraise-fold': { first: RAISE_TO(2), react: R3X, second: FOLD, line: 'Relancer à 2 BB, puis passer sur la relance' },
  'minraise-call': { first: RAISE_TO(2), react: R3X, second: CALL, line: 'Relancer à 2 BB, puis suivre la relance' },
  'raise3x-fold': { first: RAISE_TO(3), react: R3X, second: FOLD, line: 'Relancer à 3 BB, puis passer sur la relance' },
  'raise3x-call': { first: RAISE_TO(3), react: R3X, second: CALL, line: 'Relancer à 3 BB, puis suivre la relance' },
  '3bet-nai-fold': { first: NAI, react: SHOVE, second: FOLD, line: 'Sur-relancer sans tapis, puis passer sur le tapis adverse' },
  '3bet-nai-call': { first: NAI, react: SHOVE, second: CALL, line: 'Sur-relancer sans tapis, puis suivre le tapis adverse' },
  'iso-fold': { first: NAI, react: SHOVE, second: FOLD, line: 'Relancer le limp (iso), puis passer sur le tapis' },
  'iso-call': { first: NAI, react: SHOVE, second: CALL, line: 'Relancer le limp (iso), puis suivre le tapis' },
  'limp-fold': { first: LIMP, react: LIMP_RAISE, second: FOLD, line: 'Limp, puis passer sur la relance' },
  'limp-call': { first: LIMP, react: LIMP_RAISE, second: CALL, line: 'Limp, puis suivre la relance' },
  'limp-reraise': { first: LIMP, react: LIMP_RAISE, second: RAISE_ANY, line: 'Limp, puis sur-relancer' },
  'limp-reraise-vs-2.5x': { first: LIMP, react: () => ({ kind: 'raise', to: 2.5 }), second: RAISE_ANY, line: 'Limp, puis sur-relancer la relance à 2,5 BB' },
  'limp-call-vs-3bet': {
    first: LIMP,
    react: SPLIT((_c, rng) => 3 + Math.floor(rng() * 5) * 0.5),
    second: CALL_IF_RAISE_FOLD_IF_ALLIN,
    line: 'Limp, suivre une relance de 3 à 5 BB, passer sur un tapis',
  },
  'limp-call-vs-2.5x': {
    first: LIMP,
    react: SPLIT(() => 2.5),
    second: CALL_IF_RAISE_FOLD_IF_ALLIN,
    line: 'Limp, suivre une relance à 2,5 BB, passer sur un tapis',
  },
};

/** Plan of a custom action, read from its label ("Raise / Call", "Limp / Fold", "Tapis"…). */
export function planFromLabel(label: string): Plan {
  const [a = '', b] = label.toLowerCase().split('/').map((x) => x.trim());
  const kindOf = (t: string): 'fold' | 'check' | 'allin' | 'limp' | 'call' | 'raise' | null => {
    if (/all.?in|shove|tapis|push/.test(t)) return 'allin';
    if (/^fold|passe|^fold sinon/.test(t)) return 'fold';
    if (/check|parole/.test(t)) return 'check';
    if (/limp|compl/.test(t)) return 'limp';
    if (/raise|relance|bet|iso|open|\dx/.test(t)) return 'raise';
    if (/call|suiv|pay/.test(t)) return 'call';
    return null;
  };
  const k1 = kindOf(a);
  const first: Plan['first'] =
    k1 === 'fold' ? FOLD : k1 === 'check' ? CHECK : k1 === 'allin' ? ALLIN : k1 === 'limp' ? LIMP : k1 === 'call' ? CALL : /min/.test(a) ? RAISE_TO(2) : NAI;
  if (b === undefined) return { first, line: label };
  const k2 = kindOf(b);
  const second: Plan['second'] = k2 === 'fold' ? FOLD : k2 === 'call' ? CALL : k2 === 'allin' || k2 === 'raise' ? RAISE_ANY : CALL;
  return { first, react: k1 === 'limp' ? LIMP_RAISE : R3X, second, line: label };
}

export function planFor(range: RangeDef, actionId: string): Plan {
  return PLANS[actionId] ?? planFromLabel(range.actions.find((a) => a.id === actionId)?.label ?? actionId);
}

// --- playing -----------------------------------------------------------------------------------

/** Who answers the hero's action; the other players fold before or after them, in preflop order. */
function responder(s: HandState, rng: Rng): { by: Position; before: Position[]; after: Position[] } {
  const others = s.seats.filter((x) => !x.hero && !x.folded);
  if (others.length === 1) return { by: others[0]!.position, before: [], after: [] };
  // Several players left: the one who opened keeps the action; otherwise one of the blinds at random.
  const opener = others.find((x) => x.bet > 1);
  const by = opener ? opener.position : others[Math.floor(rng() * others.length)]!.position;
  // Seats are stored clockwise from the hero, which is also the order of action after the hero.
  const rest = others.map((x) => x.position);
  const i = rest.indexOf(by);
  return { by, before: rest.slice(0, i), after: rest.slice(i + 1) };
}

function describeMove(m: Move, facing: number): string {
  switch (m.kind) {
    case 'fold':
      return 'Passer';
    case 'check':
      return 'Parole';
    case 'call':
      return near(facing, 1) ? 'Limp' : 'Suivre';
    case 'raise':
      return `Relance à ${formatBB(m.to)}`;
    case 'allin':
      return `Tapis (${formatBB(m.to)})`;
  }
}

/** Human description of the hero's line, opponent reactions included. */
export function describeLine(s: HandState): string {
  const parts: string[] = [];
  s.decisions.forEach((d, i) => {
    parts.push(describeMove(d.move, d.facing));
    const r = s.reactions[i];
    if (r) parts.push(`${r.by} ${r.kind === 'allin' ? 'fait tapis' : `relance à ${formatBB(r.to)}`}`);
  });
  return parts.join(' → ');
}

function planAccepts(plan: Plan, s: HandState): boolean {
  const [d1, d2] = s.decisions;
  if (!d1 || !plan.first(d1.move, { facing: d1.facing, heroBet: d1.heroBet, format: s.format })) return false;
  if (!plan.second) return s.decisions.length === 1;
  const r = s.reactions[0];
  return Boolean(d2 && r && plan.second(d2.move, r));
}

export interface HeroActResult {
  /** State right after the hero's move (before the opponent answers). */
  afterHero: HandState;
  /** Final state of this step: opponent's answer applied, or hand over. */
  next: HandState;
}

/**
 * Applies a hero decision. After the first decision, if an accepted plan has a
 * second part, the opponent answers so that the hero must make that decision.
 */
export function heroAct(range: RangeDef, state: HandState, move: Move, rng: Rng): HeroActResult {
  if (state.status !== 'hero') throw new Error('Ce n’est pas à toi de jouer');
  const s = clone(state);
  const h = hero(s);
  const ctx: Ctx = { facing: s.currentBet, heroBet: h.bet, format: s.format };
  s.decisions.push({ move, facing: s.currentBet, heroBet: h.bet });
  if (move.kind === 'fold') {
    h.folded = true;
    h.action = 'Passe';
    s.log.push('Toi : passe');
  } else if (move.kind === 'check') {
    h.action = 'Parole';
    s.log.push('Toi : parole');
  } else {
    betTo(s, h.position, move.to, describeMove(move, ctx.facing));
  }
  const afterHero = clone(s);

  const plans = s.expected.map((id) => ({ id, plan: planFor(range, id) }));
  if (s.decisions.length === 1) {
    const matching = plans.filter((p) => p.plan.first(move, ctx));
    const target = matching.find((p) => p.plan.react && p.plan.second) ?? matching[0];
    if (!target || !target.plan.react || !target.plan.second) {
      return { afterHero, next: finish(s, Boolean(target)) };
    }
    s.target = target.id;
    const spec = target.plan.react(move, ctx, rng);
    const { by, before, after } = responder(s, rng);
    for (const p of before) fold(s, p);
    const villain = seat(s, by);
    const all = spec.kind === 'allin' || (spec.to ?? 0) >= villain.stack;
    const to = all ? villain.stack : r2(spec.to ?? 0);
    betTo(s, by, to, all ? 'Tapis' : `Relance à ${formatBB(to)}`);
    for (const p of after) fold(s, p);
    s.reactions.push({ by, kind: all ? 'allin' : 'raise', to });
    s.status = 'hero';
    return { afterHero, next: s };
  }
  return { afterHero, next: finish(s, plans.some((p) => planAccepts(p.plan, s))) };
}

function finish(s: HandState, correct: boolean): HandState {
  s.status = 'done';
  s.correct = correct;
  return s;
}

/**
 * Legend action matching the hero's whole line (accepted plans first), or
 * "line:<description>" when the line matches no action of the range.
 */
export function lineChoice(range: RangeDef, s: HandState): string {
  const ids = [...s.expected, ...range.actions.map((a) => a.id).filter((id) => !s.expected.includes(id))];
  const match = ids.find((id) => planAccepts(planFor(range, id), s));
  return match ?? `line:${describeLine(s)}`;
}

/** Label of a recorded choice (legend action or played line). */
export function choiceLabel(range: RangeDef | undefined, choice: string | null): string {
  if (choice === null) return 'Temps écoulé';
  if (choice.startsWith('line:')) return choice.slice(5);
  return range?.actions.find((a) => a.id === choice)?.label ?? choice;
}
