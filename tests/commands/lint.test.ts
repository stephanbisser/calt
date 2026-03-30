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
  runInstructionLint: vi.fn(),
}));

vi.mock("../../src/formatters/terminal-formatter.js", () => ({
  formatLintReport: vi.fn(() => "lint output"),
}));

vi.mock("../../src/formatters/json-formatter.js", () => ({
  formatAsJson: vi.fn(() => '{"lint":true}'),
}));

vi.mock("../../src/formatters/markdown-formatter.js", () => ({
  formatAsMarkdown: vi.fn(() => "## lint md"),
}));

import { lintCommand } from "../../src/commands/lint.js";
import { loadConfig } from "../../src/core/config-loader.js";
import { resolveAgents } from "../../src/commands/shared/resolve-agents.js";
import { runInstructionLint } from "../../src/rules/rule-engine.js";
import { formatLintReport } from "../../src/formatters/terminal-formatter.js";
import { formatAsJson } from "../../src/formatters/json-formatter.js";
import { formatAsMarkdown } from "../../src/formatters/markdown-formatter.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeAgent(): LoadedAgent {
  return {
    manifest: { name: "Agent", description: "d", instructions: "i" },
    source: { type: "local", filePath: "/test/agent.json" },
  };
}

function makeFakeReport(errors = 0): ScanReport {
  return {
    agent: { name: "Agent", source: { type: "local", filePath: "/test/agent.json" } },
    categories: [],
    summary: { totalChecks: 5, passed: 5 - errors, errors, warnings: 0, infos: 0 },
    timestamp: new Date().toISOString(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("lintCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({ ...DEFAULT_CONFIG });
    vi.mocked(resolveAgents).mockResolvedValue([makeFakeAgent()]);
    vi.mocked(runInstructionLint).mockReturnValue(makeFakeReport());
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("calls runInstructionLint for each resolved agent", async () => {
    const agent1 = makeFakeAgent();
    const agent2 = makeFakeAgent();
    vi.mocked(resolveAgents).mockResolvedValue([agent1, agent2]);

    await lintCommand(undefined, {});

    expect(runInstructionLint).toHaveBeenCalledTimes(2);
    expect(runInstructionLint).toHaveBeenCalledWith(agent1, expect.any(Object));
    expect(runInstructionLint).toHaveBeenCalledWith(agent2, expect.any(Object));
  });

  it("passes options through to resolveAgents", async () => {
    await lintCommand("./path", { remote: true, all: true });

    expect(resolveAgents).toHaveBeenCalledWith(
      "./path",
      expect.objectContaining({ remote: true, all: true }),
      expect.any(Object),
    );
  });

  it("outputs terminal format by default", async () => {
    await lintCommand(undefined, {});
    expect(formatLintReport).toHaveBeenCalled();
  });

  it("outputs JSON when format is json", async () => {
    await lintCommand(undefined, { format: "json" });
    expect(formatAsJson).toHaveBeenCalled();
  });

  it("outputs markdown when format is markdown", async () => {
    await lintCommand(undefined, { format: "markdown" });
    expect(formatAsMarkdown).toHaveBeenCalled();
  });

  it("returns 1 when any report has errors", async () => {
    vi.mocked(runInstructionLint).mockReturnValue(makeFakeReport(3));

    const exitCode = await lintCommand(undefined, {});
    expect(exitCode).toBe(1);
  });

  it("returns undefined when no errors", async () => {
    const exitCode = await lintCommand(undefined, {});
    expect(exitCode).toBeUndefined();
  });

  it("loads config from custom path", async () => {
    await lintCommand(undefined, { config: "./custom.json" });
    expect(loadConfig).toHaveBeenCalledWith("./custom.json");
  });
});
