import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import chalk from "chalk";

export interface AgentsMdCommandOptions {
  install?: boolean;
  path?: boolean;
  output?: string;
  force?: boolean;
}

/**
 * Resolves the path to the AGENTS.md that ships with this install of CALT.
 * In dev/source layout the file lives at the repo root; in a published npm
 * package it's at the package root next to package.json.
 */
export function resolveBundledAgentsMd(): string {
  // Compiled file lives at <pkg>/dist/commands/agents-md.js → up two levels.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "AGENTS.md");
}

export async function readBundledAgentsMd(): Promise<string> {
  const p = resolveBundledAgentsMd();
  return readFile(p, "utf8");
}

export async function agentsMdCommand(options: AgentsMdCommandOptions): Promise<void> {
  if (options.path) {
    console.log(resolveBundledAgentsMd());
    return;
  }

  const contents = await readBundledAgentsMd();

  if (!options.install) {
    process.stdout.write(contents);
    if (!contents.endsWith("\n")) process.stdout.write("\n");
    return;
  }

  const targetPath = options.output ?? join(process.cwd(), "AGENTS.md");
  const exists = await fileExists(targetPath);

  if (exists && !options.force) {
    console.error(
      chalk.yellow(
        `AGENTS.md already exists at ${targetPath}. Re-run with --force to overwrite, or use --output <path> to write elsewhere.`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  await writeFile(targetPath, contents, "utf8");
  console.log(chalk.green(`✓ Wrote ${targetPath}`));
  console.log(
    chalk.dim(
      "Coding agents (Claude Code, Cursor, …) discover this file automatically when working in this repo.",
    ),
  );
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
