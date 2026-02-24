import type { Rule, RuleContext, RuleResult, WebSearchCapability } from "../../core/types.js";

const UNTRUSTED_DOMAINS = [
  "pastebin.com",
  "gist.github.com",
  "codepen.io",
  "jsfiddle.net",
  "replit.com",
  "paste.ee",
  "hastebin.com",
  "dpaste.org",
  "rentry.co",
  "ghostbin.com",
];

export const knowledgeSourceTrustedDomains: Rule = {
  id: "SEC-006",
  name: "knowledge-source-trusted-domains",
  description: "WebSearch sites should not include untrusted paste/snippet domains (OWASP LLM03)",
  category: "security",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];
    const capabilities = context.manifest.capabilities ?? [];

    const webCaps = capabilities.filter(
      (c): c is WebSearchCapability => c.name === "WebSearch",
    );

    if (webCaps.length === 0) {
      return [{
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No WebSearch capabilities configured.",
      }];
    }

    for (const cap of webCaps) {
      for (const site of cap.sites ?? []) {
        const url = site.url.toLowerCase();
        const untrusted = UNTRUSTED_DOMAINS.find((d) => url.includes(d));

        if (untrusted) {
          results.push({
            ruleId: this.id,
            ruleName: this.name,
            severity: this.defaultSeverity,
            passed: false,
            message: `Untrusted domain in WebSearch sites: "${untrusted}"`,
            details: "Paste/snippet sites can be edited by anyone and are unreliable knowledge sources. Use trusted, authoritative domains instead.",
          });
        }
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "All WebSearch sites use trusted domains.",
      });
    }

    return results;
  },
};

export const actionPluginCountLimit: Rule = {
  id: "SEC-007",
  name: "action-plugin-count-limit",
  description: "Agents should not have excessive action plugins (>10) to limit supply chain surface (OWASP LLM03)",
  category: "security",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult {
    const actions = context.manifest.actions ?? [];

    return {
      ruleId: this.id,
      ruleName: this.name,
      severity: this.defaultSeverity,
      passed: actions.length <= 10,
      message: actions.length <= 10
        ? `Action plugin count within limit (${actions.length}/10).`
        : `Excessive action plugins (${actions.length}/10 max). Each plugin increases supply chain attack surface.`,
      details: actions.length > 10
        ? "Reduce the number of action plugins to minimize supply chain risk. Only include plugins that are essential for the agent's purpose."
        : undefined,
    };
  },
};

export const supplyChainRules: Rule[] = [
  knowledgeSourceTrustedDomains,
  actionPluginCountLimit,
];
