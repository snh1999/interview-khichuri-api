import { z } from "zod";

import { TINY_LENGTH, str } from "@/src/common/validation";
import { createZodDto } from "@/src/config/utils/zod-dto";
import { normalizeName } from "@/src/lookups/lookups.helpers";

const MIN_NORMALIZED_LENGTH = 2;

const lookupName = () =>
  str(TINY_LENGTH)
    .transform(normalizeName)
    .refine((name) => name.length >= MIN_NORMALIZED_LENGTH, {
      message: `Must be at least ${MIN_NORMALIZED_LENGTH} characters once punctuation is removed`,
    });

const createSchema = z.object({
  name: lookupName(),
});

export class CreateLookupDto extends createZodDto(createSchema) {}

const updateSchema = z.object({
  name: lookupName().nullish(),
  isApproved: z.boolean().optional(),
});

export class UpdateLookupDto extends createZodDto(updateSchema) {}

const batchCreateSchema = z.object({
  names: z.array(lookupName()).min(1).max(50),
});

export class BatchLookupNamesDto extends createZodDto(batchCreateSchema) {}
