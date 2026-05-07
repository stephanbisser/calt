import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentsMdCommand,
  resolveBundledAgentsMd,
  readBundledAgentsMd,
} from "../../src/commands/agents-md.js";

describe("resolveBundledAgentsMd", () => {
  it("points to a real file under the package root", async () => {
    const path = resolveBundledAgentsMd();
    expect(path.endsWith("AGENTS.md")).toBe(true);
    const content = await readFile(path, "utf8");
    expect(content).toMatch(/AGENTS\.md/);
    expect(content).toMatch(/calt\s+(scan|rules|agents-md)/);
  });
});

describe("readBundledAgentsMd", () => {
  it("returns a non-empty markdown string", async () => {
    const md = await readBundledAgentsMd();
    expect(md.length).toBeGreaterThan(500);
    // The contract must mention --format json — that's the whole point.
    expect(md).toContain("--format json");
  });
});

describe("agentsMdCommand", () => {
  let tempDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let stdoutWrites: string[];
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "calt-agents-md-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stdoutWrites = [];
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdoutWrites.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errSpy.mockRestore();
    stdoutSpy.mockRestore();
    process.exitCode = 0;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("prints AGENTS.md to stdout by default", async () => {
    await agentsMdCommand({});
    const output = stdoutWrites.join("");
    expect(output).toContain("AGENTS.md");
    expect(output).toContain("--format json");
  });

  it("prints the bundled path with --path", async () => {
    await agentsMdCommand({ path: true });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const printed = logSpy.mock.calls[0][0] as string;
    expect(printed.endsWith("AGENTS.md")).toBe(true);
  });

  it("installs into the current directory by default", async () => {
    await agentsMdCommand({ install: true });
    const written = await readFile(join(tempDir, "AGENTS.md"), "utf8");
    expect(written).toContain("AGENTS.md");
    expect(written).toContain("--format json");
  });

  it("refuses to overwrite without --force", async () => {
    await writeFile(join(tempDir, "AGENTS.md"), "# project-specific\n", "utf8");
    await agentsMdCommand({ install: true });
    expect(process.exitCode).toBe(1);
    const after = await readFile(join(tempDir, "AGENTS.md"), "utf8");
    expect(after).toBe("# project-specific\n");
    expect(errSpy).toHaveBeenCalled();
  });

  it("overwrites with --force", async () => {
    await writeFile(join(tempDir, "AGENTS.md"), "# project-specific\n", "utf8");
    await agentsMdCommand({ install: true, force: true });
    const after = await readFile(join(tempDir, "AGENTS.md"), "utf8");
    expect(after).not.toBe("# project-specific\n");
    expect(after).toContain("--format json");
  });

  it("respects --output for custom destinations", async () => {
    const dest = join(tempDir, "docs", "AGENTS.md");
    await writeFile(join(tempDir, "AGENTS.md"), "# unrelated\n", "utf8"); // root file untouched
    await import("node:fs/promises").then((fs) => fs.mkdir(join(tempDir, "docs")));
    await agentsMdCommand({ install: true, output: dest });
    const written = await readFile(dest, "utf8");
    expect(written).toContain("--format json");
    const root = await readFile(join(tempDir, "AGENTS.md"), "utf8");
    expect(root).toBe("# unrelated\n");
  });
});
