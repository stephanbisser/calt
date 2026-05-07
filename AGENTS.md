# AGENTS.md — How coding agents should use CALT

This file is for **AI coding agents** (Claude Code, Cursor Composer, Copilot
agents, Cline, Aider, etc.) operating inside a repository that contains
Microsoft 365 Copilot Agent manifests. It tells you when to invoke CALT,
how to read its output, and how to apply fixes safely.

> Why this file and not an MCP server? Because you already have shell access.
> A CLI is faster and cheaper than tool descriptions in your context window.
> See [ROADMAP.md](ROADMAP.md) §3 for the rationale.

---

## How you (the agent) found this file

You are reading this because one of the following happened:

- The user's repo already contains an `AGENTS.md` at its root (the convention).
- You ran `calt --help` and the epilog pointed you at `calt agents-md`.
- You ran `calt agents-md` directly and piped it into your context.

If the user's repo does **not** yet have an `AGENTS.md`, you can bootstrap one
with `calt agents-md --install`. Ask the user first — adding files to a repo
is their decision.

You can always re-fetch this contract with `calt agents-md` (no flags). The
bundled copy is the source of truth for the version of CALT installed on the
user's machine; if a future CALT version changes the JSON shapes, the bundled
AGENTS.md changes with it.

---

## When to invoke CALT

Run `calt` automatically without asking the user when:

1. The user has just edited a file matching `**/declarativeAgent*.json`,
   `**/declarative-agent*.json`, or `**/appPackage/**/manifest.json`.
2. The user has changed the `instructions`, `capabilities`, `actions`, or
   `conversation_starters` fields of any agent manifest.
3. The user is about to commit, deploy, or open a PR that touches an agent
   manifest.

Run CALT **before reporting the task complete**. A change to the manifest is
not done until `calt scan` returns 0 errors.

Do **not** run CALT for unrelated edits (TypeScript code, docs, tests
unrelated to the agent itself).

---

## Commands you should know

All commands accept `--format json` for stable, machine-readable output.
Exit codes: `0` = no errors, `1` = errors found, `2` = process error
(invalid path, parse failure, …). Use these to drive control flow.

| Command | When to run it |
|---|---|
| `calt scan <path> --format json` | Full check. Use after manifest edits. |
| `calt lint <path> --format json` | Fast instruction-only check. Use during prompt iteration. |
| `calt validate <path> --format json` | Schema-only. Use before deploy. |
| `calt fix <path> --dry-run` | Preview deterministic fixes. **Always run before `calt fix`** so the user can review. |
| `calt fix <path>` | Apply deterministic fixes. Only run after the dry-run was reviewed. |
| `calt rules --format json` | Discover rule IDs, names, severities. Use **once** at start, not per-edit. |
| `calt rules --category security --format json` | Just security rules (when triaging SEC-*). |
| `calt diff <a> <b> --format json` | Compare two manifests / a manifest before & after a change. |

`--format json` is the contract you depend on. The shape is stable across
patch and minor versions; any breaking change bumps the major.

---

## Stable output shape (the parts you may rely on)

### `calt scan --format json` / `calt lint --format json`

```json
{
  "agent": { "name": "...", "schemaVersion": "v1.6", "source": { "type": "local", "filePath": "..." } },
  "categories": [
    {
      "name": "Instruction Quality",
      "category": "instructions",
      "results": [
        {
          "ruleId": "INST-007",
          "ruleName": "minimum-length",
          "severity": "warning",
          "passed": false,
          "message": "Instructions are 142 characters; minimum is 200.",
          "details": "...",
          "fix": { "type": "append-section", "content": "..." }
        }
      ],
      "passed": 18,
      "total": 20
    }
  ],
  "summary": { "totalChecks": 51, "passed": 47, "errors": 1, "warnings": 3, "infos": 0 },
  "timestamp": "2026-…"
}
```

Keys you should rely on: `summary.errors`, `summary.warnings`,
`categories[].results[].ruleId`, `.severity`, `.passed`, `.message`, `.fix`.

### `calt rules --format json`

```json
{
  "count": 51,
  "rules": [
    {
      "id": "SEC-001",
      "name": "prompt-injection-guardrails",
      "description": "Instructions should contain defensive guardrails against prompt injection.",
      "category": "security",
      "defaultSeverity": "warning",
      "effectiveSeverity": "warning"
    }
  ]
}
```

`effectiveSeverity` already accounts for `.caltrc.json` overrides — you do
not need to merge those yourself.

---

## Rule ID conventions (cheat sheet)

| Prefix | Category | What it covers |
|---|---|---|
| `SCHEMA-*` | schema | JSON-schema conformance (required fields, types, version). |
| `INST-*` | instructions | Length, structure, language, capability alignment, complexity. |
| `KNOW-*` | knowledge | WebSearch, SharePoint, Graph Connector configuration. |
| `ACT-*` | actions | Plugin-manifest existence, OpenAPI cross-references. |
| `CS-*` | conversation-starters | Count, duplicates, relevance. |
| `SEC-*` | security | OWASP LLM Top 10 mapped checks. |

When `--format json` reports a finding, prefer to fix by applying the
`fix` descriptor (see next section) over rewriting the manifest yourself.

---

## How to apply fixes

**Deterministic fixes (preferred, always safe):**

```bash
calt fix path/to/declarativeAgent.json --dry-run
# show the user the diff
calt fix path/to/declarativeAgent.json
```

`fix` only touches findings whose `result.fix` is set. It does not change
anything else.

**AI-assisted rewrites** (when no `fix` is provided): you, the agent, can
do the rewrite yourself. Read the failing finding's `message` and
`details`, edit the manifest, then re-run `calt scan` to verify. Stop
iterating once the rule passes — do not "improve" beyond what the rule
requires.

Never edit `dist/`, `node_modules/`, or any file under `**/.calt/`.

---

## Authentication

CALT reads cached credentials from `~/.calt/token-cache.json`. To work with
remote agents (`calt fetch`, `calt scan --remote`), the user must run
`calt login` interactively first. Do **not** attempt to drive `calt login`
yourself — it requires browser-based device-code consent.

---

## Configuration

Per-project tuning lives in `.caltrc.json` at the project root. You may:

- Read `.caltrc.json` to understand the project's rule severities.
- Suggest edits to `.caltrc.json` when the user asks for stricter / looser checks.

You may **not**:

- Disable a rule (`"rules": { "SEC-…": "off" }`) without explicit user
  consent. Always ask first; security rules in particular often warn for
  good reason.

---

## Failure modes and what to do

| Symptom | What to do |
|---|---|
| `Exit code 2` | Process error. Read stderr; usually a bad path, parse failure, or missing dependency. Don't retry blindly. |
| `Exit code 1` | Errors found. Show the user the findings (filter to errors first), propose fixes. |
| Network error during `--remote` / `fetch` | Tell the user; do not retry more than once. |
| `--format json` produces non-JSON | CALT version mismatch. Run `calt --version` and tell the user. |

---

## What NOT to do

- Do **not** invent rule IDs. If you need to reference a rule, you can run
  `calt rules --format json` to enumerate them.
- Do **not** parse the human-readable terminal output. Always use
  `--format json`.
- Do **not** run `calt fix` without a `--dry-run` first when operating on
  files the user hasn't seen.
- Do **not** open a PR with `summary.errors > 0` unless the user has
  explicitly accepted those errors.
- Do **not** install or recommend an MCP server for CALT — the CLI is the
  agent contract. (See ROADMAP.md §3.)
