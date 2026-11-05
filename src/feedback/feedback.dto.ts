import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import {
  DEFAULT_MAX_STRING_LENGTH,
  URL_LENGTH,
  requiredStr,
} from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";

export const FEEDBACK_TYPES = ["bug", "visit"] as const;
export const FEEDBACK_STATUSES = ["new", "triaged", "resolved"] as const;
export const ADMIN_FEEDBACK_SORTABLE = [
  "createdAt",
  "updatedAt",
  "type",
  "status",
] as const;

const createFeedbackSchema = z.object({
  message: z
    .string()
    .min(1)
    .max(
      DEFAULT_MAX_STRING_LENGTH,
      `Must be at most ${DEFAULT_MAX_STRING_LENGTH} characters`,
    ),
  route: requiredStr(URL_LENGTH),
});

export class CreateFeedbackDto extends createZodDto(createFeedbackSchema) {}

const visitFeedbackSchema = z.object({
  ref: z.string().max(4096).optional().default(""),
  route: requiredStr(URL_LENGTH),
});

export class VisitFeedbackDto extends createZodDto(visitFeedbackSchema) {}

const adminFeedbackQuerySchema = z.object({
  type: z.enum(FEEDBACK_TYPES).optional(),
  status: z.union([z.enum(FEEDBACK_STATUSES), z.literal("unset")]).optional(),
  q: z.string().trim().min(1).optional(),
});

export type TAdminFeedbackQuery = z.infer<typeof adminFeedbackQuerySchema>;

export const AdminFeedbackQuery = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TAdminFeedbackQuery => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const result = adminFeedbackQuerySchema.safeParse(request.query);
    if (!result.success) {
      throw new BadRequestException(z.treeifyError(result.error));
    }
    return result.data;
  },
);

const updateFeedbackStatusSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).nullable(),
});

export class UpdateFeedbackStatusDto extends createZodDto(
  updateFeedbackStatusSchema,
) {}
