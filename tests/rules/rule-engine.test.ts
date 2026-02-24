import { describe, it, expect } from "vitest";
import { runFullScan, runInstructionLint } from "../../src/rules/rule-engine.js";
import { DEFAULT_CONFIG, type LoadedAgent } from "../../src/core/types.js";
import validManifest from "../fixtures/valid-manifest.json";
import badManifest from "../fixtures/bad-instructions-manifest.json";

function makeAgent(manifest: any): LoadedAgent {
  return {
    manifest,
    source: { type: "local", filePath: "/test/agent.json" },
  };
}

describe("Rule Engine", () => {
  describe("runFullScan", () => {
    it("should produce a complete report for a valid manifest", async () => {
      const report = await runFullScan(makeAgent(validManifest), DEFAULT_CONFIG);
      expect(report.agent.name).toBe("Onboarding Coach");
      expect(report.categories.length).toBeGreaterThan(0);
      expect(report.summary.totalChecks).toBeGreaterThan(0);
      expect(report.summary.errors).toBe(0);
    });

    it("should detect issues in a bad manifest", async () => {
      const report = await runFullScan(makeAgent(badManifest), DEFAULT_CONFIG);
      // Bad manifest has vague language, short instructions, unreferenced capabilities
      const totalIssues = report.summary.warnings + report.summary.infos;
      expect(totalIssues).toBeGreaterThan(0);
    });

    it("should include all rule categories", async () => {
      const report = await runFullScan(makeAgent(validManifest), DEFAULT_CONFIG);
      const categoryNames = report.categories.map((c) => c.category);
      expect(categoryNames).toContain("schema");
      expect(categoryNames).toContain("instructions");
    });

    it("should have a timestamp", async () => {
      const report = await runFullScan(makeAgent(validManifest), DEFAULT_CONFIG);
      expect(report.timestamp).toBeTruthy();
      expect(() => new Date(report.timestamp)).not.toThrow();
    });
  });

  describe("runInstructionLint", () => {
    it("should only check instruction rules", () => {
      const report = runInstructionLint(makeAgent(validManifest), DEFAULT_CONFIG);
      const categories = report.categories.map((c) => c.category);
      expect(categories).toEqual(["instructions"]);
    });

    it("should detect vague language in bad manifest", () => {
      const report = runInstructionLint(makeAgent(badManifest), DEFAULT_CONFIG);
      const vagueResult = report.categories
        .flatMap((c) => c.results)
        .find((r) => r.ruleId === "INST-007");
      expect(vagueResult).toBeDefined();
      expect(vagueResult!.passed).toBe(false);
    });

    it("should respect config overrides", () => {
      const config = { ...DEFAULT_CONFIG, rules: { "INST-007": "off" as const } };
      const report = runInstructionLint(makeAgent(badManifest), config);
      const vagueResult = report.categories
        .flatMap((c) => c.results)
        .find((r) => r.ruleId === "INST-007");
      // Rule should be absent when disabled
      expect(vagueResult).toBeUndefined();
    });
  });
});
