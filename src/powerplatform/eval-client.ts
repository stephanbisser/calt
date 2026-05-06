import { randomUUID } from "node:crypto";

export interface RemoteTestSet {
  id: string;
  displayName: string;
  description?: string;
  state?: string;
  numberOfTestCases?: number;
  schemaName?: string;
}

export interface RemoteTestCase {
  id: string;
  displayName: string;
  description?: string;
  parentBotComponentId: string;
  schemaName?: string;
  question: string;
  expectedResponse?: string;
}

export class CopilotStudioEvalApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: string,
  ) {
    super(message);
    this.name = "CopilotStudioEvalApiError";
  }
}

// Discover the regional PowerVA management gateway host AND the linked Dataverse
// organization id for a given environment via the BAP API.
export interface GatewayInfo {
  host: string;
  organizationId: string;
}

export async function discoverGatewayHost(
  bapToken: string,
  environmentId: string,
): Promise<GatewayInfo> {
  const url = `https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/${encodeURIComponent(environmentId)}?api-version=2020-10-01&$expand=permissions,properties.connectedGroups`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bapToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CopilotStudioEvalApiError(
      `BAP environment lookup failed: ${res.status} ${res.statusText}`,
      res.status,
      body,
    );
  }
  const data = (await res.json()) as {
    properties?: {
      runtimeEndpoints?: Record<string, string>;
      linkedEnvironmentMetadata?: { resourceId?: string; instanceUrl?: string };
    };
  };
  const endpoints = data.properties?.runtimeEndpoints ?? {};
  const organizationId = data.properties?.linkedEnvironmentMetadata?.resourceId ?? "";
  const powerVa = endpoints["microsoft.PowerVirtualAgents"];
  if (powerVa) {
    return { host: new URL(powerVa).host, organizationId };
  }
  const powerApps = endpoints["microsoft.PowerApps"];
  if (powerApps) {
    throw new CopilotStudioEvalApiError(
      `Environment exposes only PowerApps endpoint (${new URL(powerApps).host}). Provide --gateway-host explicitly.`,
      0,
    );
  }
  throw new CopilotStudioEvalApiError(
    `Environment ${environmentId} has no runtime endpoints. Provide --gateway-host explicitly.`,
    0,
  );
}

// ─── Component schemas (from sniffed network trace) ────────────────────────

interface UpdateRequest {
  testComponents: Array<{
    $kind: "MakerEvaluationUpdateTestComponent";
    operationType: "Add" | "Update" | "Delete";
    component: TestSetComponent | TestCaseComponent;
  }>;
}

interface TestSetComponent {
  $kind: "TestCaseComponent";
  schemaName: string;
  displayName: string;
  description?: string;
  category: "Testing";
  state: "Active";
  definition: {
    $kind: "EvaluationSet";
    graders: Array<{ $kind: string; diagnostics?: unknown[] }>;
    diagnostics?: unknown[];
  };
}

interface TestCaseComponent {
  $kind: "TestCaseComponent";
  schemaName: string;
  displayName: string;
  description?: string;
  category: "Testing";
  state: "Active";
  parentBotComponentId: string;
  definition: {
    $kind: "EvaluationData";
    rows: Array<{
      $kind: "SimpleEvaluationCase";
      input: string;
      expectedOutput: string;
      source: "Imported" | "Manual";
      diagnostics?: unknown[];
    }>;
    diagnostics?: unknown[];
    extensionData?: { displayOrder: string };
  };
}

interface UpdateResponse {
  addedComponentsIdsBySchemaName?: Record<string, string>;
  updatedComponentsIdsBySchemaName?: Record<string, string>;
  deletedComponentsIdsBySchemaName?: Record<string, string>;
}

// Map our local testingMethod → grader $kind
export function mapGraderKind(method: string): string {
  switch (method) {
    case "General quality": return "GeneralQualityGrader";
    case "Compare meaning": return "CompareMeaningGrader";
    case "Similarity":      return "TextSimilarityGrader";
    case "Exact match":     return "ExactMatchGrader";
    case "Keyword match":   return "KeywordMatchGrader";
    default:                return "GeneralQualityGrader";
  }
}

function newSchemaName(): string {
  return `mspva_${randomUUID()}`;
}

export class CopilotStudioEvalClient {
  /** gatewayHost example: "powervamg.us-il301.gateway.prod.island.powerapps.com" */
  constructor(
    private accessToken: string,
    private gatewayHost: string,
    private environmentId: string,
    private botId: string,
    private tenantId: string,
    private organizationId: string,
  ) {}

  private base(): string {
    return `https://${this.gatewayHost}/api/botmanagement/v2/environments/${encodeURIComponent(this.environmentId)}/bots/${encodeURIComponent(this.botId)}/makerevaluations`;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        "x-ms-user-agent": "PVA-Portal/1.0.0 (Web; ReactNative: false)",
        "x-ms-client-request-id": randomUUID(),
        "x-ms-client-session-id": randomUUID(),
        "x-cci-bapenvironmentid": this.environmentId,
        "x-cci-tenantid": this.tenantId,
        ...(this.organizationId ? { "x-cci-organizationid": this.organizationId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new CopilotStudioEvalApiError(
        `Copilot Studio Eval API ${method} ${path} failed: ${res.status} ${res.statusText}`,
        res.status,
        text,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listTestSets(): Promise<RemoteTestSet[]> {
    const data = await this.req<{ testComponents: Array<{ component: Record<string, unknown>; numberOfTestCases?: number }> }>(
      "GET", "/testsets",
    );
    return (data.testComponents ?? []).map((tc) => {
      const c = tc.component;
      return {
        id: String(c.id),
        displayName: String(c.displayName ?? ""),
        description: typeof c.description === "string" ? c.description : undefined,
        state: typeof c.state === "string" ? c.state : undefined,
        numberOfTestCases: tc.numberOfTestCases,
        schemaName: typeof c.schemaName === "string" ? c.schemaName : undefined,
      };
    });
  }

  async getTestSetDetails(testSetId: string): Promise<{ testSet: RemoteTestSet | null; testCases: RemoteTestCase[] }> {
    const data = await this.req<Array<Record<string, unknown>>>(
      "GET", `/testsets/${encodeURIComponent(testSetId)}/details`,
    );
    let testSet: RemoteTestSet | null = null;
    const testCases: RemoteTestCase[] = [];

    for (const c of data) {
      const def = (c.definition ?? {}) as Record<string, unknown>;
      if (def.$kind === "EvaluationSet") {
        testSet = {
          id: String(c.id),
          displayName: String(c.displayName ?? ""),
          description: typeof c.description === "string" ? c.description : undefined,
          state: typeof c.state === "string" ? c.state : undefined,
          schemaName: typeof c.schemaName === "string" ? c.schemaName : undefined,
        };
      } else if (def.$kind === "EvaluationData") {
        const rows = (def.rows ?? []) as Array<Record<string, unknown>>;
        const row = rows[0] ?? {};
        testCases.push({
          id: String(c.id),
          displayName: String(c.displayName ?? ""),
          description: typeof c.description === "string" ? c.description : undefined,
          parentBotComponentId: String(c.parentBotComponentId ?? testSetId),
          schemaName: typeof c.schemaName === "string" ? c.schemaName : undefined,
          question: typeof row.input === "string" ? row.input : "",
          expectedResponse: typeof row.expectedOutput === "string" ? row.expectedOutput : undefined,
        });
      }
    }

    return { testSet, testCases };
  }

  /** Creates a new test set; returns its server-generated id. */
  async createTestSet(input: {
    displayName: string;
    description?: string;
    grader: string; // grader $kind, e.g. "GeneralQualityGrader"
  }): Promise<string> {
    const schemaName = newSchemaName();
    const payload: UpdateRequest = {
      testComponents: [{
        $kind: "MakerEvaluationUpdateTestComponent",
        operationType: "Add",
        component: {
          $kind: "TestCaseComponent",
          schemaName,
          displayName: input.displayName,
          description: input.description ?? input.displayName,
          category: "Testing",
          state: "Active",
          definition: {
            $kind: "EvaluationSet",
            graders: [{ $kind: input.grader, diagnostics: [] }],
            diagnostics: [],
          },
        },
      }],
    };
    const res = await this.req<UpdateResponse>("POST", "/testcomponent", payload);
    const id = res.addedComponentsIdsBySchemaName?.[schemaName];
    if (!id) {
      throw new CopilotStudioEvalApiError(
        "Test set was not returned in addedComponentsIdsBySchemaName response.",
        0,
        JSON.stringify(res),
      );
    }
    return id;
  }

  /** Adds test cases to a test set in a single batched POST. */
  async createTestCases(
    parentTestSetId: string,
    cases: Array<{ question: string; expectedResponse?: string; displayOrder?: number }>,
  ): Promise<string[]> {
    if (cases.length === 0) return [];
    const schemas = cases.map(() => newSchemaName());
    const payload: UpdateRequest = {
      testComponents: cases.map((tc, i) => ({
        $kind: "MakerEvaluationUpdateTestComponent",
        operationType: "Add",
        component: {
          $kind: "TestCaseComponent",
          schemaName: schemas[i],
          displayName: tc.question.slice(0, 200),
          description: tc.question.slice(0, 200),
          category: "Testing",
          state: "Active",
          parentBotComponentId: parentTestSetId,
          definition: {
            $kind: "EvaluationData",
            diagnostics: [],
            extensionData: { displayOrder: String(Date.now() + (tc.displayOrder ?? i)) },
            rows: [{
              $kind: "SimpleEvaluationCase",
              input: tc.question,
              expectedOutput: tc.expectedResponse ?? "",
              source: "Imported",
              diagnostics: [],
            }],
          },
        },
      })),
    };
    const res = await this.req<UpdateResponse>("POST", "/testcomponent", payload);
    const map = res.addedComponentsIdsBySchemaName ?? {};
    return schemas.map((s) => map[s] ?? "");
  }

  /** Update an existing test case (replaces input/expectedOutput/displayName). */
  async updateTestCase(
    parentTestSetId: string,
    existing: { id: string; schemaName: string },
    next: { question: string; expectedResponse?: string },
  ): Promise<void> {
    const payload: UpdateRequest = {
      testComponents: [{
        $kind: "MakerEvaluationUpdateTestComponent",
        operationType: "Update",
        component: {
          $kind: "TestCaseComponent",
          schemaName: existing.schemaName,
          displayName: next.question.slice(0, 200),
          description: next.question.slice(0, 200),
          category: "Testing",
          state: "Active",
          parentBotComponentId: parentTestSetId,
          definition: {
            $kind: "EvaluationData",
            diagnostics: [],
            extensionData: { displayOrder: String(Date.now()) },
            rows: [{
              $kind: "SimpleEvaluationCase",
              input: next.question,
              expectedOutput: next.expectedResponse ?? "",
              source: "Imported",
              diagnostics: [],
            }],
          },
        },
      }],
    };
    await this.req<UpdateResponse>("POST", "/testcomponent", payload);
  }

  async deleteTestCase(
    parentTestSetId: string,
    existing: { id: string; schemaName: string },
  ): Promise<void> {
    const payload: UpdateRequest = {
      testComponents: [{
        $kind: "MakerEvaluationUpdateTestComponent",
        operationType: "Delete",
        component: {
          $kind: "TestCaseComponent",
          schemaName: existing.schemaName,
          displayName: "",
          category: "Testing",
          state: "Active",
          parentBotComponentId: parentTestSetId,
          definition: {
            $kind: "EvaluationData",
            diagnostics: [],
            rows: [],
          },
        },
      }],
    };
    await this.req<UpdateResponse>("POST", "/testcomponent", payload);
  }

  // ─── Eval runs ──────────────────────────────────────────────────────────

  async listRuns(): Promise<RunSummary[]> {
    const data = await this.req<RunSummary[]>("GET", "?count=100");
    return Array.isArray(data) ? data : [];
  }

  async startRun(args: {
    testSetId: string;
    runName: string;
    mcsConnectionId?: string;
  }): Promise<RunSummary> {
    const body: Record<string, unknown> = {
      testSetId: args.testSetId,
      clientRequestedEvaluationRunName: args.runName,
    };
    if (args.mcsConnectionId) body.mcsConnectionId = args.mcsConnectionId;
    return this.req<RunSummary>("POST", "", body);
  }

  async getRunDetails(runId: string): Promise<RunDetails> {
    return this.req<RunDetails>(
      "GET",
      `/${encodeURIComponent(runId)}/details`,
    );
  }
}

export interface RunSummary {
  id: string;
  name: string;
  state: string;
  testSetId: string;
  mcsConnectionId?: string;
  startTime?: string;
  TotalItemCount?: number;
  ProcessedItemCount?: number;
}

export interface RunDetails {
  id: string;
  name: string;
  state: string;
  testCaseCount: number;
  startTime?: string;
  endTime?: string;
  aggregatedGraderResults?: Array<{
    name: string;
    count: number;
    graderId?: string;
  }>;
  details?: {
    testCases?: RunTestCaseResult[];
  };
}

export interface RunTestCaseResult {
  id: string;
  testCaseComponentId: string;
  executionState: string;
  conversationId?: string;
  queries?: Array<{
    query: string;
    answer: string;
    answerType?: string;
    metrics?: {
      queryResponseMetrics?: Array<{
        metricType?: string;
        evaluationResult?: string;
        graderResult?: { graderResult?: string };
        properties?: Record<string, string>;
      }>;
    };
  }>;
  dataFields?: { fields?: Record<string, string> };
  graderMetrics?: {
    queryResponseMetrics?: Array<{
      evaluationResult?: string;
      graderResult?: { graderResult?: string };
      properties?: Record<string, string>;
    }>;
  };
}
