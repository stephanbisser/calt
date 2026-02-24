import { describe, it, expect } from "vitest";
import { botToLoadedAgent } from "../../src/dataverse/transform.js";
import type { DataverseBot, DataverseBotComponent } from "../../src/core/types.js";
import { BotComponentType } from "../../src/core/types.js";
import botFixture from "../fixtures/dataverse-bot.json";
import componentsFixture from "../fixtures/dataverse-bot-components.json";

const ORG_URL = "https://myorg.api.crm.dynamics.com";

describe("Dataverse Transform", () => {
  const bot = botFixture as DataverseBot;
  const components = componentsFixture as DataverseBotComponent[];

  describe("botToLoadedAgent", () => {
    it("should convert a bot with instruction components to a LoadedAgent", () => {
      const agent = botToLoadedAgent(bot, components, ORG_URL);

      expect(agent.manifest.name).toBe("Customer Service Bot");
      expect(agent.manifest.description).toBe(
        "A helpful customer service agent for answering support questions.",
      );
      expect(agent.manifest.instructions).toContain("customer service agent");
      expect(agent.manifest.instructions).toContain("# OBJECTIVE");
      expect(agent.manifest.instructions).toContain("# WORKFLOW");
    });

    it("should set source as remote-dataverse with botId and orgUrl", () => {
      const agent = botToLoadedAgent(bot, components, ORG_URL);

      expect(agent.source.type).toBe("remote-dataverse");
      if (agent.source.type === "remote-dataverse") {
        expect(agent.source.botId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
        expect(agent.source.orgUrl).toBe(ORG_URL);
      }
    });

    it("should set metadata with agentType copilot-studio", () => {
      const agent = botToLoadedAgent(bot, components, ORG_URL);

      expect(agent.metadata).toBeDefined();
      expect(agent.metadata!.agentType).toBe("copilot-studio");
      expect(agent.metadata!.displayName).toBe("Customer Service Bot");
      expect(agent.metadata!.lastModifiedDateTime).toBe("2025-06-20T14:45:00Z");
    });

    it("should handle bot with no components gracefully", () => {
      const agent = botToLoadedAgent(bot, [], ORG_URL);

      expect(agent.manifest.name).toBe("Customer Service Bot");
      expect(agent.manifest.instructions).toBe("(no instructions found)");
    });

    it("should handle bot with empty description", () => {
      const botNoDesc: DataverseBot = { ...bot, description: undefined };
      const agent = botToLoadedAgent(botNoDesc, components, ORG_URL);

      expect(agent.manifest.description).toBe("");
    });

    it("should prefer componenttype=15 over other types", () => {
      const mixedComponents: DataverseBotComponent[] = [
        {
          botcomponentid: "comp-other",
          name: "Topic",
          componenttype: BotComponentType.Topic,
          data: '{"instructions": "Topic instructions - should be ignored"}',
          _parentbotid_value: bot.botid,
        },
        ...components, // Includes componenttype=15
      ];

      const agent = botToLoadedAgent(bot, mixedComponents, ORG_URL);

      expect(agent.manifest.instructions).toContain("customer service agent");
      expect(agent.manifest.instructions).not.toContain("should be ignored");
    });

    it("should fall back to all components if no type-15 found", () => {
      const topicComponents: DataverseBotComponent[] = [
        {
          botcomponentid: "comp-topic",
          name: "Topic",
          componenttype: BotComponentType.Topic,
          data: '{"instructions": "Fallback topic instructions"}',
          _parentbotid_value: bot.botid,
        },
      ];

      const agent = botToLoadedAgent(bot, topicComponents, ORG_URL);
      expect(agent.manifest.instructions).toContain("Fallback topic instructions");
    });

    it("should handle component with data as content key", () => {
      const contentComponents: DataverseBotComponent[] = [
        {
          botcomponentid: "comp-content",
          name: "Content Component",
          componenttype: BotComponentType.CustomGptMainInstructions,
          data: '{"content": "Instructions stored in content key"}',
          _parentbotid_value: bot.botid,
        },
      ];

      const agent = botToLoadedAgent(bot, contentComponents, ORG_URL);
      expect(agent.manifest.instructions).toContain("Instructions stored in content key");
    });

    it("should handle component with non-JSON data", () => {
      const rawComponents: DataverseBotComponent[] = [
        {
          botcomponentid: "comp-raw",
          name: "Raw Text",
          componenttype: BotComponentType.CustomGptMainInstructions,
          data: "Raw text instructions that are not JSON",
          _parentbotid_value: bot.botid,
        },
      ];

      const agent = botToLoadedAgent(bot, rawComponents, ORG_URL);
      expect(agent.manifest.instructions).toContain("Raw text instructions");
    });

    it("should handle component with empty data", () => {
      const emptyDataComponents: DataverseBotComponent[] = [
        {
          botcomponentid: "comp-empty",
          name: "Empty",
          componenttype: BotComponentType.CustomGptMainInstructions,
          data: "",
          _parentbotid_value: bot.botid,
        },
      ];

      const agent = botToLoadedAgent(bot, emptyDataComponents, ORG_URL);
      expect(agent.manifest.instructions).toBe("(no instructions found)");
    });

    it("should combine instructions from multiple type-15 components", () => {
      const multiComponents: DataverseBotComponent[] = [
        {
          botcomponentid: "comp-a",
          name: "Part A",
          componenttype: BotComponentType.CustomGptMainInstructions,
          data: '{"instructions": "Part A instructions"}',
          _parentbotid_value: bot.botid,
        },
        {
          botcomponentid: "comp-b",
          name: "Part B",
          componenttype: BotComponentType.CustomGptMainInstructions,
          data: '{"instructions": "Part B instructions"}',
          _parentbotid_value: bot.botid,
        },
      ];

      const agent = botToLoadedAgent(bot, multiComponents, ORG_URL);
      expect(agent.manifest.instructions).toContain("Part A instructions");
      expect(agent.manifest.instructions).toContain("Part B instructions");
    });
  });
});
