import type { Rule, RuleContext, RuleResult, WebSearchCapability } from "../../core/types.js";
import { isValidUrl, getPathSegmentCount, hasQueryParameters } from "../../utils/url-validator.js";

export const websearchSiteLimit: Rule = {
  id: "KNOW-003",
  name: "websearch-site-limit",
  description: "WebSearch sites must not exceed 4 entries",
  category: "knowledge",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];
    const capabilities = context.manifest.capabilities ?? [];

    const webCaps = capabilities.filter(
      (c): c is WebSearchCapability => c.name === "WebSearch",
    );

    for (const cap of webCaps) {
      const sites = cap.sites ?? [];
      results.push({
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: sites.length <= 4,
        message:
          sites.length <= 4
            ? `WebSearch sites within limit (${sites.length}/4).`
            : `WebSearch exceeds site limit (${sites.length}/4 max).`,
      });
    }

    return results;
  },
};

export const websearchUrlValid: Rule = {
  id: "KNOW-004",
  name: "websearch-url-valid",
  description: "WebSearch site URLs must be valid with max 2 path segments and no query params",
  category: "knowledge",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];
    const capabilities = context.manifest.capabilities ?? [];

    const webCaps = capabilities.filter(
      (c): c is WebSearchCapability => c.name === "WebSearch",
    );

    for (const cap of webCaps) {
      for (const site of cap.sites ?? []) {
        if (!isValidUrl(site.url)) {
          results.push({
            ruleId: this.id,
            ruleName: this.name,
            severity: this.defaultSeverity,
            passed: false,
            message: `Invalid URL: ${site.url}`,
          });
          continue;
        }

        const errors: string[] = [];
        const segments = getPathSegmentCount(site.url);
        if (segments > 2) {
          errors.push(`too many path segments (${segments}, max 2)`);
        }
        if (hasQueryParameters(site.url)) {
          errors.push("must not contain query parameters");
        }

        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: this.defaultSeverity,
          passed: errors.length === 0,
          message:
            errors.length === 0
              ? `WebSearch URL valid: ${site.url}`
              : `Invalid WebSearch URL "${site.url}": ${errors.join("; ")}`,
        });
      }
    }

    return results;
  },
};

export const websearchRules: Rule[] = [websearchSiteLimit, websearchUrlValid];
