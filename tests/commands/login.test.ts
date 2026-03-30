import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/graph/auth.js", () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getLoginStatus: vi.fn(),
  acquireToken: vi.fn(),
  decodeJwtPayload: vi.fn(),
}));

vi.mock("../../src/dataverse/auth.js", () => ({
  acquireDataverseToken: vi.fn(),
  loginDataverse: vi.fn(),
  getDataverseLoginStatus: vi.fn().mockResolvedValue({ loggedIn: false }),
}));

vi.mock("../../src/core/config-loader.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    graph_api: { client_id: "test-client", tenant_id: "test-tenant" },
    dataverse: {},
  }),
  getDataverseOrgUrls: vi.fn().mockReturnValue([]),
}));

import { statusCommand } from "../../src/commands/login.js";
import { getLoginStatus, acquireToken, decodeJwtPayload } from "../../src/graph/auth.js";
import { loadConfig, getDataverseOrgUrls } from "../../src/core/config-loader.js";
import { getDataverseLoginStatus } from "../../src/dataverse/auth.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_TOKEN =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSIsInNjcCI6InJlYWQifQ.signature_here";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Re-apply default mock return values after clearAllMocks
  vi.mocked(loadConfig).mockResolvedValue({
    graph_api: { client_id: "test-client", tenant_id: "test-tenant" },
    dataverse: {},
  } as ReturnType<typeof loadConfig> extends Promise<infer R> ? R : never);
  vi.mocked(getDataverseOrgUrls).mockReturnValue([]);
  vi.mocked(getDataverseLoginStatus).mockResolvedValue({ loggedIn: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Token masking & --raw warning ────────────────────────────────────────────

describe("statusCommand token output", () => {
  beforeEach(() => {
    vi.mocked(getLoginStatus).mockResolvedValue({
      loggedIn: true,
      account: "user@example.com",
      tenantId: "tenant-123",
    });
    vi.mocked(acquireToken).mockResolvedValue(FAKE_TOKEN);
    vi.mocked(decodeJwtPayload).mockReturnValue({
      sub: "user1",
      scp: "CopilotPackages.Read.All",
    });
  });

  it("masks token aggressively by default (first 8 + last 4 chars)", async () => {
    await statusCommand({ verbose: true, raw: false });

    const expectedMasked = FAKE_TOKEN.slice(0, 8) + "..." + FAKE_TOKEN.slice(-4);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(expectedMasked),
    );
    // Full token should NOT appear in any console.log call
    const allLogArgs = vi.mocked(console.log).mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allLogArgs).not.toContain(FAKE_TOKEN);
  });

  it("outputs full token with --raw", async () => {
    await statusCommand({ verbose: true, raw: true });

    // Full token printed to stdout
    expect(console.log).toHaveBeenCalledWith(FAKE_TOKEN);
  });

  it("prints stderr warning when --raw is used", async () => {
    await statusCommand({ verbose: true, raw: true });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Warning: Raw token output"),
    );
  });

  it("does not print stderr warning when --raw is not used", async () => {
    await statusCommand({ verbose: true, raw: false });

    const allErrorArgs = vi.mocked(console.error).mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allErrorArgs).not.toContain("Warning");
  });

  it("does not print token at all without --verbose", async () => {
    await statusCommand({ verbose: false });

    // acquireToken should not even be called without verbose
    expect(acquireToken).not.toHaveBeenCalled();
    const allLogArgs = vi.mocked(console.log).mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allLogArgs).not.toContain(FAKE_TOKEN);
  });

  it("shows token length in masked output", async () => {
    await statusCommand({ verbose: true });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(`${FAKE_TOKEN.length} chars`),
    );
  });
});
