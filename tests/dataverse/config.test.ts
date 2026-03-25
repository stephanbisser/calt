import { describe, it, expect } from "vitest";
import { loadConfig, getDataverseOrgUrls } from "../../src/core/config-loader.js";
import { DEFAULT_CONFIG, type AgentLensConfig } from "../../src/core/types.js";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Config Loader – Dataverse section", () => {
  it("should have dataverse with empty defaults", () => {
    expect(DEFAULT_CONFIG.dataverse).toEqual({});
    expect(DEFAULT_CONFIG.dataverse.org_url).toBeUndefined();
  });

  it("should return defaults when no config file exists", async () => {
    const config = await loadConfig("/nonexistent/.caltrc.json");
    expect(config.dataverse).toEqual({});
  });

  it("should load dataverse.org_url from config file", async () => {
    const dir = join(tmpdir(), "agentlens-dv-config-test-" + Date.now());
    await mkdir(dir, { recursive: true });
    const configPath = join(dir, ".caltrc.json");
    await writeFile(
      configPath,
      JSON.stringify({
        dataverse: {
          org_url: "https://myorg.api.crm.dynamics.com",
        },
      }),
    );

    const config = await loadConfig(configPath);
    expect(config.dataverse.org_url).toBe("https://myorg.api.crm.dynamics.com");
    // Should keep defaults for other sections
    expect(config.instruction_min_length).toBe(200);
    expect(config.graph_api).toEqual({});

    await rm(dir, { recursive: true, force: true });
  });

  it("should merge dataverse config with defaults", async () => {
    const dir = join(tmpdir(), "agentlens-dv-merge-test-" + Date.now());
    await mkdir(dir, { recursive: true });
    const configPath = join(dir, ".caltrc.json");
    await writeFile(
      configPath,
      JSON.stringify({
        graph_api: { client_id: "test-client" },
        dataverse: { org_url: "https://org.crm.dynamics.com" },
        instruction_min_length: 300,
      }),
    );

    const config = await loadConfig(configPath);
    expect(config.graph_api.client_id).toBe("test-client");
    expect(config.dataverse.org_url).toBe("https://org.crm.dynamics.com");
    expect(config.instruction_min_length).toBe(300);

    await rm(dir, { recursive: true, force: true });
  });

  it("should load dataverse.org_urls from config file", async () => {
    const dir = join(tmpdir(), "agentlens-dv-orgurls-test-" + Date.now());
    await mkdir(dir, { recursive: true });
    const configPath = join(dir, ".caltrc.json");
    await writeFile(
      configPath,
      JSON.stringify({
        dataverse: {
          org_urls: [
            "https://org1.api.crm4.dynamics.com",
            "https://org2.api.crm.dynamics.com",
          ],
        },
      }),
    );

    const config = await loadConfig(configPath);
    expect(config.dataverse.org_urls).toEqual([
      "https://org1.api.crm4.dynamics.com",
      "https://org2.api.crm.dynamics.com",
    ]);

    await rm(dir, { recursive: true, force: true });
  });
});

describe("getDataverseOrgUrls", () => {
  it("should return empty array when neither org_url nor org_urls is set", () => {
    expect(getDataverseOrgUrls(DEFAULT_CONFIG)).toEqual([]);
  });

  it("should return [org_url] when only org_url is set", () => {
    const config: AgentLensConfig = {
      ...DEFAULT_CONFIG,
      dataverse: { org_url: "https://myorg.api.crm.dynamics.com" },
    };
    expect(getDataverseOrgUrls(config)).toEqual(["https://myorg.api.crm.dynamics.com"]);
  });

  it("should return org_urls when set", () => {
    const config: AgentLensConfig = {
      ...DEFAULT_CONFIG,
      dataverse: {
        org_urls: [
          "https://org1.api.crm4.dynamics.com",
          "https://org2.api.crm.dynamics.com",
        ],
      },
    };
    expect(getDataverseOrgUrls(config)).toEqual([
      "https://org1.api.crm4.dynamics.com",
      "https://org2.api.crm.dynamics.com",
    ]);
  });

  it("should prefer org_urls over org_url when both are set", () => {
    const config: AgentLensConfig = {
      ...DEFAULT_CONFIG,
      dataverse: {
        org_url: "https://old.api.crm.dynamics.com",
        org_urls: [
          "https://new1.api.crm4.dynamics.com",
          "https://new2.api.crm.dynamics.com",
        ],
      },
    };
    expect(getDataverseOrgUrls(config)).toEqual([
      "https://new1.api.crm4.dynamics.com",
      "https://new2.api.crm.dynamics.com",
    ]);
  });

  it("should fall back to org_url when org_urls is empty array", () => {
    const config: AgentLensConfig = {
      ...DEFAULT_CONFIG,
      dataverse: {
        org_url: "https://fallback.api.crm.dynamics.com",
        org_urls: [],
      },
    };
    expect(getDataverseOrgUrls(config)).toEqual(["https://fallback.api.crm.dynamics.com"]);
  });
});
