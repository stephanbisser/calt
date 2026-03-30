import Ajv from "ajv";
import type { Rule, RuleContext, RuleResult } from "../../core/types.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const schemaV13 = require("./schemas/v1.3.json");
const schemaV14 = require("./schemas/v1.4.json");
const schemaV15 = require("./schemas/v1.5.json");
const schemaV16 = require("./schemas/v1.6.json");

const SCHEMAS: Record<string, object> = {
  "v1.0": schemaV13, // v1.0–v1.3 share the same base schema
  "v1.1": schemaV13,
  "v1.2": schemaV13,
  "v1.3": schemaV13,
  "v1.4": schemaV14,
  "v1.5": schemaV15,
  "v1.6": schemaV16,
};

const LATEST_VERSION = "v1.6";

const VERSION_CAPABILITIES: Record<string, string[]> = {
  "v1.4": ["Dataverse", "BehaviorOverrides"],
  "v1.5": ["TeamsMessages", "Disclaimer"],
  "v1.6": ["Email", "People", "Meetings", "ScenarioModels"],
};

function detectSchemaVersion(manifest: Record<string, unknown>): string | null {
  // Try $schema URL first
  if (typeof manifest.$schema === "string") {
    const match = manifest.$schema.match(/\/v(\d+\.\d+)\//);
    if (match) return `v${match[1]}`;
  }
  // Fall back to version field
  if (typeof manifest.version === "string") {
    const ver = manifest.version;
    if (ver.startsWith("v") && SCHEMAS[ver]) return ver;
  }
  return null;
}

export const schemaValidationRule: Rule = {
  id: "SCHEMA-001",
  name: "valid-schema",
  description: "Validates manifest against the official JSON Schema",
  category: "schema",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];
    const manifest = context.manifest as unknown as Record<string, unknown>;

    const version = detectSchemaVersion(manifest);

    if (!version) {
      results.push({
        ruleId: "SCHEMA-001",
        ruleName: "valid-schema",
        severity: "warning",
        passed: true,
        message: "No schema version detected. Validating against latest (v1.6).",
      });
    }

    const schemaVersion = version ?? LATEST_VERSION;
    const schema = SCHEMAS[schemaVersion];

    if (!schema) {
      results.push({
        ruleId: "SCHEMA-001",
        ruleName: "valid-schema",
        severity: "error",
        passed: false,
        message: `Unknown schema version: ${schemaVersion}. Supported: ${Object.keys(SCHEMAS).join(", ")}`,
      });
      return results;
    }

    const ajv = new Ajv.default({ allErrors: true, strict: "log" });
    const validate = ajv.compile(schema);
    const valid = validate(manifest);

    if (valid) {
      results.push({
        ruleId: "SCHEMA-001",
        ruleName: "valid-schema",
        severity: "error",
        passed: true,
        message: `Valid against schema ${schemaVersion}.`,
      });
    } else {
      for (const err of validate.errors ?? []) {
        results.push({
          ruleId: "SCHEMA-001",
          ruleName: "valid-schema",
          severity: "error",
          passed: false,
          message: `Schema error at ${err.instancePath || "/"}: ${err.message}`,
          details: JSON.stringify(err.params),
        });
      }
    }

    return results;
  },
};

export const schemaVersionRule: Rule = {
  id: "SCHEMA-002",
  name: "schema-version",
  description: "Checks if the schema version is valid and up-to-date",
  category: "schema",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const manifest = context.manifest as unknown as Record<string, unknown>;
    const version = detectSchemaVersion(manifest);

    if (!version) {
      return {
        ruleId: "SCHEMA-002",
        ruleName: "schema-version",
        severity: "info",
        passed: true,
        message:
          "No schema version specified. Consider adding a $schema field or version field.",
      };
    }

    if (version === LATEST_VERSION) {
      return {
        ruleId: "SCHEMA-002",
        ruleName: "schema-version",
        severity: "info",
        passed: true,
        message: `Schema version ${version} is the latest.`,
      };
    }

    // Collect capabilities available in newer versions
    const newCapabilities: string[] = [];
    const versions = Object.keys(SCHEMAS);
    const currentIdx = versions.indexOf(version);
    for (let i = currentIdx + 1; i < versions.length; i++) {
      const v = versions[i];
      if (VERSION_CAPABILITIES[v]) {
        newCapabilities.push(...VERSION_CAPABILITIES[v]);
      }
    }

    const capStr =
      newCapabilities.length > 0
        ? ` Consider upgrading to access: ${newCapabilities.join(", ")} capabilities.`
        : "";

    return {
      ruleId: "SCHEMA-002",
      ruleName: "schema-version",
      severity: "warning",
      passed: false,
      message: `Schema version ${version} is outdated. Latest is ${LATEST_VERSION}.${capStr}`,
    };
  },
};

export const requiredFieldsRule: Rule = {
  id: "SCHEMA-003",
  name: "required-fields",
  description: "Checks that all required fields are present",
  category: "schema",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];
    const m = context.manifest;

    const checks: [string, unknown][] = [
      ["name", m.name],
      ["description", m.description],
      ["instructions", m.instructions],
    ];

    for (const [field, value] of checks) {
      const present = typeof value === "string" && value.trim().length > 0;
      results.push({
        ruleId: "SCHEMA-003",
        ruleName: "required-fields",
        severity: "error",
        passed: present,
        message: present
          ? `Required field '${field}' is present.`
          : `Required field '${field}' is missing or empty.`,
      });
    }

    return results;
  },
};

export const nameLengthRule: Rule = {
  id: "SCHEMA-004",
  name: "name-length",
  description: "Checks that the name is within the allowed length",
  category: "schema",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult {
    const name = context.manifest.name ?? "";
    const len = name.length;
    return {
      ruleId: "SCHEMA-004",
      ruleName: "name-length",
      severity: "error",
      passed: len > 0 && len <= 100,
      message:
        len > 100
          ? `Name is too long (${len}/100 chars).`
          : `Name length OK (${len}/100 chars).`,
    };
  },
};

export const descriptionLengthRule: Rule = {
  id: "SCHEMA-005",
  name: "description-length",
  description: "Checks that the description is within the allowed length",
  category: "schema",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult {
    const desc = context.manifest.description ?? "";
    const len = desc.length;
    return {
      ruleId: "SCHEMA-005",
      ruleName: "description-length",
      severity: "error",
      passed: len > 0 && len <= 1000,
      message:
        len > 1000
          ? `Description is too long (${len}/1000 chars).`
          : `Description length OK (${len}/1000 chars).`,
    };
  },
};

export const schemaRules: Rule[] = [
  schemaValidationRule,
  schemaVersionRule,
  requiredFieldsRule,
  nameLengthRule,
  descriptionLengthRule,
];
