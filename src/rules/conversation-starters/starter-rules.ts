import type { Rule, RuleContext, RuleResult } from "../../core/types.js";

export const starterMinCount: Rule = {
  id: "CS-001",
  name: "starter-min-count",
  description: "Agent should have a minimum number of conversation starters",
  category: "conversation-starters",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const starters = context.manifest.conversation_starters ?? [];
    const minCount = context.config.require_conversation_starters_min;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: starters.length >= minCount,
      message:
        starters.length >= minCount
          ? `${starters.length} conversation starters defined (min ${minCount}).`
          : `Only ${starters.length} conversation starter(s) defined (min ${minCount}).`,
      details:
        starters.length < minCount
          ? "Conversation starters help users understand what the agent can do. Add more starter prompts."
          : undefined,
    };
  },
};

export const starterMaxCount: Rule = {
  id: "CS-002",
  name: "starter-max-count",
  description: "Conversation starters must not exceed 12",
  category: "conversation-starters",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult {
    const starters = context.manifest.conversation_starters ?? [];
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: starters.length <= 12,
      message:
        starters.length <= 12
          ? `Conversation starters within limit (${starters.length}/12).`
          : `Too many conversation starters (${starters.length}/12 max).`,
    };
  },
};

export const starterHasText: Rule = {
  id: "CS-003",
  name: "starter-has-text",
  description: "All conversation starters must have text",
  category: "conversation-starters",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult {
    const starters = context.manifest.conversation_starters ?? [];

    if (starters.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No conversation starters to validate.",
      };
    }

    const missing = starters.filter(
      (s) => !s.text || s.text.trim().length === 0,
    );

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: missing.length === 0,
      message:
        missing.length === 0
          ? "All starters have text."
          : `${missing.length} starter(s) missing text field.`,
    };
  },
};

export const starterNoDuplicates: Rule = {
  id: "CS-004",
  name: "starter-no-duplicates",
  description: "Conversation starters should be diverse (no duplicates)",
  category: "conversation-starters",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const starters = context.manifest.conversation_starters ?? [];

    if (starters.length <= 1) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "Not enough starters to check for duplicates.",
      };
    }

    const normalized = starters.map((s) =>
      s.text.toLowerCase().replace(/\s+/g, " ").trim(),
    );
    const seen = new Set<string>();
    const dupes: string[] = [];

    const dupeIndices: number[] = [];
    for (let i = 0; i < normalized.length; i++) {
      if (seen.has(normalized[i])) {
        dupes.push(normalized[i]);
        dupeIndices.push(i);
      }
      seen.add(normalized[i]);
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: dupes.length === 0,
      message:
        dupes.length === 0
          ? "Starters are diverse (no duplicates)."
          : `Duplicate starters found: "${dupes.join('", "')}"`,
      fix: dupeIndices.length > 0
        ? { type: "remove-starter" as const, index: dupeIndices[0] }
        : undefined,
    };
  },
};

export const starterRules: Rule[] = [
  starterMinCount,
  starterMaxCount,
  starterHasText,
  starterNoDuplicates,
];
