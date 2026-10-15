import type { TFileOp } from "./portfolio.dto";

export interface IApplyOperationsResult {
  files: Record<string, string>;
  applied: string[];
  errors: string[];
}

interface IOpOutcome {
  applied?: string;
  error?: string;
}

// The entry points the Sandpack project cannot run without;
// an AI `delete` op must not remove them (the client refuses it too, but ops bypass that).
// /styles.css is `/index.js`'s import target, so it is part of the contract.
const PROTECTED_ENTRY_FILES = new Set([
  "/App.js",
  "/styles.css",
  "/public/index.html",
]);

type TSearchOutcome =
  { content: string } | { error: "not-found" | "ambiguous" };

const WHITESPACE = /\s+/g;

// Ops may arrive as `App.js` while the project uses `/App.js`.
export const normalizePath = (path: string): string =>
  path.startsWith("/") ? path : `/${path}`;

// A `..` segment is rejected rather than normalized: the sandbox must not escape its own root.
const hasTraversal = (path: string): boolean => path.split("/").includes("..");

const normalizeLine = (line: string): string =>
  line.replace(WHITESPACE, " ").trim();

const normalizeWhitespace = (value: string): string =>
  value.split("\n").map(normalizeLine).join("\n").trim();

const countOccurrences = (content: string, search: string): number =>
  content.split(search).length - 1;

const findLineWindows = (
  contentLines: string[],
  searchLines: string[],
): number[] => {
  const matches: number[] = [];
  for (let i = 0; i <= contentLines.length - searchLines.length; i += 1) {
    if (
      searchLines.every(
        (line, j) => normalizeLine(contentLines[i + j]) === line,
      )
    ) {
      matches.push(i);
    }
  }

  return matches;
};

// Exact match first; fall back to a line-by-line comparison that ignores the indentation/whitespace differences the model commonly introduces.
// A search that matches more than once is rejected rather than silently editing the first occurrence.
const searchReplace = (
  content: string,
  search: string,
  replace: string,
): TSearchOutcome => {
  const exactMatches = countOccurrences(content, search);
  if (exactMatches > 1) {
    return { error: "ambiguous" };
  }
  if (exactMatches === 1) {
    return { content: content.replace(search, () => replace) };
  }

  const contentLines = content.split("\n");
  const searchLines = normalizeWhitespace(search).split("\n");
  const windows = findLineWindows(contentLines, searchLines);

  if (windows.length > 1) {
    return { error: "ambiguous" };
  }
  if (windows.length === 0) {
    return { error: "not-found" };
  }

  const index = windows[0];
  return {
    content: [
      ...contentLines.slice(0, index),
      replace,
      ...contentLines.slice(index + searchLines.length),
    ].join("\n"),
  };
};

const applyCreate = (
  files: Record<string, string>,
  op: TFileOp,
  knownPaths: ReadonlySet<string>,
): IOpOutcome => {
  if (!op.content) {
    return { error: `create ${op.path}: missing content` };
  }

  // A file that exists only in the manifest had its content withheld;
  // turning it into a `create` would silently discard what the client still holds.
  if (knownPaths.has(op.path) && !Object.hasOwn(files, op.path)) {
    return {
      error: `create ${op.path}: file exists but was not provided; use update`,
    };
  }

  files[op.path] = op.content;
  return { applied: `created ${op.path}` };
};

const applyUpdate = (
  files: Record<string, string>,
  op: TFileOp,
): IOpOutcome => {
  if (!Object.hasOwn(files, op.path)) {
    return { error: `update ${op.path}: file not found` };
  }

  const search = op.search;
  const replacement = op.replace;
  if (!search || replacement === null || replacement === undefined) {
    return { error: `update ${op.path}: missing search/replace` };
  }

  const next = searchReplace(files[op.path], search, replacement);
  if ("error" in next) {
    return {
      error:
        next.error === "ambiguous"
          ? `update ${op.path}: search string is ambiguous`
          : `update ${op.path}: search string not found`,
    };
  }

  files[op.path] = next.content;
  return { applied: `updated ${op.path}` };
};

const applyDelete = (
  files: Record<string, string>,
  op: TFileOp,
  knownPaths: ReadonlySet<string>,
): IOpOutcome => {
  if (PROTECTED_ENTRY_FILES.has(op.path)) {
    return { error: `delete ${op.path}: cannot delete an entry file` };
  }

  // A file whose content was not sent (only listed in the manifest) can still be deleted; the client reconciles the removal from `applied`.
  if (!(Object.hasOwn(files, op.path) || knownPaths.has(op.path))) {
    return { error: `delete ${op.path}: file not found` };
  }

  Reflect.deleteProperty(files, op.path);
  return { applied: `deleted ${op.path}` };
};

const applyOperation = (
  files: Record<string, string>,
  op: TFileOp,
  knownPaths: ReadonlySet<string>,
): IOpOutcome => {
  switch (op.op) {
    case "create":
      return applyCreate(files, op, knownPaths);
    case "update":
      return applyUpdate(files, op);
    case "delete":
      return applyDelete(files, op, knownPaths);
  }
};

export const applyFileOperations = (
  currentFiles: Record<string, string>,
  operations: TFileOp[],
  knownPaths: Iterable<string> = [],
): IApplyOperationsResult => {
  const files = { ...currentFiles };
  const applied: string[] = [];
  const errors: string[] = [];
  const known = new Set([...knownPaths].map(normalizePath));

  for (const op of operations) {
    if (hasTraversal(op.path)) {
      errors.push(`invalid path: ${op.path}`);
      continue;
    }

    const outcome = applyOperation(
      files,
      { ...op, path: normalizePath(op.path) },
      known,
    );

    if (outcome.applied) {
      applied.push(outcome.applied);
    }
    if (outcome.error) {
      errors.push(outcome.error);
    }
  }

  return { files, applied, errors };
};
