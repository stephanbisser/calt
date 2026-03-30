import { describe, it, expect } from "vitest";
import {
  formatAsSarif,
  formatMultipleAsSarif,
} from "../../src/formatters/sarif-formatter.js";
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

function makeReportWithResults(): ScanReport {
  return makeScanReport({
    categories: [
      {
        name: "Instructions",
        category: "instructions",
        results: [
          {
            ruleId: "INST-001",
            ruleName: "instructions-not-empty",
            severity: "error",
            passed: false,
            message: "Instructions must not be empty",
            details: "The instructions field is empty",
          },
          {
            ruleId: "INST-003",
            ruleName: "instructions-min-length",
            severity: "warning",
            passed: false,
            message: "Instructions too short",
          },
          {
            ruleId: "INST-005",
            ruleName: "has-markdown-structure",
            severity: "info",
            passed: false,
            message: "Consider using Markdown structure",
          },
          {
            ruleId: "INST-002",
            ruleName: "instructions-max-length",
            severity: "error",
            passed: true,
            message: "Instructions within max length",
          },
        ],
        passed: 1,
        total: 4,
      },
    ],
    summary: { totalChecks: 4, passed: 1, errors: 1, warnings: 1, infos: 1 },
  });
}

describe("SARIF Formatter", () => {
  describe("formatAsSarif", () => {
    it("should produce valid SARIF structure with $schema, version, and runs", () => {
      const report = makeScanReport();
      const output = formatAsSarif(report);
      const parsed = JSON.parse(output);

      expect(parsed.$schema).toBe(
        "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
      );
      expect(parsed.version).toBe("2.1.0");
      expect(parsed.runs).toBeInstanceOf(Array);
      expect(parsed.runs).toHaveLength(1);
    });

    it("should include tool driver info", () => {
      const report = makeScanReport();
      const parsed = JSON.parse(formatAsSarif(report));
      const driver = parsed.runs[0].tool.driver;

      expect(driver.name).toBe("calt");
      expect(driver.version).toBeDefined();
      expect(typeof driver.version).toBe("string");
      expect(driver.informationUri).toBe("https://github.com/stephanbisser/calt");
      expect(driver.rules).toBeInstanceOf(Array);
    });

    it("should map results correctly from RuleResult", () => {
      const report = makeReportWithResults();
      const parsed = JSON.parse(formatAsSarif(report));
      const results = parsed.runs[0].results;

      // Only failed results should be included (3 failed, 1 passed)
      expect(results).toHaveLength(3);
      expect(results[0].ruleId).toBe("INST-001");
      expect(results[0].message.text).toBe("The instructions field is empty");
      expect(results[0].locations).toHaveLength(1);
      expect(results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
        "/test/agent.json",
      );
    });

    it("should map severity correctly: error → error, warning → warning, info → note", () => {
      const report = makeReportWithResults();
      const parsed = JSON.parse(formatAsSarif(report));
      const results = parsed.runs[0].results;

      const errorResult = results.find((r: { ruleId: string }) => r.ruleId === "INST-001");
      const warningResult = results.find((r: { ruleId: string }) => r.ruleId === "INST-003");
      const infoResult = results.find((r: { ruleId: string }) => r.ruleId === "INST-005");

      expect(errorResult.level).toBe("error");
      expect(warningResult.level).toBe("warning");
      expect(infoResult.level).toBe("note");
    });

    it("should include rule definitions in tool.driver.rules", () => {
      const report = makeReportWithResults();
      const parsed = JSON.parse(formatAsSarif(report));
      const rules = parsed.runs[0].tool.driver.rules;

      expect(rules).toHaveLength(3); // 3 unique failed rules
      expect(rules[0].id).toBe("INST-001");
      expect(rules[0].name).toBe("instructions-not-empty");
      expect(rules[0].shortDescription.text).toBeDefined();
      expect(rules[0].defaultConfiguration.level).toBe("error");
      expect(rules[0].helpUri).toBeDefined();
    });

    it("should produce valid SARIF with empty results", () => {
      const report = makeScanReport();
      const parsed = JSON.parse(formatAsSarif(report));

      expect(parsed.runs[0].results).toEqual([]);
      expect(parsed.runs[0].tool.driver.rules).toEqual([]);
    });

    it("should include line number in region when available", () => {
      const report = makeScanReport({
        categories: [
          {
            name: "Schema",
            category: "schema",
            results: [
              {
                ruleId: "SCH-001",
                ruleName: "valid-schema",
                severity: "error",
                passed: false,
                message: "Schema invalid",
                line: 10,
              },
            ],
            passed: 0,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 0, errors: 1, warnings: 0, infos: 0 },
      });

      const parsed = JSON.parse(formatAsSarif(report));
      const location = parsed.runs[0].results[0].locations[0].physicalLocation;
      expect(location.region.startLine).toBe(10);
    });

    it("should not include region when line is not available", () => {
      const report = makeReportWithResults();
      const parsed = JSON.parse(formatAsSarif(report));
      const location = parsed.runs[0].results[0].locations[0].physicalLocation;
      expect(location.region).toBeUndefined();
    });

    it("should use details as message text when available, falling back to message", () => {
      const report = makeReportWithResults();
      const parsed = JSON.parse(formatAsSarif(report));
      const results = parsed.runs[0].results;

      // INST-001 has details
      expect(results[0].message.text).toBe("The instructions field is empty");
      // INST-003 has no details, should use message
      expect(results[1].message.text).toBe("Instructions too short");
    });

    it("should handle remote agent source", () => {
      const report = makeScanReport({
        agent: {
          name: "Remote Agent",
          source: { type: "remote", packageId: "T_abc123" },
        },
      });

      const parsed = JSON.parse(formatAsSarif(report));
      // Empty results since no categories, just verify it doesn't crash
      expect(parsed.runs[0].results).toEqual([]);
    });
  });

  describe("formatMultipleAsSarif", () => {
    it("should produce single SARIF with multiple results from multiple agents", () => {
      const report1 = makeScanReport({
        agent: {
          name: "Agent 1",
          source: { type: "local", filePath: "/a.json" },
        },
        categories: [
          {
            name: "Schema",
            category: "schema",
            results: [
              {
                ruleId: "SCH-001",
                ruleName: "valid-schema",
                severity: "error",
                passed: false,
                message: "Invalid",
              },
            ],
            passed: 0,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 0, errors: 1, warnings: 0, infos: 0 },
      });

      const report2 = makeScanReport({
        agent: {
          name: "Agent 2",
          source: { type: "local", filePath: "/b.json" },
        },
        categories: [
          {
            name: "Instructions",
            category: "instructions",
            results: [
              {
                ruleId: "INST-001",
                ruleName: "instructions-not-empty",
                severity: "error",
                passed: false,
                message: "Empty instructions",
              },
            ],
            passed: 0,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 0, errors: 1, warnings: 0, infos: 0 },
      });

      const parsed = JSON.parse(formatMultipleAsSarif([report1, report2]));

      expect(parsed.runs).toHaveLength(1);
      expect(parsed.runs[0].results).toHaveLength(2);
      expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe("/a.json");
      expect(parsed.runs[0].results[1].locations[0].physicalLocation.artifactLocation.uri).toBe("/b.json");
    });

    it("should produce valid SARIF with empty reports array", () => {
      const parsed = JSON.parse(formatMultipleAsSarif([]));

      expect(parsed.$schema).toBeDefined();
      expect(parsed.version).toBe("2.1.0");
      expect(parsed.runs).toHaveLength(1);
      expect(parsed.runs[0].results).toEqual([]);
      expect(parsed.runs[0].tool.driver.rules).toEqual([]);
    });

    it("should deduplicate rule definitions across reports", () => {
      const makeReportWithRule = (filePath: string): ScanReport =>
        makeScanReport({
          agent: {
            name: "Agent",
            source: { type: "local", filePath },
          },
          categories: [
            {
              name: "Instructions",
              category: "instructions",
              results: [
                {
                  ruleId: "INST-001",
                  ruleName: "instructions-not-empty",
                  severity: "error",
                  passed: false,
                  message: "Empty",
                },
              ],
              passed: 0,
              total: 1,
            },
          ],
          summary: { totalChecks: 1, passed: 0, errors: 1, warnings: 0, infos: 0 },
        });

      const parsed = JSON.parse(
        formatMultipleAsSarif([makeReportWithRule("/a.json"), makeReportWithRule("/b.json")]),
      );

      // Same ruleId from two reports should appear only once in rules
      const ruleIds = parsed.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
      expect(ruleIds).toEqual(["INST-001"]);
      // But results should have both
      expect(parsed.runs[0].results).toHaveLength(2);
    });
  });
});
