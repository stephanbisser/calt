// ─── Declarative Agent Manifest Types ────────────────────────────────────────

export interface DeclarativeAgentManifest {
  $schema?: string;
  id?: string;
  version?: string;
  name: string;
  description: string;
  instructions: string;
  conversation_starters?: ConversationStarter[];
  capabilities?: Capability[];
  actions?: AgentAction[];
  behavior_overrides?: BehaviorOverrides;
  disclaimer?: { text: string };
}

export interface ConversationStarter {
  title?: string;
  text: string;
}

export type Capability =
  | WebSearchCapability
  | OneDriveSharePointCapability
  | GraphConnectorsCapability
  | DataverseCapability
  | TeamsMessagesCapability
  | EmailCapability
  | SimpleCapability;

export interface WebSearchCapability {
  name: "WebSearch";
  sites?: { url: string }[];
}

export interface OneDriveSharePointCapability {
  name: "OneDriveAndSharePoint";
  items_by_url?: { url: string }[];
  items_by_sharepoint_ids?: SharePointId[];
}

export interface SharePointId {
  site_id: string;
  web_id?: string;
  list_id?: string;
  unique_id?: string;
}

export interface GraphConnectorsCapability {
  name: "GraphConnectors";
  connections?: { connection_id: string }[];
}

export interface DataverseCapability {
  name: "Dataverse";
  knowledge_sources?: {
    host_name: string;
    skill?: string;
    tables?: { table_name: string }[];
  }[];
}

export interface TeamsMessagesCapability {
  name: "TeamsMessages";
  urls?: { url: string }[];
}

export interface EmailCapability {
  name: "Email";
  shared_mailbox?: string;
  folders?: { folder_id: string }[];
}

export interface SimpleCapability {
  name: "GraphicArt" | "CodeInterpreter" | "People" | "Meetings";
}

export interface AgentAction {
  id: string;
  file: string;
}

export interface BehaviorOverrides {
  suggestions?: { disabled: boolean };
  special_instructions?: { discourage_model_knowledge: boolean };
}

// ─── Agent Type ──────────────────────────────────────────────────────────────

export type AgentType = "agent-builder" | "copilot-studio" | "sharepoint";

// ─── Graph API Response Types ────────────────────────────────────────────────

export interface CopilotPackage {
  id: string;
  displayName: string;
  type: string;
  shortDescription: string;
  longDescription?: string;
  supportedHosts: string[];
  lastModifiedDateTime: string;
  publisher: string;
  version: string;
  manifestVersion?: string;
  isBlocked?: boolean;
  availableTo?: string;
  deployedTo?: string;
  categories?: string[];
}

export interface CopilotPackageDetail extends CopilotPackage {
  elementDetails?: ElementDetail[];
  allowedUsersAndGroups?: string[];
  acquireUsersAndGroups?: string[];
}

export interface ElementDetail {
  elementType: string;
  elements?: ElementEntry[];
}

export interface ElementEntry {
  id: string;
  definition: string; // Escaped JSON string → needs JSON.parse()
}

// ─── Dataverse API Response Types ────────────────────────────────────────────

export enum BotComponentType {
  Topic = 1,
  Skill = 2,
  CustomGptMainInstructions = 15,
}

export interface DataverseBot {
  botid: string;
  name: string;
  description?: string;
  createdon?: string;
  modifiedon?: string;
  schemaname?: string;
  statecode?: number;
}

export interface DataverseBotComponent {
  botcomponentid: string;
  name: string;
  componenttype: number;
  data?: string; // JSON string containing component data
  createdon?: string;
  modifiedon?: string;
  _parentbotid_value?: string;
}

export interface DataverseListResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.context"?: string;
}

// ─── Loaded Agent (unified internal representation) ──────────────────────────

export interface LoadedAgent {
  manifest: DeclarativeAgentManifest;
  source: AgentSource;
  metadata?: AgentMetadata;
  instructionsFilePath?: string;
}

export type AgentSource =
  | { type: "local"; filePath: string; projectType?: ProjectType }
  | { type: "remote"; packageId: string; tenantId?: string }
  | { type: "remote-dataverse"; botId: string; orgUrl: string };

export type ProjectType = "agents-toolkit" | "teams-toolkit" | "standalone-manifest" | "directory";

export interface AgentMetadata {
  packageId?: string;
  publisher?: string;
  version?: string;
  lastModifiedDateTime?: string;
  displayName?: string;
  manifestVersion?: string;
  agentType?: AgentType;
}

// ─── Rule Engine Types ───────────────────────────────────────────────────────

export type Severity = "error" | "warning" | "info";

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  passed: boolean;
  message: string;
  details?: string;
  line?: number;
  column?: number;
  fix?: FixDescriptor;
}

export type FixDescriptor =
  | { type: "remove"; pattern: string }
  | { type: "append-section"; content: string }
  | { type: "replace"; search: string; replacement: string }
  | { type: "remove-starter"; index: number };

export interface FixResult {
  ruleId: string;
  applied: boolean;
  description: string;
}

export interface RuleContext {
  manifest: DeclarativeAgentManifest;
  config: AgentLensConfig;
  source: AgentSource;
  basePath?: string; // For resolving relative file paths (actions)
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  check(context: RuleContext): RuleResult | RuleResult[];
}

export type RuleCategory =
  | "schema"
  | "instructions"
  | "knowledge"
  | "actions"
  | "conversation-starters"
  | "security";

// ─── Scan Report Types ───────────────────────────────────────────────────────

export interface ScanReport {
  agent: {
    name: string;
    schemaVersion?: string;
    source: AgentSource;
    metadata?: AgentMetadata;
  };
  categories: CategoryReport[];
  summary: {
    totalChecks: number;
    passed: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  timestamp: string;
}

export interface CategoryReport {
  name: string;
  category: RuleCategory;
  results: RuleResult[];
  passed: number;
  total: number;
}

// ─── Configuration Types ─────────────────────────────────────────────────────

export interface AgentLensConfig {
  rules: Record<string, Severity | "off">;
  instruction_min_length: number;
  instruction_ideal_range: [number, number];
  custom_blocked_phrases: string[];
  require_conversation_starters_min: number;
  schema_version_target: string;
  graph_api: {
    client_id?: string;
    tenant_id?: string;
  };
  dataverse: {
    org_url?: string;
    org_urls?: string[];
    api_version?: string;
  };
}

export const DEFAULT_CONFIG: AgentLensConfig = {
  rules: {},
  instruction_min_length: 200,
  instruction_ideal_range: [500, 4000],
  custom_blocked_phrases: [],
  require_conversation_starters_min: 2,
  schema_version_target: "v1.6",
  graph_api: {},
  dataverse: {},
};

// ─── Report Format Types ────────────────────────────────────────────────────

export type ReportFormat = "terminal" | "json" | "markdown" | "html";

// ─── Diff Report Types ──────────────────────────────────────────────────────

export interface DiffReport {
  agentA: { name: string; source: AgentSource };
  agentB: { name: string; source: AgentSource };
  sections: DiffSection[];
  summary: { totalChanges: number; additions: number; removals: number; modifications: number };
  timestamp: string;
}

export interface DiffSection {
  name: string;
  changeType: "added" | "removed" | "modified" | "unchanged";
  details: DiffDetail[];
}

export interface DiffDetail {
  field: string;
  changeType: "added" | "removed" | "modified" | "unchanged";
  valueA?: string;
  valueB?: string;
}
