import { asSchema } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { extractedProfileSchema } from "@/src/resume/resume.dto";

import {
  isBadRequest,
  jsonSchemaSkeleton,
  toLenientSchema,
  toResponseSchema,
  withJsonShape,
} from "../gemini-schema";

const wire = <T>(schema: z.ZodType<T>): Record<string, unknown> =>
  asSchema(toResponseSchema(schema)).jsonSchema as Record<string, unknown>;

describe("toResponseSchema", () => {
  it("sends the size constraints instead of stripping them", () => {
    const constrained = z.object({
      name: z.string().min(1).max(5).default("x"),
      tags: z.array(z.string()).max(3).default([]),
    });

    const sent = JSON.stringify(wire(constrained));

    for (const keyword of ["minLength", "maxLength", "default"]) {
      expect(sent).toContain(`"${keyword}"`);
    }
  });

  it("keeps title and description, which Gemini uses as guidance", () => {
    const sent = JSON.stringify(
      wire(
        z.object({
          title: z.string().meta({ title: "Job title" }).describe("At most 80"),
        }),
      ),
    );

    expect(sent).toContain('"title":"Job title"');
    expect(sent).toContain('"description":"At most 80"');
  });

  it("keeps the shape, the enums and the null unions", () => {
    const schema = z.object({
      kind: z.enum(["a", "b"]),
      nickname: z.string().nullish(),
      note: z.string().default(""),
      items: z.array(z.object({ id: z.string() })).default([]),
    });

    const sent = JSON.stringify(wire(schema));

    expect(sent).toContain('"kind"');
    expect(sent).toContain('"a"');
    // Gemini documents `type: ["string", "null"]` for nullable properties.
    expect(sent).toContain('["string","null"]');
    expect(sent).toContain('"items"');
  });

  it("keeps format, which Gemini does support", () => {
    expect(JSON.stringify(wire(z.object({ when: z.iso.date() })))).toContain(
      '"format"',
    );
  });

  // Gemini only generates against the schema; the app must still enforce it.
  it("validates against the original Zod schema", async () => {
    const schema = z.object({
      count: z.number().int().min(1).max(10),
      email: z.email(),
    });
    const { validate } = asSchema(toResponseSchema(schema));

    await expect(
      validate?.({ count: 0, email: "a@b.co" }),
    ).resolves.toMatchObject({ success: false });

    await expect(
      validate?.({ count: 5, email: "not-an-email" }),
    ).resolves.toMatchObject({ success: false });

    await expect(
      validate?.({ count: 5, email: "a@b.co" }),
    ).resolves.toMatchObject({ success: true, value: { count: 5 } });
  });
});

describe("toLenientSchema", () => {
  it("accepts size-only violations", async () => {
    const schema = z.object({ title: z.string().max(5) });

    const { validate } = asSchema(toLenientSchema(schema));

    await expect(validate?.({ title: "too long" })).resolves.toMatchObject({
      success: true,
    });
  });

  it("keeps numeric bounds enforced", async () => {
    const schema = z.object({ score: z.number().min(0).max(100) });

    const { validate } = asSchema(toLenientSchema(schema));

    await expect(validate?.({ score: 120 })).resolves.toMatchObject({
      success: false,
    });
    await expect(validate?.({ score: -1 })).resolves.toMatchObject({
      success: false,
    });
    await expect(validate?.({ score: 100 })).resolves.toMatchObject({
      success: true,
    });
  });

  it("still rejects structural violations", async () => {
    const schema = z.object({
      title: z.string().max(5),
      kind: z.enum(["a", "b"]),
    });

    const { validate } = asSchema(toLenientSchema(schema));

    await expect(validate?.({ title: "ok", kind: "c" })).resolves.toMatchObject(
      { success: false },
    );

    await expect(validate?.({ kind: "a" })).resolves.toMatchObject({
      success: false,
    });
  });
});

const skeletonOf = (schema: z.ZodType): unknown => {
  const rendered = jsonSchemaSkeleton(schema);
  if (rendered === null) throw new Error("expected a skeleton");
  return JSON.parse(rendered);
};

describe("jsonSchemaSkeleton", () => {
  it("collapses a nullable union to a single representative value", () => {
    expect(skeletonOf(z.object({ a: z.string().nullish() }))).toEqual({
      a: "",
    });
  });

  it("uses an enum member rather than a blank string", () => {
    expect(skeletonOf(z.object({ kind: z.enum(["a", "b"]) }))).toEqual({
      kind: "a",
    });
  });

  it("keeps arrays, nesting and every key of the real schema", () => {
    const shape = skeletonOf(
      z.object({
        list: z.array(z.object({ name: z.string() })).default([]),
      }),
    );

    expect(shape).toEqual({ list: [{ name: "" }] });
  });

  it("renders the whole resume profile without throwing", () => {
    const shape = skeletonOf(extractedProfileSchema) as {
      workExperience: unknown;
      projects: unknown;
    };

    expect(Object.keys(shape)).toContain("workExperience");
    expect(Array.isArray(shape.projects)).toBe(true);
  });

  it("returns null rather than failing on an unrenderable schema", () => {
    expect(jsonSchemaSkeleton(z.date())).toBeTypeOf("object");
    expect(jsonSchemaSkeleton(z.date())).toBeNull();
  });
});

describe("withJsonShape", () => {
  it("keeps the original prompt and appends the shape", () => {
    const result = withJsonShape("ORIGINAL", '{\n  "a": ""\n}');

    expect(result).toContain("ORIGINAL");
    expect(result).toContain('"a"');
  });
});

describe("isBadRequest", () => {
  it("only matches a 400", () => {
    expect(isBadRequest({ statusCode: 400 })).toBe(true);
    expect(isBadRequest({ statusCode: 429 })).toBe(false);
    expect(isBadRequest({ statusCode: 503 })).toBe(false);
    expect(isBadRequest(new Error("network down"))).toBe(false);
    expect(isBadRequest(null)).toBe(false);
  });
});
it("guards against output schema features that break Gemini structured output", () => {
  expect(
    jsonSchemaSkeleton(z.object({ v: z.string().transform((x) => x) })),
  ).toBeNull();
  expect(jsonSchemaSkeleton(z.date())).toBeNull();
});
