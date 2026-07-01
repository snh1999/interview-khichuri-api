import {
  createParamDecorator,
  type ExecutionContext,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import type { TPagination } from "@/src/database/database.types";

const schema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const Pagination = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TPagination | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const query = request.query as Record<string, unknown>;
    if (query.page === undefined && query.limit === undefined) {
      return undefined;
    }
    const result = schema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(z.treeifyError(result.error));
    }
    const { page, limit } = result.data;
    return { offset: (page - 1) * limit, limit };
  },
);
