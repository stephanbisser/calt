import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to control process.cwd() so initCommand writes to our temp dir.
let tempDir: string;
const originalCwd = process.cwd;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "calt-init-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tempDir);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  process.cwd = originalCwd;
  vi.restoreAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// Import after mocks are in place
import { initCommand } from "../../src/commands/init.js";

describe("initCommand", () => {
  it("creates .caltrc.json with default config", async () => {
    await initCommand({});

    const content = await readFile(join(tempDir, ".caltrc.json"), "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed).toHaveProperty("$schema");
    expect(parsed).toHaveProperty("rules");
    expect(parsed).toHaveProperty("instruction_min_length", 200);
    expect(parsed).toHaveProperty("instruction_ideal_range", [500, 4000]);
    expect(parsed).toHaveProperty("schema_version_target", "v1.6");
  });

  it("does not overwrite existing config without --force", async () => {
    const existingContent = '{"rules":{"INST-001":"off"}}';
    await writeFile(join(tempDir, ".caltrc.json"), existingContent);

    await initCommand({});

    const content = await readFile(join(tempDir, ".caltrc.json"), "utf-8");
    expect(content).toBe(existingContent);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
  });

  it("overwrites existing config with --force", async () => {
    await writeFile(join(tempDir, ".caltrc.json"), '{"old":"data"}');

    await initCommand({ force: true });

    const content = await readFile(join(tempDir, ".caltrc.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty("$schema");
    expect(parsed).not.toHaveProperty("old");
  });

  it("prints success message after creation", async () => {
    await initCommand({});

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Created .caltrc.json"),
    );
  });
});
