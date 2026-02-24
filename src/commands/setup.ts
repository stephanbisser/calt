import chalk from "chalk";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { writeFile, access, constants } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "../core/config-loader.js";
import { login, type AuthConfig } from "../graph/auth.js";
import { acquireDataverseToken, loginDataverse, type DataverseAuthConfig } from "../dataverse/auth.js";

const execFileAsync = promisify(execFile);

// Stable GUID for the CopilotPackages.Read.All delegated scope in Microsoft Graph
// (resource: 00000003-0000-0000-c000-000000000000)
const COPILOT_PACKAGES_SCOPE_GUID = "a2dcfcb9-cbe8-4d42-812d-952e55cf7f3f";
const MSGRAPH_SP_ID = "00000003-0000-0000-c000-000000000000";
const DEVICE_CODE_REDIRECT = "https://login.microsoftonline.com/common/oauth2/nativeclient";

// Dynamics CRM / Dataverse service principal
const DYNAMICS_CRM_RESOURCE = "https://admin.services.crm.dynamics.com";
// Well-known app ID for the Dynamics CRM / Common Data Service first-party app
const DYNAMICS_CRM_APP_ID = "00000007-0000-0000-c000-000000000000";
// Well-known GUID for user_impersonation scope on the Dynamics CRM service principal
const DYNAMICS_USER_IMPERSONATION_GUID = "78ce3f0f-a1ce-49c2-8cde-64b5c0896db4";

// ─── Default config ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  $schema:
    "https://raw.githubusercontent.com/stephanbisser/agentlens/main/schemas/config.schema.json",
  rules: {},
  instruction_min_length: 200,
  instruction_ideal_range: [500, 4000],
  custom_blocked_phrases: [],
  require_conversation_starters_min: 2,
  schema_version_target: "v1.6",
  graph_api: {
    client_id: "",
    tenant_id: "",
  },
  dataverse: {},
};

async function ensureConfig(force?: boolean): Promise<string> {
  const filePath = resolve(process.cwd(), ".agentlensrc.json");
  let exists = false;
  try {
    await access(filePath, constants.F_OK);
    exists = true;
  } catch {
    // File doesn't exist
  }

  if (!exists || force) {
    await writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
    console.log(chalk.green(`✓ Created .agentlensrc.json`));
  } else {
    console.log(chalk.gray("  .agentlensrc.json already exists — will update it."));
  }
  return filePath;
}

// ─── Shell utility ─────────────────────────────────────────────────────────────

async function runAz(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("az", args);
  return stdout.trim();
}

// ─── Step functions ────────────────────────────────────────────────────────────

async function isAzInstalled(): Promise<boolean> {
  try {
    await runAz(["--version"]);
    return true;
  } catch {
    return false;
  }
}

interface AzAccount {
  id: string;
  name: string;       // subscription name
  tenantId: string;
  isDefault: boolean;
  user: { name: string; type: string };
}

async function promptAccountSelection(accounts: AzAccount[]): Promise<AzAccount> {
  console.log(chalk.cyan("\n  Select an Azure account:\n"));
  accounts.forEach((acc, i) => {
    const tag = acc.isDefault ? chalk.green(" (default)") : "";
    console.log(`  ${chalk.bold(String(i + 1))}. ${acc.user.name}${tag}`);
    console.log(chalk.gray(`     Tenant:       ${acc.tenantId}`));
    console.log(chalk.gray(`     Subscription: ${acc.name}`));
    console.log("");
  });

  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.cyan(`  Enter number [1-${accounts.length}]: `), (answer) => {
      rl.close();
      const n = parseInt(answer.trim(), 10);
      if (n >= 1 && n <= accounts.length) {
        resolve(accounts[n - 1]);
      } else {
        reject(new Error(`Invalid selection "${answer}". Enter a number between 1 and ${accounts.length}.`));
      }
    });
  });
}

async function getAzAccount(): Promise<{ tenantId: string; name: string }> {
  let raw: string;
  try {
    raw = await runAz(["account", "list", "-o", "json"]);
  } catch {
    throw new Error(
      "Azure CLI is not logged in. Run 'az login' first, then retry 'agentlens setup'.",
    );
  }

  const accounts = JSON.parse(raw) as AzAccount[];
  if (accounts.length === 0) {
    throw new Error(
      "Azure CLI is not logged in. Run 'az login' first, then retry 'agentlens setup'.",
    );
  }

  let selected: AzAccount;
  if (accounts.length === 1) {
    selected = accounts[0];
  } else {
    selected = await promptAccountSelection(accounts);
    // Make the selected account active so subsequent az commands run in the right tenant
    await runAz(["account", "set", "--subscription", selected.id]);
  }

  return { tenantId: selected.tenantId, name: selected.user.name };
}

async function createAppRegistration(appName: string): Promise<string> {
  const appId = await runAz([
    "ad", "app", "create",
    "--display-name", appName,
    "--public-client-redirect-uris", DEVICE_CODE_REDIRECT,
    "--is-fallback-public-client",   // enables "Allow public client flows" — required for device code
    "--sign-in-audience", "AzureADMyOrg",
    "--query", "appId",
    "-o", "tsv",
  ]);
  if (!appId) {
    throw new Error("App registration succeeded but returned no appId.");
  }
  return appId;
}

async function getScopeGuid(): Promise<string> {
  try {
    const guid = await runAz([
      "ad", "sp", "show",
      "--id", MSGRAPH_SP_ID,
      "--query", "oauth2PermissionScopes[?value=='CopilotPackages.Read.All'].id",
      "-o", "tsv",
    ]);
    if (guid && guid.length > 0) return guid;
  } catch {
    // fall through to hardcoded fallback
  }
  console.log(chalk.gray("  (Using known GUID for CopilotPackages.Read.All — live lookup returned empty)"));
  return COPILOT_PACKAGES_SCOPE_GUID;
}

async function addPermission(appId: string, scopeGuid: string): Promise<void> {
  // CopilotPackages.Read.All is a delegated permission — no admin consent required.
  // Users will consent individually at first login via device code flow.
  await runAz([
    "ad", "app", "permission", "add",
    "--id", appId,
    "--api", MSGRAPH_SP_ID,
    "--api-permissions", `${scopeGuid}=Scope`,
  ]);
}

// ─── Power Platform Environment Discovery ───────────────────────────────────

interface PowerPlatformEnvironment {
  name: string;  // GUID
  properties: {
    displayName: string;
    isDefault: boolean;
    linkedEnvironmentMetadata?: {
      instanceApiUrl: string;
      instanceUrl: string;
      friendlyName: string;
    };
  };
}

async function listEnvironments(): Promise<PowerPlatformEnvironment[]> {
  const raw = await runAz([
    "rest", "--method", "GET",
    "--resource", "https://api.bap.microsoft.com",
    "--url", "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2020-10-01",
  ]);
  const parsed = JSON.parse(raw) as { value: PowerPlatformEnvironment[] };
  // Only environments with linkedEnvironmentMetadata have Dataverse
  return parsed.value.filter(e => e.properties.linkedEnvironmentMetadata?.instanceApiUrl);
}

// ─── Dynamics CRM Permission ────────────────────────────────────────────────

async function getDynamicsCrmSpId(): Promise<string> {
  try {
    const id = await runAz(["ad", "sp", "show", "--id", DYNAMICS_CRM_RESOURCE, "--query", "appId", "-o", "tsv"]);
    if (id && id.length > 0) return id;
  } catch {
    // fall through to well-known GUID
  }
  console.log(chalk.gray("  (Using known GUID for Dynamics CRM — live lookup returned empty)"));
  return DYNAMICS_CRM_APP_ID;
}

async function getDynamicsUserImpersonationGuid(spId: string): Promise<string> {
  try {
    const guid = await runAz([
      "ad", "sp", "show", "--id", spId,
      "--query", "oauth2PermissionScopes[?value=='user_impersonation'].id",
      "-o", "tsv",
    ]);
    if (guid && guid.length > 0) return guid;
  } catch {
    // fall through to hardcoded fallback
  }
  console.log(chalk.gray("  (Using known GUID for user_impersonation — live lookup returned empty)"));
  return DYNAMICS_USER_IMPERSONATION_GUID;
}

async function addDynamicsCrmPermission(appId: string): Promise<void> {
  const spId = await getDynamicsCrmSpId();
  const scopeGuid = await getDynamicsUserImpersonationGuid(spId);
  await runAz([
    "ad", "app", "permission", "add",
    "--id", appId,
    "--api", spId,
    "--api-permissions", `${scopeGuid}=Scope`,
  ]);
}

// ─── Config persistence ─────────────────────────────────────────────────────

async function saveToConfig(clientId: string, tenantId: string, orgUrls?: string[]): Promise<void> {
  const filePath = resolve(process.cwd(), ".agentlensrc.json");
  const existing = await loadConfig(filePath);
  const dataverse: Record<string, unknown> = { ...existing.dataverse };
  if (orgUrls && orgUrls.length > 0) {
    dataverse.org_urls = orgUrls;
    // Also keep org_url pointing at first for backwards compat
    dataverse.org_url = orgUrls[0];
  }
  const updated = {
    ...existing,
    graph_api: {
      ...existing.graph_api,
      client_id: clientId,
      tenant_id: tenantId,
    },
    dataverse,
  };
  await writeFile(filePath, JSON.stringify(updated, null, 2) + "\n");
}

function printManualInstructions(): void {
  console.log(chalk.yellow("\n  Azure CLI (az) is not installed or not in PATH."));
  console.log(chalk.gray("  Install: https://learn.microsoft.com/cli/azure/install-azure-cli"));
  console.log("");
  console.log(chalk.cyan("  Manual setup steps:"));
  console.log(chalk.gray("  1. Azure Portal → Entra ID → App registrations → New registration"));
  console.log(chalk.gray("     Name: AgentLens | Supported account types: This org only"));
  console.log(chalk.gray("  2. Authentication → Add a platform → Mobile and desktop applications"));
  console.log(chalk.gray(`     Enable: ${DEVICE_CODE_REDIRECT}`));
  console.log(chalk.gray("  3. API permissions → Add a permission → Microsoft Graph → Delegated"));
  console.log(chalk.gray("     Search for and add: CopilotPackages.Read.All"));
  console.log(chalk.gray("  4. Copy the Application (client) ID and your tenant ID, then run:"));
  console.log(chalk.gray("     agentlens login --client-id <APP_ID> --tenant <TENANT_ID>"));
  console.log("");
}

// ─── Exported command ──────────────────────────────────────────────────────────

export async function setupCommand(options: {
  appName?: string;
  login?: boolean;
  force?: boolean;
}): Promise<void> {
  const appName = options.appName ?? "AgentLens";

  console.log(chalk.cyan("\nAgentLens – Setup\n"));

  // Step 1: Ensure .agentlensrc.json exists
  await ensureConfig(options.force);

  // Step 2: Check Azure CLI — if missing, config is already created, show manual instructions
  console.log(chalk.gray("Checking Azure CLI..."));
  if (!(await isAzInstalled())) {
    printManualInstructions();
    return;
  }
  console.log(chalk.green("✓ Azure CLI found"));

  try {
    console.log(chalk.gray("Checking Azure CLI login..."));
    const account = await getAzAccount();
    console.log(chalk.green(`✓ Using account: ${account.name} (tenant: ${account.tenantId})`));

    console.log(chalk.gray(`Creating app registration "${appName}"...`));
    const appId = await createAppRegistration(appName);
    console.log(chalk.green(`✓ App registered: ${appId}`));

    console.log(chalk.gray("Resolving CopilotPackages.Read.All scope GUID..."));
    const scopeGuid = await getScopeGuid();
    console.log(chalk.green("✓ Scope GUID resolved"));

    console.log(chalk.gray("Adding CopilotPackages.Read.All permission..."));
    await addPermission(appId, scopeGuid);
    console.log(chalk.green("✓ Permission added"));

    // ─── Power Platform / Dataverse environment discovery ─────────────────
    let selectedOrgUrls: string[] = [];

    console.log(chalk.gray("\nDiscovering Power Platform environments..."));
    try {
      const environments = await listEnvironments();
      if (environments.length > 0) {
        // Collect all Dataverse-linked org URLs
        const allOrgUrls = environments
          .map((e) => e.properties.linkedEnvironmentMetadata!.instanceApiUrl)
          .filter(Boolean);

        if (allOrgUrls.length > 0) {
          console.log(chalk.green(`✓ Found ${allOrgUrls.length} Dataverse-linked environment(s):`));
          for (const env of environments) {
            const meta = env.properties.linkedEnvironmentMetadata!;
            const tag = env.properties.isDefault ? chalk.green(" (Default)") : "";
            console.log(chalk.gray(`  • ${env.properties.displayName}${tag} — ${meta.instanceApiUrl}`));
          }

          console.log(chalk.gray("\nAdding Dynamics CRM user_impersonation permission..."));
          try {
            await addDynamicsCrmPermission(appId);
            console.log(chalk.green("✓ Dynamics CRM user_impersonation permission added"));
            selectedOrgUrls = allOrgUrls;
          } catch (permErr) {
            console.log(chalk.yellow(`⚠ Could not add Dynamics CRM permission: ${permErr instanceof Error ? permErr.message : String(permErr)}`));
            console.log(chalk.gray("  You can add it manually: Azure Portal → App registrations → API permissions → Dynamics CRM → user_impersonation"));
          }
        }
      } else {
        console.log(chalk.gray("  No Dataverse-linked environments found — skipping."));
      }
    } catch {
      console.log(chalk.gray("  Could not list Power Platform environments — skipping Dataverse setup."));
    }

    // ─── Admin consent (makes single-login work for all resources) ─────────
    console.log(chalk.gray("\nGranting admin consent for configured permissions..."));
    try {
      await runAz(["ad", "app", "permission", "admin-consent", "--id", appId]);
      console.log(chalk.green("✓ Admin consent granted"));
    } catch {
      console.log(chalk.gray("  Admin consent skipped (requires Global Admin or similar role)."));
      console.log(chalk.gray("  Users will consent individually during first login."));
    }

    console.log(chalk.gray("\nSaving to .agentlensrc.json..."));
    await saveToConfig(appId, account.tenantId, selectedOrgUrls.length > 0 ? selectedOrgUrls : undefined);
    console.log(chalk.green("✓ Saved to .agentlensrc.json"));

    console.log("");
    console.log(chalk.cyan("Setup complete!"));
    console.log(chalk.gray(`  App name:  ${appName}`));
    console.log(chalk.gray(`  Client ID: ${appId}`));
    console.log(chalk.gray(`  Tenant ID: ${account.tenantId}`));
    if (selectedOrgUrls.length > 0) {
      console.log(chalk.gray(`  Dataverse: ${selectedOrgUrls.length} environment(s)`));
      for (const url of selectedOrgUrls) {
        console.log(chalk.gray(`    • ${url}`));
      }
    }
    console.log("");

    if (options.login) {
      // Wait for Azure AD to propagate the new app registration before starting the
      // device code flow — the token exchange can fail with invalid_client if the
      // token endpoint hits a node that hasn't replicated yet.
      process.stdout.write(chalk.gray("Waiting for app registration to propagate"));
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        process.stdout.write(chalk.gray("."));
      }
      console.log("\n");

      // Single device code flow — Dataverse token acquired silently via shared refresh token
      const authConfig: AuthConfig = { clientId: appId, tenantId: account.tenantId };
      console.log(chalk.cyan("AgentLens – Login\n"));
      try {
        const result = await login(authConfig, (message) => {
          console.log(chalk.yellow(message));
          console.log("");
        });
        console.log(chalk.green("✓ Login successful!"));
        console.log(chalk.gray(`  Account: ${result.account?.username ?? "unknown"}`));
        console.log(chalk.gray(`  Tenant:  ${result.tenantId ?? "unknown"}`));

        // Verify Dataverse access silently via the shared refresh token (first env only)
        const verifyOrgUrl = selectedOrgUrls[0];
        if (verifyOrgUrl) {
          const dvConfig: DataverseAuthConfig = {
            clientId: appId,
            tenantId: account.tenantId,
            orgUrl: verifyOrgUrl,
          };
          try {
            await acquireDataverseToken(dvConfig);
            console.log(chalk.green(`✓ Dataverse access verified (${selectedOrgUrls.length} environment(s))`));
          } catch {
            // Silent failed — fall back to one-time device code for Dataverse consent
            try {
              await loginDataverse(dvConfig, (message) => {
                console.log(chalk.yellow(`\n⚠ Dataverse requires one-time consent.`));
                console.log(chalk.gray("  Please sign in once more to authorize Copilot Studio / Dataverse access.\n"));
                console.log(chalk.yellow(message));
                console.log("");
              });
              console.log(chalk.green(`✓ Dataverse access verified (${selectedOrgUrls.length} environment(s))`));
            } catch {
              console.log(chalk.yellow(`⚠ Dataverse token could not be acquired for ${verifyOrgUrl}`));
              console.log(chalk.gray("  The Dynamics CRM permission may need a few minutes to propagate."));
              console.log(chalk.gray("  Run 'agentlens login' to retry."));
            }
          }
        }
        console.log("");
      } catch (loginErr) {
        const msg = loginErr instanceof Error ? loginErr.message : String(loginErr);
        console.log(chalk.yellow("\n⚠ Setup complete, but login needs a retry."));
        console.log(chalk.gray(`  ${msg.split("\n")[0]}`));
        console.log(chalk.gray("  Run 'agentlens login' in 1–2 minutes."));
        console.log("");
        // Do not re-throw — the app is registered and config is saved.
      }
    } else {
      console.log(chalk.gray("  Run 'agentlens login' to authenticate."));
      console.log("");
    }
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}
