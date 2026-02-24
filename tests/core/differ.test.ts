import { describe, it, expect } from "vitest";
import { diffManifests } from "../../src/core/differ.js";
import type { DeclarativeAgentManifest, AgentSource } from "../../src/core/types.js";

const localSource: AgentSource = { type: "local", filePath: "/test/a.json" };

function makeDiff(
  a: Partial<DeclarativeAgentManifest>,
  b: Partial<DeclarativeAgentManifest>,
) {
  const manifestA: DeclarativeAgentManifest = {
    name: "Agent A",
    description: "Test A",
    instructions: "Help users.",
    ...a,
  };
  const manifestB: DeclarativeAgentManifest = {
    name: "Agent B",
    description: "Test B",
    instructions: "Help users.",
    ...b,
  };
  return diffManifests(
    { manifest: manifestA, name: manifestA.name, source: localSource },
    { manifest: manifestB, name: manifestB.name, source: localSource },
  );
}

describe("diffManifests", () => {
  it("should report no changes for identical manifests", () => {
    const report = makeDiff(
      { name: "Same", description: "Same", instructions: "Same instructions." },
      { name: "Same", description: "Same", instructions: "Same instructions." },
    );
    expect(report.summary.totalChanges).toBe(0);
    expect(report.sections).toHaveLength(0);
  });

  it("should detect metadata changes", () => {
    const report = makeDiff(
      { name: "Old Name", description: "Old desc" },
      { name: "New Name", description: "New desc" },
    );
    const metaSection = report.sections.find((s) => s.name === "Metadata");
    expect(metaSection).toBeDefined();
    const nameDetail = metaSection!.details.find((d) => d.field === "name");
    expect(nameDetail?.changeType).toBe("modified");
    expect(nameDetail?.valueA).toBe("Old Name");
    expect(nameDetail?.valueB).toBe("New Name");
  });

  it("should detect added capabilities", () => {
    const report = makeDiff(
      { capabilities: [] },
      { capabilities: [{ name: "WebSearch" }] },
    );
    const capSection = report.sections.find((s) => s.name === "Capabilities");
    expect(capSection).toBeDefined();
    expect(capSection!.details.some((d) => d.changeType === "added")).toBe(true);
    expect(report.summary.additions).toBeGreaterThan(0);
  });

  it("should detect removed capabilities", () => {
    const report = makeDiff(
      { capabilities: [{ name: "WebSearch" }, { name: "GraphicArt" }] },
      { capabilities: [{ name: "WebSearch" }] },
    );
    const capSection = report.sections.find((s) => s.name === "Capabilities");
    expect(capSection).toBeDefined();
    expect(capSection!.details.some((d) => d.changeType === "removed")).toBe(true);
    expect(report.summary.removals).toBeGreaterThan(0);
  });

  it("should detect instruction line changes", () => {
    const report = makeDiff(
      { instructions: "Line one.\nLine two.\nLine three." },
      { instructions: "Line one.\nLine modified.\nLine three.\nLine four." },
    );
    const instSection = report.sections.find((s) => s.name === "Instructions");
    expect(instSection).toBeDefined();
    expect(instSection!.changeType).toBe("modified");
    // "Line two." → "Line modified." is a modified line, "Line four." is added
    const modifiedLines = instSection!.details.filter((d) => d.changeType === "modified");
    const addedLines = instSection!.details.filter((d) => d.changeType === "added");
    expect(modifiedLines.length).toBeGreaterThan(0);
    expect(addedLines.length).toBeGreaterThan(0);
  });

  it("should detect conversation starter changes", () => {
    const report = makeDiff(
      { conversation_starters: [{ text: "Hello" }, { text: "Help me" }] },
      { conversation_starters: [{ text: "Hello" }, { text: "What can you do?" }] },
    );
    const starterSection = report.sections.find((s) => s.name === "Conversation Starters");
    expect(starterSection).toBeDefined();
    expect(starterSection!.details.some((d) => d.changeType === "removed")).toBe(true);
    expect(starterSection!.details.some((d) => d.changeType === "added")).toBe(true);
  });

  it("should detect action changes", () => {
    const report = makeDiff(
      { actions: [{ id: "action1", file: "plugin1.json" }] },
      { actions: [{ id: "action1", file: "plugin1-v2.json" }] },
    );
    const actionSection = report.sections.find((s) => s.name === "Actions");
    expect(actionSection).toBeDefined();
    expect(actionSection!.details.some((d) => d.changeType === "modified")).toBe(true);
  });

  it("should report correct summary counts", () => {
    const report = makeDiff(
      {
        name: "Old",
        capabilities: [{ name: "WebSearch" }],
        conversation_starters: [{ text: "Hello" }],
      },
      {
        name: "New",
        capabilities: [{ name: "GraphicArt" }],
        conversation_starters: [{ text: "Hi there" }],
      },
    );
    expect(report.summary.totalChanges).toBeGreaterThan(0);
    expect(report.timestamp).toBeDefined();
  });

  it("should handle completely different manifests", () => {
    const report = makeDiff(
      {
        name: "Agent A",
        description: "First agent",
        instructions: "Do thing A.\nUse SharePoint.",
        capabilities: [{ name: "OneDriveAndSharePoint", items_by_url: [] }],
        conversation_starters: [{ text: "Start A" }],
      },
      {
        name: "Agent B",
        description: "Second agent",
        instructions: "Do thing B.\nUse web search.",
        capabilities: [{ name: "WebSearch" }],
        conversation_starters: [{ text: "Start B" }],
      },
    );
    expect(report.summary.totalChanges).toBeGreaterThan(3);
  });
});
