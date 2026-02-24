import type { Rule, RuleContext, RuleResult } from "../../core/types.js";
import { capabilitySearchTerms } from "../../utils/capability-terms.js";

// Patterns that indicate usage guidance for a capability
const USAGE_PATTERNS = [
  /use\s+\S+\s+(?:to|for|when)/i,
  /verwende\s+\S+\s+(?:um|für|wenn)/i,
  /nutze\s+\S+\s+(?:um|für|wenn)/i,
  /with\s+\S+\s+(?:to|for|when)/i,
  /search\s+(?:the\s+)?(?:web|sharepoint|onedrive|documents)/i,
  /suche\s+(?:im\s+)?(?:web|sharepoint|onedrive|dokumenten)/i,
];

// Patterns that indicate constraints for a capability
const CONSTRAINT_PATTERNS = [
  /only use\s+\S+\s+when/i,
  /do not use\s+\S+\s+(?:for|when|if)/i,
  /don't use\s+\S+\s+(?:for|when|if)/i,
  /never use\s+\S+/i,
  /verwende\s+\S+\s+nur\s+wenn/i,
  /verwende\s+\S+\s+nicht\s+(?:für|wenn)/i,
  /nutze\s+\S+\s+nur\s+wenn/i,
];

function hasUsageGuidance(inst: string, terms: string[]): boolean {
  for (const term of terms) {
    // Check if any usage pattern appears near the capability term
    const termIndex = inst.indexOf(term);
    if (termIndex === -1) continue;
    // Check a window around the term (200 chars before and after)
    const start = Math.max(0, termIndex - 200);
    const end = Math.min(inst.length, termIndex + term.length + 200);
    const window = inst.slice(start, end);
    if (USAGE_PATTERNS.some((p) => p.test(window))) {
      return true;
    }
  }
  return false;
}

function hasConstraints(inst: string, terms: string[]): boolean {
  for (const term of terms) {
    const termIndex = inst.indexOf(term);
    if (termIndex === -1) continue;
    const start = Math.max(0, termIndex - 200);
    const end = Math.min(inst.length, termIndex + term.length + 200);
    const window = inst.slice(start, end);
    if (CONSTRAINT_PATTERNS.some((p) => p.test(window))) {
      return true;
    }
  }
  return false;
}

export const capabilityInstructionAlignment: Rule = {
  id: "INST-016",
  name: "capability-instruction-alignment",
  description: "Instructions should provide usage guidance and constraints for each configured capability",
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = (context.manifest.instructions ?? "").toLowerCase();
    const capabilities = context.manifest.capabilities ?? [];

    if (capabilities.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No capabilities configured – alignment check skipped.",
      };
    }

    const breakdown: string[] = [];
    let totalScore = 0;
    const maxScore = capabilities.length * 3;

    for (const cap of capabilities) {
      const terms = capabilitySearchTerms[cap.name] ?? [cap.name.toLowerCase()];
      const mentioned = terms.some((t) => inst.includes(t));
      const usage = hasUsageGuidance(inst, terms);
      const constraints = hasConstraints(inst, terms);

      const capScore = (mentioned ? 1 : 0) + (usage ? 1 : 0) + (constraints ? 1 : 0);
      totalScore += capScore;

      const parts: string[] = [];
      parts.push(mentioned ? "mentioned" : "not-mentioned");
      parts.push(usage ? "usage-guidance" : "no-usage-guidance");
      parts.push(constraints ? "constraints" : "no-constraints");
      breakdown.push(`${cap.name}: ${parts.join(", ")} (${capScore}/3)`);
    }

    const percentage = Math.round((totalScore / maxScore) * 100);
    const passed = percentage >= 50;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed,
      message: passed
        ? `Capability-instruction alignment is adequate (${percentage}%).`
        : `Low capability-instruction alignment (${percentage}%). Add usage guidance and constraints for configured capabilities.`,
      details: `${breakdown.join("\n")}\nOverall: ${totalScore}/${maxScore} (${percentage}%)`,
    };
  },
};

export const alignmentRules: Rule[] = [capabilityInstructionAlignment];
