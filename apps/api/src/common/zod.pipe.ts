import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Dados inválidos', issues: parsed.error.issues });
    }
    return parsed.data;
  }
}
