import {
  PublicClientApplication,
  type DeviceCodeRequest,
  type AuthenticationResult,
  type SilentFlowRequest,
} from "@azure/msal-node";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CALT_DIR = join(homedir(), ".calt");
const TOKEN_CACHE_FILE = join(CALT_DIR, "token-cache.json");

const SCOPES = [
  "https://graph.microsoft.com/CopilotPackages.Read.All",
  "https://graph.microsoft.com/User.Read",
];

// Default multi-tenant app ID – users can override via config or --client-id
const DEFAULT_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e";

export interface AuthConfig {
  clientId?: string;
  tenantId?: string;
}

export interface LoginStatus {
  loggedIn: boolean;
  account?: string;
  tenantId?: string;
  expiresOn?: Date;
}

function createMsalApp(config: AuthConfig): PublicClientApplication {
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
    // No cache yet – that's fine
  }
}

async function saveCache(pca: PublicClientApplication): Promise<void> {
  await ensureDir();
  const serialized = pca.getTokenCache().serialize();
  await writeFile(TOKEN_CACHE_FILE, serialized, { mode: 0o600 });
}

export async function login(
  config: AuthConfig,
  onDeviceCode: (message: string) => void,
): Promise<AuthenticationResult> {
  const pca = createMsalApp(config);
  await loadCache(pca);

  let deviceCodeShown = false;
  const deviceCodeRequest: DeviceCodeRequest = {
    scopes: SCOPES,
    deviceCodeCallback: (response) => {
      if (response.message) {
        deviceCodeShown = true;
        onDeviceCode(response.message);
      }
    },
  };

  let result: AuthenticationResult | null;
  try {
    result = await pca.acquireTokenByDeviceCode(deviceCodeRequest);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // MSAL sometimes surfaces invalid_scope/invalid_client as post_request_failed with
    // "invalid_grant" in the message. When the device code was never shown it means
    // Azure AD rejected the scope or client ID outright – give a clearer message.
    if (msg.includes("invalid_client")) {
      if (deviceCodeShown) {
        // Device code was shown but token exchange failed with invalid_client.
        // This is typically Azure AD replication lag on a newly registered app —
        // the devicecode endpoint hit a propagated node but the token endpoint did not.
        throw new Error(
          `Login failed with invalid_client. The app registration may not have fully propagated in Azure AD yet.\n` +
          `Wait 1–2 minutes and run 'calt login' again.`,
        );
      } else {
        throw new Error(
          `Azure AD rejected the login request – the app is not configured for CopilotPackages.Read.All.\n` +
          `Register your own Entra ID app:\n` +
          `  1. Azure Portal → Entra ID → App registrations → New registration\n` +
          `  2. Authentication → Add platform → Mobile/desktop → enable device code flow\n` +
          `  3. API permissions → Add → Microsoft Graph → Delegated → CopilotPackages.Read.All\n` +
          `  4. calt login --client-id <YOUR_APP_ID> --tenant <YOUR_TENANT_ID>`,
        );
      }
    }
    if (!deviceCodeShown && (msg.includes("invalid_grant") || msg.includes("invalid_scope"))) {
      throw new Error(
        `Azure AD rejected the login request – the app is not configured for CopilotPackages.Read.All.\n` +
        `Register your own Entra ID app:\n` +
        `  1. Azure Portal → Entra ID → App registrations → New registration\n` +
        `  2. Authentication → Add platform → Mobile/desktop → enable device code flow\n` +
        `  3. API permissions → Add → Microsoft Graph → Delegated → CopilotPackages.Read.All\n` +
        `  4. calt login --client-id <YOUR_APP_ID> --tenant <YOUR_TENANT_ID>`,
      );
    }
    throw err;
  }
  if (!result) {
    throw new Error("Authentication failed – no result received.");
  }

  await saveCache(pca);
  return result;
}

export async function acquireToken(config: AuthConfig): Promise<string> {
  const pca = createMsalApp(config);
  await loadCache(pca);

  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {
    throw new Error(
      "Not logged in. Run 'calt login' first.",
    );
  }

  const silentRequest: SilentFlowRequest = {
    account: accounts[0],
    scopes: SCOPES,
  };

  try {
    const result = await pca.acquireTokenSilent(silentRequest);
    await saveCache(pca);
    return result.accessToken;
  } catch {
    throw new Error(
      "Token expired and could not be refreshed. Run 'calt login' again.",
    );
  }
}

export async function logout(): Promise<void> {
  try {
    await rm(TOKEN_CACHE_FILE);
  } catch {
    // File doesn't exist – that's fine
  }
}

export async function getLoginStatus(config: AuthConfig): Promise<LoginStatus> {
  const pca = createMsalApp(config);
  await loadCache(pca);

  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {
    return { loggedIn: false };
  }

  const account = accounts[0];
  return {
    loggedIn: true,
    account: account.username,
    tenantId: account.tenantId,
  };
}

/**
 * Decode a JWT payload without verification. Returns `null` when the token is
 * malformed or the payload cannot be parsed so callers can handle it gracefully.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** @deprecated Use {@link decodeJwtPayload} instead. */
export function decodeTokenPayload(token: string): Record<string, unknown> {
  return decodeJwtPayload(token) ?? {};
}
