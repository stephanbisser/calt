import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_CONFIG, type AgentLensConfig } from "./types.js";

const CONFIG_FILENAME = ".agentlensrc.json";

export async function loadConfig(configPath?: string): Promise<AgentLensConfig> {
  const filePath = configPath ?? resolve(process.cwd(), CONFIG_FILENAME);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    // File not found → use defaults silently
    return { ...DEFAULT_CONFIG };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AgentLensConfig>;
    return mergeConfig(parsed);
  } catch (err) {
    console.error(
      `Warning: Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}. Using defaults.`,
    );
    return { ...DEFAULT_CONFIG };
  }
}

function mergeConfig(partial: Partial<AgentLensConfig>): AgentLensConfig {
  return {
    rules: { ...DEFAULT_CONFIG.rules, ...partial.rules },
    instruction_min_length:
      partial.instruction_min_length ?? DEFAULT_CONFIG.instruction_min_length,
    instruction_ideal_range:
      partial.instruction_ideal_range ?? DEFAULT_CONFIG.instruction_ideal_range,
    custom_blocked_phrases:
      partial.custom_blocked_phrases ?? DEFAULT_CONFIG.custom_blocked_phrases,
    require_conversation_starters_min:
      partial.require_conversation_starters_min ??
      DEFAULT_CONFIG.require_conversation_starters_min,
    schema_version_target:
      partial.schema_version_target ?? DEFAULT_CONFIG.schema_version_target,
    graph_api: {
      ...DEFAULT_CONFIG.graph_api,
      ...partial.graph_api,
    },
    dataverse: {
      ...DEFAULT_CONFIG.dataverse,
      ...partial.dataverse,
    },
  };
}

export function getDataverseOrgUrls(config: AgentLensConfig): string[] {
  if (config.dataverse.org_urls && config.dataverse.org_urls.length > 0) {
    return config.dataverse.org_urls;
  }
  if (config.dataverse.org_url) {
    return [config.dataverse.org_url];
  }
  return [];
}

export function getEffectiveSeverity(
  ruleId: string,
  defaultSeverity: import("./types.js").Severity,
  config: AgentLensConfig,
): import("./types.js").Severity | "off" {
  const override = config.rules[ruleId];
  if (override !== undefined) return override;
  return defaultSeverity;
}
