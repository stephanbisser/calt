import { describe, it, expect } from "vitest";
import {
  instructionTokenEstimate,
  instructionSectionDensity,
  instructionConditionalDepth,
  instructionReadability,
} from "../../src/rules/instructions/complexity-rules.js";
import { makeContext } from "../helpers/make-context.js";

// ─── INST-017: instruction-token-estimate ────────────────────────────────────

describe("INST-017: instruction-token-estimate", () => {
  it("should pass for short instructions", () => {
    const result = instructionTokenEstimate.check(makeContext({
      instructions: "You are a helpful assistant. Help users with their questions.",
    }));
    expect((result as any).passed).toBe(true);
  });

  it("should pass for instructions near the limit", () => {
    // ~1500 words → ~1950 tokens
    const words = Array(1500).fill("word").join(" ");
    const result = instructionTokenEstimate.check(makeContext({ instructions: words }));
    expect((result as any).passed).toBe(true);
  });

  it("should fail for very long instructions", () => {
    // ~2000 words → ~2600 tokens
    const words = Array(2000).fill("word").join(" ");
    const result = instructionTokenEstimate.check(makeContext({ instructions: words }));
    expect((result as any).passed).toBe(false);
  });
});

// ─── INST-018: instruction-section-density ───────────────────────────────────

describe("INST-018: instruction-section-density", () => {
  it("should skip for short instructions", () => {
    const result = instructionSectionDensity.check(makeContext({
      instructions: "# Title\nShort.",
    }));
    expect((result as any).passed).toBe(true);
    expect((result as any).message).toContain("too short");
  });

  it("should fail for long text with too few headers", () => {
    const lines = Array(20).fill("This is a line of text.").join("\n");
    const result = instructionSectionDensity.check(makeContext({
      instructions: `# Only Header\n${lines}`,
    }));
    expect((result as any).passed).toBe(false);
  });

  it("should pass for well-structured instructions", () => {
    const result = instructionSectionDensity.check(makeContext({
      instructions: [
        "# Objective",
        "You are a helpful assistant.",
        "Help users with HR questions.",
        "Be professional and concise.",
        "",
        "# Workflow",
        "1. Greet the user",
        "2. Understand their question",
        "3. Search knowledge base",
        "4. Provide answer",
        "",
        "# Output",
        "Use bullet points.",
        "Keep responses short.",
      ].join("\n"),
    }));
    expect((result as any).passed).toBe(true);
  });

  it("should fail for too many headers (fragmented)", () => {
    const sections = Array(10).fill(null).map((_, i) => `# Section ${i}\nOne line.`).join("\n");
    const result = instructionSectionDensity.check(makeContext({ instructions: sections }));
    expect((result as any).passed).toBe(false);
  });
});

// ─── INST-019: instruction-conditional-depth ─────────────────────────────────

describe("INST-019: instruction-conditional-depth", () => {
  it("should pass for simple instructions", () => {
    const result = instructionConditionalDepth.check(makeContext({
      instructions: "Help users with their questions. Provide clear answers.",
    }));
    expect((result as any).passed).toBe(true);
  });

  it("should pass for normal conditional usage", () => {
    const result = instructionConditionalDepth.check(makeContext({
      instructions: "If the user asks about policies, search SharePoint.\nWhen unsure, ask for clarification.",
    }));
    expect((result as any).passed).toBe(true);
  });

  it("should fail for too many conditionals on one line", () => {
    const result = instructionConditionalDepth.check(makeContext({
      instructions: "If the user asks and when the data is available unless the system is down except on weekends, respond.",
    }));
    expect((result as any).passed).toBe(false);
  });

  it("should fail for too many consecutive conditional lines", () => {
    const result = instructionConditionalDepth.check(makeContext({
      instructions: [
        "If the user asks about policy, check HR docs.",
        "When the topic is technical, search IT knowledge base.",
        "Unless the question is personal, provide detailed answers.",
        "If the data is not found, ask for clarification.",
      ].join("\n"),
    }));
    expect((result as any).passed).toBe(false);
  });

  it("should count German conditional keywords", () => {
    const result = instructionConditionalDepth.check(makeContext({
      instructions: "Falls der Benutzer fragt, wenn die Daten verfügbar sind, sofern das System läuft.",
    }));
    expect((result as any).passed).toBe(false);
  });
});

// ─── INST-020: instruction-readability ───────────────────────────────────────

describe("INST-020: instruction-readability", () => {
  it("should skip for short instructions", () => {
    const result = instructionReadability.check(makeContext({
      instructions: "Help users.",
    }));
    expect((result as any).passed).toBe(true);
    expect((result as any).message).toContain("too short");
  });

  it("should pass for simple, clear language", () => {
    const result = instructionReadability.check(makeContext({
      instructions: [
        "You are a help desk agent. Help users with their IT problems.",
        "Ask what the issue is. Search the knowledge base for answers.",
        "Give clear and simple answers. Use bullet points for steps.",
        "If you do not know the answer, say so. Be polite and helpful.",
        "Keep your answers short. Use plain language that anyone can read.",
      ].join("\n"),
    }));
    expect((result as any).passed).toBe(true);
  });

  it("should fail for overly complex language", () => {
    const result = instructionReadability.check(makeContext({
      instructions: [
        "Notwithstanding the aforementioned prerequisite stipulations, the sophisticated artificial intelligence infrastructure must systematically demonstrate comprehensive understanding.",
        "The unprecedented multifaceted implementation necessitates an extraordinarily comprehensive jurisdictional administrative organizational methodological approach.",
        "Subsequently, the instrumentalization of the disproportionately overwhelming bureaucratization demonstrates the counterintuitive systematization of the institutionalization.",
        "Furthermore, the internationalization of the telecommunications infrastructure necessitates disproportionately comprehensive methodological standardization procedures.",
        "Additionally, the departmentalization of organizational responsibilities requires extraordinarily sophisticated administrative implementation frameworks.",
      ].join("\n"),
    }));
    expect((result as any).passed).toBe(false);
  });
});
