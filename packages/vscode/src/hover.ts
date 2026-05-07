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
      typeof hit.code === "object" ? (hit.code as { value?: string }).value : (hit.code as string | undefined);
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.appendMarkdown(`**CALT · ${ruleId ?? "rule"}**\n\n`);
    md.appendMarkdown(`${hit.message}\n\n`);

    const links: string[] = [
      `[Open output](command:calt.showOutput)`,
      `[Re-scan](command:calt.scan)`,
    ];

    if (ruleId && /^SEC-(PI|LEAK|INFO|AGENCY|GROUND|SUPPLY)-/.test(ruleId)) {
      // B6: Prompt-Injection Explainer. Open the chat participant with a
      // pre-populated /explain command — the participant routes to its
      // SYSTEM_EXPLAIN prompt and uses LM if Copilot is available.
      const chatArgs = encodeURIComponent(JSON.stringify({ query: `@calt /explain ${ruleId}` }));
      links.push(`[Why is this risky?](command:workbench.action.chat.open?${chatArgs})`);
    }

    if (ruleId) {
      const aiArgs = encodeURIComponent(JSON.stringify([document.uri.toString(), ruleId]));
      links.push(`[Fix with Copilot](command:calt.fixWithCopilot?${aiArgs})`);
    }

    if (typeof hit.code === "object") {
      const target = (hit.code as { target?: vscode.Uri }).target;
      if (target) links.push(`[Rule docs](${target.toString()})`);
    }

    md.appendMarkdown(links.join(" · "));
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
