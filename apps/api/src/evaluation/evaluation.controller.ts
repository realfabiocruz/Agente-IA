import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '../platform/roles.decorator';
import { EvaluationService } from './evaluation.service';

@Controller('interviews')
export class EvaluationController {
  constructor(private readonly evaluation: EvaluationService) {}

  /** Reprocessa o dossiê (ex.: depois de mudar o prompt do avaliador). */
  @Roles('REVIEWER', 'ADMIN')
  @Post(':id/reevaluate')
  reevaluate(@Param('id', ParseUUIDPipe) id: string) {
    return this.evaluation.enqueue(id);
  }
}
