import * as vscode from "vscode";
import { selectModel, collectReply, formatLmError } from "./lm.js";
import { getOutput } from "./output.js";
import type { LoadedAgent, RuleResult, ScanReport } from "calt-cli";

const COMMAND_ID = "calt.fixWithCopilot";

/**
 * Rule prefixes for which an AI-driven instruction rewrite is meaningful.
 * Schema/actions/starters rules have deterministic fixes already, or need
 * structural changes that a freeform LM call can't reliably produce.
 */
const AI_RULE_PREFIXES = ["INST-", "SEC-PI-", "SEC-LEAK-", "SEC-INFO-", "SEC-AGENCY-", "SEC-GROUND-"];

export function isAiFixable(result: RuleResult): boolean {
  if (result.passed) return false;
  if (result.fix) return false; // deterministic fix already exists
  return AI_RULE_PREFIXES.some((p) => result.ruleId.startsWith(p));
}

export function registerAiFix(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_ID, async (uriString: string, ruleId: string) => {
      const out = getOutput();
      try {
        const uri = vscode.Uri.parse(uriString);
        const doc = await vscode.workspace.openTextDocument(uri);
        const cwd = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;

        const { loadConfig, loadFromFile, runFullScan } = await import("calt-cli");
        const config = await loadConfig(cwd);
        const agents = await loadFromFile(uri.fsPath);
        if (agents.length === 0) {
          void vscode.window.showErrorMessage("CALT: no agent in this file.");
          return;
        }
        const agent = agents[0];
        const report = await runFullScan(agent, config);
        const finding = report.categories
          .flatMap((c) => c.results)
          .find((r) => r.ruleId === ruleId && !r.passed);
        if (!finding) {
          void vscode.window.showInformationMessage(`CALT: \`${ruleId}\` no longer fails.`);
          return;
        }

        const model = await selectModel();
        if (!model) {
          void vscode.window.showWarningMessage(
            "CALT: GitHub Copilot is required for AI auto-fixes. Sign in and try again.",
          );
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `CALT: fixing ${ruleId} with Copilot…`,
            cancellable: true,
          },
          async (_progress, token) => {
            const fixed = await rewriteInstructions(model, agent, finding, token);
            if (token.isCancellationRequested || !fixed) return;

            const newManifest = { ...agent.manifest, instructions: fixed };
            const newJson = JSON.stringify(newManifest, null, 2) + "\n";

            // Re-validate before writing — refuse to apply if the new text
            // still fails the same rule (and would just yo-yo).
            const verifyAgent: LoadedAgent = { ...agent, manifest: newManifest };
            const verify = await runFullScan(verifyAgent, config);
            const stillFails = verify.categories
              .flatMap((c) => c.results)
              .some((r) => r.ruleId === ruleId && !r.passed);
            if (stillFails) {
              const choice = await vscode.window.showWarningMessage(
                `CALT: AI fix did not resolve ${ruleId}. Apply anyway?`,
                "Apply",
                "Cancel",
              );
              if (choice !== "Apply") return;
            }

            const edit = new vscode.WorkspaceEdit();
            const range = new vscode.Range(
              doc.positionAt(0),
              doc.positionAt(doc.getText().length),
            );
            edit.replace(uri, range, newJson);
            await vscode.workspace.applyEdit(edit);

            const delta = summarizeDelta(report, verify);
            void vscode.window.showInformationMessage(`CALT: applied AI fix for ${ruleId}. ${delta}`);
            out.appendLine(`[CALT] AI fix ${ruleId}: ${delta}`);
          },
        );
      } catch (err) {
        out.appendLine(`[CALT] AI fix failed: ${formatLmError(err)}`);
        void vscode.window.showErrorMessage(`CALT: AI fix failed — ${formatLmError(err)}`);
      }
    }),
  );
}

async function rewriteInstructions(
  model: vscode.LanguageModelChat,
  agent: LoadedAgent,
  finding: RuleResult,
  token: vscode.CancellationToken,
): Promise<string | undefined> {
  const reply = await collectReply(model, {
    systemPrompt: SYSTEM_AI_FIX,
    userPrompt: [
      `Agent: ${agent.manifest.name}`,
      `Description: ${agent.manifest.description}`,
      "",
      `Failing CALT rule: ${finding.ruleId}`,
      `Rule message: ${finding.message}`,
      finding.details ? `Rule details: ${finding.details}` : "",
      "",
      "Current instructions:",
      agent.manifest.instructions,
      "",
      "Return ONLY the revised instructions text — no markdown fences, no preamble, no commentary.",
    ]
      .filter(Boolean)
      .join("\n"),
    token,
  });
  // Strip accidental markdown code fences.
  const stripped = reply.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
  return stripped.length > 0 ? stripped : undefined;
}

function summarizeDelta(before: ScanReport, after: ScanReport): string {
  const dE = after.summary.errors - before.summary.errors;
  const dW = after.summary.warnings - before.summary.warnings;
  const fmt = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
  return `Errors ${fmt(dE)}, warnings ${fmt(dW)}.`;
}

export function buildAiFixAction(
  document: vscode.TextDocument,
  diag: vscode.Diagnostic,
  ruleId: string,
): vscode.CodeAction {
  const action = new vscode.CodeAction(
    `CALT: Fix ${ruleId} with Copilot`,
    vscode.CodeActionKind.QuickFix,
  );
  action.command = {
    command: COMMAND_ID,
    title: "Fix with Copilot",
    arguments: [document.uri.toString(), ruleId],
  };
  action.diagnostics = [diag];
  return action;
}

const SYSTEM_AI_FIX = `You are CALT, a quality assistant for Microsoft 365 Copilot Agent manifests. The user's manifest violates a specific CALT rule. Rewrite the agent's "instructions" field so the rule no longer fails — preserve the agent's role, scope, and tone; only change what's required to pass the rule. Keep the result between 500 and 4000 characters. Output plain text only, no markdown.`;
