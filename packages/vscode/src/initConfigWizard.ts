import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";

interface WizardState {
  profile: "recommended" | "strict" | "security-first";
  schemaTarget: string;
  tenantId?: string;
  clientId?: string;
}

const PROFILES: Record<WizardState["profile"], { description: string }> = {
  recommended: { description: "Sensible defaults — most rules at default severity." },
  strict: { description: "Errors for all warnings and infos. Use for production-ready agents." },
  "security-first": {
    description: "Promotes OWASP LLM rules (SEC-*) to errors. Suitable for compliance-bound projects.",
  },
};

const SCHEMA_TARGETS = ["v1.6", "v1.5", "v1.4", "v1.3"];

export function registerInitConfigCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("calt.initConfig", async () => {
      await runWizard();
    }),
  );
}

async function runWizard(): Promise<void> {
  const folder = await pickWorkspaceFolder();
  if (!folder) return;

  const target = path.join(folder.uri.fsPath, ".caltrc.json");
  try {
    await fs.access(target);
    const choice = await vscode.window.showWarningMessage(
      `.caltrc.json already exists in ${folder.name}. Overwrite?`,
      { modal: true },
      "Overwrite",
      "Cancel",
    );
    if (choice !== "Overwrite") return;
  } catch {
    // File doesn't exist — proceed.
  }

  const profile = await pickProfile();
  if (!profile) return;

  const schemaTarget = await pickSchemaTarget();
  if (!schemaTarget) return;

  const tenantId = await vscode.window.showInputBox({
    prompt: "Optional: Microsoft Entra tenant ID for Graph/Dataverse calls",
    placeHolder: "00000000-0000-0000-0000-000000000000 (leave empty to skip)",
    ignoreFocusOut: true,
  });

  const clientId = tenantId
    ? await vscode.window.showInputBox({
        prompt: "Optional: Entra App (client) ID — leave empty to use the default multi-tenant CALT app",
        placeHolder: "leave empty to use default",
        ignoreFocusOut: true,
      })
    : undefined;

  const state: WizardState = {
    profile,
    schemaTarget,
    tenantId: tenantId || undefined,
    clientId: clientId || undefined,
  };

  await fs.writeFile(target, buildConfigJson(state) + "\n", "utf8");
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc);
  void vscode.window.showInformationMessage(
    `CALT config initialized at ${vscode.workspace.asRelativePath(target)} (profile: ${profile}).`,
  );
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showErrorMessage("CALT: open a folder before running this wizard.");
    return undefined;
  }
  if (folders.length === 1) return folders[0];
  const pick = await vscode.window.showWorkspaceFolderPick({
    placeHolder: "Select the workspace folder for the new .caltrc.json",
  });
  return pick;
}

async function pickProfile(): Promise<WizardState["profile"] | undefined> {
  const items: (vscode.QuickPickItem & { id: WizardState["profile"] })[] = (
    Object.keys(PROFILES) as WizardState["profile"][]
  ).map((id) => ({
    id,
    label: id,
    description: PROFILES[id].description,
  }));
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: "Choose a severity profile",
    ignoreFocusOut: true,
  });
  return pick?.id;
}

async function pickSchemaTarget(): Promise<string | undefined> {
  const pick = await vscode.window.showQuickPick(SCHEMA_TARGETS, {
    placeHolder: "Choose a target schema version",
    ignoreFocusOut: true,
  });
  return pick;
}

export function buildConfigJson(state: WizardState): string {
  const config: Record<string, unknown> = {
    schema_version_target: state.schemaTarget,
    instruction_min_length: state.profile === "strict" ? 400 : 200,
    instruction_ideal_range: [500, 4000],
    require_conversation_starters_min: 2,
    rules: profileRules(state.profile),
  };
  if (state.tenantId || state.clientId) {
    config.graph_api = {
      ...(state.tenantId ? { tenant_id: state.tenantId } : {}),
      ...(state.clientId ? { client_id: state.clientId } : {}),
    };
  }
  return JSON.stringify(config, null, 2);
}

function profileRules(profile: WizardState["profile"]): Record<string, string> {
  switch (profile) {
    case "strict":
      return {
        "INST-LEN-001": "error",
        "INST-LEN-002": "error",
        "STR-001": "error",
        "STR-002": "error",
      };
    case "security-first":
      return {
        "SEC-PI-001": "error",
        "SEC-PI-002": "error",
        "SEC-PI-003": "error",
        "SEC-LEAK-001": "error",
        "SEC-LEAK-002": "error",
        "SEC-INFO-001": "error",
        "SEC-AGENCY-001": "error",
        "SEC-SUPPLY-001": "error",
      };
    case "recommended":
    default:
      return {};
  }
}
