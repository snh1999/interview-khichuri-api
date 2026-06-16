import { PartialType } from "@nestjs/mapped-types";

export class ResumeDto {}

export class UpdateResumeDto extends PartialType(ResumeDto) {}
