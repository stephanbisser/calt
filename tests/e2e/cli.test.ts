import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";

const execFileAsync = promisify(execFile);

const CLI = "node";
const CLI_ARGS = ["dist/index.js"];
const CWD = process.cwd();

const pkg = JSON.parse(
  readFileSync(resolve(CWD, "package.json"), "utf-8"),
) as { version: string };

/** Run CLI and return stdout/stderr/exitCode, never throwing on non-zero exit. */
async function run(
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      CLI,
      [...CLI_ARGS, ...args],
      { cwd: CWD },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: typeof e.code === "number" ? e.code : 1,
    };
  }
}

describe("CLI E2E", () => {
  beforeAll(async () => {
    await execFileAsync("npm", ["run", "build"], { cwd: CWD });
  }, 60_000);

  // ── 1. --version ──────────────────────────────────────────────────────
  it("--version exits 0 and prints the version from package.json", async () => {
    const { stdout, exitCode } = await run("--version");
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  // ── 2. --help ─────────────────────────────────────────────────────────
  it("--help exits 0 and lists available commands", async () => {
    const { stdout, exitCode } = await run("--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("calt");
    for (const cmd of ["scan", "lint", "validate"]) {
      expect(stdout).toContain(cmd);
    }
  });

  // ── 3. scan with valid manifest ───────────────────────────────────────
  it("scan with valid manifest exits 0 or 1", async () => {
    const { exitCode } = await run(
      "scan",
      "tests/fixtures/valid-manifest.json",
    );
    // 0 = no errors, 1 = errors found — both acceptable for a valid manifest
    expect([0, 1]).toContain(exitCode);
  });

  // ── 4. scan with invalid path ─────────────────────────────────────────
  it("scan with nonexistent path exits 2", async () => {
    const { exitCode } = await run(
      "scan",
      "tests/fixtures/this-does-not-exist.json",
    );
    expect(exitCode).toBe(2);
  });

  // ── 5. scan --format json ─────────────────────────────────────────────
  it("scan --format json outputs valid JSON", async () => {
    const { stdout, exitCode } = await run(
      "scan",
      "tests/fixtures/valid-manifest.json",
      "--format",
      "json",
    );
    expect([0, 1]).toContain(exitCode);
    const parsed = JSON.parse(stdout);
    expect(parsed).toBeDefined();
    expect(Array.isArray(parsed) || typeof parsed === "object").toBe(true);
  });

  // ── 6. scan --quiet ───────────────────────────────────────────────────
  it("scan --quiet produces no or minimal stdout", async () => {
    const { stdout, exitCode } = await run(
      "scan",
      "tests/fixtures/valid-manifest.json",
      "--quiet",
    );
    expect([0, 1]).toContain(exitCode);
    expect(stdout.trim().length).toBeLessThanOrEqual(0);
  });

  // ── 7. validate with valid manifest ───────────────────────────────────
  it("validate with valid manifest exits 0", async () => {
    const { exitCode } = await run(
      "validate",
      "tests/fixtures/valid-manifest.json",
    );
    expect(exitCode).toBe(0);
  });

  // ── 8. validate with invalid manifest ─────────────────────────────────
  it("validate with invalid manifest exits 1", async () => {
    const { exitCode } = await run(
      "validate",
      "tests/fixtures/invalid-manifest.json",
    );
    expect(exitCode).toBe(1);
  });
});
