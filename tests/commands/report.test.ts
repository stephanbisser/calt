import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScanReport, LoadedAgent } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/core/config-loader.js", () => ({
  loadConfig: vi.fn(),
  getDataverseOrgUrls: vi.fn(() => []),
}));

vi.mock("../../src/commands/shared/resolve-agents.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/commands/shared/resolve-agents.js")>();
  return {
    ...orig,
    resolveAgents: vi.fn(),
  };
});

vi.mock("../../src/rules/rule-engine.js", () => ({
  runFullScan: vi.fn(),
}));

vi.mock("../../src/formatters/json-formatter.js", () => ({
  formatAsJson: vi.fn(() => '{"report":true}'),
  formatMultipleAsJson: vi.fn(() => '[{"report":true}]'),
}));

vi.mock("../../src/formatters/markdown-formatter.js", () => ({
  formatAsMarkdown: vi.fn(() => "## report md"),
  formatMultipleAsMarkdown: vi.fn(() => "## multiple md"),
}));

vi.mock("../../src/formatters/html-formatter.js", () => ({
  formatAsHtml: vi.fn(() => "<html>report</html>"),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
}));

import { reportCommand } from "../../src/commands/report.js";
import { loadConfig } from "../../src/core/config-loader.js";
import { resolveAgents } from "../../src/commands/shared/resolve-agents.js";
import { runFullScan } from "../../src/rules/rule-engine.js";
import { formatAsJson, formatMultipleAsJson } from "../../src/formatters/json-formatter.js";
import { formatAsMarkdown, formatMultipleAsMarkdown } from "../../src/formatters/markdown-formatter.js";
import { formatAsHtml } from "../../src/formatters/html-formatter.js";
import { writeFile } from "node:fs/promises";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeAgent(name = "Agent"): LoadedAgent {
  return {
    manifest: { name, description: "d", instructions: "i" },
    source: { type: "local", filePath: "/test/agent.json" },
  };
}

function makeFakeReport(errors = 0, name = "Agent"): ScanReport {
  return {
    agent: { name, source: { type: "local", filePath: "/test/agent.json" } },
    categories: [],
    summary: { totalChecks: 5, passed: 5 - errors, errors, warnings: 0, infos: 0 },
    timestamp: new Date().toISOString(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("reportCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({ ...DEFAULT_CONFIG });
    vi.mocked(resolveAgents).mockResolvedValue([makeFakeAgent()]);
    vi.mocked(runFullScan).mockResolvedValue(makeFakeReport());
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("uses json format for single report", async () => {
    await reportCommand(undefined, { format: "json" });
    expect(formatAsJson).toHaveBeenCalled();
  });

  it("uses markdown format for single report", async () => {
    await reportCommand(undefined, { format: "markdown" });
    expect(formatAsMarkdown).toHaveBeenCalled();
  });

  it("uses html format for single report", async () => {
    await reportCommand(undefined, { format: "html" });
    expect(formatAsHtml).toHaveBeenCalled();
  });

  it("uses formatMultipleAsJson for multiple reports", async () => {
    vi.mocked(resolveAgents).mockResolvedValue([makeFakeAgent("A1"), makeFakeAgent("A2")]);
    vi.mocked(runFullScan)
      .mockResolvedValueOnce(makeFakeReport(0, "A1"))
      .mockResolvedValueOnce(makeFakeReport(0, "A2"));

    await reportCommand(undefined, { format: "json" });
    expect(formatMultipleAsJson).toHaveBeenCalled();
  });

  it("uses formatMultipleAsMarkdown for multiple reports", async () => {
    vi.mocked(resolveAgents).mockResolvedValue([makeFakeAgent("A1"), makeFakeAgent("A2")]);
    vi.mocked(runFullScan)
      .mockResolvedValueOnce(makeFakeReport(0, "A1"))
      .mockResolvedValueOnce(makeFakeReport(0, "A2"));

    await reportCommand(undefined, { format: "markdown" });
    expect(formatMultipleAsMarkdown).toHaveBeenCalled();
  });

  it("concatenates HTML for multiple reports", async () => {
    vi.mocked(resolveAgents).mockResolvedValue([makeFakeAgent("A1"), makeFakeAgent("A2")]);
    vi.mocked(runFullScan)
      .mockResolvedValueOnce(makeFakeReport(0, "A1"))
      .mockResolvedValueOnce(makeFakeReport(0, "A2"));

    await reportCommand(undefined, { format: "html" });
    expect(formatAsHtml).toHaveBeenCalledTimes(2);
  });

  it("writes to file when --output is specified", async () => {
    await reportCommand(undefined, { format: "json", output: "./report.json" });

    expect(writeFile).toHaveBeenCalledWith("./report.json", expect.any(String));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("report.json"));
  });

  it("prints to console when no --output", async () => {
    await reportCommand(undefined, { format: "json" });
    expect(writeFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });

  it("loads config from custom path", async () => {
    await reportCommand(undefined, { format: "json", config: "./custom.json" });
    expect(loadConfig).toHaveBeenCalledWith("./custom.json");
  });

  it("propagates resolveAgents errors", async () => {
    vi.mocked(resolveAgents).mockRejectedValue(new Error("No manifest found"));
    await expect(reportCommand("./bad", { format: "json" })).rejects.toThrow("No manifest found");
  });
});
