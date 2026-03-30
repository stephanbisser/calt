import { stat, readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ProjectType } from "./types.js";

export interface DetectedProject {
  type: ProjectType;
  manifestPaths: string[];
  basePath: string;
}

export async function detectProject(inputPath: string): Promise<DetectedProject> {
  const stats = await stat(inputPath).catch(() => null);
  if (!stats) {
    throw new Error(`Path not found: ${inputPath}`);
  }

  if (stats.isFile()) {
    return detectFromFile(inputPath);
  }

  if (stats.isDirectory()) {
    return detectFromDirectory(inputPath);
  }

  throw new Error(`Unsupported path type: ${inputPath}`);
}

async function detectFromFile(filePath: string): Promise<DetectedProject> {
  const name = basename(filePath).toLowerCase();

  if (!name.endsWith(".json")) {
    throw new Error(
      `Unsupported file type: ${filePath}. Expected a .json file.`,
    );
  }

  return {
    type: "standalone-manifest",
    manifestPaths: [filePath],
    basePath: join(filePath, ".."),
  };
}

async function detectFromDirectory(dirPath: string): Promise<DetectedProject> {
  const entries = await readdir(dirPath);

  // Check for appPackage/ (Teams Toolkit / Agents Toolkit)
  if (entries.includes("appPackage")) {
    const appPackagePath = join(dirPath, "appPackage");
    const manifests = await findManifestsInDir(appPackagePath);

    // If no direct declarativeAgent files, check manifest.json for references
    if (manifests.length === 0) {
      const teamsManifestPath = join(appPackagePath, "manifest.json");
      const refs = await extractManifestRefsFromTeamsManifest(teamsManifestPath);
      if (refs.length > 0) {
        const resolvedRefs = refs.map((r) => join(appPackagePath, r));
        return {
          type: entries.includes("teamsapp.yml") ? "teams-toolkit" : "agents-toolkit",
          manifestPaths: resolvedRefs,
          basePath: appPackagePath,
        };
      }
    }

    if (manifests.length > 0) {
      return {
        type: entries.includes("teamsapp.yml") ? "teams-toolkit" : "agents-toolkit",
        manifestPaths: manifests,
        basePath: appPackagePath,
      };
    }
  }

  // Search for declarativeAgent*.json in root
  const manifests = await findManifestsInDir(dirPath);
  if (manifests.length > 0) {
    return {
      type: "standalone-manifest",
      manifestPaths: manifests,
      basePath: dirPath,
    };
  }

  // Recursive search (max 3 levels deep)
  const deepManifests = await findManifestsRecursive(dirPath, 3);
  if (deepManifests.length > 0) {
    return {
      type: "directory",
      manifestPaths: deepManifests,
      basePath: dirPath,
    };
  }

  throw new Error(
    `No Declarative Agent manifest found in ${dirPath}. ` +
    `Expected a file matching declarativeAgent*.json or a Teams/Agents Toolkit project with appPackage/.`,
  );
}

async function findManifestsInDir(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath);
    return entries
      .filter(
        (e) =>
          e.toLowerCase().startsWith("declarativeagent") &&
          e.toLowerCase().endsWith(".json"),
      )
      .map((e) => join(dirPath, e));
  } catch {
    return [];
  }
}

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".venv",
  "__pycache__",
  "dist",
  "build",
  ".turbo",
  ".output",
  "coverage",
  ".nyc_output",
]);

async function findManifestsRecursive(
  dirPath: string,
  maxDepth: number,
): Promise<string[]> {
  if (maxDepth <= 0) return [];

  const results: string[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const subdirPromises: Promise<string[]>[] = [];

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;

      const fullPath = join(dirPath, entry.name);
      if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (
          lower.startsWith("declarativeagent") &&
          lower.endsWith(".json")
        ) {
          results.push(fullPath);
        }
      } else if (entry.isDirectory()) {
        subdirPromises.push(findManifestsRecursive(fullPath, maxDepth - 1));
      }
    }

    const nestedResults = await Promise.all(subdirPromises);
    for (const nested of nestedResults) {
      results.push(...nested);
    }
  } catch {
    // Permission denied or similar – skip
  }
  return results;
}

async function extractManifestRefsFromTeamsManifest(
  manifestPath: string,
): Promise<string[]> {
  try {
    const raw = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    // Teams manifest can reference declarative agents in copilotAgents.declarativeAgents
    const agents = manifest?.copilotAgents?.declarativeAgents;
    if (Array.isArray(agents)) {
      return agents
        .map((a: { file?: string }) => a.file)
        .filter((f): f is string => typeof f === "string");
    }
  } catch {
    // Not a valid teams manifest or file not found
  }
  return [];
}
