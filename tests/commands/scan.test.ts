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

vi.mock("../../src/formatters/terminal-formatter.js", () => ({
  formatScanReport: vi.fn(() => "terminal scan output"),
}));

vi.mock("../../src/formatters/json-formatter.js", () => ({
  formatAsJson: vi.fn(() => '{"scan":true}'),
}));

vi.mock("../../src/formatters/markdown-formatter.js", () => ({
  formatAsMarkdown: vi.fn(() => "## scan md"),
}));

import { scanCommand } from "../../src/commands/scan.js";
import { loadConfig } from "../../src/core/config-loader.js";
import { resolveAgents } from "../../src/commands/shared/resolve-agents.js";
import { runFullScan } from "../../src/rules/rule-engine.js";
import { formatScanReport } from "../../src/formatters/terminal-formatter.js";
import { formatAsJson } from "../../src/formatters/json-formatter.js";
import { formatAsMarkdown } from "../../src/formatters/markdown-formatter.js";

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

describe("scanCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({ ...DEFAULT_CONFIG });
    vi.mocked(resolveAgents).mockResolvedValue([makeFakeAgent()]);
    vi.mocked(runFullScan).mockResolvedValue(makeFakeReport());
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("returns undefined (exit 0) when no errors", async () => {
    const exitCode = await scanCommand(undefined, {});
    expect(exitCode).toBeUndefined();
  });

  it("returns 1 when any report has errors", async () => {
    vi.mocked(runFullScan).mockResolvedValue(makeFakeReport(2));

    const exitCode = await scanCommand(undefined, {});
    expect(exitCode).toBe(1);
  });

  it("calls runFullScan for each resolved agent", async () => {
    const agent1 = makeFakeAgent("A1");
    const agent2 = makeFakeAgent("A2");
    vi.mocked(resolveAgents).mockResolvedValue([agent1, agent2]);

    await scanCommand(undefined, {});

    expect(runFullScan).toHaveBeenCalledTimes(2);
    expect(runFullScan).toHaveBeenCalledWith(agent1, expect.any(Object));
    expect(runFullScan).toHaveBeenCalledWith(agent2, expect.any(Object));
  });

  it("outputs terminal format by default", async () => {
    await scanCommand(undefined, {});
    expect(formatScanReport).toHaveBeenCalled();
  });

  it("outputs JSON when format is json", async () => {
    await scanCommand(undefined, { format: "json" });
    expect(formatAsJson).toHaveBeenCalled();
  });

  it("outputs markdown when format is markdown", async () => {
    await scanCommand(undefined, { format: "markdown" });
    expect(formatAsMarkdown).toHaveBeenCalled();
  });

  it("passes options through to resolveAgents", async () => {
    await scanCommand("./path", { remote: true, all: true });

    expect(resolveAgents).toHaveBeenCalledWith(
      "./path",
      expect.objectContaining({ remote: true, all: true }),
      expect.any(Object),
    );
  });

  it("loads config from custom path", async () => {
    await scanCommand(undefined, { config: "./custom.json" });
    expect(loadConfig).toHaveBeenCalledWith("./custom.json");
  });

  it("returns 1 when at least one of multiple reports has errors", async () => {
    const agent1 = makeFakeAgent("A1");
    const agent2 = makeFakeAgent("A2");
    vi.mocked(resolveAgents).mockResolvedValue([agent1, agent2]);
    vi.mocked(runFullScan)
      .mockResolvedValueOnce(makeFakeReport(0, "A1"))
      .mockResolvedValueOnce(makeFakeReport(1, "A2"));

    const exitCode = await scanCommand(undefined, {});
    expect(exitCode).toBe(1);
  });

  it("handles remote agents via resolveAgents", async () => {
    const remoteAgent: LoadedAgent = {
      manifest: { name: "Remote", description: "d", instructions: "i" },
      source: { type: "remote", packageId: "T_abc123" },
    };
    vi.mocked(resolveAgents).mockResolvedValue([remoteAgent]);
    vi.mocked(runFullScan).mockResolvedValue(makeFakeReport(0, "Remote"));

    const exitCode = await scanCommand(undefined, { remote: true, id: "T_abc123" });
    expect(exitCode).toBeUndefined();
    expect(runFullScan).toHaveBeenCalledWith(remoteAgent, expect.any(Object));
  });

  it("propagates resolveAgents errors", async () => {
    vi.mocked(resolveAgents).mockRejectedValue(new Error("No manifest found"));

    await expect(scanCommand("./invalid", {})).rejects.toThrow("No manifest found");
  });

  it("passes verbose flag to formatScanReport", async () => {
    await scanCommand(undefined, { verbose: true });
    expect(formatScanReport).toHaveBeenCalledWith(expect.any(Object), true);
  });
});
