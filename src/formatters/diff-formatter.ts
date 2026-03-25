import chalk from "chalk";
import type { DiffReport, DiffSection, DiffDetail } from "../core/types.js";

export function formatDiff(report: DiffReport): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(chalk.bold.cyan("CALT Diff Report"));
  lines.push(chalk.cyan("================="));
  lines.push("");
  lines.push(`${chalk.gray("Agent A:")} ${chalk.bold(report.agentA.name)} ${chalk.gray(formatSource(report.agentA.source))}`);
  lines.push(`${chalk.gray("Agent B:")} ${chalk.bold(report.agentB.name)} ${chalk.gray(formatSource(report.agentB.source))}`);
  lines.push("");

  if (report.sections.length === 0) {
    lines.push(chalk.green("  No differences found. Agents are identical."));
    lines.push("");
    return lines.join("\n");
  }

  for (const section of report.sections) {
    lines.push(formatSection(section));
    lines.push("");
  }

  // Summary
  const s = report.summary;
  const parts: string[] = [`${s.totalChanges} changes`];
  if (s.additions > 0) parts.push(chalk.green(`+${s.additions} additions`));
  if (s.removals > 0) parts.push(chalk.red(`-${s.removals} removals`));
  if (s.modifications > 0) parts.push(chalk.yellow(`~${s.modifications} modifications`));

  lines.push(chalk.bold(`Summary: ${parts.join(" | ")}`));

  return lines.join("\n");
}

function formatSection(section: DiffSection): string {
  const lines: string[] = [];

  const icon = section.changeType === "added"
    ? chalk.green("+")
    : section.changeType === "removed"
      ? chalk.red("-")
      : section.changeType === "modified"
        ? chalk.yellow("~")
        : chalk.gray("=");

  lines.push(`${icon} ${chalk.bold(section.name)}`);

  for (const detail of section.details) {
    lines.push(formatDetail(detail));
  }

  return lines.join("\n");
}

function formatDetail(detail: DiffDetail): string {
  switch (detail.changeType) {
    case "added":
      return `  ${chalk.green("+")} ${chalk.green(detail.field)}: ${chalk.green(truncateValue(detail.valueB ?? ""))}`;
    case "removed":
      return `  ${chalk.red("-")} ${chalk.red(detail.field)}: ${chalk.red(truncateValue(detail.valueA ?? ""))}`;
    case "modified":
      return `  ${chalk.yellow("~")} ${chalk.yellow(detail.field)}:\n` +
        `      ${chalk.red("- " + truncateValue(detail.valueA ?? ""))}\n` +
        `      ${chalk.green("+ " + truncateValue(detail.valueB ?? ""))}`;
    case "unchanged":
      return `  ${chalk.gray("=")} ${chalk.gray(detail.field)}`;
  }
}

function truncateValue(value: string): string {
  if (value.length <= 120) return value;
  return value.slice(0, 117) + "...";
}

function formatSource(source: { type: string; [key: string]: unknown }): string {
  if (source.type === "local") {
    return `(local: ${source.filePath})`;
  } else if (source.type === "remote") {
    return `(remote: ${source.packageId})`;
  } else if (source.type === "remote-dataverse") {
    return `(dataverse: ${source.botId})`;
  }
  return `(${source.type})`;
}
