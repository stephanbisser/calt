import { describe, it, expect } from "vitest";
import { formatAsHtml } from "../../src/formatters/html-formatter.js";
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

describe("HTML Formatter", () => {
  describe("formatAsHtml", () => {
    it("should contain proper HTML document structure", () => {
      const html = formatAsHtml(makeScanReport());
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html");
      expect(html).toContain("<head>");
      expect(html).toContain("</head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</body>");
      expect(html).toContain("</html>");
    });

    it("should include agent name in output", () => {
      const html = formatAsHtml(makeScanReport());
      expect(html).toContain("Test Agent");
    });

    it("should include summary statistics", () => {
      const report = makeScanReport({
        summary: { totalChecks: 10, passed: 7, errors: 2, warnings: 1, infos: 0 },
      });
      const html = formatAsHtml(report);
      // Summary cards should display counts
      expect(html).toContain("Passed");
      expect(html).toContain("Error");
      expect(html).toContain("Warning");
    });

    it("should render rule results", () => {
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
                details: "Field 'name' is required",
              },
              {
                ruleId: "SCH-002",
                ruleName: "Version Check",
                severity: "warning",
                passed: true,
                message: "Version is supported",
              },
            ],
            passed: 1,
            total: 2,
          },
        ],
        summary: { totalChecks: 2, passed: 1, errors: 1, warnings: 0, infos: 0 },
      });

      const html = formatAsHtml(report);
      expect(html).toContain("SCH-001");
      expect(html).toContain("Schema validation failed");
      expect(html).toContain("SCH-002");
    });

    it("should escape HTML special characters in messages", () => {
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
                passed: false,
                message: 'Instructions contain <script>alert("xss")</script> & "quotes"',
              },
            ],
            passed: 0,
            total: 1,
          },
        ],
        summary: { totalChecks: 1, passed: 0, errors: 1, warnings: 0, infos: 0 },
      });

      const html = formatAsHtml(report);
      // Should NOT contain raw < or > from the message
      expect(html).not.toContain('<script>alert("xss")</script>');
      // Should contain escaped versions
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&amp;");
    });

    it("should handle empty results", () => {
      const html = formatAsHtml(makeScanReport());
      expect(html).toContain("<!DOCTYPE html>");
      expect(html.length).toBeGreaterThan(100);
    });

    it("should include embedded CSS styles", () => {
      const html = formatAsHtml(makeScanReport());
      expect(html).toContain("<style>");
      expect(html).toContain("</style>");
    });

    it("should handle remote agent source", () => {
      const report = makeScanReport({
        agent: {
          name: "Remote Agent",
          source: { type: "remote", packageId: "pkg-456" },
        },
      });
      const html = formatAsHtml(report);
      expect(html).toContain("Remote Agent");
    });

    it("should include CALT footer", () => {
      const html = formatAsHtml(makeScanReport());
      expect(html).toContain("CALT");
    });
  });
});
