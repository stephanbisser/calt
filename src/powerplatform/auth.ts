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
const TOKEN_CACHE_FILE = join(CALT_DIR, "token-cache.json");

const DEFAULT_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e";

// Resource audiences
// The Copilot Studio (Power Virtual Agents) maker-evaluations gateway requires a
// token whose audience is the Power Virtual Agents Service first-party app id.
// We pass the bare app id as the resource to MSAL; AAD will issue a token with
// aud = <PVA_APP_ID>.
const PVA_APP_ID = "96ff4394-9197-43aa-b393-6a41652e21f8";
const POWER_PLATFORM_API_RESOURCE = PVA_APP_ID;
const BAP_RESOURCE = "https://api.bap.microsoft.com";

export interface PowerPlatformAuthConfig {
  clientId?: string;
  tenantId?: string;
}

function createMsalApp(config: PowerPlatformAuthConfig): PublicClientApplication {
  const clientId = config.clientId || DEFAULT_CLIENT_ID;
  const authority = config.tenantId
    ? `https://login.microsoftonline.com/${config.tenantId}`
    : "https://login.microsoftonline.com/common";

  return new PublicClientApplication({
    auth: { clientId, authority },
  });
}

async function ensureDir(): Promise<void> {
  await mkdir(CALT_DIR, { recursive: true });
}

async function loadCache(pca: PublicClientApplication): Promise<void> {
  try {
    const raw = await readFile(TOKEN_CACHE_FILE, "utf-8");
    pca.getTokenCache().deserialize(raw);
  } catch {
    // No cache yet
  }
}

async function saveCache(pca: PublicClientApplication): Promise<void> {
  await ensureDir();
  const serialized = pca.getTokenCache().serialize();
  await writeFile(TOKEN_CACHE_FILE, serialized, { mode: 0o600 });
}

export async function acquirePowerPlatformToken(
  config: PowerPlatformAuthConfig,
): Promise<string> {
  return acquireTokenForResource(config, POWER_PLATFORM_API_RESOURCE);
}

export async function acquireBapToken(
  config: PowerPlatformAuthConfig,
): Promise<string> {
  return acquireTokenForResource(config, BAP_RESOURCE);
}

async function acquireTokenForResource(
  config: PowerPlatformAuthConfig,
  resource: string,
): Promise<string> {
  const pca = createMsalApp(config);
  await loadCache(pca);

  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {
    throw new Error("Not logged in. Run 'calt login' first.");
  }

  const silentRequest: SilentFlowRequest = {
    account: accounts[0],
    scopes: [`${resource}/.default`],
  };

  try {
    const result = await pca.acquireTokenSilent(silentRequest);
    await saveCache(pca);
    return result.accessToken;
  } catch {
    throw new Error(
      `Token for ${resource} could not be acquired silently. Run 'calt login' again or ensure your Entra App has the required delegated permissions.`,
    );
  }
}

/**
 * One-time device-code consent for the Power Apps Service scope.
 */
export async function loginPowerPlatform(
  config: PowerPlatformAuthConfig,
  onDeviceCode: (message: string) => void,
): Promise<AuthenticationResult> {
  const pca = createMsalApp(config);
  await loadCache(pca);

  const deviceCodeRequest: DeviceCodeRequest = {
    scopes: [`${POWER_PLATFORM_API_RESOURCE}/.default`],
    deviceCodeCallback: (response) => {
      if (response.message) onDeviceCode(response.message);
    },
  };

  const result = await pca.acquireTokenByDeviceCode(deviceCodeRequest);
  if (!result) {
    throw new Error("Power Platform API authentication failed — no result received.");
  }
  await saveCache(pca);
  return result;
}

export async function acquirePowerPlatformTokenInteractive(
  config: PowerPlatformAuthConfig,
  onDeviceCode: (message: string) => void,
): Promise<string> {
  try {
    return await acquirePowerPlatformToken(config);
  } catch {
    const result = await loginPowerPlatform(config, onDeviceCode);
    return result.accessToken;
  }
}

async function loginForResource(
  config: PowerPlatformAuthConfig,
  resource: string,
  onDeviceCode: (message: string) => void,
): Promise<string> {
  const pca = createMsalApp(config);
  await loadCache(pca);
  const result = await pca.acquireTokenByDeviceCode({
    scopes: [`${resource}/.default`],
    deviceCodeCallback: (response) => {
      if (response.message) onDeviceCode(response.message);
    },
  });
  if (!result) throw new Error(`Authentication for ${resource} failed — no result received.`);
  await saveCache(pca);
  return result.accessToken;
}

export async function acquireBapTokenInteractive(
  config: PowerPlatformAuthConfig,
  onDeviceCode: (message: string) => void,
): Promise<string> {
  try {
    return await acquireBapToken(config);
  } catch {
    return loginForResource(config, BAP_RESOURCE, onDeviceCode);
  }
}
