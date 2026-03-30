import { createRequire } from "node:module";
import type { ScanReport, RuleResult, Severity } from "../core/types.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

interface SarifLevel {
  level: "error" | "warning" | "note";
}

function mapSeverity(severity: Severity): SarifLevel["level"] {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
      return "note";
  }
}

function getArtifactUri(report: ScanReport): string {
  if (report.agent.source.type === "local") {
    return report.agent.source.filePath;
  }
  if (report.agent.source.type === "remote") {
    return report.agent.source.packageId;
  }
  return report.agent.source.botId;
}

function collectAllResults(report: ScanReport): RuleResult[] {
  return report.categories.flatMap((cat) => cat.results.filter((r) => !r.passed));
}

function buildRuleDefinitions(results: RuleResult[]) {
  const seen = new Map<string, RuleResult>();
  for (const r of results) {
    if (!seen.has(r.ruleId)) {
      seen.set(r.ruleId, r);
    }
  }
  return [...seen.values()].map((r) => ({
    id: r.ruleId,
    name: r.ruleName,
    shortDescription: { text: r.message },
    defaultConfiguration: { level: mapSeverity(r.severity) },
    helpUri: `https://github.com/stephanbisser/calt#lint-rules-reference`,
  }));
}

function buildSarifResults(report: ScanReport) {
  const uri = getArtifactUri(report);
  const failedResults = collectAllResults(report);

  return failedResults.map((r) => {
    const location: Record<string, unknown> = {
      artifactLocation: { uri },
    };
    if (r.line != null) {
      location.region = { startLine: r.line };
    }
    return {
      ruleId: r.ruleId,
      level: mapSeverity(r.severity),
      message: { text: r.details ?? r.message },
      locations: [{ physicalLocation: location }],
    };
  });
}

function buildSarifObject(reports: ScanReport[]) {
  const allResults = reports.flatMap((r) => buildSarifResults(r));
  const allFailed = reports.flatMap((r) => collectAllResults(r));
  const rules = buildRuleDefinitions(allFailed);

  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "calt",
            version: pkg.version,
            informationUri: "https://github.com/stephanbisser/calt",
            rules,
          },
        },
        results: allResults,
      },
    ],
  };
}

export function formatAsSarif(report: ScanReport): string {
  return JSON.stringify(buildSarifObject([report]), null, 2);
}

export function formatMultipleAsSarif(reports: ScanReport[]): string {
  return JSON.stringify(buildSarifObject(reports), null, 2);
}
