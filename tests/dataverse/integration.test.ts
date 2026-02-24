import { describe, it, expect } from "vitest";
import { botToLoadedAgent } from "../../src/dataverse/transform.js";
import { runFullScan, runInstructionLint } from "../../src/rules/rule-engine.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";
import type { DataverseBot, DataverseBotComponent } from "../../src/core/types.js";
import { BotComponentType } from "../../src/core/types.js";
import botFixture from "../fixtures/dataverse-bot.json";
import componentsFixture from "../fixtures/dataverse-bot-components.json";

const ORG_URL = "https://myorg.api.crm.dynamics.com";

describe("Copilot Studio Integration – End-to-End", () => {
  const bot = botFixture as DataverseBot;
  const components = componentsFixture as DataverseBotComponent[];

  it("should transform a Dataverse bot and run instruction lint", () => {
    const agent = botToLoadedAgent(bot, components, ORG_URL);
    const report = runInstructionLint(agent, DEFAULT_CONFIG);

    expect(report.agent.name).toBe("Customer Service Bot");
    expect(report.agent.source.type).toBe("remote-dataverse");
    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].category).toBe("instructions");
    // Should have run instruction rules
    expect(report.categories[0].results.length).toBeGreaterThan(0);
  });

  it("should transform a Dataverse bot and run full scan", async () => {
    const agent = botToLoadedAgent(bot, components, ORG_URL);
    const report = await runFullScan(agent, DEFAULT_CONFIG);

    expect(report.agent.name).toBe("Customer Service Bot");
    expect(report.agent.metadata?.agentType).toBe("copilot-studio");
    // Full scan includes multiple categories
    expect(report.categories.length).toBeGreaterThanOrEqual(1);
    expect(report.summary.totalChecks).toBeGreaterThan(0);
  });

  it("should pass INST-001 (instruction length) for well-instructed bot", () => {
    const agent = botToLoadedAgent(bot, components, ORG_URL);
    const report = runInstructionLint(agent, DEFAULT_CONFIG);

    const inst001 = report.categories[0].results.find((r) => r.ruleId === "INST-001");
    expect(inst001).toBeDefined();
    // The fixture has substantial instructions (>200 chars)
    expect(inst001!.passed).toBe(true);
  });

  it("should detect structure sections in well-structured bot", () => {
    const agent = botToLoadedAgent(bot, components, ORG_URL);
    const report = runInstructionLint(agent, DEFAULT_CONFIG);

    // The fixture includes # OBJECTIVE and # WORKFLOW sections
    const inst004 = report.categories[0].results.find((r) => r.ruleId === "INST-004");
    if (inst004) {
      expect(inst004.passed).toBe(true);
    }
  });

  it("should handle bot with minimal instructions", () => {
    const minimalComponents: DataverseBotComponent[] = [
      {
        botcomponentid: "comp-minimal",
        name: "Short Instructions",
        componenttype: BotComponentType.CustomGptMainInstructions,
        data: '{"instructions": "Be helpful."}',
        _parentbotid_value: bot.botid,
      },
    ];

    const agent = botToLoadedAgent(bot, minimalComponents, ORG_URL);
    const report = runInstructionLint(agent, DEFAULT_CONFIG);

    // INST-001 checks not-empty (passes), INST-003 checks min length (should fail)
    const inst001 = report.categories[0].results.find((r) => r.ruleId === "INST-001");
    expect(inst001).toBeDefined();
    expect(inst001!.passed).toBe(true); // Not empty

    const inst003 = report.categories[0].results.find((r) => r.ruleId === "INST-003");
    expect(inst003).toBeDefined();
    expect(inst003!.passed).toBe(false); // Too short (12 chars < 200 min)
  });

  it("should include agentType in scan report metadata", async () => {
    const agent = botToLoadedAgent(bot, components, ORG_URL);
    const report = await runFullScan(agent, DEFAULT_CONFIG);

    expect(report.agent.metadata?.agentType).toBe("copilot-studio");
  });

  it("should handle Dataverse source type in report", async () => {
    const agent = botToLoadedAgent(bot, components, ORG_URL);
    const report = await runFullScan(agent, DEFAULT_CONFIG);

    expect(report.agent.source.type).toBe("remote-dataverse");
    if (report.agent.source.type === "remote-dataverse") {
      expect(report.agent.source.botId).toBe(bot.botid);
      expect(report.agent.source.orgUrl).toBe(ORG_URL);
    }
  });
});
