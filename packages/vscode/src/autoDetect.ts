import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { getOutput } from "./output.js";

const PROMPTED_KEY = "calt.autoDetectPromptedFor";

export async function autoDetectProject(context: vscode.ExtensionContext): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) return;

  const { detectProject } = await import("calt-cli");
  const out = getOutput();
  const promptedFor = context.globalState.get<string[]>(PROMPTED_KEY, []);

  for (const folder of folders) {
    const key = folder.uri.fsPath;
    if (promptedFor.includes(key)) continue;

    let detected;
    try {
      detected = await detectProject(folder.uri.fsPath);
    } catch {
      continue;
    }
    if (detected.type !== "agents-toolkit" && detected.type !== "teams-toolkit") continue;
    if (detected.manifestPaths.length === 0) continue;

    out.appendLine(
      `[CALT] Auto-detected ${detected.type} project in ${folder.name} (${detected.manifestPaths.length} manifest(s)).`,
    );

    const exists = await fileExists(path.join(key, ".caltrc.json"));
    const action = exists ? "Scan workspace" : "Initialize CALT";
    const choice = await vscode.window.showInformationMessage(
      `CALT detected your ${detected.type} project (${folder.name}). Enable linting?`,
      action,
      "Don't ask again",
    );
    if (choice === action) {
      if (exists) {
        await vscode.commands.executeCommand("calt.scanWorkspace");
      } else {
        await vscode.commands.executeCommand("calt.initConfig");
      }
    }
    if (choice) {
      const next = [...promptedFor, key];
      await context.globalState.update(PROMPTED_KEY, next);
    }
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
