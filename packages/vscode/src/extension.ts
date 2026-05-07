import * as vscode from "vscode";
import { activateDiagnostics } from "./diagnostics.js";
import { registerCodeActions } from "./codeActions.js";
import { registerHoverProvider } from "./hover.js";
import { activateStatusBar } from "./statusBar.js";
import { registerInitConfigCommand } from "./initConfigWizard.js";
import { registerCiWorkflowCommand } from "./ciWorkflow.js";
import { registerTaskProvider } from "./taskProvider.js";
import { registerScanCommands } from "./scanCommands.js";
import { autoDetectProject } from "./autoDetect.js";
import { registerAiFix } from "./aiFix.js";
import { registerChatParticipant, registerApplyStartersCommand } from "./chatParticipant.js";
import { getOutput } from "./output.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const out = getOutput();
  out.appendLine(`[CALT] Activating extension v${context.extension.packageJSON.version}…`);

  const diag = activateDiagnostics(context);
  registerCodeActions(context);
  registerHoverProvider(context);
  activateStatusBar(context, diag);
  registerInitConfigCommand(context);
  registerCiWorkflowCommand(context);
  registerTaskProvider(context);
  registerScanCommands(context, diag);
  registerAiFix(context);
  registerApplyStartersCommand(context);
  registerChatParticipant(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("calt.showOutput", () => out.show(true)),
    vscode.commands.registerCommand("calt.showVersion", () => {
      const v = context.extension.packageJSON.version;
      void vscode.window.showInformationMessage(`CALT VS Code Extension v${v}`);
    }),
  );

  await autoDetectProject(context);
  out.appendLine("[CALT] Activation complete.");
}

export function deactivate(): void {
  // Disposables are tracked on context.subscriptions and cleaned up by VS Code.
}
