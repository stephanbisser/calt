import * as vscode from "vscode";
import type { RuleResult } from "calt-cli";

export type Persona = "pro-code" | "maker" | "ciso";

export function currentPersona(): Persona {
  return vscode.workspace.getConfiguration("calt").get<Persona>("persona", "pro-code");
}

/**
 * D3: Maker-friendly plain-language summary. Maps a CALT finding to a more
 * approachable explanation. Falls back to the technical message when no
 * mapping exists.
 *
 * For Pro-Code persona we keep the original message (it's terse and rule-IDed).
 * For CISO we prepend a security/compliance hint when applicable.
 * For Maker we rephrase with imperative tone and concrete tips.
 */
export function rephraseForPersona(result: RuleResult, persona: Persona = currentPersona()): string {
  if (persona === "pro-code") return result.message;

  const ruleId = result.ruleId;

  if (persona === "maker") {
    const hint = MAKER_HINTS[hintKey(ruleId)];
    if (hint) return hint(result);
    return makerGenericTip(result);
  }

  if (persona === "ciso") {
    const tag = cisoTag(ruleId);
    if (tag) return `[${tag}] ${result.message}`;
    return result.message;
  }

  return result.message;
}

function hintKey(ruleId: string): string {
  // Group by prefix to keep the table manageable.
  for (const prefix of ["INST-", "CS-", "SEC-", "KNOW-", "ACT-", "SCHEMA-"]) {
    if (ruleId.startsWith(prefix)) return prefix;
  }
  return "";
}

const MAKER_HINTS: Record<string, (r: RuleResult) => string> = {
  "INST-": () =>
    "Tighten your agent's instructions: aim for 500–4,000 characters, structure them around Role / Tone / Scope / Limits, and reference each capability you've enabled.",
  "CS-": () =>
    "Your conversation starters need attention. Provide at least 2 concise, action-oriented prompts that match what the agent does.",
  "SEC-": () =>
    "A security guardrail is missing or weak. Common fixes: refuse prompt injection, never reveal system instructions, refuse out-of-scope actions, ground answers in your data.",
  "KNOW-": () =>
    "A knowledge source is configured incorrectly — check URLs, IDs, or connection settings.",
  "ACT-": () =>
    "An action plugin is referenced but its file is missing or invalid. Fix the path or remove the action.",
  "SCHEMA-": () =>
    "The manifest doesn't fully match the schema. Check spelling on field names — Copilot deploys can fail otherwise.",
};

function makerGenericTip(result: RuleResult): string {
  return `${result.message} — try \`/explain ${result.ruleId}\` in Copilot Chat for guidance.`;
}

function cisoTag(ruleId: string): string | undefined {
  if (ruleId.startsWith("SEC-")) return "OWASP LLM Top 10";
  return undefined;
}
