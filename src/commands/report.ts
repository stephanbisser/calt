import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import { loadConfig } from "../core/config-loader.js";
import { runFullScan } from "../rules/rule-engine.js";
import { formatAsJson, formatMultipleAsJson } from "../formatters/json-formatter.js";
import { formatAsMarkdown, formatMultipleAsMarkdown } from "../formatters/markdown-formatter.js";
import { formatAsHtml } from "../formatters/html-formatter.js";
import { formatAsSarif, formatMultipleAsSarif } from "../formatters/sarif-formatter.js";
import { resolveAgents, type RemoteOptions } from "./shared/resolve-agents.js";
import type { ReportFormat, ScanReport } from "../core/types.js";

export async function reportCommand(
  pathOrUndefined: string | undefined,
  options: RemoteOptions & {
    format: ReportFormat;
    output?: string;
    config?: string;
  },
): Promise<void> {
  const cfg = await loadConfig(options.config);

  const agents = await resolveAgents(pathOrUndefined, options, cfg);

  const reports: ScanReport[] = [];
  for (const agent of agents) {
    reports.push(await runFullScan(agent, cfg));
  }

  const formatted = formatReports(reports, options.format);

  if (options.output) {
    await writeFile(options.output, formatted);
    console.log(chalk.green(`\n✓ Report saved to ${options.output}\n`));
  } else {
    console.log(formatted);
  }
}

function formatReports(reports: ScanReport[], format: ReportFormat): string {
  if (reports.length === 1) {
    switch (format) {
      case "json":
        return formatAsJson(reports[0]);
      case "markdown":
        return formatAsMarkdown(reports[0]);
      case "html":
        return formatAsHtml(reports[0]);
      case "sarif":
        return formatAsSarif(reports[0]);
      default:
        return formatAsJson(reports[0]);
    }
  }

  switch (format) {
    case "json":
      return formatMultipleAsJson(reports);
    case "markdown":
      return formatMultipleAsMarkdown(reports);
    case "html":
      // For multiple reports, concatenate HTML
      return reports.map((r) => formatAsHtml(r)).join("\n\n");
    case "sarif":
      return formatMultipleAsSarif(reports);
    default:
      return formatMultipleAsJson(reports);
  }
}
