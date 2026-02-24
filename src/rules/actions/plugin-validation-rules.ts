import { readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "yaml";
import type { RuleContext, RuleResult } from "../../core/types.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "trace"];

interface ParsedPlugin {
  actionId: string;
  filePath: string;
  data: Record<string, unknown>;
}

async function tryParsePlugin(
  filePath: string,
  actionId: string,
): Promise<{ parsed?: ParsedPlugin; error?: RuleResult }> {
  try {
    const content = await readFile(filePath, "utf-8");
    const isYaml = /\.ya?ml$/i.test(filePath);

    let data: Record<string, unknown>;
    if (isYaml) {
      data = yaml.parse(content) as Record<string, unknown>;
    } else {
      data = JSON.parse(content) as Record<string, unknown>;
    }

    return { parsed: { actionId, filePath, data } };
  } catch (err) {
    return {
      error: {
        ruleId: "ACT-003",
        ruleName: "plugin-file-parseable",
        severity: "error",
        passed: false,
        message: `Action "${actionId}" plugin file is not parseable: ${filePath}`,
        details: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}

function checkRequiredFields(plugin: ParsedPlugin): RuleResult {
  const missing: string[] = [];

  const openapi = plugin.data.openapi;
  if (typeof openapi !== "string" || !openapi.startsWith("3.")) {
    missing.push('openapi (must be a string starting with "3.")');
  }

  const info = plugin.data.info as Record<string, unknown> | undefined;
  if (!info || typeof info !== "object") {
    missing.push("info");
  } else {
    if (!info.title) missing.push("info.title");
    if (!info.version) missing.push("info.version");
  }

  const paths = plugin.data.paths;
  if (!paths || typeof paths !== "object" || Object.keys(paths as object).length === 0) {
    missing.push("paths (must be non-empty)");
  }

  return {
    ruleId: "ACT-004",
    ruleName: "plugin-required-fields",
    severity: "error",
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? `Action "${plugin.actionId}" plugin has all required fields.`
        : `Action "${plugin.actionId}" plugin missing required fields: ${missing.join(", ")}`,
    details:
      missing.length > 0
        ? "OpenAPI specs must have: openapi (3.x), info.title, info.version, and non-empty paths."
        : undefined,
  };
}

function checkOperationIds(plugin: ParsedPlugin): RuleResult {
  const paths = plugin.data.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths || typeof paths !== "object") {
    return {
      ruleId: "ACT-005",
      ruleName: "plugin-operations-have-ids",
      severity: "warning",
      passed: true,
      message: `Action "${plugin.actionId}" has no paths to check for operationIds.`,
    };
  }

  const httpMethods = HTTP_METHODS;
  let totalOps = 0;
  let withIds = 0;

  for (const [, methods] of Object.entries(paths)) {
    if (typeof methods !== "object" || methods === null) continue;
    for (const method of httpMethods) {
      const operation = (methods as Record<string, unknown>)[method];
      if (operation && typeof operation === "object") {
        totalOps++;
        if ((operation as Record<string, unknown>).operationId) {
          withIds++;
        }
      }
    }
  }

  return {
    ruleId: "ACT-005",
    ruleName: "plugin-operations-have-ids",
    severity: "warning",
    passed: withIds === totalOps,
    message:
      withIds === totalOps
        ? `Action "${plugin.actionId}": all ${totalOps} operations have operationIds.`
        : `Action "${plugin.actionId}": ${withIds}/${totalOps} operations have operationIds.`,
    details:
      withIds < totalOps
        ? "Add operationId to every path operation. Copilot uses operationIds to identify and invoke API actions."
        : undefined,
  };
}

function checkPurposeInInstructions(plugin: ParsedPlugin, inst: string): RuleResult {
  const info = plugin.data.info as Record<string, unknown> | undefined;
  const title = typeof info?.title === "string" ? info.title.toLowerCase() : "";
  const description = typeof info?.description === "string" ? info.description.toLowerCase() : "";

  const paths = plugin.data.paths as Record<string, Record<string, unknown>> | undefined;
  const operationIds: string[] = [];
  if (paths && typeof paths === "object") {
    const httpMethods = HTTP_METHODS;
    for (const [, methods] of Object.entries(paths)) {
      if (typeof methods !== "object" || methods === null) continue;
      for (const method of httpMethods) {
        const operation = (methods as Record<string, unknown>)[method];
        if (operation && typeof operation === "object") {
          const opId = (operation as Record<string, unknown>).operationId;
          if (typeof opId === "string") {
            operationIds.push(opId.toLowerCase());
          }
        }
      }
    }
  }

  const instLower = inst.toLowerCase();
  const mentioned: string[] = [];

  if (title && instLower.includes(title)) {
    mentioned.push(`title: "${title}"`);
  }
  if (description && instLower.includes(description.slice(0, 50))) {
    mentioned.push("description");
  }
  for (const opId of operationIds) {
    if (instLower.includes(opId)) {
      mentioned.push(`operationId: "${opId}"`);
    }
  }

  return {
    ruleId: "ACT-006",
    ruleName: "plugin-purpose-in-instructions",
    severity: "info",
    passed: mentioned.length > 0,
    message:
      mentioned.length > 0
        ? `Action "${plugin.actionId}" plugin referenced in instructions (${mentioned.join(", ")}).`
        : `Action "${plugin.actionId}" plugin not referenced in instructions.`,
    details:
      mentioned.length === 0
        ? "Mention the plugin's title, description, or operationIds in instructions so the agent knows when to use this action."
        : undefined,
  };
}

export async function checkPluginManifests(
  context: RuleContext,
): Promise<RuleResult[]> {
  const results: RuleResult[] = [];
  const actions = context.manifest.actions ?? [];

  if (actions.length === 0 || context.source.type !== "local") {
    return results;
  }

  const basePath = context.basePath ?? ".";
  const inst = context.manifest.instructions ?? "";

  for (const action of actions) {
    if (!action.file) continue;

    const fullPath = join(basePath, action.file);
    const { parsed, error } = await tryParsePlugin(fullPath, action.id);

    if (error) {
      results.push(error);
      continue;
    }

    if (!parsed) continue;

    // ACT-003: parseable — passed
    results.push({
      ruleId: "ACT-003",
      ruleName: "plugin-file-parseable",
      severity: "error",
      passed: true,
      message: `Action "${action.id}" plugin file is valid.`,
    });

    // ACT-004: required fields
    results.push(checkRequiredFields(parsed));

    // ACT-005: operationIds
    results.push(checkOperationIds(parsed));

    // ACT-006: purpose in instructions
    results.push(checkPurposeInInstructions(parsed, inst));
  }

  return results;
}
