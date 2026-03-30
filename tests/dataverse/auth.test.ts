import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AccountInfo } from "@azure/msal-node";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetAllAccounts = vi.fn<() => Promise<AccountInfo[]>>();
const mockDeserialize = vi.fn();
const mockSerialize = vi.fn(() => "{}");
const mockAcquireTokenSilent = vi.fn();
const mockAcquireTokenByDeviceCode = vi.fn();

vi.mock("@azure/msal-node", () => ({
  PublicClientApplication: vi.fn().mockImplementation(() => ({
    getTokenCache: () => ({
      getAllAccounts: mockGetAllAccounts,
      deserialize: mockDeserialize,
      serialize: mockSerialize,
    }),
    acquireTokenSilent: mockAcquireTokenSilent,
    acquireTokenByDeviceCode: mockAcquireTokenByDeviceCode,
  })),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import {
  acquireDataverseToken,
  getDataverseLoginStatus,
  loginDataverse,
  type DataverseAuthConfig,
} from "../../src/dataverse/auth.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeAccount(overrides: Partial<AccountInfo> = {}): AccountInfo {
  return {
    homeAccountId: "home-1",
    environment: "login.microsoftonline.com",
    tenantId: "tenant-abc",
    username: "user@example.com",
    localAccountId: "local-1",
    ...overrides,
  };
}

const baseConfig: DataverseAuthConfig = {
  clientId: "test-client-id",
  tenantId: "test-tenant-id",
  orgUrl: "https://myorg.api.crm.dynamics.com",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("acquireDataverseToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no accounts are cached", async () => {
    mockGetAllAccounts.mockResolvedValue([]);

    await expect(acquireDataverseToken(baseConfig)).rejects.toThrow("Not logged in");
  });

  it("returns access token on successful silent acquisition", async () => {
    mockGetAllAccounts.mockResolvedValue([fakeAccount()]);
    mockAcquireTokenSilent.mockResolvedValue({ accessToken: "dv-token-123" });

    const token = await acquireDataverseToken(baseConfig);
    expect(token).toBe("dv-token-123");
  });

  it("uses org URL based scope for Dataverse", async () => {
    mockGetAllAccounts.mockResolvedValue([fakeAccount()]);
    mockAcquireTokenSilent.mockResolvedValue({ accessToken: "tok" });

    await acquireDataverseToken(baseConfig);

    expect(mockAcquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ["https://myorg.api.crm.dynamics.com/.default"],
      }),
    );
  });

  it("throws when silent acquisition fails", async () => {
    mockGetAllAccounts.mockResolvedValue([fakeAccount()]);
    mockAcquireTokenSilent.mockRejectedValue(new Error("refresh failed"));

    await expect(acquireDataverseToken(baseConfig)).rejects.toThrow(
      "could not be refreshed",
    );
  });

  it("works without explicit clientId (uses default)", async () => {
    mockGetAllAccounts.mockResolvedValue([fakeAccount()]);
    mockAcquireTokenSilent.mockResolvedValue({ accessToken: "tok" });

    const token = await acquireDataverseToken({
      orgUrl: "https://other.crm.dynamics.com",
    });
    expect(token).toBe("tok");
  });
});

describe("getDataverseLoginStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loggedIn: false when token acquisition fails", async () => {
    mockGetAllAccounts.mockResolvedValue([]);

    const status = await getDataverseLoginStatus(baseConfig);
    expect(status.loggedIn).toBe(false);
  });

  it("returns loggedIn: true with account when token is valid", async () => {
    const account = fakeAccount({ username: "alice@contoso.com" });
    mockGetAllAccounts.mockResolvedValue([account]);
    mockAcquireTokenSilent.mockResolvedValue({ accessToken: "valid-tok" });

    const status = await getDataverseLoginStatus(baseConfig);
    expect(status.loggedIn).toBe(true);
    expect(status.account).toBe("alice@contoso.com");
  });

  it("returns loggedIn: false when silent acquisition throws", async () => {
    mockGetAllAccounts.mockResolvedValue([fakeAccount()]);
    mockAcquireTokenSilent.mockRejectedValue(new Error("expired"));

    const status = await getDataverseLoginStatus(baseConfig);
    expect(status.loggedIn).toBe(false);
  });
});

describe("loginDataverse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when acquireTokenByDeviceCode returns null", async () => {
    mockAcquireTokenByDeviceCode.mockResolvedValue(null);

    await expect(
      loginDataverse(baseConfig, () => {}),
    ).rejects.toThrow("no result received");
  });

  it("returns auth result on success", async () => {
    const authResult = {
      accessToken: "device-tok",
      account: fakeAccount(),
    };
    mockAcquireTokenByDeviceCode.mockResolvedValue(authResult);

    const result = await loginDataverse(baseConfig, () => {});
    expect(result.accessToken).toBe("device-tok");
  });

  it("invokes the device code callback", async () => {
    mockAcquireTokenByDeviceCode.mockImplementation(async (req: { deviceCodeCallback: (r: { message: string }) => void }) => {
      req.deviceCodeCallback({ message: "Go to https://..." });
      return { accessToken: "tok", account: fakeAccount() };
    });

    const callback = vi.fn();
    await loginDataverse(baseConfig, callback);

    expect(callback).toHaveBeenCalledWith("Go to https://...");
  });
});
