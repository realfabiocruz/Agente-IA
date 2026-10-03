import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Competency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService } from '../claude/claude.service';
import { EVALUATE_QUEUE, QueueService } from '../queue/queue.service';
import { findQuotedTurn } from '../interviews/plan';
import { weightedResult } from './scoring';
import {
  EVALUATOR_PROMPT_VERSION,
  Evaluation,
  EvaluationSchema,
  evaluatorSystemPrompt,
  transcriptForEvaluator,
} from './evaluator.prompt';

type Turn = { id: string; seq: number; speaker: string; block: string; text: string; startMs: number };

/**
 * Avaliador: roda num job do pg-boss depois do fim da entrevista, lê a
 * transcrição inteira e gera o dossiê. Pode ser reprocessado.
 */
@Injectable()
export class EvaluationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly queue: QueueService,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.DISABLE_WORKER === '1') return;
    await this.queue.work<{ interviewId: string }>(EVALUATE_QUEUE, (data) => this.evaluate(data.interviewId));
  }

  async enqueue(interviewId: string) {
    const iv = await this.prisma.interview.findUnique({ where: { id: interviewId } });
    if (!iv) throw new NotFoundException();
    await this.queue.send(EVALUATE_QUEUE, { interviewId });
    return { queued: true };
  }

  async evaluate(interviewId: string) {
    const iv = await this.prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        skill: true,
        rubric: { include: { competencies: true } },
        turns: { orderBy: { seq: 'asc' } },
        evidences: { where: { source: 'INTERVIEWER' }, include: { competency: true, turn: true } },
      },
    });
    if (!iv) return;
    if (!['COMPLETED', 'EVALUATING', 'READY_FOR_REVIEW'].includes(iv.status)) {
      this.logger.warn(`Entrevista ${interviewId} em ${iv.status}; avaliação ignorada`);
      return;
    }
    const previousStatus = iv.status;
    await this.prisma.interview.update({ where: { id: interviewId }, data: { status: 'EVALUATING' } });

    const competencies = iv.rubric.competencies;
    const interviewerEvidence = iv.evidences.map((e) => ({
      competencyKey: e.competency.key,
      turnSeq: e.turn.seq,
      quote: e.quote,
      note: e.note,
    }));

    try {
      const { evaluation, model, usage } =
        this.claude.mode === 'live'
          ? await this.runLive(iv.skill.name, iv.rubric.version, competencies, iv.turns, interviewerEvidence)
          : { evaluation: this.runMock(competencies, iv.turns, interviewerEvidence), model: 'mock', usage: null };
      await this.persist(interviewId, competencies, iv.turns, evaluation, model, usage);
    } catch (err) {
      this.logger.error(err);
      await this.prisma.$transaction([
        this.prisma.agentEvent.create({
          data: { interviewId, type: 'error', payload: { where: 'evaluator', message: String(err) } },
        }),
        this.prisma.interview.update({
          where: { id: interviewId },
          data: { status: previousStatus === 'READY_FOR_REVIEW' ? 'READY_FOR_REVIEW' : 'COMPLETED' },
        }),
      ]);
      throw err; // o pg-boss tenta de novo
    }
  }

  private async runLive(
    skillName: string,
    rubricVersion: number,
    competencies: Competency[],
    turns: Turn[],
    interviewerEvidence: Parameters<typeof transcriptForEvaluator>[0]['interviewerEvidence'],
  ) {
    const client = this.claude.requireClient();
    const response = await client.beta.messages.parse({
      model: this.claude.models.evaluator,
      max_tokens: 16000,
      system: evaluatorSystemPrompt({ skillName, rubricVersion, competencies }),
      messages: [{ role: 'user', content: transcriptForEvaluator({ turns, interviewerEvidence }) }],
      output_config: { effort: 'high', format: betaZodOutputFormat(EvaluationSchema) },
      betas: this.claude.fallback.betas,
      fallbacks: this.claude.fallback.fallbacks,
    });
    if (response.stop_reason === 'refusal') throw new Error(`Avaliador recusou: ${JSON.stringify(response.stop_details)}`);
    if (!response.parsed_output) throw new Error(`Saída do avaliador inválida (stop_reason=${response.stop_reason})`);
    return { evaluation: response.parsed_output, model: response.model, usage: response.usage as unknown as object };
  }

  /** Avaliador simulado: nota pelo tamanho da resposta citada, só para exercitar o fluxo. */
  private runMock(
    competencies: Competency[],
    turns: Turn[],
    interviewerEvidence: { competencyKey: string; turnSeq: number; quote: string }[],
  ): Evaluation {
    return {
      competencies: competencies.map((c) => {
        const ev = interviewerEvidence.filter((e) => e.competencyKey === c.key);
        if (!ev.length) return { key: c.key, score: null, justification: 'Não explorada na entrevista.', evidences: [] };
        const len = turns.find((t) => t.seq === ev[0].turnSeq)?.text.length ?? 0;
        const score = len > 300 ? 4 : len > 150 ? 3 : len > 60 ? 2 : 1;
        return {
          key: c.key,
          score,
          justification: `Avaliação simulada (modo mock) pelo tamanho da resposta: ${len} caracteres.`,
          evidences: ev.map((e) => ({ turnSeq: e.turnSeq, quote: e.quote })),
        };
      }),
      summary: 'Dossiê gerado pelo avaliador simulado (LLM_MODE=mock). As notas não refletem análise real.',
      pointsToCheck: ['Modo mock: configure ANTHROPIC_API_KEY para a avaliação real.'],
    };
  }

  /**
   * Valida a saída contra a rubrica e a transcrição e grava o dossiê. Nota sem
   * evidência que confira vira N/A, e o motivo vai para os pontos de conferência.
   */
  private async persist(
    interviewId: string,
    competencies: Competency[],
    turns: Turn[],
    evaluation: Evaluation,
    model: string,
    usage: object | null,
  ) {
    const points = [...evaluation.pointsToCheck];
    const byKey = new Map(evaluation.competencies.map((c) => [c.key, c]));
    for (const c of evaluation.competencies) {
      if (!competencies.some((k) => k.key === c.key)) points.push(`Avaliador citou competência fora da rubrica: ${c.key}`);
    }
    const candidateTurns = turns.filter((t) => t.speaker === 'CANDIDATE');

    await this.prisma.$transaction(async (tx) => {
      await tx.competencyScore.deleteMany({ where: { interviewId } });
      await tx.evidence.deleteMany({ where: { interviewId, source: 'EVALUATOR' } });
      await tx.interviewReport.deleteMany({ where: { interviewId } });

      const finalScores: Record<string, number | null> = {};
      for (const comp of competencies) {
        const out = byKey.get(comp.key);
        let score = out?.score ?? null;
        if (score != null && (score < 1 || score > 4)) {
          points.push(`${comp.key}: nota fora da escala (${score}) descartada.`);
          score = null;
        }
        const evidenceIds: string[] = [];
        for (const e of out?.evidences ?? []) {
          const turn = candidateTurns.find((t) => t.seq === e.turnSeq);
          if (!turn || !findQuotedTurn([turn], e.quote)) {
            points.push(`${comp.key}: trecho citado não confere com o turno ${e.turnSeq} ("${e.quote.slice(0, 80)}").`);
            continue;
          }
          const created = await tx.evidence.create({
            data: { interviewId, competencyId: comp.id, turnId: turn.id, quote: e.quote, source: 'EVALUATOR' },
          });
          evidenceIds.push(created.id);
        }
        if (score != null && evidenceIds.length === 0) {
          points.push(`${comp.key}: nota ${score} sem evidência válida; registrada como N/A.`);
          score = null;
        }
        finalScores[comp.key] = score;
        await tx.competencyScore.create({
          data: {
            interviewId,
            competencyId: comp.id,
            score,
            justification: out?.justification ?? 'Competência ausente na saída do avaliador.',
            evidenceIds,
          },
        });
      }

      const { weightedScore, coverage } = weightedResult(competencies, finalScores);
      await tx.interviewReport.create({
        data: {
          interviewId,
          weightedScore,
          coverage,
          summary: evaluation.summary,
          pointsToCheck: points,
          model,
          promptVersion: model === 'mock' ? 'mock-v1' : EVALUATOR_PROMPT_VERSION,
        },
      });
      await tx.agentEvent.create({
        data: {
          interviewId,
          type: 'llm_call',
          payload: { role: 'evaluator', model, promptVersion: EVALUATOR_PROMPT_VERSION, usage } as Prisma.InputJsonValue,
        },
      });
      await tx.interview.update({ where: { id: interviewId }, data: { status: 'READY_FOR_REVIEW' } });
    });
  }
}
