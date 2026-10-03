import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { InterviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformService } from '../platform/platform.service';
import { QueueService, EVALUATE_QUEUE } from '../queue/queue.service';
import type { CurrentUser } from '../platform/types';
import { InterviewerService, TurnSink } from './interviewer.service';
import { interviewerSystemPrompt } from './interviewer.prompt';
import { ToolExecutor } from './tool-executor';
import { BLOCK_LABEL, budgetNote, elapsedMs, planFor, timeState, totalMinutes } from './plan';
import { applyAdjustments, ScoreAdjustment, weightedResult } from '../evaluation/scoring';

export const CONSENT_VERSION = 'consent-v1';
export const CONSENT_TEXT = [
  'Esta entrevista é conduzida por um agente de inteligência artificial da Whizz.',
  'Ficam gravados o texto da conversa, os horários de cada fala e as evidências que o agente registra.',
  'Esses dados servem para avaliar o seu domínio do skill escolhido. A avaliação é feita por IA e sempre conferida por uma pessoa antes de valer para o seu perfil ou para o ranking do skill.',
  'Parte do conteúdo é processada por um provedor de IA (Anthropic) fora do Brasil. Não compartilhe dados pessoais sensíveis durante a conversa.',
  'Os dados ficam guardados enquanto a avaliação estiver ativa no seu perfil, conforme a política de privacidade da plataforma.',
  'Você pode pedir para ser avaliado por uma pessoa em vez do agente a qualquer momento, e pode contestar o resultado depois.',
].join('\n\n');

const ACTIVE: InterviewStatus[] = ['CREATED', 'CONSENTED', 'IN_PROGRESS', 'PAUSED'];
const EXPIRY_DAYS = 7;
const CONTESTATION_DAYS = 10;

const withRubric = {
  skill: true,
  rubric: { include: { competencies: { orderBy: { weight: 'desc' } } } },
} satisfies Prisma.InterviewInclude;

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);
  /** Evita duas mensagens simultâneas na mesma entrevista (uma instância na PoC). */
  private readonly busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformService,
    private readonly interviewer: InterviewerService,
    private readonly queue: QueueService,
  ) {}

  // ---------- candidato ----------

  /** Uma entrevista por skill: reaproveita a ativa, se houver. */
  async create(user: CurrentUser, skillId: string, jobOpeningId?: string) {
    if (jobOpeningId) throw new BadRequestException('Entrevistas com vaga atrelada entram na fase 2');
    const rubric = await this.prisma.skillRubric.findFirst({
      where: { skillId, status: 'APPROVED' },
      orderBy: { version: 'desc' },
    });
    if (!rubric) throw new BadRequestException('Este skill ainda não tem rubrica aprovada');

    const active = await this.prisma.interview.findFirst({
      where: { candidateId: user.id, skillId, status: { in: ACTIVE }, expiresAt: { gt: new Date() } },
    });
    if (active) return { id: active.id, reused: true };

    const created = await this.prisma.interview.create({
      data: {
        candidateId: user.id,
        skillId,
        rubricId: rubric.id,
        expiresAt: new Date(Date.now() + EXPIRY_DAYS * 86_400_000),
      },
    });
    return { id: created.id, reused: false };
  }

  async getForCandidate(user: CurrentUser, id: string) {
    const iv = await this.load(id);
    this.assertCanView(user, iv.candidateId);
    const turns = await this.prisma.interviewTurn.findMany({ where: { interviewId: id }, orderBy: { seq: 'asc' } });
    const plan = planFor(iv.jobOpeningId);
    return {
      id: iv.id,
      status: iv.status,
      mode: iv.mode,
      skill: { id: iv.skill.id, name: iv.skill.name },
      rubricVersion: iv.rubric.version,
      block: iv.currentBlock,
      blockLabel: BLOCK_LABEL[iv.currentBlock],
      blockStartMs: iv.blockStartMs,
      plan: plan.map((b) => ({ ...b, label: BLOCK_LABEL[b.block] })),
      totalMinutes: totalMinutes(plan),
      elapsedMs: elapsedMs(iv),
      running: iv.status === 'IN_PROGRESS',
      expiresAt: iv.expiresAt,
      endReason: iv.endReason,
      consent: { version: CONSENT_VERSION, text: CONSENT_TEXT, acceptedAt: iv.consentAt },
      turns: turns.map((t) => ({ seq: t.seq, speaker: t.speaker, block: t.block, text: t.text })),
    };
  }

  async consent(user: CurrentUser, id: string, body: { mode: 'TEXT' | 'VOICE'; voicePref?: 'MALE' | 'FEMALE' | 'RANDOM' }) {
    const iv = await this.load(id);
    this.assertOwner(user, iv.candidateId);
    if (iv.status !== 'CREATED') throw new ConflictException('Consentimento já registrado');
    if (body.mode === 'VOICE') throw new BadRequestException('Modo voz ainda não está disponível nesta PoC');
    await this.prisma.$transaction([
      this.prisma.interview.update({
        where: { id },
        data: {
          status: 'CONSENTED',
          consentAt: new Date(),
          consentText: `[${CONSENT_VERSION}]\n${CONSENT_TEXT}`,
          mode: body.mode,
          voicePref: body.voicePref ?? null,
        },
      }),
      this.prisma.agentEvent.create({ data: { interviewId: id, type: 'consent', payload: { version: CONSENT_VERSION } } }),
    ]);
    return { ok: true };
  }

  /**
   * Modo texto: grava a fala do candidato, roda o entrevistador (com
   * streaming para `sink`) e grava a resposta, evidências e eventos numa transação.
   * Texto vazio só é aceito para abrir a entrevista.
   */
  async handleMessage(user: CurrentUser, id: string, text: string, sink: TurnSink) {
    if (this.busy.has(id)) throw new ConflictException('Aguarde a resposta anterior');
    this.busy.add(id);
    try {
      return await this.handleMessageLocked(user, id, text.trim(), sink);
    } finally {
      this.busy.delete(id);
    }
  }

  private async handleMessageLocked(user: CurrentUser, id: string, text: string, sink: TurnSink) {
    let iv = await this.load(id);
    this.assertOwner(user, iv.candidateId);
    if (iv.status === 'PAUSED') throw new ConflictException('A entrevista está pausada; retome para continuar');
    if (iv.status !== 'CONSENTED' && iv.status !== 'IN_PROGRESS')
      throw new ConflictException(`A entrevista não aceita mensagens no estado ${iv.status}`);

    let turns = await this.prisma.interviewTurn.findMany({ where: { interviewId: id }, orderBy: { seq: 'asc' } });
    if (!text && turns.length > 0) throw new BadRequestException('Mensagem vazia');
    if (text.length > 4000) throw new BadRequestException('Mensagem longa demais (máx. 4000 caracteres)');

    if (iv.status === 'CONSENTED') {
      const now = new Date();
      iv = await this.prisma.interview.update({
        where: { id },
        data: { status: 'IN_PROGRESS', startedAt: iv.startedAt ?? now, resumedAt: now },
        include: withRubric,
      });
    }

    const atStart = elapsedMs(iv);
    if (text) {
      const turn = await this.prisma.interviewTurn.create({
        data: {
          interviewId: id,
          seq: turns.length + 1,
          speaker: 'CANDIDATE',
          block: iv.currentBlock,
          text,
          startMs: atStart,
          endMs: atStart,
        },
      });
      turns = [...turns, turn];
    }

    const plan = planFor(iv.jobOpeningId);
    const competencies = iv.rubric.competencies;
    const evidenceCounts = await this.prisma.evidence.groupBy({
      by: ['competencyId'],
      where: { interviewId: id },
      _count: true,
    });
    const countFor = (cid: string) => evidenceCounts.find((e) => e.competencyId === cid)?._count ?? 0;
    const blockElapsed = atStart - iv.blockStartMs;
    const time = timeState(plan, iv.currentBlock, blockElapsed, atStart);

    const [candidateName, candidateHistory] = await Promise.all([
      this.platform.getUserName(iv.candidateId),
      this.platform.getCandidateHistory(iv.candidateId),
    ]);
    const systemPrompt = interviewerSystemPrompt({
      rubric: { skillName: iv.skill.name, version: iv.rubric.version, competencies },
      plan,
      candidateName,
      candidateHistory,
    });
    const note = budgetNote({
      plan,
      block: iv.currentBlock,
      blockElapsedMs: blockElapsed,
      totalElapsedMs: atStart,
      competencies: competencies.map((c) => ({ key: c.key, name: c.name, evidenceCount: countFor(c.id) })),
    });

    const executor = new ToolExecutor(
      iv.currentBlock,
      plan,
      competencies,
      turns.filter((t) => t.speaker === 'CANDIDATE'),
      (q) => this.platform.manualFor(q),
    );

    let output;
    try {
      output = await this.interviewer.runTurn(
        {
          systemPrompt,
          budgetNote: note,
          turns,
          block: iv.currentBlock,
          competencies,
          candidateName,
          skillName: iv.skill.name,
          executor,
        },
        sink,
      );
    } catch (err) {
      this.logger.error(err);
      await this.prisma.agentEvent.create({
        data: { interviewId: id, type: 'error', payload: { where: 'interviewer', message: String(err) } },
      });
      throw err;
    }

    if (!executor.ended && time === 'hard_stop') {
      executor.ended = true;
      executor.endReason = 'tempo_esgotado';
      executor.events.push({ type: 'forced_end', payload: { reason: 'tempo_esgotado' } });
    }

    const atEnd = elapsedMs(iv);
    const agentSeq = turns.length + 1;
    const ended = executor.ended;

    await this.prisma.$transaction(async (tx) => {
      if (output.text) {
        await tx.interviewTurn.create({
          data: {
            interviewId: id,
            seq: agentSeq,
            speaker: 'AGENT',
            block: executor.block,
            text: output.text,
            startMs: atStart,
            endMs: atEnd,
          },
        });
      }
      for (const e of executor.evidences) {
        await tx.evidence.create({ data: { interviewId: id, ...e, source: 'INTERVIEWER' } });
      }
      await tx.agentEvent.createMany({
        data: [...output.events, ...executor.events].map((e) => ({
          interviewId: id,
          type: e.type,
          payload: e.payload as Prisma.InputJsonValue,
        })),
      });
      await tx.interview.update({
        where: { id },
        data: {
          currentBlock: executor.block,
          blockStartMs: executor.blockChanged ? atEnd : undefined,
          ...(ended
            ? { status: 'COMPLETED', endedAt: new Date(), endReason: executor.endReason, activeMs: atEnd, resumedAt: null }
            : {}),
        },
      });
    });

    if (ended) await this.queue.send(EVALUATE_QUEUE, { interviewId: id });
    return { block: executor.block, ended, status: ended ? 'COMPLETED' : 'IN_PROGRESS' };
  }

  async pause(user: CurrentUser, id: string) {
    const iv = await this.load(id);
    this.assertOwner(user, iv.candidateId);
    if (iv.status !== 'IN_PROGRESS') return { status: iv.status };
    await this.prisma.interview.update({
      where: { id },
      data: { status: 'PAUSED', activeMs: elapsedMs(iv), resumedAt: null },
    });
    await this.event(id, 'paused', {});
    return { status: 'PAUSED' };
  }

  async resume(user: CurrentUser, id: string) {
    const iv = await this.load(id);
    this.assertOwner(user, iv.candidateId);
    if (iv.status !== 'PAUSED') return { status: iv.status };
    await this.prisma.interview.update({ where: { id }, data: { status: 'IN_PROGRESS', resumedAt: new Date() } });
    await this.event(id, 'resumed', {});
    return { status: 'IN_PROGRESS' };
  }

  async finish(user: CurrentUser, id: string, reason = 'pedido_do_candidato') {
    const iv = await this.load(id);
    this.assertOwner(user, iv.candidateId);
    if (!['CONSENTED', 'IN_PROGRESS', 'PAUSED'].includes(iv.status))
      throw new ConflictException(`Não é possível encerrar no estado ${iv.status}`);
    const hasTurns = (await this.prisma.interviewTurn.count({ where: { interviewId: id } })) > 0;
    await this.prisma.interview.update({
      where: { id },
      data: {
        status: hasTurns ? 'COMPLETED' : 'CANCELLED',
        endedAt: new Date(),
        endReason: reason,
        activeMs: elapsedMs(iv),
        resumedAt: null,
      },
    });
    await this.event(id, 'finished', { reason, by: 'candidate' });
    if (hasTurns) await this.queue.send(EVALUATE_QUEUE, { interviewId: id });
    return { status: hasTurns ? 'COMPLETED' : 'CANCELLED' };
  }

  async contest(user: CurrentUser, id: string, text: string) {
    const iv = await this.load(id);
    this.assertOwner(user, iv.candidateId);
    if (!['COMPLETED', 'EVALUATING', 'READY_FOR_REVIEW', 'REVIEWED'].includes(iv.status))
      throw new ConflictException('Só é possível contestar uma entrevista concluída');
    return this.prisma.contestation.create({
      data: { interviewId: id, text, dueAt: new Date(Date.now() + CONTESTATION_DAYS * 86_400_000) },
    });
  }

  async list(user: CurrentUser, status?: InterviewStatus) {
    const where: Prisma.InterviewWhereInput = user.role === 'CANDIDATE' ? { candidateId: user.id } : {};
    if (status) where.status = status;
    const rows = await this.prisma.interview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { skill: true, rubric: true, report: user.role !== 'CANDIDATE' },
    });
    const names = new Map(
      (await this.prisma.mockUser.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]),
    );
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      skill: { id: r.skill.id, name: r.skill.name },
      rubricVersion: r.rubric.version,
      candidate: { id: r.candidateId, name: names.get(r.candidateId) ?? r.candidateId },
      createdAt: r.createdAt,
      endedAt: r.endedAt,
      ...(user.role !== 'CANDIDATE' && r.report
        ? { weightedScore: r.report.weightedScore?.toNumber() ?? null, coverage: r.report.coverage.toNumber() }
        : {}),
    }));
  }

  // ---------- revisor ----------

  async report(id: string) {
    const iv = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        ...withRubric,
        turns: { orderBy: { seq: 'asc' } },
        evidences: { include: { competency: true, turn: true }, orderBy: { createdAt: 'asc' } },
        scores: { include: { competency: true } },
        report: true,
        reviews: { orderBy: { createdAt: 'desc' } },
        contestations: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { at: 'asc' } },
      },
    });
    if (!iv) throw new NotFoundException();
    const candidateName = await this.platform.getUserName(iv.candidateId);
    return {
      id: iv.id,
      status: iv.status,
      candidate: { id: iv.candidateId, name: candidateName },
      skill: { id: iv.skill.id, name: iv.skill.name },
      rubric: {
        id: iv.rubric.id,
        version: iv.rubric.version,
        competencies: iv.rubric.competencies.map((c) => ({
          id: c.id,
          key: c.key,
          name: c.name,
          kind: c.kind,
          weight: c.weight,
          levels: c.levels,
        })),
      },
      consentAt: iv.consentAt,
      startedAt: iv.startedAt,
      endedAt: iv.endedAt,
      endReason: iv.endReason,
      activeMs: iv.activeMs,
      turns: iv.turns.map((t) => ({ seq: t.seq, speaker: t.speaker, block: t.block, text: t.text, startMs: t.startMs })),
      evidences: iv.evidences.map((e) => ({
        id: e.id,
        competencyKey: e.competency.key,
        turnSeq: e.turn.seq,
        startMs: e.turn.startMs,
        quote: e.quote,
        note: e.note,
        source: e.source,
      })),
      scores: iv.scores.map((s) => ({
        competencyKey: s.competency.key,
        score: s.score,
        justification: s.justification,
        evidenceIds: s.evidenceIds,
      })),
      report: iv.report && {
        weightedScore: iv.report.weightedScore?.toNumber() ?? null,
        coverage: iv.report.coverage.toNumber(),
        summary: iv.report.summary,
        pointsToCheck: iv.report.pointsToCheck,
        model: iv.report.model,
        promptVersion: iv.report.promptVersion,
        createdAt: iv.report.createdAt,
      },
      reviews: iv.reviews,
      contestations: iv.contestations,
      events: iv.events.map((e) => ({ id: e.id.toString(), type: e.type, payload: e.payload, at: e.at })),
    };
  }

  async review(
    user: CurrentUser,
    id: string,
    body: { decision: 'CONFIRMED' | 'ADJUSTED' | 'INVALIDATED'; adjustments?: ScoreAdjustment[]; notes?: string },
  ) {
    const iv = await this.load(id);
    if (!['READY_FOR_REVIEW', 'REVIEWED'].includes(iv.status))
      throw new ConflictException('O dossiê ainda não está pronto para revisão');
    if (body.decision === 'ADJUSTED' && !body.adjustments?.length)
      throw new BadRequestException('Informe as notas ajustadas e o motivo');
    const keys = new Set(iv.rubric.competencies.map((c) => c.key));
    for (const a of body.adjustments ?? []) {
      if (!keys.has(a.competencyKey)) throw new BadRequestException(`Competência fora da rubrica: ${a.competencyKey}`);
    }
    const [review] = await this.prisma.$transaction([
      this.prisma.humanReview.create({
        data: {
          interviewId: id,
          reviewerId: user.id,
          decision: body.decision,
          adjustments: (body.adjustments ?? undefined) as Prisma.InputJsonValue | undefined,
          notes: body.notes,
        },
      }),
      this.prisma.interview.update({ where: { id }, data: { status: 'REVIEWED' } }),
    ]);
    return review;
  }

  /** Ranking por skill: só entrevistas revisadas por humano, na mesma versão de rubrica. */
  async ranking(skillId: string, rubricVersion?: number) {
    const rubric = await this.prisma.skillRubric.findFirst({
      where: { skillId, ...(rubricVersion ? { version: rubricVersion } : { status: 'APPROVED' }) },
      orderBy: { version: 'desc' },
      include: { competencies: true, skill: true },
    });
    if (!rubric) throw new NotFoundException('Rubrica não encontrada');
    const interviews = await this.prisma.interview.findMany({
      where: { rubricId: rubric.id, status: 'REVIEWED' },
      include: { scores: { include: { competency: true } }, reviews: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const names = new Map(
      (await this.prisma.mockUser.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]),
    );
    const rows = interviews
      .filter((iv) => iv.reviews[0] && iv.reviews[0].decision !== 'INVALIDATED')
      .map((iv) => {
        const base = Object.fromEntries(iv.scores.map((s) => [s.competency.key, s.score]));
        const final = applyAdjustments(base, iv.reviews[0].adjustments as ScoreAdjustment[] | null);
        const { weightedScore, coverage } = weightedResult(rubric.competencies, final);
        return {
          interviewId: iv.id,
          candidate: { id: iv.candidateId, name: names.get(iv.candidateId) ?? iv.candidateId },
          weightedScore,
          coverage,
          notAssessed: rubric.competencies.filter((c) => final[c.key] == null).map((c) => c.key),
          decision: iv.reviews[0].decision,
          reviewedAt: iv.reviews[0].createdAt,
        };
      })
      .sort((a, b) => (b.weightedScore ?? -1) - (a.weightedScore ?? -1) || b.coverage - a.coverage);
    return { skill: { id: rubric.skill.id, name: rubric.skill.name }, rubricVersion: rubric.version, rows };
  }

  // ---------- auxiliares ----------

  private async load(id: string) {
    const iv = await this.prisma.interview.findUnique({ where: { id }, include: withRubric });
    if (!iv) throw new NotFoundException('Entrevista não encontrada');
    if (ACTIVE.includes(iv.status) && iv.expiresAt < new Date()) {
      return this.prisma.interview.update({ where: { id }, data: { status: 'EXPIRED' }, include: withRubric });
    }
    return iv;
  }

  private assertOwner(user: CurrentUser, candidateId: string) {
    if (user.id !== candidateId) throw new ForbiddenException();
  }

  private assertCanView(user: CurrentUser, candidateId: string) {
    if (user.id !== candidateId && user.role === 'CANDIDATE') throw new ForbiddenException();
  }

  private event(interviewId: string, type: string, payload: object) {
    return this.prisma.agentEvent.create({ data: { interviewId, type, payload } });
  }
}
