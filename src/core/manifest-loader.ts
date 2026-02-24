import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type {
  DeclarativeAgentManifest,
  LoadedAgent,
  AgentSource,
  DataverseBot,
} from "./types.js";
import { BotComponentType } from "./types.js";
import { detectProject } from "./project-detector.js";
import { acquireToken, type AuthConfig } from "../graph/auth.js";
import { GraphClient } from "../graph/client.js";
import { packageToLoadedAgent } from "../graph/transform.js";
import { acquireDataverseToken, type DataverseAuthConfig } from "../dataverse/auth.js";
import { DataverseClient } from "../dataverse/client.js";
import { botToLoadedAgent } from "../dataverse/transform.js";

/**
 * Detects the `$[file('path')]` or `$[file("path")]` pattern used by M365 Agents SDK
 * to reference external instruction files. Returns the relative path if matched, or null.
 */
export function parseFileReference(value: string): string | null {
  const match = value.match(/^\$\[file\((['"])(.*?)\1\)\]$/);
  return match ? match[2] : null;
}

export async function loadFromFile(filePath: string): Promise<LoadedAgent[]> {
  const project = await detectProject(filePath);
  const agents: LoadedAgent[] = [];

  for (const manifestPath of project.manifestPaths) {
    const raw = await readFile(manifestPath, "utf-8");
    let manifest: DeclarativeAgentManifest;
    try {
      manifest = JSON.parse(raw) as DeclarativeAgentManifest;
    } catch (e) {
      throw new Error(
        `Failed to parse ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (!manifest.name && !manifest.instructions) {
      throw new Error(
        `File ${manifestPath} does not appear to be a Declarative Agent manifest. ` +
        `Expected 'name' and 'instructions' fields.`,
      );
    }

    // Resolve external instruction file references (e.g. $[file('instruction.txt')])
    let instructionsFilePath: string | undefined;
    if (manifest.instructions) {
      const relPath = parseFileReference(manifest.instructions);
      if (relPath) {
        const absPath = resolve(dirname(manifestPath), relPath);
        try {
          manifest.instructions = await readFile(absPath, "utf-8");
          instructionsFilePath = absPath;
        } catch (e) {
          throw new Error(
            `Failed to read external instructions file "${relPath}" (resolved to ${absPath}): ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    agents.push({
      manifest,
      source: {
        type: "local",
        filePath: manifestPath,
        projectType: project.type,
      },
      metadata: undefined,
      instructionsFilePath,
    });
  }

  return agents;
}

export async function loadFromRemote(
  packageId: string,
  authConfig: AuthConfig,
): Promise<LoadedAgent> {
  const token = await acquireToken(authConfig);
  const client = new GraphClient(token);
  const detail = await client.getAgentDetails(packageId);
  return packageToLoadedAgent(detail);
}

export async function loadAllFromRemote(
  authConfig: AuthConfig,
): Promise<LoadedAgent[]> {
  const token = await acquireToken(authConfig);
  const client = new GraphClient(token);
  const packages = await client.listCopilotAgents();

  const agents: LoadedAgent[] = [];
  for (const pkg of packages) {
    try {
      const detail = await client.getAgentDetails(pkg.id);
      agents.push(packageToLoadedAgent(detail));
    } catch (e) {
      // Skip agents that can't be parsed (e.g., non-declarative agents)
      console.error(
        `Warning: Could not load agent "${pkg.displayName}" (${pkg.id}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return agents;
}

export async function listRemoteAgents(authConfig: AuthConfig) {
  const token = await acquireToken(authConfig);
  const client = new GraphClient(token);
  return client.listCopilotAgents();
}

// ─── Dataverse (Copilot Studio) ─────────────────────────────────────────────

export async function listDataverseBots(
  dvConfig: DataverseAuthConfig,
): Promise<DataverseBot[]> {
  const token = await acquireDataverseToken(dvConfig);
  const client = new DataverseClient(token, dvConfig.orgUrl);
  return client.listBots();
}

export async function loadFromDataverse(
  botId: string,
  dvConfig: DataverseAuthConfig,
): Promise<LoadedAgent> {
  const token = await acquireDataverseToken(dvConfig);
  const client = new DataverseClient(token, dvConfig.orgUrl);
  const bot = await client.getBot(botId);
  const components = await client.getBotComponents(
    botId,
    BotComponentType.CustomGptMainInstructions,
  );
  return botToLoadedAgent(bot, components, dvConfig.orgUrl);
}

export async function loadAllFromDataverse(
  dvConfig: DataverseAuthConfig,
): Promise<LoadedAgent[]> {
  const token = await acquireDataverseToken(dvConfig);
  const client = new DataverseClient(token, dvConfig.orgUrl);
  const bots = await client.listBots();

  const agents: LoadedAgent[] = [];
  for (const bot of bots) {
    try {
      const components = await client.getBotComponents(
        bot.botid,
        BotComponentType.CustomGptMainInstructions,
      );
      agents.push(botToLoadedAgent(bot, components, dvConfig.orgUrl));
    } catch (e) {
      console.error(
        `Warning: Could not load Copilot Studio bot "${bot.name}" (${bot.botid}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return agents;
}

// ─── Multi-environment helpers ──────────────────────────────────────────────

export async function listDataverseBotsAllEnvs(
  authConfig: { clientId?: string; tenantId?: string },
  orgUrls: string[],
): Promise<{ bot: DataverseBot; orgUrl: string }[]> {
  const results = await Promise.allSettled(
    orgUrls.map(async (orgUrl) => {
      const dvConfig: DataverseAuthConfig = {
        clientId: authConfig.clientId,
        tenantId: authConfig.tenantId,
        orgUrl,
      };
      const bots = await listDataverseBots(dvConfig);
      return bots.map((bot) => ({ bot, orgUrl }));
    }),
  );

  const merged: { bot: DataverseBot; orgUrl: string }[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
    } else {
      console.error(
        `Warning: Could not list bots from an environment: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      );
    }
  }
  return merged;
}

export async function loadAllFromDataverseAllEnvs(
  authConfig: { clientId?: string; tenantId?: string },
  orgUrls: string[],
): Promise<LoadedAgent[]> {
  const results = await Promise.allSettled(
    orgUrls.map(async (orgUrl) => {
      const dvConfig: DataverseAuthConfig = {
        clientId: authConfig.clientId,
        tenantId: authConfig.tenantId,
        orgUrl,
      };
      return loadAllFromDataverse(dvConfig);
    }),
  );

  const merged: LoadedAgent[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
    } else {
      console.error(
        `Warning: Could not load bots from an environment: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      );
    }
  }
  return merged;
}

export async function loadFromDataverseAnyEnv(
  botId: string,
  authConfig: { clientId?: string; tenantId?: string },
  orgUrls: string[],
): Promise<LoadedAgent> {
  for (const orgUrl of orgUrls) {
    try {
      const dvConfig: DataverseAuthConfig = {
        clientId: authConfig.clientId,
        tenantId: authConfig.tenantId,
        orgUrl,
      };
      return await loadFromDataverse(botId, dvConfig);
    } catch {
      // Bot not found in this environment — try next
    }
  }
  throw new Error(
    `Bot ${botId} not found in any configured Dataverse environment (${orgUrls.length} checked).`,
  );
}
