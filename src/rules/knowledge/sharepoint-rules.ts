import type { Rule, RuleContext, RuleResult, OneDriveSharePointCapability } from "../../core/types.js";
import { isSharePointUrl, isOneDriveUrl, isAbsoluteUrl } from "../../utils/url-validator.js";

export const sharepointUrlValid: Rule = {
  id: "KNOW-001",
  name: "sharepoint-url-valid",
  description: "SharePoint/OneDrive URLs must be well-formed absolute URLs",
  category: "knowledge",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];
    const capabilities = context.manifest.capabilities ?? [];

    const spCaps = capabilities.filter(
      (c): c is OneDriveSharePointCapability => c.name === "OneDriveAndSharePoint",
    );

    if (spCaps.length === 0) return results;

    for (const cap of spCaps) {
      for (const item of cap.items_by_url ?? []) {
        const valid = isAbsoluteUrl(item.url) && (isSharePointUrl(item.url) || isOneDriveUrl(item.url));
        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: this.defaultSeverity,
          passed: valid,
          message: valid
            ? `SharePoint URL well-formed (${item.url}).`
            : `Invalid SharePoint/OneDrive URL: ${item.url}`,
          details: valid
            ? undefined
            : "URL must be an absolute https:// URL pointing to a *.sharepoint.com or OneDrive domain.",
        });
      }
    }

    return results;
  },
};

export const sharepointIdsPresent: Rule = {
  id: "KNOW-002",
  name: "sharepoint-ids-present",
  description: "OneDriveAndSharePoint configured with valid SharePoint IDs",
  category: "knowledge",
  defaultSeverity: "info",
  check(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];
    const capabilities = context.manifest.capabilities ?? [];

    const spCaps = capabilities.filter(
      (c): c is OneDriveSharePointCapability => c.name === "OneDriveAndSharePoint",
    );

    if (spCaps.length === 0) return results;

    for (const cap of spCaps) {
      const hasUrls = (cap.items_by_url?.length ?? 0) > 0;
      const hasIds = (cap.items_by_sharepoint_ids?.length ?? 0) > 0;

      if (hasIds) {
        for (const spId of cap.items_by_sharepoint_ids!) {
          const hasSiteId = typeof spId.site_id === "string" && spId.site_id.length > 0;
          results.push({
            ruleId: this.id,
            ruleName: this.name,
            severity: this.defaultSeverity,
            passed: hasSiteId,
            message: hasSiteId
              ? "OneDriveAndSharePoint configured with SharePoint IDs."
              : "SharePoint ID entry missing site_id.",
          });
        }
      }

      if (!hasUrls && !hasIds) {
        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: this.defaultSeverity,
          passed: false,
          message:
            "OneDriveAndSharePoint capability has no items_by_url or items_by_sharepoint_ids configured.",
        });
      }
    }

    return results;
  },
};

export const sharepointRules: Rule[] = [sharepointUrlValid, sharepointIdsPresent];
