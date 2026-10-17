import { describe, expect, it } from "vitest";

import { applyFileOperations } from "../portfolio.operations";

describe("applyFileOperations", () => {
  it("creates a file it did not have", () => {
    const { files, applied, errors } = applyFileOperations({ "/App.js": "a" }, [
      {
        op: "create",
        path: "/Hero.jsx",
        content: "export default () => null;",
      },
    ]);

    expect(files["/Hero.jsx"]).toBe("export default () => null;");
    expect(applied).toEqual(["created /Hero.jsx"]);
    expect(errors).toEqual([]);
  });

  it("updates an existing file with an exact search snippet", () => {
    const { files, errors } = applyFileOperations(
      { "/App.js": "const a = 1;\nconst b = 2;\n" },
      [
        {
          op: "update",
          path: "/App.js",
          search: "const b = 2;",
          replace: "const b = 3;",
        },
      ],
    );

    expect(files["/App.js"]).toBe("const a = 1;\nconst b = 3;\n");
    expect(errors).toEqual([]);
  });

  it("matches a search snippet whose whitespace differs from the file", () => {
    const { files, errors } = applyFileOperations(
      { "/App.js": "function App() {\n    return <div>hi</div>;\n}\n" },
      [
        {
          op: "update",
          path: "/App.js",
          search: "function App() {\nreturn <div>hi</div>;\n}",
          replace: "function App() {\n    return <div>bye</div>;\n}",
        },
      ],
    );

    expect(files["/App.js"]).toBe(
      "function App() {\n    return <div>bye</div>;\n}\n",
    );
    expect(errors).toEqual([]);
  });

  it("deletes a file", () => {
    const { files, applied, errors } = applyFileOperations(
      { "/App.js": "a", "/Old.jsx": "b" },
      [{ op: "delete", path: "/Old.jsx" }],
    );

    expect(files).toEqual({ "/App.js": "a" });
    expect(applied).toEqual(["deleted /Old.jsx"]);
    expect(errors).toEqual([]);
  });

  it("applies no changes when any operation fails", () => {
    const { files, applied, errors } = applyFileOperations({ "/App.js": "a" }, [
      { op: "update", path: "/Missing.jsx", search: "x", replace: "y" },
      { op: "update", path: "/App.js", search: "not there", replace: "y" },
      { op: "create", path: "/New.jsx", content: "ok" },
    ]);

    expect(files).toEqual({ "/App.js": "a" });
    expect(applied).toEqual([]);
    expect(errors).toEqual([
      "update /Missing.jsx: file not found",
      "update /App.js: search string not found",
    ]);
  });

  it("refuses to delete a protected entry file", () => {
    const { files, applied, errors } = applyFileOperations(
      { "/App.js": "a", "/index.js": "b", "/public/index.html": "c" },
      [
        { op: "delete", path: "/App.js" },
        { op: "delete", path: "/index.js" },
        { op: "delete", path: "/public/index.html" },
      ],
    );

    expect(files).toEqual({
      "/App.js": "a",
      "/index.js": "b",
      "/public/index.html": "c",
    });
    expect(applied).toEqual([]);
    expect(errors).toEqual([
      "delete /App.js: cannot delete an entry file",
      "delete /index.js: cannot delete an entry file",
      "delete /public/index.html: cannot delete an entry file",
    ]);
  });

  it("deletes a file known only from the manifest", () => {
    const { files, applied, errors } = applyFileOperations(
      { "/App.js": "a" },
      [{ op: "delete", path: "/Old.jsx" }],
      ["/App.js", "/Old.jsx"],
    );

    expect(files).toEqual({ "/App.js": "a" });
    expect(applied).toEqual(["deleted /Old.jsx"]);
    expect(errors).toEqual([]);
  });

  it("recreates a file it deleted earlier in the same turn", () => {
    const { files, applied, errors } = applyFileOperations(
      { "/App.js": "a", "/Old.jsx": "b" },
      [
        { op: "delete", path: "/Old.jsx" },
        { op: "create", path: "/Old.jsx", content: "new" },
      ],
      ["/App.js", "/Old.jsx"],
    );

    expect(files["/Old.jsx"]).toBe("new");
    expect(applied).toEqual(["deleted /Old.jsx", "created /Old.jsx"]);
    expect(errors).toEqual([]);
  });

  it("recreates a manifest-only file it deleted earlier in the same turn", () => {
    const { files, applied, errors } = applyFileOperations(
      { "/App.js": "a" },
      [
        { op: "delete", path: "/Old.jsx" },
        { op: "create", path: "/Old.jsx", content: "new" },
      ],
      ["/App.js", "/Old.jsx"],
    );

    expect(files["/Old.jsx"]).toBe("new");
    expect(applied).toEqual(["deleted /Old.jsx", "created /Old.jsx"]);
    expect(errors).toEqual([]);
  });

  it("rejects an update whose search matches more than once", () => {
    const { files, applied, errors } = applyFileOperations(
      { "/App.js": "const a = 1;\nconst a = 2;\n" },
      [
        {
          op: "update",
          path: "/App.js",
          search: "const a =",
          replace: "const b =",
        },
      ],
    );

    expect(files["/App.js"]).toBe("const a = 1;\nconst a = 2;\n");
    expect(applied).toEqual([]);
    expect(errors).toEqual(["update /App.js: search string is ambiguous"]);
  });

  it("rejects a create for a file that exists only in the manifest", () => {
    const { applied, errors } = applyFileOperations(
      { "/App.js": "a" },
      [{ op: "create", path: "/Old.jsx", content: "new" }],
      ["/App.js", "/Old.jsx"],
    );

    expect(applied).toEqual([]);
    expect(errors).toEqual([
      "create /Old.jsx: file exists but was not provided; use update",
    ]);
  });

  it("rejects a create that would overwrite a file the client provided", () => {
    const { files, applied, errors } = applyFileOperations(
      { "/App.js": "old" },
      [{ op: "create", path: "/App.js", content: "replacement" }],
    );

    expect(files).toEqual({ "/App.js": "old" });
    expect(applied).toEqual([]);
    expect(errors).toEqual(["create /App.js: file already exists; use update"]);
  });

  it("normalizes an op path to a leading slash", () => {
    const { files, applied } = applyFileOperations({ "/App.js": "a" }, [
      { op: "create", path: "Hero.jsx", content: "x" },
    ]);

    expect(files["/Hero.jsx"]).toBe("x");
    expect(applied).toEqual(["created /Hero.jsx"]);
  });

  it("rejects a path that escapes the sandbox root", () => {
    const { files, applied, errors } = applyFileOperations({ "/App.js": "a" }, [
      { op: "create", path: "/../evil.js", content: "x" },
    ]);

    expect(files).toEqual({ "/App.js": "a" });
    expect(applied).toEqual([]);
    expect(errors).toEqual(["invalid path: /../evil.js"]);
  });
});
