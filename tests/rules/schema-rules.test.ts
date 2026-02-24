import { describe, it, expect } from "vitest";
import { runSchemaValidation } from "../../src/rules/rule-engine.js";
import { DEFAULT_CONFIG, type LoadedAgent } from "../../src/core/types.js";
import validManifest from "../fixtures/valid-manifest.json";
import minimalManifest from "../fixtures/minimal-manifest.json";
import invalidManifest from "../fixtures/invalid-manifest.json";

function makeAgent(manifest: any): LoadedAgent {
  return {
    manifest,
    source: { type: "local", filePath: "/test/agent.json" },
  };
}

describe("Schema Validation", () => {
  it("should pass for a valid v1.5 manifest", () => {
    const report = runSchemaValidation(makeAgent(validManifest), DEFAULT_CONFIG);
    expect(report.summary.errors).toBe(0);
  });

  it("should pass for a minimal v1.3 manifest", () => {
    const report = runSchemaValidation(makeAgent(minimalManifest), DEFAULT_CONFIG);
    expect(report.summary.errors).toBe(0);
  });

  it("should detect invalid manifest (missing instructions)", () => {
    const report = runSchemaValidation(makeAgent(invalidManifest), DEFAULT_CONFIG);
    expect(report.summary.errors).toBeGreaterThan(0);
  });

  it("should warn about outdated schema version", () => {
    const report = runSchemaValidation(makeAgent(minimalManifest), DEFAULT_CONFIG);
    const warningResults = report.categories
      .flatMap((c) => c.results)
      .filter((r) => r.ruleId === "SCHEMA-002" && !r.passed);
    expect(warningResults.length).toBeGreaterThan(0);
  });

  it("should detect name too long", () => {
    const report = runSchemaValidation(makeAgent(invalidManifest), DEFAULT_CONFIG);
    const nameResults = report.categories
      .flatMap((c) => c.results)
      .filter((r) => r.ruleId === "SCHEMA-004");
    expect(nameResults.some((r) => !r.passed)).toBe(true);
  });
});
