import type { Rule, RuleContext, RuleResult } from "../../core/types.js";
import { parseMarkdownStructure, detectSection } from "../../utils/markdown-parser.js";

export const hasPurposeSection: Rule = {
  id: "INST-004",
  name: "has-purpose-section",
  description: "Instructions should have a clear purpose/objective section",
  category: "instructions",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const found = detectSection(inst, "purpose");
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: found,
      message: found
        ? "Purpose/objective section found."
        : "No clear purpose/objective section found.",
      details: found
        ? undefined
        : 'Add a section defining the agent\'s core purpose, e.g. "# OBJECTIVE" or start with "You are a..."',
      fix: found
        ? undefined
        : {
            type: "append-section" as const,
            content: "## Purpose\n\nYou are a helpful assistant that [describe your agent's purpose here].\n",
          },
    };
  },
};

export const hasMarkdownStructure: Rule = {
  id: "INST-005",
  name: "has-markdown-structure",
  description: "Instructions should use Markdown formatting with headers",
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const structure = parseMarkdownStructure(inst);
    const hasStructure = structure.hasHeaders || structure.hasNumberedList || structure.hasBulletList;

    let fix: RuleResult["fix"] | undefined;
    if (!hasStructure && inst.trim().length > 0) {
      const reformatted = `## Purpose\n\n${inst.trim()}\n\n## Guidelines\n\n- Follow the instructions above\n- Provide clear, structured responses\n`;
      fix = {
        type: "replace" as const,
        search: inst,
        replacement: reformatted,
      };
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: hasStructure,
      message: hasStructure
        ? `Markdown structure found (${structure.headerCount} headers, ${structure.numberedListCount} numbered items, ${structure.bulletListCount} bullets).`
        : "No Markdown structure found (no headers, lists, or formatting).",
      details: hasStructure
        ? undefined
        : "Consider structuring instructions with # headers, numbered lists, and bullet points for better readability and agent comprehension.",
      fix,
    };
  },
};

export const hasWorkflowSteps: Rule = {
  id: "INST-008",
  name: "has-workflow-steps",
  description: "Instructions should define a step-by-step workflow",
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const found = detectSection(inst, "workflow");
    const structure = parseMarkdownStructure(inst);
    const hasSteps = found || structure.hasNumberedList;
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: hasSteps,
      message: hasSteps
        ? "Workflow steps found."
        : "No step-by-step workflow defined.",
      details: hasSteps
        ? undefined
        : "Consider adding a numbered workflow section defining the steps the agent should follow when responding to user queries.",
      fix: hasSteps
        ? undefined
        : {
            type: "append-section" as const,
            content: "## Workflow\n\n1. Understand the user's request\n2. [Add your specific steps here]\n3. Provide a clear, helpful response\n",
          },
    };
  },
};

export const structureRules: Rule[] = [
  hasPurposeSection,
  hasMarkdownStructure,
  hasWorkflowSteps,
];
