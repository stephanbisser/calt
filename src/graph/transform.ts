import type {
  CopilotPackageDetail,
  DeclarativeAgentManifest,
  AgentMetadata,
  AgentType,
  LoadedAgent,
} from "../core/types.js";

export function extractManifestFromPackage(
  packageDetail: CopilotPackageDetail,
): DeclarativeAgentManifest | null {
  const dcElement = packageDetail.elementDetails?.find(
    (ed) => ed.elementType === "DeclarativeCopilots",
  );

  if (!dcElement?.elements?.length) {
    return null;
  }

  // The definition field is an escaped JSON string → parse it
  const definitionStr = dcElement.elements[0].definition;
  try {
    const manifest = JSON.parse(definitionStr) as DeclarativeAgentManifest;
    return manifest;
  } catch (e) {
    throw new Error(
      `Failed to parse agent definition JSON for "${packageDetail.displayName}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export function extractMetadata(
  packageDetail: CopilotPackageDetail,
): AgentMetadata {
  return {
    packageId: packageDetail.id,
    publisher: packageDetail.publisher,
    version: packageDetail.version,
    lastModifiedDateTime: packageDetail.lastModifiedDateTime,
    displayName: packageDetail.displayName,
    manifestVersion: packageDetail.manifestVersion,
  };
}

/**
 * Classify an agent as "sharepoint" (if it has OneDriveAndSharePoint capability)
 * or "agent-builder" (default for Graph API agents).
 */
export function classifyAgentType(manifest: DeclarativeAgentManifest): AgentType {
  const hasSharePoint = manifest.capabilities?.some(
    (c) => c.name === "OneDriveAndSharePoint",
  );
  return hasSharePoint ? "sharepoint" : "agent-builder";
}

export function packageToLoadedAgent(
  packageDetail: CopilotPackageDetail,
): LoadedAgent {
  const manifest = extractManifestFromPackage(packageDetail);
  if (!manifest) {
    throw new Error(
      `No Declarative Agent manifest found in package "${packageDetail.displayName}" (${packageDetail.id}).`,
    );
  }

  const metadata = extractMetadata(packageDetail);
  metadata.agentType = classifyAgentType(manifest);

  return {
    manifest,
    source: { type: "remote", packageId: packageDetail.id },
    metadata,
  };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöü]/g, (c) =>
      c === "ä" ? "ae" : c === "ö" ? "oe" : "ue",
    )
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
