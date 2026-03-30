import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  runFullScan: vi.fn(),
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

vi.mock("../../src/formatters/sarif-formatter.js", () => ({
  formatAsSarif: vi.fn(() => '{"sarif":true}'),
}));

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return {
    ...orig,
    watch: vi.fn(),
  };
});

import { watch as fsWatch } from "node:fs";
import { watchCommand } from "../../src/commands/watch.js";
import { loadConfig } from "../../src/core/config-loader.js";
import { resolveAgents } from "../../src/commands/shared/resolve-agents.js";
import { runFullScan } from "../../src/rules/rule-engine.js";
import { formatScanReport } from "../../src/formatters/terminal-formatter.js";

const mockWatch = vi.mocked(fsWatch);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFakeAgent(name = "Agent"): LoadedAgent {
  return {
    manifest: { name, description: "d", instructions: "i" },
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

describe("watchCommand", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleClearSpy: ReturnType<typeof vi.spyOn>;
  let processOnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({ ...DEFAULT_CONFIG });
    vi.mocked(resolveAgents).mockResolvedValue([makeFakeAgent()]);
    vi.mocked(runFullScan).mockResolvedValue(makeFakeReport());
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleClearSpy = vi.spyOn(console, "clear").mockImplementation(() => {});
    processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);

    // Mock fs.watch to return a fake watcher and capture the callback
    mockWatch.mockReturnValue({
      close: vi.fn(),
      on: vi.fn(),
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleClearSpy.mockRestore();
    processOnSpy.mockRestore();
  });

  it("performs initial scan", async () => {
    // watchCommand returns a never-resolving promise, so we race it
    const watchPromise = watchCommand("./agent.json", {});
    // Give async operations time to settle
    await vi.waitFor(() => {
      expect(runFullScan).toHaveBeenCalledTimes(1);
    });

    expect(formatScanReport).toHaveBeenCalled();
  });

  it("creates watcher on the correct path", async () => {
    const watchPromise = watchCommand("./agent.json", {});
    await vi.waitFor(() => {
      expect(mockWatch).toHaveBeenCalled();
    });

    const watchedPath = mockWatch.mock.calls[0][0];
    expect(watchedPath).toContain("agent.json");
  });

  it("registers SIGINT handler to close watcher", async () => {
    const watchPromise = watchCommand("./agent.json", {});
    await vi.waitFor(() => {
      expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    });
  });

  it("shows watching message after initial scan", async () => {
    const watchPromise = watchCommand("./agent.json", {});
    await vi.waitFor(() => {
      const calls = consoleLogSpy.mock.calls.flat().map(String);
      expect(calls.some((c) => c.includes("Watching for changes"))).toBe(true);
    });
  });

  it("SIGINT handler closes watcher", async () => {
    const fakeWatcher = { close: vi.fn(), on: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const watchPromise = watchCommand("./agent.json", {});
    await vi.waitFor(() => {
      expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    });

    // Get the SIGINT handler and call it
    const sigintCall = processOnSpy.mock.calls.find((c) => c[0] === "SIGINT");
    const handler = sigintCall![1] as () => void;
    handler();

    expect(fakeWatcher.close).toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("debounce prevents multiple rapid re-scans", async () => {
    vi.useFakeTimers();
    let watchCallback: (() => void) | undefined;

    mockWatch.mockImplementation((_path: string, _opts: unknown, cb: () => void) => {
      watchCallback = cb;
      return { close: vi.fn(), on: vi.fn() };
    });

    // We can't fully test the infinite promise, but we can verify debounce
    // by checking the watch callback is a debounced function
    const watchPromise = watchCommand("./agent.json", {});

    await vi.advanceTimersByTimeAsync(0);

    expect(mockWatch).toHaveBeenCalled();
    expect(watchCallback).toBeDefined();

    // Trigger rapid changes
    watchCallback!();
    watchCallback!();
    watchCallback!();

    // Before debounce period, only initial scan should have run
    expect(runFullScan).toHaveBeenCalledTimes(1);

    // After debounce, one more scan
    await vi.advanceTimersByTimeAsync(350);
    expect(runFullScan).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
