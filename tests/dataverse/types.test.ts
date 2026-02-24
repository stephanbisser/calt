import { describe, it, expect } from "vitest";
import { BotComponentType } from "../../src/core/types.js";
import type { AgentType, AgentSource, DataverseBot, DataverseBotComponent, DataverseListResponse } from "../../src/core/types.js";

describe("Dataverse Types", () => {
  describe("BotComponentType enum", () => {
    it("should have correct values", () => {
      expect(BotComponentType.Topic).toBe(1);
      expect(BotComponentType.Skill).toBe(2);
      expect(BotComponentType.CustomGptMainInstructions).toBe(15);
    });
  });

  describe("AgentType", () => {
    it("should accept valid agent types", () => {
      const types: AgentType[] = ["agent-builder", "copilot-studio", "sharepoint"];
      expect(types).toHaveLength(3);
    });
  });

  describe("AgentSource – remote-dataverse variant", () => {
    it("should support remote-dataverse source", () => {
      const source: AgentSource = {
        type: "remote-dataverse",
        botId: "abc-123",
        orgUrl: "https://myorg.api.crm.dynamics.com",
      };

      expect(source.type).toBe("remote-dataverse");
      if (source.type === "remote-dataverse") {
        expect(source.botId).toBe("abc-123");
        expect(source.orgUrl).toBe("https://myorg.api.crm.dynamics.com");
      }
    });

    it("should still support existing source types", () => {
      const local: AgentSource = { type: "local", filePath: "/path/to/file.json" };
      const remote: AgentSource = { type: "remote", packageId: "T_123" };

      expect(local.type).toBe("local");
      expect(remote.type).toBe("remote");
    });
  });

  describe("DataverseBot interface", () => {
    it("should accept a complete bot object", () => {
      const bot: DataverseBot = {
        botid: "bot-id",
        name: "Test Bot",
        description: "A test bot",
        createdon: "2025-01-01T00:00:00Z",
        modifiedon: "2025-06-01T00:00:00Z",
        schemaname: "cr_testbot",
        statecode: 0,
      };

      expect(bot.botid).toBe("bot-id");
      expect(bot.name).toBe("Test Bot");
    });

    it("should accept a minimal bot object", () => {
      const bot: DataverseBot = {
        botid: "bot-id",
        name: "Minimal Bot",
      };

      expect(bot.description).toBeUndefined();
      expect(bot.statecode).toBeUndefined();
    });
  });

  describe("DataverseBotComponent interface", () => {
    it("should accept a complete component object", () => {
      const comp: DataverseBotComponent = {
        botcomponentid: "comp-id",
        name: "Main Instructions",
        componenttype: 15,
        data: '{"instructions": "test"}',
        createdon: "2025-01-01T00:00:00Z",
        modifiedon: "2025-06-01T00:00:00Z",
        _parentbotid_value: "bot-id",
      };

      expect(comp.componenttype).toBe(15);
      expect(comp.data).toContain("instructions");
    });
  });

  describe("DataverseListResponse interface", () => {
    it("should represent a paginated response", () => {
      const response: DataverseListResponse<DataverseBot> = {
        value: [{ botid: "1", name: "Bot" }],
        "@odata.nextLink": "https://org.crm.dynamics.com/api/data/v9.2/bots?$skiptoken=abc",
        "@odata.context": "https://org.crm.dynamics.com/api/data/v9.2/$metadata#bots",
      };

      expect(response.value).toHaveLength(1);
      expect(response["@odata.nextLink"]).toBeDefined();
    });

    it("should work without pagination link", () => {
      const response: DataverseListResponse<DataverseBot> = {
        value: [],
      };

      expect(response["@odata.nextLink"]).toBeUndefined();
    });
  });
});
