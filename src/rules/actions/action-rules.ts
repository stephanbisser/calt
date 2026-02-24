import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import type { Rule, RuleContext, RuleResult } from "../../core/types.js";

export const actionFileExists: Rule = {
  id: "ACT-001",
  name: "action-file-exists",
  description: "Action plugin files must exist on disk (local only)",
  category: "actions",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];
    const actions = context.manifest.actions ?? [];

    if (actions.length === 0) return results;

    // Only check file existence for local sources
    if (context.source.type !== "local") {
      results.push({
        ruleId: this.id,
        ruleName: this.name,
        severity: "info",
        passed: true,
        message: "Action file existence check skipped for remote agents.",
      });
      return results;
    }

    // File checks need to be deferred – return pending results
    // The rule engine will handle async resolution
    for (const action of actions) {
      if (!action.file || action.file.trim().length === 0) {
        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: this.defaultSeverity,
          passed: false,
          message: `Action "${action.id}" has no file path specified.`,
        });
      } else {
        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: this.defaultSeverity,
          passed: true, // Will be validated in async check
          message: `Action "${action.id}" references file: ${action.file}`,
        });
      }
    }

    return results;
  },
};

export const actionIdUnique: Rule = {
  id: "ACT-002",
  name: "action-id-unique",
  description: "Action IDs must be unique",
  category: "actions",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult {
    const actions = context.manifest.actions ?? [];

    if (actions.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No actions defined.",
      };
    }

    const ids = actions.map((a) => a.id);
    const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    const uniqueDupes = [...new Set(dupes)];

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: uniqueDupes.length === 0,
      message:
        uniqueDupes.length === 0
          ? `All ${actions.length} action IDs are unique.`
          : `Duplicate action IDs found: ${uniqueDupes.join(", ")}`,
    };
  },
};

// Async check for action file existence
export async function checkActionFilesExist(
  context: RuleContext,
): Promise<RuleResult[]> {
  const results: RuleResult[] = [];
  const actions = context.manifest.actions ?? [];
  if (actions.length === 0 || context.source.type !== "local") return results;

  const basePath = context.basePath ?? ".";

  for (const action of actions) {
    if (!action.file) continue;
    const fullPath = join(basePath, action.file);
    try {
      await access(fullPath, constants.R_OK);
      results.push({
        ruleId: "ACT-001",
        ruleName: "action-file-exists",
        severity: "error",
        passed: true,
        message: `Action file exists: ${action.file}`,
      });
    } catch {
      results.push({
        ruleId: "ACT-001",
        ruleName: "action-file-exists",
        severity: "error",
        passed: false,
        message: `Action file not found: ${action.file} (resolved: ${fullPath})`,
        details:
          "Ensure the action plugin file exists at the specified path relative to the manifest.",
      });
    }
  }

  return results;
}

export const actionRules: Rule[] = [actionFileExists, actionIdUnique];
