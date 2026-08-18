import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { TINY_LENGTH, str } from "@/src/common/validation";

const createSchema = z.object({
  name: str(TINY_LENGTH).min(2),
});

export class CreateLookupDto extends createZodDto(createSchema) {}

const updateSchema = z.object({
  name: str(TINY_LENGTH).min(2).nullish(),
  isApproved: z.boolean().optional(),
});

export class UpdateLookupDto extends createZodDto(updateSchema) {}

const batchCreateSchema = z.object({
  names: z.array(str(TINY_LENGTH).min(2)).min(1).max(50),
});

export class BatchLookupNamesDto extends createZodDto(batchCreateSchema) {}
