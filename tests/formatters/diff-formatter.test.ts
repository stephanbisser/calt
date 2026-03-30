import { describe, it, expect } from "vitest";
import { formatDiff } from "../../src/formatters/diff-formatter.js";
import type { DiffReport } from "../../src/core/types.js";

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

describe("Diff Formatter", () => {
  describe("formatDiff", () => {
    it("should return a non-empty string", () => {
      const output = formatDiff(makeDiffReport());
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);
    });

    it("should include agent names", () => {
      const output = formatDiff(makeDiffReport());
      expect(output).toContain("Agent A");
      expect(output).toContain("Agent B");
    });

    it("should show no-differences message for empty sections", () => {
      const output = formatDiff(makeDiffReport());
      expect(output).toContain("No differences found");
    });

    it("should render added section", () => {
      const report = makeDiffReport({
        sections: [
          {
            name: "Knowledge",
            changeType: "added",
            details: [
              { field: "source", changeType: "added", valueB: "SharePoint" },
            ],
          },
        ],
        summary: { totalChanges: 1, additions: 1, removals: 0, modifications: 0 },
      });

      const output = formatDiff(report);
      expect(output).toContain("Knowledge");
      expect(output).toContain("SharePoint");
    });

    it("should render removed section", () => {
      const report = makeDiffReport({
        sections: [
          {
            name: "Actions",
            changeType: "removed",
            details: [
              { field: "plugin", changeType: "removed", valueA: "old-plugin.json" },
            ],
          },
        ],
        summary: { totalChanges: 1, additions: 0, removals: 1, modifications: 0 },
      });

      const output = formatDiff(report);
      expect(output).toContain("Actions");
      expect(output).toContain("old-plugin.json");
    });

    it("should render modified section with both values", () => {
      const report = makeDiffReport({
        sections: [
          {
            name: "Instructions",
            changeType: "modified",
            details: [
              {
                field: "text",
                changeType: "modified",
                valueA: "You are a helpful assistant",
                valueB: "You are a specialized agent",
              },
            ],
          },
        ],
        summary: { totalChanges: 1, additions: 0, removals: 0, modifications: 1 },
      });

      const output = formatDiff(report);
      expect(output).toContain("Instructions");
      expect(output).toContain("You are a helpful assistant");
      expect(output).toContain("You are a specialized agent");
    });

    it("should include summary line", () => {
      const report = makeDiffReport({
        sections: [
          {
            name: "Instructions",
            changeType: "modified",
            details: [
              { field: "text", changeType: "modified", valueA: "a", valueB: "b" },
            ],
          },
          {
            name: "Knowledge",
            changeType: "added",
            details: [
              { field: "source", changeType: "added", valueB: "new" },
            ],
          },
        ],
        summary: { totalChanges: 2, additions: 1, removals: 0, modifications: 1 },
      });

      const output = formatDiff(report);
      // Summary should mention total changes
      expect(output).toContain("2");
    });

    it("should handle remote source types", () => {
      const report = makeDiffReport({
        agentA: { name: "Remote A", source: { type: "remote", packageId: "pkg-1" } },
        agentB: { name: "Remote B", source: { type: "remote-dataverse", botId: "bot-1", orgUrl: "https://org.crm.dynamics.com" } },
      });

      const output = formatDiff(report);
      expect(output).toContain("Remote A");
      expect(output).toContain("Remote B");
    });

    it("should truncate long values", () => {
      const longValue = "x".repeat(200);
      const report = makeDiffReport({
        sections: [
          {
            name: "Instructions",
            changeType: "modified",
            details: [
              { field: "text", changeType: "modified", valueA: longValue, valueB: "short" },
            ],
          },
        ],
        summary: { totalChanges: 1, additions: 0, removals: 0, modifications: 1 },
      });

      const output = formatDiff(report);
      // The long value should be truncated (120 chars + "...")
      expect(output).not.toContain(longValue);
      expect(output).toContain("...");
    });
  });
});
