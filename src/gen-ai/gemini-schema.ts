import { jsonSchema, type Schema } from "ai";
import { z } from "zod";

type TJsonSchemaNode = Record<string, unknown>;

/**
 * Gemini's `responseJsonSchema` only accepts a subset of JSON Schema and rejects
 * the entire request with a bare `400 INVALID_ARGUMENT` ("Request contains an
 * invalid argument.", no `fieldViolations`) when it sees a keyword outside that
 * subset. `@ai-sdk/google` forwards validation keywords verbatim -- its
 * `sanitizeResponseJsonSchema` only restructures `properties`/`items`/`anyOf`
 * and strips nothing -- so a Zod schema carrying `minLength`, `maxLength`,
 * `pattern`, `format`, `default`, `minimum`, `maxItems` and
 * `additionalProperties: false` cannot be sent to Gemini as-is.
 *
 * When the schema has to be dropped we still need the model to emit the right
 * shape, so we render a type-only skeleton of the very same Zod schema and put
 * it in the prompt. Deriving it from the schema keeps the two from drifting.
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
    case "array":
      return [skeleton(resolved.items)];
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

export function jsonSchemaSkeleton(schema: z.ZodType): string {
  try {
    const jsonSchema: TJsonSchemaNode = z.toJSONSchema(schema, {
      io: "output",
      unrepresentable: "any",
    });

    return JSON.stringify(skeleton(jsonSchema), null, 2);
  } catch {
    // A schema we cannot render is not a reason to fail the request: the caller
    // falls back to prompting without a shape.
    return "";
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

/**
 * A rejected `responseJsonSchema` and a rejected prompt are indistinguishable
 * from Google's side -- both are a bare 400 -- so the 400 is the only signal
 * available to decide that retrying without the schema is worth a try.
 */
export function isBadRequest(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { statusCode?: number }).statusCode === 400
  );
}

// https://ai.google.dev/gemini-api/docs/generate-content/structured-output
// documents the accepted subset: type, properties, required, additionalProperties,
// description, enum, format, minimum, maximum, items, prefixItems, minItems,
// maxItems, anyOf and $ref. `format` is supported, so an email or uri format is
// not the problem; the keywords below are simply absent from the list, and one
// of them anywhere in the tree fails the whole request.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$comment",
  "title",
  "default",
  "minLength",
  "maxLength",
  "pattern",
  "const",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "uniqueItems",
  "additionalItems",
  "contains",
  "propertyNames",
  "unevaluatedItems",
  "unevaluatedProperties",
  "if",
  "then",
  "else",
  "not",
  "dependentSchemas",
  "dependentRequired",
]);

// Keywords whose value is itself a schema, or an array of schemas.
const NESTED_SCHEMA_KEYS = new Set([
  "items",
  "anyOf",
  "oneOf",
  "allOf",
  "prefixItems",
]);

// Keywords whose value is a map of name -> schema.
const NESTED_SCHEMA_MAP_KEYS = new Set(["properties", "$defs", "definitions"]);

function sanitizeNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(sanitizeNode);
  }

  if (node === null || typeof node !== "object") {
    return node;
  }

  const result: TJsonSchemaNode = {};

  for (const [key, value] of Object.entries(node as TJsonSchemaNode)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) {
      continue;
    }

    if (NESTED_SCHEMA_MAP_KEYS.has(key)) {
      result[key] = Object.fromEntries(
        Object.entries((value ?? {}) as TJsonSchemaNode).map(([name, sub]) => [
          name,
          sanitizeNode(sub),
        ]),
      );
      continue;
    }

    result[key] = NESTED_SCHEMA_KEYS.has(key) ? sanitizeNode(value) : value;
  }

  return result;
}

/**
 * The Zod schema for Google, minus the keywords its `responseJsonSchema` does
 * not accept, with the original Zod schema still attached as the validator --
 * so the model gets a schema it will accept and the app still gets the
 * guarantees the Zod schema was written to provide.
 */
export function toGeminiResponseSchema<T>(schema: z.ZodType<T>): Schema<T> {
  return jsonSchema<T>(
    () =>
      sanitizeNode(
        z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }),
      ) as never,
    {
      validate: async (value) => {
        const result = await schema.safeParseAsync(value);
        return result.success
          ? { success: true as const, value: result.data }
          : { success: false as const, error: result.error };
      },
    },
  );
}
