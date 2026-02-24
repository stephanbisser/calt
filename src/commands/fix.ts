import { readFile, writeFile } from "node:fs/promises";
import chalk from "chalk";
import { loadConfig } from "../core/config-loader.js";
import { AgentLensError } from "../core/errors.js";
import { loadFromFile } from "../core/manifest-loader.js";
import { runFullScan } from "../rules/rule-engine.js";
import { applyFixes } from "../core/fixer.js";
import { formatScanReport } from "../formatters/terminal-formatter.js";

export async function fixCommand(
  pathOrUndefined: string | undefined,
  options: {
    config?: string;
    dryRun?: boolean;
  },
): Promise<void> {
  const cfg = await loadConfig(options.config);
  const path = pathOrUndefined ?? ".";

  const agents = await loadFromFile(path);

  if (agents.length === 0) {
    throw new AgentLensError("No agent manifests found.");
  }

  for (const agent of agents) {
    if (agent.source.type !== "local") {
      console.error(chalk.yellow(`\n⚠ Skipping remote agent "${agent.manifest.name}" — auto-fix only works on local files.\n`));
      continue;
    }

    console.log(chalk.bold.cyan(`\nAgentLens Auto-Fix: "${agent.manifest.name}"`));
    console.log(chalk.cyan("================================\n"));

    // Run scan to get results with fix descriptors
    const report = await runFullScan(agent, cfg);
    const allResults = report.categories.flatMap((c) => c.results);
    const fixableCount = allResults.filter((r) => !r.passed && r.fix).length;

    if (fixableCount === 0) {
      console.log(chalk.green("  No auto-fixable issues found.\n"));
      continue;
    }

    console.log(`  Found ${fixableCount} auto-fixable issue(s).\n`);

    const { manifest: fixedManifest, applied } = applyFixes(agent.manifest, allResults);

    // Show what was applied
    for (const fix of applied) {
      const icon = fix.applied ? chalk.green("✓") : chalk.yellow("⚠");
      console.log(`  ${icon} ${chalk.gray(fix.ruleId)} ${fix.description}`);
    }
    console.log("");

    const appliedCount = applied.filter((f) => f.applied).length;

    if (options.dryRun) {
      console.log(chalk.yellow(`  Dry run: ${appliedCount} fix(es) would be applied. No files modified.\n`));
      continue;
    }

    if (appliedCount === 0) {
      console.log(chalk.yellow("  No fixes could be applied.\n"));
      continue;
    }

    // Write the fixed manifest back
    const filePath = agent.source.filePath;
    const originalContent = await readFile(filePath, "utf-8");
    const originalManifest = JSON.parse(originalContent);

    if (agent.instructionsFilePath) {
      // Instructions live in an external file — write there, leave JSON reference untouched
      await writeFile(agent.instructionsFilePath, fixedManifest.instructions, "utf-8");
      console.log(chalk.green(`  ✓ Instructions fixed in ${agent.instructionsFilePath}`));
    } else {
      // Inline instructions — write back into the JSON manifest
      originalManifest.instructions = fixedManifest.instructions;
    }

    // Conversation starter fixes always go into the JSON manifest
    if (fixedManifest.conversation_starters) {
      originalManifest.conversation_starters = fixedManifest.conversation_starters;
    }

    await writeFile(filePath, JSON.stringify(originalManifest, null, 2) + "\n", "utf-8");
    console.log(chalk.green(`  ✓ ${appliedCount} fix(es) applied to ${filePath}\n`));

    // Re-scan to show updated report
    const updatedAgents = await loadFromFile(filePath);
    if (updatedAgents.length > 0) {
      const updatedReport = await runFullScan(updatedAgents[0], cfg);
      console.log(formatScanReport(updatedReport));
    }
  }
}
