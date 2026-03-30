import { describe, it, expect } from "vitest";
import {
  formatAsJson,
  formatMultipleAsJson,
  formatDiffAsJson,
} from "../../src/formatters/json-formatter.js";
import type { ScanReport, DiffReport } from "../../src/core/types.js";

function makeScanReport(overrides?: Partial<ScanReport>): ScanReport {
  return {
    agent: {
      name: "Test Agent",
      schemaVersion: "1.5",
      source: { type: "local", filePath: "/test/agent.json" },
    },
    categories: [],
    summary: { totalChecks: 0, passed: 0, errors: 0, warnings: 0, infos: 0 },
    timestamp: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDiffReport(overrides?: Partial<DiffReport>): DiffReport {
  return {
    agentA: { name: "Agent A", source: { type: "local", filePath: "/a.json" } },
    agentB: { name: "Agent B", source: { type: "local", filePath: "/b.json" } },
    sections: [],
    summary: { totalChanges: 0, additions: 0, removals: 0, modifications: 0 },
    timestamp: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("JSON Formatter", () => {
  describe("formatAsJson", () => {
    it("should return valid JSON", () => {
      const report = makeScanReport();
      const output = formatAsJson(report);
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it("should include all report fields", () => {
      const report = makeScanReport();
      const parsed = JSON.parse(formatAsJson(report));
      expect(parsed.agent).toBeDefined();
      expect(parsed.agent.name).toBe("Test Agent");
      expect(parsed.categories).toEqual([]);
      expect(parsed.summary).toBeDefined();
      expect(parsed.timestamp).toBe("2025-01-01T00:00:00.000Z");
    });

    it("should include rule results in categories", () => {
      const report = makeScanReport({
        categories: [
          {
            name: "Schema Validation",
            category: "schema",
            results: [
              {
                ruleId: "SCH-001",
                ruleName: "Valid Schema",
                severity: "error",
                passed: false,
                message: "Schema validation failed",
                details: "Missing required field",
              },
            ],
            passed: 0,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 0, errors: 1, warnings: 0, infos: 0 },
      });

      const parsed = JSON.parse(formatAsJson(report));
      expect(parsed.categories).toHaveLength(1);
      expect(parsed.categories[0].results[0].ruleId).toBe("SCH-001");
      expect(parsed.categories[0].results[0].details).toBe("Missing required field");
    });

    it("should preserve optional fields when present", () => {
      const report = makeScanReport({
        agent: {
          name: "Agent",
          schemaVersion: "1.5",
          source: { type: "remote", packageId: "pkg-123", tenantId: "t-1" },
          metadata: { publisher: "Contoso", version: "2.0" },
        },
      });

      const parsed = JSON.parse(formatAsJson(report));
      expect(parsed.agent.metadata.publisher).toBe("Contoso");
      expect(parsed.agent.source.packageId).toBe("pkg-123");
    });
  });

  describe("formatMultipleAsJson", () => {
    it("should return valid JSON with reports array and generatedAt", () => {
      const reports = [makeScanReport(), makeScanReport({ agent: { name: "Agent 2", source: { type: "local", filePath: "/b.json" } } })];
      const output = formatMultipleAsJson(reports);
      const parsed = JSON.parse(output);
      expect(parsed.reports).toHaveLength(2);
      expect(parsed.generatedAt).toBeDefined();
    });

    it("should handle empty reports array", () => {
      const parsed = JSON.parse(formatMultipleAsJson([]));
      expect(parsed.reports).toEqual([]);
      expect(parsed.generatedAt).toBeDefined();
    });
  });

  describe("formatDiffAsJson", () => {
    it("should return valid JSON", () => {
      const report = makeDiffReport();
      expect(() => JSON.parse(formatDiffAsJson(report))).not.toThrow();
    });

    it("should include all diff fields", () => {
      const report = makeDiffReport({
        sections: [
          {
            name: "Instructions",
            changeType: "modified",
            details: [
              { field: "text", changeType: "modified", valueA: "old", valueB: "new" },
            ],
          },
        ],
        summary: { totalChanges: 1, additions: 0, removals: 0, modifications: 1 },
      });

      const parsed = JSON.parse(formatDiffAsJson(report));
      expect(parsed.agentA.name).toBe("Agent A");
      expect(parsed.sections).toHaveLength(1);
      expect(parsed.sections[0].details[0].valueB).toBe("new");
      expect(parsed.summary.modifications).toBe(1);
    });
  });
});
