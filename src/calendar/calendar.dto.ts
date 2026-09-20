import { z } from "zod";

import {
  DEFAULT_MAX_STRING_LENGTH,
  requiredStr,
} from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import type { TCalendarEventInsert } from "@/src/database/database.types";

export const CALENDAR_EVENT_COLOR_KEYS = [
  "rose",
  "amber",
  "emerald",
  "sky",
  "violet",
  "fuchsia",
] as const;

const createCalendarEventFields = z.object({
  title: requiredStr(DEFAULT_MAX_STRING_LENGTH),
  description: requiredStr(DEFAULT_MAX_STRING_LENGTH),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  source: z.enum(["custom", "job"]).default("custom"),
  sourceId: z.string().nullish(),
  color: z.enum(CALENDAR_EVENT_COLOR_KEYS).nullish(),
}) satisfies z.ZodType<Omit<TCalendarEventInsert, "userId">>;

const createCalendarEventSchema = createCalendarEventFields.superRefine(
  (data, ctx) => {
    if (data.endDate.getTime() <= data.startDate.getTime()) {
      ctx.addIssue({
        code: "custom",
        message: "endDate must be after startDate",
        path: ["endDate"],
      });
    }
  },
);

export class CreateCalendarEventDto extends createZodDto(
  createCalendarEventSchema,
) {}

const updateCalendarEventSchema = z
  .object({
    title: requiredStr(DEFAULT_MAX_STRING_LENGTH).optional(),
    description: requiredStr(DEFAULT_MAX_STRING_LENGTH).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    color: z.enum(CALENDAR_EVENT_COLOR_KEYS).nullish(),
  })
  .superRefine((data, ctx) => {
    if (
      data.startDate &&
      data.endDate &&
      data.endDate.getTime() < data.startDate.getTime()
    ) {
      ctx.addIssue({
        code: "custom",
        message: "endDate must be after startDate",
        path: ["endDate"],
      });
    }
  });

export class UpdateCalendarEventDto extends createZodDto(
  updateCalendarEventSchema,
) {}
