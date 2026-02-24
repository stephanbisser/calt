import type { ScanReport, DiffReport } from "../core/types.js";

export function formatAsJson(report: ScanReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatMultipleAsJson(reports: ScanReport[]): string {
  return JSON.stringify({ reports, generatedAt: new Date().toISOString() }, null, 2);
}

export function formatDiffAsJson(report: DiffReport): string {
  return JSON.stringify(report, null, 2);
}
