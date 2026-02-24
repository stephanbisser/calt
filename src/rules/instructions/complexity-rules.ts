import type { Rule, RuleContext, RuleResult } from "../../core/types.js";
import { parseMarkdownStructure } from "../../utils/markdown-parser.js";

export const instructionTokenEstimate: Rule = {
  id: "INST-017",
  name: "instruction-token-estimate",
  description: "Estimate token count and warn if instructions may be too long for the model context",
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const words = inst.split(/\s+/).filter((w) => w.length > 0).length;
    const estimatedTokens = Math.ceil(words * 1.3);

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: estimatedTokens <= 2000,
      message:
        estimatedTokens <= 2000
          ? `Estimated token count within limit (~${estimatedTokens} tokens).`
          : `Instructions may use too many tokens (~${estimatedTokens} estimated, max 2000).`,
      details:
        estimatedTokens > 2000
          ? "Long instructions consume context window space. Consider condensing repetitive sections or moving detailed reference material to knowledge sources."
          : undefined,
    };
  },
};

export const instructionSectionDensity: Rule = {
  id: "INST-018",
  name: "instruction-section-density",
  description: "Sections should have a reasonable density (lines per header)",
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const structure = parseMarkdownStructure(inst);

    // Skip if < 10 lines
    if (structure.lineCount < 10) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: `Instructions too short for density analysis (${structure.lineCount} lines).`,
      };
    }

    // Need at least 2 headers
    if (structure.headerCount < 2) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: false,
        message: `Only ${structure.headerCount} header(s) for ${structure.lineCount} lines. Add more section headers.`,
        details:
          "Use Markdown headers (## Section) to break instructions into logical sections. Aim for 3–50 lines per section.",
      };
    }

    const ratio = structure.lineCount / structure.headerCount;
    const good = ratio >= 3 && ratio <= 50;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: good,
      message: good
        ? `Section density is good (~${Math.round(ratio)} lines/section, ${structure.headerCount} headers).`
        : `Section density out of range (~${Math.round(ratio)} lines/section). Aim for 3–50 lines per section.`,
      details: !good
        ? ratio < 3
          ? "Too many headers for the content length. Merge related sections to reduce fragmentation."
          : "Sections are too long. Break them into smaller subsections for better readability."
        : undefined,
    };
  },
};

export const instructionConditionalDepth: Rule = {
  id: "INST-019",
  name: "instruction-conditional-depth",
  description: "Instructions should avoid excessive conditional logic on a single line or in consecutive lines",
  category: "instructions",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const lines = inst.split("\n");

    const conditionalKeywords = /\b(?:if|when|unless|except|falls|wenn|sofern|es sei denn)\b/gi;

    let maxConditionalsOnLine = 0;
    let worstLine = "";
    let consecutiveConditionalLines = 0;
    let maxConsecutive = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        consecutiveConditionalLines = 0;
        continue;
      }

      const matches = trimmed.match(conditionalKeywords);
      const count = matches ? matches.length : 0;

      if (count > maxConditionalsOnLine) {
        maxConditionalsOnLine = count;
        worstLine = trimmed.slice(0, 80);
      }

      if (count > 0) {
        consecutiveConditionalLines++;
        if (consecutiveConditionalLines > maxConsecutive) {
          maxConsecutive = consecutiveConditionalLines;
        }
      } else {
        consecutiveConditionalLines = 0;
      }
    }

    const tooManyOnLine = maxConditionalsOnLine >= 3;
    const tooManyConsecutive = maxConsecutive >= 4;
    const failed = tooManyOnLine || tooManyConsecutive;

    let message: string;
    let details: string | undefined;

    if (tooManyOnLine && tooManyConsecutive) {
      message = `Complex conditional logic: ${maxConditionalsOnLine} conditionals on one line and ${maxConsecutive} consecutive conditional lines.`;
      details = `Line: "${worstLine}". Split complex conditions into separate rules or a decision table for clarity.`;
    } else if (tooManyOnLine) {
      message = `Complex conditional logic: ${maxConditionalsOnLine} conditionals on one line.`;
      details = `Line: "${worstLine}". Break this into separate, simpler conditions.`;
    } else if (tooManyConsecutive) {
      message = `${maxConsecutive} consecutive conditional lines detected. Consider restructuring as a decision table.`;
      details = "Long chains of conditional logic are hard for the model to follow. Use bullet-point rules or tables instead.";
    } else {
      message = "Conditional complexity is manageable.";
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: !failed,
      message,
      details,
    };
  },
};

export const instructionReadability: Rule = {
  id: "INST-020",
  name: "instruction-readability",
  description: "Instructions should be readable (simplified Flesch-Kincaid grade level)",
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const cleanText = inst.replace(/^#+\s.*$/gm, "").replace(/[-*•]\s/g, "").trim();

    if (cleanText.length < 100) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "Instructions too short for readability analysis.",
      };
    }

    const sentences = cleanText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = cleanText.split(/\s+/).filter((w) => w.length > 0);
    const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

    const sentenceCount = Math.max(sentences.length, 1);
    const wordCount = Math.max(words.length, 1);

    const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllables / wordCount) - 15.59;
    const roundedGrade = Math.round(grade * 10) / 10;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: grade <= 12,
      message:
        grade <= 12
          ? `Readability is good (Flesch-Kincaid grade ${roundedGrade}).`
          : `Instructions may be hard to parse (Flesch-Kincaid grade ${roundedGrade}, target ≤ 12).`,
      details:
        grade > 12
          ? "Simplify sentence structure and use shorter words. Complex instructions are harder for the model to follow accurately."
          : undefined,
    };
  },
};

/**
 * Estimate syllable count using vowel-group counting.
 * Not perfectly accurate but sufficient for Flesch-Kincaid approximation.
 */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 2) return 1;

  // Count vowel groups
  const vowelGroups = w.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  // Subtract silent e at end
  if (w.endsWith("e") && count > 1) {
    count--;
  }

  // Common suffixes that add a syllable
  if (w.endsWith("le") && w.length > 2 && !/[aeiouy]/.test(w[w.length - 3])) {
    count++;
  }

  return Math.max(count, 1);
}

export const complexityRules: Rule[] = [
  instructionTokenEstimate,
  instructionSectionDensity,
  instructionConditionalDepth,
  instructionReadability,
];
