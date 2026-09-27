import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

import { SKIP_ENVELOPE_KEY } from "./skip-envelope.decorator";

type WithMessage<T> = (T & { message?: string }) | undefined | null;

interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<
  WithMessage<T>,
  ApiResponse<WithMessage<T>>
> {
  public intercept(
    context: ExecutionContext,
    next: CallHandler<WithMessage<T>>,
  ): Observable<ApiResponse<WithMessage<T>>> {
    const skipEnvelope: unknown =
      Reflect.getMetadata(SKIP_ENVELOPE_KEY, context.getHandler()) ??
      Reflect.getMetadata(SKIP_ENVELOPE_KEY, context.getClass());

    if (skipEnvelope) {
      // SkipEnvelope streams pass through raw on purpose (SSE/text are not wrapped in the envelope);
      // the cast only satisfies the interceptor's declared return type — no transformation is applied here.
      return next.handle() as unknown as Observable<
        ApiResponse<WithMessage<T>>
      >;
    }

    const res = context.switchToHttp().getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      map((data) => ({
        statusCode: res.statusCode,
        message: data?.message ?? "",
        data: data ?? null,
      })),
    );
  }
}
