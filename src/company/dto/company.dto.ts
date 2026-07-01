import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1),
});

export class CreateCompanyDto extends createZodDto(createSchema) {}

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
});

export class UpdateCompanyDto extends createZodDto(updateSchema) {}
