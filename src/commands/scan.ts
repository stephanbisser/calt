import { loadConfig } from "../core/config-loader.js";
import { runFullScan } from "../rules/rule-engine.js";
import { formatScanReport } from "../formatters/terminal-formatter.js";
import { formatAsJson } from "../formatters/json-formatter.js";
import { formatAsMarkdown } from "../formatters/markdown-formatter.js";
import { resolveAgents, type RemoteOptions } from "./shared/resolve-agents.js";
import type { ReportFormat, ScanReport } from "../core/types.js";

export async function scanCommand(
  pathOrUndefined: string | undefined,
  options: RemoteOptions & {
    config?: string;
    format?: ReportFormat;
    verbose?: boolean;
  },
): Promise<number | void> {
  const cfg = await loadConfig(options.config);
  const format = options.format ?? "terminal";

  const agents = await resolveAgents(pathOrUndefined, options, cfg);

  const reports: ScanReport[] = [];
  for (const agent of agents) {
    reports.push(await runFullScan(agent, cfg));
  }

  outputReports(reports, format, options.verbose ?? false);

  if (reports.some((r) => r.summary.errors > 0)) return 1;
}

function outputReports(
  reports: ScanReport[],
  format: ReportFormat,
  verbose: boolean,
): void {
  for (const report of reports) {
    switch (format) {
      case "json":
        console.log(formatAsJson(report));
        break;
      case "markdown":
        console.log(formatAsMarkdown(report));
        break;
      case "terminal":
      default:
        console.log(formatScanReport(report, verbose));
        break;
    }
  }
}
