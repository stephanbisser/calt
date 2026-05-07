# CALT — Copilot Agent Lint Tool (VS Code)

Lint, validate, and analyze Microsoft 365 Copilot Agent manifests directly inside
VS Code. CALT brings the same 35+ rules used by the [`calt` CLI](https://github.com/stephanbisser/calt)
into the editor: live diagnostics, schema-aware IntelliSense, quick-fixes,
and a status-bar health score.

## Features

### Phase 1 — Foundation

| Feature | Description |
|---------|-------------|
| **Live diagnostics** | Manifests are scanned on save (or as you type). Errors, warnings, and infos appear inline with rule IDs (`INST-LEN-001`, `SEC-PI-002`, …). |
| **Quick-fix lightbulbs** | Deterministic fixes for any rule that emits a `FixDescriptor` — append guardrail sections, remove duplicate starters, etc. |
| **Schema IntelliSense** | JSON schemas v1.3–v1.6 are bundled. Auto-completion and validation for `declarativeAgent.json` and `.caltrc.json`. |
| **Status-bar health score** | At-a-glance score (0–100) for the active manifest, weighted by rule severity. |
| **Hover docs** | Hover any finding to see rule ID, message, and a link to the rule documentation. |
| **Init-config wizard** | `CALT: Initialize Config` scaffolds `.caltrc.json` with a chosen severity profile (recommended / strict / security-first). |
| **CI workflow generator** | `CALT: Generate CI Workflow` emits a ready-to-use GitHub Actions or Azure DevOps pipeline with SARIF upload to Code Scanning. |
| **Tasks** | `CALT: scan / fix / fix --dry-run / watch` registered with VS Code's task runner. |
| **Auto-detection** | M365 Agents Toolkit and Teams Toolkit projects are detected on workspace open and offered linting. |
| **Walkthrough** | A 5-step Getting Started flow takes new users from manifest to CI-gated deploy. |

### Phase 2 — AI

| Feature | Description |
|---------|-------------|
| **`@calt` Chat Participant** | Open Copilot Chat and mention `@calt` to use slash commands: `/scan`, `/fix`, `/explain <ruleId>`, `/improve-instruction`, `/generate-starters`, `/audit-security`. Streaming responses with executable buttons. |
| **AI Auto-Fix** | A second quick-fix lightbulb — **Fix with Copilot** — appears for findings without a deterministic `FixDescriptor` (e.g. `INST-LANG-*`, `SEC-PI-*`). The LM rewrites the `instructions` field; CALT re-validates before applying. |
| **Instruction Rewrite** | `/improve-instruction` rewrites the active manifest's instructions using current findings as constraints (length range, OWASP guardrails, capability alignment). |
| **Starter Generator** | `/generate-starters` proposes 4–6 conversation starters from the agent's name, description, and instructions; one-click apply. |
| **Security Audit** | `/audit-security` walks each `SEC-*` finding and uses the LM to map it to OWASP LLM Top 10 + suggest concrete guardrail clauses. Hover any `SEC-*` underline for a "Why is this risky?" link. |
| **Plain-language summaries (D3)** | Set `calt.persona` to `maker` for friendly explanations (or `ciso` for OWASP-tagged messages). Pro-Code persona keeps the terse rule-IDed text. |

GitHub Copilot subscription is required for AI features. Without it, deterministic
fixes, diagnostics, and the static parts of the chat participant still work.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `calt.enable` | `true` | Master toggle for live diagnostics. |
| `calt.run` | `onSave` | When to run scans (`onSave` or `onType`). |
| `calt.debounceMs` | `500` | Debounce window for `onType`. |
| `calt.persona` | `pro-code` | Persona for rule descriptions and dashboards. |

## Roadmap

This is the foundation phase. Subsequent phases bring AI auto-fixes via
`vscode.lm`, a `@calt` Copilot Chat participant, an MCP server, a tenant-wide
governance dashboard, and more. See [ROADMAP.md](https://github.com/stephanbisser/calt/blob/main/ROADMAP.md).

## License

MIT — Stephan Bisser
