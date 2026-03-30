import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_CONFIG, type AgentLensConfig } from "./types.js";

const CONFIG_FILENAME = ".caltrc.json";

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
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `Warning: Failed to parse config file ${filePath} (${detail}). Falling back to default configuration.`,
    );
    return { ...DEFAULT_CONFIG };
  }
}

function mergeConfig(partial: Partial<AgentLensConfig>): AgentLensConfig {
  let minLength = partial.instruction_min_length ?? DEFAULT_CONFIG.instruction_min_length;
  if (partial.instruction_min_length !== undefined) {
    if (typeof partial.instruction_min_length !== "number" || partial.instruction_min_length <= 0) {
      console.warn(
        `Warning: "instruction_min_length" must be a positive number (got ${JSON.stringify(partial.instruction_min_length)}). Using default (${DEFAULT_CONFIG.instruction_min_length}).`,
      );
      minLength = DEFAULT_CONFIG.instruction_min_length;
    }
  }

  let idealRange = partial.instruction_ideal_range ?? DEFAULT_CONFIG.instruction_ideal_range;
  if (partial.instruction_ideal_range !== undefined) {
    const r = partial.instruction_ideal_range;
    if (
      !Array.isArray(r) ||
      r.length !== 2 ||
      typeof r[0] !== "number" ||
      typeof r[1] !== "number" ||
      r[0] >= r[1]
    ) {
      console.warn(
        `Warning: "instruction_ideal_range" must be a [min, max] tuple where min < max (got ${JSON.stringify(r)}). Using default (${JSON.stringify(DEFAULT_CONFIG.instruction_ideal_range)}).`,
      );
      idealRange = DEFAULT_CONFIG.instruction_ideal_range;
    }
  }

  return {
    rules: { ...DEFAULT_CONFIG.rules, ...partial.rules },
    instruction_min_length: minLength,
    instruction_ideal_range: idealRange,
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
