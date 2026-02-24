import type { Rule, RuleContext, RuleResult, GraphConnectorsCapability } from "../../core/types.js";

export const connectorIdPresent: Rule = {
  id: "KNOW-005",
  name: "connector-id-present",
  description: "GraphConnectors must have valid connection IDs",
  category: "knowledge",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];
    const capabilities = context.manifest.capabilities ?? [];

    const connCaps = capabilities.filter(
      (c): c is GraphConnectorsCapability => c.name === "GraphConnectors",
    );

    for (const cap of connCaps) {
      const connections = cap.connections ?? [];
      if (connections.length === 0) {
        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: "warning",
          passed: false,
          message: "GraphConnectors capability has no connections configured.",
        });
        continue;
      }

      for (const conn of connections) {
        const valid =
          typeof conn.connection_id === "string" &&
          conn.connection_id.trim().length > 0;
        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: this.defaultSeverity,
          passed: valid,
          message: valid
            ? `GraphConnector connection ID present: ${conn.connection_id}`
            : "GraphConnector entry has empty or missing connection_id.",
        });
      }
    }

    return results;
  },
};

export const connectorRules: Rule[] = [connectorIdPresent];
