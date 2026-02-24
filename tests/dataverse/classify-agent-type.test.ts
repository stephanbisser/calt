import { describe, it, expect } from "vitest";
import { classifyAgentType, packageToLoadedAgent } from "../../src/graph/transform.js";
import type { DeclarativeAgentManifest, CopilotPackageDetail } from "../../src/core/types.js";
import graphResponse from "../fixtures/graph-api-response.json";

describe("classifyAgentType", () => {
  it("should classify agent with OneDriveAndSharePoint as sharepoint", () => {
    const manifest: DeclarativeAgentManifest = {
      name: "SP Agent",
      description: "SharePoint agent",
      instructions: "Test",
      capabilities: [
        { name: "OneDriveAndSharePoint", items_by_url: [{ url: "https://example.sharepoint.com" }] },
      ],
    };

    expect(classifyAgentType(manifest)).toBe("sharepoint");
  });

  it("should classify agent without OneDriveAndSharePoint as agent-builder", () => {
    const manifest: DeclarativeAgentManifest = {
      name: "Simple Agent",
      description: "No SharePoint",
      instructions: "Test",
      capabilities: [
        { name: "WebSearch" },
        { name: "GraphicArt" },
      ],
    };

    expect(classifyAgentType(manifest)).toBe("agent-builder");
  });

  it("should classify agent with no capabilities as agent-builder", () => {
    const manifest: DeclarativeAgentManifest = {
      name: "Bare Agent",
      description: "No capabilities",
      instructions: "Test",
    };

    expect(classifyAgentType(manifest)).toBe("agent-builder");
  });

  it("should classify agent with empty capabilities array as agent-builder", () => {
    const manifest: DeclarativeAgentManifest = {
      name: "Empty Caps Agent",
      description: "Empty",
      instructions: "Test",
      capabilities: [],
    };

    expect(classifyAgentType(manifest)).toBe("agent-builder");
  });

  it("should classify agent with OneDriveAndSharePoint among other capabilities", () => {
    const manifest: DeclarativeAgentManifest = {
      name: "Multi-cap Agent",
      description: "Multiple capabilities",
      instructions: "Test",
      capabilities: [
        { name: "WebSearch" },
        { name: "OneDriveAndSharePoint", items_by_url: [] },
        { name: "GraphicArt" },
      ],
    };

    expect(classifyAgentType(manifest)).toBe("sharepoint");
  });
});

describe("packageToLoadedAgent with agentType", () => {
  it("should set agentType on metadata for real graph response", () => {
    const packageDetail = graphResponse as unknown as CopilotPackageDetail;
    const agent = packageToLoadedAgent(packageDetail);

    // The fixture has OneDriveAndSharePoint capability, so should be classified as sharepoint
    expect(agent.metadata).toBeDefined();
    expect(agent.metadata!.agentType).toBe("sharepoint");
  });

  it("should set agent-builder for package without OneDriveAndSharePoint", () => {
    const packageDetail = graphResponse as unknown as CopilotPackageDetail;
    // Create a modified package without OneDriveAndSharePoint
    const modifiedPackage: CopilotPackageDetail = {
      ...packageDetail,
      elementDetails: [
        {
          elementType: "DeclarativeCopilots",
          elements: [
            {
              id: "",
              definition: JSON.stringify({
                name: "Test Agent",
                description: "No SP",
                instructions: "Test instructions",
                capabilities: [{ name: "WebSearch" }],
              }),
            },
          ],
        },
      ],
    };

    const agent = packageToLoadedAgent(modifiedPackage);
    expect(agent.metadata!.agentType).toBe("agent-builder");
  });
});
