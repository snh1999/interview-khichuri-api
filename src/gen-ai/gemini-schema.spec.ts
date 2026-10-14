import { asSchema } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { extractedProfileSchema } from "@/src/resume/resume.dto";

import {
  isBadRequest,
  jsonSchemaSkeleton,
  toGeminiResponseSchema,
  withJsonShape,
} from "./gemini-schema";

// The subset Google documents for `responseJsonSchema`:
// https://ai.google.dev/gemini-api/docs/generate-content/structured-output
const DOCUMENTED = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "description",
  "enum",
  "format",
  "minimum",
  "maximum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "anyOf",
  "oneOf",
  "allOf",
  "$ref",
  "$defs",
  "definitions",
]);

const NESTED_MAPS = new Set(["properties", "$defs", "definitions"]);

const unsupportedKeywords = (node: unknown, found = new Set<string>()) => {
  if (Array.isArray(node)) {
    node.forEach((entry) => unsupportedKeywords(entry, found));
    return found;
  }
  if (node === null || typeof node !== "object") {
    return found;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (NESTED_MAPS.has(key)) {
      Object.values(value as object).forEach((entry) =>
        unsupportedKeywords(entry, found),
      );
      continue;
    }
    if (!DOCUMENTED.has(key)) {
      found.add(key);
    }
    unsupportedKeywords(value, found);
  }
  return found;
};

const wire = <T>(schema: z.ZodType<T>): Record<string, unknown> =>
  asSchema(toGeminiResponseSchema(schema)).jsonSchema as Record<
    string,
    unknown
  >;

describe("toGeminiResponseSchema", () => {
  it("sends nothing outside the documented subset, at any depth", () => {
    expect(unsupportedKeywords(wire(extractedProfileSchema))).toEqual(
      new Set(),
    );
  });

  it("strips the keywords a Zod validation schema adds", () => {
    const constrained = z.object({
      name: z.string().min(1).max(5).default("x"),
      tags: z.array(z.string()).max(3).default([]),
    });

    const sent = JSON.stringify(wire(constrained));

    for (const keyword of ["$schema", "default", "minLength", "maxLength"]) {
      expect(sent).not.toContain(`"${keyword}"`);
    }
  });

  // Stripping the constraints must not flatten the shape, or Gemini has nothing
  // to constrain the output to.
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

  it("drops the title keyword but keeps a field named title", () => {
    const sent = JSON.stringify(wire(z.object({ title: z.string() })));

    expect(sent).toContain('"title"');
    expect(unsupportedKeywords(JSON.parse(sent))).toEqual(new Set());
  });

  it("recurses into anyOf branches and $defs", () => {
    const sent = JSON.stringify(
      wire(
        z.object({
          either: z.union([
            z.object({ a: z.string().max(3) }),
            z.object({ b: z.string().min(1) }),
          ]),
        }),
      ),
    );

    expect(sent).toContain('"anyOf"');
    expect(sent).not.toContain('"maxLength"');
    expect(sent).not.toContain('"minLength"');
  });

  // The point of the wrapper: Gemini gets a looser schema, the app keeps the
  // guarantees the Zod schema was written to provide.
  it("validates against the original Zod schema, not the stripped one", async () => {
    const schema = z.object({
      count: z.number().int().min(1).max(10),
      email: z.email(),
    });
    const { validate } = asSchema(toGeminiResponseSchema(schema));

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
