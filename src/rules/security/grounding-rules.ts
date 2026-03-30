import type { Rule, RuleContext, RuleResult } from "../../core/types.js";

// Knowledge capability names
const KNOWLEDGE_CAPABILITIES = [
  "OneDriveAndSharePoint",
  "WebSearch",
  "GraphConnectors",
  "Dataverse",
];

// Grounding patterns (EN + DE)
const GROUNDING_PATTERNS = [
  // English
  /base (?:your )?answers on (?:provided |the )?(?:documents|knowledge|sources)/i,
  /cite (?:your )?sources/i,
  /reference (?:your )?sources/i,
  /only use (?:information|data) from (?:provided|the) (?:documents|knowledge|sources)/i,
  /do not (?:make up|fabricate|hallucinate|invent)/i,
  /ground (?:your )?(?:answers|responses) in/i,
  /stick to (?:the )?(?:provided |available )?(?:information|documents|knowledge|facts)/i,
  // German
  /basiere (?:deine )?antworten auf (?:den )?(?:bereitgestellten )?(?:dokumenten|quellen|wissen)/i,
  /zitiere (?:deine )?quellen/i,
  /verweise auf (?:deine )?quellen/i,
  /verwende nur (?:informationen|daten) aus (?:den )?(?:bereitgestellten|verfügbaren) (?:dokumenten|quellen|wissen)/i,
  /erfinde keine (?:informationen|fakten|antworten)/i,
  /gründe (?:deine )?(?:antworten|aussagen) auf/i,
  /halte dich an die (?:bereitgestellten |verfügbaren )?(?:informationen|dokumente|quellen)/i,
];

// Uncertainty handling patterns (EN + DE)
const UNCERTAINTY_PATTERNS = [
  // English
  /if you (?:don't|do not|cannot|can't) (?:know|find|locate)/i,
  /say (?:"|')i don't know/i,
  /admit when you (?:lack|don't have) (?:information|knowledge|data)/i,
  /when (?:unsure|uncertain)/i,
  /if (?:the )?(?:information|answer) is not (?:available|found)/i,
  /acknowledge (?:when|if) you (?:cannot|can't|don't)/i,
  // German
  /wenn du (?:es )?nicht (?:weißt|findest|finden kannst)/i,
  /sage? (?:"|')ich weiß (?:es )?nicht/i,
  /gib zu wenn du (?:keine )?(?:informationen|antwort)/i,
  /bei unsicherheit/i,
  /wenn die (?:information|antwort) nicht (?:verfügbar|vorhanden|gefunden)/i,
  /räume ein,? wenn du (?:etwas )?nicht (?:kannst|weißt)/i,
];

// Factual authority claim patterns
const AUTHORITY_PATTERNS = [
  /you are an expert/i,
  /provide accurate (?:and )?(?:authoritative )?(?:information|answers|data)/i,
  /you are a (?:knowledgeable|authoritative) (?:assistant|agent|advisor)/i,
  /deliver (?:precise|accurate|reliable) (?:information|answers|data)/i,
  /du bist ein experte/i,
  /liefere (?:präzise|genaue|zuverlässige) (?:informationen|antworten)/i,
  /stelle (?:genaue|fundierte|zuverlässige) (?:informationen|antworten|daten) bereit/i,
  /du bist (?:ein )?(?:kompetenter|sachkundiger|fachkundiger) (?:assistent|berater|agent)/i,
];

function hasKnowledgeCapabilities(context: RuleContext): boolean {
  const capabilities = context.manifest.capabilities ?? [];
  return capabilities.some((c) => KNOWLEDGE_CAPABILITIES.includes(c.name));
}

export const requiresGrounding: Rule = {
  id: "SEC-013",
  name: "requires-grounding",
  description: "Agents with knowledge sources should include grounding directives to reduce hallucination (OWASP LLM09)",
  category: "security",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    if (!hasKnowledgeCapabilities(context)) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No knowledge capabilities configured (grounding not applicable).",
      };
    }

    const inst = context.manifest.instructions ?? "";
    const hasGrounding = GROUNDING_PATTERNS.some((p) => p.test(inst));

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: hasGrounding,
      message: hasGrounding
        ? "Instructions include grounding directives for knowledge sources."
        : "No grounding directives found for agent with knowledge sources.",
      details: hasGrounding
        ? undefined
        : 'Add grounding directives like "Base your answers on the provided documents" or "Do not fabricate information" to reduce hallucination risk.',
      fix: hasGrounding
        ? undefined
        : {
            type: "append-section" as const,
            content: "## Grounding\n- Base your answers on the provided documents and knowledge sources.\n- Do not fabricate information. Cite your sources when possible.",
          },
    };
  },
};

export const hasUncertaintyHandling: Rule = {
  id: "SEC-014",
  name: "has-uncertainty-handling",
  description: "Instructions should include guidance for handling uncertainty (OWASP LLM09)",
  category: "security",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const hasHandling = UNCERTAINTY_PATTERNS.some((p) => p.test(inst));

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: hasHandling,
      message: hasHandling
        ? "Instructions include uncertainty handling guidance."
        : "No uncertainty handling guidance found in instructions.",
      details: hasHandling
        ? undefined
        : "Add guidance for handling uncertainty, such as \"If you don't know the answer, say so\" to prevent confabulation.",
      fix: hasHandling
        ? undefined
        : {
            type: "append-section" as const,
            content: "## Uncertainty Handling\n- If you don't know the answer, say so honestly.\n- Do not make up information. Suggest alternatives when uncertain.",
          },
    };
  },
};

export const knowledgeForFactualClaims: Rule = {
  id: "SEC-015",
  name: "knowledge-for-factual-claims",
  description: "Agents claiming expertise should have knowledge sources to back factual claims (OWASP LLM09)",
  category: "security",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult {
    const inst = context.manifest.instructions ?? "";
    const claimsAuthority = AUTHORITY_PATTERNS.some((p) => p.test(inst));

    if (!claimsAuthority) {
      return {
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No factual authority claims detected (knowledge source check not applicable).",
      };
    }

    const hasKnowledge = hasKnowledgeCapabilities(context);

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: hasKnowledge,
      message: hasKnowledge
        ? "Agent claims expertise and has knowledge sources to support it."
        : "Agent claims expertise but has no knowledge sources configured.",
      details: hasKnowledge
        ? undefined
        : "Add knowledge sources (OneDriveAndSharePoint, WebSearch, or GraphConnectors) to back factual claims. Without knowledge sources, the agent may hallucinate authoritative-sounding answers.",
    };
  },
};

export const groundingRules: Rule[] = [
  requiresGrounding,
  hasUncertaintyHandling,
  knowledgeForFactualClaims,
];
