import swc from "unplugin-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } }), tsconfigPaths()],
  test: {
    name: "unit",
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["node_modules/", "dist/", "test/", "**/*.mock.ts"],
    },
    maxWorkers: 1,
    isolate: false,
  },
});
