import {
  createParamDecorator,
  type ExecutionContext,
  BadRequestException,
} from "@nestjs/common";

export interface TSortEntry {
  columnName: string;
  order?: "asc" | "desc";
}

const sortItemRegex = /^([a-zA-Z_]\w*)(?::(asc|desc))?$/;

export const SortBy = createParamDecorator(
  (allowedColumns: string[] | undefined, ctx: ExecutionContext): TSortEntry[] | undefined => {
    const columns = Array.isArray(allowedColumns) ? allowedColumns : [];
    const request = ctx.switchToHttp().getRequest();
    const sortParam = request.query["sort"] as string | undefined;

    if (!sortParam) return undefined;

    const items = sortParam.split(",").map((s) => s.trim()).filter(Boolean);

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

      result.push({ columnName, order: (order as "asc" | "desc") ?? "asc" });
    }

    return result;
  },
);
