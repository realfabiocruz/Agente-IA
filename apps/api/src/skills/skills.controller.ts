import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { Roles, User } from '../platform/roles.decorator';
import type { CurrentUser } from '../platform/types';
import { CompetencyDraftSchema } from './rubric.prompt';
import { SkillsService } from './skills.service';

const PatchBody = z.object({
  competencies: z.array(CompetencyDraftSchema.extend({ weight: z.number().int().min(1).max(3) })).min(1),
});

@Controller()
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get('skills')
  list() {
    return this.skills.list();
  }

  @Roles('ADMIN', 'REVIEWER')
  @Get('skills/:skillId/rubrics')
  rubrics(@Param('skillId', ParseUUIDPipe) skillId: string) {
    return this.skills.rubrics(skillId);
  }

  @Roles('ADMIN')
  @Post('skills/:skillId/rubrics/draft')
  draft(@Param('skillId', ParseUUIDPipe) skillId: string) {
    return this.skills.draft(skillId);
  }

  @Roles('ADMIN')
  @Patch('rubrics/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PatchBody)) body: z.infer<typeof PatchBody>) {
    return this.skills.update(id, body.competencies);
  }

  @Roles('ADMIN')
  @Post('rubrics/:id/approve')
  approve(@User() user: CurrentUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.skills.approve(user, id);
  }
}
