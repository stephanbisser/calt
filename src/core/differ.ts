import type {
  DeclarativeAgentManifest,
  AgentSource,
  DiffReport,
  DiffSection,
  DiffDetail,
} from "./types.js";

export function diffManifests(
  agentA: { manifest: DeclarativeAgentManifest; name: string; source: AgentSource },
  agentB: { manifest: DeclarativeAgentManifest; name: string; source: AgentSource },
): DiffReport {
  const sections: DiffSection[] = [];

  sections.push(diffMetadata(agentA.manifest, agentB.manifest));
  sections.push(diffInstructions(agentA.manifest, agentB.manifest));
  sections.push(diffCapabilities(agentA.manifest, agentB.manifest));
  sections.push(diffActions(agentA.manifest, agentB.manifest));
  sections.push(diffConversationStarters(agentA.manifest, agentB.manifest));
  sections.push(diffBehaviorOverrides(agentA.manifest, agentB.manifest));
  sections.push(diffDisclaimer(agentA.manifest, agentB.manifest));

  // Filter out sections with no changes
  const changedSections = sections.filter(
    (s) => s.changeType !== "unchanged" || s.details.some((d) => d.changeType !== "unchanged"),
  );

  let additions = 0;
  let removals = 0;
  let modifications = 0;
  for (const section of changedSections) {
    for (const detail of section.details) {
      if (detail.changeType === "added") additions++;
      else if (detail.changeType === "removed") removals++;
      else if (detail.changeType === "modified") modifications++;
    }
  }

  return {
    agentA: { name: agentA.name, source: agentA.source },
    agentB: { name: agentB.name, source: agentB.source },
    sections: changedSections,
    summary: {
      totalChanges: additions + removals + modifications,
      additions,
      removals,
      modifications,
    },
    timestamp: new Date().toISOString(),
  };
}

function diffMetadata(a: DeclarativeAgentManifest, b: DeclarativeAgentManifest): DiffSection {
  const details: DiffDetail[] = [];

  compareField(details, "name", a.name, b.name);
  compareField(details, "description", a.description, b.description);
  compareField(details, "version", a.version, b.version);
  compareField(details, "$schema", a.$schema, b.$schema);

  return {
    name: "Metadata",
    changeType: sectionChangeType(details),
    details,
  };
}

function diffInstructions(a: DeclarativeAgentManifest, b: DeclarativeAgentManifest): DiffSection {
  const instA = a.instructions ?? "";
  const instB = b.instructions ?? "";

  if (instA === instB) {
    return {
      name: "Instructions",
      changeType: "unchanged",
      details: [{ field: "instructions", changeType: "unchanged", valueA: instA, valueB: instB }],
    };
  }

  const linesA = instA.split("\n");
  const linesB = instB.split("\n");
  const details: DiffDetail[] = [];
  const maxLen = Math.max(linesA.length, linesB.length);

  for (let i = 0; i < maxLen; i++) {
    const lineA = linesA[i];
    const lineB = linesB[i];

    if (lineA === undefined) {
      details.push({ field: "instruction-line", changeType: "added", valueB: lineB });
    } else if (lineB === undefined) {
      details.push({ field: "instruction-line", changeType: "removed", valueA: lineA });
    } else if (lineA !== lineB) {
      details.push({ field: "instruction-line", changeType: "modified", valueA: lineA, valueB: lineB });
    }
  }

  return {
    name: "Instructions",
    changeType: "modified",
    details,
  };
}

function diffCapabilities(a: DeclarativeAgentManifest, b: DeclarativeAgentManifest): DiffSection {
  const capsA = a.capabilities ?? [];
  const capsB = b.capabilities ?? [];
  const details: DiffDetail[] = [];

  const namesA = new Map(capsA.map((c) => [c.name, c]));
  const namesB = new Map(capsB.map((c) => [c.name, c]));

  for (const [name, capA] of namesA) {
    const capB = namesB.get(name);
    if (!capB) {
      details.push({ field: `capability:${name}`, changeType: "removed", valueA: JSON.stringify(capA) });
    } else if (JSON.stringify(capA) !== JSON.stringify(capB)) {
      details.push({ field: `capability:${name}`, changeType: "modified", valueA: JSON.stringify(capA), valueB: JSON.stringify(capB) });
    }
  }

  for (const [name, capB] of namesB) {
    if (!namesA.has(name)) {
      details.push({ field: `capability:${name}`, changeType: "added", valueB: JSON.stringify(capB) });
    }
  }

  return {
    name: "Capabilities",
    changeType: sectionChangeType(details),
    details,
  };
}

function diffActions(a: DeclarativeAgentManifest, b: DeclarativeAgentManifest): DiffSection {
  const actionsA = a.actions ?? [];
  const actionsB = b.actions ?? [];
  const details: DiffDetail[] = [];

  const mapA = new Map(actionsA.map((act) => [act.id, act]));
  const mapB = new Map(actionsB.map((act) => [act.id, act]));

  for (const [id, actA] of mapA) {
    const actB = mapB.get(id);
    if (!actB) {
      details.push({ field: `action:${id}`, changeType: "removed", valueA: JSON.stringify(actA) });
    } else if (JSON.stringify(actA) !== JSON.stringify(actB)) {
      details.push({ field: `action:${id}`, changeType: "modified", valueA: JSON.stringify(actA), valueB: JSON.stringify(actB) });
    }
  }

  for (const [id, actB] of mapB) {
    if (!mapA.has(id)) {
      details.push({ field: `action:${id}`, changeType: "added", valueB: JSON.stringify(actB) });
    }
  }

  return {
    name: "Actions",
    changeType: sectionChangeType(details),
    details,
  };
}

function diffConversationStarters(a: DeclarativeAgentManifest, b: DeclarativeAgentManifest): DiffSection {
  const startersA = a.conversation_starters ?? [];
  const startersB = b.conversation_starters ?? [];
  const details: DiffDetail[] = [];

  const textsA = new Map(startersA.map((s) => [s.text, s]));
  const textsB = new Map(startersB.map((s) => [s.text, s]));

  for (const [text, starterA] of textsA) {
    const starterB = textsB.get(text);
    if (!starterB) {
      details.push({ field: "conversation-starter", changeType: "removed", valueA: text });
    } else if (JSON.stringify(starterA) !== JSON.stringify(starterB)) {
      details.push({ field: "conversation-starter", changeType: "modified", valueA: JSON.stringify(starterA), valueB: JSON.stringify(starterB) });
    }
  }

  for (const [text] of textsB) {
    if (!textsA.has(text)) {
      details.push({ field: "conversation-starter", changeType: "added", valueB: text });
    }
  }

  return {
    name: "Conversation Starters",
    changeType: sectionChangeType(details),
    details,
  };
}

function diffBehaviorOverrides(a: DeclarativeAgentManifest, b: DeclarativeAgentManifest): DiffSection {
  const details: DiffDetail[] = [];
  const jsonA = JSON.stringify(a.behavior_overrides ?? null);
  const jsonB = JSON.stringify(b.behavior_overrides ?? null);

  if (jsonA !== jsonB) {
    if (!a.behavior_overrides && b.behavior_overrides) {
      details.push({ field: "behavior_overrides", changeType: "added", valueB: jsonB });
    } else if (a.behavior_overrides && !b.behavior_overrides) {
      details.push({ field: "behavior_overrides", changeType: "removed", valueA: jsonA });
    } else {
      details.push({ field: "behavior_overrides", changeType: "modified", valueA: jsonA, valueB: jsonB });
    }
  }

  return {
    name: "Behavior Overrides",
    changeType: sectionChangeType(details),
    details,
  };
}

function diffDisclaimer(a: DeclarativeAgentManifest, b: DeclarativeAgentManifest): DiffSection {
  const details: DiffDetail[] = [];
  const textA = a.disclaimer?.text;
  const textB = b.disclaimer?.text;

  if (textA !== textB) {
    if (!textA && textB) {
      details.push({ field: "disclaimer", changeType: "added", valueB: textB });
    } else if (textA && !textB) {
      details.push({ field: "disclaimer", changeType: "removed", valueA: textA });
    } else {
      details.push({ field: "disclaimer", changeType: "modified", valueA: textA, valueB: textB });
    }
  }

  return {
    name: "Disclaimer",
    changeType: sectionChangeType(details),
    details,
  };
}

function compareField(details: DiffDetail[], field: string, a: string | undefined, b: string | undefined): void {
  if (a === b) return;
  if (!a && b) {
    details.push({ field, changeType: "added", valueB: b });
  } else if (a && !b) {
    details.push({ field, changeType: "removed", valueA: a });
  } else {
    details.push({ field, changeType: "modified", valueA: a, valueB: b });
  }
}

function sectionChangeType(details: DiffDetail[]): "added" | "removed" | "modified" | "unchanged" {
  if (details.length === 0) return "unchanged";
  const types = new Set(details.map((d) => d.changeType));
  if (types.size === 1) {
    const only = [...types][0];
    if (only === "unchanged") return "unchanged";
    return only;
  }
  return "modified";
}
