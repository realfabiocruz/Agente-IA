import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type { InterviewStatus } from '@prisma/client';
import { ZodPipe } from '../common/zod.pipe';
import { Roles, User } from '../platform/roles.decorator';
import type { CurrentUser } from '../platform/types';
import { InterviewsService } from './interviews.service';

const CreateBody = z.object({ skillId: z.string().uuid(), jobOpeningId: z.string().optional() });
const ConsentBody = z.object({
  accepted: z.literal(true),
  mode: z.enum(['TEXT', 'VOICE']).default('TEXT'),
  voicePref: z.enum(['MALE', 'FEMALE', 'RANDOM']).optional(),
});
const MessageBody = z.object({ text: z.string().max(4000).default('') });
const ContestBody = z.object({ text: z.string().min(10).max(4000) });
const ReviewBody = z.object({
  decision: z.enum(['CONFIRMED', 'ADJUSTED', 'INVALIDATED']),
  adjustments: z
    .array(
      z.object({
        competencyKey: z.string(),
        score: z.number().int().min(1).max(4).nullable(),
        reason: z.string().min(3),
      }),
    )
    .optional(),
  notes: z.string().max(4000).optional(),
});

@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get()
  list(@User() user: CurrentUser, @Query('status') status?: InterviewStatus) {
    return this.interviews.list(user, status);
  }

  @Roles('CANDIDATE')
  @Post()
  create(@User() user: CurrentUser, @Body(new ZodPipe(CreateBody)) body: z.infer<typeof CreateBody>) {
    return this.interviews.create(user, body.skillId, body.jobOpeningId);
  }

  @Get(':id')
  get(@User() user: CurrentUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.getForCandidate(user, id);
  }

  @Roles('CANDIDATE')
  @Post(':id/consent')
  consent(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ConsentBody)) body: z.infer<typeof ConsentBody>,
  ) {
    return this.interviews.consent(user, id, body);
  }

  /** Modo texto: resposta do agente em streaming (SSE sobre POST). */
  @Roles('CANDIDATE')
  @Post(':id/messages')
  async message(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(MessageBody)) body: z.infer<typeof MessageBody>,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      const result = await this.interviews.handleMessage(user, id, body.text, {
        delta: (text) => send('delta', { text }),
        tool: (name, ok) => send('tool', { name, ok }),
      });
      send('done', result);
    } catch (err: unknown) {
      const e = err as { message?: string; getStatus?: () => number };
      send('error', { status: e.getStatus?.() ?? 500, message: e.message ?? 'Erro inesperado' });
    } finally {
      res.end();
    }
  }

  @Roles('CANDIDATE')
  @Post(':id/pause')
  pause(@User() user: CurrentUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.pause(user, id);
  }

  @Roles('CANDIDATE')
  @Post(':id/resume')
  resume(@User() user: CurrentUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.resume(user, id);
  }

  @Roles('CANDIDATE')
  @Post(':id/finish')
  finish(@User() user: CurrentUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.finish(user, id);
  }

  @Roles('CANDIDATE')
  @Post(':id/contestations')
  contest(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ContestBody)) body: z.infer<typeof ContestBody>,
  ) {
    return this.interviews.contest(user, id, body.text);
  }

  @Roles('REVIEWER', 'ADMIN')
  @Get(':id/report')
  report(@Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.report(id);
  }

  @Roles('REVIEWER', 'ADMIN')
  @Post(':id/review')
  review(
    @User() user: CurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ReviewBody)) body: z.infer<typeof ReviewBody>,
  ) {
    return this.interviews.review(user, id, body);
  }
}

@Controller('skills')
export class RankingController {
  constructor(private readonly interviews: InterviewsService) {}

  @Roles('REVIEWER', 'ADMIN')
  @Get(':skillId/ranking')
  ranking(@Param('skillId', ParseUUIDPipe) skillId: string, @Query('rubricVersion') rubricVersion?: string) {
    return this.interviews.ranking(skillId, rubricVersion ? Number(rubricVersion) : undefined);
  }
}
