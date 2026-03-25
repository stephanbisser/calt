import chalk from "chalk";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../core/config-loader.js";
import { AgentLensError } from "../core/errors.js";
import {
  listRemoteAgents,
  loadFromRemote,
  loadAllFromRemote,
  listDataverseBotsAllEnvs,
  loadAllFromDataverseAllEnvs,
  loadFromDataverseAnyEnv,
} from "../core/manifest-loader.js";
import {
  formatAgentTable,
  copilotPackageToSummary,
  dataverseBotToSummary,
  type RemoteAgentSummary,
} from "../formatters/terminal-formatter.js";
import { slugify, classifyAgentType, extractManifestFromPackage } from "../graph/transform.js";
import type { AuthConfig } from "../graph/auth.js";
import { resolveAuth, needsGraph, needsDataverse, type TypeFilter } from "./shared/resolve-agents.js";

export async function fetchCommand(options: {
  list?: boolean;
  id?: string;
  all?: boolean;
  output?: string;
  config?: string;
  clientId?: string;
  tenant?: string;
  type?: TypeFilter;
  orgUrl?: string;
}): Promise<void> {
  const cfg = await loadConfig(options.config);
  const { authConfig, orgUrls, typeFilter } = resolveAuth(options, cfg);

  if (options.list) {
    await handleList(authConfig, orgUrls, typeFilter);
  } else if (options.id) {
    await handleFetchOne(options.id, authConfig, orgUrls, typeFilter, options.output);
  } else if (options.all) {
    await handleFetchAll(authConfig, orgUrls, typeFilter, options.output);
  } else {
    console.log(chalk.yellow("\nSpecify --list, --id <id>, or --all.\n"));
    console.log(chalk.gray("Examples:"));
    console.log(chalk.gray("  calt fetch --list"));
    console.log(chalk.gray("  calt fetch --list --type copilot-studio"));
    console.log(chalk.gray("  calt fetch --id T_cebfd158-7116-1e34-27f5-0efca5f046f0"));
    console.log(chalk.gray("  calt fetch --all --output ./agents/"));
    throw new AgentLensError("No fetch action specified. Use --list, --id <id>, or --all.");
  }
}

async function handleList(
  authConfig: AuthConfig,
  orgUrls: string[],
  typeFilter: TypeFilter,
): Promise<void> {
  const summaries: RemoteAgentSummary[] = [];

  // Graph API agents (agent-builder + sharepoint)
  if (needsGraph(typeFilter)) {
    const packages = await listRemoteAgents(authConfig);

    if (typeFilter === "sharepoint") {
      const { GraphClient } = await import("../graph/client.js");
      const { acquireToken } = await import("../graph/auth.js");
      const token = await acquireToken(authConfig);
      const client = new GraphClient(token);
      for (const pkg of packages) {
        try {
          const detail = await client.getAgentDetails(pkg.id);
          const manifest = extractManifestFromPackage(detail);
          if (manifest) {
            const agentType = classifyAgentType(manifest);
            if (agentType === "sharepoint") {
              summaries.push(copilotPackageToSummary(pkg, "sharepoint"));
            }
          }
        } catch {
          // Skip agents that can't be parsed
        }
      }
    } else if (typeFilter === "agent-builder") {
      const { GraphClient } = await import("../graph/client.js");
      const { acquireToken } = await import("../graph/auth.js");
      const token = await acquireToken(authConfig);
      const client = new GraphClient(token);
      for (const pkg of packages) {
        try {
          const detail = await client.getAgentDetails(pkg.id);
          const manifest = extractManifestFromPackage(detail);
          if (manifest) {
            const agentType = classifyAgentType(manifest);
            if (agentType === "agent-builder") {
              summaries.push(copilotPackageToSummary(pkg, "agent-builder"));
            }
          }
        } catch {
          // Skip agents that can't be parsed
        }
      }
    } else {
      // typeFilter === "all" — include all Graph agents with proper classification
      const { GraphClient } = await import("../graph/client.js");
      const { acquireToken } = await import("../graph/auth.js");
      const token = await acquireToken(authConfig);
      const client = new GraphClient(token);
      for (const pkg of packages) {
        try {
          const detail = await client.getAgentDetails(pkg.id);
          const manifest = extractManifestFromPackage(detail);
          if (manifest) {
            const agentType = classifyAgentType(manifest);
            summaries.push(copilotPackageToSummary(pkg, agentType));
          }
        } catch {
          // Skip; include as agent-builder anyway
          summaries.push(copilotPackageToSummary(pkg, "agent-builder"));
        }
      }
    }
  }

  // Dataverse agents (copilot-studio) — iterate all environments
  if (needsDataverse(typeFilter)) {
    if (orgUrls.length > 0) {
      const botsWithEnv = await listDataverseBotsAllEnvs(authConfig, orgUrls);
      // Include environment info when there are multiple environments
      const showEnv = orgUrls.length > 1;
      summaries.push(
        ...botsWithEnv.map(({ bot, orgUrl }) =>
          dataverseBotToSummary(bot, showEnv ? orgUrl : undefined),
        ),
      );
    } else if (typeFilter === "copilot-studio") {
      throw new AgentLensError(
        "Dataverse not configured. Set 'dataverse.org_url' or 'dataverse.org_urls' in .caltrc.json, or use --org-url.",
      );
    } else {
      // typeFilter === "all" — just skip Dataverse with info message
      console.log(
        chalk.gray("  (Skipping Copilot Studio agents – no Dataverse org URL configured)"),
      );
    }
  }

  console.log(formatAgentTable(summaries));
}

async function handleFetchOne(
  id: string,
  authConfig: AuthConfig,
  orgUrls: string[],
  typeFilter: TypeFilter,
  outputDir?: string,
): Promise<void> {
  console.log(chalk.cyan(`\nFetching agent ${id}...`));

  // Auto-detect source by ID format: T_ or P_ prefix = Graph, plain GUID = Dataverse
  const isGraphId = id.startsWith("T_") || id.startsWith("P_");
  const useDataverse =
    typeFilter === "copilot-studio" || (!isGraphId && typeFilter !== "agent-builder");

  if (useDataverse) {
    if (orgUrls.length === 0) {
      throw new AgentLensError(
        "Dataverse not configured. Set 'dataverse.org_url' or 'dataverse.org_urls' in .caltrc.json, or use --org-url.",
      );
    }

    // Search across all configured environments
    const agent = await loadFromDataverseAnyEnv(id, authConfig, orgUrls);
    const name = agent.manifest.name ?? "bot";
    const filename = `${slugify(name)}.copilotStudioAgent.json`;
    const dir = outputDir ?? ".";
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, filename);

    await writeFile(filePath, JSON.stringify(agent.manifest, null, 2));
    console.log(chalk.green(`✓ Saved: ${filePath}`));

    if (agent.metadata) {
      const metaPath = join(dir, `${slugify(name)}.meta.json`);
      await writeFile(metaPath, JSON.stringify(agent.metadata, null, 2));
      console.log(chalk.gray(`  Metadata: ${metaPath}`));
    }
  } else {
    const agent = await loadFromRemote(id, authConfig);
    const name = agent.manifest.name ?? "agent";
    const filename = `${slugify(name)}.declarativeAgent.json`;
    const dir = outputDir ?? ".";
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, filename);

    await writeFile(filePath, JSON.stringify(agent.manifest, null, 2));
    console.log(chalk.green(`✓ Saved: ${filePath}`));

    if (agent.metadata) {
      const metaPath = join(dir, `${slugify(name)}.meta.json`);
      await writeFile(metaPath, JSON.stringify(agent.metadata, null, 2));
      console.log(chalk.gray(`  Metadata: ${metaPath}`));
    }
  }

  console.log("");
}

async function handleFetchAll(
  authConfig: AuthConfig,
  orgUrls: string[],
  typeFilter: TypeFilter,
  outputDir?: string,
): Promise<void> {
  const dir = outputDir ?? "./agents";
  await mkdir(dir, { recursive: true });

  console.log(chalk.cyan("\nFetching all agents from tenant..."));

  let totalSaved = 0;

  // Graph API agents
  if (needsGraph(typeFilter)) {
    const agents = await loadAllFromRemote(authConfig);

    for (const agent of agents) {
      const agentType = agent.metadata?.agentType ?? "agent-builder";

      // Apply type filter
      if (typeFilter === "sharepoint" && agentType !== "sharepoint") continue;
      if (typeFilter === "agent-builder" && agentType !== "agent-builder") continue;

      const name = agent.manifest.name ?? "agent";
      const filename = `${slugify(name)}.declarativeAgent.json`;
      const filePath = join(dir, filename);

      await writeFile(filePath, JSON.stringify(agent.manifest, null, 2));
      console.log(chalk.green(`  ✓ ${filename}`));

      if (agent.metadata) {
        const metaPath = join(dir, `${slugify(name)}.meta.json`);
        await writeFile(metaPath, JSON.stringify(agent.metadata, null, 2));
      }
      totalSaved++;
    }
  }

  // Dataverse agents — iterate all environments
  if (needsDataverse(typeFilter)) {
    if (orgUrls.length > 0) {
      const agents = await loadAllFromDataverseAllEnvs(authConfig, orgUrls);
      for (const agent of agents) {
        const name = agent.manifest.name ?? "bot";
        const filename = `${slugify(name)}.copilotStudioAgent.json`;
        const filePath = join(dir, filename);

        await writeFile(filePath, JSON.stringify(agent.manifest, null, 2));
        console.log(chalk.green(`  ✓ ${filename}`));

        if (agent.metadata) {
          const metaPath = join(dir, `${slugify(name)}.meta.json`);
          await writeFile(metaPath, JSON.stringify(agent.metadata, null, 2));
        }
        totalSaved++;
      }
    } else if (typeFilter === "copilot-studio") {
      throw new AgentLensError(
        "Dataverse not configured. Set 'dataverse.org_url' or 'dataverse.org_urls' in .caltrc.json, or use --org-url.",
      );
    } else {
      console.log(
        chalk.gray("  (Skipping Copilot Studio agents – no Dataverse org URL configured)"),
      );
    }
  }

  console.log(chalk.green(`\n✓ Saved ${totalSaved} agent(s) to ${dir}/\n`));
}
