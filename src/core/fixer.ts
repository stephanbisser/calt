import type {
  DeclarativeAgentManifest,
  RuleResult,
  FixDescriptor,
  FixResult,
} from "./types.js";

export function applyFixes(
  manifest: DeclarativeAgentManifest,
  results: RuleResult[],
): { manifest: DeclarativeAgentManifest; applied: FixResult[] } {
  const fixableResults = results.filter((r) => !r.passed && r.fix);
  if (fixableResults.length === 0) {
    return { manifest, applied: [] };
  }

  // Deep clone the manifest to avoid mutating the original
  const fixed: DeclarativeAgentManifest = JSON.parse(JSON.stringify(manifest));
  const applied: FixResult[] = [];

  // Group fixes by type for ordered processing
  const removals = fixableResults.filter((r) => r.fix!.type === "remove");
  const replacements = fixableResults.filter((r) => r.fix!.type === "replace");
  const appends = fixableResults.filter((r) => r.fix!.type === "append-section");
  const starterRemovals = fixableResults.filter((r) => r.fix!.type === "remove-starter");

  // 1. Removals — remove matching text from instructions
  for (const result of removals) {
    const fix = result.fix as Extract<FixDescriptor, { type: "remove" }>;
    if (fixed.instructions.includes(fix.pattern)) {
      fixed.instructions = fixed.instructions.replaceAll(fix.pattern, "");
      // Clean up double newlines left by removal
      fixed.instructions = fixed.instructions.replace(/\n{3,}/g, "\n\n");
      applied.push({ ruleId: result.ruleId, applied: true, description: `Removed: "${fix.pattern.slice(0, 60)}${fix.pattern.length > 60 ? "..." : ""}"` });
    } else {
      applied.push({ ruleId: result.ruleId, applied: false, description: `Pattern not found: "${fix.pattern.slice(0, 60)}"` });
    }
  }

  // 2. Replacements
  for (const result of replacements) {
    const fix = result.fix as Extract<FixDescriptor, { type: "replace" }>;
    if (fixed.instructions.includes(fix.search)) {
      fixed.instructions = fixed.instructions.replaceAll(fix.search, fix.replacement);
      applied.push({ ruleId: result.ruleId, applied: true, description: `Replaced: "${fix.search.slice(0, 40)}" → "${fix.replacement.slice(0, 40)}"` });
    } else {
      applied.push({ ruleId: result.ruleId, applied: false, description: `Search pattern not found: "${fix.search.slice(0, 60)}"` });
    }
  }

  // 3. Appends — add sections if header not already present
  for (const result of appends) {
    const fix = result.fix as Extract<FixDescriptor, { type: "append-section" }>;
    // Extract the first line (header) to check for idempotency
    const firstLine = fix.content.split("\n")[0].trim();
    if (fixed.instructions.includes(firstLine)) {
      applied.push({ ruleId: result.ruleId, applied: false, description: `Section already exists: "${firstLine}"` });
    } else {
      // Ensure there's a newline before appending
      if (!fixed.instructions.endsWith("\n")) {
        fixed.instructions += "\n";
      }
      fixed.instructions += "\n" + fix.content;
      applied.push({ ruleId: result.ruleId, applied: true, description: `Appended section: "${firstLine}"` });
    }
  }

  // 4. Starter removals — process in reverse index order to avoid shifts
  const starterRemovalsWithIndex = starterRemovals.map((r) => ({
    result: r,
    index: (r.fix as Extract<FixDescriptor, { type: "remove-starter" }>).index,
  }));
  starterRemovalsWithIndex.sort((a, b) => b.index - a.index);

  for (const { result, index } of starterRemovalsWithIndex) {
    const starters = fixed.conversation_starters ?? [];
    if (index >= 0 && index < starters.length) {
      const removed = starters[index];
      starters.splice(index, 1);
      applied.push({
        ruleId: result.ruleId,
        applied: true,
        description: `Removed duplicate starter at index ${index}: "${removed.text.slice(0, 40)}"`,
      });
    } else {
      applied.push({
        ruleId: result.ruleId,
        applied: false,
        description: `Starter index ${index} out of range.`,
      });
    }
  }

  // Trim trailing whitespace from instructions
  fixed.instructions = fixed.instructions.trim();

  return { manifest: fixed, applied };
}
