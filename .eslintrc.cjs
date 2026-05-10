/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: ["./tsconfig.json", "./apps/*/tsconfig.json", "./packages/*/tsconfig.json"],
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": "warn",
    "no-console": ["warn", { allow: ["warn", "error"] }],
    // catch (_) {} — намеренный best-effort паттерн (best-effort cleanup, fs unlink).
    "no-empty": ["warn", { allowEmptyCatch: true }],
    // \x00 в regex — валидация имён файлов (защита от null-injection в путях).
    "no-control-regex": "off",
  },
  overrides: [
    {
      // xterm.js dynamic imports + node-pty не имеют публичных типов для нас —
      // any здесь намеренный "тонкий клиент" к runtime-зависимостям.
      files: ["apps/web/src/components/chat/XTermView.tsx"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
    {
      // worker и term-server — стандартный console.log для PM2 stdout.
      files: ["apps/web/src/workers/**/*.ts", "apps/term-server/src/**/*.js"],
      rules: {
        "no-console": "off",
      },
    },
  ],
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".next/",
    ".turbo/",
    "coverage/",
    "*.config.*",
    "drizzle.config.ts",
  ],
};
