import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphClient, GraphApiError } from "../../src/graph/client.js";
import type { CopilotPackage } from "../../src/core/types.js";

// Helper to build a minimal CopilotPackage fixture
function makePackage(id: string, name: string): CopilotPackage {
  return {
    id,
    displayName: name,
    type: "DeclarativeAgent",
    shortDescription: "test",
    supportedHosts: ["Copilot"],
    lastModifiedDateTime: "2024-01-01T00:00:00Z",
    publisher: "Test Publisher",
    ingestionStatus: "Ready",
  };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe("GraphClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("listCopilotAgents", () => {
    it("returns agents from a single page", async () => {
      const pkg = makePackage("pkg-1", "Agent One");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ value: [pkg] })),
      );

      const client = new GraphClient("test-token");
      const result = await client.listCopilotAgents();

      expect(result).toEqual([pkg]);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("follows @odata.nextLink for pagination", async () => {
      const pkg1 = makePackage("pkg-1", "Agent One");
      const pkg2 = makePackage("pkg-2", "Agent Two");

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            value: [pkg1],
            "@odata.nextLink": "https://graph.microsoft.com/beta/copilot/admin/catalog/packages?$skiptoken=page2",
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ value: [pkg2] }));

      vi.stubGlobal("fetch", mockFetch);

      const client = new GraphClient("test-token");
      const result = await client.listCopilotAgents();

      expect(result).toEqual([pkg1, pkg2]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Second call should use the nextLink URL
      const secondCallUrl = mockFetch.mock.calls[1][0];
      expect(secondCallUrl).toContain("$skiptoken=page2");
    });

    it("sends Authorization header with the token", async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: [] }));
      vi.stubGlobal("fetch", mockFetch);

      const client = new GraphClient("my-secret-token");
      await client.listCopilotAgents();

      const callInit = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = callInit.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer my-secret-token");
    });
  });

  describe("getAgentDetails", () => {
    it("returns the detail for a package", async () => {
      const detail = { ...makePackage("pkg-1", "Agent One"), elementDetails: [] };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(detail)),
      );

      const client = new GraphClient("test-token");
      const result = await client.getAgentDetails("pkg-1");

      expect(result).toEqual(detail);
    });
  });

  describe("error handling", () => {
    it("throws GraphApiError with 401 message", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({}, 401)),
      );

      const client = new GraphClient("expired-token");

      await expect(client.listCopilotAgents()).rejects.toThrow(GraphApiError);
      await expect(client.listCopilotAgents()).rejects.toThrow(/expired/i);
    });

    it("throws GraphApiError with 403 message", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({}, 403)),
      );

      const client = new GraphClient("no-perms-token");

      await expect(client.listCopilotAgents()).rejects.toThrow(GraphApiError);
      await expect(client.listCopilotAgents()).rejects.toThrow(/Forbidden/i);
    });

    it("throws GraphApiError on 500", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ error: "internal" }, 500)),
      );

      const client = new GraphClient("test-token");

      await expect(client.listCopilotAgents()).rejects.toThrow(GraphApiError);
      await expect(client.listCopilotAgents()).rejects.toThrow(/500/);
    });

    it("retries on HTTP 429 and eventually succeeds", async () => {
      const pkg = makePackage("pkg-1", "Agent One");
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "1" }))
        .mockResolvedValueOnce(jsonResponse({ value: [pkg] }));

      vi.stubGlobal("fetch", mockFetch);

      const client = new GraphClient("test-token");
      const result = await client.listCopilotAgents();

      expect(result).toEqual([pkg]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws timeout error on AbortError", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          const err = new DOMException("The operation was aborted", "AbortError");
          return Promise.reject(err);
        }),
      );

      const client = new GraphClient("test-token");

      await expect(client.listCopilotAgents()).rejects.toThrow(/timed out/i);
    });
  });
});
