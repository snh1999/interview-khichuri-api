import type { z } from "zod";

export interface ZodDto<Z extends z.ZodType = z.ZodType> {
  new (): z.infer<Z>;
  readonly schema: Z;
}

export function createZodDto<Z extends z.ZodType>(zodSchema: Z): ZodDto<Z> {
  class ZodDtoClass {
    static readonly schema = zodSchema;
  }
  return ZodDtoClass as unknown as ZodDto<Z>;
}
