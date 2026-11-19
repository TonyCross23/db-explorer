import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';
export class ZodPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}
  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException({
        message: 'Please check the highlighted fields.',
        fields: Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message])),
      });
    return result.data;
  }
}
