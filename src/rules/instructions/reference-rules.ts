import type { Rule, RuleContext, RuleResult } from "../../core/types.js";
import { detectSection } from "../../utils/markdown-parser.js";
import { capabilitySearchTerms } from "../../utils/capability-terms.js";

export const referencesCapabilities: Rule = {
  id: "INST-009",
  name: "references-capabilities",
  description: "Instructions should reference configured capabilities by name",
  category: "instructions",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const inst = (context.manifest.instructions ?? "").toLowerCase();
    const capabilities = context.manifest.capabilities ?? [];

    if (capabilities.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No capabilities configured – check skipped.",
      };
    }

    const unreferenced: string[] = [];
    for (const cap of capabilities) {
      const terms = capabilitySearchTerms[cap.name] ?? [cap.name.toLowerCase()];
      const found = terms.some((t) => inst.includes(t));
      if (!found) {
        unreferenced.push(cap.name);
      }
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: unreferenced.length === 0,
      message:
        unreferenced.length === 0
          ? "All capabilities referenced in instructions."
          : `Capabilities not referenced in instructions: ${unreferenced.join(", ")}`,
      details:
        unreferenced.length > 0
          ? `${unreferenced.map((c) => `"${c}"`).join(", ")} ${unreferenced.length === 1 ? "is" : "are"} configured but not mentioned in instructions. ` +
            "Explicitly referencing capabilities helps the agent understand when to use them."
          : undefined,
    };
  },
};

export const hasExamples: Rule = {
  id: "INST-010",
  name: "has-examples",
  description: "Instructions should include examples (few-shot prompting)",
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const found = detectSection(inst, "examples");
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: found,
      message: found
        ? "Examples (few-shot) found in instructions."
        : "No examples (few-shot) found.",
      details: found
        ? undefined
        : "Consider adding 1-2 examples showing how the agent should respond to typical queries. " +
          'This helps the agent understand the expected format and tone. Use "Example:", "User:", or "Output:" patterns.',
      fix: found
        ? undefined
        : {
            type: "append-section" as const,
            content: "## Examples\nUser: [typical question here]\nAssistant: [expected response here]",
          },
    };
  },
};

export const hasErrorHandling: Rule = {
  id: "INST-011",
  name: "has-error-handling",
  description: "Instructions should include error handling guidance",
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const found = detectSection(inst, "errorHandling");
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: found,
      message: found
        ? "Error handling section found."
        : "No error handling section found.",
      details: found
        ? undefined
        : 'Consider adding guidance for edge cases: What should the agent do if information is not found? ' +
          'If the user\'s question is outside scope? If data sources are unavailable?',
      fix: found
        ? undefined
        : {
            type: "append-section" as const,
            content: "## Error Handling\n- If the requested information is not found, inform the user and suggest alternatives.\n- If the question is outside your scope, politely redirect the user.",
          },
    };
  },
};

export const hasOutputFormatRules: Rule = {
  id: "INST-012",
  name: "has-output-format-rules",
  description: "Instructions should define response format rules",
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const found = detectSection(inst, "outputFormat");
    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: found,
      message: found
        ? "Output format rules found."
        : "No output format rules found.",
      details: found
        ? undefined
        : "Consider specifying how the agent should format its responses: " +
          "bullet points vs paragraphs, language, length, tone, use of markdown, etc.",
      fix: found
        ? undefined
        : {
            type: "append-section" as const,
            content: "## Output Format\n- Use bullet points for lists.\n- Keep responses concise and well-structured.\n- Use a professional and helpful tone.",
          },
    };
  },
};

export const conversationStartersMatch: Rule = {
  id: "INST-015",
  name: "conversation-starters-match",
  description: "Conversation starters should be relevant to the instructions",
  category: "instructions",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const inst = (context.manifest.instructions ?? "").toLowerCase();
    const starters = context.manifest.conversation_starters ?? [];

    if (starters.length === 0) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No conversation starters to check.",
      };
    }

    // Extract significant words from instructions (4+ chars, non-stopword)
    const stopwords = new Set([
      "the", "and", "for", "that", "this", "with", "from", "your", "have",
      "will", "been", "when", "what", "which", "their", "them", "they",
      "about", "would", "could", "should", "into", "also", "more", "some",
      "than", "other", "each", "aber", "auch", "oder", "wenn", "dass",
      "eine", "einen", "einem", "einer", "sind", "wird", "kann", "soll",
      "nach", "über", "sich", "alle", "sein", "noch", "nicht", "mehr",
    ]);

    const instWords = new Set(
      inst.split(/\W+/).filter((w) => w.length >= 4 && !stopwords.has(w)),
    );

    const unmatched: string[] = [];
    for (const starter of starters) {
      const starterText = (starter.text + " " + (starter.title ?? "")).toLowerCase();
      const starterWords = starterText
        .split(/\W+/)
        .filter((w) => w.length >= 4 && !stopwords.has(w));

      const matchCount = starterWords.filter((w) => instWords.has(w)).length;
      // At least one significant word should match
      if (matchCount === 0 && starterWords.length > 0) {
        unmatched.push(starter.text.slice(0, 50));
      }
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: unmatched.length === 0,
      message:
        unmatched.length === 0
          ? "All conversation starters align with instructions."
          : `${unmatched.length} conversation starter(s) may not match instructions.`,
      details:
        unmatched.length > 0
          ? `These starters don't share keywords with instructions: "${unmatched.join('", "')}". ` +
            "Ensure conversation starters are relevant to what the agent is instructed to do."
          : undefined,
    };
  },
};

export const referenceRules: Rule[] = [
  referencesCapabilities,
  hasExamples,
  hasErrorHandling,
  hasOutputFormatRules,
  conversationStartersMatch,
];
