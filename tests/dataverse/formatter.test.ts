import { describe, it, expect } from "vitest";
import {
  formatAgentTable,
  copilotPackageToSummary,
  dataverseBotToSummary,
  type RemoteAgentSummary,
} from "../../src/formatters/terminal-formatter.js";
import type { CopilotPackage, DataverseBot } from "../../src/core/types.js";

describe("Formatter – RemoteAgentSummary", () => {
  describe("copilotPackageToSummary", () => {
    it("should convert a CopilotPackage to RemoteAgentSummary", () => {
      const pkg: CopilotPackage = {
        id: "T_abc-123",
        displayName: "Test Agent",
        type: "shared",
        shortDescription: "A test agent",
        supportedHosts: ["Copilot"],
        lastModifiedDateTime: "2025-06-01T00:00:00Z",
        publisher: "Test Publisher",
        version: "1.0",
      };

      const summary = copilotPackageToSummary(pkg);
      expect(summary.id).toBe("T_abc-123");
      expect(summary.displayName).toBe("Test Agent");
      expect(summary.agentType).toBe("agent-builder");
      expect(summary.description).toBe("A test agent");
      expect(summary.lastModified).toBe("2025-06-01T00:00:00Z");
    });

    it("should accept explicit agent type", () => {
      const pkg: CopilotPackage = {
        id: "T_sp-123",
        displayName: "SP Agent",
        type: "shared",
        shortDescription: "SharePoint",
        supportedHosts: ["Copilot"],
        lastModifiedDateTime: "2025-06-01T00:00:00Z",
        publisher: "Publisher",
        version: "1.0",
      };

      const summary = copilotPackageToSummary(pkg, "sharepoint");
      expect(summary.agentType).toBe("sharepoint");
    });
  });

  describe("dataverseBotToSummary", () => {
    it("should convert a DataverseBot to RemoteAgentSummary", () => {
      const bot: DataverseBot = {
        botid: "bot-guid-123",
        name: "CS Bot",
        description: "Customer service bot",
        modifiedon: "2025-06-15T12:00:00Z",
      };

      const summary = dataverseBotToSummary(bot);
      expect(summary.id).toBe("bot-guid-123");
      expect(summary.displayName).toBe("CS Bot");
      expect(summary.agentType).toBe("copilot-studio");
      expect(summary.description).toBe("Customer service bot");
      expect(summary.lastModified).toBe("2025-06-15T12:00:00Z");
      expect(summary.environment).toBeUndefined();
    });

    it("should handle bot with no description", () => {
      const bot: DataverseBot = {
        botid: "bot-123",
        name: "Minimal Bot",
      };

      const summary = dataverseBotToSummary(bot);
      expect(summary.description).toBe("");
      expect(summary.lastModified).toBeUndefined();
    });

    it("should derive environment display name from orgUrl", () => {
      const bot: DataverseBot = {
        botid: "bot-456",
        name: "Env Bot",
      };

      const summary = dataverseBotToSummary(bot, "https://orga9d0d37b.api.crm4.dynamics.com");
      expect(summary.environment).toBe("orga9d0d37b.crm4");
    });

    it("should handle crm (no number) region in orgUrl", () => {
      const bot: DataverseBot = {
        botid: "bot-789",
        name: "US Bot",
      };

      const summary = dataverseBotToSummary(bot, "https://myorg.api.crm.dynamics.com");
      expect(summary.environment).toBe("myorg.crm");
    });

    it("should handle non-standard orgUrl gracefully", () => {
      const bot: DataverseBot = {
        botid: "bot-000",
        name: "Custom Bot",
      };

      const summary = dataverseBotToSummary(bot, "https://custom.example.com");
      expect(summary.environment).toBe("custom");
    });

    it("should not set environment when orgUrl is omitted", () => {
      const bot: DataverseBot = {
        botid: "bot-111",
        name: "No Env Bot",
      };

      const summary = dataverseBotToSummary(bot);
      expect(summary.environment).toBeUndefined();
    });
  });

  describe("formatAgentTable with RemoteAgentSummary[]", () => {
    it("should format a mixed list of agent types", () => {
      const summaries: RemoteAgentSummary[] = [
        {
          id: "T_abc-123",
          displayName: "Builder Agent",
          agentType: "agent-builder",
          description: "An agent builder agent",
          lastModified: "2025-06-01T00:00:00Z",
        },
        {
          id: "bot-456-guid",
          displayName: "Studio Bot",
          agentType: "copilot-studio",
          description: "A copilot studio bot",
          lastModified: "2025-06-15T00:00:00Z",
        },
        {
          id: "T_sp-789",
          displayName: "SP Agent",
          agentType: "sharepoint",
          description: "A sharepoint agent",
          lastModified: "2025-05-20T00:00:00Z",
        },
      ];

      const output = formatAgentTable(summaries);

      // Should contain all agent types
      expect(output).toContain("agent-builder");
      expect(output).toContain("copilot-studio");
      expect(output).toContain("sharepoint");

      // Should contain names
      expect(output).toContain("Builder Agent");
      expect(output).toContain("Studio Bot");
      expect(output).toContain("SP Agent");

      // Should contain Type column header
      expect(output).toContain("Type");

      // Should show correct count
      expect(output).toContain("3 agent(s)");
    });

    it("should handle empty list", () => {
      const output = formatAgentTable([]);
      expect(output).toContain("0 agent(s)");
    });

    it("should still work with CopilotPackage[] for backward compat", () => {
      const packages: CopilotPackage[] = [
        {
          id: "T_pkg-1",
          displayName: "Package Agent",
          type: "shared",
          shortDescription: "A package",
          supportedHosts: ["Copilot"],
          lastModifiedDateTime: "2025-06-01T00:00:00Z",
          publisher: "Pub",
          version: "1.0",
        },
      ];

      const output = formatAgentTable(packages);
      expect(output).toContain("Package Agent");
      expect(output).toContain("1 agent(s)");
    });

    it("should not show Environment column when no agents have environment", () => {
      const summaries: RemoteAgentSummary[] = [
        {
          id: "bot-1",
          displayName: "Bot One",
          agentType: "copilot-studio",
          description: "A bot",
        },
      ];

      const output = formatAgentTable(summaries);
      expect(output).not.toContain("Environment");
    });

    it("should show Environment column when any agent has environment", () => {
      const summaries: RemoteAgentSummary[] = [
        {
          id: "bot-1",
          displayName: "Bot One",
          agentType: "copilot-studio",
          description: "From env 1",
          environment: "org1.crm4",
        },
        {
          id: "bot-2",
          displayName: "Bot Two",
          agentType: "copilot-studio",
          description: "From env 2",
          environment: "org2.crm",
        },
        {
          id: "T_abc",
          displayName: "Graph Agent",
          agentType: "agent-builder",
          description: "No env",
        },
      ];

      const output = formatAgentTable(summaries);
      expect(output).toContain("Environment");
      expect(output).toContain("org1.crm4");
      expect(output).toContain("org2.crm");
      expect(output).toContain("3 agent(s)");
    });
  });
});
