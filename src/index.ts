#!/usr/bin/env node

import { Command, Option } from "commander";
import chalk from "chalk";
import { createRequire } from "node:module";
import { scanCommand } from "./commands/scan.js";
import { lintCommand } from "./commands/lint.js";
import { validateCommand } from "./commands/validate.js";
import { fetchCommand } from "./commands/fetch.js";
import { loginCommand, logoutCommand, statusCommand } from "./commands/login.js";

import { reportCommand } from "./commands/report.js";
import { setupCommand } from "./commands/setup.js";
import { diffCommand } from "./commands/diff.js";
import { fixCommand } from "./commands/fix.js";
import { initCommand } from "./commands/init.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withErrorHandler(fn: (...args: any[]) => Promise<void | number>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (...args: any[]) => {
    try {
      const code = await fn(...args);
      if (typeof code === "number" && code !== 0) process.exit(code);
    } catch (err) {
      console.error(
        chalk.red(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`),
      );
      process.exit(1);
    }
  };
}

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

const AGENT_TYPE_CHOICES = ["agent-builder", "copilot-studio", "sharepoint", "all"];

program
  .name("calt")
  .description(
    "CALT – Lint, validate, and analyze Microsoft 365 Copilot Agent configurations",
  )
  .version(pkg.version);

// ─── Login / Logout ──────────────────────────────────────────────────────────

program
  .command("login")
  .description("Authenticate with Microsoft 365 (Graph API + Dataverse if configured)")
  .option("--tenant <tenant-id>", "Specific Entra tenant ID")
  .option("--client-id <id>", "Custom Entra App Registration client ID")
  .option("--config <path>", "Path to .caltrc.json")
  .option("--status", "Show current login status")
  .option("--verbose", "Show token scopes and claims (with --status)")
  .option("--raw", "Show full raw token (with --status --verbose)")
  .action(withErrorHandler(async (options) => {
    if (options.status) {
      await statusCommand(options);
    } else {
      await loginCommand(options);
    }
  }));

program
  .command("logout")
  .description("Clear all cached authentication tokens (Graph API + Dataverse)")
  .action(withErrorHandler(async () => {
    await logoutCommand();
  }));

// ─── Fetch ───────────────────────────────────────────────────────────────────

program
  .command("fetch")
  .description("Fetch Copilot Agent configurations from your M365 tenant")
  .option("--list", "List all Copilot agents in the tenant")
  .option("--id <package-id>", "Fetch a specific agent by package ID")
  .option("--all", "Fetch all agents from the tenant")
  .option("--output <dir>", "Output directory for fetched files")
  .option("--config <path>", "Path to .caltrc.json")
  .option("--client-id <id>", "Custom Entra App client ID")
  .option("--tenant <tenant-id>", "Specific tenant ID")
  .addOption(
    new Option("--type <type>", "Agent type filter")
      .choices(AGENT_TYPE_CHOICES)
      .default("all"),
  )
  .option("--org-url <url>", "Dataverse organization URL")
  .action(withErrorHandler(async (options) => {
    await fetchCommand(options);
  }));

// ─── Scan ────────────────────────────────────────────────────────────────────

program
  .command("scan")
  .argument("[path]", "Path to agent manifest or project directory")
  .description("Run all checks on an agent configuration")
  .option("--remote", "Fetch agent from tenant instead of local file")
  .option("--id <package-id>", "Remote agent package ID (with --remote)")
  .option("--all", "Scan all agents from tenant (with --remote)")
  .option("--config <path>", "Path to .caltrc.json")
  .option("--format <type>", "Output format: terminal, json, markdown", "terminal")
  .option("--verbose", "Show detailed output")
  .option("--fix", "Auto-fix applicable issues")
  .option("--client-id <id>", "Custom Entra App client ID")
  .option("--tenant <tenant-id>", "Specific tenant ID")
  .addOption(
    new Option("--type <type>", "Agent type filter")
      .choices(AGENT_TYPE_CHOICES)
      .default("all"),
  )
  .option("--org-url <url>", "Dataverse organization URL")
  .action(withErrorHandler(async (path, options) => {
    if (options.fix) {
      if (options.format !== "terminal" || options.verbose || options.remote || options.all || options.id) {
        console.error(chalk.yellow("Note: --fix mode ignores --format, --verbose, --remote, and other options.\n"));
      }
      await fixCommand(path, { config: options.config });
    } else {
      await scanCommand(path, options);
    }
  }));

// ─── Lint ────────────────────────────────────────────────────────────────────

program
  .command("lint")
  .argument("[path]", "Path to agent manifest or project directory")
  .description("Lint only the instructions of an agent configuration")
  .option("--fix", "Auto-fix applicable issues")
  .option("--remote", "Fetch agent from tenant instead of local file")
  .option("--id <package-id>", "Remote agent package ID (with --remote)")
  .option("--all", "Lint all agents from tenant (with --remote)")
  .option("--config <path>", "Path to .caltrc.json")
  .option("--format <type>", "Output format: terminal, json, markdown", "terminal")
  .option("--client-id <id>", "Custom Entra App client ID")
  .option("--tenant <tenant-id>", "Specific tenant ID")
  .addOption(
    new Option("--type <type>", "Agent type filter")
      .choices(AGENT_TYPE_CHOICES)
      .default("all"),
  )
  .option("--org-url <url>", "Dataverse organization URL")
  .action(withErrorHandler(async (path, options) => {
    if (options.fix) {
      if (options.format !== "terminal" || options.remote || options.all || options.id) {
        console.error(chalk.yellow("Note: --fix mode ignores --format, --remote, and other options.\n"));
      }
      await fixCommand(path, { config: options.config });
    } else {
      await lintCommand(path, options);
    }
  }));

// ─── Validate ────────────────────────────────────────────────────────────────

program
  .command("validate")
  .argument("[path]", "Path to agent manifest or project directory")
  .description("Validate agent manifest against official JSON Schema")
  .option("--config <path>", "Path to .caltrc.json")
  .option("--format <type>", "Output format: terminal, json, markdown", "terminal")
  .option("--verbose", "Show detailed output")
  .action(withErrorHandler(async (path, options) => {
    await validateCommand(path, options);
  }));

// ─── Setup ───────────────────────────────────────────────────────────────────

program
  .command("setup")
  .description("Create .caltrc.json, register an Entra ID app, and discover Power Platform environments")
  .option("--app-name <name>", "Display name for the app registration", "CALT")
  .option("--login", "Run 'calt login' immediately after setup")
  .option("--force", "Overwrite existing .caltrc.json config file")
  .action(withErrorHandler(async (options) => {
    await setupCommand(options);
  }));

// ─── Report ──────────────────────────────────────────────────────────────────

program
  .command("report")
  .argument("[path]", "Path to agent manifest or project directory")
  .description("Generate a report in json, markdown, or html format")
  .requiredOption("--format <type>", "Report format: json, markdown, html")
  .option("--output <file>", "Save report to file instead of stdout")
  .option("--remote", "Fetch agent from tenant instead of local file")
  .option("--id <package-id>", "Remote agent package ID (with --remote)")
  .option("--all", "Report on all agents from tenant (with --remote)")
  .option("--config <path>", "Path to .caltrc.json")
  .option("--client-id <id>", "Custom Entra App client ID")
  .option("--tenant <tenant-id>", "Specific tenant ID")
  .addOption(
    new Option("--type <type>", "Agent type filter")
      .choices(AGENT_TYPE_CHOICES)
      .default("all"),
  )
  .option("--org-url <url>", "Dataverse organization URL")
  .action(withErrorHandler(async (path, options) => {
    await reportCommand(path, options);
  }));

// ─── Diff ───────────────────────────────────────────────────────────────────

program
  .command("diff")
  .argument("<source1>", "First agent (file path or remote ID)")
  .argument("<source2>", "Second agent (file path or remote ID)")
  .description("Compare two agent configurations side by side")
  .option("--format <type>", "Output format: terminal, json, markdown", "terminal")
  .option("--config <path>", "Path to .caltrc.json")
  .option("--client-id <id>", "Entra App client ID")
  .option("--tenant <id>", "Tenant ID")
  .option("--org-url <url>", "Dataverse org URL")
  .action(withErrorHandler(async (source1, source2, options) => {
    await diffCommand(source1, source2, options);
  }));

// ─── Init ───────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Create a .caltrc.json config file in the current directory")
  .option("--force", "Overwrite existing config file")
  .action(withErrorHandler(async (options) => {
    await initCommand(options);
  }));

// ─── Fix ────────────────────────────────────────────────────────────────────

program
  .command("fix")
  .argument("[path]", "Path to agent manifest or project directory")
  .description("Auto-fix applicable issues in agent configuration")
  .option("--config <path>", "Path to .caltrc.json")
  .option("--dry-run", "Show what would change without modifying files")
  .action(withErrorHandler(async (path, options) => {
    await fixCommand(path, options);
  }));

program.parse();
