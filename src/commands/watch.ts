import { watch, type FSWatcher } from "node:fs";
import { resolve, dirname } from "node:path";
import chalk from "chalk";
import { loadConfig } from "../core/config-loader.js";
import { runFullScan } from "../rules/rule-engine.js";
import { formatScanReport } from "../formatters/terminal-formatter.js";
import { formatAsJson } from "../formatters/json-formatter.js";
import { formatAsMarkdown } from "../formatters/markdown-formatter.js";
import { formatAsSarif } from "../formatters/sarif-formatter.js";
import { resolveAgents, type RemoteOptions } from "./shared/resolve-agents.js";
import type { ReportFormat, ScanReport } from "../core/types.js";

export interface WatchOptions extends RemoteOptions {
  config?: string;
  format?: ReportFormat;
  verbose?: boolean;
}

async function runScan(target: string | undefined, options: WatchOptions): Promise<void> {
  const cfg = await loadConfig(options.config);
  const format = options.format ?? "terminal";
  const verbose = options.verbose ?? false;

  const agents = await resolveAgents(target, options, cfg);

  const reports: ScanReport[] = [];
  for (const agent of agents) {
    reports.push(await runFullScan(agent, cfg));
  }

  for (const report of reports) {
    switch (format) {
      case "json":
        console.log(formatAsJson(report));
        break;
      case "markdown":
        console.log(formatAsMarkdown(report));
        break;
      case "sarif":
        console.log(formatAsSarif(report));
        break;
      case "terminal":
      default:
        console.log(formatScanReport(report, verbose));
        break;
    }
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

export async function watchCommand(
  target: string | undefined,
  options: WatchOptions,
): Promise<void> {
  const resolvedPath = resolve(target ?? ".");

  await runScan(target, options);

  console.log(chalk.cyan("\n👀 Watching for changes... (Ctrl+C to stop)\n"));

  const watchPath = resolvedPath;
  let watcher: FSWatcher;

  try {
    watcher = watch(
      watchPath,
      { recursive: true },
      debounce(async () => {
        console.clear();
        try {
          await runScan(target, options);
        } catch (err) {
          console.error(
            chalk.red(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`),
          );
        }
        console.log(chalk.cyan("\n👀 Watching for changes... (Ctrl+C to stop)\n"));
      }, 300),
    );
  } catch {
    // If recursive watch is not supported, watch the directory of the target
    watcher = watch(
      dirname(watchPath),
      debounce(async () => {
        console.clear();
        try {
          await runScan(target, options);
        } catch (err) {
          console.error(
            chalk.red(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`),
          );
        }
        console.log(chalk.cyan("\n👀 Watching for changes... (Ctrl+C to stop)\n"));
      }, 300),
    );
  }

  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}
