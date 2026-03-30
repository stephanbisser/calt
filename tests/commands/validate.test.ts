import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScanReport, LoadedAgent, AgentLensConfig } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/core/config-loader.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../../src/core/manifest-loader.js", () => ({
  loadFromFile: vi.fn(),
}));

vi.mock("../../src/rules/rule-engine.js", () => ({
  runSchemaValidation: vi.fn(),
}));

vi.mock("../../src/formatters/terminal-formatter.js", () => ({
  formatScanReport: vi.fn(() => "terminal output"),
}));

vi.mock("../../src/formatters/json-formatter.js", () => ({
  formatAsJson: vi.fn(() => '{"json":true}'),
}));

vi.mock("../../src/formatters/markdown-formatter.js", () => ({
  formatAsMarkdown: vi.fn(() => "## markdown"),
}));

import { validateCommand } from "../../src/commands/validate.js";
import { loadConfig } from "../../src/core/config-loader.js";
import { loadFromFile } from "../../src/core/manifest-loader.js";
import { runSchemaValidation } from "../../src/rules/rule-engine.js";
import { formatScanReport } from "../../src/formatters/terminal-formatter.js";
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

describe("validateCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({ ...DEFAULT_CONFIG });
    vi.mocked(loadFromFile).mockResolvedValue([makeFakeAgent()]);
    vi.mocked(runSchemaValidation).mockReturnValue(makeFakeReport());
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("calls schema validation for each loaded agent", async () => {
    const agent1 = makeFakeAgent();
    const agent2 = makeFakeAgent();
    vi.mocked(loadFromFile).mockResolvedValue([agent1, agent2]);

    await validateCommand(undefined, {});

    expect(runSchemaValidation).toHaveBeenCalledTimes(2);
    expect(runSchemaValidation).toHaveBeenCalledWith(agent1, expect.any(Object));
    expect(runSchemaValidation).toHaveBeenCalledWith(agent2, expect.any(Object));
  });

  it('defaults path to "." when not provided', async () => {
    await validateCommand(undefined, {});
    expect(loadFromFile).toHaveBeenCalledWith(".");
  });

  it("uses provided path", async () => {
    await validateCommand("./custom/path", {});
    expect(loadFromFile).toHaveBeenCalledWith("./custom/path");
  });

  it("outputs terminal format by default", async () => {
    await validateCommand(undefined, {});
    expect(formatScanReport).toHaveBeenCalled();
  });

  it("outputs JSON when format is json", async () => {
    await validateCommand(undefined, { format: "json" });
    expect(formatAsJson).toHaveBeenCalled();
  });

  it("outputs markdown when format is markdown", async () => {
    await validateCommand(undefined, { format: "markdown" });
    expect(formatAsMarkdown).toHaveBeenCalled();
  });

  it("returns 1 when report has errors", async () => {
    vi.mocked(runSchemaValidation).mockReturnValue(makeFakeReport(2));

    const exitCode = await validateCommand(undefined, {});
    expect(exitCode).toBe(1);
  });

  it("returns undefined when no errors", async () => {
    vi.mocked(runSchemaValidation).mockReturnValue(makeFakeReport(0));

    const exitCode = await validateCommand(undefined, {});
    expect(exitCode).toBeUndefined();
  });

  it("loads config from custom path", async () => {
    await validateCommand(undefined, { config: "./custom.json" });
    expect(loadConfig).toHaveBeenCalledWith("./custom.json");
  });
});
