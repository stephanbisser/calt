import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentLensError } from "../../src/core/errors.js";
import { DEFAULT_CONFIG, type AgentLensConfig, type LoadedAgent } from "../../src/core/types.js";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/core/manifest-loader.js", () => ({
  loadFromFile: vi.fn(),
  loadFromRemote: vi.fn(),
  loadAllFromRemote: vi.fn(),
  loadAllFromDataverseAllEnvs: vi.fn(),
  loadFromDataverseAnyEnv: vi.fn(),
}));

vi.mock("../../src/core/config-loader.js", () => ({
  getDataverseOrgUrls: vi.fn(() => []),
}));

import {
  needsGraph,
  needsDataverse,
  resolveAuth,
  resolveAgents,
  resolveSource,
  type RemoteOptions,
} from "../../src/commands/shared/resolve-agents.js";

import {
  loadFromFile,
  loadFromRemote,
  loadAllFromRemote,
  loadAllFromDataverseAllEnvs,
  loadFromDataverseAnyEnv,
} from "../../src/core/manifest-loader.js";

import { getDataverseOrgUrls } from "../../src/core/config-loader.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeAgent(overrides: Partial<LoadedAgent> = {}): LoadedAgent {
  return {
    manifest: { name: "Agent", description: "desc", instructions: "inst" },
    source: { type: "local", filePath: "/test/agent.json" },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<AgentLensConfig> = {}): AgentLensConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("needsGraph", () => {
  it('returns true for "all"', () => {
    expect(needsGraph("all")).toBe(true);
  });

  it('returns true for "agent-builder"', () => {
    expect(needsGraph("agent-builder")).toBe(true);
  });

  it('returns true for "sharepoint"', () => {
    expect(needsGraph("sharepoint")).toBe(true);
  });

  it('returns false for "copilot-studio"', () => {
    expect(needsGraph("copilot-studio")).toBe(false);
  });
});

describe("needsDataverse", () => {
  it('returns true for "all"', () => {
    expect(needsDataverse("all")).toBe(true);
  });

  it('returns true for "copilot-studio"', () => {
    expect(needsDataverse("copilot-studio")).toBe(true);
  });

  it('returns false for "agent-builder"', () => {
    expect(needsDataverse("agent-builder")).toBe(false);
  });

  it('returns false for "sharepoint"', () => {
    expect(needsDataverse("sharepoint")).toBe(false);
  });
});

describe("resolveAuth", () => {
  it("uses options clientId/tenant when provided", () => {
    const cfg = makeConfig({
      graph_api: { client_id: "cfg-id", tenant_id: "cfg-tenant" },
    });
    const opts: RemoteOptions = { clientId: "opt-id", tenant: "opt-tenant" };
    const result = resolveAuth(opts, cfg);

    expect(result.authConfig.clientId).toBe("opt-id");
    expect(result.authConfig.tenantId).toBe("opt-tenant");
  });

  it("falls back to config graph_api values", () => {
    const cfg = makeConfig({
      graph_api: { client_id: "cfg-id", tenant_id: "cfg-tenant" },
    });
    const result = resolveAuth({}, cfg);

    expect(result.authConfig.clientId).toBe("cfg-id");
    expect(result.authConfig.tenantId).toBe("cfg-tenant");
  });

  it("uses --org-url when provided", () => {
    const cfg = makeConfig();
    const opts: RemoteOptions = { orgUrl: "https://my.crm.dynamics.com" };
    const result = resolveAuth(opts, cfg);

    expect(result.orgUrls).toEqual(["https://my.crm.dynamics.com"]);
  });

  it("reads orgUrls from config when --org-url is not provided", () => {
    vi.mocked(getDataverseOrgUrls).mockReturnValue(["https://a.crm.dynamics.com"]);
    const cfg = makeConfig();
    const result = resolveAuth({}, cfg);

    expect(result.orgUrls).toEqual(["https://a.crm.dynamics.com"]);
  });

  it('defaults typeFilter to "all"', () => {
    const result = resolveAuth({}, makeConfig());
    expect(result.typeFilter).toBe("all");
  });

  it("respects explicit type option", () => {
    const result = resolveAuth({ type: "copilot-studio" }, makeConfig());
    expect(result.typeFilter).toBe("copilot-studio");
  });
});

describe("resolveAgents", () => {
  beforeEach(() => {
    vi.mocked(loadFromFile).mockReset();
    vi.mocked(loadFromRemote).mockReset();
    vi.mocked(loadAllFromRemote).mockReset();
    vi.mocked(loadAllFromDataverseAllEnvs).mockReset();
    vi.mocked(loadFromDataverseAnyEnv).mockReset();
    vi.mocked(getDataverseOrgUrls).mockReturnValue([]);
  });

  // ── Local resolution ────────────────────────────────────────────────────

  it("loads from local file when no remote flags are set", async () => {
    const agent = makeFakeAgent();
    vi.mocked(loadFromFile).mockResolvedValue([agent]);

    const result = await resolveAgents("./my-agent.json", {}, makeConfig());

    expect(loadFromFile).toHaveBeenCalledWith("./my-agent.json");
    expect(result).toEqual([agent]);
  });

  it('defaults path to "." when pathOrUndefined is undefined', async () => {
    vi.mocked(loadFromFile).mockResolvedValue([]);

    await resolveAgents(undefined, {}, makeConfig());

    expect(loadFromFile).toHaveBeenCalledWith(".");
  });

  // ── Remote --all ────────────────────────────────────────────────────────

  it("fetches all agents from Graph when --all and type is all", async () => {
    const graphAgent = makeFakeAgent({
      source: { type: "remote", packageId: "T_abc" },
      metadata: { agentType: "agent-builder" },
    });
    vi.mocked(loadAllFromRemote).mockResolvedValue([graphAgent]);

    const result = await resolveAgents(undefined, { all: true }, makeConfig());

    expect(loadAllFromRemote).toHaveBeenCalled();
    expect(result).toContainEqual(graphAgent);
  });

  it("fetches all agents from Dataverse when --all and orgUrls are configured", async () => {
    vi.mocked(getDataverseOrgUrls).mockReturnValue(["https://org.crm.dynamics.com"]);
    vi.mocked(loadAllFromRemote).mockResolvedValue([]);
    const dvAgent = makeFakeAgent({
      source: { type: "remote-dataverse", botId: "bot-1", orgUrl: "https://org.crm.dynamics.com" },
    });
    vi.mocked(loadAllFromDataverseAllEnvs).mockResolvedValue([dvAgent]);

    const result = await resolveAgents(undefined, { all: true }, makeConfig());

    expect(loadAllFromDataverseAllEnvs).toHaveBeenCalled();
    expect(result).toContainEqual(dvAgent);
  });

  it("throws when --all with copilot-studio type but no orgUrls", async () => {
    vi.mocked(getDataverseOrgUrls).mockReturnValue([]);

    await expect(
      resolveAgents(undefined, { all: true, type: "copilot-studio" }, makeConfig()),
    ).rejects.toThrow(AgentLensError);
  });

  it("skips Dataverse when --all with type agent-builder", async () => {
    vi.mocked(loadAllFromRemote).mockResolvedValue([]);

    await resolveAgents(undefined, { all: true, type: "agent-builder" }, makeConfig());

    expect(loadAllFromDataverseAllEnvs).not.toHaveBeenCalled();
  });

  // ── Remote --id with T_/P_ prefix (Graph) ──────────────────────────────

  it("routes T_ prefixed ID to Graph API", async () => {
    const agent = makeFakeAgent({ source: { type: "remote", packageId: "T_abc123" } });
    vi.mocked(loadFromRemote).mockResolvedValue(agent);

    const result = await resolveAgents(undefined, { id: "T_abc123" }, makeConfig());

    expect(loadFromRemote).toHaveBeenCalledWith("T_abc123", expect.any(Object));
    expect(result).toEqual([agent]);
  });

  it("routes P_ prefixed ID to Graph API", async () => {
    const agent = makeFakeAgent({ source: { type: "remote", packageId: "P_xyz789" } });
    vi.mocked(loadFromRemote).mockResolvedValue(agent);

    const result = await resolveAgents(undefined, { id: "P_xyz789" }, makeConfig());

    expect(loadFromRemote).toHaveBeenCalledWith("P_xyz789", expect.any(Object));
    expect(result).toEqual([agent]);
  });

  // ── Remote --id with non-prefixed ID (Dataverse) ───────────────────────

  it("routes non-prefixed ID to Dataverse when orgUrls are available", async () => {
    vi.mocked(getDataverseOrgUrls).mockReturnValue(["https://org.crm.dynamics.com"]);
    const dvAgent = makeFakeAgent({
      source: { type: "remote-dataverse", botId: "guid-123", orgUrl: "https://org.crm.dynamics.com" },
    });
    vi.mocked(loadFromDataverseAnyEnv).mockResolvedValue(dvAgent);

    const result = await resolveAgents(undefined, { id: "guid-123" }, makeConfig());

    expect(loadFromDataverseAnyEnv).toHaveBeenCalledWith(
      "guid-123",
      expect.any(Object),
      ["https://org.crm.dynamics.com"],
    );
    expect(result).toEqual([dvAgent]);
  });

  it("throws when non-prefixed ID with no orgUrls configured", async () => {
    vi.mocked(getDataverseOrgUrls).mockReturnValue([]);

    await expect(
      resolveAgents(undefined, { id: "guid-123" }, makeConfig()),
    ).rejects.toThrow(AgentLensError);
  });

  it("routes non-prefixed ID to Graph when type is agent-builder", async () => {
    const agent = makeFakeAgent({ source: { type: "remote", packageId: "some-id" } });
    vi.mocked(loadFromRemote).mockResolvedValue(agent);

    const result = await resolveAgents(
      undefined,
      { id: "some-id", type: "agent-builder" },
      makeConfig(),
    );

    expect(loadFromRemote).toHaveBeenCalledWith("some-id", expect.any(Object));
    expect(result).toEqual([agent]);
  });

  // ── Remote --remote without --id or --all ──────────────────────────────

  it("throws when --remote is set without --id or --all", async () => {
    await expect(
      resolveAgents(undefined, { remote: true }, makeConfig()),
    ).rejects.toThrow(AgentLensError);
  });
});

describe("resolveSource", () => {
  beforeEach(() => {
    vi.mocked(loadFromFile).mockReset();
    vi.mocked(loadFromRemote).mockReset();
    vi.mocked(loadFromDataverseAnyEnv).mockReset();
  });

  const authConfig = { clientId: "cid", tenantId: "tid" };

  it('routes T_ prefix to Graph API', async () => {
    const agent = makeFakeAgent();
    vi.mocked(loadFromRemote).mockResolvedValue(agent);

    const result = await resolveSource("T_abc", authConfig, []);
    expect(loadFromRemote).toHaveBeenCalledWith("T_abc", authConfig);
    expect(result).toBe(agent);
  });

  it('routes P_ prefix to Graph API', async () => {
    const agent = makeFakeAgent();
    vi.mocked(loadFromRemote).mockResolvedValue(agent);

    const result = await resolveSource("P_xyz", authConfig, []);
    expect(loadFromRemote).toHaveBeenCalledWith("P_xyz", authConfig);
    expect(result).toBe(agent);
  });

  it("routes GUID to Dataverse when orgUrls available", async () => {
    const dvAgent = makeFakeAgent();
    vi.mocked(loadFromDataverseAnyEnv).mockResolvedValue(dvAgent);
    const orgUrls = ["https://org.crm.dynamics.com"];

    const guid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const result = await resolveSource(guid, authConfig, orgUrls);

    expect(loadFromDataverseAnyEnv).toHaveBeenCalledWith(guid, authConfig, orgUrls);
    expect(result).toBe(dvAgent);
  });

  it("throws for GUID when no orgUrls configured", async () => {
    const guid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    await expect(resolveSource(guid, authConfig, [])).rejects.toThrow(AgentLensError);
  });

  it("loads from local file for non-prefixed non-GUID source", async () => {
    const agent = makeFakeAgent();
    vi.mocked(loadFromFile).mockResolvedValue([agent]);

    const result = await resolveSource("./agent.json", authConfig, []);
    expect(loadFromFile).toHaveBeenCalledWith("./agent.json");
    expect(result).toBe(agent);
  });

  it("throws when local file yields no agents", async () => {
    vi.mocked(loadFromFile).mockResolvedValue([]);

    await expect(
      resolveSource("./missing.json", authConfig, []),
    ).rejects.toThrow(AgentLensError);
  });
});
