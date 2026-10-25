import { describe, expect, it } from 'vitest';
import { ALL_HANDS } from '../src/domain/cards';
import { formatRangeNotation, parseRangeNotation } from '../src/domain/notation';

const parse = (t: string) => parseRangeNotation(t).hands;

describe('range notation', () => {
  it('parses single hands, case-insensitive, in any rank order', () => {
    expect(parse('AA, aks, KAo, 10 9s')).toEqual(['AA', 'AKs', 'AKo']);
    expect(parseRangeNotation('10 9s').errors).toEqual(['10', '9s']);
    expect(parse('T9s')).toEqual(['T9s']);
    expect(parse('109s')).toEqual(['T9s']);
  });

  it('expands a non-pair without suffix to both suited and offsuit', () => {
    expect(parse('QJ').sort()).toEqual(['QJo', 'QJs']);
  });

  it('expands pair and kicker "+" notations', () => {
    expect(parse('99+')).toEqual(['AA', 'KK', 'QQ', 'JJ', 'TT', '99']);
    expect(parse('A2s+')).toHaveLength(12);
    expect(parse('KTo+').sort()).toEqual(['KJo', 'KQo', 'KTo']);
    expect(parse('AK+').sort()).toEqual(['AKo', 'AKs']);
  });

  it('expands intervals', () => {
    expect(parse('99-66').sort()).toEqual(['66', '77', '88', '99']);
    expect(parse('A5s-A2s').sort()).toEqual(['A2s', 'A3s', 'A4s', 'A5s']);
  });

  it('reports invalid tokens without inventing hands', () => {
    const r = parseRangeNotation('AKx, 99-A5s, KQs-JTs, ZZ');
    expect(r.hands).toEqual([]);
    expect(r.errors).toEqual(['AKx', '99-A5s', 'KQs-JTs', 'ZZ']);
  });

  it('formats a set back into compact notation (round trip)', () => {
    const samples = ['22+, A2s+, KTo+, QJs', '99-66, A5s-A2s, T9s, 87o', 'AA', ''];
    for (const s of samples) {
      const hands = parse(s);
      expect(parse(formatRangeNotation(hands))).toEqual(hands);
    }
    expect(formatRangeNotation(parse('22+'))).toBe('22+');
    expect(formatRangeNotation(parse('A2s+, KTo+'))).toBe('A2s+, KTo+');
    expect(formatRangeNotation(parse('A5s-A2s'))).toBe('A5s-A2s');
  });

  it('round-trips the 169 hands', () => {
    expect(parse(formatRangeNotation(ALL_HANDS))).toEqual([...ALL_HANDS]);
  });
});
