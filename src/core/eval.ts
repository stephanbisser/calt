import { readFile, writeFile, mkdir, access, constants } from "node:fs/promises";
import { dirname, resolve, extname, basename } from "node:path";
import YAML from "yaml";
import type { EvalTestCase, EvalTestSuite, EvalValidationResult } from "./types.js";

const SUPPORTED_METHODS = new Set([
  "General quality",
  "Compare meaning",
  "Similarity",
  "Exact match",
  "Keyword match",
]);

function parseSuite(raw: string, filePath: string): EvalTestSuite {
  const ext = extname(filePath).toLowerCase();

  if (ext === ".yaml" || ext === ".yml") {
    return YAML.parse(raw) as EvalTestSuite;
  }

  return JSON.parse(raw) as EvalTestSuite;
}

export async function loadEvalSuite(filePath: string): Promise<EvalTestSuite> {
  const abs = resolve(filePath);
  const raw = await readFile(abs, "utf-8");
  const suite = parseSuite(raw, abs);
  return suite;
}

function requiresExpectedResponse(method: string): boolean {
  return method !== "General quality";
}

function validateTestCase(testCase: EvalTestCase, index: number, errors: string[]): void {
  const prefix = `testCases[${index}]`;

  if (!testCase.question || testCase.question.trim().length === 0) {
    errors.push(`${prefix}.question is required.`);
  } else if (testCase.question.length > 1000) {
    errors.push(`${prefix}.question must be <= 1000 characters.`);
  }

  if (!testCase.testingMethod || !SUPPORTED_METHODS.has(testCase.testingMethod)) {
    errors.push(
      `${prefix}.testingMethod must be one of: ${Array.from(SUPPORTED_METHODS).join(", ")}.`,
    );
  }

  if (
    requiresExpectedResponse(testCase.testingMethod) &&
    (!testCase.expectedResponse || testCase.expectedResponse.trim().length === 0)
  ) {
    errors.push(
      `${prefix}.expectedResponse is required for testingMethod "${testCase.testingMethod}".`,
    );
  }
}

export function validateEvalSuite(suite: EvalTestSuite): EvalValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!suite || typeof suite !== "object") {
    return {
      valid: false,
      errors: ["Suite must be an object."],
      warnings,
    };
  }

  if (!suite.name || suite.name.trim().length === 0) {
    errors.push("name is required.");
  }

  if (!Array.isArray(suite.testCases)) {
    errors.push("testCases must be an array.");
  } else {
    if (suite.testCases.length === 0) {
      errors.push("testCases must contain at least one test case.");
    }
    if (suite.testCases.length > 100) {
      errors.push("testCases must contain at most 100 test cases.");
    }

    const seenIds = new Set<string>();
    for (let i = 0; i < suite.testCases.length; i++) {
      const testCase = suite.testCases[i];
      validateTestCase(testCase, i, errors);

      if (testCase.id) {
        if (seenIds.has(testCase.id)) {
          errors.push(`Duplicate test case id: ${testCase.id}`);
        }
        seenIds.add(testCase.id);
      } else {
        warnings.push(`testCases[${i}] has no id. A derived id will be used on export.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function escapeCsvField(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCopilotImportCsv(suite: EvalTestSuite): string {
  const lines: string[] = ["Question,Expected response,Testing method"];

  for (const testCase of suite.testCases) {
    const question = escapeCsvField(testCase.question ?? "");
    const expected = escapeCsvField(testCase.expectedResponse ?? "");
    const method = escapeCsvField(testCase.testingMethod ?? "General quality");
    lines.push(`${question},${expected},${method}`);
  }

  return lines.join("\n") + "\n";
}

export async function saveCopilotImportCsv(
  suite: EvalTestSuite,
  outputPath?: string,
): Promise<string> {
  const out = outputPath ?? resolve(process.cwd(), `${basename(suite.name)}.copilot-eval.csv`);
  const abs = resolve(out);
  await mkdir(dirname(abs), { recursive: true });
  const csv = toCopilotImportCsv(suite);
  await writeFile(abs, csv, "utf-8");
  return abs;
}

export async function writeEvalTemplate(filePath: string, force = false): Promise<string> {
  const abs = resolve(filePath);

  if (!force) {
    try {
      await access(abs, constants.F_OK);
      throw new Error(`File already exists: ${abs}`);
    } catch (err) {
      if ((err as { code?: string }).code !== "ENOENT") {
        throw err;
      }
    }
  }

  const template: EvalTestSuite = {
    name: "copilot-studio-eval",
    description: "Single response test set for Copilot Studio import",
    testCases: [
      {
        id: "TC-001",
        question: "What are your business hours?",
        expectedResponse: "We are open from 9 a.m. to 5 p.m. from Monday to Friday.",
        testingMethod: "Similarity",
      },
      {
        id: "TC-002",
        question: "How can I reset my password?",
        expectedResponse: "",
        testingMethod: "General quality",
      },
    ],
  };

  await mkdir(dirname(abs), { recursive: true });
  if (extname(abs).toLowerCase() === ".json") {
    await writeFile(abs, JSON.stringify(template, null, 2) + "\n", "utf-8");
  } else {
    await writeFile(abs, YAML.stringify(template), "utf-8");
  }

  return abs;
}
