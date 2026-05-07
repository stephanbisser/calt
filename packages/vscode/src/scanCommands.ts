import * as vscode from "vscode";
import * as path from "node:path";
import { isCaltCandidate, reportToDiagnostics, type DiagnosticsState } from "./diagnostics.js";
import { getOutput } from "./output.js";

export function registerScanCommands(
  context: vscode.ExtensionContext,
  state: DiagnosticsState,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("calt.scan", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage("CALT: no active editor.");
        return;
      }
      if (!isCaltCandidate(editor.document)) {
        void vscode.window.showWarningMessage(
          "CALT: the active file does not look like a Copilot Agent manifest.",
        );
        return;
      }
      await scanOne(editor.document, state);
    }),
    vscode.commands.registerCommand("calt.scanWorkspace", async () => {
      await scanWorkspace(state);
    }),
  );
}

async function scanOne(doc: vscode.TextDocument, state: DiagnosticsState): Promise<void> {
  const out = getOutput();
  const { loadConfig, loadFromFile, runFullScan } = await import("calt-cli");
  try {
    const cwd = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath;
    const config = await loadConfig(cwd);
    const agents = await loadFromFile(doc.uri.fsPath);
    if (agents.length === 0) {
      void vscode.window.showInformationMessage("CALT: no agent manifest found in this file.");
      return;
    }
    const report = await runFullScan(agents[0], config);
    state.reports.set(doc.uri.toString(), report);
    state.collection.set(doc.uri, reportToDiagnostics(doc, report));
    out.appendLine(
      `[CALT] ${vscode.workspace.asRelativePath(doc.uri)} → ${report.summary.errors}E ${report.summary.warnings}W ${report.summary.infos}I`,
    );
    out.show(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`CALT scan failed: ${msg}`);
    out.appendLine(`[CALT] ERROR: ${msg}`);
  }
}

async function scanWorkspace(state: DiagnosticsState): Promise<void> {
  const out = getOutput();
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showWarningMessage("CALT: open a folder first.");
    return;
  }

  const { loadConfig, detectProject, loadFromFile, runFullScan } = await import("calt-cli");

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "CALT: scanning workspace…" },
    async (progress) => {
      let total = 0;
      let totalErrors = 0;
      let totalWarnings = 0;
      for (const folder of folders) {
        const cwd = folder.uri.fsPath;
        progress.report({ message: folder.name });
        const detected = await detectProject(cwd);
        const config = await loadConfig(cwd);
        const manifestFiles = await collectManifestFiles(cwd, detected.manifestPaths ?? []);
        for (const file of manifestFiles) {
          total++;
          try {
            const agents = await loadFromFile(file);
            for (const agent of agents) {
              const report = await runFullScan(agent, config);
              totalErrors += report.summary.errors;
              totalWarnings += report.summary.warnings;
              const uri = vscode.Uri.file(file);
              state.reports.set(uri.toString(), report);
              try {
                const doc = await vscode.workspace.openTextDocument(uri);
                state.collection.set(uri, reportToDiagnostics(doc, report));
              } catch {
                // Document may not be openable as text — skip.
              }
              out.appendLine(
                `[CALT] ${path.relative(cwd, file)} (${agent.manifest.name}): ${report.summary.errors}E ${report.summary.warnings}W`,
              );
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            out.appendLine(`[CALT] ${path.relative(cwd, file)}: ERROR ${msg}`);
          }
        }
      }
      out.appendLine(
        `[CALT] Workspace scan complete: ${total} files, ${totalErrors} errors, ${totalWarnings} warnings`,
      );
      out.show(true);
    },
  );
}

async function collectManifestFiles(cwd: string, hint: string[]): Promise<string[]> {
  if (hint.length > 0) return hint;
  // Fallback: use VS Code's built-in glob for relevant filenames.
  const found = await vscode.workspace.findFiles(
    new vscode.RelativePattern(
      cwd,
      "{**/declarativeAgent*.json,**/declarative-agent*.json,**/appPackage/**/manifest.json}",
    ),
    "**/node_modules/**",
    200,
  );
  return found.map((u) => u.fsPath);
}
