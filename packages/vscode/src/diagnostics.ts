import * as vscode from "vscode";
import { rangeForCategory } from "./locator.js";
import { getOutput } from "./output.js";
import type { ScanReport, RuleResult, Severity } from "calt-cli";

export interface DiagnosticsState {
  collection: vscode.DiagnosticCollection;
  reports: Map<string, ScanReport>;
  onDidUpdate: vscode.Event<vscode.Uri>;
}

export function activateDiagnostics(context: vscode.ExtensionContext): DiagnosticsState {
  const collection = vscode.languages.createDiagnosticCollection("calt");
  context.subscriptions.push(collection);

  const reports = new Map<string, ScanReport>();
  const updateEmitter = new vscode.EventEmitter<vscode.Uri>();
  context.subscriptions.push(updateEmitter);

  const debounceMs = (): number => {
    return vscode.workspace.getConfiguration("calt").get<number>("debounceMs", 500);
  };

  const isRunOnType = (): boolean => {
    return vscode.workspace.getConfiguration("calt").get<string>("run", "onSave") === "onType";
  };

  const isEnabled = (): boolean => {
    return vscode.workspace.getConfiguration("calt").get<boolean>("enable", true);
  };

  const debounceTimers = new Map<string, NodeJS.Timeout>();

  const scheduleScan = (doc: vscode.TextDocument, immediate = false): void => {
    if (!isEnabled()) {
      collection.delete(doc.uri);
      return;
    }
    if (!isCaltCandidate(doc)) return;
    const key = doc.uri.toString();
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    const delay = immediate ? 0 : debounceMs();
    const timer = setTimeout(() => {
      debounceTimers.delete(key);
      void scanDocument(doc, collection, reports, updateEmitter);
    }, delay);
    debounceTimers.set(key, timer);
  };

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => scheduleScan(doc, true)),
    vscode.workspace.onDidOpenTextDocument((doc) => scheduleScan(doc, true)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isRunOnType()) scheduleScan(e.document);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
      reports.delete(doc.uri.toString());
      updateEmitter.fire(doc.uri);
    }),
  );

  // Initial scan for already-open editors.
  for (const editor of vscode.window.visibleTextEditors) {
    scheduleScan(editor.document, true);
  }

  return { collection, reports, onDidUpdate: updateEmitter.event };
}

export function isCaltCandidate(doc: vscode.TextDocument): boolean {
  if (doc.languageId !== "json" && doc.languageId !== "jsonc") return false;
  const path = doc.uri.fsPath.toLowerCase();
  // Skip output channels, settings, schemas, node_modules.
  if (doc.uri.scheme !== "file") return false;
  if (path.includes("node_modules")) return false;
  // Heuristic: filename matches a known declarative-agent pattern.
  return (
    /declarativeagent.*\.json$/i.test(path) ||
    /declarative-agent.*\.json$/i.test(path) ||
    path.endsWith("manifest.json") ||
    path.endsWith(".caltrc.json")
  );
}

async function scanDocument(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  reports: Map<string, ScanReport>,
  updateEmitter: vscode.EventEmitter<vscode.Uri>,
): Promise<void> {
  const out = getOutput();
  // Lazy-import calt-cli so activation stays cheap.
  const { loadConfig, loadFromFile, runFullScan } = await import("calt-cli");
  try {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const cwd = workspaceFolder?.uri.fsPath;
    const config = await loadConfig(cwd);
    const agents = await loadFromFile(doc.uri.fsPath);
    if (agents.length === 0) {
      collection.delete(doc.uri);
      reports.delete(doc.uri.toString());
      return;
    }
    // For multi-agent files, use the first agent for in-editor diagnostics.
    const report = await runFullScan(agents[0], config);
    reports.set(doc.uri.toString(), report);
    const diagnostics = reportToDiagnostics(doc, report);
    collection.set(doc.uri, diagnostics);
    updateEmitter.fire(doc.uri);
    out.appendLine(
      `[CALT] Scanned ${vscode.workspace.asRelativePath(doc.uri)}: ${report.summary.errors} errors, ${report.summary.warnings} warnings`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out.appendLine(`[CALT] Scan failed for ${doc.uri.fsPath}: ${msg}`);
    // Don't surface scan failures as diagnostics — they usually indicate a
    // malformed manifest that the JSON language service already flags.
    collection.delete(doc.uri);
    reports.delete(doc.uri.toString());
    updateEmitter.fire(doc.uri);
  }
}

export function reportToDiagnostics(doc: vscode.TextDocument, report: ScanReport): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  for (const cat of report.categories) {
    for (const r of cat.results) {
      if (r.passed) continue;
      const range = rangeFor(doc, cat.category, r);
      const diag = new vscode.Diagnostic(range, r.message, severityFor(r.severity));
      diag.source = "CALT";
      diag.code = {
        value: r.ruleId,
        target: vscode.Uri.parse(`https://github.com/stephanbisser/calt#${r.ruleId.toLowerCase()}`),
      };
      diagnostics.push(diag);
    }
  }
  return diagnostics;
}

function rangeFor(doc: vscode.TextDocument, category: string, result: RuleResult): vscode.Range {
  if (typeof result.line === "number" && result.line >= 0) {
    const line = Math.min(result.line, doc.lineCount - 1);
    const col = result.column ?? 0;
    const start = new vscode.Position(line, col);
    return new vscode.Range(start, start.translate(0, 1));
  }
  return rangeForCategory(doc, category);
}

function severityFor(s: Severity): vscode.DiagnosticSeverity {
  switch (s) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "info":
      return vscode.DiagnosticSeverity.Information;
  }
}
