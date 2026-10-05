import { describe, expect, it } from 'vitest';
import { applyAdjustments, weightedResult } from './scoring';

const comps = [
  { key: 'a', weight: 3 },
  { key: 'b', weight: 2 },
  { key: 'c', weight: 1 },
];

describe('nota ponderada', () => {
  it('ignora N/A na nota mas reduz a cobertura', () => {
    expect(weightedResult(comps, { a: 4, b: 2, c: null })).toEqual({ weightedScore: 3.2, coverage: 0.833 });
  });
  it('sem nenhuma nota fica nula', () => {
    expect(weightedResult(comps, {})).toEqual({ weightedScore: null, coverage: 0 });
  });
  it('aplica ajustes do revisor', () => {
    expect(applyAdjustments({ a: 2, b: 3 }, [{ competencyKey: 'a', score: 3, reason: 'x' }])).toEqual({ a: 3, b: 3 });
  });
});
