import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseFileReference, loadFromFile } from "../../src/core/manifest-loader.js";

describe("parseFileReference", () => {
  it("should parse single-quoted file reference", () => {
    expect(parseFileReference("$[file('instruction.txt')]")).toBe("instruction.txt");
  });

  it("should parse double-quoted file reference", () => {
    expect(parseFileReference('$[file("instruction.txt")]')).toBe("instruction.txt");
  });

  it("should parse paths with subdirectories", () => {
    expect(parseFileReference("$[file('prompts/main.txt')]")).toBe("prompts/main.txt");
  });

  it("should return null for plain inline strings", () => {
    expect(parseFileReference("You are a helpful assistant.")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(parseFileReference("")).toBeNull();
  });

  it("should return null for malformed references (missing brackets)", () => {
    expect(parseFileReference("$[file('instruction.txt')")).toBeNull();
  });

  it("should return null for malformed references (no quotes)", () => {
    expect(parseFileReference("$[file(instruction.txt)]")).toBeNull();
  });

  it("should return null for reference with extra content around it", () => {
    expect(parseFileReference("prefix $[file('instruction.txt')] suffix")).toBeNull();
  });

  it("should return null for mismatched quotes", () => {
    expect(parseFileReference("$[file('instruction.txt\")]")).toBeNull();
  });
});

describe("loadFromFile with external instruction files", () => {
  let tempDir: string;

  async function setup(instructionContent: string, manifestOverrides?: Record<string, unknown>) {
    tempDir = await mkdtemp(join(tmpdir(), "agentlens-test-"));

    await writeFile(join(tempDir, "instruction.txt"), instructionContent, "utf-8");

    const manifest = {
      name: "Test Agent",
      description: "A test agent",
      instructions: "$[file('instruction.txt')]",
      ...manifestOverrides,
    };
    await writeFile(join(tempDir, "declarativeAgent.json"), JSON.stringify(manifest, null, 2), "utf-8");

    return tempDir;
  }

  async function cleanup() {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it("should resolve external instruction file and set instructionsFilePath", async () => {
    const instructionText = "You are a helpful assistant that helps users with M365 tasks.";
    await setup(instructionText);

    try {
      const agents = await loadFromFile(join(tempDir, "declarativeAgent.json"));
      expect(agents).toHaveLength(1);
      expect(agents[0].manifest.instructions).toBe(instructionText);
      expect(agents[0].instructionsFilePath).toBe(join(tempDir, "instruction.txt"));
    } finally {
      await cleanup();
    }
  });

  it("should resolve double-quoted file references", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentlens-test-"));
    const instructionText = "Double-quoted reference test.";
    await writeFile(join(tempDir, "instruction.txt"), instructionText, "utf-8");

    const manifest = {
      name: "Test Agent",
      description: "A test agent",
      instructions: '$[file("instruction.txt")]',
    };
    await writeFile(join(tempDir, "declarativeAgent.json"), JSON.stringify(manifest, null, 2), "utf-8");

    try {
      const agents = await loadFromFile(join(tempDir, "declarativeAgent.json"));
      expect(agents[0].manifest.instructions).toBe(instructionText);
      expect(agents[0].instructionsFilePath).toBe(join(tempDir, "instruction.txt"));
    } finally {
      await cleanup();
    }
  });

  it("should resolve file references with subdirectory paths", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentlens-test-"));
    const instructionText = "Subdirectory instruction content.";
    await mkdir(join(tempDir, "prompts"), { recursive: true });
    await writeFile(join(tempDir, "prompts", "main.txt"), instructionText, "utf-8");

    const manifest = {
      name: "Test Agent",
      description: "A test agent",
      instructions: "$[file('prompts/main.txt')]",
    };
    await writeFile(join(tempDir, "declarativeAgent.json"), JSON.stringify(manifest, null, 2), "utf-8");

    try {
      const agents = await loadFromFile(join(tempDir, "declarativeAgent.json"));
      expect(agents[0].manifest.instructions).toBe(instructionText);
      expect(agents[0].instructionsFilePath).toBe(join(tempDir, "prompts", "main.txt"));
    } finally {
      await cleanup();
    }
  });

  it("should leave instructionsFilePath undefined for inline instructions", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentlens-test-"));
    const manifest = {
      name: "Test Agent",
      description: "A test agent",
      instructions: "Inline instructions here.",
    };
    await writeFile(join(tempDir, "declarativeAgent.json"), JSON.stringify(manifest, null, 2), "utf-8");

    try {
      const agents = await loadFromFile(join(tempDir, "declarativeAgent.json"));
      expect(agents[0].manifest.instructions).toBe("Inline instructions here.");
      expect(agents[0].instructionsFilePath).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("should throw when external instruction file does not exist", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentlens-test-"));
    const manifest = {
      name: "Test Agent",
      description: "A test agent",
      instructions: "$[file('missing.txt')]",
    };
    await writeFile(join(tempDir, "declarativeAgent.json"), JSON.stringify(manifest, null, 2), "utf-8");

    try {
      await expect(
        loadFromFile(join(tempDir, "declarativeAgent.json")),
      ).rejects.toThrow(/Failed to read external instructions file/);
    } finally {
      await cleanup();
    }
  });

  it("should throw when external instruction file exceeds 1 MB", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentlens-test-"));
    // Create a file just over 1 MB
    const bigContent = "x".repeat(1_048_577);
    await writeFile(join(tempDir, "huge.txt"), bigContent, "utf-8");

    const manifest = {
      name: "Test Agent",
      description: "A test agent",
      instructions: "$[file('huge.txt')]",
    };
    await writeFile(join(tempDir, "declarativeAgent.json"), JSON.stringify(manifest, null, 2), "utf-8");

    try {
      await expect(
        loadFromFile(join(tempDir, "declarativeAgent.json")),
      ).rejects.toThrow(/is too large.*Maximum allowed size is 1 MB/);
    } finally {
      await cleanup();
    }
  });
});
