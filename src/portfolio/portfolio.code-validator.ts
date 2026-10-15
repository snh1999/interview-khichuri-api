// Ported from the tutorial. Post-generation auto-fixer for builder turns.
// The model emits JSX that commonly breaks the Sandpack compile
// (markdown fences, `class=` instead of`className=`, unclosed void tags, a missing default export).
// Repair those before the resulting project is returned.
const VOID_ELEMENTS = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

// A JSX attribute run: quoted strings and one level of brace nesting,
// so `=>` and `>` inside attributes don't terminate the match. `<`/`>` excluded so a run can never cross into the next tag.
const JSX_ATTRIBUTES = String.raw`(?:"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\}|[^<>"'{}])*`;

// Case-sensitive on purpose: `<Input>`/`<Link>` are components, not the void
// elements `<input>`/`<link>`.
const VOID_PATTERNS = VOID_ELEMENTS.map((tag) => ({
  tag,
  pattern: new RegExp(
    String.raw`<${tag}(?=[\s>])(${JSX_ATTRIBUTES}?)(?<!/)>`,
    "g",
  ),
}));

// `\sclass=` (not `\bclass=`) so `data-class=` is left alone; JSX-aware so `=>` earlier in the tag doesn't stop the match.
const CLASS_ATTRIBUTE = new RegExp(
  String.raw`(<[a-zA-Z][\w.-]*${JSX_ATTRIBUTES})\sclass=`,
  "g",
);

const FENCE_PATTERN =
  /^```(?:jsx?|javascript|css|html|tsx?|react)?\s*\n([\s\S]*?)\n```\s*$/;
const FENCE_OPEN = /^```[^\n]*\n/;
const FENCE_CLOSE = /\n```\s*$/;
const JS_EXTENSION = /\.(js|jsx|ts|tsx)$/;
const FILE_EXTENSION = /\.\w+$/;
const DEFAULT_EXPORT = /export\s+default\s+/;
const COMPONENT_DECL =
  /^(?:export\s+)?(?:function\s+(?<fn>[A-Z]\w*)\s*\(|const\s+(?<cn>[A-Z]\w*)\s*=\s*(?:\(|function))/gm;

const isJavaScript = (path: string): boolean => JS_EXTENSION.test(path);

const stripFences = (code: string): string =>
  code
    .replace(FENCE_PATTERN, "$1")
    .replace(FENCE_OPEN, "")
    .replace(FENCE_CLOSE, "");

const fixClassAttribute = (code: string): string =>
  code.replace(CLASS_ATTRIBUTE, "$1 className=");

const selfCloseVoidElements = (code: string): string => {
  let next = code;
  for (const { tag, pattern } of VOID_PATTERNS) {
    next = next.replace(
      pattern,
      (_match, attrs: string | undefined) =>
        `<${tag}${(attrs ?? "").trimEnd()} />`,
    );
  }
  return next;
};

// Prefer the declaration whose name matches the file; fall back to the sole declaration.
// When several declarations exist and none matches the file the component is ambiguous, so leave the file untouched.
const ensureDefaultExport = (code: string, path: string): string => {
  if (DEFAULT_EXPORT.test(code)) {
    return code;
  }

  const names = [...code.matchAll(COMPONENT_DECL)].map(
    (match) => match.groups?.fn ?? match.groups?.cn,
  );
  const base = path.split("/").pop()?.replace(FILE_EXTENSION, "");
  const componentName =
    names.find((name) => name === base) ??
    (names.length === 1 ? names[0] : undefined);

  if (!componentName) {
    return code;
  }

  return `${code.trimEnd()}\n\nexport default ${componentName};\n`;
};

export const validateAndFixCode = (
  files: Record<string, string>,
): Record<string, string> => {
  const fixed: Record<string, string> = {};

  for (const [path, raw] of Object.entries(files)) {
    let code = stripFences(raw);
    if (isJavaScript(path)) {
      code = fixClassAttribute(code);
      code = selfCloseVoidElements(code);
      code = ensureDefaultExport(code, path);
    }
    fixed[path] = code;
  }

  return fixed;
};
