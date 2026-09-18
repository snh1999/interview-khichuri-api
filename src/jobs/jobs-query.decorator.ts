import {
  createParamDecorator,
  type ExecutionContext,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { jobsQuerySchema } from "./jobs.dto";

export const JobsQuery = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const result = jobsQuerySchema.safeParse(request.query);
    if (!result.success) {
      throw new BadRequestException(z.treeifyError(result.error));
    }
    return result.data;
  },
);
