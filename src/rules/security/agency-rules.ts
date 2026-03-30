import type { Rule, RuleContext, RuleResult } from "../../core/types.js";

// Human-in-the-loop confirmation patterns (EN + DE)
const CONFIRMATION_PATTERNS = [
  // English
  /ask (?:the )?user for confirmation before/i,
  /confirm with the user before/i,
  /request (?:user )?approval before/i,
  /human[- ]in[- ]the[- ]loop/i,
  /require (?:user )?confirmation/i,
  /wait for (?:user )?approval/i,
  // German
  /frage den benutzer vor/i,
  /bestätigung (?:des benutzers )?einholen/i,
  /genehmigung des benutzers/i,
  /menschliche kontrolle/i,
  /benutzer um bestätigung bitten/i,
  /warte auf (?:die )?(?:genehmigung|bestätigung) des benutzers/i,
];

// Auto-execute patterns (EN + DE)
const AUTO_EXECUTE_PATTERNS = [
  // English
  /auto[- ]?approve/i,
  /auto[- ]?execute/i,
  /auto[- ]?send/i,
  /execute without (?:asking|confirmation|approval)/i,
  /skip (?:the )?confirmation/i,
  /bypass (?:the )?confirmation/i,
  /silently (?:execute|delete|send|modify|update|remove)/i,
  /automatically (?:execute|delete|send|modify|update|remove)/i,
  /without (?:user )?(?:consent|permission|approval)/i,
  // German
  /automatisch (?:ausführen|löschen|senden|ändern|genehmigen|aktualisieren|entfernen)/i,
  /ohne (?:bestätigung|genehmigung|rückfrage|zustimmung)/i,
  /bestätigung (?:überspringen|umgehen)/i,
  /stillschweigend (?:ausführen|löschen|senden|ändern|aktualisieren|entfernen)/i,
];

export const excessiveCapabilities: Rule = {
  id: "SEC-008",
  name: "excessive-capabilities",
  description: "Agents should follow least privilege and not have excessive capabilities (OWASP LLM06)",
  category: "security",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const capabilities = context.manifest.capabilities ?? [];

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: capabilities.length <= 5,
      message: capabilities.length <= 5
        ? `Capability count within limit (${capabilities.length}/5).`
        : `Excessive capabilities configured (${capabilities.length}/5 max). Follow the principle of least privilege.`,
      details: capabilities.length > 5
        ? "Reduce the number of capabilities to only those essential for the agent's purpose. Excessive capabilities increase the potential impact of a compromised agent."
        : undefined,
    };
  },
};

export const humanInTheLoopGuidance: Rule = {
  id: "SEC-009",
  name: "human-in-the-loop-guidance",
  description: "Agents with actions should include human-in-the-loop confirmation guidance (OWASP LLM06)",
  category: "security",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const actions = context.manifest.actions ?? [];

    if (actions.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No actions configured (human-in-the-loop not applicable).",
      };
    }

    const inst = context.manifest.instructions ?? "";
    const hasGuidance = CONFIRMATION_PATTERNS.some((p) => p.test(inst));

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: hasGuidance,
      message: hasGuidance
        ? "Instructions include human-in-the-loop guidance for actions."
        : "No human-in-the-loop guidance found for agent with actions.",
      details: hasGuidance
        ? undefined
        : 'Add guidance like "Ask the user for confirmation before executing any action" to prevent unintended actions.',
      fix: hasGuidance
        ? undefined
        : {
            type: "append-section" as const,
            content: "## Human-in-the-Loop\n- Ask the user for confirmation before executing any action.\n- Do not perform destructive operations without explicit user approval.",
          },
    };
  },
};

export const noAutoExecutePatterns: Rule = {
  id: "SEC-010",
  name: "no-auto-execute-patterns",
  description: "Instructions must not contain auto-execute or bypass confirmation patterns (OWASP LLM06)",
  category: "security",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const matches: string[] = [];

    for (const pattern of AUTO_EXECUTE_PATTERNS) {
      const match = inst.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: matches.length === 0,
      message: matches.length === 0
        ? "No auto-execute patterns found in instructions."
        : `Dangerous auto-execute pattern detected: "${matches[0]}"`,
      details: matches.length > 0
        ? "Remove patterns that bypass user confirmation. All actions with side effects should require explicit user approval."
        : undefined,
      fix: matches.length > 0
        ? { type: "remove" as const, pattern: matches[0] }
        : undefined,
    };
  },
};

export const agencyRules: Rule[] = [
  excessiveCapabilities,
  humanInTheLoopGuidance,
  noAutoExecutePatterns,
];
