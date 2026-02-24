import { loadConfig } from "../core/config-loader.js";
import { loadFromFile } from "../core/manifest-loader.js";
import { runSchemaValidation } from "../rules/rule-engine.js";
import { formatScanReport } from "../formatters/terminal-formatter.js";
import { formatAsJson } from "../formatters/json-formatter.js";
import { formatAsMarkdown } from "../formatters/markdown-formatter.js";
import type { ReportFormat } from "../core/types.js";

export async function validateCommand(
  pathOrUndefined: string | undefined,
  options: {
    config?: string;
    format?: ReportFormat;
    verbose?: boolean;
  },
): Promise<number | void> {
  const path = pathOrUndefined ?? ".";
  const cfg = await loadConfig(options.config);
  const format = options.format ?? "terminal";

  const agents = await loadFromFile(path);
  let hasErrors = false;

  for (const agent of agents) {
    const report = runSchemaValidation(agent, cfg);

    switch (format) {
      case "json":
        console.log(formatAsJson(report));
        break;
      case "markdown":
        console.log(formatAsMarkdown(report));
        break;
      case "terminal":
      default:
        console.log(formatScanReport(report, options.verbose ?? false));
        break;
    }

    if (report.summary.errors > 0) hasErrors = true;
  }

  if (hasErrors) return 1;
}
