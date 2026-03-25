import {
  PublicClientApplication,
  type SilentFlowRequest,
  type DeviceCodeRequest,
  type AuthenticationResult,
} from "@azure/msal-node";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CALT_DIR = join(homedir(), ".calt");
// Shared token cache with Graph auth — MSAL's refresh token is multi-resource,
// so a single Graph login can silently acquire Dataverse tokens too.
const TOKEN_CACHE_FILE = join(CALT_DIR, "token-cache.json");

// Default multi-tenant app ID – same as Graph auth; users can override
const DEFAULT_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e";

export interface DataverseAuthConfig {
  clientId?: string;
  tenantId?: string;
  orgUrl: string;
}

function createMsalApp(config: DataverseAuthConfig): PublicClientApplication {
  const clientId = config.clientId || DEFAULT_CLIENT_ID;
  const authority = config.tenantId
    ? `https://login.microsoftonline.com/${config.tenantId}`
    : "https://login.microsoftonline.com/common";

  return new PublicClientApplication({
    auth: { clientId, authority },
  });
}

function getScopes(orgUrl: string): string[] {
  // Dataverse uses the org URL as the resource audience
  return [`${orgUrl}/.default`];
}

async function ensureDir(): Promise<void> {
  await mkdir(CALT_DIR, { recursive: true });
}

async function loadCache(pca: PublicClientApplication): Promise<void> {
  try {
    const raw = await readFile(TOKEN_CACHE_FILE, "utf-8");
    pca.getTokenCache().deserialize(raw);
  } catch {
    // No cache yet – that's fine
  }
}

async function saveCache(pca: PublicClientApplication): Promise<void> {
  await ensureDir();
  const serialized = pca.getTokenCache().serialize();
  await writeFile(TOKEN_CACHE_FILE, serialized, { mode: 0o600 });
}

/**
 * Interactive device code flow for Dataverse — used as a one-time fallback
 * when acquireTokenSilent fails (e.g. first login, user hasn't consented
 * to Dynamics CRM scopes yet). After this succeeds once, the cached
 * refresh token covers Dataverse on all subsequent logins.
 */
export async function loginDataverse(
  config: DataverseAuthConfig,
  onDeviceCode: (message: string) => void,
): Promise<AuthenticationResult> {
  const pca = createMsalApp(config);
  await loadCache(pca);

  const scopes = getScopes(config.orgUrl);
  const deviceCodeRequest: DeviceCodeRequest = {
    scopes,
    deviceCodeCallback: (response) => {
      if (response.message) onDeviceCode(response.message);
    },
  };

  const result = await pca.acquireTokenByDeviceCode(deviceCodeRequest);
  if (!result) throw new Error("Dataverse authentication failed — no result received.");

  await saveCache(pca);
  return result;
}

export async function acquireDataverseToken(config: DataverseAuthConfig): Promise<string> {
  const pca = createMsalApp(config);
  await loadCache(pca);

  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {
    throw new Error(
      "Not logged in. Run 'calt login' first.",
    );
  }

  const scopes = getScopes(config.orgUrl);
  const silentRequest: SilentFlowRequest = {
    account: accounts[0],
    scopes,
  };

  try {
    const result = await pca.acquireTokenSilent(silentRequest);
    await saveCache(pca);
    return result.accessToken;
  } catch {
    throw new Error(
      "Dataverse token expired and could not be refreshed. Run 'calt login' again.",
    );
  }
}

export async function getDataverseLoginStatus(
  config: DataverseAuthConfig,
): Promise<{ loggedIn: boolean; account?: string }> {
  try {
    // Try to actually acquire a token — this confirms the refresh token works for Dataverse
    await acquireDataverseToken(config);
    const pca = createMsalApp(config);
    await loadCache(pca);
    const accounts = await pca.getTokenCache().getAllAccounts();
    return {
      loggedIn: true,
      account: accounts[0]?.username,
    };
  } catch {
    return { loggedIn: false };
  }
}
