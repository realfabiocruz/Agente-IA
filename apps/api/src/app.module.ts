import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { PlatformModule } from './platform/platform.module';
import { AuthGuard } from './platform/auth.guard';
import { ClaudeModule } from './claude/claude.module';
import { QueueModule } from './queue/queue.module';
import { SkillsModule } from './skills/skills.module';
import { InterviewsModule } from './interviews/interviews.module';
import { EvaluationModule } from './evaluation/evaluation.module';

@Module({
  imports: [
    PrismaModule,
    PlatformModule,
    ClaudeModule,
    QueueModule,
    SkillsModule,
    InterviewsModule,
    EvaluationModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
