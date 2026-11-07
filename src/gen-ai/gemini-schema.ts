import { jsonSchema, type Schema } from "ai";
import { z } from "zod";

type TJsonSchemaNode = Record<string, unknown>;

/**
 * Gemini's `responseJsonSchema` supports a subset of JSON Schema. Keywords
 * outside that subset (`minLength`, `maxLength`, `pattern`, `default`, ...)
 * are ignored by the server rather than rejected, so the Zod schema can be
 * sent as-is. Length and size limits are therefore not enforced by the model;
 * they are still checked client-side by the `validate` hook below.
 *
 * Very large or deeply nested schemas can still be rejected with a bare
 * `400 INVALID_ARGUMENT`. When that happens the schema is dropped and we put a
 * type-only skeleton of the same Zod schema in the prompt, so the two cannot
 * drift.
 */

const METADATA_KEYS = ["title", "description"] as const;

function firstConcreteType(type: unknown): string {
  if (Array.isArray(type)) {
    const concrete = (type as unknown[]).find((entry) => entry !== "null");
    return typeof concrete === "string" ? concrete : "string";
  }
  return typeof type === "string" ? type : "string";
}

// Zod's `.nullish()`/`.optional()` unions serialise as `anyOf`/`oneOf` with a
// `{ "type": "null" }` member. Collapse them to the meaningful branch so the
// skeleton shows `"field": ""` rather than a union the model has to interpret.
function unwrapNullable(node: TJsonSchemaNode): TJsonSchemaNode {
  const branches = node.anyOf ?? node.oneOf;
  if (!Array.isArray(branches)) {
    return node;
  }

  const concrete = (branches as unknown[]).find(
    (branch): branch is TJsonSchemaNode =>
      typeof branch === "object" &&
      branch !== null &&
      !Array.isArray(branch) &&
      firstConcreteType((branch as TJsonSchemaNode).type) !== "null",
  );

  if (!concrete) {
    return node;
  }

  const inherited = Object.fromEntries(
    METADATA_KEYS.filter((key) => node[key] !== undefined).map((key) => [
      key,
      node[key],
    ]),
  );

  return { ...inherited, ...concrete };
}

function skeleton(node: unknown): unknown {
  if (node === null || typeof node !== "object") {
    return null;
  }

  if (Array.isArray(node)) {
    return [];
  }

  const resolved = unwrapNullable(node as TJsonSchemaNode);
  if (resolved.$ref) {
    return null;
  }
  const enumValues = resolved.enum;

  // A representative enum member is a more useful hint than an empty string.
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    return enumValues[0];
  }

  switch (firstConcreteType(resolved.type)) {
    case "object": {
      const properties = (resolved.properties ?? {}) as TJsonSchemaNode;
      return Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
          key,
          skeleton(value),
        ]),
      );
    }
    case "array": {
      if (resolved.prefixItems) {
        return null;
      }
      return [skeleton(resolved.items)];
    }
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return "";
  }
}

export function jsonSchemaSkeleton(schema: z.ZodType): string | null {
  try {
    // "throw" so a schema with a transform (or anything else JSON Schema cannot
    // express) bails to null instead of rendering a skeleton that lies about the
    // field's type. The response schema keeps "any" -- it only strips keywords.
    const raw: TJsonSchemaNode = z.toJSONSchema(schema, {
      io: "output",
      unrepresentable: "throw",
    });

    const result = skeleton(raw);
    const isPlainObject =
      typeof result === "object" && result !== null && !Array.isArray(result);
    if (isPlainObject) {
      return JSON.stringify(result, null, 2);
    }
    return null;
  } catch {
    return null;
  }
}

export function withJsonShape(prompt: string, shape: string): string {
  return `${prompt}

Return a single JSON object with exactly this shape. The values below show the
expected type for each field, not real data: replace every one of them. Use null
for anything you cannot determine, and keep the same keys.

\`\`\`json
${shape}
\`\`\``;
}

const AUTH_ERROR_PATTERN = /api[_ ]?key/i;

/**
 * A rejected `responseJsonSchema` and a rejected prompt are indistinguishable
 * from Google's side -- both are a bare 400 -- so the 400 is the only signal
 * available to decide that retrying without the schema is worth a try.
 */
export function isBadRequest(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status =
    (error as { statusCode?: number; status?: number }).statusCode ??
    (error as { status?: number }).status;
  if (status !== 400) return false;
  const msg =
    (
      error as {
        message?: string;
        error?: { message?: string };
      }
    ).message ??
    (error as { error?: { message?: string } }).error?.message ??
    "";
  return !AUTH_ERROR_PATTERN.test(msg);
}

const toJsonSchema = <T>(schema: z.ZodType<T>): never =>
  z.toJSONSchema(schema, {
    io: "output",
    unrepresentable: "any",
  }) as never;

/**
 * Sends the Zod schema as-is and validates the response against the original,
 * so the app keeps every guarantee the schema was written to provide.
 */
export function toResponseSchema<T>(schema: z.ZodType<T>): Schema<T> {
  return jsonSchema<T>(() => toJsonSchema(schema), {
    validate: async (value) => {
      const result = await schema.safeParseAsync(value);
      return result.success
        ? { success: true as const, value: result.data }
        : { success: false as const, error: result.error };
    },
  });
}

/**
 * Like `toResponseSchema`, but string and array size violations
 * (`too_big`/`too_small`) pass through. Numeric bounds stay enforced. Used
 * where the generated JSON is shown to the user but never written to the
 * database.
 */
export function toLenientSchema<T>(schema: z.ZodType<T>): Schema<T> {
  return jsonSchema<T>(() => toJsonSchema(schema), {
    validate: async (value) => {
      const result = await schema.safeParseAsync(value);
      if (result.success) {
        return { success: true as const, value: result.data };
      }
      const onlySize = result.error.issues.every((issue) => {
        if (issue.code !== "too_big" && issue.code !== "too_small") {
          return false;
        }
        return issue.origin === "string" || issue.origin === "array";
      });
      return onlySize
        ? { success: true as const, value: value as T }
        : { success: false as const, error: result.error };
    },
  });
}
