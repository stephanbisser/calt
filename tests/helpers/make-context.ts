import { DEFAULT_CONFIG, type RuleContext, type DeclarativeAgentManifest } from "../../src/core/types.js";

export function makeContext(
  manifest: Partial<DeclarativeAgentManifest>,
  options?: { basePath?: string },
): RuleContext {
  const full: DeclarativeAgentManifest = {
    name: "Test Agent",
    description: "Test",
    instructions: "",
    ...manifest,
  };
  return {
    manifest: full,
    config: { ...DEFAULT_CONFIG },
    source: { type: "local", filePath: options?.basePath ? `${options.basePath}/agent.json` : "/test/agent.json" },
    basePath: options?.basePath,
  };
}
