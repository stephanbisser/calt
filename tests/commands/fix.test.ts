import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScanReport, LoadedAgent, RuleResult } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/core/config-loader.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../../src/core/manifest-loader.js", () => ({
  loadFromFile: vi.fn(),
}));

vi.mock("../../src/rules/rule-engine.js", () => ({
  runFullScan: vi.fn(),
}));

vi.mock("../../src/core/fixer.js", () => ({
  applyFixes: vi.fn(),
}));

vi.mock("../../src/formatters/terminal-formatter.js", () => ({
  formatScanReport: vi.fn(() => "updated report output"),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import { fixCommand } from "../../src/commands/fix.js";
import { loadConfig } from "../../src/core/config-loader.js";
import { loadFromFile } from "../../src/core/manifest-loader.js";
import { runFullScan } from "../../src/rules/rule-engine.js";
import { applyFixes } from "../../src/core/fixer.js";
import { formatScanReport } from "../../src/formatters/terminal-formatter.js";
import { readFile, writeFile } from "node:fs/promises";
import { AgentLensError } from "../../src/core/errors.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeAgent(name = "Agent"): LoadedAgent {
  return {
    manifest: { name, description: "d", instructions: "i" },
    source: { type: "local", filePath: "/test/agent.json" },
  };
}

function makeFakeReport(fixableResults: RuleResult[] = []): ScanReport {
  return {
    agent: { name: "Agent", source: { type: "local", filePath: "/test/agent.json" } },
    categories: [{ name: "instructions", results: fixableResults }],
    summary: {
      totalChecks: fixableResults.length,
      passed: fixableResults.filter((r) => r.passed).length,
      errors: fixableResults.filter((r) => !r.passed && r.severity === "error").length,
      warnings: fixableResults.filter((r) => !r.passed && r.severity === "warning").length,
      infos: 0,
    },
    timestamp: new Date().toISOString(),
  };
}

function makeFixableResult(): RuleResult {
  return {
    ruleId: "INST-001",
    ruleName: "Instruction length",
    severity: "warning",
    passed: false,
    message: "Instructions too short",
    fix: { type: "append-section", content: "\n## Additional context" },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("fixCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({ ...DEFAULT_CONFIG });
    vi.mocked(loadFromFile).mockResolvedValue([makeFakeAgent()]);
    vi.mocked(runFullScan).mockResolvedValue(makeFakeReport());
    vi.mocked(applyFixes).mockReturnValue({
      manifest: { name: "Agent", description: "d", instructions: "fixed" },
      applied: [],
    });
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ name: "Agent", description: "d", instructions: "i" }),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("throws when no agents found", async () => {
    vi.mocked(loadFromFile).mockResolvedValue([]);

    await expect(fixCommand(undefined, {})).rejects.toThrow(AgentLensError);
  });

  it("reports no fixable issues when none found", async () => {
    vi.mocked(runFullScan).mockResolvedValue(makeFakeReport([]));

    await fixCommand(undefined, {});

    expect(applyFixes).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("No auto-fixable"));
  });

  it("applies fixes and writes manifest back", async () => {
    const fixResult = makeFixableResult();
    vi.mocked(runFullScan)
      .mockResolvedValueOnce(makeFakeReport([fixResult]))
      .mockResolvedValueOnce(makeFakeReport([])); // re-scan after fix
    vi.mocked(applyFixes).mockReturnValue({
      manifest: { name: "Agent", description: "d", instructions: "fixed instructions" },
      applied: [{ ruleId: "INST-001", description: "Added section", applied: true }],
    });

    await fixCommand(undefined, {});

    expect(applyFixes).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
  });

  it("dry-run does not write files", async () => {
    const fixResult = makeFixableResult();
    vi.mocked(runFullScan).mockResolvedValue(makeFakeReport([fixResult]));
    vi.mocked(applyFixes).mockReturnValue({
      manifest: { name: "Agent", description: "d", instructions: "fixed" },
      applied: [{ ruleId: "INST-001", description: "Added section", applied: true }],
    });

    await fixCommand(undefined, { dryRun: true });

    expect(writeFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Dry run"));
  });

  it("skips remote agents", async () => {
    const remoteAgent: LoadedAgent = {
      manifest: { name: "Remote", description: "d", instructions: "i" },
      source: { type: "remote", packageId: "T_abc" },
    };
    vi.mocked(loadFromFile).mockResolvedValue([remoteAgent]);

    await fixCommand(undefined, {});

    expect(runFullScan).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Skipping remote"));
  });

  it("writes to external instruction file when instructionsFilePath is set", async () => {
    const agent: LoadedAgent = {
      manifest: { name: "Agent", description: "d", instructions: "i" },
      source: { type: "local", filePath: "/test/agent.json" },
      instructionsFilePath: "/test/instructions.txt",
    };
    vi.mocked(loadFromFile).mockResolvedValue([agent]);

    const fixResult = makeFixableResult();
    vi.mocked(runFullScan)
      .mockResolvedValueOnce(makeFakeReport([fixResult]))
      .mockResolvedValueOnce(makeFakeReport([]));
    vi.mocked(applyFixes).mockReturnValue({
      manifest: { name: "Agent", description: "d", instructions: "fixed external" },
      applied: [{ ruleId: "INST-001", description: "Added section", applied: true }],
    });

    await fixCommand(undefined, {});

    expect(writeFile).toHaveBeenCalledWith(
      "/test/instructions.txt",
      "fixed external",
      "utf-8",
    );
  });

  it("handles no applied fixes gracefully", async () => {
    const fixResult = makeFixableResult();
    vi.mocked(runFullScan).mockResolvedValue(makeFakeReport([fixResult]));
    vi.mocked(applyFixes).mockReturnValue({
      manifest: { name: "Agent", description: "d", instructions: "i" },
      applied: [{ ruleId: "INST-001", description: "Could not apply", applied: false }],
    });

    await fixCommand(undefined, {});

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("No fixes could be applied"));
  });

  it("loads config from custom path", async () => {
    await fixCommand(undefined, { config: "./custom.json" });
    expect(loadConfig).toHaveBeenCalledWith("./custom.json");
  });

  it("defaults path to . when not provided", async () => {
    await fixCommand(undefined, {});
    expect(loadFromFile).toHaveBeenCalledWith(".");
  });

  it("uses provided path", async () => {
    await fixCommand("./my-agent", {});
    expect(loadFromFile).toHaveBeenCalledWith("./my-agent");
  });
});
