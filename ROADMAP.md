# AgentLens Roadmap

Ideas and enhancements for future development. Items marked **[planned]** have implementation plans; others are tracked here for later prioritization.

---

## Planned (implementation in progress)

- **Auto-fix mode (`agentlens fix` / `--fix`)** — Automatically scaffold missing sections, remove secrets, deduplicate starters, add guardrail boilerplate.
- **Plugin/action manifest validation** — Open and validate OpenAPI specs inside action plugin files, check operationIds, auth config, cross-reference with instructions.
- **Agent diff (`agentlens diff`)** — Structured comparison of two manifests (local vs remote, two revisions). Terminal, markdown, or JSON output.
- **Capability–instruction alignment scoring** — Deep check that each configured capability is referenced and guided in the instructions. Score as percentage.
- **Instruction complexity / readability metrics** — Flesch-Kincaid readability, section density, nested conditional detection, token count estimation.

---

## Future Ideas

### Developer Experience

- **File watcher mode (`agentlens watch`)** — Re-run scan/lint on every file save. Useful during instruction authoring. Implement with `fs.watch` or chokidar.
- **`agentlens rules` command** — List all rules with IDs, descriptions, default severities, and categories. Like `eslint --print-config`.
- **Shareable config presets** — Allow `"extends": "strict"` or `"extends": "recommended"` in `.agentlensrc.json` with curated rule sets (e.g., "security-first" preset).
- **Schema version migration hints** — When manifest version < target, diff the schemas and suggest which fields to add for the upgrade.

### Analysis & Quality

- **Cross-agent consistency checks** — When scanning multiple agents: detect duplicate instructions, overlapping capabilities, conflicting conversation starters across agents in the same tenant.
- **Wire up `custom_blocked_phrases`** — The config field exists in the type but no rule checks it. Either implement a rule or remove the dead field.

### CI/CD & Integration

- **SARIF output format** — `--format sarif` for GitHub Code Scanning and VS Code SARIF Viewer integration. Free PR annotations via GitHub Advanced Security.
- **GitHub Actions integration** — Published Action that auto-detects manifests, posts scan results as PR comments/check annotations, fails on errors, caches auth.

### Remote Operations

- **`agentlens push`** — Deploy local manifest back to Graph API or Dataverse. Closes the fetch → edit → lint → push loop. Requires write scopes.

### Copilot Studio Deep Dive

- **Dataverse topic/skill validation** — Currently only `CustomGptMainInstructions` components are loaded. Validate `Topic` and `Skill` component types, check flow structure.
