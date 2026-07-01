import {
  createParamDecorator,
  type ExecutionContext,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";

export interface TSortEntry {
  column: string;
  order?: "asc" | "desc";
}

const sortItemRegex = /^([a-zA-Z_]\w*)(?::(asc|desc))?$/;

export const SortBy = createParamDecorator(
  (
    allowedColumns: string[] | undefined,
    ctx: ExecutionContext,
  ): TSortEntry[] | undefined => {
    const columns = Array.isArray(allowedColumns) ? allowedColumns : [];
    const request = ctx.switchToHttp().getRequest<Request>();
    const sortParam = request.query.sort as string | undefined;

    if (!sortParam) return undefined;

    const items = sortParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const result: TSortEntry[] = [];

    for (const item of items) {
      const match = sortItemRegex.exec(item);
      if (!match) {
        throw new BadRequestException(
          `Invalid sort format: "${item}". Expected "column:order" or "column".`,
        );
      }

      const [, columnName, order] = match;

      if (columns.length > 0 && !columns.includes(columnName)) {
        throw new BadRequestException(
          `Invalid sort column: "${columnName}". Allowed: ${columns.join(", ")}`,
        );
      }

      result.push({
        column: columnName,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        order: (order as "asc" | "desc") ?? "asc",
      });
    }

    return result;
  },
);
