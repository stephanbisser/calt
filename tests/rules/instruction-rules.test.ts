import { describe, it, expect } from "vitest";
import { instructionsNotEmpty, instructionsMaxLength, instructionsMinLength } from "../../src/rules/instructions/length-rules.js";
import { hasPurposeSection, hasMarkdownStructure, hasWorkflowSteps } from "../../src/rules/instructions/structure-rules.js";
import { usesActionableVerbs, avoidsVagueLanguage, noConflictingInstructions, avoidsNegativeFraming } from "../../src/rules/instructions/language-rules.js";
import { referencesCapabilities, hasExamples, hasErrorHandling, conversationStartersMatch } from "../../src/rules/instructions/reference-rules.js";
import { makeContext } from "../helpers/make-context.js";

describe("Instruction Length Rules", () => {
  describe("INST-001: instructions-not-empty", () => {
    it("should pass for non-empty instructions", () => {
      const result = instructionsNotEmpty.check(makeContext({ instructions: "Help users." }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail for empty instructions", () => {
      const result = instructionsNotEmpty.check(makeContext({ instructions: "" }));
      expect((result as any).passed).toBe(false);
    });

    it("should fail for whitespace-only instructions", () => {
      const result = instructionsNotEmpty.check(makeContext({ instructions: "   \n  " }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("INST-002: instructions-max-length", () => {
    it("should pass for normal length", () => {
      const result = instructionsMaxLength.check(makeContext({ instructions: "Help users." }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail for >8000 chars", () => {
      const result = instructionsMaxLength.check(makeContext({ instructions: "x".repeat(8001) }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("INST-003: instructions-min-length", () => {
    it("should warn for short instructions", () => {
      const result = instructionsMinLength.check(makeContext({ instructions: "Help." }));
      expect((result as any).passed).toBe(false);
      expect((result as any).severity).toBe("warning");
    });

    it("should pass for adequate length", () => {
      const result = instructionsMinLength.check(makeContext({ instructions: "x".repeat(250) }));
      expect((result as any).passed).toBe(true);
    });
  });
});

describe("Instruction Structure Rules", () => {
  describe("INST-004: has-purpose-section", () => {
    it("should pass when objective header exists", () => {
      const result = hasPurposeSection.check(makeContext({ instructions: "# OBJECTIVE\nYou are a helpful assistant." }));
      expect((result as any).passed).toBe(true);
    });

    it("should pass for German 'Ziel' section", () => {
      const result = hasPurposeSection.check(makeContext({ instructions: "# Ziel\nDu bist ein hilfreicher Assistent." }));
      expect((result as any).passed).toBe(true);
    });

    it("should pass for 'You are' pattern", () => {
      const result = hasPurposeSection.check(makeContext({ instructions: "You are an onboarding assistant." }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail for no purpose section", () => {
      const result = hasPurposeSection.check(makeContext({ instructions: "Do stuff. Answer questions." }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("INST-005: has-markdown-structure", () => {
    it("should pass with headers", () => {
      const result = hasMarkdownStructure.check(makeContext({ instructions: "# Section\nContent\n## Subsection\nMore content" }));
      expect((result as any).passed).toBe(true);
    });

    it("should pass with numbered list", () => {
      const result = hasMarkdownStructure.check(makeContext({ instructions: "1. First step\n2. Second step\n3. Third step" }));
      expect((result as any).passed).toBe(true);
    });

    it("should pass with bullet list", () => {
      const result = hasMarkdownStructure.check(makeContext({ instructions: "- Item one\n- Item two\n- Item three" }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail for plain text", () => {
      const result = hasMarkdownStructure.check(makeContext({ instructions: "Just plain text with no structure at all." }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("INST-008: has-workflow-steps", () => {
    it("should pass with numbered workflow", () => {
      const result = hasWorkflowSteps.check(makeContext({ instructions: "1. Greet the user\n2. Ask their question\n3. Search for answers" }));
      expect((result as any).passed).toBe(true);
    });

    it("should pass with workflow section", () => {
      const result = hasWorkflowSteps.check(makeContext({ instructions: "# Workflow\nFollow these steps..." }));
      expect((result as any).passed).toBe(true);
    });
  });
});

describe("Instruction Language Rules", () => {
  describe("INST-006: uses-actionable-verbs", () => {
    it("should pass with actionable verbs", () => {
      const result = usesActionableVerbs.check(makeContext({
        instructions: "Search for relevant documents. Display the results clearly. Help users find answers.",
      }));
      expect((result as any).passed).toBe(true);
    });

    it("should pass with German verbs", () => {
      const result = usesActionableVerbs.check(makeContext({
        instructions: "Suche nach relevanten Dokumenten. Zeige die Ergebnisse an. Hilf Benutzern bei Fragen.",
      }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail with no actionable verbs", () => {
      const result = usesActionableVerbs.check(makeContext({
        instructions: "The agent is good at things.",
      }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("INST-007: avoids-vague-language", () => {
    it("should pass with clear language", () => {
      const result = avoidsVagueLanguage.check(makeContext({
        instructions: "Search for documents. Provide direct answers.",
      }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail with vague phrases", () => {
      const result = avoidsVagueLanguage.check(makeContext({
        instructions: "Maybe try to help. If possible, sometimes provide answers.",
      }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("INST-013: no-conflicting-instructions", () => {
    it("should pass with no conflicts", () => {
      const result = noConflictingInstructions.check(makeContext({
        instructions: "Always use formal language.\nNever share personal data.",
      }));
      expect((result as any).passed).toBe(true);
    });

    it("should detect conflicts between always and never", () => {
      const result = noConflictingInstructions.check(makeContext({
        instructions: "Always include detailed references.\nNever include detailed explanations.",
      }));
      expect((result as any).passed).toBe(false);
    });
  });
});

describe("Instruction Reference Rules", () => {
  describe("INST-009: references-capabilities", () => {
    it("should pass when capabilities are referenced", () => {
      const result = referencesCapabilities.check(makeContext({
        instructions: "Use SharePoint documents to answer questions. Generate images with GraphicArt.",
        capabilities: [
          { name: "OneDriveAndSharePoint", items_by_url: [] },
          { name: "GraphicArt" },
        ],
      }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail when capabilities are not referenced", () => {
      const result = referencesCapabilities.check(makeContext({
        instructions: "Help users with their questions.",
        capabilities: [
          { name: "OneDriveAndSharePoint", items_by_url: [] },
          { name: "GraphicArt" },
        ],
      }));
      expect((result as any).passed).toBe(false);
    });

    it("should pass with no capabilities configured", () => {
      const result = referencesCapabilities.check(makeContext({
        instructions: "Help users.",
        capabilities: [],
      }));
      expect((result as any).passed).toBe(true);
    });
  });

  describe("INST-010: has-examples", () => {
    it("should pass with examples", () => {
      const result = hasExamples.check(makeContext({
        instructions: "# Example\nUser: How do I reset my password?\nAssistant: Go to settings...",
      }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail with no examples", () => {
      const result = hasExamples.check(makeContext({
        instructions: "Help users with password resets.",
      }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("INST-015: conversation-starters-match", () => {
    it("should pass when starters match instructions", () => {
      const result = conversationStartersMatch.check(makeContext({
        instructions: "Help users with onboarding, vacation requests, and company orientation.",
        conversation_starters: [
          { text: "How do I request vacation?", title: "Vacation" },
          { text: "Help me with onboarding", title: "Onboarding" },
        ],
      }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail when starters don't match instructions", () => {
      const result = conversationStartersMatch.check(makeContext({
        instructions: "Help users with their IT problems and software installation.",
        conversation_starters: [
          { text: "Tell me about quantum physics", title: "Physics" },
        ],
      }));
      expect((result as any).passed).toBe(false);
    });
  });
});
