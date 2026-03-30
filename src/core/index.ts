// Public API for VS Code extension and programmatic use
export type {
  DeclarativeAgentManifest,
  ConversationStarter,
  Capability,
  AgentAction,
  LoadedAgent,
  AgentSource,
  AgentMetadata,
  AgentType,
  DataverseBot,
  DataverseBotComponent,
  ScanReport,
  CategoryReport,
  RuleResult,
  Severity,
  AgentLensConfig,
  ReportFormat,
  FixDescriptor,
  FixResult,
  DiffReport,
  DiffSection,
  DiffDetail,
} from "./types.js";

export { DEFAULT_CONFIG, BotComponentType } from "./types.js";
export { loadConfig, getDataverseOrgUrls } from "./config-loader.js";
export { parseFileReference, loadFromFile, loadFromRemote, loadAllFromRemote, listRemoteAgents, loadFromDataverse, loadAllFromDataverse, listDataverseBots, listDataverseBotsAllEnvs, loadAllFromDataverseAllEnvs, loadFromDataverseAnyEnv } from "./manifest-loader.js";
export { detectProject } from "./project-detector.js";
export { runFullScan, runInstructionLint, runSchemaValidation } from "../rules/rule-engine.js";
export { formatScanReport, formatLintReport, formatAgentTable } from "../formatters/terminal-formatter.js";
export { formatAsJson } from "../formatters/json-formatter.js";
export { formatAsMarkdown } from "../formatters/markdown-formatter.js";
export { formatAsHtml } from "../formatters/html-formatter.js";
export { diffManifests } from "./differ.js";
export { applyFixes } from "./fixer.js";
export { formatDiff } from "../formatters/diff-formatter.js";
export { formatDiffAsJson } from "../formatters/json-formatter.js";
export { formatDiffAsMarkdown } from "../formatters/markdown-formatter.js";
