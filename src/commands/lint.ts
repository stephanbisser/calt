import { loadConfig } from "../core/config-loader.js";
import { runInstructionLint } from "../rules/rule-engine.js";
import { formatLintReport } from "../formatters/terminal-formatter.js";
import { formatAsJson } from "../formatters/json-formatter.js";
import { formatAsMarkdown } from "../formatters/markdown-formatter.js";
import { resolveAgents, type RemoteOptions } from "./shared/resolve-agents.js";
import type { ReportFormat, ScanReport } from "../core/types.js";

export async function lintCommand(
  pathOrUndefined: string | undefined,
  options: RemoteOptions & {
    config?: string;
    format?: ReportFormat;
  },
): Promise<number | void> {
  const cfg = await loadConfig(options.config);
  const format = options.format ?? "terminal";

  const agents = await resolveAgents(pathOrUndefined, options, cfg);
  const reports: ScanReport[] = agents.map((a) => runInstructionLint(a, cfg));

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
        console.log(formatLintReport(report));
        break;
    }
  }

  if (reports.some((r) => r.summary.errors > 0)) return 1;
}
