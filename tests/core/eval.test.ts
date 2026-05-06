import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateEvalSuite,
  toCopilotImportCsv,
  writeEvalTemplate,
  loadEvalSuite,
} from "../../src/core/eval.js";
import type { EvalTestSuite } from "../../src/core/types.js";

describe("eval core", () => {
  it("validates a proper suite", () => {
    const suite: EvalTestSuite = {
      name: "demo",
      testCases: [
        {
          id: "TC-1",
          question: "What are your business hours?",
          expectedResponse: "We are open weekdays.",
          testingMethod: "Similarity",
        },
      ],
    };

    const result = validateEvalSuite(suite);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when expectedResponse is missing for non-general-quality", () => {
    const suite: EvalTestSuite = {
      name: "demo",
      testCases: [
        {
          question: "What are your business hours?",
          testingMethod: "Exact match",
        },
      ],
    };

    const result = validateEvalSuite(suite);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("expectedResponse"))).toBe(true);
  });

  it("exports CSV with expected headers", () => {
    const suite: EvalTestSuite = {
      name: "demo",
      testCases: [
        {
          question: "Q1",
          expectedResponse: "A1",
          testingMethod: "Exact match",
        },
      ],
    };

    const csv = toCopilotImportCsv(suite);
    expect(csv).toContain("Question,Expected response,Testing method");
    expect(csv).toContain("Q1,A1,Exact match");
  });

  it("writes and reloads yaml template", async () => {
    const dir = await mkdtemp(join(tmpdir(), "calt-eval-"));
    const target = join(dir, "default.eval.yaml");

    try {
      const written = await writeEvalTemplate(target);
      expect(written).toBe(target);

      const content = await readFile(target, "utf-8");
      expect(content).toContain("testCases:");

      const loaded = await loadEvalSuite(target);
      expect(loaded.name).toBe("copilot-studio-eval");
      expect(loaded.testCases.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
