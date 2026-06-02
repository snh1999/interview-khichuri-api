import swc from "unplugin-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } }), tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    maxWorkers: 1,
    isolate: true,
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          include: ["test/**/*.e2e-spec.ts"],
          setupFiles: ["./test/setup.web.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "app",
          include: ["test/**/*.e2e-spec.ts"],
          setupFiles: ["./test/setup.app.ts"],
        },
      },
    ],
  },
});
