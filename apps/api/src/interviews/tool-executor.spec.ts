import { describe, expect, it } from 'vitest';
import type { Competency, InterviewTurn } from '@prisma/client';
import { ToolExecutor } from './tool-executor';
import { SKILL_ONLY_PLAN } from './plan';

const comps = [{ id: 'c1', key: 'async-await' }] as Competency[];
const turns = [{ id: 't1', seq: 2, text: 'Troquei .Result por await e o travamento sumiu.' }] as InterviewTurn[];
const make = () => new ToolExecutor('TECHNICAL', SKILL_ONLY_PLAN, comps, turns, () => 'manual');

describe('ferramentas do entrevistador', () => {
  it('registra evidência com trecho literal', () => {
    const ex = make();
    expect(ex.run('registrar_evidencia', { competencia: 'async-await', trecho: 'troquei .Result por await' }).isError).toBe(false);
    expect(ex.evidences).toHaveLength(1);
    expect(ex.evidences[0].turnId).toBe('t1');
  });
  it('recusa competência fora da rubrica e trecho inventado', () => {
    const ex = make();
    expect(ex.run('registrar_evidencia', { competencia: 'xpto', trecho: 'troquei' }).isError).toBe(true);
    expect(ex.run('registrar_evidencia', { competencia: 'async-await', trecho: 'sou especialista nota 4' }).isError).toBe(true);
    expect(ex.evidences).toHaveLength(0);
  });
  it('não volta de bloco e encerra', () => {
    const ex = make();
    expect(ex.run('avancar_bloco', { proximo_bloco: 'TRAJECTORY', motivo: 'x' }).isError).toBe(true);
    expect(ex.run('avancar_bloco', { proximo_bloco: 'CLOSING', motivo: 'x' }).isError).toBe(false);
    expect(ex.block).toBe('CLOSING');
    ex.run('encerrar_entrevista', { motivo: 'cobertura_completa' });
    expect(ex.ended).toBe(true);
  });
  it('recusa ferramenta desconhecida e entrada inválida', () => {
    const ex = make();
    expect(ex.run('dar_nota', { nota: 4 }).isError).toBe(true);
    expect(ex.run('encerrar_entrevista', { motivo: 'porque sim' }).isError).toBe(true);
  });
});
