import chalk from "chalk";
import { resolve, basename, extname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadConfig } from "../core/config-loader.js";
import { loadEvalSuite, saveCopilotImportCsv, validateEvalSuite, writeEvalTemplate } from "../core/eval.js";
import type { EvalTestCase, EvalTestSuite } from "../core/types.js";
import { acquirePowerPlatformTokenInteractive, acquireBapTokenInteractive } from "../powerplatform/auth.js";
import {
  CopilotStudioEvalClient,
  CopilotStudioEvalApiError,
  discoverGatewayHost,
  mapGraderKind,
  type RemoteTestCase,
  type RemoteTestSet,
  type RunDetails,
  type RunTestCaseResult,
} from "../powerplatform/eval-client.js";

function defaultTemplatePath(): string {
  return resolve(process.cwd(), ".calt/evals/default.eval.yaml");
}

function defaultExportPath(inputPath: string): string {
  const file = basename(inputPath, extname(inputPath));
  return resolve(process.cwd(), ".calt/evals/exports", `${file}.copilot-eval.csv`);
}

function printValidation(validation: { errors: string[]; warnings: string[] }): void {
  if (validation.errors.length > 0) {
    console.log(chalk.red("\nValidation errors:"));
    for (const err of validation.errors) {
      console.log(chalk.red(`  - ${err}`));
    }
  }

  if (validation.warnings.length > 0) {
    console.log(chalk.yellow("\nValidation warnings:"));
    for (const warning of validation.warnings) {
      console.log(chalk.yellow(`  - ${warning}`));
    }
  }
}

export async function evalInitCommand(options: {
  output?: string;
  force?: boolean;
}): Promise<void> {
  const output = options.output ?? defaultTemplatePath();
  const path = await writeEvalTemplate(output, options.force ?? false);

  console.log(chalk.green(`\n✓ Created eval template: ${path}`));
  console.log(chalk.gray("  Next: edit the file, then run 'calt eval validate <file>'.\n"));
}

export async function evalValidateCommand(filePath: string): Promise<number | void> {
  const suite = await loadEvalSuite(filePath);
  const validation = validateEvalSuite(suite);

  printValidation(validation);

  if (!validation.valid) {
    console.log(chalk.red("\n✗ Eval suite is invalid.\n"));
    return 1;
  }

  console.log(chalk.green("\n✓ Eval suite is valid.\n"));
}

export async function evalExportCommand(filePath: string, options: { output?: string }): Promise<number | void> {
  const suite = await loadEvalSuite(filePath);
  const validation = validateEvalSuite(suite);

  printValidation(validation);
  if (!validation.valid) {
    console.log(chalk.red("\n✗ Export aborted: eval suite is invalid.\n"));
    return 1;
  }

  const out = options.output ?? defaultExportPath(filePath);
  const saved = await saveCopilotImportCsv(suite, out);

  console.log(chalk.green(`\n✓ Copilot Studio import CSV written: ${saved}`));
  console.log(chalk.gray("  In Copilot Studio: Evaluation -> New evaluation -> Import test cases from file.\n"));
}

export async function evalImportCommand(filePath: string, options: { output?: string }): Promise<number | void> {
  // For now import is an alias for export, since Copilot Studio provides file import in the UI.
  return evalExportCommand(filePath, options);
}

// ─── Push (experimental direct API) ─────────────────────────────────────────

export interface PushPlanItem {
  question: string;
  expectedResponse: string;
}

export interface PushPlan {
  toCreate: PushPlanItem[];
  toUpdate: { existing: { id: string; schemaName: string }; next: PushPlanItem }[];
  toDelete: RemoteTestCase[];
  unchanged: RemoteTestCase[];
}

export function buildPushPlan(
  local: EvalTestCase[],
  remote: RemoteTestCase[],
  prune: boolean,
): PushPlan {
  const remoteByQuestion = new Map<string, RemoteTestCase>();
  for (const r of remote) {
    remoteByQuestion.set(r.question.trim(), r);
  }

  const plan: PushPlan = { toCreate: [], toUpdate: [], toDelete: [], unchanged: [] };
  const seenRemote = new Set<string>();

  for (const localCase of local) {
    const desired: PushPlanItem = {
      question: localCase.question,
      expectedResponse: localCase.expectedResponse ?? "",
    };
    const match = remoteByQuestion.get(desired.question.trim());

    if (!match) {
      plan.toCreate.push(desired);
      continue;
    }

    seenRemote.add(match.question.trim());
    const isSame = (match.expectedResponse ?? "") === desired.expectedResponse;

    if (isSame) {
      plan.unchanged.push(match);
    } else if (match.schemaName) {
      plan.toUpdate.push({
        existing: { id: match.id, schemaName: match.schemaName },
        next: desired,
      });
    } else {
      // No schemaName means we can't issue an update; recreate.
      plan.toCreate.push(desired);
    }
  }

  if (prune) {
    for (const r of remote) {
      if (!seenRemote.has(r.question.trim())) plan.toDelete.push(r);
    }
  }

  return plan;
}

function summarizePlan(testSet: RemoteTestSet | null, suite: EvalTestSuite, plan: PushPlan, grader: string): void {
  console.log(chalk.cyan(`\nSuite: ${suite.name}`));
  console.log(
    chalk.gray(
      `Target test set: ${testSet ? `${testSet.displayName} (${testSet.id})` : "<will be created>"}`,
    ),
  );
  console.log(chalk.gray(`Grader:          ${grader}`));
  console.log(chalk.gray(`Local cases:     ${suite.testCases.length}`));
  console.log("");
  console.log(`  ${chalk.green("create")}    ${plan.toCreate.length}`);
  console.log(`  ${chalk.yellow("update")}    ${plan.toUpdate.length}`);
  console.log(`  ${chalk.red("delete")}    ${plan.toDelete.length}`);
  console.log(`  ${chalk.gray("unchanged")} ${plan.unchanged.length}`);
  console.log("");
}

async function writeSnapshot(
  outDir: string,
  testSet: RemoteTestSet | null,
  remote: RemoteTestCase[],
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(outDir, `eval-snapshot-${stamp}.json`);
  await writeFile(path, JSON.stringify({ testSet, testCases: remote }, null, 2), "utf-8");
  return path;
}

export async function evalPushCommand(
  filePath: string,
  options: {
    config?: string;
    botId?: string;
    envId?: string;
    testSetId?: string;
    apply?: boolean;
    prune?: boolean;
    experimentalDirectApi?: boolean;
    snapshotDir?: string;
    clientId?: string;
    tenant?: string;
    gatewayHost?: string;
  },
): Promise<number | void> {
  const suite = await loadEvalSuite(filePath);
  const validation = validateEvalSuite(suite);
  printValidation(validation);
  if (!validation.valid) {
    console.log(chalk.red("\n✗ Push aborted: eval suite is invalid.\n"));
    return 1;
  }

  if (!options.experimentalDirectApi) {
    console.log(chalk.yellow("\n⚠ Direct push to Copilot Studio uses undocumented endpoints."));
    console.log(chalk.yellow("  Re-run with --experimental-direct-api to attempt the push."));
    console.log(chalk.gray("  Falling back to CSV export instead.\n"));
    return evalExportCommand(filePath, {});
  }

  if (!options.botId || !options.envId) {
    console.log(chalk.red("\n✗ --bot-id and --env-id are required for direct push.\n"));
    return 1;
  }

  const cfg = await loadConfig(options.config);
  const ppAuth = {
    clientId: options.clientId ?? cfg.graph_api.client_id,
    tenantId: options.tenant ?? cfg.graph_api.tenant_id,
  };

  // 1) Power Platform API token (audience for the makerevaluations gateway)
  let token: string;
  try {
    token = await acquirePowerPlatformTokenInteractive(ppAuth, (message) => {
      console.log(chalk.yellow(`\n⚠ Power Platform API requires one-time consent.`));
      console.log(chalk.gray("  Sign in once to authorize Copilot Studio Eval API access.\n"));
      console.log(chalk.yellow(message));
      console.log("");
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`\n✗ Could not acquire Power Platform API token.`));
    if (msg.includes("AADSTS") || msg.includes("Invalid resource")) {
      console.log(chalk.gray("  Your Entra App registration is missing the Power Platform API permission."));
      console.log(chalk.gray("  Run 'calt setup --force' to reconfigure (admin role required), or add manually:"));
      console.log(chalk.gray("    Power Platform API → CopilotStudio.MakerOperations.ReadWrite (delegated) in Azure Portal."));
    } else if (msg.includes("Not logged in")) {
      console.log(chalk.gray("  Run 'calt login' first."));
    } else {
      console.log(chalk.gray(`  ${msg}`));
    }
    console.log(chalk.gray("\n  Workaround: 'calt eval export' produces a CSV for manual import.\n"));
    return 1;
  }

  // 2) Resolve gateway host + organization id (for routing headers)
  let gatewayHost = options.gatewayHost;
  let organizationId = "";
  try {
    const bapToken = await acquireBapTokenInteractive(ppAuth, (message) => {
      console.log(chalk.yellow(`\n⚠ Power Platform BAP API requires one-time consent (for region discovery).`));
      console.log(chalk.yellow(message));
      console.log("");
    });
    const info = await discoverGatewayHost(bapToken, options.envId);
    if (!gatewayHost) {
      gatewayHost = info.host;
      console.log(chalk.gray(`Discovered gateway: ${gatewayHost}`));
    }
    organizationId = info.organizationId;
  } catch (err) {
    if (!gatewayHost) {
      console.log(chalk.red(`\n✗ Could not discover regional gateway via BAP API.`));
      console.log(chalk.gray(`  ${err instanceof Error ? err.message : String(err)}`));
      console.log(chalk.gray("  Workaround: pass --gateway-host explicitly (e.g. 'powervamg.us-il301.gateway.prod.island.powerapps.com')\n"));
      return 1;
    }
    console.log(chalk.yellow(`⚠ Could not discover organization id via BAP — routing header will be omitted.`));
  }

  const tenantId = ppAuth.tenantId ?? "";
  if (!tenantId) {
    console.log(chalk.red("\n✗ tenant_id missing in .caltrc.json (graph_api.tenant_id). Run 'calt setup' first.\n"));
    return 1;
  }

  const grader = mapGraderKind(suite.testCases[0]?.testingMethod ?? "General quality");
  const client = new CopilotStudioEvalClient(token, gatewayHost, options.envId, options.botId, tenantId, organizationId);

  // 3) Resolve target test set + remote cases
  let targetTestSet: RemoteTestSet | null = null;
  let remoteCases: RemoteTestCase[] = [];

  try {
    if (options.testSetId) {
      const details = await client.getTestSetDetails(options.testSetId);
      targetTestSet = details.testSet;
      remoteCases = details.testCases;
    } else {
      const sets = await client.listTestSets();
      const match = sets.find((s) => s.displayName === suite.name) ?? null;
      if (match) {
        const details = await client.getTestSetDetails(match.id);
        targetTestSet = details.testSet;
        remoteCases = details.testCases;
      }
    }
  } catch (err) {
    if (err instanceof CopilotStudioEvalApiError && err.statusCode === 404) {
      targetTestSet = null;
    } else {
      if (err instanceof CopilotStudioEvalApiError) {
        console.log(chalk.red(`\n✗ ${err.message}`));
        if (err.body) console.log(chalk.gray(`  Response body: ${err.body}`));
      }
      throw err;
    }
  }

  const plan = buildPushPlan(suite.testCases, remoteCases, options.prune ?? false);
  summarizePlan(targetTestSet, suite, plan, grader);

  const snapshotDir = options.snapshotDir ?? resolve(process.cwd(), ".calt/evals/snapshots");
  if (targetTestSet) {
    const snap = await writeSnapshot(snapshotDir, targetTestSet, remoteCases);
    console.log(chalk.gray(`Snapshot saved: ${snap}\n`));
  }

  if (!options.apply) {
    console.log(chalk.gray("Dry-run only. Re-run with --apply to send changes.\n"));
    return;
  }

  // 4) Create test set if missing
  let createdSet = false;
  let parentTestSetId: string;
  if (!targetTestSet) {
    try {
      parentTestSetId = await client.createTestSet({
        displayName: suite.name,
        description: suite.description,
        grader,
      });
      createdSet = true;
      console.log(chalk.green(`✓ Created test set: ${suite.name} (${parentTestSetId})`));
    } catch (err) {
      console.log(chalk.red(`\n✗ Could not create test set: ${err instanceof Error ? err.message : String(err)}`));
      console.log(chalk.gray("  Falling back to CSV export.\n"));
      return evalExportCommand(filePath, {});
    }
  } else {
    parentTestSetId = targetTestSet.id;
  }

  // 5) Apply diff
  let created = 0, updated = 0, deleted = 0;
  const failures: string[] = [];

  if (plan.toCreate.length > 0) {
    try {
      const ids = await client.createTestCases(parentTestSetId, plan.toCreate);
      created = ids.filter((s) => s.length > 0).length;
    } catch (err) {
      failures.push(`batch create: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const upd of plan.toUpdate) {
    try {
      await client.updateTestCase(parentTestSetId, upd.existing, upd.next);
      updated++;
    } catch (err) {
      failures.push(`update "${upd.next.question}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const del of plan.toDelete) {
    if (!del.schemaName) continue;
    try {
      await client.deleteTestCase(parentTestSetId, { id: del.id, schemaName: del.schemaName });
      deleted++;
    } catch (err) {
      failures.push(`delete "${del.question}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("");
  console.log(chalk.green(`  Created:   ${created}`));
  console.log(chalk.yellow(`  Updated:   ${updated}`));
  console.log(chalk.red(`  Deleted:   ${deleted}`));
  console.log(chalk.gray(`  Unchanged: ${plan.unchanged.length}`));
  if (createdSet) console.log(chalk.gray("  (test set was newly created)"));

  if (failures.length > 0) {
    console.log(chalk.red(`\n✗ ${failures.length} operation(s) failed:`));
    for (const f of failures) console.log(chalk.red(`  - ${f}`));
    console.log(chalk.gray("\n  Tip: re-run with CSV fallback via 'calt eval export'.\n"));
    return 1;
  }

  console.log(chalk.green("\n✓ Push completed.\n"));
}

// ─── Eval run (trigger + watch) ────────────────────────────────────────────

async function setupEvalClient(
  options: {
    config?: string;
    botId?: string;
    envId?: string;
    clientId?: string;
    tenant?: string;
    gatewayHost?: string;
  },
): Promise<{ client: CopilotStudioEvalClient } | { errorCode: number }> {
  if (!options.botId || !options.envId) {
    console.log(chalk.red("\n✗ --bot-id and --env-id are required.\n"));
    return { errorCode: 1 };
  }

  const cfg = await loadConfig(options.config);
  const ppAuth = {
    clientId: options.clientId ?? cfg.graph_api.client_id,
    tenantId: options.tenant ?? cfg.graph_api.tenant_id,
  };

  let token: string;
  try {
    token = await acquirePowerPlatformTokenInteractive(ppAuth, (message) => {
      console.log(chalk.yellow(`\n⚠ Power Platform API requires one-time consent.`));
      console.log(chalk.yellow(message));
      console.log("");
    });
  } catch (err) {
    console.log(chalk.red(`\n✗ Could not acquire Power Platform API token: ${err instanceof Error ? err.message : String(err)}`));
    console.log(chalk.gray("  Run 'calt login' first.\n"));
    return { errorCode: 1 };
  }

  let gatewayHost = options.gatewayHost;
  let organizationId = "";
  try {
    const bapToken = await acquireBapTokenInteractive(ppAuth, (message) => {
      console.log(chalk.yellow(`\n⚠ Power Platform BAP API requires one-time consent (for region discovery).`));
      console.log(chalk.yellow(message));
      console.log("");
    });
    const info = await discoverGatewayHost(bapToken, options.envId);
    if (!gatewayHost) {
      gatewayHost = info.host;
      console.log(chalk.gray(`Discovered gateway: ${gatewayHost}`));
    }
    organizationId = info.organizationId;
  } catch (err) {
    if (!gatewayHost) {
      console.log(chalk.red(`\n✗ Could not discover regional gateway via BAP API.`));
      console.log(chalk.gray(`  ${err instanceof Error ? err.message : String(err)}\n`));
      return { errorCode: 1 };
    }
  }

  const tenantId = ppAuth.tenantId ?? "";
  if (!tenantId) {
    console.log(chalk.red("\n✗ tenant_id missing in .caltrc.json. Run 'calt setup' first.\n"));
    return { errorCode: 1 };
  }

  return {
    client: new CopilotStudioEvalClient(token, gatewayHost, options.envId, options.botId, tenantId, organizationId),
  };
}

function deriveOverallResult(tc: RunTestCaseResult): "Pass" | "Fail" | "Other" {
  const metrics = tc.queries?.[0]?.metrics?.queryResponseMetrics
    ?? tc.graderMetrics?.queryResponseMetrics
    ?? [];
  if (metrics.length === 0) return "Other";
  const grader = metrics[0].graderResult?.graderResult ?? metrics[0].evaluationResult ?? "";
  if (grader === "Pass") return "Pass";
  if (grader === "Fail") return "Fail";
  return "Other";
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1) + "…" : flat;
}

function printRunSummary(details: RunDetails): { pass: number; fail: number; other: number } {
  const cases = details.details?.testCases ?? [];
  let pass = 0, fail = 0, other = 0;

  console.log("");
  console.log(chalk.cyan(`Run: ${details.name}`));
  console.log(chalk.gray(`State: ${details.state}   Cases: ${cases.length}/${details.testCaseCount ?? cases.length}`));
  if (details.startTime) console.log(chalk.gray(`Start: ${details.startTime}`));
  if (details.endTime)   console.log(chalk.gray(`End:   ${details.endTime}`));

  console.log("");
  for (const tc of cases) {
    const result = deriveOverallResult(tc);
    if (result === "Pass") pass++;
    else if (result === "Fail") fail++;
    else other++;

    const tag = result === "Pass" ? chalk.green("PASS")
              : result === "Fail" ? chalk.red("FAIL")
              : chalk.yellow(result.toUpperCase());
    const q = tc.queries?.[0];
    console.log(`${tag}  ${truncate(q?.query ?? "", 80)}`);
    if (q?.answer) console.log(chalk.gray(`     → ${truncate(q.answer, 120)}`));
    const props = q?.metrics?.queryResponseMetrics?.[0]?.properties ?? tc.graderMetrics?.queryResponseMetrics?.[0]?.properties;
    if (props && Object.keys(props).length > 0) {
      const pretty = Object.entries(props).map(([k, v]) => `${k}=${v}`).join("  ");
      console.log(chalk.gray(`     ${pretty}`));
    }
  }

  console.log("");
  console.log(chalk.green(`  Pass:  ${pass}`));
  console.log(chalk.red(`  Fail:  ${fail}`));
  if (other > 0) console.log(chalk.yellow(`  Other: ${other}`));
  console.log("");

  return { pass, fail, other };
}

export async function evalRunCommand(
  filePath: string,
  options: {
    config?: string;
    botId?: string;
    envId?: string;
    testSetId?: string;
    mcsConnectionId?: string;
    runName?: string;
    timeoutMs?: number;
    pollMs?: number;
    experimentalDirectApi?: boolean;
    clientId?: string;
    tenant?: string;
    gatewayHost?: string;
  },
): Promise<number | void> {
  if (!options.experimentalDirectApi) {
    console.log(chalk.yellow("\n⚠ 'calt eval run' uses undocumented Copilot Studio endpoints."));
    console.log(chalk.yellow("  Re-run with --experimental-direct-api to proceed.\n"));
    return 1;
  }

  const suite = await loadEvalSuite(filePath);
  const validation = validateEvalSuite(suite);
  printValidation(validation);
  if (!validation.valid) {
    console.log(chalk.red("\n✗ Run aborted: eval suite is invalid.\n"));
    return 1;
  }

  const setup = await setupEvalClient(options);
  if ("errorCode" in setup) return setup.errorCode;
  const { client } = setup;

  // Resolve test set id (from option, or by name)
  let testSetId = options.testSetId;
  let testSetName = suite.name;
  if (!testSetId) {
    try {
      const sets = await client.listTestSets();
      const match = sets.find((s) => s.displayName === suite.name);
      if (!match) {
        console.log(chalk.red(`\n✗ No remote test set found with name "${suite.name}".`));
        console.log(chalk.gray("  Run 'calt eval push <file> --apply --experimental-direct-api' first, or pass --test-set-id.\n"));
        return 1;
      }
      testSetId = match.id;
      testSetName = match.displayName;
    } catch (err) {
      if (err instanceof CopilotStudioEvalApiError && err.body) {
        console.log(chalk.red(`\n✗ ${err.message}`));
        console.log(chalk.gray(`  ${err.body}\n`));
      }
      throw err;
    }
  }

  // Inherit mcsConnectionId from the most recent run for this test set
  let mcsConnectionId = options.mcsConnectionId;
  if (!mcsConnectionId) {
    try {
      const runs = await client.listRuns();
      const last = runs.find((r) => r.testSetId === testSetId && r.mcsConnectionId);
      if (last?.mcsConnectionId) {
        mcsConnectionId = last.mcsConnectionId;
        console.log(chalk.gray(`Reusing mcsConnectionId from previous run (${last.name}).`));
      }
    } catch {
      // non-fatal
    }
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(2, 13);
  const runName = options.runName ?? `${testSetName} ${stamp}`;

  // Trigger
  let runId: string;
  try {
    const created = await client.startRun({ testSetId, runName, mcsConnectionId });
    runId = created.id;
    console.log(chalk.green(`\n✓ Started eval run "${runName}"`));
    console.log(chalk.gray(`  runId: ${runId}`));
  } catch (err) {
    if (err instanceof CopilotStudioEvalApiError) {
      console.log(chalk.red(`\n✗ Could not start eval run: ${err.message}`));
      if (err.body) console.log(chalk.gray(`  ${err.body}`));
      console.log("");
    }
    throw err;
  }

  // Poll
  const pollMs = options.pollMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const start = Date.now();

  let details: RunDetails;
  let lastState = "";
  while (true) {
    if (Date.now() - start > timeoutMs) {
      console.log(chalk.red(`\n✗ Run did not complete within ${Math.round(timeoutMs / 1000)}s.`));
      console.log(chalk.gray(`  runId: ${runId} — check Copilot Studio for status.\n`));
      return 1;
    }
    try {
      details = await client.getRunDetails(runId);
    } catch (err) {
      if (err instanceof CopilotStudioEvalApiError && err.statusCode >= 500) {
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      throw err;
    }
    const state = details.state;
    if (state !== lastState) {
      const processed = details.details?.testCases?.length ?? 0;
      const total = details.testCaseCount ?? 0;
      console.log(chalk.gray(`  [${state}] ${processed}/${total}`));
      lastState = state;
    }
    if (state === "Completed" || state === "Failed" || state === "Cancelled") {
      break;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  const summary = printRunSummary(details);
  if (details.state === "Failed" || summary.fail > 0) return 1;
}
