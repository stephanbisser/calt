// Bundle the VS Code extension to a single CJS file under out/extension.js.
// This packages calt-cli (ESM) and its deps so the extension can run in
// VS Code's CJS extension host without runtime resolution issues.

import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function copySchemas() {
  const src = resolve(here, "../../src/rules/schema/schemas");
  const dest = resolve(here, "schemas");
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  // Also copy the .caltrc config schema so jsonValidation works for it.
  cpSync(resolve(here, "../../schemas/config.schema.json"), resolve(dest, "config.schema.json"));
}
copySchemas();

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "esm",
  platform: "node",
  target: "node18",
  // ESM bundles can pull CJS-only deps (e.g. ajv); banner ensures `require`
  // and `__dirname` are available for those files inside the bundle.
  banner: {
    js: [
      "import { createRequire as __caltCreateRequire } from 'node:module';",
      "import { fileURLToPath as __caltFileURLToPath } from 'node:url';",
      "import { dirname as __caltDirname } from 'node:path';",
      "const require = __caltCreateRequire(import.meta.url);",
      "const __filename = __caltFileURLToPath(import.meta.url);",
      "const __dirname = __caltDirname(__filename);",
    ].join("\n"),
  },
  sourcemap: !production,
  minify: production,
  logLevel: "info",
  // calt-cli is ESM (`"type": "module"`); esbuild handles the conversion.
  mainFields: ["module", "main"],
  conditions: ["import", "node"],
};

async function run() {
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    // eslint-disable-next-line no-console
    console.log("[calt-vscode] watching for changes...");
  } else {
    await build(options);
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
