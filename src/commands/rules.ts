import chalk from "chalk";
import { ALL_RULES } from "../rules/rule-engine.js";
import { loadConfig, getEffectiveSeverity } from "../core/config-loader.js";
import type { Rule, RuleCategory, Severity } from "../core/types.js";

export interface RulesCommandOptions {
  config?: string;
  format?: "terminal" | "json";
  category?: RuleCategory;
  severity?: Severity | "off";
}

export interface RuleEntry {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  effectiveSeverity: Severity | "off";
}

/**
 * Snapshot of the rule catalog. Stable, machine-readable shape so coding
 * agents (Claude Code, Cursor, etc.) can discover rule IDs without spinning
 * up a separate MCP server. See AGENTS.md for the agent-facing contract.
 */
export async function listRules(options: RulesCommandOptions): Promise<RuleEntry[]> {
  const cfg = await loadConfig(options.config);

  let rules: Rule[] = ALL_RULES;
  if (options.category) {
    rules = rules.filter((r) => r.category === options.category);
  }

  const entries: RuleEntry[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    defaultSeverity: r.defaultSeverity,
    effectiveSeverity: getEffectiveSeverity(r.id, r.defaultSeverity, cfg),
  }));

  if (options.severity) {
    return entries.filter((e) => e.effectiveSeverity === options.severity);
  }
  return entries;
}

export async function rulesCommand(options: RulesCommandOptions): Promise<void> {
  const entries = await listRules(options);
  const format = options.format ?? "terminal";

  if (format === "json") {
    // Stable wire format for agents — keep keys aligned with RuleEntry.
    console.log(JSON.stringify({ rules: entries, count: entries.length }, null, 2));
    return;
  }

  console.log(chalk.bold(`\nCALT — ${entries.length} rule${entries.length === 1 ? "" : "s"}\n`));

  const byCategory = new Map<RuleCategory, RuleEntry[]>();
  for (const e of entries) {
    const arr = byCategory.get(e.category) ?? [];
    arr.push(e);
    byCategory.set(e.category, arr);
  }

  for (const [category, list] of byCategory) {
    console.log(chalk.cyan.bold(category));
    for (const e of list) {
      const sev = formatSeverity(e.effectiveSeverity);
      const id = chalk.bold(e.id.padEnd(18));
      console.log(`  ${id} ${sev}  ${e.name}`);
      if (e.description) {
        console.log(`    ${chalk.dim(e.description)}`);
      }
    }
    console.log();
  }
}

function formatSeverity(s: Severity | "off"): string {
  switch (s) {
    case "error":
      return chalk.red("[error]  ");
    case "warning":
      return chalk.yellow("[warning]");
    case "info":
      return chalk.blue("[info]   ");
    case "off":
      return chalk.gray("[off]    ");
  }
}
