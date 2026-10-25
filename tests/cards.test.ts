import { describe, expect, it } from 'vitest';
import { ALL_HANDS, combos, dealHand, gridNeighbours, handAt, handKind, handPosition } from '../src/domain/cards';
import { seededRng } from '../src/domain/rng';

describe('cards', () => {
  it('lists 169 distinct hand classes totalling 1326 combos', () => {
    expect(ALL_HANDS).toHaveLength(169);
    expect(new Set(ALL_HANDS).size).toBe(169);
    expect(ALL_HANDS.reduce((s, h) => s + combos(h), 0)).toBe(1326);
  });

  it('places suited hands above the diagonal and offsuit below', () => {
    expect(handAt(0, 0)).toBe('AA');
    expect(handAt(0, 1)).toBe('AKs');
    expect(handAt(1, 0)).toBe('AKo');
    expect(handAt(12, 12)).toBe('22');
    expect(handAt(4, 12)).toBe('T2s');
  });

  it('handPosition is the inverse of handAt', () => {
    for (const h of ALL_HANDS) {
      const { row, col } = handPosition(h);
      expect(handAt(row, col)).toBe(h);
    }
  });

  it('returns grid neighbours inside the grid', () => {
    expect(gridNeighbours('AA').sort()).toEqual(['AKo', 'AKs'].sort());
    expect(gridNeighbours('JTs')).toHaveLength(4);
  });

  it('deals cards consistent with the hand kind', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 200; i++) {
      for (const h of ['AKs', 'AKo', 'QQ', '72o', '54s']) {
        const [a, b] = dealHand(h, rng);
        expect(a.rank + b.rank).toBe(h.slice(0, 2));
        if (handKind(h) === 'suited') expect(a.suit).toBe(b.suit);
        else expect(a.suit).not.toBe(b.suit);
      }
    }
  });
});
