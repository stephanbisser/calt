import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPluginManifests } from "../../src/rules/actions/plugin-validation-rules.js";
import { DEFAULT_CONFIG, type RuleContext, type DeclarativeAgentManifest } from "../../src/core/types.js";
import { makeContext as makeContextBase } from "../helpers/make-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");

function makeContext(
  manifest: Partial<DeclarativeAgentManifest>,
  basePath?: string,
) {
  return makeContextBase(manifest, { basePath: basePath ?? fixturesDir });
}

describe("Plugin Validation Rules", () => {
  it("should return empty for agents with no actions", async () => {
    const results = await checkPluginManifests(makeContext({ instructions: "Help users." }));
    expect(results).toEqual([]);
  });

  it("should return empty for remote agents", async () => {
    const ctx: RuleContext = {
      manifest: {
        name: "Test",
        description: "Test",
        instructions: "",
        actions: [{ id: "test", file: "plugin.json" }],
      },
      config: { ...DEFAULT_CONFIG },
      source: { type: "remote", packageId: "T_123" },
    };
    const results = await checkPluginManifests(ctx);
    expect(results).toEqual([]);
  });

  describe("ACT-003: plugin-file-parseable", () => {
    it("should pass for valid JSON plugin", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Use the Task Manager API to manage tasks.",
        actions: [{ id: "tasks", file: "valid-plugin.json" }],
      }));
      const parseResult = results.find((r) => r.ruleId === "ACT-003");
      expect(parseResult?.passed).toBe(true);
    });

    it("should pass for valid YAML plugin", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Use the Task Manager API to manage tasks.",
        actions: [{ id: "tasks", file: "valid-plugin.yaml" }],
      }));
      const parseResult = results.find((r) => r.ruleId === "ACT-003");
      expect(parseResult?.passed).toBe(true);
    });

    it("should fail for invalid JSON plugin", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Help users.",
        actions: [{ id: "broken", file: "invalid-plugin.json" }],
      }));
      const parseResult = results.find((r) => r.ruleId === "ACT-003");
      expect(parseResult?.passed).toBe(false);
    });
  });

  describe("ACT-004: plugin-required-fields", () => {
    it("should pass for valid OpenAPI spec", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Use the Task Manager API.",
        actions: [{ id: "tasks", file: "valid-plugin.json" }],
      }));
      const fieldResult = results.find((r) => r.ruleId === "ACT-004");
      expect(fieldResult?.passed).toBe(true);
    });

    it("should fail for spec missing operationIds but still have required fields", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Help users.",
        actions: [{ id: "noops", file: "plugin-no-operationids.json" }],
      }));
      const fieldResult = results.find((r) => r.ruleId === "ACT-004");
      expect(fieldResult?.passed).toBe(true);
    });
  });

  describe("ACT-005: plugin-operations-have-ids", () => {
    it("should pass when all operations have operationIds", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Use the Task Manager API.",
        actions: [{ id: "tasks", file: "valid-plugin.json" }],
      }));
      const opResult = results.find((r) => r.ruleId === "ACT-005");
      expect(opResult?.passed).toBe(true);
      expect(opResult?.message).toContain("all 3 operations");
    });

    it("should fail when operations lack operationIds", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Help users.",
        actions: [{ id: "noops", file: "plugin-no-operationids.json" }],
      }));
      const opResult = results.find((r) => r.ruleId === "ACT-005");
      expect(opResult?.passed).toBe(false);
      expect(opResult?.message).toContain("0/2");
    });
  });

  describe("ACT-006: plugin-purpose-in-instructions", () => {
    it("should pass when plugin title is mentioned in instructions", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Use the Task Manager API to help users manage their daily tasks.",
        actions: [{ id: "tasks", file: "valid-plugin.json" }],
      }));
      const purposeResult = results.find((r) => r.ruleId === "ACT-006");
      expect(purposeResult?.passed).toBe(true);
    });

    it("should pass when operationId is mentioned in instructions", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Use listTasks to show the user their current tasks.",
        actions: [{ id: "tasks", file: "valid-plugin.json" }],
      }));
      const purposeResult = results.find((r) => r.ruleId === "ACT-006");
      expect(purposeResult?.passed).toBe(true);
    });

    it("should fail when plugin is not referenced in instructions", async () => {
      const results = await checkPluginManifests(makeContext({
        instructions: "Help users with their questions.",
        actions: [{ id: "tasks", file: "valid-plugin.json" }],
      }));
      const purposeResult = results.find((r) => r.ruleId === "ACT-006");
      expect(purposeResult?.passed).toBe(false);
    });
  });
});
