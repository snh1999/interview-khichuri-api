import { HttpException, Logger } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseExceptionFilter } from "./database-exception.filter";

describe("DatabaseExceptionFilter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a recognized database error before converting it", () => {
    const log = vi.spyOn(Logger.prototype, "error").mockReturnValue(undefined);
    const base = vi
      .spyOn(BaseExceptionFilter.prototype, "catch")
      .mockReturnValue(undefined);
    const filter = new DatabaseExceptionFilter({ httpAdapter: {} } as never);
    const error = Object.assign(new Error("duplicate key"), {
      code: "23505",
      detail: "Key (id)=(1) already exists",
    });
    const host = {} as never;

    filter.catch(error, host);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Database error 23505"),
      expect.any(String),
    );
    expect(base).toHaveBeenCalledWith(expect.any(HttpException), host);
  });

  it("does not log an exception that is already an HttpException", () => {
    const log = vi.spyOn(Logger.prototype, "error").mockReturnValue(undefined);
    vi.spyOn(BaseExceptionFilter.prototype, "catch").mockReturnValue(undefined);
    const filter = new DatabaseExceptionFilter({ httpAdapter: {} } as never);

    filter.catch(new HttpException("bad request", 400), {} as never);

    expect(log).not.toHaveBeenCalled();
  });
});
