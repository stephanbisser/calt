import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataverseClient, DataverseApiError } from "../../src/dataverse/client.js";
import type { DataverseBot, DataverseBotComponent, DataverseListResponse } from "../../src/core/types.js";

const ORG_URL = "https://myorg.api.crm.dynamics.com";
const TOKEN = "mock-access-token";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse<T>(data: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  } as Response;
}

function errorResponse(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
    headers: new Headers(),
  } as Response;
}

describe("DataverseClient", () => {
  let client: DataverseClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new DataverseClient(TOKEN, ORG_URL);
  });

  describe("listBots", () => {
    it("should list bots from the Dataverse API", async () => {
      const botsResponse: DataverseListResponse<DataverseBot> = {
        value: [
          {
            botid: "bot-1",
            name: "Bot One",
            description: "First bot",
            modifiedon: "2025-06-01T00:00:00Z",
          },
          {
            botid: "bot-2",
            name: "Bot Two",
            description: "Second bot",
            modifiedon: "2025-06-02T00:00:00Z",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(botsResponse));

      const bots = await client.listBots();

      expect(bots).toHaveLength(2);
      expect(bots[0].botid).toBe("bot-1");
      expect(bots[1].name).toBe("Bot Two");

      // Verify correct URL
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/data/v9.2/bots?$select="),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        }),
      );
    });

    it("should handle pagination via @odata.nextLink", async () => {
      const page1: DataverseListResponse<DataverseBot> = {
        value: [{ botid: "bot-1", name: "Bot One" }],
        "@odata.nextLink": `${ORG_URL}/api/data/v9.2/bots?$skiptoken=page2`,
      };
      const page2: DataverseListResponse<DataverseBot> = {
        value: [{ botid: "bot-2", name: "Bot Two" }],
      };

      mockFetch
        .mockResolvedValueOnce(jsonResponse(page1))
        .mockResolvedValueOnce(jsonResponse(page2));

      const bots = await client.listBots();

      expect(bots).toHaveLength(2);
      expect(bots[0].botid).toBe("bot-1");
      expect(bots[1].botid).toBe("bot-2");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should handle empty bot list", async () => {
      const emptyResponse: DataverseListResponse<DataverseBot> = {
        value: [],
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(emptyResponse));

      const bots = await client.listBots();
      expect(bots).toHaveLength(0);
    });
  });

  describe("getBot", () => {
    it("should fetch a single bot by ID", async () => {
      const bot: DataverseBot = {
        botid: "bot-1",
        name: "Bot One",
        description: "A specific bot",
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(bot));

      const result = await client.getBot("bot-1");

      expect(result.botid).toBe("bot-1");
      expect(result.name).toBe("Bot One");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/data/v9.2/bots(bot-1)"),
        expect.any(Object),
      );
    });
  });

  describe("getBotComponents", () => {
    it("should fetch components for a bot", async () => {
      const componentsResponse: DataverseListResponse<DataverseBotComponent> = {
        value: [
          {
            botcomponentid: "comp-1",
            name: "Main Instructions",
            componenttype: 15,
            data: '{"instructions": "Test instructions"}',
            _parentbotid_value: "bot-1",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(componentsResponse));

      const components = await client.getBotComponents("bot-1");

      expect(components).toHaveLength(1);
      expect(components[0].componenttype).toBe(15);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("_parentbotid_value%20eq%20bot-1"),
        expect.any(Object),
      );
    });

    it("should filter by component type when specified", async () => {
      const componentsResponse: DataverseListResponse<DataverseBotComponent> = {
        value: [],
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(componentsResponse));

      await client.getBotComponents("bot-1", 15);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("componenttype%20eq%2015"),
        expect.any(Object),
      );
    });

    it("should handle pagination for components", async () => {
      const page1: DataverseListResponse<DataverseBotComponent> = {
        value: [{ botcomponentid: "comp-1", name: "C1", componenttype: 15 }],
        "@odata.nextLink": `${ORG_URL}/api/data/v9.2/botcomponents?$skiptoken=page2`,
      };
      const page2: DataverseListResponse<DataverseBotComponent> = {
        value: [{ botcomponentid: "comp-2", name: "C2", componenttype: 15 }],
      };

      mockFetch
        .mockResolvedValueOnce(jsonResponse(page1))
        .mockResolvedValueOnce(jsonResponse(page2));

      const components = await client.getBotComponents("bot-1", 15);

      expect(components).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("should throw DataverseApiError on 401", async () => {
      mockFetch.mockResolvedValue(errorResponse(401));

      await expect(client.listBots()).rejects.toThrow(DataverseApiError);
      await expect(client.listBots()).rejects.toThrow("Unauthorized");
    });

    it("should throw DataverseApiError on 403", async () => {
      mockFetch.mockResolvedValue(errorResponse(403));

      await expect(client.listBots()).rejects.toThrow(DataverseApiError);
      await expect(client.listBots()).rejects.toThrow("Forbidden");
    });

    it("should throw DataverseApiError on other errors", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, "Internal Server Error"));

      await expect(client.listBots()).rejects.toThrow(DataverseApiError);
    });

    it("should include status code in error", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(403));

      try {
        await client.listBots();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(DataverseApiError);
        expect((e as DataverseApiError).statusCode).toBe(403);
      }
    });
  });

  describe("request headers", () => {
    it("should include correct OData headers", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ value: [] }));

      await client.listBots();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
          }),
        }),
      );
    });
  });

  describe("org URL handling", () => {
    it("should strip trailing slashes from org URL", async () => {
      const clientWithSlash = new DataverseClient(TOKEN, `${ORG_URL}/`);
      mockFetch.mockResolvedValueOnce(jsonResponse({ value: [] }));

      await clientWithSlash.listBots();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${ORG_URL}/api/data/v9.2/bots`),
        expect.any(Object),
      );
      // Should NOT have double slashes
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("//api"),
        expect.any(Object),
      );
    });
  });
});
