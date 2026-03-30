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
import { initCommand, getTemplate } from "../../src/commands/init.js";

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

describe("initCommand --template", () => {
  it("--template basic creates valid manifest with instructions and starters", async () => {
    await initCommand({ template: "basic" });

    const content = await readFile(join(tempDir, "declarativeAgent.json"), "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed.$schema).toContain("declarative-agent");
    expect(parsed.version).toBe("v1.4");
    expect(parsed.name).toBe("My Agent");
    expect(parsed.description).toBeTruthy();
    expect(parsed.instructions).toContain("## Purpose");
    expect(parsed.instructions).toContain("## Guidelines");
    expect(parsed.instructions).toContain("## Workflow");
    expect(parsed.conversation_starters).toHaveLength(2);
  });

  it("--template enterprise includes security section and capabilities", async () => {
    await initCommand({ template: "enterprise" });

    const content = await readFile(join(tempDir, "declarativeAgent.json"), "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed.$schema).toContain("declarative-agent");
    expect(parsed.version).toBe("v1.4");
    expect(parsed.instructions).toContain("## Security");
    expect(parsed.capabilities).toBeDefined();
    expect(parsed.capabilities.length).toBeGreaterThanOrEqual(2);

    const capNames = parsed.capabilities.map((c: { name: string }) => c.name);
    expect(capNames).toContain("WebSearch");
    expect(capNames).toContain("OneDriveAndSharePoint");

    expect(parsed.conversation_starters.length).toBeGreaterThanOrEqual(4);
  });

  it("--template minimal creates bare minimum manifest", async () => {
    await initCommand({ template: "minimal" });

    const content = await readFile(join(tempDir, "declarativeAgent.json"), "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed.$schema).toContain("declarative-agent");
    expect(parsed.version).toBe("v1.4");
    expect(parsed.name).toBe("My Agent");
    expect(parsed.description).toBeTruthy();
    expect(parsed.instructions).toBeTruthy();
    expect(parsed).not.toHaveProperty("conversation_starters");
    expect(parsed).not.toHaveProperty("capabilities");
  });

  it("invalid template name throws error", async () => {
    await expect(initCommand({ template: "nonexistent" })).rejects.toThrow(
      /Unknown template "nonexistent"/,
    );
  });

  it("--output custom.json creates file at custom path", async () => {
    await initCommand({ template: "basic", output: "custom.json" });

    const content = await readFile(join(tempDir, "custom.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.name).toBe("My Agent");
  });

  it("--output with nested path creates directories", async () => {
    await initCommand({ template: "basic", output: "agents/my-agent.json" });

    const content = await readFile(join(tempDir, "agents", "my-agent.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.name).toBe("My Agent");
  });

  it("does not overwrite existing manifest without --force", async () => {
    const existingContent = '{"existing":"manifest"}';
    await writeFile(join(tempDir, "declarativeAgent.json"), existingContent);

    await initCommand({ template: "basic" });

    const content = await readFile(join(tempDir, "declarativeAgent.json"), "utf-8");
    expect(content).toBe(existingContent);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
  });

  it("overwrites existing manifest with --force", async () => {
    await writeFile(join(tempDir, "declarativeAgent.json"), '{"old":"data"}');

    await initCommand({ template: "basic", force: true });

    const content = await readFile(join(tempDir, "declarativeAgent.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.name).toBe("My Agent");
    expect(parsed).not.toHaveProperty("old");
  });

  it("also creates .caltrc.json when using --template", async () => {
    await initCommand({ template: "basic" });

    const configContent = await readFile(join(tempDir, ".caltrc.json"), "utf-8");
    const config = JSON.parse(configContent);
    expect(config).toHaveProperty("rules");

    const manifestContent = await readFile(join(tempDir, "declarativeAgent.json"), "utf-8");
    const manifest = JSON.parse(manifestContent);
    expect(manifest).toHaveProperty("name");
  });

  it("prints success message with template name", async () => {
    await initCommand({ template: "basic" });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"basic" template'),
    );
  });
});

describe("getTemplate", () => {
  it("returns a deep copy (mutations don't affect originals)", () => {
    const t1 = getTemplate("basic");
    t1.name = "Modified";
    const t2 = getTemplate("basic");
    expect(t2.name).toBe("My Agent");
  });

  it("throws for unknown template", () => {
    expect(() => getTemplate("invalid")).toThrow(/Unknown template/);
  });
});
