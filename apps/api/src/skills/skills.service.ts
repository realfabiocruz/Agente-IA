import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService } from '../claude/claude.service';
import type { CurrentUser } from '../platform/types';
import { RUBRIC_PROMPT_VERSION, RubricDraft, RubricDraftSchema, mockRubricDraft, rubricSystemPrompt } from './rubric.prompt';

@Injectable()
export class SkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  async list() {
    const skills = await this.prisma.skill.findMany({
      orderBy: { name: 'asc' },
      include: { rubrics: { where: { status: 'APPROVED' }, orderBy: { version: 'desc' }, take: 1 } },
    });
    return skills.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      approvedRubricVersion: s.rubrics[0]?.version ?? null,
    }));
  }

  async rubrics(skillId: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      include: { rubrics: { orderBy: { version: 'desc' }, include: { competencies: { orderBy: { weight: 'desc' } } } } },
    });
    if (!skill) throw new NotFoundException();
    return skill;
  }

  /** Rascunho de rubrica gerado pelo Claude; só vale depois de aprovado por humano. */
  async draft(skillId: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill) throw new NotFoundException();
    let draft: RubricDraft;
    let promptVersion = RUBRIC_PROMPT_VERSION;
    if (this.claude.mode === 'live') {
      const response = await this.claude.requireClient().beta.messages.parse({
        model: this.claude.models.rubric,
        max_tokens: 16000,
        system: rubricSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: `Skill: ${skill.name}\nDescrição: ${skill.description ?? '(sem descrição)'}\n\nGere o rascunho da rubrica.`,
          },
        ],
        output_config: { effort: 'high', format: betaZodOutputFormat(RubricDraftSchema) },
        betas: this.claude.fallback.betas,
        fallbacks: this.claude.fallback.fallbacks,
      });
      if (!response.parsed_output) throw new BadRequestException(`Rascunho inválido (stop_reason=${response.stop_reason})`);
      draft = response.parsed_output;
    } else {
      draft = mockRubricDraft(skill.name);
      promptVersion = 'mock-v1';
    }
    const last = await this.prisma.skillRubric.findFirst({ where: { skillId }, orderBy: { version: 'desc' } });
    return this.prisma.skillRubric.create({
      data: {
        skillId,
        version: (last?.version ?? 0) + 1,
        status: 'DRAFT',
        promptVersion,
        competencies: { create: normalizeCompetencies(draft.competencies) },
      },
      include: { competencies: true },
    });
  }

  async update(rubricId: string, competencies: RubricDraft['competencies']) {
    const rubric = await this.prisma.skillRubric.findUnique({ where: { id: rubricId } });
    if (!rubric) throw new NotFoundException();
    if (rubric.status !== 'DRAFT') throw new ConflictException('Só rascunhos podem ser editados; crie uma nova versão');
    await this.prisma.$transaction([
      this.prisma.competency.deleteMany({ where: { rubricId } }),
      this.prisma.competency.createMany({
        data: normalizeCompetencies(competencies).map((c) => ({ ...c, rubricId })),
      }),
    ]);
    return this.prisma.skillRubric.findUnique({ where: { id: rubricId }, include: { competencies: true } });
  }

  /** Aprova a versão; a aprovada anterior é aposentada (entrevistas antigas continuam apontando para ela). */
  async approve(user: CurrentUser, rubricId: string) {
    const rubric = await this.prisma.skillRubric.findUnique({ where: { id: rubricId }, include: { competencies: true } });
    if (!rubric) throw new NotFoundException();
    if (rubric.status !== 'DRAFT') throw new ConflictException('Só rascunhos podem ser aprovados');
    if (rubric.competencies.length === 0) throw new BadRequestException('A rubrica não tem competências');
    await this.prisma.$transaction([
      this.prisma.skillRubric.updateMany({
        where: { skillId: rubric.skillId, status: 'APPROVED' },
        data: { status: 'RETIRED' },
      }),
      this.prisma.skillRubric.update({
        where: { id: rubricId },
        data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }
}

function normalizeCompetencies(list: RubricDraft['competencies']) {
  const seen = new Set<string>();
  return list.map((c, i) => {
    let key = c.key
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `competencia-${i + 1}`;
    while (seen.has(key)) key = `${key}-${i + 1}`;
    seen.add(key);
    return {
      key,
      name: c.name,
      kind: c.kind,
      weight: Math.min(3, Math.max(1, Math.round(c.weight))),
      levels: c.levels,
      anchorQuestions: c.anchorQuestions,
    };
  });
}
