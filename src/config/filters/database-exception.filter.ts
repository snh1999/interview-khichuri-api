import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
} from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";

interface TDatabaseErrorInfo {
  code: string;
  detail?: string;
  message?: string;
  columnName?: string;
  tableName?: string;
}

const DATABASE_ERROR_STATUS: Partial<Record<string, HttpStatus>> = {
  "23502": HttpStatus.BAD_REQUEST,
  "23503": HttpStatus.CONFLICT,
  "23505": HttpStatus.CONFLICT,
  SQLITE_CONSTRAINT_UNIQUE: HttpStatus.CONFLICT,
  SQLITE_CONSTRAINT_PRIMARYKEY: HttpStatus.CONFLICT,
  SQLITE_CONSTRAINT_FOREIGNKEY: HttpStatus.CONFLICT,
  SQLITE_CONSTRAINT_NOTNULL: HttpStatus.BAD_REQUEST,
};

const PG_UNIQUE_DETAIL =
  /Key \((?<columns>[^)]+)\)=\((?<values>.*)\) already exists/u;
const PG_KEY_COLUMNS = /Key \((?<columns>[^)]+)\)=/u;
const PG_NOT_NULL_COLUMN = /column "(?<column>[^"]+)"/u;
const PG_STILL_REFERENCED = /is still referenced from table "(?<table>[^"]+)"/u;
const PG_MISSING_REFERENCE = /is not present in table "(?<table>[^"]+)"/u;
const SQLITE_CONSTRAINT_TARGET = /constraint failed: (?<targets>.+)$/u;
const MAX_CAUSE_DEPTH = 5;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toDatabaseErrorInfo(
  candidate: Record<string, unknown>,
): TDatabaseErrorInfo | undefined {
  const code = asString(candidate.code);
  if (!code) {
    return;
  }
  return {
    code,
    detail: asString(candidate.detail),
    message: asString(candidate.message),
    columnName: asString(candidate.column_name),
    tableName: asString(candidate.table_name),
  };
}

function findDatabaseError(error: unknown): TDatabaseErrorInfo | undefined {
  let current: unknown = error;
  let depth = 0;

  while (
    typeof current === "object" &&
    current !== null &&
    depth < MAX_CAUSE_DEPTH
  ) {
    const candidate = current as Record<string, unknown>;
    const info = toDatabaseErrorInfo(candidate);
    if (info) {
      return info;
    }
    current = candidate.cause;
    depth += 1;
  }

  return;
}

function extractColumns(info: TDatabaseErrorInfo): string[] {
  const pgKey = PG_KEY_COLUMNS.exec(info.detail ?? "");
  const pgColumns = pgKey?.groups?.columns;
  if (pgColumns) {
    return pgColumns.split(",").map((column) => column.trim());
  }

  const pgNotNull = PG_NOT_NULL_COLUMN.exec(info.message ?? "");
  const pgColumn = pgNotNull?.groups?.column;
  if (pgColumn) {
    return [pgColumn];
  }

  const sqliteTargets = SQLITE_CONSTRAINT_TARGET.exec(info.message ?? "")
    ?.groups?.targets;
  if (sqliteTargets) {
    return sqliteTargets
      .split(",")
      .map((target) => target.trim().split(".").at(-1) ?? target.trim());
  }

  return info.columnName ? [info.columnName] : [];
}

function extractValues(info: TDatabaseErrorInfo): string[] {
  const values = PG_UNIQUE_DETAIL.exec(info.detail ?? "")?.groups?.values;
  return values ? values.split(",").map((value) => value.trim()) : [];
}

function extractTable(info: TDatabaseErrorInfo): string | undefined {
  if (info.tableName) {
    return info.tableName;
  }
  const targets = SQLITE_CONSTRAINT_TARGET.exec(info.message ?? "")?.groups
    ?.targets;
  return targets?.split(",").at(0)?.trim().split(".").at(0);
}

function humanizeTable(table: string): string {
  return table.replaceAll("_", " ").trim();
}

function singularize(label: string): string {
  if (label.endsWith("ies")) {
    return `${label.slice(0, -3)}y`;
  }
  if (label.endsWith("s")) {
    return label.slice(0, -1);
  }
  return label;
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function entityLabel(table: string): string {
  return capitalizeFirst(singularize(humanizeTable(table)));
}

function humanizeColumn(column: string): string {
  return column.replaceAll("_", " ");
}

function uniqueMessage(
  columns: string[],
  values: string[],
  table?: string,
): string {
  const entity = table ? entityLabel(table) : undefined;

  if (columns.length === 0) {
    return entity ? `${entity} already exists` : "Value already exists";
  }

  const pairs = columns.map((column, index) => {
    const value = values.at(index);
    return value === undefined ? column : `${column} "${value}"`;
  });

  if (columns.length === 1) {
    const pair = pairs[0];
    if (!entity) {
      return `${pair} already exists`;
    }
    return values.at(0) === undefined
      ? `${entity} ${pair} already exists`
      : `${entity} with ${pair} already exists`;
  }

  return entity
    ? `${entity} with these values already exists: ${pairs.join(", ")}`
    : `These values already exist: ${pairs.join(", ")}`;
}

function notNullMessage(info: TDatabaseErrorInfo, column?: string): string {
  if (!column) {
    return "Missing required field";
  }
  return info.tableName
    ? `${entityLabel(info.tableName)} requires ${column}`
    : `Missing required field: ${column}`;
}

function foreignKeyMessage(
  columns: string[],
  info: TDatabaseErrorInfo,
): string {
  const entity = info.tableName ? entityLabel(info.tableName) : undefined;
  const column = columns.at(0);

  const stillReferenced = PG_STILL_REFERENCED.exec(info.detail ?? "")?.groups
    ?.table;
  if (stillReferenced) {
    return `Cannot delete ${entity ?? "value"}: still referenced by ${humanizeTable(stillReferenced)}`;
  }

  if (!column) {
    return "Invalid reference";
  }

  const missing = PG_MISSING_REFERENCE.exec(info.detail ?? "")?.groups?.table;
  return missing
    ? `${entity ?? "Row"} references a missing ${singularize(humanizeTable(missing))} (${column})`
    : `Invalid reference for ${column}`;
}

function buildMessage(code: string, info: TDatabaseErrorInfo): string {
  const columns = extractColumns(info).map((column) =>
    capitalizeFirst(humanizeColumn(column)),
  );

  switch (code) {
    case "23505":
    case "SQLITE_CONSTRAINT_UNIQUE":
    case "SQLITE_CONSTRAINT_PRIMARYKEY": {
      return uniqueMessage(columns, extractValues(info), extractTable(info));
    }
    case "23502":
    case "SQLITE_CONSTRAINT_NOTNULL": {
      return notNullMessage(info, columns.at(0));
    }
    case "23503":
    case "SQLITE_CONSTRAINT_FOREIGNKEY": {
      return foreignKeyMessage(columns, info);
    }
    default: {
      return "Database request failed";
    }
  }
}

export function toHttpException(error: unknown): HttpException | null {
  if (error instanceof HttpException) {
    return error;
  }

  const info = findDatabaseError(error);
  if (!info) {
    return null;
  }

  const status = DATABASE_ERROR_STATUS[info.code];
  if (status === undefined) {
    return null;
  }

  return new HttpException(buildMessage(info.code, info), status);
}

@Catch()
export class DatabaseExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  public constructor(applicationRef: HttpAdapterHost) {
    super(applicationRef.httpAdapter);
  }

  public override catch(exception: unknown, host: ArgumentsHost): void {
    const mapped = toHttpException(exception);

    // Recognized constraint errors are converted to HttpExceptions, which
    // BaseExceptionFilter treats as expected client errors and does not log.
    // Log the original failure so recurring database errors stay visible.
    if (mapped && mapped !== exception) {
      const info = findDatabaseError(exception);
      this.logger.error(
        `Database error ${info?.code ?? "unknown"}${info?.message ? `: ${info.message}` : ""}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    super.catch(mapped ?? exception, host);
  }
}
