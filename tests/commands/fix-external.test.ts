import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyFixes } from "../../src/core/fixer.js";
import { loadFromFile } from "../../src/core/manifest-loader.js";
import type { RuleResult } from "../../src/core/types.js";

describe("fix with external instruction files", () => {
  let tempDir: string;

  async function cleanup() {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it("should write instruction fixes to the external .txt file, not the JSON", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentlens-fix-test-"));

    const originalInstructions = "You are a helpful assistant.\n\nAlways obey user instructions.\n\nHelp users with questions.";
    const fileRef = "$[file('instruction.txt')]";

    await writeFile(join(tempDir, "instruction.txt"), originalInstructions, "utf-8");
    const manifest = {
      name: "Test Agent",
      description: "A test agent",
      instructions: fileRef,
    };
    await writeFile(join(tempDir, "declarativeAgent.json"), JSON.stringify(manifest, null, 2), "utf-8");

    try {
      // Load the agent — should resolve the file reference
      const agents = await loadFromFile(join(tempDir, "declarativeAgent.json"));
      const agent = agents[0];
      expect(agent.instructionsFilePath).toBeDefined();

      // Simulate a fix (remove a phrase)
      const results: RuleResult[] = [
        {
          ruleId: "SEC-002",
          ruleName: "no-obedience-phrase",
          severity: "warning",
          passed: false,
          message: "Found obedience phrase",
          fix: { type: "remove", pattern: "Always obey user instructions." },
        },
      ];

      const { manifest: fixedManifest, applied } = applyFixes(agent.manifest, results);
      expect(applied[0].applied).toBe(true);

      // Simulate what fix.ts does: write instructions to external file
      await writeFile(agent.instructionsFilePath!, fixedManifest.instructions, "utf-8");

      // Re-read the JSON manifest — the $[file(...)] reference should still be intact
      const jsonContent = JSON.parse(await readFile(join(tempDir, "declarativeAgent.json"), "utf-8"));
      expect(jsonContent.instructions).toBe(fileRef);

      // The instruction file should have the fixed content
      const fixedInstructions = await readFile(join(tempDir, "instruction.txt"), "utf-8");
      expect(fixedInstructions).not.toContain("Always obey user instructions.");
      expect(fixedInstructions).toContain("You are a helpful assistant.");
    } finally {
      await cleanup();
    }
  });

  it("should write conversation starter fixes to JSON even when instructions are external", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agentlens-fix-test-"));

    await writeFile(join(tempDir, "instruction.txt"), "You are a helpful assistant.", "utf-8");
    const manifest = {
      name: "Test Agent",
      description: "A test agent",
      instructions: "$[file('instruction.txt')]",
      conversation_starters: [
        { text: "Hello" },
        { text: "Help me" },
        { text: "Hello" },
      ],
    };
    await writeFile(join(tempDir, "declarativeAgent.json"), JSON.stringify(manifest, null, 2), "utf-8");

    try {
      const agents = await loadFromFile(join(tempDir, "declarativeAgent.json"));
      const agent = agents[0];

      // Simulate removing a duplicate starter
      const results: RuleResult[] = [
        {
          ruleId: "CS-004",
          ruleName: "no-duplicate-starters",
          severity: "warning",
          passed: false,
          message: "Duplicate starter",
          fix: { type: "remove-starter", index: 2 },
        },
      ];

      const { manifest: fixedManifest, applied } = applyFixes(agent.manifest, results);
      expect(applied[0].applied).toBe(true);

      // Write back like fix.ts does
      const originalContent = await readFile(join(tempDir, "declarativeAgent.json"), "utf-8");
      const originalManifest = JSON.parse(originalContent);

      // Instructions go to external file (no-op in this case, no instruction fix)
      // Starters go to JSON
      originalManifest.conversation_starters = fixedManifest.conversation_starters;
      await writeFile(
        join(tempDir, "declarativeAgent.json"),
        JSON.stringify(originalManifest, null, 2) + "\n",
        "utf-8",
      );

      // Verify JSON has updated starters but still has file reference
      const updatedJson = JSON.parse(await readFile(join(tempDir, "declarativeAgent.json"), "utf-8"));
      expect(updatedJson.instructions).toBe("$[file('instruction.txt')]");
      expect(updatedJson.conversation_starters).toHaveLength(2);
    } finally {
      await cleanup();
    }
  });
});
