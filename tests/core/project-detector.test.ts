import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectProject } from "../../src/core/project-detector.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), "agentlens-test-" + Date.now());

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("Project Detector", () => {
  it("should detect a standalone JSON file", async () => {
    const filePath = join(TEST_DIR, "declarativeAgent.json");
    await writeFile(filePath, JSON.stringify({ name: "Test" }));

    const project = await detectProject(filePath);
    expect(project.type).toBe("standalone-manifest");
    expect(project.manifestPaths).toHaveLength(1);
  });

  it("should detect an Agents Toolkit project with appPackage/", async () => {
    const appPkg = join(TEST_DIR, "appPackage");
    await mkdir(appPkg, { recursive: true });
    const manifest = join(appPkg, "declarativeAgent.json");
    await writeFile(manifest, JSON.stringify({ name: "Test" }));

    const project = await detectProject(TEST_DIR);
    expect(project.type).toBe("agents-toolkit");
    expect(project.manifestPaths).toHaveLength(1);
  });

  it("should detect Teams Toolkit project with teamsapp.yml", async () => {
    const appPkg = join(TEST_DIR, "appPackage");
    await mkdir(appPkg, { recursive: true });
    await writeFile(join(appPkg, "declarativeAgent.json"), "{}");
    await writeFile(join(TEST_DIR, "teamsapp.yml"), "version: 1.0");

    const project = await detectProject(TEST_DIR);
    expect(project.type).toBe("teams-toolkit");
  });

  it("should find manifests in subdirectories", async () => {
    const subdir = join(TEST_DIR, "sub", "agents");
    await mkdir(subdir, { recursive: true });
    await writeFile(join(subdir, "declarativeAgent.json"), "{}");

    const project = await detectProject(TEST_DIR);
    expect(project.type).toBe("directory");
    expect(project.manifestPaths).toHaveLength(1);
  });

  it("should throw for empty directory", async () => {
    await expect(detectProject(TEST_DIR)).rejects.toThrow("No Declarative Agent manifest found");
  });

  it("should throw for non-existent path", async () => {
    await expect(detectProject("/nonexistent/path")).rejects.toThrow("Path not found");
  });

  it("should throw for non-JSON file", async () => {
    const filePath = join(TEST_DIR, "readme.txt");
    await writeFile(filePath, "text");

    await expect(detectProject(filePath)).rejects.toThrow("Unsupported file type");
  });

  it("should extract refs from Teams manifest.json", async () => {
    const appPkg = join(TEST_DIR, "appPackage");
    await mkdir(appPkg, { recursive: true });
    await writeFile(
      join(appPkg, "manifest.json"),
      JSON.stringify({
        copilotAgents: {
          declarativeAgents: [{ file: "declarativeAgent.json" }],
        },
      }),
    );
    await writeFile(join(appPkg, "declarativeAgent.json"), "{}");

    const project = await detectProject(TEST_DIR);
    expect(project.manifestPaths.length).toBeGreaterThan(0);
  });
});
