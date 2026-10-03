import { describe, expect, it } from 'vitest';
import { SKILL_ONLY_PLAN, budgetNote, canAdvance, findQuotedTurn, timeState } from './plan';

describe('plano de blocos', () => {
  it('só avança para frente', () => {
    expect(canAdvance(SKILL_ONLY_PLAN, 'OPENING', 'TECHNICAL')).toBe(true);
    expect(canAdvance(SKILL_ONLY_PLAN, 'TECHNICAL', 'TRAJECTORY')).toBe(false);
    expect(canAdvance(SKILL_ONLY_PLAN, 'TECHNICAL', 'CULTURAL')).toBe(false); // sem vaga não há cultural
  });

  it('classifica o tempo', () => {
    expect(timeState(SKILL_ONLY_PLAN, 'TECHNICAL', 60_000, 6 * 60_000)).toBe('ok');
    expect(timeState(SKILL_ONLY_PLAN, 'OPENING', 3 * 60_000, 3 * 60_000)).toBe('block_over');
    expect(timeState(SKILL_ONLY_PLAN, 'TECHNICAL', 0, 19 * 60_000)).toBe('total_over');
    expect(timeState(SKILL_ONLY_PLAN, 'TECHNICAL', 0, 28 * 60_000)).toBe('hard_stop');
  });

  it('nota de orçamento lista competências sem evidência', () => {
    const note = budgetNote({
      plan: SKILL_ONLY_PLAN,
      block: 'TECHNICAL',
      blockElapsedMs: 8 * 60_000,
      totalElapsedMs: 13 * 60_000,
      competencies: [
        { key: 'a', name: 'A', evidenceCount: 1 },
        { key: 'b', name: 'B', evidenceCount: 0 },
      ],
    });
    expect(note).toContain('8 de 12 min');
    expect(note).toContain('b (B)');
    expect(note).not.toContain('a (A)');
  });
});

describe('trecho citado', () => {
  const turns = [
    { seq: 2, text: 'Eu usei Task.WhenAll para paralelizar as chamadas.' },
    { seq: 4, text: 'Já tive deadlock por causa de .Result num controller ASP.NET.' },
  ];
  it('acha ignorando caixa, acento e pontuação', () => {
    expect(findQuotedTurn(turns, 'deadlock por causa de result')?.seq).toBe(4);
    expect(findQuotedTurn(turns, 'TASK WHENALL para paralelizar')?.seq).toBe(2);
  });
  it('recusa paráfrase', () => {
    expect(findQuotedTurn(turns, 'usou paralelismo')).toBeUndefined();
  });
});
