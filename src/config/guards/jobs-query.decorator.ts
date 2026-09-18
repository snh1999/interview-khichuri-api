import {
  createParamDecorator,
  type ExecutionContext,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { JOB_STATUS } from "@/src/jobs/jobs.dto";

const dateFilterSchema = z.array(
  z.object({
    type: z.enum(["deadline", "interview", "applied"]),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
);

type TDateFilter = z.infer<typeof dateFilterSchema>[number];

export interface TJobsQuery {
  search?: string;
  status?: (typeof JOB_STATUS)[number];
  dateFilter: TDateFilter[];
}

const filtersSchema = z.string().transform((val, ctx) => {
  try {
    return dateFilterSchema.parse(JSON.parse(val));
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "Invalid filters format",
    });
    return z.NEVER;
  }
});

const jobsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(JOB_STATUS).optional(),
  filters: filtersSchema.optional(),
});

export const JobsQuery = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TJobsQuery => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const result = jobsQuerySchema.safeParse(request.query);
    if (!result.success) {
      throw new BadRequestException(z.treeifyError(result.error));
    }
    return {
      ...result.data,
      dateFilter: result.data.filters ?? [],
    };
  },
);
