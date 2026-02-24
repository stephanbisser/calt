import { describe, it, expect } from "vitest";
import { capabilityInstructionAlignment } from "../../src/rules/instructions/alignment-rules.js";
import { makeContext } from "../helpers/make-context.js";

describe("INST-016: capability-instruction-alignment", () => {
  it("should skip when no capabilities configured", () => {
    const result = capabilityInstructionAlignment.check(makeContext({
      instructions: "Help users with their questions.",
      capabilities: [],
    }));
    expect((result as any).passed).toBe(true);
    expect((result as any).message).toContain("skipped");
  });

  it("should pass with well-aligned instructions", () => {
    const result = capabilityInstructionAlignment.check(makeContext({
      instructions: [
        "Use SharePoint to find relevant onboarding documents.",
        "Only use SharePoint when the user asks about company policies.",
        "Use web search to find external references when needed.",
        "Do not use web search for internal company questions.",
      ].join("\n"),
      capabilities: [
        { name: "OneDriveAndSharePoint", items_by_url: [] },
        { name: "WebSearch" },
      ],
    }));
    expect((result as any).passed).toBe(true);
    expect((result as any).details).toContain("OneDriveAndSharePoint");
    expect((result as any).details).toContain("WebSearch");
  });

  it("should fail when capabilities are not mentioned at all", () => {
    const result = capabilityInstructionAlignment.check(makeContext({
      instructions: "Help users with their questions. Be helpful and concise.",
      capabilities: [
        { name: "OneDriveAndSharePoint", items_by_url: [] },
        { name: "WebSearch" },
      ],
    }));
    expect((result as any).passed).toBe(false);
  });

  it("should partially pass when only some capabilities are mentioned", () => {
    const result = capabilityInstructionAlignment.check(makeContext({
      instructions: "Use SharePoint documents to answer questions about the company.",
      capabilities: [
        { name: "OneDriveAndSharePoint", items_by_url: [] },
        { name: "WebSearch" },
        { name: "GraphicArt" },
      ],
    }));
    // SharePoint: mentioned (1/3), WebSearch: 0/3, GraphicArt: 0/3 → 1/9 = 11%
    expect((result as any).passed).toBe(false);
  });

  it("should give higher score for usage guidance and constraints", () => {
    const result = capabilityInstructionAlignment.check(makeContext({
      instructions: [
        "Use SharePoint to find documents about policies.",
        "Only use SharePoint when the user asks about internal matters.",
        "Use web search to check external news.",
      ].join("\n"),
      capabilities: [
        { name: "OneDriveAndSharePoint", items_by_url: [] },
        { name: "WebSearch" },
      ],
    }));
    // Should score well since both are mentioned with guidance/constraints
    expect((result as any).passed).toBe(true);
  });

  it("should include per-capability breakdown in details", () => {
    const result = capabilityInstructionAlignment.check(makeContext({
      instructions: "Search documents in SharePoint for answers.",
      capabilities: [
        { name: "OneDriveAndSharePoint", items_by_url: [] },
      ],
    }));
    expect((result as any).details).toContain("OneDriveAndSharePoint");
    expect((result as any).details).toContain("Overall:");
  });
});
