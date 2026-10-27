import { describe, expect, it } from 'vitest';
import { grade } from '../src/domain/grading';
import { choiceLabel, describeLine, heroAct, heroOptions, lineChoice, makeMove, pot, startHand, type HandState } from '../src/domain/play';
import { seededRng } from '../src/domain/rng';
import { realLibrary, syntheticLibrary } from './fixtures';

type Press = ['fold'] | ['call'] | ['raise', number] | ['max'];

function expectedFor(rangeId: string, hand: string, lib = realLibrary) {
  return grade(lib.require(rangeId).hands[hand]!, null, 'tolerant').accepted;
}

/** Plays a sequence of button presses; stops when the hand is over. */
function play(rangeId: string, hand: string, presses: Press[], seed = 1, lib = realLibrary): HandState {
  const range = lib.require(rangeId);
  const rng = seededRng(seed);
  let s = startHand(range, expectedFor(rangeId, hand, lib), rng);
  for (const p of presses) {
    if (s.status === 'done') break;
    const move =
      p[0] === 'fold' ? makeMove(s, 'fold') : p[0] === 'call' ? makeMove(s, 'checkOrCall') : p[0] === 'max' ? makeMove(s, 'raise', Infinity) : makeMove(s, 'raise', p[1]);
    s = heroAct(range, s, move, rng).next;
  }
  return s;
}

describe('table set-up', () => {
  it('BTN 25 BB: blinds posted, pot 1,5 BB, first to act', () => {
    const s = startHand(realLibrary.require('3max-btn-open-25'), ['fold'], seededRng(1));
    expect(s.seats.map((x) => [x.position, x.bet])).toEqual([
      ['BTN', 0],
      ['SB', 0.5],
      ['BB', 1],
    ]);
    expect(pot(s)).toBe(1.5);
    const o = heroOptions(s);
    expect(o).toMatchObject({ toCall: 1, canCheck: false, canRaise: true, minTo: 2, maxTo: 25, presetTo: 3, presetLabel: '3 BB' });
    expect(o.potTo).toBe(3.5); // 1 + 1,5 + 1
  });

  it('SB vs BTN 25 BB: the button minraises to 2 BB', () => {
    const s = startHand(realLibrary.require('3max-sb-vs-btn-25'), ['fold'], seededRng(1));
    expect(s.seats.find((x) => x.position === 'BTN')).toMatchObject({ bet: 2, action: 'Relance à 2 BB' });
    expect(heroOptions(s)).toMatchObject({ toCall: 1.5, minTo: 3, presetTo: 6, presetLabel: '3×' });
  });

  it('BB vs SB: the SB opens to 3 BB at 25 BB and 2 BB at 15 BB, the button folds', () => {
    const s25 = startHand(realLibrary.require('3max-bb-vs-sb-25'), ['fold'], seededRng(1));
    expect(s25.seats.find((x) => x.position === 'SB')!.bet).toBe(3);
    expect(s25.seats.find((x) => x.position === 'BTN')!.folded).toBe(true);
    expect(startHand(realLibrary.require('3max-bb-vs-sb-15'), ['fold'], seededRng(1)).seats.find((x) => x.position === 'SB')!.bet).toBe(2);
  });

  it('shove and limp scenarios', () => {
    const shove = startHand(realLibrary.require('hu-bb-8'), ['call'], seededRng(1));
    expect(heroOptions(shove)).toMatchObject({ toCall: 7, callIsAllIn: true, canRaise: false });
    const limp = startHand(realLibrary.require('hu-bb-12'), ['check'], seededRng(1));
    expect(heroOptions(limp)).toMatchObject({ toCall: 0, canCheck: true, minTo: 2 });
  });
});

describe('BTN 25 BB: plays to the end of the action', () => {
  it('Fold hand (72o): folding is right, raising is wrong', () => {
    expect(play('3max-btn-open-25', '72o', [['fold']]).correct).toBe(true);
    const s = play('3max-btn-open-25', '72o', [['raise', 2]]);
    expect(s.status).toBe('done');
    expect(s.correct).toBe(false);
    expect(lineChoice(realLibrary.require('3max-btn-open-25'), s)).toBe('line:Relance à 2 BB');
  });

  it('Minraise / Fold (A8s): raise to 2 BB, a blind raises to 6 BB, folding is right', () => {
    const range = realLibrary.require('3max-btn-open-25');
    const rng = seededRng(3);
    let s = startHand(range, expectedFor('3max-btn-open-25', 'A8s'), rng);
    s = heroAct(range, s, makeMove(s, 'raise', 2), rng).next;
    expect(s.status).toBe('hero');
    expect(s.reactions).toHaveLength(1);
    expect(s.reactions[0]).toMatchObject({ kind: 'raise', to: 6 });
    expect(['SB', 'BB']).toContain(s.reactions[0]!.by);
    expect(s.seats.filter((x) => !x.hero && x.folded)).toHaveLength(1);
    const done = heroAct(range, s, makeMove(s, 'fold'), rng).next;
    expect(done.correct).toBe(true);
    expect(lineChoice(range, done)).toBe('minraise-fold');
    expect(describeLine(done)).toMatch(/^Relance à 2 BB → (SB|BB) relance à 6 BB → Passer$/);
  });

  it('Minraise / Call (AJo): calling the 6 BB raise is right, folding it is wrong', () => {
    expect(play('3max-btn-open-25', 'AJo', [['raise', 2], ['call']]).correct).toBe(true);
    const wrong = play('3max-btn-open-25', 'AJo', [['raise', 2], ['fold']]);
    expect(wrong.correct).toBe(false);
    expect(lineChoice(realLibrary.require('3max-btn-open-25'), wrong)).toBe('minraise-fold');
  });

  it('a wrong size or a shove is wrong', () => {
    expect(play('3max-btn-open-25', 'AJo', [['raise', 3]]).correct).toBe(false);
    expect(play('3max-btn-open-25', 'AJo', [['max']]).correct).toBe(false);
    expect(play('3max-btn-open-25', 'AJo', [['call']]).correct).toBe(false); // limp
  });

  it('Open shove at 15 BB: Max is right', () => {
    const s = play('3max-btn-open-15', 'A6s', [['max']]);
    expect(s.correct).toBe(true);
    expect(s.decisions[0]!.move).toEqual({ kind: 'allin', to: 15 });
  });
});

describe('SB vs BTN 25 BB (3-way)', () => {
  const hands = Object.entries(realLibrary.require('3max-sb-vs-btn-25').hands);
  const handFor = (action: string) => hands.find(([, s]) => s[action] === 1)![0];

  it('3bet non all-in / Call: 3bet, the button shoves, calling is right', () => {
    const range = realLibrary.require('3max-sb-vs-btn-25');
    const hand = handFor('3bet-nai-call');
    const rng = seededRng(2);
    let s = startHand(range, expectedFor(range.id, hand), rng);
    s = heroAct(range, s, makeMove(s, 'raise', 6), rng).next;
    expect(s.reactions[0]).toMatchObject({ by: 'BTN', kind: 'allin', to: 25 });
    expect(s.seats.find((x) => x.position === 'BB')!.folded).toBe(true);
    expect(heroOptions(s)).toMatchObject({ callIsAllIn: true, canRaise: false });
    expect(heroAct(range, s, makeMove(s, 'checkOrCall'), rng).next.correct).toBe(true);
  });

  it('3bet non all-in / Fold: same line, folding is right; any non all-in size is accepted', () => {
    const hand = handFor('3bet-nai-fold');
    expect(play('3max-sb-vs-btn-25', hand, [['raise', 5], ['fold']]).correct).toBe(true);
    expect(play('3max-sb-vs-btn-25', hand, [['raise', 9], ['call']]).correct).toBe(false);
  });

  it('single-decision plans', () => {
    expect(play('3max-sb-vs-btn-25', handFor('3bet-allin'), [['max']]).correct).toBe(true);
    expect(play('3max-sb-vs-btn-25', handFor('call'), [['call']]).correct).toBe(true);
    expect(play('3max-sb-vs-btn-25', handFor('fold'), [['fold']]).correct).toBe(true);
    expect(play('3max-sb-vs-btn-25', handFor('3bet-allin'), [['raise', 6]]).correct).toBe(false);
  });
});

describe('limp lines', () => {
  it('SB vs BB 25 BB "Limp/call vs 3bet, fold sinon": call a 3-5 BB raise, fold to a shove', () => {
    const range = realLibrary.require('3max-sb-open-25');
    const hand = Object.entries(range.hands).find(([, s]) => s['limp-call-vs-3bet'] === 1)![0];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seededRng(seed);
      let s = startHand(range, expectedFor(range.id, hand), rng);
      expect(heroOptions(s).toCall).toBe(0.5);
      s = heroAct(range, s, makeMove(s, 'checkOrCall'), rng).next;
      const r = s.reactions[0]!;
      expect(r.by).toBe('BB');
      seen.add(r.kind);
      if (r.kind === 'raise') {
        expect(r.to).toBeGreaterThanOrEqual(3);
        expect(r.to).toBeLessThanOrEqual(5);
        expect(heroAct(range, s, makeMove(s, 'checkOrCall'), rng).next.correct).toBe(true);
        expect(heroAct(range, s, makeMove(s, 'fold'), rng).next.correct).toBe(false);
      } else {
        expect(heroAct(range, s, makeMove(s, 'fold'), rng).next.correct).toBe(true);
        expect(heroAct(range, s, makeMove(s, 'checkOrCall'), rng).next.correct).toBe(false);
      }
    }
    expect(seen).toEqual(new Set(['raise', 'allin']));
  });

  it('HU SB: Limp / Fold folds to the 2,5 BB raise; Limp / Reraise re-raises', () => {
    const range = realLibrary.require('hu-sb-15');
    const handOf = (a: string) => Object.entries(range.hands).find(([, s]) => s[a] === 1)![0];
    const s = play('hu-sb-15', handOf('limp-fold'), [['call']]);
    expect(s.reactions[0]).toMatchObject({ by: 'BB', kind: 'raise', to: 2.5 });
    expect(play('hu-sb-15', handOf('limp-fold'), [['call'], ['fold']]).correct).toBe(true);
    expect(play('hu-sb-15', handOf('limp-reraise'), [['call'], ['max']]).correct).toBe(true);
    expect(play('hu-sb-15', handOf('limp-reraise'), [['call'], ['call']]).correct).toBe(false);
  });

  it('HU BB vs limp: check back with "Parole", iso then call the shove', () => {
    const range = realLibrary.require('hu-bb-12');
    const handOf = (a: string) => Object.entries(range.hands).find(([, s]) => s[a] === 1)![0];
    expect(play('hu-bb-12', handOf('check'), [['call']]).correct).toBe(true);
    const iso = play('hu-bb-12', handOf('iso-call'), [['raise', 4]]);
    expect(iso.reactions[0]).toMatchObject({ kind: 'allin', to: 12 });
    expect(play('hu-bb-12', handOf('iso-call'), [['raise', 4], ['call']]).correct).toBe(true);
    expect(play('hu-bb-12', handOf('iso-allin'), [['max']]).correct).toBe(true);
  });
});

describe('profile-dependent hands and labels', () => {
  it('accepts calling or folding, recorded as "Profil dépendant"', () => {
    const range = realLibrary.require('hu-bb-8');
    for (const press of [['call'], ['fold']] as Press[]) {
      const s = play('hu-bb-8', 'K7s', [press]);
      expect(s.correct).toBe(true);
      expect(lineChoice(range, s)).toBe('profile-dependent');
    }
  });

  it('labels a recorded choice', () => {
    const range = realLibrary.require('3max-btn-open-25');
    expect(choiceLabel(range, 'minraise-call')).toBe('Minraise / Call');
    expect(choiceLabel(range, 'line:Relance à 3 BB')).toBe('Relance à 3 BB');
    expect(choiceLabel(range, null)).toBe('Temps écoulé');
  });

  it('mixed strategies: both second decisions are accepted under the tolerant rule', () => {
    const lib = syntheticLibrary();
    const range = lib.require('test-mixed');
    range.hands['AKo'] = { 'minraise-call': 0.5, fold: 0.5 } as never;
    const rng = seededRng(1);
    const exp = grade(range.hands['AKo']!, null, 'tolerant').accepted;
    let s = startHand(range, exp, rng);
    s = heroAct(range, s, makeMove(s, 'raise', 2), rng).next;
    expect(heroAct(range, s, makeMove(s, 'checkOrCall'), rng).next.correct).toBe(true);
    expect(play('test-mixed', 'AKs', [['max']], 1, lib).correct).toBe(true); // 40 % shove
  });
});

describe('every hand of the document, played at the table', () => {
  type Key = 'fold' | 'call' | 'min' | 'preset' | 'max';
  const FIRST: Record<string, Key> = {
    fold: 'fold',
    check: 'call',
    call: 'call',
    'profile-dependent': 'call',
    shove: 'max',
    '3bet-allin': 'max',
    'iso-allin': 'max',
    'minraise-fold': 'min',
    'minraise-call': 'min',
    'raise3x-fold': 'preset',
    'raise3x-call': 'preset',
    '3bet-nai-fold': 'min',
    '3bet-nai-call': 'min',
    'iso-fold': 'min',
    'iso-call': 'min',
    'limp-fold': 'call',
    'limp-call': 'call',
    'limp-reraise': 'call',
    'limp-reraise-vs-2.5x': 'call',
    'limp-call-vs-3bet': 'call',
    'limp-call-vs-2.5x': 'call',
  };
  const SECOND: Record<string, (reaction: 'raise' | 'allin') => Key> = {
    'minraise-fold': () => 'fold',
    'minraise-call': () => 'call',
    'raise3x-fold': () => 'fold',
    'raise3x-call': () => 'call',
    '3bet-nai-fold': () => 'fold',
    '3bet-nai-call': () => 'call',
    'iso-fold': () => 'fold',
    'iso-call': () => 'call',
    'limp-fold': () => 'fold',
    'limp-call': () => 'call',
    'limp-reraise': () => 'max',
    'limp-reraise-vs-2.5x': () => 'max',
    'limp-call-vs-3bet': (r) => (r === 'allin' ? 'fold' : 'call'),
    'limp-call-vs-2.5x': (r) => (r === 'allin' ? 'fold' : 'call'),
  };

  function press(s: HandState, k: Key) {
    const o = heroOptions(s);
    if (k === 'fold') return makeMove(s, 'fold');
    if (k === 'call') return makeMove(s, 'checkOrCall');
    return makeMove(s, 'raise', k === 'min' ? o.minTo : k === 'preset' ? o.presetTo : o.maxTo);
  }

  /** Plays the plan of `actionId` the way a player would press the buttons. */
  function playPlan(rangeId: string, hand: string, actionId: string, seed: number): HandState {
    const range = realLibrary.require(rangeId);
    const rng = seededRng(seed);
    let s = startHand(range, expectedFor(rangeId, hand), rng);
    s = heroAct(range, s, press(s, FIRST[actionId]!), rng).next;
    const second = SECOND[actionId];
    if (s.status === 'hero' && second) s = heroAct(range, s, press(s, second(s.reactions[0]!.kind)), rng).next;
    return s;
  }

  it('every legend action of the document has a table plan', () => {
    for (const r of realLibrary.data.ranges) for (const a of r.actions) expect(FIRST[a.id], `${r.id} ${a.id}`).toBeDefined();
  });

  it('playing the reference plan is right for all 3042 hands (several opponent answers)', () => {
    let checked = 0;
    for (const r of realLibrary.data.ranges) {
      for (const [hand, strategy] of Object.entries(r.hands)) {
        for (const id of Object.keys(strategy)) {
          for (const seed of [1, 2, 3]) {
            const s = playPlan(r.id, hand, id, seed);
            expect(s.status, `${r.id} ${hand} ${id}`).toBe('done');
            expect(s.correct, `${r.id} ${hand} ${id}: ${describeLine(s)}`).toBe(true);
            const choice = lineChoice(r, s);
            expect(grade(strategy, choice, 'tolerant').correct, `${r.id} ${hand} ${choice}`).toBe(true);
          }
          checked++;
        }
      }
    }
    expect(checked).toBe(3042);
  });

  it('a first decision that no reference plan starts with is wrong', () => {
    for (const r of realLibrary.data.ranges) {
      for (const [hand, strategy] of Object.entries(r.hands)) {
        const expected = Object.keys(strategy);
        const firsts = new Set(expected.map((id) => FIRST[id]));
        if (expected.includes('profile-dependent')) firsts.add('fold'); // call or fold, by design
        for (const a of r.actions) {
          if (firsts.has(FIRST[a.id])) continue;
          const s = playPlan(r.id, hand, a.id, 7);
          expect(s.correct, `${r.id} ${hand} played ${a.id}`).toBe(false);
          expect(grade(strategy, lineChoice(r, s), 'tolerant').correct).toBe(false);
        }
      }
    }
  });
});
