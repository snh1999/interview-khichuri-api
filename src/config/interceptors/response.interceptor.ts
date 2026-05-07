/* eslint-disable import-x/no-deprecated*/
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

type WithMessage<T> = T & { message?: string };

type ApiResponse<T> = {
  statusCode: number;
  message: string;
  data: T;
};

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<
  WithMessage<T>,
  ApiResponse<WithMessage<T>>
> {
  public intercept(
    context: ExecutionContext,
    next: CallHandler<WithMessage<T>>,
  ): Observable<ApiResponse<WithMessage<T>>> {
    const res = context.switchToHttp().getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      map((data) => ({
        statusCode: res.statusCode,
        message: data.message ?? '',
        data,
      })),
    );
  }
}
