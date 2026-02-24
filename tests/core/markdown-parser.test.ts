import { describe, it, expect } from "vitest";
import { parseMarkdownStructure, detectSection } from "../../src/utils/markdown-parser.js";

describe("Markdown Parser", () => {
  describe("parseMarkdownStructure", () => {
    it("should detect headers", () => {
      const result = parseMarkdownStructure("# Title\n## Subtitle\n### Sub-sub");
      expect(result.hasHeaders).toBe(true);
      expect(result.headerCount).toBe(3);
      expect(result.headers).toEqual(["Title", "Subtitle", "Sub-sub"]);
    });

    it("should detect numbered lists", () => {
      const result = parseMarkdownStructure("1. First\n2. Second\n3. Third");
      expect(result.hasNumberedList).toBe(true);
      expect(result.numberedListCount).toBe(3);
    });

    it("should detect bullet lists", () => {
      const result = parseMarkdownStructure("- Item 1\n* Item 2\n• Item 3");
      expect(result.hasBulletList).toBe(true);
      expect(result.bulletListCount).toBe(3);
    });

    it("should detect bold text", () => {
      const result = parseMarkdownStructure("This is **bold** text");
      expect(result.hasBoldText).toBe(true);
    });

    it("should detect code blocks", () => {
      const result = parseMarkdownStructure("```\ncode here\n```");
      expect(result.hasCodeBlocks).toBe(true);
    });

    it("should handle plain text", () => {
      const result = parseMarkdownStructure("Just plain text.");
      expect(result.hasHeaders).toBe(false);
      expect(result.hasNumberedList).toBe(false);
      expect(result.hasBulletList).toBe(false);
    });
  });

  describe("detectSection", () => {
    it("should detect purpose sections (EN)", () => {
      expect(detectSection("# Objective\nDo things", "purpose")).toBe(true);
      expect(detectSection("You are a helpful assistant", "purpose")).toBe(true);
    });

    it("should detect purpose sections (DE)", () => {
      expect(detectSection("# Ziel\nDinge tun", "purpose")).toBe(true);
      expect(detectSection("Du bist ein hilfreicher Assistent", "purpose")).toBe(true);
    });

    it("should detect workflow sections", () => {
      expect(detectSection("# Workflow\n1. Step one", "workflow")).toBe(true);
      expect(detectSection("Step 1: Do this", "workflow")).toBe(true);
    });

    it("should detect error handling sections", () => {
      expect(detectSection("# Error Handling\nIf not found...", "errorHandling")).toBe(true);
      expect(detectSection("If the user's question fails, redirect", "errorHandling")).toBe(true);
    });

    it("should detect example sections", () => {
      expect(detectSection("# Example\nUser: Hello", "examples")).toBe(true);
      expect(detectSection("For example, you should...", "examples")).toBe(true);
    });

    it("should return false for missing sections", () => {
      expect(detectSection("Just help users", "purpose")).toBe(false);
      expect(detectSection("No workflow here", "workflow")).toBe(false);
    });
  });
});
