import { describe, it, expect } from "vitest";
import { starterMinCount, starterMaxCount, starterHasText, starterNoDuplicates } from "../../src/rules/conversation-starters/starter-rules.js";
import { makeContext } from "../helpers/make-context.js";

describe("Conversation Starter Rules", () => {
  describe("CS-001: starter-min-count", () => {
    it("should pass with enough starters", () => {
      const result = starterMinCount.check(makeContext({
        conversation_starters: [
          { text: "Hello", title: "Hi" },
          { text: "Help me", title: "Help" },
        ],
      }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail with too few starters", () => {
      const result = starterMinCount.check(makeContext({
        conversation_starters: [{ text: "Hello" }],
      }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("CS-002: starter-max-count", () => {
    it("should fail with >12 starters", () => {
      const starters = Array.from({ length: 13 }, (_, i) => ({
        text: `Starter ${i}`,
        title: `S${i}`,
      }));
      const result = starterMaxCount.check(makeContext({
        conversation_starters: starters,
      }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("CS-003: starter-has-text", () => {
    it("should fail when text is empty", () => {
      const result = starterHasText.check(makeContext({
        conversation_starters: [{ text: "", title: "Empty" }],
      }));
      expect((result as any).passed).toBe(false);
    });
  });

  describe("CS-004: starter-no-duplicates", () => {
    it("should pass with unique starters", () => {
      const result = starterNoDuplicates.check(makeContext({
        conversation_starters: [
          { text: "First question" },
          { text: "Second question" },
        ],
      }));
      expect((result as any).passed).toBe(true);
    });

    it("should fail with duplicate starters", () => {
      const result = starterNoDuplicates.check(makeContext({
        conversation_starters: [
          { text: "Same question" },
          { text: "Same question" },
        ],
      }));
      expect((result as any).passed).toBe(false);
    });
  });
});
