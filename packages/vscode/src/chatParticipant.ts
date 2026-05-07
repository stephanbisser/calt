import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { selectModel, collectReply, formatLmError } from "./lm.js";
import { getOutput } from "./output.js";
import { isCaltCandidate } from "./diagnostics.js";
import type { LoadedAgent, RuleResult, ScanReport } from "calt-cli";

const PARTICIPANT_ID = "calt.chat";

interface CommandHandler {
  (
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult | void>;
}

export function registerChatParticipant(context: vscode.ExtensionContext): void {
  if (!vscode.chat || typeof vscode.chat.createChatParticipant !== "function") {
    getOutput().appendLine("[CALT] Chat API not available — skipping participant registration.");
    return;
  }

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (request, _ctx, stream, token) => {
    const handler = COMMANDS[request.command ?? ""] ?? handleFreeForm;
    try {
      return await handler(request, stream, token);
    } catch (err) {
      stream.markdown(`\n\n**Error:** ${formatLmError(err)}\n`);
      return { errorDetails: { message: formatLmError(err) } };
    }
  });

  participant.iconPath = new vscode.ThemeIcon("checklist");
  participant.followupProvider = {
    provideFollowups(result) {
      const meta = result.metadata as { followups?: vscode.ChatFollowup[] } | undefined;
      return meta?.followups ?? [];
    },
  };

  context.subscriptions.push(participant);
}

const COMMANDS: Record<string, CommandHandler> = {
  scan: handleScan,
  fix: handleFix,
  explain: handleExplain,
  "improve-instruction": handleImproveInstruction,
  "generate-starters": handleGenerateStarters,
  "audit-security": handleAuditSecurity,
};

async function handleFreeForm(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  stream.markdown(
    [
      "I'm `@calt` — your linter for Microsoft 365 Copilot Agent manifests.",
      "",
      "Try one of these slash commands:",
      "- `/scan` — lint the active or referenced manifest",
      "- `/fix` — apply deterministic and AI-assisted fixes",
      "- `/explain <ruleId>` — explain a rule (e.g. `/explain SEC-PI-001`)",
      "- `/improve-instruction` — rewrite the instructions of the active manifest",
      "- `/generate-starters` — propose conversation starters",
      "- `/audit-security` — explain SEC-* findings and suggest guardrails",
      "",
      "I can also answer free-form questions about CALT rules.",
    ].join("\n"),
  );
  // Free-form questions: defer to the LM if available, otherwise just respond
  // with the help message.
  if (request.prompt.trim().length === 0) {
    return { metadata: { followups: defaultFollowups() } };
  }
  const model = await selectModel();
  if (!model) {
    stream.markdown("\n\n_(GitHub Copilot is required for free-form answers — please sign in.)_");
    return { metadata: { followups: defaultFollowups() } };
  }
  const reply = await collectReply(model, {
    systemPrompt: SYSTEM_GENERAL,
    userPrompt: request.prompt,
    token,
  });
  stream.markdown("\n\n" + reply);
  return { metadata: { followups: defaultFollowups() } };
}

async function handleScan(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const target = await pickManifest();
  if (!target) {
    stream.markdown("No manifest in the active editor. Open a `declarativeAgent.json` and try again.");
    return {};
  }
  const { agent, report } = await loadAndScan(target);
  stream.markdown(formatReportSummary(agent, report));
  stream.markdown("\n\n");
  stream.markdown(formatFindingsTable(report));
  stream.button({
    command: "calt.scan",
    title: "$(search) Re-scan in editor",
  });
  if (report.summary.errors + report.summary.warnings > 0) {
    stream.button({
      command: "workbench.action.chat.open",
      arguments: [{ query: "@calt /fix" }],
      title: "$(tools) Fix issues",
    });
  }
  return { metadata: { followups: scanFollowups(report) } };
}

async function handleFix(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const target = await pickManifest();
  if (!target) {
    stream.markdown("No active manifest to fix.");
    return {};
  }
  const { applyFixes } = await import("calt-cli");
  const { agent, report } = await loadAndScan(target);
  const findings = report.categories.flatMap((c) => c.results).filter((r) => !r.passed);
  const deterministic = findings.filter((r) => r.fix);
  const aiOnly = findings.filter((r) => !r.fix);

  let manifest = agent.manifest;
  const summary: string[] = [];

  if (deterministic.length > 0) {
    const result = applyFixes(manifest, deterministic);
    manifest = result.manifest;
    summary.push(
      `**Deterministic fixes applied:** ${result.applied.filter((a) => a.applied).length}/${deterministic.length}`,
    );
    for (const a of result.applied) {
      summary.push(`- ${a.applied ? "✅" : "⚠️"} \`${a.ruleId}\` — ${a.description}`);
    }
  } else {
    summary.push("_No deterministic fixes available._");
  }

  if (aiOnly.length > 0) {
    summary.push(`\n**${aiOnly.length} finding(s) need AI-assisted fixes:**`);
    for (const r of aiOnly.slice(0, 5)) {
      summary.push(`- \`${r.ruleId}\` — ${r.message}`);
    }
    if (aiOnly.length > 5) summary.push(`- _…and ${aiOnly.length - 5} more_`);
    summary.push(
      "\nUse the **Fix with Copilot** lightbulb on each underlined finding in the editor.",
    );
  }

  stream.markdown(summary.join("\n"));

  if (deterministic.length > 0 && target.uri) {
    const newJson = JSON.stringify(manifest, null, 2) + "\n";
    const wsEdit = new vscode.WorkspaceEdit();
    const doc = await vscode.workspace.openTextDocument(target.uri);
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    wsEdit.replace(target.uri, fullRange, newJson);
    await vscode.workspace.applyEdit(wsEdit);
    stream.markdown(
      `\n\n_Saved fixes to \`${vscode.workspace.asRelativePath(target.uri)}\`. Review with \`Cmd/Ctrl+Z\` to undo._`,
    );
  }

  if (token.isCancellationRequested) return {};

  return { metadata: { followups: scanFollowups(report) } };
}

async function handleExplain(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const ruleId = request.prompt.trim().split(/\s+/)[0]?.toUpperCase();
  if (!ruleId) {
    stream.markdown("Usage: `/explain SEC-PI-001`");
    return {};
  }
  stream.markdown(`### Rule \`${ruleId}\`\n\n`);
  const model = await selectModel();
  if (!model) {
    stream.markdown(
      `Rule \`${ruleId}\` is part of the CALT rule set. See [the rule docs](https://github.com/stephanbisser/calt#${ruleId.toLowerCase()}) for details.\n\n_(Sign in to GitHub Copilot for AI-elaborated explanations.)_`,
    );
    return {};
  }
  const reply = await collectReply(model, {
    systemPrompt: SYSTEM_EXPLAIN,
    userPrompt: `Explain CALT rule "${ruleId}" to a developer. Cover: what it checks, why it matters (security/quality reasoning, with OWASP LLM mapping if applicable), what a good fix looks like, and a 5-line code/text example showing the violation and the fix.`,
    token,
  });
  stream.markdown(reply);
  return {};
}

async function handleImproveInstruction(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const target = await pickManifest();
  if (!target) {
    stream.markdown("Open a manifest first — I'll improve its `instructions` field.");
    return {};
  }
  const model = await selectModel();
  if (!model) {
    stream.markdown("GitHub Copilot is required for instruction rewrites.");
    return {};
  }
  const { agent, report } = await loadAndScan(target);
  const instructionFindings = report.categories
    .flatMap((c) => c.results)
    .filter((r) => !r.passed && r.ruleId.startsWith("INST-"));
  const findingsHint = instructionFindings.length
    ? "Address these CALT findings:\n" +
      instructionFindings.map((r) => `- ${r.ruleId}: ${r.message}`).join("\n")
    : "";

  stream.markdown(`Rewriting instructions for **${agent.manifest.name}**…\n\n`);

  let revised = "";
  for await (const frag of streamLm(model, {
    systemPrompt: SYSTEM_IMPROVE_INSTRUCTION,
    userPrompt: [
      `Agent name: ${agent.manifest.name}`,
      `Description: ${agent.manifest.description}`,
      "Current instructions:\n" + agent.manifest.instructions,
      "",
      findingsHint,
      "",
      "Return ONLY the rewritten instructions — no preamble, no markdown fences, plain text.",
    ].join("\n"),
    token,
  })) {
    revised += frag;
    stream.markdown(frag);
  }

  if (target.uri && revised.trim().length > 0) {
    stream.markdown(
      `\n\n_Apply via the manifest editor — copy the revision above into the \`instructions\` field, or run \`/fix\` to let CALT apply deterministic fixes first._`,
    );
  }

  return { metadata: { followups: [{ prompt: "/scan", command: "scan" }] } };
}

async function handleGenerateStarters(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const target = await pickManifest();
  if (!target) {
    stream.markdown("Open a manifest first.");
    return {};
  }
  const model = await selectModel();
  if (!model) {
    stream.markdown("GitHub Copilot is required for starter generation.");
    return {};
  }
  const { agent } = await loadAndScan(target);
  stream.markdown(`Proposing conversation starters for **${agent.manifest.name}**…\n\n`);
  const json = await collectReply(model, {
    systemPrompt: SYSTEM_GENERATE_STARTERS,
    userPrompt: [
      `Agent name: ${agent.manifest.name}`,
      `Description: ${agent.manifest.description}`,
      `Instructions (truncated): ${agent.manifest.instructions.slice(0, 1500)}`,
      "",
      'Return ONLY a JSON array of objects with shape {"title": string, "text": string}. 4–6 items.',
    ].join("\n"),
    token,
  });
  const parsed = parseStartersJson(json);
  if (!parsed) {
    stream.markdown("_(Could not parse model output as JSON. Raw response:)_\n\n" + json);
    return {};
  }
  stream.markdown(formatStartersTable(parsed));
  if (target.uri) {
    stream.button({
      command: "calt.applyStarters",
      arguments: [target.uri.toString(), parsed],
      title: "$(check) Apply to manifest",
    });
  }
  return { metadata: { followups: [{ prompt: "/scan", command: "scan" }] } };
}

async function handleAuditSecurity(
  _request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  const target = await pickManifest();
  if (!target) {
    stream.markdown("Open a manifest first.");
    return {};
  }
  const { agent, report } = await loadAndScan(target);
  const sec = report.categories.find((c) => c.category === "security");
  const findings = (sec?.results ?? []).filter((r) => !r.passed);
  if (findings.length === 0) {
    stream.markdown(`✅ No security findings on **${agent.manifest.name}**. OWASP LLM Top 10 checks pass.`);
    return {};
  }
  stream.markdown(`### Security audit — **${agent.manifest.name}**\n\n${findings.length} finding(s):\n\n`);
  const model = await selectModel();
  for (const r of findings) {
    stream.markdown(`#### \`${r.ruleId}\` — ${r.message}\n\n`);
    if (model) {
      const reply = await collectReply(model, {
        systemPrompt: SYSTEM_SECURITY,
        userPrompt: `Explain CALT finding ${r.ruleId} ("${r.message}") in the context of OWASP LLM Top 10. Suggest a concrete guardrail clause to add to the agent instructions. Keep the response under 8 lines.`,
        token,
      });
      stream.markdown(reply + "\n\n");
    } else {
      stream.markdown(`_Sign in to GitHub Copilot for AI-elaborated guidance._\n\n`);
    }
    if (token.isCancellationRequested) break;
  }
  return {};
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ManifestTarget {
  uri: vscode.Uri;
  filePath: string;
}

async function pickManifest(): Promise<ManifestTarget | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor && isCaltCandidate(editor.document)) {
    return { uri: editor.document.uri, filePath: editor.document.uri.fsPath };
  }
  const found = await vscode.workspace.findFiles(
    "{**/declarativeAgent*.json,**/declarative-agent*.json,**/appPackage/**/manifest.json}",
    "**/node_modules/**",
    1,
  );
  if (found.length === 1) return { uri: found[0], filePath: found[0].fsPath };
  return undefined;
}

async function loadAndScan(target: ManifestTarget): Promise<{ agent: LoadedAgent; report: ScanReport }> {
  const { loadConfig, loadFromFile, runFullScan } = await import("calt-cli");
  const cwd = vscode.workspace.getWorkspaceFolder(target.uri)?.uri.fsPath;
  const config = await loadConfig(cwd);
  const agents = await loadFromFile(target.filePath);
  const agent = agents[0];
  const report = await runFullScan(agent, config);
  return { agent, report };
}

function formatReportSummary(agent: LoadedAgent, report: ScanReport): string {
  const { errors, warnings, infos, totalChecks, passed } = report.summary;
  const score = totalChecks === 0 ? 100 : Math.round((passed / totalChecks) * 100);
  return [
    `### CALT scan — **${agent.manifest.name}**`,
    "",
    `Score **${score}/100** · ${errors} error(s) · ${warnings} warning(s) · ${infos} info(s)`,
  ].join("\n");
}

function formatFindingsTable(report: ScanReport): string {
  const findings = report.categories.flatMap((c) => c.results).filter((r) => !r.passed);
  if (findings.length === 0) return "_No findings — manifest is clean._";
  const rows = findings
    .slice(0, 25)
    .map((r) => `| ${severityIcon(r.severity)} | \`${r.ruleId}\` | ${escapePipes(r.message)} |`)
    .join("\n");
  const more = findings.length > 25 ? `\n\n_…and ${findings.length - 25} more findings._` : "";
  return `| | Rule | Message |\n|--|--|--|\n${rows}${more}`;
}

function severityIcon(s: RuleResult["severity"]): string {
  return s === "error" ? "🔴" : s === "warning" ? "🟡" : "🔵";
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function defaultFollowups(): vscode.ChatFollowup[] {
  return [
    { prompt: "/scan", command: "scan", label: "Scan active manifest" },
    { prompt: "/audit-security", command: "audit-security", label: "Audit security" },
  ];
}

function scanFollowups(report: ScanReport): vscode.ChatFollowup[] {
  const out: vscode.ChatFollowup[] = [];
  if (report.summary.errors + report.summary.warnings > 0) {
    out.push({ prompt: "/fix", command: "fix", label: "Apply fixes" });
  }
  out.push({ prompt: "/improve-instruction", command: "improve-instruction", label: "Improve instructions" });
  return out;
}

function parseStartersJson(text: string): Array<{ title: string; text: string }> | undefined {
  // Try to extract a JSON array from the response (model may wrap it).
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return undefined;
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return undefined;
    const valid = arr.filter(
      (item): item is { title: string; text: string } =>
        typeof item === "object" && item !== null && typeof item.text === "string",
    );
    return valid.length > 0 ? valid : undefined;
  } catch {
    return undefined;
  }
}

function formatStartersTable(starters: Array<{ title: string; text: string }>): string {
  return starters
    .map((s, i) => `${i + 1}. **${s.title ?? "Starter"}** — ${s.text}`)
    .join("\n");
}

// ─── Apply-starters command (button target) ────────────────────────────────

export function registerApplyStartersCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "calt.applyStarters",
      async (uriString: string, starters: Array<{ title: string; text: string }>) => {
        try {
          const uri = vscode.Uri.parse(uriString);
          const text = await fs.readFile(uri.fsPath, "utf8");
          const manifest = JSON.parse(text) as Record<string, unknown>;
          manifest.conversation_starters = starters;
          const out = JSON.stringify(manifest, null, 2) + "\n";
          const edit = new vscode.WorkspaceEdit();
          const doc = await vscode.workspace.openTextDocument(uri);
          const range = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
          edit.replace(uri, range, out);
          await vscode.workspace.applyEdit(edit);
          void vscode.window.showInformationMessage(
            `CALT: applied ${starters.length} conversation starters to ${vscode.workspace.asRelativePath(uri)}.`,
          );
        } catch (err) {
          void vscode.window.showErrorMessage(`CALT: failed to apply starters — ${formatLmError(err)}`);
        }
      },
    ),
  );
}

// ─── Streaming helper used inline ──────────────────────────────────────────

async function* streamLm(
  model: vscode.LanguageModelChat,
  opts: { systemPrompt: string; userPrompt: string; token: vscode.CancellationToken },
): AsyncIterable<string> {
  const messages = [
    vscode.LanguageModelChatMessage.User(`SYSTEM:\n${opts.systemPrompt}\n\nTASK:\n${opts.userPrompt}`),
  ];
  const response = await model.sendRequest(messages, {}, opts.token);
  for await (const fragment of response.text) yield fragment;
}

// ─── Prompts ───────────────────────────────────────────────────────────────

const SYSTEM_GENERAL = `You are CALT, a linter and assistant for Microsoft 365 Copilot Agent manifests. Be concise. Prefer concrete advice over generalities. Cite CALT rule IDs (e.g. INST-LEN-001, SEC-PI-002) when relevant.`;

const SYSTEM_EXPLAIN = `You are CALT, a linter for Microsoft 365 Copilot Agent manifests. Explain rule IDs to developers in 4 short sections: what, why, fix, example. Map security rules (SEC-*) to OWASP LLM Top 10 (LLM01 prompt injection, LLM02 insecure output handling, LLM06 sensitive info disclosure, LLM07 supply chain, LLM08 excessive agency). Be concise.`;

const SYSTEM_IMPROVE_INSTRUCTION = `You are an expert at writing Microsoft 365 Copilot Agent system instructions. Rewrite the user's instructions to:
- Cover Role, Tone, Scope, Limits, and Refusal patterns
- Address each provided CALT finding
- Stay between 500 and 4000 characters
- Use plain text (no markdown headings, no code fences)
Return ONLY the rewritten instructions, no preamble.`;

const SYSTEM_GENERATE_STARTERS = `You generate conversation starters for Microsoft 365 Copilot Agents. Each starter must be concise, action-oriented, and aligned with the agent's described role and capabilities. Return ONLY a JSON array of {title, text} objects. No prose, no code fences.`;

const SYSTEM_SECURITY = `You are a security reviewer for Microsoft 365 Copilot Agent manifests. Map findings to OWASP LLM Top 10. Suggest concrete guardrail clauses (1–3 lines) that the developer can append to the agent instructions. Keep responses under 8 lines.`;
