import type { Rule, RuleContext, RuleResult, FixDescriptor } from "../../core/types.js";

// Actionable verbs in English and German
const ACTIONABLE_VERBS_EN = [
  "ask", "search", "send", "check", "use", "fetch", "query", "create",
  "display", "confirm", "respond", "provide", "analyze", "retrieve",
  "summarize", "list", "explain", "help", "guide", "recommend",
  "verify", "validate", "filter", "format", "present", "collect",
];

const ACTIONABLE_VERBS_DE = [
  "frage", "fragen", "suche", "suchen", "sende", "senden", "prüfe", "prüfen",
  "verwende", "verwenden", "nutze", "nutzen", "erstelle", "erstellen",
  "zeige", "zeigen", "bestätige", "bestätigen", "antworte", "antworten",
  "biete", "bieten", "analysiere", "analysieren", "hole", "holen",
  "fasse zusammen", "zusammenfassen", "liste", "listen", "erkläre", "erklären",
  "hilf", "helfen", "empfehle", "empfehlen", "überprüfe", "überprüfen",
  "stelle bereit", "bereitstellen", "sammle", "sammeln",
];

const VAGUE_PHRASES_EN = [
  "maybe", "try to", "if possible", "sometimes", "might",
  "could potentially", "perhaps", "it depends", "sort of",
  "kind of", "more or less", "approximately", "roughly",
];

const VAGUE_PHRASES_DE = [
  "vielleicht", "versuche", "wenn möglich", "manchmal", "könnte",
  "eventuell", "ungefähr", "in etwa", "möglicherweise",
  "unter umständen", "gegebenenfalls",
];

const VAGUE_REPLACEMENTS: Record<string, string> = {
  "do your best": "follow the guidelines precisely",
  "try to help": "provide actionable answers with specific details",
  "be helpful": "provide step-by-step guidance when answering questions",
  "as needed": "when the user explicitly requests it",
  "if possible": "when the information is available in the provided knowledge sources",
  "etc.": "",
  "and so on": "",
  "things like that": "",
  "try to": "",
  "maybe": "",
  "perhaps": "",
  "sort of": "",
  "kind of": "",
};

export const usesActionableVerbs: Rule = {
  id: "INST-006",
  name: "uses-actionable-verbs",
  description: "Instructions should use specific, actionable verbs",
  category: "instructions",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const inst = (context.manifest.instructions ?? "").toLowerCase();
    const allVerbs = [...ACTIONABLE_VERBS_EN, ...ACTIONABLE_VERBS_DE];
    const found = allVerbs.filter((v) => inst.includes(v));

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: found.length >= 2,
      message:
        found.length >= 2
          ? `Contains actionable verbs (${found.slice(0, 5).join(", ")}${found.length > 5 ? "..." : ""}).`
          : `Few or no actionable verbs found (found ${found.length}).`,
      details:
        found.length < 2
          ? `Use specific verbs like: ${ACTIONABLE_VERBS_EN.slice(0, 8).join(", ")}. ` +
            `German: ${ACTIONABLE_VERBS_DE.slice(0, 6).join(", ")}.`
          : undefined,
    };
  },
};

export const avoidsVagueLanguage: Rule = {
  id: "INST-007",
  name: "avoids-vague-language",
  description: "Instructions should avoid vague or non-committal language",
  category: "instructions",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const inst = (context.manifest.instructions ?? "").toLowerCase();
    const allPhrases = [...VAGUE_PHRASES_EN, ...VAGUE_PHRASES_DE];
    const found = allPhrases.filter((p) => inst.includes(p));

    // Find the first vague phrase that has a replacement mapping
    let fix: FixDescriptor | undefined;
    if (found.length > 0) {
      const originalInst = context.manifest.instructions ?? "";
      for (const phrase of found) {
        const replacement = VAGUE_REPLACEMENTS[phrase];
        if (replacement !== undefined) {
          // Find the phrase in the original (case-insensitive) to get exact match
          const idx = originalInst.toLowerCase().indexOf(phrase);
          if (idx !== -1) {
            const exactPhrase = originalInst.slice(idx, idx + phrase.length);
            fix = {
              type: "replace" as const,
              search: exactPhrase,
              replacement,
            };
            break;
          }
        }
      }
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: found.length === 0,
      message:
        found.length === 0
          ? "No vague language detected."
          : `Vague language found: "${found.join('", "')}"`,
      details:
        found.length > 0
          ? "Replace vague phrases with definitive instructions. " +
            'Instead of "try to help", use "help". Instead of "if possible, search", use "search".'
          : undefined,
      fix,
    };
  },
};

export const noConflictingInstructions: Rule = {
  id: "INST-013",
  name: "no-conflicting-instructions",
  description: "Detect potentially conflicting instructions (always X / never X)",
  category: "instructions",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const lines = inst.split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean);

    const alwaysPatterns: string[] = [];
    const neverPatterns: string[] = [];

    for (const line of lines) {
      const alwaysMatch = line.match(/(?:always|immer|stets)\s+(.{3,30})/);
      if (alwaysMatch) alwaysPatterns.push(alwaysMatch[1]);

      const neverMatch = line.match(/(?:never|nie|niemals)\s+(.{3,30})/);
      if (neverMatch) neverPatterns.push(neverMatch[1]);
    }

    // Simple overlap detection: check if any "always" topic overlaps with a "never" topic
    const conflicts: string[] = [];
    for (const a of alwaysPatterns) {
      for (const n of neverPatterns) {
        const aWords = new Set(a.split(/\s+/));
        const nWords = new Set(n.split(/\s+/));
        const overlap = [...aWords].filter((w) => nWords.has(w) && w.length > 3);
        if (overlap.length > 0) {
          conflicts.push(`"always ${a}" vs "never ${n}"`);
        }
      }
    }

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: conflicts.length === 0,
      message:
        conflicts.length === 0
          ? "No conflicting instructions detected."
          : `Potential conflicts found: ${conflicts.join("; ")}`,
      details:
        conflicts.length > 0
          ? "Review these potentially conflicting instructions. Ensure 'always' and 'never' directives don't contradict each other."
          : undefined,
    };
  },
};

export const avoidsNegativeFraming: Rule = {
  id: "INST-014",
  name: "avoids-negative-framing",
  description: 'Prefer positive framing ("Do X") over negative ("Don\'t do Y")',
  category: "instructions",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const negativePatterns = [
      /(?:don't|do not|never|nicht|niemals|vermeide|vermeiden)\s/gi,
    ];

    let negativeCount = 0;
    for (const pattern of negativePatterns) {
      const matches = inst.match(pattern);
      if (matches) negativeCount += matches.length;
    }

    const lines = inst.split("\n").filter((l) => l.trim().length > 0).length;
    const ratio = lines > 0 ? negativeCount / lines : 0;
    // More than 30% negative framing is a concern
    const tooManyNegatives = ratio > 0.3 && negativeCount > 2;

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: !tooManyNegatives,
      message: tooManyNegatives
        ? `High ratio of negative framing (${negativeCount} negative phrases in ${lines} lines).`
        : negativeCount > 0
          ? `Some negative framing found (${negativeCount}), but within acceptable range.`
          : "No negative framing detected.",
      details: tooManyNegatives
        ? 'Prefer positive instructions ("Focus on X") over prohibitions ("Don\'t do Y"). ' +
          "Positive framing gives the agent clearer direction."
        : undefined,
    };
  },
};

export const languageRules: Rule[] = [
  usesActionableVerbs,
  avoidsVagueLanguage,
  noConflictingInstructions,
  avoidsNegativeFraming,
];
