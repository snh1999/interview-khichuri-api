import { describe, expect, it } from "vitest";

import { validateAndFixCode } from "../portfolio.code-validator";

describe("validateAndFixCode", () => {
  it("strips markdown code fences", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js": "```jsx\nexport default function App() {}\n```",
    });

    expect(code).toBe("export default function App() {}");
  });

  it("rewrites class= to className= in JSX", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js": 'export default <div class="x" />;',
    });

    expect(code).toBe('export default <div className="x" />;');
  });

  it("self-closes void elements", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js": 'export default <img src="a">;',
    });

    expect(code).toBe('export default <img src="a" />;');
  });

  it("leaves a paired void element alone (closing tag would be orphaned)", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js": 'export default <img src="a"></img>;',
    });

    expect(code).toBe('export default <img src="a"></img>;');
  });

  it("adds a missing default export for the main component", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js": "function App() {\n  return null;\n}",
    });

    expect(code).toContain("export default App;");
  });

  it("adds a default export alongside an existing named export", () => {
    const { "/Hero.jsx": code } = validateAndFixCode({
      "/Hero.jsx": "export function Hero() {\n  return null;\n}",
    });

    expect(code).toBe(
      "export function Hero() {\n  return null;\n}\n\nexport default Hero;\n",
    );
    expect(code).toContain("export function Hero");
  });

  it("leaves HTML files untouched (class= is valid there)", () => {
    const { "/public/index.html": code } = validateAndFixCode({
      "/public/index.html": '<div class="root"></div>',
    });

    expect(code).toBe('<div class="root"></div>');
  });

  it("strips Tailwind directives the sandbox cannot resolve", () => {
    const { "/styles.css": css } = validateAndFixCode({
      "/styles.css":
        "@import 'tailwindcss';\n\n@tailwind base;\n\n:root {\n  color: red;\n}\n",
    });

    expect(css).toBe(":root {\n  color: red;\n}");
    expect(css).not.toContain("tailwind");
  });

  it("leaves ordinary CSS alone", () => {
    const { "/styles.css": css } = validateAndFixCode({
      "/styles.css": ".btn {\n  color: red;\n}\n",
    });

    expect(css).toBe(".btn {\n  color: red;\n}\n");
  });

  it("self-closes a void element whose attrs contain `=>`", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js": "export default <input onChange={() => x}>;",
    });

    expect(code).toBe("export default <input onChange={() => x} />;");
  });

  it("leaves capitalized components alone", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js": "export default <Input>child</Input>;",
    });

    expect(code).toBe("export default <Input>child</Input>;");
  });

  it("does not rewrite data-class", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js": 'export default <div data-class="a" class="b" />;',
    });

    expect(code).toBe('export default <div data-class="a" className="b" />;');
  });

  it("rewrites class= that follows an arrow handler", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js":
        'export default <button onClick={() => f()} class="b">x</button>;',
    });

    expect(code).toContain('className="b"');
  });

  it("leaves the file alone when a default export list already exists", () => {
    const { "/App.js": code } = validateAndFixCode({
      "/App.js":
        "function App() {\n  return null;\n}\nexport { App as default };",
    });

    expect(code).toBe(
      "function App() {\n  return null;\n}\nexport { App as default };",
    );
    expect(code).not.toContain("export default App;");
  });

  it("prefers the component named after the file", () => {
    const { "/Hero.jsx": code } = validateAndFixCode({
      "/Hero.jsx": "function helper() {}\nfunction Hero() { return null; }",
    });

    expect(code).toContain("export default Hero;");
  });

  it("leaves the file unfixed when several components exist and none matches", () => {
    const { "/Widget.jsx": code } = validateAndFixCode({
      "/Widget.jsx": "function Foo() {}\nfunction Bar() {}",
    });

    expect(code).toBe("function Foo() {}\nfunction Bar() {}");
  });
});
