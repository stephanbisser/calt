import { describe, it, expect } from "vitest";
import { listRules } from "../../src/commands/rules.js";
import { ALL_RULES } from "../../src/rules/rule-engine.js";

describe("listRules", () => {
  it("returns every registered rule with the public shape", async () => {
    const entries = await listRules({});
    expect(entries.length).toBe(ALL_RULES.length);
    for (const entry of entries) {
      expect(entry.id).toMatch(/^[A-Z]+-\d+$/);
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.description).toBe("string");
      expect(["schema", "instructions", "knowledge", "actions", "conversation-starters", "security"]).toContain(
        entry.category,
      );
      expect(["error", "warning", "info"]).toContain(entry.defaultSeverity);
      expect(["error", "warning", "info", "off"]).toContain(entry.effectiveSeverity);
    }
  });

  it("filters by category", async () => {
    const security = await listRules({ category: "security" });
    expect(security.length).toBeGreaterThan(0);
    for (const entry of security) {
      expect(entry.category).toBe("security");
      expect(entry.id.startsWith("SEC-")).toBe(true);
    }
  });

  it("filters by effective severity", async () => {
    const errors = await listRules({ severity: "error" });
    for (const entry of errors) {
      expect(entry.effectiveSeverity).toBe("error");
    }
  });

  it("returns IDs that all coding-agent integrations can rely on", async () => {
    const entries = await listRules({});
    const ids = new Set(entries.map((e) => e.id));
    // Spot-check the foundational categories so refactors that rename rule IDs
    // are caught here (and trigger a doc/AGENTS.md update).
    expect([...ids].some((id) => id.startsWith("INST-"))).toBe(true);
    expect([...ids].some((id) => id.startsWith("SEC-"))).toBe(true);
    expect([...ids].some((id) => id.startsWith("KNOW-"))).toBe(true);
    expect([...ids].some((id) => id.startsWith("CS-"))).toBe(true);
    expect([...ids].some((id) => id.startsWith("ACT-"))).toBe(true);
    expect([...ids].some((id) => id.startsWith("SCHEMA-"))).toBe(true);
  });
});
