import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "**/*.d.ts", "**/*.js.map"] },
  {
    files: ["test/**/*.mjs"],
    languageOptions: {
      globals: Object.fromEntries(
        [
          "URL",
          "URLSearchParams",
          "Response",
          "Headers",
          "AbortController",
          "AbortSignal",
          "DOMException",
          "process",
          "Buffer",
          "setTimeout",
          "fetch",
          "console",
        ].map((name) => [name, "readonly"])
      ),
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  }
);
