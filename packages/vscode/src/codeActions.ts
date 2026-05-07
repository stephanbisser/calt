import * as vscode from "vscode";

class CaltCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): Promise<vscode.CodeAction[]> {
    const caltDiagnostics = context.diagnostics.filter((d) => d.source === "CALT");
    if (caltDiagnostics.length === 0) return [];

    const { loadConfig, loadFromFile, runFullScan, applyFixes } = await import("calt-cli");
    try {
      const cwd = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
      const config = await loadConfig(cwd);
      const agents = await loadFromFile(document.uri.fsPath);
      if (agents.length === 0) return [];
      const agent = agents[0];
      const report = await runFullScan(agent, config);
      const flat = report.categories.flatMap((c) => c.results);
      const fixable = flat.filter((r) => !r.passed && r.fix);
      if (fixable.length === 0) return [];

      const actions: vscode.CodeAction[] = [];

      // Per-finding fix.
      for (const r of fixable) {
        const matchingDiag = caltDiagnostics.find(
          (d) => typeof d.code === "object" && (d.code as { value?: string }).value === r.ruleId,
        );
        if (!matchingDiag) continue;
        const fixed = applyFixes(agent.manifest, [r]);
        if (fixed.applied.length === 0) continue;
        const action = new vscode.CodeAction(
          `CALT: Fix ${r.ruleId} — ${shorten(r.message)}`,
          vscode.CodeActionKind.QuickFix,
        );
        action.diagnostics = [matchingDiag];
        action.edit = buildWorkspaceEdit(document, fixed.manifest);
        action.isPreferred = true;
        actions.push(action);
      }

      // "Fix all" action when ≥ 2 fixable findings exist.
      if (fixable.length >= 2) {
        const fixed = applyFixes(agent.manifest, fixable);
        if (fixed.applied.length > 0) {
          const action = new vscode.CodeAction(
            `CALT: Fix all (${fixed.applied.length} fixes)`,
            vscode.CodeActionKind.QuickFix,
          );
          action.diagnostics = caltDiagnostics;
          action.edit = buildWorkspaceEdit(document, fixed.manifest);
          actions.push(action);
        }
      }

      return actions;
    } catch {
      return [];
    }
  }
}

function buildWorkspaceEdit(
  document: vscode.TextDocument,
  manifest: object,
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  edit.replace(document.uri, fullRange, JSON.stringify(manifest, null, 2) + "\n");
  return edit;
}

function shorten(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function registerCodeActions(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = [
    { language: "json", scheme: "file" },
    { language: "jsonc", scheme: "file" },
  ];
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(selector, new CaltCodeActionProvider(), {
      providedCodeActionKinds: CaltCodeActionProvider.providedCodeActionKinds,
    }),
  );
}
