import chalk from "chalk";
import { login, logout, getLoginStatus, acquireToken, decodeJwtPayload, type AuthConfig } from "../graph/auth.js";
import { acquireDataverseToken, loginDataverse, getDataverseLoginStatus, type DataverseAuthConfig } from "../dataverse/auth.js";
import { loadConfig, getDataverseOrgUrls } from "../core/config-loader.js";

export async function loginCommand(options: {
  tenant?: string;
  clientId?: string;
  config?: string;
}): Promise<void> {
  const cfg = await loadConfig(options.config);

  const authConfig: AuthConfig = {
    clientId: options.clientId ?? cfg.graph_api.client_id,
    tenantId: options.tenant ?? cfg.graph_api.tenant_id,
  };

  // Single device code login — MSAL's refresh token covers both Graph + Dataverse
  console.log(chalk.cyan("\nCALT – Login\n"));

  const result = await login(authConfig, (message) => {
    console.log(chalk.yellow(message));
    console.log("");
  });

  console.log(chalk.green("✓ Login successful!"));
  console.log(chalk.gray(`  Account: ${result.account?.username ?? "unknown"}`));
  console.log(chalk.gray(`  Tenant:  ${result.tenantId ?? "unknown"}`));

  // Verify Dataverse access silently via the shared refresh token (first env only)
  const orgUrls = getDataverseOrgUrls(cfg);
  const orgUrl = orgUrls[0];
  if (orgUrl) {
    const dvConfig: DataverseAuthConfig = {
      clientId: authConfig.clientId,
      tenantId: authConfig.tenantId,
      orgUrl,
    };

    const envLabel = orgUrls.length > 1 ? `${orgUrls.length} environment(s)` : orgUrl;

    try {
      await acquireDataverseToken(dvConfig);
      console.log(chalk.green(`✓ Dataverse access verified (${envLabel})`));
    } catch {
      // Silent acquisition failed — the user likely hasn't consented to
      // Dynamics CRM scopes yet. Fall back to a one-time device code flow
      // for Dataverse consent. After this, subsequent logins are single-sign-on.
      try {
        await loginDataverse(dvConfig, (message) => {
          console.log(chalk.yellow(`\n⚠ Dataverse requires one-time consent.`));
          console.log(chalk.gray("  Please sign in once more to authorize Copilot Studio / Dataverse access.\n"));
          console.log(chalk.yellow(message));
          console.log("");
        });
        console.log(chalk.green(`✓ Dataverse access verified (${envLabel})`));
      } catch (dvErr) {
        const msg = dvErr instanceof Error ? dvErr.message : String(dvErr);
        console.log(chalk.yellow(`⚠ Dataverse token could not be acquired for ${orgUrl}`));
        if (msg.includes("AADSTS650057") || msg.includes("Invalid resource")) {
          console.log(chalk.gray("  The Dynamics CRM API permission is not registered on your app."));
          console.log(chalk.gray("  Run 'calt setup --force' to reconfigure."));
        } else {
          console.log(chalk.gray("  Ensure 'Dynamics CRM → user_impersonation' is added to your app registration."));
          console.log(chalk.gray("  Run 'calt setup --force' to reconfigure."));
        }
      }
    }
  }

  console.log("");
}

export async function logoutCommand(): Promise<void> {
  await logout();
  console.log(chalk.green("\n✓ Logged out. Token cache cleared.\n"));
}

export async function statusCommand(options: {
  tenant?: string;
  clientId?: string;
  config?: string;
  verbose?: boolean;
  raw?: boolean;
}): Promise<void> {
  const cfg = await loadConfig(options.config);
  const config: AuthConfig = {
    clientId: options.clientId ?? cfg.graph_api.client_id,
    tenantId: options.tenant ?? cfg.graph_api.tenant_id,
  };

  console.log(chalk.cyan("\nCALT – Login Status\n"));

  // Graph status
  const status = await getLoginStatus(config);
  if (status.loggedIn) {
    console.log(chalk.green("✓ Graph API: Logged in"));
    if (status.account) console.log(chalk.gray(`  Account: ${status.account}`));
    if (status.tenantId) console.log(chalk.gray(`  Tenant:  ${status.tenantId}`));

    if (options.verbose) {
      try {
        const token = await acquireToken(config);
        const claims = decodeJwtPayload(token);
        if (claims) {
          const scopes = typeof claims.scp === "string" ? claims.scp : "(none)";
          const roles = Array.isArray(claims.roles) ? claims.roles.join(", ") : "(none)";
          console.log(chalk.gray(`  Scopes:  ${scopes}`));
          console.log(chalk.gray(`  Roles:   ${roles}`));
          console.log(chalk.gray(`  App ID:  ${claims.azp ?? claims.appid ?? "(unknown)"}`));
          console.log(chalk.gray(`  Aud:     ${claims.aud ?? "(unknown)"}`));
          console.log(chalk.gray(`  Exp:     ${claims.exp ? new Date(Number(claims.exp) * 1000).toISOString() : "unknown"}`));
        } else {
          console.log(chalk.gray("  (could not decode token claims)"));
        }
        console.log("");
        // Security: the raw token grants API access — only print it when
        // explicitly requested via --raw, and always warn on stderr so
        // automated pipelines don't silently leak credentials.
        if (options.raw) {
          console.error(chalk.yellow("⚠ Warning: Raw token output. Do not share or log this token."));
          console.log(token);
        } else {
          const masked = token.slice(0, 8) + "..." + token.slice(-4);
          console.log(chalk.gray(`  Token:   ${masked} (${token.length} chars)`));
          console.log(chalk.gray("  Tip: add --raw to show the full token."));
        }
      } catch (e) {
        console.log(chalk.yellow(`  (Could not decode token: ${e instanceof Error ? e.message : String(e)})`));
      }
    }
  } else {
    console.log(chalk.yellow("✗ Graph API: Not logged in"));
    console.log(chalk.gray("  Run 'calt login' to authenticate."));
  }

  // Dataverse status
  const statusOrgUrls = getDataverseOrgUrls(cfg);
  if (statusOrgUrls.length > 0) {
    const dvConfig: DataverseAuthConfig = {
      clientId: config.clientId,
      tenantId: config.tenantId,
      orgUrl: statusOrgUrls[0],
    };
    const dvStatus = await getDataverseLoginStatus(dvConfig);
    console.log("");
    if (dvStatus.loggedIn) {
      console.log(chalk.green("✓ Dataverse: Logged in"));
      if (dvStatus.account) console.log(chalk.gray(`  Account: ${dvStatus.account}`));
      console.log(chalk.gray(`  Environments: ${statusOrgUrls.length} configured`));
      for (const url of statusOrgUrls) {
        console.log(chalk.gray(`    • ${url}`));
      }
    } else {
      console.log(chalk.yellow("✗ Dataverse: Not logged in"));
      console.log(chalk.gray("  Ensure Dynamics CRM permission is added to your app, then run 'calt login'."));
    }
  }

  console.log("");
}
