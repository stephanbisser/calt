import * as vscode from "vscode";

class CaltHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    const diags = vscode.languages.getDiagnostics(document.uri).filter((d) => d.source === "CALT");
    const hit = diags.find((d) => d.range.contains(position));
    if (!hit) return undefined;

    const ruleId =
      typeof hit.code === "object" ? (hit.code as { value?: string }).value : hit.code;
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.appendMarkdown(`**CALT · ${ruleId ?? "rule"}**\n\n`);
    md.appendMarkdown(`${hit.message}\n\n`);
    md.appendMarkdown(
      `[Open output](command:calt.showOutput) · [Re-scan](command:calt.scan)`,
    );
    if (typeof hit.code === "object") {
      const target = (hit.code as { target?: vscode.Uri }).target;
      if (target) md.appendMarkdown(` · [Rule docs](${target.toString()})`);
    }
    return new vscode.Hover(md, hit.range);
  }
}

export function registerHoverProvider(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = [
    { language: "json", scheme: "file" },
    { language: "jsonc", scheme: "file" },
  ];
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new CaltHoverProvider()),
  );
}
