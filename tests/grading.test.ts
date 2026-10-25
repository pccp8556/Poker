import { describe, expect, it } from 'vitest';
import { actionForRng, grade } from '../src/domain/grading';

const pure = { 'minraise-call': 1 };
const mixed = { 'minraise-call': 0.6, shove: 0.4 };
const order = ['fold', 'minraise-call', 'shove'];

describe('grading — pure hands', () => {
  it.each(['tolerant', 'strict', 'exam'] as const)('%s: only the range action is correct', (rule) => {
    expect(grade(pure, 'minraise-call', rule).correct).toBe(true);
    expect(grade(pure, 'minraise-call', rule).score).toBe(1);
    const wrong = grade(pure, 'fold', rule);
    expect(wrong.correct).toBe(false);
    expect(wrong.score).toBe(0);
    expect(wrong.accepted).toEqual(['minraise-call']);
  });

  it('treats a timeout as a wrong answer', () => {
    const g = grade(pure, null, 'exam');
    expect(g.correct).toBe(false);
    expect(g.timedOut).toBe(true);
    expect(g.score).toBe(0);
  });
});

describe('grading — mixed hands', () => {
  it('tolerant accepts every action played by the range', () => {
    expect(grade(mixed, 'minraise-call', 'tolerant').correct).toBe(true);
    expect(grade(mixed, 'shove', 'tolerant').correct).toBe(true);
    expect(grade(mixed, 'fold', 'tolerant').correct).toBe(false);
    expect(grade(mixed, 'shove', 'tolerant').accepted.sort()).toEqual(['minraise-call', 'shove']);
  });

  it('strict uses the random number to pick the expected action', () => {
    // Buckets follow the option order: minraise-call 1-60, shove 61-100.
    expect(actionForRng(mixed, 1, order)).toBe('minraise-call');
    expect(actionForRng(mixed, 60, order)).toBe('minraise-call');
    expect(actionForRng(mixed, 61, order)).toBe('shove');
    expect(actionForRng(mixed, 100, order)).toBe('shove');
    expect(grade(mixed, 'minraise-call', 'strict', { rng: 42, order }).correct).toBe(true);
    expect(grade(mixed, 'shove', 'strict', { rng: 42, order }).correct).toBe(false);
    expect(grade(mixed, 'shove', 'strict', { rng: 87, order }).correct).toBe(true);
    expect(grade(mixed, 'shove', 'strict', { rng: 87, order }).rng).toBe(87);
  });

  it('strict without random number expects the most frequent action', () => {
    expect(grade(mixed, 'minraise-call', 'strict').correct).toBe(true);
    expect(grade(mixed, 'shove', 'strict').correct).toBe(false);
  });

  it('exam scores by frequency of the chosen action', () => {
    expect(grade(mixed, 'minraise-call', 'exam').score).toBeCloseTo(0.6);
    expect(grade(mixed, 'shove', 'exam').score).toBeCloseTo(0.4);
    expect(grade(mixed, 'shove', 'exam').correct).toBe(true);
    expect(grade(mixed, 'fold', 'exam').score).toBe(0);
  });
});
