import { describe, it, expect } from "vitest";
import { buildPushPlan } from "../../src/commands/eval.js";
import type { RemoteTestCase } from "../../src/powerplatform/eval-client.js";

function remote(partial: Partial<RemoteTestCase> & { id: string; question: string }): RemoteTestCase {
  return {
    displayName: partial.question,
    parentBotComponentId: "ts1",
    schemaName: `mspva_${partial.id}`,
    expectedResponse: "",
    ...partial,
  };
}

describe("buildPushPlan", () => {
  it("creates new test cases when remote is empty", () => {
    const plan = buildPushPlan(
      [{ question: "What is X?", expectedResponse: "X", testingMethod: "Similarity" }],
      [],
      false,
    );
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toDelete).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(0);
  });

  it("marks identical case as unchanged", () => {
    const plan = buildPushPlan(
      [{ question: "Q", expectedResponse: "A", testingMethod: "Exact match" }],
      [remote({ id: "r1", question: "Q", expectedResponse: "A" })],
      false,
    );
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it("schedules update when expected response differs", () => {
    const plan = buildPushPlan(
      [{ question: "Q", expectedResponse: "A2", testingMethod: "Exact match" }],
      [remote({ id: "r1", question: "Q", expectedResponse: "A" })],
      false,
    );
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].existing.id).toBe("r1");
    expect(plan.toUpdate[0].existing.schemaName).toBe("mspva_r1");
  });

  it("does not delete extras unless prune is true", () => {
    const plan = buildPushPlan(
      [{ question: "Q1", expectedResponse: "A", testingMethod: "Exact match" }],
      [
        remote({ id: "r1", question: "Q1", expectedResponse: "A" }),
        remote({ id: "r2", question: "Q2", expectedResponse: "B" }),
      ],
      false,
    );
    expect(plan.toDelete).toHaveLength(0);
  });

  it("prunes orphan remote cases when prune is true", () => {
    const plan = buildPushPlan(
      [{ question: "Q1", expectedResponse: "A", testingMethod: "Exact match" }],
      [
        remote({ id: "r1", question: "Q1", expectedResponse: "A" }),
        remote({ id: "r2", question: "Q2", expectedResponse: "B" }),
      ],
      true,
    );
    expect(plan.toDelete).toHaveLength(1);
    expect(plan.toDelete[0].id).toBe("r2");
  });
});
