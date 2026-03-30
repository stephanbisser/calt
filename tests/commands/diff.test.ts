import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoadedAgent, DiffReport } from "../../src/core/types.js";
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
    resolveAuth: vi.fn(() => ({
      authConfig: { clientId: "cid", tenantId: "tid" },
      orgUrls: [],
      typeFilter: "all" as const,
    })),
    resolveSource: vi.fn(),
  };
});

vi.mock("../../src/core/differ.js", () => ({
  diffManifests: vi.fn(),
}));

vi.mock("../../src/formatters/diff-formatter.js", () => ({
  formatDiff: vi.fn(() => "terminal diff output"),
}));

vi.mock("../../src/formatters/json-formatter.js", () => ({
  formatDiffAsJson: vi.fn(() => '{"diff":true}'),
}));

vi.mock("../../src/formatters/markdown-formatter.js", () => ({
  formatDiffAsMarkdown: vi.fn(() => "## diff md"),
}));

import { diffCommand } from "../../src/commands/diff.js";
import { loadConfig } from "../../src/core/config-loader.js";
import { resolveAuth, resolveSource } from "../../src/commands/shared/resolve-agents.js";
import { diffManifests } from "../../src/core/differ.js";
import { formatDiff } from "../../src/formatters/diff-formatter.js";
import { formatDiffAsJson } from "../../src/formatters/json-formatter.js";
import { formatDiffAsMarkdown } from "../../src/formatters/markdown-formatter.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeAgent(name = "Agent"): LoadedAgent {
  return {
    manifest: { name, description: "d", instructions: "i" },
    source: { type: "local", filePath: `/test/${name.toLowerCase()}.json` },
  };
}

function makeFakeDiffReport(totalChanges = 0): DiffReport {
  return {
    agentA: { name: "AgentA", source: { type: "local", filePath: "/test/a.json" } },
    agentB: { name: "AgentB", source: { type: "local", filePath: "/test/b.json" } },
    sections: [],
    summary: { totalChanges, additions: 0, removals: 0, modifications: totalChanges },
    timestamp: new Date().toISOString(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("diffCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({ ...DEFAULT_CONFIG });
    vi.mocked(resolveSource).mockResolvedValue(makeFakeAgent("A"));
    vi.mocked(diffManifests).mockReturnValue(makeFakeDiffReport());
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("diffs two agents and outputs terminal format by default", async () => {
    vi.mocked(resolveSource)
      .mockResolvedValueOnce(makeFakeAgent("A"))
      .mockResolvedValueOnce(makeFakeAgent("B"));

    await diffCommand("./a.json", "./b.json", {});

    expect(resolveSource).toHaveBeenCalledTimes(2);
    expect(diffManifests).toHaveBeenCalled();
    expect(formatDiff).toHaveBeenCalled();
  });

  it("outputs JSON when format is json", async () => {
    vi.mocked(resolveSource)
      .mockResolvedValueOnce(makeFakeAgent("A"))
      .mockResolvedValueOnce(makeFakeAgent("B"));

    await diffCommand("./a.json", "./b.json", { format: "json" });
    expect(formatDiffAsJson).toHaveBeenCalled();
  });

  it("outputs markdown when format is markdown", async () => {
    vi.mocked(resolveSource)
      .mockResolvedValueOnce(makeFakeAgent("A"))
      .mockResolvedValueOnce(makeFakeAgent("B"));

    await diffCommand("./a.json", "./b.json", { format: "markdown" });
    expect(formatDiffAsMarkdown).toHaveBeenCalled();
  });

  it("shows no changes for identical agents", async () => {
    const agent = makeFakeAgent("Same");
    vi.mocked(resolveSource).mockResolvedValue(agent);
    vi.mocked(diffManifests).mockReturnValue(makeFakeDiffReport(0));

    await diffCommand("./same.json", "./same.json", {});

    expect(diffManifests).toHaveBeenCalled();
    expect(formatDiff).toHaveBeenCalled();
  });

  it("shows changes for different agents", async () => {
    vi.mocked(resolveSource)
      .mockResolvedValueOnce(makeFakeAgent("A"))
      .mockResolvedValueOnce(makeFakeAgent("B"));
    vi.mocked(diffManifests).mockReturnValue(makeFakeDiffReport(3));

    await diffCommand("./a.json", "./b.json", {});

    const report = vi.mocked(diffManifests).mock.results[0].value as DiffReport;
    expect(report.summary.totalChanges).toBe(3);
  });

  it("loads config from custom path", async () => {
    vi.mocked(resolveSource).mockResolvedValue(makeFakeAgent("A"));

    await diffCommand("./a.json", "./b.json", { config: "./custom.json" });
    expect(loadConfig).toHaveBeenCalledWith("./custom.json");
  });

  it("passes auth options to resolveAuth", async () => {
    vi.mocked(resolveSource).mockResolvedValue(makeFakeAgent("A"));

    await diffCommand("./a.json", "./b.json", { clientId: "my-id", tenant: "my-tenant" });

    expect(resolveAuth).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "my-id", tenant: "my-tenant" }),
      expect.any(Object),
    );
  });

  it("propagates resolveSource errors", async () => {
    vi.mocked(resolveSource).mockRejectedValue(new Error("File not found"));

    await expect(diffCommand("./bad.json", "./b.json", {})).rejects.toThrow("File not found");
  });
});
