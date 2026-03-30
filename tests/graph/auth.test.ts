import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AccountInfo } from "@azure/msal-node";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetAllAccounts = vi.fn<() => Promise<AccountInfo[]>>();
const mockDeserialize = vi.fn();
const mockSerialize = vi.fn(() => "{}");
const mockAcquireTokenSilent = vi.fn();

vi.mock("@azure/msal-node", () => ({
  PublicClientApplication: vi.fn().mockImplementation(() => ({
    getTokenCache: () => ({
      getAllAccounts: mockGetAllAccounts,
      deserialize: mockDeserialize,
      serialize: mockSerialize,
    }),
    acquireTokenSilent: mockAcquireTokenSilent,
  })),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import {
  decodeJwtPayload,
  decodeTokenPayload,
  getLoginStatus,
  logout,
  acquireToken,
} from "../../src/graph/auth.js";
import { rm } from "node:fs/promises";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

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

// ── Pure function tests (no MSAL dependency) ─────────────────────────────────

describe("decodeJwtPayload", () => {
  it("should decode a well-formed 3-part JWT", () => {
    const token = fakeJwt({ sub: "user1", scp: "read write" });
    const result = decodeJwtPayload(token);
    expect(result).toEqual({ sub: "user1", scp: "read write" });
  });

  it("should return null for a token with fewer than 3 parts", () => {
    expect(decodeJwtPayload("only.two")).toBeNull();
  });

  it("should return null for a token with more than 3 parts", () => {
    expect(decodeJwtPayload("a.b.c.d")).toBeNull();
  });

  it("should return null for an empty string", () => {
    expect(decodeJwtPayload("")).toBeNull();
  });

  it("should return null when the payload is not valid JSON", () => {
    const bad = `header.${Buffer.from("not-json").toString("base64url")}.sig`;
    expect(decodeJwtPayload(bad)).toBeNull();
  });

  it("should return null when the payload is not valid base64url", () => {
    expect(decodeJwtPayload("a.!!!.c")).toBeNull();
  });
});

describe("decodeTokenPayload (deprecated compat)", () => {
  it("should return an empty object instead of null for invalid tokens", () => {
    expect(decodeTokenPayload("bad")).toEqual({});
  });

  it("should still decode valid tokens", () => {
    const token = fakeJwt({ aud: "api" });
    expect(decodeTokenPayload(token)).toEqual({ aud: "api" });
  });
});

// ── getLoginStatus tests ─────────────────────────────────────────────────────

describe("getLoginStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns loggedIn: false when no accounts in cache", async () => {
    mockGetAllAccounts.mockResolvedValue([]);

    const status = await getLoginStatus({});

    expect(status.loggedIn).toBe(false);
    expect(status.account).toBeUndefined();
    expect(status.tenantId).toBeUndefined();
  });

  it("returns loggedIn: true with account info when cached", async () => {
    const account = fakeAccount({
      username: "alice@contoso.com",
      tenantId: "tenant-123",
    });
    mockGetAllAccounts.mockResolvedValue([account]);

    const status = await getLoginStatus({});

    expect(status.loggedIn).toBe(true);
    expect(status.account).toBe("alice@contoso.com");
    expect(status.tenantId).toBe("tenant-123");
  });

  it("uses the first account when multiple are cached", async () => {
    mockGetAllAccounts.mockResolvedValue([
      fakeAccount({ username: "first@example.com" }),
      fakeAccount({ username: "second@example.com" }),
    ]);

    const status = await getLoginStatus({});

    expect(status.account).toBe("first@example.com");
  });

  it("accepts custom clientId and tenantId config", async () => {
    mockGetAllAccounts.mockResolvedValue([]);

    // Should not throw — just pass the config through
    const status = await getLoginStatus({ clientId: "custom-id", tenantId: "custom-tenant" });
    expect(status.loggedIn).toBe(false);
  });
});

// ── logout tests ─────────────────────────────────────────────────────────────

describe("logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls rm to delete the token cache file", async () => {
    await logout();
    expect(rm).toHaveBeenCalled();
  });

  it("does not throw when cache file does not exist", async () => {
    vi.mocked(rm).mockRejectedValueOnce(new Error("ENOENT"));
    await expect(logout()).resolves.toBeUndefined();
  });
});

// ── acquireToken tests ───────────────────────────────────────────────────────

describe("acquireToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when no accounts are cached", async () => {
    mockGetAllAccounts.mockResolvedValue([]);

    await expect(acquireToken({})).rejects.toThrow("Not logged in");
  });

  it("returns access token on successful silent acquisition", async () => {
    mockGetAllAccounts.mockResolvedValue([fakeAccount()]);
    mockAcquireTokenSilent.mockResolvedValue({ accessToken: "my-token-123" });

    const token = await acquireToken({});
    expect(token).toBe("my-token-123");
  });

  it("throws when silent acquisition fails", async () => {
    mockGetAllAccounts.mockResolvedValue([fakeAccount()]);
    mockAcquireTokenSilent.mockRejectedValue(new Error("refresh failed"));

    await expect(acquireToken({})).rejects.toThrow("could not be refreshed");
  });
});
