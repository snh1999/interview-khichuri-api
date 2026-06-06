import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateRoleSchema = z.object({
  name: z.string().trim().min(2),
});

export class CreateRoleDto extends createZodDto(CreateRoleSchema) {}

export const UpdateRoleSchema = z.object({
  name: z.string().trim().min(2).optional(),
  isApproved: z.boolean().optional(),
});

export class UpdateRoleDto extends createZodDto(UpdateRoleSchema) {}
