import type { Block, Competency, InterviewTurn } from '@prisma/client';
import { BLOCK_LABEL, BlockBudget, canAdvance, findQuotedTurn } from './plan';
import { ToolName, toolInputSchemas } from './interviewer.prompt';

export interface PendingEvidence {
  competencyId: string;
  turnId: string;
  quote: string;
  note?: string;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

/**
 * Executa as ferramentas do entrevistador contra o estado da entrevista.
 * Tudo é validado aqui antes de gravar: competência fora da rubrica, trecho que
 * não aparece nas falas do candidato e bloco fora de ordem são recusados.
 * As gravações ficam pendentes e entram na mesma transação do turno.
 */
export class ToolExecutor {
  block: Block;
  blockChanged = false;
  ended = false;
  endReason: string | null = null;
  readonly evidences: PendingEvidence[] = [];
  readonly events: { type: string; payload: object }[] = [];

  constructor(
    startBlock: Block,
    private readonly plan: BlockBudget[],
    private readonly competencies: Competency[],
    private readonly candidateTurns: InterviewTurn[],
    private readonly manual: (q: string) => string,
  ) {
    this.block = startBlock;
  }

  run(name: string, rawInput: unknown): ToolResult {
    const result = this.dispatch(name, rawInput);
    this.events.push({ type: 'tool_call', payload: { name, input: rawInput as object, ...result } });
    return result;
  }

  private dispatch(name: string, rawInput: unknown): ToolResult {
    if (!(name in toolInputSchemas)) return { content: `Ferramenta desconhecida: ${name}`, isError: true };
    const parsed = toolInputSchemas[name as ToolName].safeParse(rawInput);
    if (!parsed.success) {
      return { content: `Entrada inválida: ${JSON.stringify(parsed.error.issues)}`, isError: true };
    }
    const input = parsed.data as never;
    switch (name as ToolName) {
      case 'registrar_evidencia':
        return this.registerEvidence(input);
      case 'avancar_bloco':
        return this.advanceBlock(input);
      case 'encerrar_entrevista':
        return this.finish(input);
      case 'consultar_manual':
        return { content: this.manual((input as { pergunta: string }).pergunta), isError: false };
    }
  }

  private registerEvidence(input: { competencia: string; trecho: string; observacao?: string }): ToolResult {
    const competency = this.competencies.find((c) => c.key === input.competencia);
    if (!competency) return { content: `Competência "${input.competencia}" não está na rubrica.`, isError: true };
    const turn = findQuotedTurn(this.candidateTurns, input.trecho);
    if (!turn) {
      return {
        content: 'O trecho não aparece nas falas do candidato. Copie um trecho literal do que a pessoa escreveu.',
        isError: true,
      };
    }
    this.evidences.push({ competencyId: competency.id, turnId: turn.id, quote: input.trecho, note: input.observacao });
    return { content: `Evidência registrada para ${competency.key} (turno ${turn.seq}).`, isError: false };
  }

  private advanceBlock(input: { proximo_bloco: Block; motivo: string }): ToolResult {
    if (!canAdvance(this.plan, this.block, input.proximo_bloco)) {
      return {
        content: `Não é possível ir de ${this.block} para ${input.proximo_bloco}. Sequência: ${this.plan
          .map((b) => b.block)
          .join(' → ')}.`,
        isError: true,
      };
    }
    this.events.push({ type: 'block_change', payload: { from: this.block, to: input.proximo_bloco, motivo: input.motivo } });
    this.block = input.proximo_bloco;
    this.blockChanged = true;
    return { content: `Bloco atual: ${BLOCK_LABEL[this.block]}.`, isError: false };
  }

  private finish(input: { motivo: string }): ToolResult {
    this.ended = true;
    this.endReason = input.motivo;
    return { content: 'Entrevista será encerrada ao fim deste turno.', isError: false };
  }
}
