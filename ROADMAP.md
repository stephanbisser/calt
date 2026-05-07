# CALT — Roadmap

This is the long-term roadmap for CALT, structured into a vision section, an idea
catalog, and a phased delivery plan. Granular item-level history (completed work,
small ideas) is preserved at the bottom under **Backlog & history**.

---

## 1. Vision Statement

CALT is evolving from a CLI linter into the **de-facto IDE-grade quality layer for
Microsoft 365 Copilot Agents** — a layer that accompanies every agent from the first
prompt draft in VS Code, through Copilot Studio maker flows, into CI/CD pipelines and
tenant-wide CISO dashboards. The same deterministic rule engine is augmented by
**AI-assisted auto-fixes** and a **Copilot Chat participant `@calt`**. For coding agents
(Claude Code, Cursor, etc.) the CLI plus a single [`AGENTS.md`](AGENTS.md) contract is
the integration surface — no MCP server in between, because shell access plus
`--format json` is faster, cheaper in context-window, and zero state.

**One source of truth (`packages/core`) — many frontends, one quality bar.**

---

## 2. Architecture Sketch

### Monorepo Layout (pnpm + turborepo)

```
calt/
├── packages/
│   ├── core/                # current src/ — pure TS, deterministic
│   │                        # exports runFullScan, applyFixes, loaders, formatters
│   ├── cli/                 # current bin: commander → calls @calt/core
│   ├── vscode/              # VS Code extension (vsce bundle)
│   ├── chat/                # Copilot Chat participant (may live in vscode/)
│   ├── shared-prompts/      # AI prompt templates for Fix/Rewrite/Generate
│   └── eslint-plugin-calt/  # OPTIONAL
├── AGENTS.md                # contract for coding agents (Claude Code, Cursor, …)
└── action.yml               # stays at root for GitHub Actions

# Note: no packages/mcp — see §3 Category B for why.
```

### Data Flow

```
   ┌────────────── User Surfaces ──────────────┐
   │ VS Code UI │ Chat (@calt) │ Coding Agents │
   │            │              │ (via CLI +    │
   │            │              │  AGENTS.md)   │
   └─────┬──────┴──────┬───────┴──────┬────────┘
         ▼             ▼              ▼
        ┌───────────────────────────────┐
        │  @calt/core (RuleEngine,      │
        │  Loaders, Fixer, Differ,      │
        │  Eval, SARIF formatter)       │
        └─────┬───────────────┬─────────┘
              ▼               ▼
        Local FS        Graph API / Dataverse / PP
                        (MSAL Device Code, token cache)
```

VS Code and the chat participant import directly from `@calt/core`. Coding agents
talk to CALT through the public CLI surface — `calt scan/lint/fix/rules
--format json` — guided by [`AGENTS.md`](AGENTS.md). **No logic is duplicated.**
The fixer gains an `aiFix(ruleResult, manifestText, lmClient)` hook that uses
`vscode.lm` when needed; otherwise the existing deterministic `applyFixes` runs.

---

## 3. Idea Catalog (29 ideas)

### Category A — Standalone CALT VS Code Extension (10 ideas)

| # | Title | Persona | What it does | Reuses CALT | VS Code APIs | Effort |
|---|---|---|---|---|---|---|
| A1 | **Live Diagnostics on Save/Type** | All | `runFullScan` runs on save (debounced 500 ms) against `declarativeAgent.json`, `instructions.txt`, action OpenAPI files. Findings as `vscode.Diagnostic` with range from `RuleResult.line/column`. | `runFullScan`, `formatAsSarif`, `parseFileReference` | `languages.createDiagnosticCollection`, `workspace.onDidSaveTextDocument` | M |
| A2 | **Quick-Fix CodeActionProvider** | Pro-Code | For each `RuleResult` with `fix?: FixDescriptor`, a blue lightbulb. `applyFixes` produces a `WorkspaceEdit`. Deterministic for `append-section`/`remove`/`replace`; AI fixes (B3) appear as a second action "Fix with Copilot". | `applyFixes`, `FixDescriptor` | `CodeActionProvider`, `WorkspaceEdit`, `CodeActionKind.QuickFix` | M |
| A3 | **Hover Provider with rule docs** | All | On hover over a diagnostic underline: markdown tooltip with rule ID, rationale, OWASP LLM mapping, doc link, before/after snippet. | rule metadata from `rule-engine.ts` | `HoverProvider`, `MarkdownString` | S |
| A4 | **Webview Health Dashboard** | All | "Agent Report" tab renders `formatAsHtml` 1:1 in a webview, with click-to-jump on every rule line. Charts per category, trend vs. Git HEAD. | `formatAsHtml`, `runFullScan`, `diffManifests` | `window.createWebviewPanel`, `Webview.postMessage`, `revealLine` | M |
| A5 | **Findings Tree View (multi-agent workspace)** | All | Sidebar tree grouped by Agent → Category → Severity. `loadAllFromRemote` & `detectProject` find all agents in workspace + tenants. Activity-bar badge with error count. | `loadAllFromRemote`, `loadAllFromDataverseAllEnvs`, `detectProject` | `TreeDataProvider`, `TreeItem` | M |
| A6 | **Status Bar Health Score** | All | Status-bar item: "CALT 87/100" — clickable opens A4. Score = `passed/totalChecks` weighted by severity. Color-coded (red < 60, yellow < 85, green ≥ 85). | `ScanReport.summary` | `window.createStatusBarItem` | S |
| A7 | **Schema-aware IntelliSense** | Pro-Code, Maker | Registers JSON schemas v1.3–v1.6 as `jsonValidation` for `**/declarativeAgent*.json`. Auto-completion for `capabilities.name`, `behavior_overrides`, conversation_starter. | `schemas/v1.6.json` etc. | `package.json contributes.jsonValidation`, `CompletionItemProvider` | S |
| A8 | **`.caltrc.json` Scaffolding Wizard** | Maker, CISO | Command Palette "CALT: Initialize Config" — QuickPick wizard: severity profile, schema target, tenant defaults, compliance preset (E4). Writes `.caltrc.json` & `tasks.json`. | `loadConfig`, `DEFAULT_CONFIG` | `MultiStepInput` pattern | S |
| A9 | **Diff View Integration for Fixes** | Pro-Code | Before `applyFixes` writes: native VS Code diff shows before/after; user accepts/rejects per hunk. Also for `calt diff` remote-vs-local. | `applyFixes`, `diffManifests`, `formatDiff` | `vscode.diff` command, `TextDocumentContentProvider` | M |
| A10 | **Rule Documentation Browser** | All | Activity-bar icon: searchable catalog of all 35+ rules. Filter by category, severity, OWASP. "Open in `.caltrc`" patches directly. | rule metadata | `Webview` or `TreeView` | S |

### Category B — AI / Copilot Chat / Coding-Agent CLI (8 ideas)

> **B2 (MCP Server) was dropped after evaluation.** For coding agents the CLI
> with stable `--format json` and an [`AGENTS.md`](AGENTS.md) contract beats an
> MCP server on every axis: tool descriptions in MCP burn context-window
> tokens on every turn (even when CALT isn't used), while shell calls only
> cost tokens at invocation. CALT is also fully stateless and file-based —
> the exact shape MCP isn't optimised for. A thin MCP wrapper shelling out to
> the CLI remains an option for non-shell clients (Claude Desktop chat,
> Continue, …) if there's user demand.

| # | Title | Persona | What it does | Reuses | APIs | Effort |
|---|---|---|---|---|---|---|
| B1 | **Copilot Chat Participant `@calt`** | All | Slash commands: `/scan`, `/fix [ruleId]`, `/explain <ruleId>`, `/improve-instruction`, `/generate-starters`, `/diff <packageId>`, `/audit <tenant>`. Streaming markdown + executable buttons. | full public API | `chatParticipant`, `ChatRequestHandler`, `chat.followups` | L |
| ~~B2~~ | ~~**MCP Server (`@calt/mcp`)**~~ | ~~All / power users~~ | **DROPPED.** Coding agents (Claude Code, Cursor, etc.) already have shell access — the CLI + `--format json` is faster, cheaper in context-window, and stateless. MCP would only add ~1 KB of tool descriptions to every turn for no functional gain. The CLI is the agent contract; see [AGENTS.md](AGENTS.md). A thin MCP wrapper that shells out to the CLI may be reconsidered later if Claude Desktop / Continue users (no Bash) request it. | — | — | — |
| B3 | **AI Auto-Fix via `vscode.lm`** | Pro-Code | When `FixDescriptor` is missing (e.g. INST-LANG-001), a second quick-fix "Fix with Copilot": prompt from rule ID + snippet + OWASP context, sends to `lm.selectChatModels`, validates output by running `runFullScan` again (loop until pass). | `runFullScan` as validator | `lm.selectChatModels` | L |
| B4 | **AI Instruction Rewrite Wizard** | Maker, Pro-Code | On multiple INST-* findings: webview shows original/AI proposal side-by-side with rationale per change. Constraints: `instruction_ideal_range`, Flesch-Kincaid, capability alignment. | `runInstructionLint`, complexity rules | `lm`, `Webview` | L |
| B5 | **AI Conversation-Starter Generator** | Maker | When `require_conversation_starters_min` is short: `/generate-starters` produces N context-aware starters from `name + description + instructions`. Writes back, re-validates. | manifest types, `runFullScan` | `lm`, `WorkspaceEdit` | M |
| B6 | **Prompt-Injection Explainer** | CISO, Pro-Code | On SEC-PI-* / SEC-LEAK-* findings: hover action "Why is this risky?" — AI explains OWASP LLM01/LLM07 for this exact finding, suggests guardrail boilerplate (deterministic `append-section` fallback). | `security/prompt-injection-rules.ts` | `lm`, `HoverProvider` | M |
| B7 | **Natural Language → Manifest Scaffolding** | Maker | Command "CALT: Generate Agent from Description". User types "HR onboarding agent for new hires with SharePoint knowledge". AI emits a complete v1.6 manifest, validated against schema + rules, iterating until 0 errors. | schemas v1.6, `runSchemaValidation` | `lm`, `InputBox` | L |
| B8 | **Eval Suite Generator from description** | Pro-Code, CISO | From `description + instructions + capabilities` AI generates an `EvalTestSuite` (10–50 cases) mixing "Compare meaning" / "Keyword match" / adversarial prompts (injection tests). Export as CSV via `toCopilotImportCsv`. | `eval.ts`, `EvalTestSuite`, `saveCopilotImportCsv` | `lm` | M |
| B9 | **Coding-Agent CLI surface** (replaces B2) | Pro-Code | `calt rules --format json` for rule-catalog discovery, frozen JSON schemas for `scan/lint/fix --format json`, contractual exit codes, and an [`AGENTS.md`](AGENTS.md) at repo root that tells coding agents when/how to invoke CALT. Zero token-window cost when CALT isn't used. | `ALL_RULES` from rule engine, existing `--format json` formatters | — | S |

### Category C — M365 Agents Toolkit Touchpoints (4 ideas)

| # | Title | Persona | What it does | Reuses | APIs | Effort |
|---|---|---|---|---|---|---|
| C1 | **Pre-Provision Validation Gate** | Pro-Code, CISO | Hook on `teamsfx provision` / `atk publish`: blocks deploy on errors. Thresholds via `.caltrc.json` (`block_on: "error" \| "warning"`). As pre-launch task or toolkit-lifecycle plugin. | `runFullScan`, `summary.errors` | `tasks` API, toolkit lifecycle hooks | M |
| C2 | **Auto-Detect appPackage/ projects** | All | On workspace open: when `detectProject` returns "agents-toolkit"/"teams-toolkit", CALT registers automatically. Notification "CALT detected your Agents Toolkit project — enable linting?" | `detectProject` | `workspace.workspaceFolders`, `showInformationMessage` | S |
| C3 | **`tasks.json` & `launch.json` Contributions** | Pro-Code | 4 tasks: "CALT: Scan", "CALT: Fix --dry-run", "CALT: Watch", "CALT: Diff vs Tenant". In `Run Task` palette. | CLI commands | `TaskProvider`, `contributes.taskDefinitions` | S |
| C4 | **Walkthrough "First Agent in 5 min"** | Maker | Built-in Getting Started: create manifest → lint → fix → deploy to tenant. 5 steps with command + validation. | full pipeline | `contributes.walkthroughs` | S |

### Category D — Copilot Studio / Maker (3 ideas)

| # | Title | Persona | What it does | Reuses | APIs | Effort |
|---|---|---|---|---|---|---|
| D1 | **Dataverse Pull/Push/Diff in editor** | Maker | Sidebar lists all bots from configured environments (`loadAllFromDataverseAllEnvs`). Right-click → Pull (virtual file), Edit, Push, Diff vs. live. | `loadFromDataverse`, `listDataverseBotsAllEnvs`, `diffManifests` | `TreeView`, `FileSystemProvider` (`dataverse://`) | L |
| D2 | **Tenant-wide Inventory & Health Dashboard** | CISO, Maker-lead | Webview renders matrix of all agents in tenant (Graph + Dataverse): score, schema version, owner, last-modify, OWASP findings. Sort/filter, export CSV/SARIF. | `loadAllFromRemote`, `formatMultipleAsSarif` | `Webview`, MSAL token cache | L |
| D3 | **Maker-Friendly Plain-Language Summaries** | Maker | Instead of "INST-LEN-001 failed: instructions.length=120 < min=200" CALT says "Your instructions are too short — the agent needs more context. Tip: describe role, tone, and limits." Persona toggle in settings. | existing rule messages + AI rephrasing | `lm` (optional), `WorkspaceConfiguration` | M |

### Category E — Enterprise / Governance / DevOps (5 ideas)

| # | Title | Persona | What it does | Reuses | APIs | Effort |
|---|---|---|---|---|---|---|
| E1 | **GitHub Actions / ADO Pipeline Generator** | Pro-Code, CISO | Command "CALT: Generate CI Workflow" emits `.github/workflows/calt.yml` with scan, SARIF upload, artifact upload, optional auto-PR-comment. Templates per compliance preset. | existing `action.yml` | file-write, templates | S |
| E2 | **SARIF Upload to GitHub Code Scanning** | CISO | E1 includes `github/codeql-action/upload-sarif@v3`. Free PR annotations (with GHAS) or via `gh api`. In webview: link "Open in Security tab". | `formatAsSarif` | — | S |
| E3 | **Tenant Governance Dashboard with drill-down** | CISO | Extends D2: score trend per team/owner over time (locally in `~/.calt/governance.db` as SQLite/JSONL). Heatmap risk matrix. Export PDF for audit. | `loadAllFromRemote`, `runFullScan` | `Webview` (Chart.js) | XL |
| E4 | **Policy-as-Code: Compliance Presets** | CISO | Bundled `.caltrc.json` presets: `compliance/eu-ai-act.json`, `compliance/hipaa.json`, `compliance/dsgvo.json`, `compliance/owasp-llm-strict.json`. `extends` mechanism. Wizard A8 picks preset. | `loadConfig`, `AgentLensConfig` | — | M |
| E5 | **Signed & Auditable Scan Reports** | CISO | `calt report --sign` produces SARIF + JSON, hashes both, signs with Sigstore/Cosign or Azure Key Vault. Verifiable audit artifact. VS Code action "Generate Audit Report". | `formatAsSarif`, `formatAsJson` | child_process for Cosign, optional Azure SDK | L |

### Category F — Visionary / Moonshot (4 ideas)

| # | Title | Persona | What it does | Reuses | APIs | Effort |
|---|---|---|---|---|---|---|
| F1 | **In-Editor Agent Sandbox Runner** | Pro-Code, Maker | Webview opens mini chat UI, sends prompts to a sandbox endpoint (Power Platform Eval API or Azure OpenAI with manifest as system prompt). Eval suite (B8) as regression test. | `powerplatform/eval-client.ts`, `EvalTestSuite` | `Webview`, fetch | XL |
| F2 | **Time-Travel Debugging via Git + Diff** | Pro-Code, CISO | Slider in webview: scrolls through Git history of the manifest, shows score delta + findings delta per commit. Identifies "the commit that broke security". | `diffManifests`, git-blame | `Webview`, simple-git | L |
| F3 | **Federated Anonymized Benchmarking** | CISO, Maker-lead | Opt-in: anonymized score distributions from your tenant vs. anonymous industry mean ("your HR agent is in the 73rd percentile"). Differential-privacy aggregated. | `ScanReport` | HTTPS backend | XL |
| F4 | **Auto-PR Bot "Fixerbot"** | Pro-Code | GitHub App: nightly scan of all manifests, opens PRs with deterministic fixes (B3 AI optional). SARIF diff, score delta, reviewer mention via CODEOWNERS. | `applyFixes`, `formatAsSarif`, GH API | GitHub App SDK, Probot | XL |

---

## 4. Phasing

| Phase | Timeline | Content | Why now |
|---|---|---|---|
| **Phase 1 — Foundation** | 0–3 mo | Monorepo split (`packages/core`, `cli`, `vscode`), A1, A2, A3, A6, A7, A8, C2, C3, C4, E1, E2 | Brings CALT into IDE — fastest time-to-value, primary persona Pro-Code |
| **Phase 2 — AI** | 3–6 mo | A4, A5, A9, A10, B1 (`@calt`), B3, B5, B6, D3, **agent-friendly CLI** (`calt rules --json`, AGENTS.md, stable JSON schemas) | Differentiates from plain linters; LM API is mature; coding agents standardize on shell tools, so we invest there instead of MCP |
| **Phase 3 — Enterprise** | 6–9 mo | B4, B7, B8, C1, D1, D2, E3, E4, E5 | Activates CISO/maker-lead persona, tenant scale |
| **Phase 4 — Moonshot** | 9–18 mo | F1, F2, F3, F4 | Requires adoption from phases 1–3 |

---

## 5. Critical Files (for later implementation)

- `src/core/index.ts` — public API; source for all frontends. Extend with `aiFix` hook and streaming variants.
- `src/core/types.ts` — `RuleResult.line/column`, `FixDescriptor`, `ScanReport` map 1:1 to `vscode.Diagnostic` & SARIF; `LoadedAgent` is the central structure for tree/webview.
- `src/formatters/sarif-formatter.ts` — bridge to `vscode.Diagnostic`, GitHub Code Scanning (E2), MCP resource output. **Already exists — reuse.**
- `src/core/fixer.ts` (`applyFixes`) — core piece for CodeActionProvider (A2) and AI-fix loop (B3). Needs non-destructive pre-apply mode for A9.
- `src/core/project-detector.ts` — auto-activation (C2), tree-view roots (A5), MCP resource discovery.
- `package.json` — becomes workspace root; `packages/vscode/package.json` new with `contributes.{commands, configuration, jsonValidation, walkthroughs, taskDefinitions, chatParticipants}`.

---

## Backlog & history

### Completed (pre-vision)

- **Auto-fix mode (`calt fix` / `--fix`)** — Automatically scaffold missing sections, remove secrets, deduplicate starters, add guardrail boilerplate.
- **Plugin/action manifest validation** — Open and validate OpenAPI specs inside action plugin files, check operationIds, auth config, cross-reference with instructions.
- **Agent diff (`calt diff`)** — Structured comparison of two manifests (local vs remote, two revisions). Terminal, markdown, or JSON output.
- **Capability–instruction alignment scoring** — Deep check that each configured capability is referenced and guided in the instructions. Score as percentage.
- **Instruction complexity / readability metrics** — Flesch-Kincaid readability, section density, nested conditional detection, token count estimation.
- **SARIF output format** — `--format sarif` for GitHub Code Scanning and VS Code SARIF Viewer integration.
- **GitHub Actions integration** — Published Action that auto-detects manifests and posts results.
- **File watcher mode (`calt watch`)** — Re-runs scan/lint on every file save.

### Granular backlog (not yet mapped to a phase)

- **`calt rules` command** — List all rules with IDs, descriptions, default severities, and categories. Like `eslint --print-config`.
- **Shareable config presets** — Allow `"extends": "strict"` or `"extends": "recommended"` in `.caltrc.json` (foundation for E4 compliance presets).
- **Schema version migration hints** — When manifest version < target, diff the schemas and suggest which fields to add for the upgrade.
- **Cross-agent consistency checks** — When scanning multiple agents: detect duplicate instructions, overlapping capabilities, conflicting conversation starters across agents in the same tenant.
- **Wire up `custom_blocked_phrases`** — The config field exists in the type but no rule checks it.
- **`calt push`** — Deploy local manifest back to Graph API or Dataverse. Closes the fetch → edit → lint → push loop. Requires write scopes. (Foundation for D1.)
- **Dataverse topic/skill validation** — Currently only `CustomGptMainInstructions` components are loaded. Validate `Topic` and `Skill` component types, check flow structure.
