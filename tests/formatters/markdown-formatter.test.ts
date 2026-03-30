import { describe, it, expect } from "vitest";
import {
  formatAsMarkdown,
  formatMultipleAsMarkdown,
  formatDiffAsMarkdown,
} from "../../src/formatters/markdown-formatter.js";
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

describe("Markdown Formatter", () => {
  describe("formatAsMarkdown", () => {
    it("should contain the main heading", () => {
      const md = formatAsMarkdown(makeScanReport());
      expect(md).toContain("# CALT Scan Report");
    });

    it("should include agent info", () => {
      const md = formatAsMarkdown(makeScanReport());
      expect(md).toContain("Test Agent");
      expect(md).toContain("1.5");
    });

    it("should include summary table", () => {
      const report = makeScanReport({
        summary: { totalChecks: 5, passed: 3, errors: 1, warnings: 1, infos: 0 },
      });
      const md = formatAsMarkdown(report);
      expect(md).toContain("Metric");
      expect(md).toContain("Count");
    });

    it("should render category with error results", () => {
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
                message: "Schema invalid",
              },
            ],
            passed: 0,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 0, errors: 1, warnings: 0, infos: 0 },
      });

      const md = formatAsMarkdown(report);
      expect(md).toContain("Schema Validation");
      expect(md).toContain("SCH-001");
      expect(md).toContain("❌");
    });

    it("should render warning and info results with correct emoji", () => {
      const report = makeScanReport({
        categories: [
          {
            name: "Instructions",
            category: "instructions",
            results: [
              {
                ruleId: "INST-002",
                ruleName: "Warn Rule",
                severity: "warning",
                passed: false,
                message: "Could be better",
              },
              {
                ruleId: "INST-003",
                ruleName: "Info Rule",
                severity: "info",
                passed: false,
                message: "FYI",
              },
            ],
            passed: 0,
            total: 2,
          },
        ],
        summary: { totalChecks: 2, passed: 0, errors: 0, warnings: 1, infos: 1 },
      });

      const md = formatAsMarkdown(report);
      expect(md).toContain("⚠️");
      expect(md).toContain("ℹ️");
    });

    it("should handle empty categories", () => {
      const md = formatAsMarkdown(makeScanReport());
      expect(md).toContain("# CALT Scan Report");
      // Should still produce valid output with no categories
      expect(md.length).toBeGreaterThan(0);
    });

    it("should include footer with CALT link", () => {
      const md = formatAsMarkdown(makeScanReport());
      expect(md).toContain("---");
    });

    it("should show all-passing category with check emoji", () => {
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
                passed: true,
                message: "Schema is valid",
              },
            ],
            passed: 1,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 1, errors: 0, warnings: 0, infos: 0 },
      });

      const md = formatAsMarkdown(report);
      expect(md).toContain("✅");
    });
  });

  describe("formatMultipleAsMarkdown", () => {
    it("should separate multiple reports with horizontal rules", () => {
      const reports = [
        makeScanReport(),
        makeScanReport({ agent: { name: "Agent 2", source: { type: "local", filePath: "/b.json" } } }),
      ];
      const md = formatMultipleAsMarkdown(reports);
      // Each report has its own heading
      const headingCount = (md.match(/# CALT Scan Report/g) || []).length;
      expect(headingCount).toBe(2);
    });

    it("should handle single report", () => {
      const md = formatMultipleAsMarkdown([makeScanReport()]);
      expect(md).toContain("# CALT Scan Report");
    });
  });

  describe("formatDiffAsMarkdown", () => {
    it("should contain diff heading", () => {
      const report: DiffReport = {
        agentA: { name: "Agent A", source: { type: "local", filePath: "/a.json" } },
        agentB: { name: "Agent B", source: { type: "local", filePath: "/b.json" } },
        sections: [],
        summary: { totalChanges: 0, additions: 0, removals: 0, modifications: 0 },
        timestamp: "2025-01-01T00:00:00.000Z",
      };

      const md = formatDiffAsMarkdown(report);
      expect(md).toContain("# CALT Diff Report");
      expect(md).toContain("Agent A");
      expect(md).toContain("Agent B");
    });

    it("should render diff sections with change details", () => {
      const report: DiffReport = {
        agentA: { name: "A", source: { type: "local", filePath: "/a.json" } },
        agentB: { name: "B", source: { type: "local", filePath: "/b.json" } },
        sections: [
          {
            name: "Instructions",
            changeType: "modified",
            details: [
              { field: "text", changeType: "modified", valueA: "old text", valueB: "new text" },
            ],
          },
        ],
        summary: { totalChanges: 1, additions: 0, removals: 0, modifications: 1 },
        timestamp: "2025-01-01T00:00:00.000Z",
      };

      const md = formatDiffAsMarkdown(report);
      expect(md).toContain("Instructions");
      expect(md).toContain("old text");
      expect(md).toContain("new text");
    });
  });
});
