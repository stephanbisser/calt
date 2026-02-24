import { describe, it, expect } from "vitest";
import { loadConfig, getEffectiveSeverity } from "../../src/core/config-loader.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Config Loader", () => {
  it("should return defaults when no config file exists", async () => {
    const config = await loadConfig("/nonexistent/.agentlensrc.json");
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("should load and merge config from file", async () => {
    const dir = join(tmpdir(), "agentlens-config-test-" + Date.now());
    await mkdir(dir, { recursive: true });
    const configPath = join(dir, ".agentlensrc.json");
    await writeFile(
      configPath,
      JSON.stringify({
        rules: { "INST-005": "off" },
        instruction_min_length: 100,
      }),
    );

    const config = await loadConfig(configPath);
    expect(config.rules["INST-005"]).toBe("off");
    expect(config.instruction_min_length).toBe(100);
    // Should keep defaults for unspecified values
    expect(config.require_conversation_starters_min).toBe(2);

    await rm(dir, { recursive: true, force: true });
  });
});

describe("getEffectiveSeverity", () => {
  it("should return default severity when no override", () => {
    expect(getEffectiveSeverity("INST-005", "info", DEFAULT_CONFIG)).toBe("info");
  });

  it("should return overridden severity", () => {
    const config = { ...DEFAULT_CONFIG, rules: { "INST-005": "warning" as const } };
    expect(getEffectiveSeverity("INST-005", "info", config)).toBe("warning");
  });

  it("should return 'off' for disabled rules", () => {
    const config = { ...DEFAULT_CONFIG, rules: { "INST-005": "off" as const } };
    expect(getEffectiveSeverity("INST-005", "info", config)).toBe("off");
  });
});
