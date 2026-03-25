import chalk from "chalk";
import { writeFile, access, constants } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_CONFIG = {
  $schema:
    "https://raw.githubusercontent.com/stephanbisser/calt/main/schemas/config.schema.json",
  rules: {},
  instruction_min_length: 200,
  instruction_ideal_range: [500, 4000],
  custom_blocked_phrases: [],
  require_conversation_starters_min: 2,
  schema_version_target: "v1.6",
  graph_api: {},
  dataverse: {},
};

export async function initCommand(options: { force?: boolean }): Promise<void> {
  const filePath = resolve(process.cwd(), ".agentlensrc.json");

  let exists = false;
  try {
    await access(filePath, constants.F_OK);
    exists = true;
  } catch {
    // File doesn't exist
  }

  if (exists && !options.force) {
    console.log(chalk.yellow("⚠ .agentlensrc.json already exists. Use --force to overwrite."));
    return;
  }

  await writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  console.log(chalk.green("✓ Created .agentlensrc.json"));
  console.log(chalk.gray("  Customize rules, thresholds, and Graph API settings as needed."));
  console.log(chalk.gray("  Run 'calt setup' to register an Entra App and configure tenant access."));
}
