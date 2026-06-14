import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(2),
});

export class CreateLookupDto extends createZodDto(createSchema) {}

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  isApproved: z.boolean().optional(),
});

export class UpdateLookupDto extends createZodDto(updateSchema) {}
