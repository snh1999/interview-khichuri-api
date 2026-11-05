import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { requiredStr } from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import { MAX_DESCRIPTION_LENGTH } from "@/src/crawl/crawl.constants";
import {
  COMPANY_PROVIDERS,
  JOB_STATES,
} from "@/src/database/database.constants";

export const ADMIN_USER_SORTABLE = ["name", "email", "role", "createdAt"];

export const ADMIN_JOB_SORTABLE = [
  "title",
  "companyName",
  "state",
  "provider",
  "missedCrawls",
  "createdAt",
  "stateChangedAt",
  "closedAt",
];

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const adminUsersQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  banned: booleanString.optional(),
  verified: booleanString.optional(),
});

export type TAdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const AdminUsersQuery = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TAdminUsersQuery => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const result = adminUsersQuerySchema.safeParse(request.query);
    if (!result.success) {
      throw new BadRequestException(z.treeifyError(result.error));
    }
    return result.data;
  },
);

const adminJobsQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  state: z.enum(JOB_STATES).optional(),
  provider: z.enum(COMPANY_PROVIDERS).optional(),
  companyId: z.coerce.number().int().positive().optional(),
});

export type TAdminJobsQuery = z.infer<typeof adminJobsQuerySchema>;

export const AdminJobsQuery = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TAdminJobsQuery => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const result = adminJobsQuerySchema.safeParse(request.query);
    if (!result.success) {
      throw new BadRequestException(z.treeifyError(result.error));
    }
    return result.data;
  },
);

export class SetJobDescriptionDto extends createZodDto(
  z.object({
    description: requiredStr(MAX_DESCRIPTION_LENGTH),
  }),
) {}
