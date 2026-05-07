import * as vscode from "vscode";
import type { DiagnosticsState } from "./diagnostics.js";
import type { ScanReport } from "calt-cli";

const SEVERITY_WEIGHTS = { error: 2, warning: 1, info: 0.5 } as const;

export function activateStatusBar(
  context: vscode.ExtensionContext,
  state: DiagnosticsState,
): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "calt.showOutput";
  context.subscriptions.push(item);

  const refresh = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      item.hide();
      return;
    }
    const report = state.reports.get(editor.document.uri.toString());
    if (!report) {
      item.hide();
      return;
    }
    const score = computeScore(report);
    item.text = `$(check) CALT ${score}/100`;
    item.tooltip = buildTooltip(report, score);
    item.color = colorFor(score);
    item.show();
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(refresh),
    state.onDidUpdate(refresh),
  );
  refresh();
}

export function computeScore(report: ScanReport): number {
  const flat = report.categories.flatMap((c) => c.results);
  if (flat.length === 0) return 100;
  let total = 0;
  let lost = 0;
  for (const r of flat) {
    const w = SEVERITY_WEIGHTS[r.severity];
    total += w;
    if (!r.passed) lost += w;
  }
  if (total === 0) return 100;
  return Math.max(0, Math.round(((total - lost) / total) * 100));
}

function colorFor(score: number): vscode.ThemeColor | undefined {
  if (score < 60) return new vscode.ThemeColor("statusBarItem.errorBackground");
  if (score < 85) return new vscode.ThemeColor("statusBarItem.warningBackground");
  return undefined;
}

function buildTooltip(report: ScanReport, score: number): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.appendMarkdown(`**CALT health: ${score}/100**\n\n`);
  md.appendMarkdown(`Agent: \`${report.agent.name}\`\n\n`);
  md.appendMarkdown(
    `${report.summary.errors} errors · ${report.summary.warnings} warnings · ${report.summary.infos} info\n\n`,
  );
  md.appendMarkdown(`[Show CALT output](command:calt.showOutput)`);
  return md;
}
