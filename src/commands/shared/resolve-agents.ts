import { getDataverseOrgUrls } from "../../core/config-loader.js";
import { AgentLensError } from "../../core/errors.js";
import {
  loadFromFile,
  loadFromRemote,
  loadAllFromRemote,
  loadAllFromDataverseAllEnvs,
  loadFromDataverseAnyEnv,
} from "../../core/manifest-loader.js";
import type { AuthConfig } from "../../graph/auth.js";
import type { AgentType, AgentLensConfig, LoadedAgent } from "../../core/types.js";

// T_ = Teams app package ID, P_ = Published agent ID (Graph API identifiers)
const GRAPH_AGENT_PREFIXES = ["T_", "P_"];

export type TypeFilter = AgentType | "all";

export interface RemoteOptions {
  remote?: boolean;
  id?: string;
  all?: boolean;
  clientId?: string;
  tenant?: string;
  type?: TypeFilter;
  orgUrl?: string;
}

export interface ResolvedAuth {
  authConfig: AuthConfig;
  orgUrls: string[];
  typeFilter: TypeFilter;
}

export function needsGraph(typeFilter: TypeFilter): boolean {
  return typeFilter === "all" || typeFilter === "agent-builder" || typeFilter === "sharepoint";
}

export function needsDataverse(typeFilter: TypeFilter): boolean {
  return typeFilter === "all" || typeFilter === "copilot-studio";
}

export function resolveAuth(options: RemoteOptions, cfg: AgentLensConfig): ResolvedAuth {
  const authConfig: AuthConfig = {
    clientId: options.clientId ?? cfg.graph_api.client_id,
    tenantId: options.tenant ?? cfg.graph_api.tenant_id,
  };

  const orgUrls: string[] = options.orgUrl
    ? [options.orgUrl]
    : getDataverseOrgUrls(cfg);

  const typeFilter: TypeFilter = options.type ?? "all";

  return { authConfig, orgUrls, typeFilter };
}

export async function resolveAgents(
  pathOrUndefined: string | undefined,
  options: RemoteOptions,
  cfg: AgentLensConfig,
): Promise<LoadedAgent[]> {
  const isRemote = options.remote || options.all || !!options.id;

  if (!isRemote) {
    return loadFromFile(pathOrUndefined ?? ".");
  }

  const { authConfig, orgUrls, typeFilter } = resolveAuth(options, cfg);

  if (options.all) {
    const agents: LoadedAgent[] = [];

    // Graph API agents
    if (needsGraph(typeFilter)) {
      const graphAgents = await loadAllFromRemote(authConfig);
      for (const agent of graphAgents) {
        const agentType = agent.metadata?.agentType ?? "agent-builder";
        if (typeFilter === "all" || typeFilter === agentType) {
          agents.push(agent);
        }
      }
    }

    // Dataverse agents — iterate all environments
    if (needsDataverse(typeFilter)) {
      if (orgUrls.length > 0) {
        const dvAgents = await loadAllFromDataverseAllEnvs(authConfig, orgUrls);
        agents.push(...dvAgents);
      } else if (typeFilter === "copilot-studio") {
        throw new AgentLensError(
          "Dataverse not configured. Use --org-url or set 'dataverse.org_url'/'dataverse.org_urls' in .caltrc.json.",
        );
      }
    }

    return agents;
  }

  if (options.id) {
    const isGraphId = GRAPH_AGENT_PREFIXES.some((p) => options.id!.startsWith(p));
    const useDataverse =
      typeFilter === "copilot-studio" ||
      (!isGraphId && typeFilter !== "agent-builder" && typeFilter !== "sharepoint");

    if (useDataverse) {
      if (orgUrls.length === 0) {
        throw new AgentLensError(
          "Dataverse not configured. Use --org-url or set 'dataverse.org_url'/'dataverse.org_urls' in .caltrc.json.",
        );
      }
      return [await loadFromDataverseAnyEnv(options.id, authConfig, orgUrls)];
    }

    return [await loadFromRemote(options.id, authConfig)];
  }

  // --remote without --id or --all
  throw new AgentLensError("With --remote, specify --id <id> or --all.");
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveSource(
  source: string,
  authConfig: AuthConfig,
  orgUrls: string[],
): Promise<LoadedAgent> {
  // T_ or P_ prefix → Graph API
  if (GRAPH_AGENT_PREFIXES.some((p) => source.startsWith(p))) {
    return loadFromRemote(source, authConfig);
  }

  // GUID-like pattern → try Dataverse
  if (GUID_PATTERN.test(source)) {
    if (orgUrls.length === 0) {
      throw new AgentLensError(
        `Source "${source}" looks like a Dataverse bot ID but no org URLs are configured.`,
      );
    }
    return loadFromDataverseAnyEnv(source, authConfig, orgUrls);
  }

  // Otherwise → local file
  const agents = await loadFromFile(source);
  if (agents.length === 0) {
    throw new AgentLensError(`No agent manifest found at "${source}".`);
  }
  return agents[0];
}
