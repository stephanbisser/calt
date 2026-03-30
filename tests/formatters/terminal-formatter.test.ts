import { describe, it, expect } from "vitest";
import {
  formatScanReport,
  formatLintReport,
} from "../../src/formatters/terminal-formatter.js";
import type { ScanReport } from "../../src/core/types.js";

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

describe("Terminal Formatter", () => {
  describe("formatScanReport", () => {
    it("should return a non-empty string", () => {
      const output = formatScanReport(makeScanReport());
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);
    });

    it("should include agent name", () => {
      const output = formatScanReport(makeScanReport());
      expect(output).toContain("Test Agent");
    });

    it("should show error indicators for failed checks", () => {
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
              },
            ],
            passed: 0,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 0, errors: 1, warnings: 0, infos: 0 },
      });

      const output = formatScanReport(report);
      expect(output).toContain("Schema validation failed");
      expect(output).toContain("SCH-001");
    });

    it("should show warning results", () => {
      const report = makeScanReport({
        categories: [
          {
            name: "Instructions",
            category: "instructions",
            results: [
              {
                ruleId: "INST-002",
                ruleName: "Ideal Length",
                severity: "warning",
                passed: false,
                message: "Instructions are too short",
              },
            ],
            passed: 0,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 0, errors: 0, warnings: 1, infos: 0 },
      });

      const output = formatScanReport(report);
      expect(output).toContain("Instructions are too short");
    });

    it("should show all-pass results in default mode", () => {
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
              {
                ruleId: "SCH-002",
                ruleName: "Version",
                severity: "error",
                passed: true,
                message: "Version check passed",
              },
            ],
            passed: 2,
            total: 2,
          },
        ],
        summary: { totalChecks: 2, passed: 2, errors: 0, warnings: 0, infos: 0 },
      });

      const output = formatScanReport(report);
      // In non-verbose mode, passed checks are collapsed
      expect(output).toContain("passed");
    });

    it("should expand passed checks in verbose mode", () => {
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

      const verbose = formatScanReport(report, true);
      expect(verbose).toContain("Schema is valid");
    });

    it("should display source information", () => {
      const report = makeScanReport({
        agent: {
          name: "Remote Agent",
          source: { type: "remote", packageId: "pkg-123" },
        },
      });
      const output = formatScanReport(report);
      expect(output).toContain("Remote Agent");
    });
  });

  describe("formatLintReport", () => {
    it("should return a non-empty string", () => {
      const output = formatLintReport(makeScanReport());
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);
    });

    it("should include agent name", () => {
      const output = formatLintReport(makeScanReport());
      expect(output).toContain("Test Agent");
    });

    it("should list failed instruction rules", () => {
      const report = makeScanReport({
        categories: [
          {
            name: "Instructions",
            category: "instructions",
            results: [
              {
                ruleId: "INST-004",
                ruleName: "Objective Statement",
                severity: "warning",
                passed: false,
                message: "Missing objective statement",
              },
              {
                ruleId: "INST-008",
                ruleName: "Workflow Steps",
                severity: "info",
                passed: false,
                message: "No workflow steps found",
              },
            ],
            passed: 0,
            total: 2,
          },
        ],
        summary: { totalChecks: 2, passed: 0, errors: 0, warnings: 1, infos: 1 },
      });

      const output = formatLintReport(report);
      expect(output).toContain("INST-004");
      expect(output).toContain("INST-008");
    });

    it("should show no issues message when all pass", () => {
      const report = makeScanReport({
        categories: [
          {
            name: "Instructions",
            category: "instructions",
            results: [
              {
                ruleId: "INST-001",
                ruleName: "Length Check",
                severity: "error",
                passed: true,
                message: "Instruction length: 500 characters",
              },
            ],
            passed: 1,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 1, errors: 0, warnings: 0, infos: 0 },
      });

      const output = formatLintReport(report);
      // Should not list any failed rules
      expect(output).not.toContain("✗");
    });
  });
});
