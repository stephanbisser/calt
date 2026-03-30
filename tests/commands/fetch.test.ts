import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoadedAgent } from "../../src/core/types.js";
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
    needsGraph: orig.needsGraph,
    needsDataverse: orig.needsDataverse,
  };
});

vi.mock("../../src/core/manifest-loader.js", () => ({
  listRemoteAgents: vi.fn(),
  loadFromRemote: vi.fn(),
  loadAllFromRemote: vi.fn(),
  listDataverseBotsAllEnvs: vi.fn(),
  loadAllFromDataverseAllEnvs: vi.fn(),
  loadFromDataverseAnyEnv: vi.fn(),
}));

vi.mock("../../src/formatters/terminal-formatter.js", () => ({
  formatAgentTable: vi.fn(() => "agent table"),
  copilotPackageToSummary: vi.fn((pkg: { id: string; name: string }, type: string) => ({
    id: pkg.id,
    name: pkg.name,
    type,
  })),
  dataverseBotToSummary: vi.fn((bot: { botid: string; name: string }) => ({
    id: bot.botid,
    name: bot.name,
    type: "copilot-studio",
  })),
}));

vi.mock("../../src/graph/transform.js", () => ({
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, "-")),
  classifyAgentType: vi.fn(() => "agent-builder"),
  extractManifestFromPackage: vi.fn(() => ({
    name: "Agent",
    description: "d",
    instructions: "i",
  })),
}));

vi.mock("../../src/graph/client.js", () => ({
  GraphClient: vi.fn().mockImplementation(() => ({
    getAgentDetails: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock("../../src/graph/auth.js", () => ({
  acquireToken: vi.fn().mockResolvedValue("mock-token"),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { fetchCommand } from "../../src/commands/fetch.js";
import { loadConfig } from "../../src/core/config-loader.js";
import { resolveAuth } from "../../src/commands/shared/resolve-agents.js";
import {
  listRemoteAgents,
  loadFromRemote,
  loadAllFromRemote,
  listDataverseBotsAllEnvs,
  loadAllFromDataverseAllEnvs,
  loadFromDataverseAnyEnv,
} from "../../src/core/manifest-loader.js";
import { formatAgentTable } from "../../src/formatters/terminal-formatter.js";
import { writeFile, mkdir } from "node:fs/promises";
import { AgentLensError } from "../../src/core/errors.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeAgent(name = "Agent"): LoadedAgent {
  return {
    manifest: { name, description: "d", instructions: "i" },
    source: { type: "remote", packageId: "T_abc123" },
    metadata: { agentType: "agent-builder" },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("fetchCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({ ...DEFAULT_CONFIG });
    vi.mocked(resolveAuth).mockReturnValue({
      authConfig: { clientId: "cid", tenantId: "tid" },
      orgUrls: [],
      typeFilter: "all",
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // ── --list mode ──────────────────────────────────────────────────────

  it("lists agents from Graph API with --list", async () => {
    vi.mocked(listRemoteAgents).mockResolvedValue([
      { id: "T_abc", name: "Agent1", lastModified: "2024-01-01" },
    ]);

    await fetchCommand({ list: true });

    expect(listRemoteAgents).toHaveBeenCalled();
    expect(formatAgentTable).toHaveBeenCalled();
  });

  it("lists Dataverse agents when type is copilot-studio", async () => {
    vi.mocked(resolveAuth).mockReturnValue({
      authConfig: { clientId: "cid", tenantId: "tid" },
      orgUrls: ["https://org.crm.dynamics.com"],
      typeFilter: "copilot-studio",
    });
    vi.mocked(listDataverseBotsAllEnvs).mockResolvedValue([
      { bot: { botid: "guid-1", name: "Bot1" }, orgUrl: "https://org.crm.dynamics.com" },
    ]);

    await fetchCommand({ list: true, type: "copilot-studio" });

    expect(listDataverseBotsAllEnvs).toHaveBeenCalled();
    expect(formatAgentTable).toHaveBeenCalled();
  });

  // ── --id mode ────────────────────────────────────────────────────────

  it("fetches single agent by Graph ID with --id", async () => {
    vi.mocked(loadFromRemote).mockResolvedValue(makeFakeAgent("MyAgent"));

    await fetchCommand({ id: "T_abc123" });

    expect(loadFromRemote).toHaveBeenCalledWith("T_abc123", expect.any(Object));
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
  });

  it("fetches single Dataverse agent by GUID with --id", async () => {
    vi.mocked(resolveAuth).mockReturnValue({
      authConfig: { clientId: "cid", tenantId: "tid" },
      orgUrls: ["https://org.crm.dynamics.com"],
      typeFilter: "all",
    });
    vi.mocked(loadFromDataverseAnyEnv).mockResolvedValue({
      manifest: { name: "Bot", description: "d", instructions: "i" },
      source: { type: "remote-dataverse", botId: "guid-1", orgUrl: "https://org.crm.dynamics.com" },
      metadata: { agentType: "copilot-studio" },
    });

    await fetchCommand({ id: "guid-1" });

    expect(loadFromDataverseAnyEnv).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
  });

  // ── --all mode ───────────────────────────────────────────────────────

  it("fetches all agents with --all", async () => {
    vi.mocked(loadAllFromRemote).mockResolvedValue([
      makeFakeAgent("Agent1"),
      makeFakeAgent("Agent2"),
    ]);

    await fetchCommand({ all: true });

    expect(loadAllFromRemote).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
  });

  it("fetches all including Dataverse agents when orgUrls configured", async () => {
    vi.mocked(resolveAuth).mockReturnValue({
      authConfig: { clientId: "cid", tenantId: "tid" },
      orgUrls: ["https://org.crm.dynamics.com"],
      typeFilter: "all",
    });
    vi.mocked(loadAllFromRemote).mockResolvedValue([makeFakeAgent("GraphAgent")]);
    vi.mocked(loadAllFromDataverseAllEnvs).mockResolvedValue([
      {
        manifest: { name: "DVBot", description: "d", instructions: "i" },
        source: { type: "remote-dataverse", botId: "guid-1", orgUrl: "https://org.crm.dynamics.com" },
      },
    ]);

    await fetchCommand({ all: true });

    expect(loadAllFromRemote).toHaveBeenCalled();
    expect(loadAllFromDataverseAllEnvs).toHaveBeenCalled();
  });

  // ── Error handling ───────────────────────────────────────────────────

  it("throws when no action specified", async () => {
    await expect(fetchCommand({})).rejects.toThrow(AgentLensError);
  });

  it("throws when Dataverse not configured for copilot-studio --list", async () => {
    vi.mocked(resolveAuth).mockReturnValue({
      authConfig: { clientId: "cid", tenantId: "tid" },
      orgUrls: [],
      typeFilter: "copilot-studio",
    });

    await expect(fetchCommand({ list: true, type: "copilot-studio" })).rejects.toThrow(
      "Dataverse not configured",
    );
  });

  it("throws when Dataverse not configured for GUID --id fetch", async () => {
    vi.mocked(resolveAuth).mockReturnValue({
      authConfig: { clientId: "cid", tenantId: "tid" },
      orgUrls: [],
      typeFilter: "copilot-studio",
    });

    await expect(fetchCommand({ id: "guid-1", type: "copilot-studio" })).rejects.toThrow(
      "Dataverse not configured",
    );
  });

  it("loads config from custom path", async () => {
    vi.mocked(listRemoteAgents).mockResolvedValue([]);

    await fetchCommand({ list: true, config: "./custom.json" });
    expect(loadConfig).toHaveBeenCalledWith("./custom.json");
  });

  it("writes to custom output directory with --output", async () => {
    vi.mocked(loadFromRemote).mockResolvedValue(makeFakeAgent("MyAgent"));

    await fetchCommand({ id: "T_abc123", output: "./out" });

    expect(mkdir).toHaveBeenCalledWith("./out", { recursive: true });
  });
});
