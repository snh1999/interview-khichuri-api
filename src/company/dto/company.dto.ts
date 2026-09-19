import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { SHORT_LENGTH, requiredStr } from "@/src/common/validation";

const createSchema = z.object({
  name: requiredStr(SHORT_LENGTH),
});

export class CreateCompanyDto extends createZodDto(createSchema) {}

const updateSchema = z.object({
  name: requiredStr(SHORT_LENGTH).optional(),
});

export class UpdateCompanyDto extends createZodDto(updateSchema) {}
