import * as vscode from "vscode";

interface CaltTaskDefinition extends vscode.TaskDefinition {
  type: "calt";
  task: "scan" | "fix" | "fix-dry-run" | "watch" | "diff";
  path?: string;
  format?: "terminal" | "json" | "markdown" | "html" | "sarif";
}

const PRESETS: { task: CaltTaskDefinition["task"]; label: string; args: string[] }[] = [
  { task: "scan", label: "scan", args: ["scan", "."] },
  { task: "fix-dry-run", label: "fix --dry-run", args: ["fix", ".", "--dry-run"] },
  { task: "fix", label: "fix", args: ["fix", "."] },
  { task: "watch", label: "watch", args: ["watch", "."] },
];

class CaltTaskProvider implements vscode.TaskProvider {
  provideTasks(): vscode.ProviderResult<vscode.Task[]> {
    return PRESETS.map((p) => buildTask({ type: "calt", task: p.task }, p.label, p.args));
  }
  resolveTask(task: vscode.Task): vscode.ProviderResult<vscode.Task> {
    const def = task.definition as CaltTaskDefinition;
    if (def.type !== "calt") return undefined;
    const args: string[] = [def.task, def.path ?? "."];
    if (def.format) args.push("--format", def.format);
    return buildTask(def, def.task, args);
  }
}

function buildTask(def: CaltTaskDefinition, label: string, args: string[]): vscode.Task {
  // Use `npx calt-cli` so the task works in projects that haven't installed CALT globally.
  const exec = new vscode.ShellExecution("npx", ["--yes", "calt-cli", ...args]);
  const task = new vscode.Task(
    def,
    vscode.TaskScope.Workspace,
    `CALT: ${label}`,
    "calt",
    exec,
    [],
  );
  task.problemMatchers = [];
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
  };
  return task;
}

export function registerTaskProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.tasks.registerTaskProvider("calt", new CaltTaskProvider()));
}
