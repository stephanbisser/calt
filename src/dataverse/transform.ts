import type {
  DataverseBot,
  DataverseBotComponent,
  DeclarativeAgentManifest,
  LoadedAgent,
  AgentMetadata,
} from "../core/types.js";
import { BotComponentType } from "../core/types.js";

/**
 * Extract the instructions string from a component's `data` JSON field.
 * The data field is a JSON string; we look for an `instructions` key.
 */
function extractInstructions(component: DataverseBotComponent): string {
  if (!component.data) return "";

  try {
    const parsed = JSON.parse(component.data) as Record<string, unknown>;
    if (typeof parsed.instructions === "string") {
      return parsed.instructions;
    }
    // Some components store instructions under different keys
    if (typeof parsed.content === "string") {
      return parsed.content;
    }
  } catch {
    // If data isn't valid JSON, return it as-is (might be raw text)
    return component.data;
  }

  return "";
}

/**
 * Convert a Dataverse bot and its instruction components into a LoadedAgent.
 */
export function botToLoadedAgent(
  bot: DataverseBot,
  components: DataverseBotComponent[],
  orgUrl: string,
): LoadedAgent {
  // Prefer CustomGptMainInstructions (componenttype=15)
  const instructionComponents = components.filter(
    (c) => c.componenttype === BotComponentType.CustomGptMainInstructions,
  );

  // Fall back to all components if no type-15 found
  const relevantComponents =
    instructionComponents.length > 0 ? instructionComponents : components;

  // Combine instructions from all relevant components
  const instructions = relevantComponents
    .map((c) => extractInstructions(c))
    .filter((s) => s.length > 0)
    .join("\n\n");

  const manifest: DeclarativeAgentManifest = {
    name: bot.name,
    description: bot.description ?? "",
    instructions: instructions || "(no instructions found)",
  };

  const metadata: AgentMetadata = {
    displayName: bot.name,
    lastModifiedDateTime: bot.modifiedon,
    agentType: "copilot-studio",
  };

  return {
    manifest,
    source: { type: "remote-dataverse", botId: bot.botid, orgUrl },
    metadata,
  };
}
