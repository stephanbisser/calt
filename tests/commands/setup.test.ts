import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted ensures these are available when vi.mock factories run (hoisted)
const { mockExecFile, mockWriteFile, mockAccess, mockRlQuestion, mockRlClose } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockAccess: vi.fn(),
  mockRlQuestion: vi.fn(),
  mockRlClose: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  access: mockAccess,
  constants: { F_OK: 0 },
}));

vi.mock("node:readline", () => ({
  createInterface: vi.fn(() => ({
    question: mockRlQuestion,
    close: mockRlClose,
  })),
}));

vi.mock("../../src/core/config-loader.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    graph_api: { client_id: "", tenant_id: "" },
    dataverse: {},
  }),
}));

vi.mock("../../src/graph/auth.js", () => ({
  login: vi.fn(),
}));

vi.mock("../../src/dataverse/auth.js", () => ({
  acquireDataverseToken: vi.fn(),
  loginDataverse: vi.fn(),
}));

import { setupCommand } from "../../src/commands/setup.js";
import { loadConfig } from "../../src/core/config-loader.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Make mockExecFile behave like the real promisified execFile.
 * Maps `az <subcommand> ...` calls to their return values.
 */
function stubAz(mapping: Record<string, string | Error>) {
  mockExecFile.mockImplementation(
    (
      cmd: string,
      args: string[],
      cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      // Build a key from the first few az args (e.g. "--version", "account list")
      const key = args.slice(0, 3).join(" ");
      for (const [pattern, value] of Object.entries(mapping)) {
        if (key.startsWith(pattern)) {
          if (value instanceof Error) {
            cb(value, { stdout: "", stderr: value.message });
          } else {
            cb(null, { stdout: value, stderr: "" });
          }
          return;
        }
      }
      // Default: command not found
      cb(new Error(`mock: unexpected az call: ${cmd} ${args.join(" ")}`), {
        stdout: "",
        stderr: "",
      });
    },
  );
}

const FAKE_TENANT = "00000000-1111-2222-3333-444444444444";
const FAKE_APP_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const FAKE_SCOPE_GUID = "a2dcfcb9-cbe8-4d42-812d-952e55cf7f3f";

const SINGLE_ACCOUNT = JSON.stringify([
  {
    id: "sub-1",
    name: "My Sub",
    tenantId: FAKE_TENANT,
    isDefault: true,
    user: { name: "user@contoso.com", type: "user" },
  },
]);

// ── Test suite ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  // Re-apply default mock return values after clearAllMocks
  mockWriteFile.mockResolvedValue(undefined);
  vi.mocked(loadConfig).mockResolvedValue({
    graph_api: { client_id: "", tenant_id: "" },
    dataverse: {},
  } as ReturnType<typeof loadConfig> extends Promise<infer R> ? R : never);
  // Default: .caltrc.json does not exist yet
  mockAccess.mockRejectedValue(new Error("ENOENT"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setupCommand", () => {
  // ── Azure CLI not installed ──────────────────────────────────────────────

  it("prints manual instructions when Azure CLI is not installed", async () => {
    stubAz({ "--version": new Error("not found") });

    await setupCommand({});

    // Should have created .caltrc.json
    expect(mockWriteFile).toHaveBeenCalled();
    // Should print manual setup instructions
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("not installed"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Manual setup steps"),
    );
  });

  // ── Azure CLI installed, single account, full flow ───────────────────────

  it("creates app registration and saves config on success", async () => {
    stubAz({
      "--version": "2.60.0",
      "account list": SINGLE_ACCOUNT,
      "ad app create": FAKE_APP_ID,
      "ad sp show": FAKE_SCOPE_GUID,
      "ad app permission": "",
      // Power Platform env listing returns empty (no Dataverse)
      "rest --method": JSON.stringify({ value: [] }),
    });

    await setupCommand({});

    // App registration created
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(FAKE_APP_ID),
    );

    // Config saved (second writeFile call — first is ensureConfig)
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    const savedJson = mockWriteFile.mock.calls[1][1] as string;
    const parsed = JSON.parse(savedJson);
    expect(parsed.graph_api.client_id).toBe(FAKE_APP_ID);
    expect(parsed.graph_api.tenant_id).toBe(FAKE_TENANT);
  });

  // ── Multiple accounts, user selects one ──────────────────────────────────

  it("prompts for account selection with multiple accounts", async () => {
    const multipleAccounts = JSON.stringify([
      {
        id: "sub-1",
        name: "Sub A",
        tenantId: FAKE_TENANT,
        isDefault: true,
        user: { name: "alice@contoso.com", type: "user" },
      },
      {
        id: "sub-2",
        name: "Sub B",
        tenantId: "tenant-2",
        isDefault: false,
        user: { name: "bob@contoso.com", type: "user" },
      },
    ]);

    stubAz({
      "--version": "2.60.0",
      "account list": multipleAccounts,
      "account set": "",
      "ad app create": FAKE_APP_ID,
      "ad sp show": FAKE_SCOPE_GUID,
      "ad app permission": "",
      "rest --method": JSON.stringify({ value: [] }),
    });

    // Simulate user selecting account 1
    mockRlQuestion.mockImplementation(
      (_prompt: string, cb: (answer: string) => void) => cb("1"),
    );

    await setupCommand({});

    expect(mockRlQuestion).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(FAKE_APP_ID),
    );
  });

  // ── App creation fails ───────────────────────────────────────────────────

  it("throws when app registration fails", async () => {
    stubAz({
      "--version": "2.60.0",
      "account list": SINGLE_ACCOUNT,
      "ad app create": new Error("Insufficient privileges"),
    });

    await expect(setupCommand({})).rejects.toThrow("Insufficient privileges");
  });

  // ── Azure CLI not logged in ──────────────────────────────────────────────

  it("throws when Azure CLI is not logged in", async () => {
    stubAz({
      "--version": "2.60.0",
      "account list": new Error("Please run 'az login'"),
    });

    await expect(setupCommand({})).rejects.toThrow("not logged in");
  });

  // ── File write permission error ──────────────────────────────────────────

  it("throws when config file cannot be written", async () => {
    mockWriteFile.mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }),
    );

    await expect(setupCommand({})).rejects.toThrow("EACCES");
  });

  // ── ensureConfig skips creation when file exists ─────────────────────────

  it("does not overwrite existing .caltrc.json without --force", async () => {
    mockAccess.mockResolvedValue(undefined); // file exists
    stubAz({ "--version": new Error("not found") });

    await setupCommand({});

    // ensureConfig should not call writeFile when file exists (only log)
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
  });

  it("overwrites .caltrc.json when --force is set", async () => {
    mockAccess.mockResolvedValue(undefined); // file exists
    stubAz({ "--version": new Error("not found") });

    await setupCommand({ force: true });

    // ensureConfig should call writeFile with --force
    expect(mockWriteFile).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Created .caltrc.json"),
    );
  });

  // ── Custom app name ──────────────────────────────────────────────────────

  it("uses custom app name when provided", async () => {
    stubAz({
      "--version": "2.60.0",
      "account list": SINGLE_ACCOUNT,
      "ad app create": FAKE_APP_ID,
      "ad sp show": FAKE_SCOPE_GUID,
      "ad app permission": "",
      "rest --method": JSON.stringify({ value: [] }),
    });

    await setupCommand({ appName: "MyCustomApp" });

    // Verify az ad app create was called with the custom name
    const createCall = mockExecFile.mock.calls.find(
      (call: unknown[]) =>
        Array.isArray(call[1]) &&
        (call[1] as string[]).includes("create") &&
        (call[1] as string[]).includes("--display-name"),
    );
    expect(createCall).toBeDefined();
    expect((createCall![1] as string[])).toContain("MyCustomApp");
  });
});
