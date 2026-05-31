import tseslint from "typescript-eslint";
import nestjsTyped from "@darraghor/eslint-plugin-nestjs-typed";
import unicorn from "eslint-plugin-unicorn";
import sonarjs from "eslint-plugin-sonarjs";
import importX from "eslint-plugin-import-x";
import unusedImports from "eslint-plugin-unused-imports";
import promise from "eslint-plugin-promise";
import n from "eslint-plugin-n";
import vitest from "@vitest/eslint-plugin";

import prettier from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "**/*.js"],
  },

  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  nestjsTyped.configs.flatRecommended,

  {
    plugins: {
      unicorn,
      sonarjs,
      "import-x": importX,
      "unused-imports": unusedImports,
      promise,
      n,
      vitest,
    },

    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    settings: {
      "import-x/resolver": {
        typescript: true,
        node: true,
      },
    },

    rules: {
      "@typescript-eslint/no-extraneous-class": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",

      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-duplicates": "error",
      "import-x/no-cycle": "warn",

      "promise/always-return": "error",
      "promise/no-return-wrap": "error",
      "promise/param-names": "error",
      "promise/catch-or-return": ["error", { allowFinally: true }],

      "n/no-process-exit": "error",
      "n/prefer-node-protocol": "error",

      "unicorn/prefer-node-protocol": "off", // covered by n/
      "unicorn/no-array-for-each": "error",
      "unicorn/no-for-loop": "error",
      "unicorn/prefer-includes": "error",
      "unicorn/prefer-string-slice": "error",
      "unicorn/throw-new-error": "error",
      "unicorn/no-useless-undefined": "error",
      "unicorn/prefer-optional-catch-binding": "error",
      "unicorn/no-lonely-if": "error",

      "sonarjs/no-duplicate-string": ["warn", { threshold: 4 }],
      "sonarjs/no-identical-functions": "error",
      "sonarjs/cognitive-complexity": ["warn", 15],

      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-return-await": "off", // use @typescript-eslint version
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "@darraghor/nestjs-typed/controllers-should-supply-api-tags": "off",
      "@darraghor/nestjs-typed/api-method-should-specify-api-response": "off",
    },
  },
  {
    files: ["**/*.spec.ts", "**/*.e2e-spec.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "sonarjs/no-duplicate-string": "off",
    },
  },
  prettier,
);
