import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { map } from 'rxjs';

/** Wraps handler results as `{ success: true, data, meta? }`. Handlers may return `{ items, meta }` for lists. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((value) => {
        if (value instanceof StreamableFile) return value;
        if (value && typeof value === 'object' && 'items' in value && 'meta' in value) {
          return { success: true, data: value.items, meta: value.meta };
        }
        return { success: true, data: value ?? null };
      }),
    );
  }
}
