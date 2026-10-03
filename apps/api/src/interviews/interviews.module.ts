import { Module } from '@nestjs/common';
import { InterviewsController, RankingController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { InterviewerService } from './interviewer.service';

@Module({
  controllers: [InterviewsController, RankingController],
  providers: [InterviewsService, InterviewerService],
})
export class InterviewsModule {}
