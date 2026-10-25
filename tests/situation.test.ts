import { describe, expect, it } from 'vitest';
import { explain } from '../src/domain/explain';
import { actionBefore, questionPrompt, seatsFor } from '../src/domain/situation';
import { realLibrary } from './fixtures';

const r = (id: string) => realLibrary.require(id);

describe('situation context', () => {
  it('describes what happened before the hero acts', () => {
    expect(actionBefore(r('3max-btn-open-25'))).toBe('Vous êtes premier à parler');
    expect(actionBefore(r('3max-sb-vs-btn-25'))).toBe('BTN minraise (2 BB)');
    expect(actionBefore(r('3max-sb-vs-btn-10'))).toBe('BTN fait tapis');
    expect(actionBefore(r('3max-sb-open-15'))).toBe('BTN fold');
    expect(actionBefore(r('3max-bb-vs-sb-25'))).toBe('BTN fold · SB relance (open raise)');
    expect(actionBefore(r('3max-bb-vs-sb-10'))).toBe('BTN fold · SB fait tapis');
    expect(actionBefore(r('hu-sb-12'))).toBe('Vous êtes premier à parler');
    expect(actionBefore(r('hu-bb-12'))).toBe('SB complète (limp)');
    expect(actionBefore(r('hu-bb-8'))).toBe('SB fait tapis');
  });

  it('lays out seats starting from the hero', () => {
    const seats = seatsFor(r('3max-bb-vs-sb-25'));
    expect(seats.map((s) => [s.position, s.kind])).toEqual([
      ['BB', 'hero'],
      ['BTN', 'folded'],
      ['SB', 'raised'],
    ]);
    expect(seats.find((s) => s.dealer)?.position).toBe('BTN');
    const hu = seatsFor(r('hu-bb-12'));
    expect(hu.map((s) => [s.position, s.action])).toEqual([
      ['BB', null],
      ['SB', 'Limp'],
    ]);
    expect(hu.find((s) => s.dealer)?.position).toBe('SB');
  });

  it('mentions the button for the heads-up small blind', () => {
    expect(questionPrompt(r('hu-sb-15'))).toBe('Vous êtes SB (bouton), tapis 15 BB.');
    expect(questionPrompt(r('3max-sb-open-10'))).toBe('Vous êtes SB, tapis 10 BB.');
  });

  it('explains a hand with its reference action and other stack depths', () => {
    const e = explain(realLibrary, r('3max-btn-open-25'), 'A6s');
    expect(e.reference).toEqual([expect.objectContaining({ id: 'minraise-fold', frequency: 1 })]);
    expect(e.otherStacks.map((o) => [o.stackBb, o.actions[0]!.id, o.current])).toEqual([
      [25, 'minraise-fold', true],
      [15, 'shove', false],
      [10, 'shove', false],
    ]);
    expect(e.share).toMatch(/58 mains sur 169/);
  });
});
