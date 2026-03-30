import type {
  Rule,
  RuleContext,
  RuleResult,
  RuleCategory,
  ScanReport,
  CategoryReport,
  Severity,
  LoadedAgent,
  AgentLensConfig,
} from "../core/types.js";
import { getEffectiveSeverity } from "../core/config-loader.js";
import { schemaRules } from "./schema/schema-validator.js";
import { lengthRules } from "./instructions/length-rules.js";
import { structureRules } from "./instructions/structure-rules.js";
import { languageRules } from "./instructions/language-rules.js";
import { referenceRules } from "./instructions/reference-rules.js";
import { sharepointRules } from "./knowledge/sharepoint-rules.js";
import { websearchRules } from "./knowledge/websearch-rules.js";
import { connectorRules } from "./knowledge/connector-rules.js";
import { actionRules, checkActionFilesExist } from "./actions/action-rules.js";
import { checkPluginManifests } from "./actions/plugin-validation-rules.js";
import { starterRules } from "./conversation-starters/starter-rules.js";
import { promptInjectionRules } from "./security/prompt-injection-rules.js";
import { sensitiveInfoRules } from "./security/sensitive-info-rules.js";
import { supplyChainRules } from "./security/supply-chain-rules.js";
import { agencyRules } from "./security/agency-rules.js";
import { promptLeakageRules } from "./security/prompt-leakage-rules.js";
import { groundingRules } from "./security/grounding-rules.js";
import { complexityRules } from "./instructions/complexity-rules.js";
import { alignmentRules } from "./instructions/alignment-rules.js";

const ALL_RULES: Rule[] = [
  ...schemaRules,
  ...lengthRules,
  ...structureRules,
  ...languageRules,
  ...referenceRules,
  ...complexityRules,
  ...alignmentRules,
  ...sharepointRules,
  ...websearchRules,
  ...connectorRules,
  ...actionRules,
  ...starterRules,
  ...promptInjectionRules,
  ...sensitiveInfoRules,
  ...supplyChainRules,
  ...agencyRules,
  ...promptLeakageRules,
  ...groundingRules,
];

const INSTRUCTION_RULES: Rule[] = [
  ...lengthRules,
  ...structureRules,
  ...languageRules,
  ...referenceRules,
  ...complexityRules,
  ...alignmentRules,
];

const CATEGORY_NAMES: Record<RuleCategory, string> = {
  schema: "Schema Validation",
  instructions: "Instruction Quality",
  knowledge: "Knowledge Sources",
  actions: "Actions",
  "conversation-starters": "Conversation Starters",
  security: "Security (OWASP LLM Top 10)",
};

// Pre-computed map from rule ID → category (avoids rebuilding on every call)
const ruleIdToCategory = new Map<string, RuleCategory>();
for (const rule of ALL_RULES) {
  ruleIdToCategory.set(rule.id, rule.category);
}

function runRules(
  rules: Rule[],
  context: RuleContext,
): RuleResult[] {
  const results: RuleResult[] = [];

  for (const rule of rules) {
    const severity = getEffectiveSeverity(
      rule.id,
      rule.defaultSeverity,
      context.config,
    );
    if (severity === "off") continue;

    const ruleResults = rule.check(context);
    const resultsArray = Array.isArray(ruleResults) ? ruleResults : [ruleResults];

    for (const result of resultsArray) {
      results.push({
        ...result,
        severity: severity as Severity,
      });
    }
  }

  return results;
}

function buildSummary(results: RuleResult[]) {
  return {
    totalChecks: results.length,
    passed: results.filter((r) => r.passed).length,
    errors: results.filter((r) => !r.passed && r.severity === "error").length,
    warnings: results.filter((r) => !r.passed && r.severity === "warning").length,
    infos: results.filter((r) => !r.passed && r.severity === "info").length,
  };
}

// Copilot Studio agents use a different manifest format — schema validation,
// knowledge sources, actions, and conversation starters are Declarative Agent
// concepts that don't apply.  Only instruction quality + security rules run.
const COPILOT_STUDIO_RULES: Rule[] = [
  ...lengthRules,
  ...structureRules,
  ...languageRules,
  ...referenceRules,
  ...complexityRules,
  ...alignmentRules,
  ...promptInjectionRules,
  ...sensitiveInfoRules,
  ...supplyChainRules,
  ...agencyRules,
  ...promptLeakageRules,
  ...groundingRules,
];

export async function runFullScan(
  agent: LoadedAgent,
  config: AgentLensConfig,
): Promise<ScanReport> {
  const isCopilotStudio = agent.source.type === "remote-dataverse";

  const context: RuleContext = {
    manifest: agent.manifest,
    config,
    source: agent.source,
    basePath:
      agent.source.type === "local"
        ? agent.source.filePath.replace(/[/\\][^/\\]+$/, "")
        : undefined,
  };

  const rulesToRun = isCopilotStudio ? COPILOT_STUDIO_RULES : ALL_RULES;
  const results = runRules(rulesToRun, context);

  // Run async checks (action file existence + plugin validation) — only for Declarative Agents
  if (!isCopilotStudio) {
    const asyncResults = await checkActionFilesExist(context);
    // Replace placeholder results from ACT-001 with actual file check results
    if (asyncResults.length > 0) {
      const filteredResults = results.filter((r) => r.ruleId !== "ACT-001");
      filteredResults.push(...asyncResults);
      results.splice(0, results.length, ...filteredResults);
    }

    const pluginResults = await checkPluginManifests(context);
    results.push(...pluginResults);
  }

  const categories: RuleCategory[] = isCopilotStudio
    ? ["instructions", "security"]
    : ["schema", "instructions", "knowledge", "actions", "conversation-starters", "security"];

  const categoryReports = categories
    .map((cat) => buildCategoryReportFromResults(cat, results))
    .filter((cr) => cr.results.length > 0);

  const summary = buildSummary(results);

  return {
    agent: {
      name: agent.manifest.name,
      schemaVersion: agent.manifest.version,
      source: agent.source,
      metadata: agent.metadata,
    },
    categories: categoryReports,
    summary,
    timestamp: new Date().toISOString(),
  };
}

export function runInstructionLint(
  agent: LoadedAgent,
  config: AgentLensConfig,
): ScanReport {
  const context: RuleContext = {
    manifest: agent.manifest,
    config,
    source: agent.source,
  };

  const results = runRules(INSTRUCTION_RULES, context);

  const categoryReport = buildCategoryReportFromResults("instructions", results);

  const summary = buildSummary(results);

  return {
    agent: {
      name: agent.manifest.name,
      schemaVersion: agent.manifest.version,
      source: agent.source,
      metadata: agent.metadata,
    },
    categories: [categoryReport],
    summary,
    timestamp: new Date().toISOString(),
  };
}

export function runSchemaValidation(
  agent: LoadedAgent,
  config: AgentLensConfig,
): ScanReport {
  const context: RuleContext = {
    manifest: agent.manifest,
    config,
    source: agent.source,
  };

  const results = runRules(schemaRules, context);
  const categoryReport = buildCategoryReportFromResults("schema", results);

  const summary = buildSummary(results);

  return {
    agent: {
      name: agent.manifest.name,
      schemaVersion: agent.manifest.version,
      source: agent.source,
      metadata: agent.metadata,
    },
    categories: [categoryReport],
    summary,
    timestamp: new Date().toISOString(),
  };
}

function buildCategoryReportFromResults(
  category: RuleCategory,
  allResults: RuleResult[],
): CategoryReport {
  const categoryResults = allResults.filter(
    (r) => ruleIdToCategory.get(r.ruleId) === category,
  );

  return {
    name: CATEGORY_NAMES[category],
    category,
    results: categoryResults,
    passed: categoryResults.filter((r) => r.passed).length,
    total: categoryResults.length,
  };
}
