import { loadConfig } from "../core/config-loader.js";
import { diffManifests } from "../core/differ.js";
import { formatDiff } from "../formatters/diff-formatter.js";
import { formatDiffAsJson } from "../formatters/json-formatter.js";
import { formatDiffAsMarkdown } from "../formatters/markdown-formatter.js";
import { resolveAuth, resolveSource } from "./shared/resolve-agents.js";
import type { DiffReport } from "../core/types.js";

type DiffFormat = "terminal" | "json" | "markdown";

export async function diffCommand(
  source1: string,
  source2: string,
  options: {
    format?: DiffFormat;
    config?: string;
    clientId?: string;
    tenant?: string;
    orgUrl?: string;
  },
): Promise<void> {
  const cfg = await loadConfig(options.config);
  const format: DiffFormat = options.format ?? "terminal";

  const { authConfig, orgUrls } = resolveAuth(options, cfg);

  const [agentA, agentB] = await Promise.all([
    resolveSource(source1, authConfig, orgUrls),
    resolveSource(source2, authConfig, orgUrls),
  ]);

  const report = diffManifests(
    { manifest: agentA.manifest, name: agentA.manifest.name, source: agentA.source },
    { manifest: agentB.manifest, name: agentB.manifest.name, source: agentB.source },
  );

  outputDiff(report, format);
}

function outputDiff(report: DiffReport, format: DiffFormat): void {
  switch (format) {
    case "json":
      console.log(formatDiffAsJson(report));
      break;
    case "markdown":
      console.log(formatDiffAsMarkdown(report));
      break;
    case "terminal":
    default:
      console.log(formatDiff(report));
      break;
  }
}
