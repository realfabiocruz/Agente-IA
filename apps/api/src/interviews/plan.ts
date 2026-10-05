import type { Block } from '@prisma/client';

export interface BlockBudget {
  block: Block;
  minutes: number;
}

/** Orçamentos de partida da proposta; calibrar na PoC. */
export const SKILL_ONLY_PLAN: BlockBudget[] = [
  { block: 'OPENING', minutes: 2 },
  { block: 'TRAJECTORY', minutes: 3 },
  { block: 'TECHNICAL', minutes: 12 },
  { block: 'CLOSING', minutes: 1 },
];

/** Fase 2: com vaga atrelada entram cultural e expectativa. */
export const WITH_JOB_PLAN: BlockBudget[] = [
  { block: 'OPENING', minutes: 2 },
  { block: 'TRAJECTORY', minutes: 3 },
  { block: 'TECHNICAL', minutes: 10 },
  { block: 'CULTURAL', minutes: 6 },
  { block: 'EXPECTATION', minutes: 3 },
  { block: 'CLOSING', minutes: 1 },
];

export const BLOCK_LABEL: Record<Block, string> = {
  OPENING: 'Abertura',
  TRAJECTORY: 'Trajetória no skill',
  TECHNICAL: 'Técnico do skill',
  CULTURAL: 'Cultural',
  EXPECTATION: 'Expectativa',
  CLOSING: 'Fechamento',
};

export function planFor(jobOpeningId: string | null | undefined): BlockBudget[] {
  return jobOpeningId ? WITH_JOB_PLAN : SKILL_ONLY_PLAN;
}

export function totalMinutes(plan: BlockBudget[]): number {
  return plan.reduce((s, b) => s + b.minutes, 0);
}

/** Só avança para um bloco posterior do plano; nunca volta. */
export function canAdvance(plan: BlockBudget[], from: Block, to: Block): boolean {
  const i = plan.findIndex((b) => b.block === from);
  const j = plan.findIndex((b) => b.block === to);
  return i >= 0 && j > i;
}

export function elapsedMs(
  interview: { activeMs: number; resumedAt: Date | null },
  now = new Date(),
): number {
  return interview.activeMs + (interview.resumedAt ? now.getTime() - interview.resumedAt.getTime() : 0);
}

export type TimeState = 'ok' | 'block_over' | 'total_over' | 'hard_stop';

export function timeState(plan: BlockBudget[], block: Block, blockElapsedMs: number, totalElapsedMs: number): TimeState {
  const total = totalMinutes(plan) * 60_000;
  if (totalElapsedMs > total * 1.5) return 'hard_stop';
  if (totalElapsedMs > total) return 'total_over';
  const budget = (plan.find((b) => b.block === block)?.minutes ?? 0) * 60_000;
  if (blockElapsedMs > budget) return 'block_over';
  return 'ok';
}

function min(ms: number) {
  return Math.max(0, Math.round(ms / 60_000));
}

/**
 * Nota de orçamento injetada a cada turno como mensagem de sistema: o backend
 * conta o tempo, não o modelo.
 */
export function budgetNote(args: {
  plan: BlockBudget[];
  block: Block;
  blockElapsedMs: number;
  totalElapsedMs: number;
  competencies: { key: string; name: string; evidenceCount: number }[];
}): string {
  const { plan, block, blockElapsedMs, totalElapsedMs, competencies } = args;
  const budget = plan.find((b) => b.block === block)?.minutes ?? 0;
  const total = totalMinutes(plan);
  const missing = competencies.filter((c) => c.evidenceCount === 0);
  const lines = [
    `Bloco atual: ${BLOCK_LABEL[block]} (${min(blockElapsedMs)} de ${budget} min usados).`,
    `Tempo total: ${min(totalElapsedMs)} de ${total} min.`,
    `Sequência de blocos: ${plan.map((b) => b.block).join(' → ')}.`,
    missing.length
      ? `Competências sem evidência: ${missing.map((c) => `${c.key} (${c.name})`).join('; ')}.`
      : 'Todas as competências têm ao menos uma evidência.',
  ];
  const state = timeState(plan, block, blockElapsedMs, totalElapsedMs);
  if (state === 'block_over') lines.push('O tempo deste bloco acabou: conclua e avance para o próximo bloco.');
  if (state === 'total_over' || state === 'hard_stop')
    lines.push('O tempo total acabou: agradeça, despeça-se e chame encerrar_entrevista neste turno.');
  return lines.join('\n');
}

/** Normaliza para comparar trechos citados com as falas do candidato. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function findQuotedTurn<T extends { text: string }>(turns: T[], quote: string): T | undefined {
  const q = normalizeText(quote);
  if (q.length < 3) return undefined;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (normalizeText(turns[i].text).includes(q)) return turns[i];
  }
  return undefined;
}
