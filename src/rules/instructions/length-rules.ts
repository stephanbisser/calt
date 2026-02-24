import type { Rule, RuleContext, RuleResult } from "../../core/types.js";

export const instructionsNotEmpty: Rule = {
  id: "INST-001",
  name: "instructions-not-empty",
  description: "Instructions must not be empty",
  category: "instructions",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const trimmed = inst.trim();
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: trimmed.length > 0,
      message:
        trimmed.length > 0
          ? `Instructions not empty (${trimmed.length}/8000 chars).`
          : "Instructions are empty.",
    };
  },
};

export const instructionsMaxLength: Rule = {
  id: "INST-002",
  name: "instructions-max-length",
  description: "Instructions must not exceed 8000 characters",
  category: "instructions",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const len = inst.length;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: len <= 8000,
      message:
        len <= 8000
          ? `Instructions within limit (${len}/8000 chars).`
          : `Instructions exceed maximum length (${len}/8000 chars).`,
    };
  },
};

export const instructionsMinLength: Rule = {
  id: "INST-003",
  name: "instructions-min-length",
  description: "Instructions should have a meaningful minimum length",
  category: "instructions",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const len = inst.trim().length;
    const minLen = context.config.instruction_min_length;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: len >= minLen,
      message:
        len >= minLen
          ? `Instructions length adequate (${len} chars, min ${minLen}).`
          : `Instructions may be too short (${len} chars, recommended min ${minLen}).`,
      details:
        len < minLen
          ? "Short instructions may not provide enough guidance for the agent. Consider adding more detail about the agent's behavior, workflow, and expected outputs."
          : undefined,
    };
  },
};

export const lengthRules: Rule[] = [
  instructionsNotEmpty,
  instructionsMaxLength,
  instructionsMinLength,
];
