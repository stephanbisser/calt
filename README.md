# CALT — Copilot Agent Lint Tool

Lint, validate, and analyze **Microsoft 365 Copilot Agent** configurations — locally or directly from your tenant.

CALT helps Makers and Pro Developers check the quality of their Declarative Agent, Copilot Studio Agent, and Custom Engine Agent configurations **before** they deploy.

> **Note:** Scanning Agent Builder agents from your tenant uses a **beta Microsoft Graph API endpoint** (`/beta/copilot/admin/catalog/packages`). This endpoint may not yet be available in all tenants or regions. Local file scanning works independently of the Graph API.

## Minimal Path to Awesome

```bash
npm install -g calt-cli          # 1. Install
calt scan ./declarativeAgent.json # 2. Scan — done!
```

## Quick Start

```bash
npm install -g calt-cli
```

### Local scanning (no setup required)

Scan local Declarative Agent manifests right away — no authentication or configuration needed:

```bash
# Scan a manifest file
calt scan ./declarativeAgent.json

# Scan a project folder (auto-detects appPackage/ etc.)
calt scan ./my-agent-project

# Scan with auto-fix
calt scan --fix ./declarativeAgent.json
```

### Tenant scanning (requires setup)

To scan agents deployed in your M365 tenant (Agent Builder + Copilot Studio), you need to register an Entra App first.

> **Note:** The Graph API endpoint for tenant scanning (`/beta/copilot/admin/catalog/packages`) requires an Entra admin role — **AI Administrator** (recommended) or **Global Administrator**. Regular user accounts will get a 403 Forbidden even with admin-consented permissions. This is a [Microsoft Graph API limitation](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/api/admin-settings/package/copilotpackages-list) — there is currently no user-scoped endpoint for reading declarative agent manifests.
>
> **Alternative for non-admin users:** Export your agent from Agent Builder and scan it locally with `calt scan ./declarativeAgent.json`.

There are two ways to set up:

**Option A: Automated setup (requires [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli))**

```bash
az login                    # Login to Azure CLI first
calt setup --login          # Creates Entra App, config, and logs in
```

**Option B: Manual setup (no Azure CLI needed)**

1. Azure Portal → **Entra ID** → **App registrations** → **New registration**
2. **Authentication** → Add platform → **Mobile and desktop applications** → enable `https://login.microsoftonline.com/common/oauth2/nativeclient`
3. **Authentication** → Advanced settings → **Allow public client flows** → **Yes** (required for Device Code Flow)
4. **API permissions** → Add → **Microsoft Graph** → **Delegated** → `CopilotPackages.Read.All` → click **Grant admin consent**
5. For Copilot Studio: also add **Dynamics CRM** → **Delegated** → `user_impersonation`
6. Run:
```bash
calt init
calt login --client-id <YOUR_APP_ID> --tenant <YOUR_TENANT_ID>
```

Once authenticated, you can scan your tenant:

```bash
# List all agents in your tenant
calt fetch --list

# Scan all Agent Builder agents
calt scan --remote --all --type agent-builder

# Scan all Copilot Studio agents
calt scan --remote --all --type copilot-studio

# Scan a specific agent by ID
calt scan --remote --id T_cebfd158-7116-1e34-27f5-0efca5f046f0

# Download all agents locally
calt fetch --all --output ./agents/
```

## CLI Commands

### Scan

```bash
calt scan ./declarativeAgent.json              # Scan a local manifest
calt scan ./my-agent-project                   # Scan a project folder
calt scan                                      # Scan current directory
calt scan --format json                        # JSON output (for CI/CD)
calt scan --verbose                            # Show all passed checks
calt scan --fix ./declarativeAgent.json        # Auto-fix issues
calt scan --remote --all                       # Scan all tenant agents
calt scan --remote --all --type copilot-studio # Scan Copilot Studio agents only
calt scan --remote --all --type agent-builder  # Scan Agent Builder agents only
```

### Lint — instruction quality only

```bash
calt lint ./declarativeAgent.json
calt lint ./declarativeAgent.json --format json
```

### Validate — schema only

```bash
calt validate ./declarativeAgent.json
```

### Fix — auto-fix issues

```bash
calt fix ./declarativeAgent.json               # Apply fixes
calt fix --dry-run ./declarativeAgent.json     # Preview without modifying
```

### Diff — compare two agents

```bash
calt diff ./agentA.json ./agentB.json          # Local vs local
calt diff ./local.json T_cebfd158-...          # Local vs remote
```

### Fetch — download agents from tenant

```bash
calt fetch --list                              # List all agents
calt fetch --list --type copilot-studio        # List Copilot Studio agents
calt fetch --list --type agent-builder         # List Agent Builder agents
calt fetch --id T_cebfd158-... --output ./     # Download specific agent
calt fetch --all --output ./agents/            # Download all agents
```

### Login / Logout

```bash
calt login                                     # Interactive login (Device Code Flow)
calt login --client-id <ID> --tenant <TID>     # With specific app
calt login --status                            # Check login status
calt login --status --verbose                  # Show token details
calt logout                                    # Clear cached tokens
```

### Setup / Init

```bash
calt setup                                     # Automated Entra App registration (needs Azure CLI)
calt setup --login                             # Setup + login in one step
calt init                                      # Create .caltrc.json config only

# Scaffold a new agent manifest from template
calt init --template basic                     # Standard agent with instructions + starters
calt init --template enterprise                # Enterprise agent with SharePoint, WebSearch, security
calt init --template minimal                   # Bare minimum valid manifest

# Custom output path
calt init --template basic --output agents/my-agent.json
```

### Report — export results

```bash
calt report ./declarativeAgent.json --format json
calt report ./declarativeAgent.json --format markdown
calt report ./declarativeAgent.json --format html --output report.html
calt report --remote --all --format markdown
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0`  | All checks passed successfully |
| `1`  | Lint or validation errors found in agent configuration |
| `2`  | CLI error (network failure, file not found, invalid arguments) |

## Configuration

Run `calt init` to create a `.caltrc.json`:

```json
{
  "rules": {},
  "instruction_min_length": 200,
  "instruction_ideal_range": [500, 4000],
  "custom_blocked_phrases": [],
  "require_conversation_starters_min": 2,
  "schema_version_target": "v1.6",
  "graph_api": {
    "client_id": "",
    "tenant_id": ""
  },
  "dataverse": {
    "org_urls": []
  }
}
```

Override rule severities or turn rules off:

```json
{
  "rules": {
    "INST-005": "off",
    "INST-010": "warning"
  }
}
```

## Lint Rules Reference

### Instruction Rules

| Rule ID | Name | Severity | What it checks |
|---------|------|----------|----------------|
| `INST-001` | instructions-not-empty | error | Instructions must not be empty |
| `INST-002` | instructions-max-length | error | Max 8,000 characters |
| `INST-003` | instructions-min-length | warning | Fewer than 200 chars is probably too short |
| `INST-004` | has-purpose-section | warning | Should have a clear objective/purpose |
| `INST-005` | has-markdown-structure | info | Recommends Markdown headers and lists |
| `INST-006` | uses-actionable-verbs | warning | Should use specific verbs (search, create, display...) |
| `INST-007` | avoids-vague-language | warning | Flags "maybe", "try to", "if possible", "sometimes" |
| `INST-008` | has-workflow-steps | info | Recommends numbered steps or a workflow section |
| `INST-009` | references-capabilities | warning | Configured capabilities should be mentioned in instructions |
| `INST-010` | has-examples | info | Recommends few-shot examples |
| `INST-011` | has-error-handling | info | Recommends error/fallback guidance |
| `INST-012` | has-output-format-rules | info | Recommends response formatting rules |
| `INST-013` | no-conflicting-instructions | warning | Detects "always X" vs "never X" contradictions |
| `INST-014` | avoids-negative-framing | info | Prefers "Do X" over "Don't do Y" |
| `INST-015` | conversation-starters-match | warning | Starters should be relevant to instruction content |

### Schema Rules

| Rule ID | Name | Severity |
|---------|------|----------|
| `SCHEMA-001` | valid-schema | error |
| `SCHEMA-002` | schema-version | info |
| `SCHEMA-003` | required-fields | error |
| `SCHEMA-004` | name-length | error |
| `SCHEMA-005` | description-length | error |

### Knowledge Source Rules

| Rule ID | Name | Severity |
|---------|------|----------|
| `KNOW-001` | sharepoint-url-valid | error |
| `KNOW-002` | sharepoint-ids-present | info |
| `KNOW-003` | websearch-site-limit | error |
| `KNOW-004` | websearch-url-valid | error |
| `KNOW-005` | connector-id-present | error |

### Action Rules

| Rule ID | Name | Severity |
|---------|------|----------|
| `ACT-001` | action-file-exists | error |
| `ACT-002` | action-id-unique | error |

### Conversation Starter Rules

| Rule ID | Name | Severity |
|---------|------|----------|
| `CS-001` | starter-min-count | warning |
| `CS-002` | starter-max-count | error |
| `CS-003` | starter-has-text | error |
| `CS-004` | starter-no-duplicates | warning |

## GitHub Action

Use CALT directly in your GitHub Actions workflow to lint agent manifests on every PR.

### Quick Start

```yaml
# .github/workflows/agent-lint.yml
name: Lint Copilot Agents
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: stephanbisser/calt@main
        with:
          path: ./agents/
```

### With SARIF Upload (GitHub Code Scanning)

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: stephanbisser/calt@main
        with:
          path: ./agents/
          sarif-upload: "true"
```

### Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `path` | Path to agent manifest or directory | `.` |
| `format` | Output format (`terminal`, `json`, `sarif`) | `terminal` |
| `fail-on` | Minimum severity to fail (`error`, `warning`, `off`) | `error` |
| `config` | Path to `.caltrc.json` | — |
| `sarif-upload` | Upload SARIF to GitHub Code Scanning | `false` |

### Outputs

| Output | Description |
|--------|-------------|
| `exit-code` | Exit code (0=pass, 1=errors, 2=crash) |
| `sarif-file` | Path to SARIF file (if generated) |

## CI/CD Integration

CALT exits with code `1` when errors are found, making it usable as a CI gate:

```yaml
# GitHub Actions example
- name: Lint Copilot Agents
  run: npx calt-cli scan ./agents/ --format json
```

## Project Structure

```
calt/
├── src/
│   ├── index.ts                    # CLI entry point (commander)
│   ├── commands/                   # scan, lint, validate, fix, diff, fetch, login, init, setup, report
│   ├── core/
│   │   ├── types.ts                # All TypeScript interfaces
│   │   ├── index.ts                # Public API (for VS Code extension reuse)
│   │   ├── config-loader.ts        # .caltrc.json
│   │   ├── project-detector.ts     # Auto-detect project type
│   │   └── manifest-loader.ts      # Load from file or Graph API
│   ├── graph/
│   │   ├── auth.ts                 # MSAL Device Code Flow + token cache
│   │   ├── client.ts               # Graph API client with pagination
│   │   └── transform.ts            # Graph response → manifest
│   ├── dataverse/
│   │   ├── auth.ts                 # Dataverse authentication
│   │   ├── client.ts               # Dataverse API client
│   │   └── transform.ts            # Bot → manifest transform
│   ├── rules/
│   │   ├── rule-engine.ts          # Orchestrates all checks
│   │   ├── schema/                 # AJV validation + embedded JSON schemas
│   │   ├── instructions/           # INST-001 through INST-015
│   │   ├── knowledge/              # SharePoint, WebSearch, Connector rules
│   │   ├── actions/                # Plugin file checks
│   │   ├── conversation-starters/  # Starter validation
│   │   └── security/               # OWASP LLM Top 10 rules
│   ├── formatters/                 # terminal (chalk), json, markdown, html
│   └── utils/                      # URL validator, Markdown parser
├── schemas/
│   └── config.schema.json          # JSON Schema for .caltrc.json
├── tests/
│   ├── fixtures/                   # Sample manifests + Graph API response
│   ├── core/                       # project-detector, config-loader, markdown-parser, manifest-loader
│   ├── graph/                      # transform tests
│   ├── rules/                      # All rule tests + rule-engine integration
│   └── utils/                      # URL validator tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Development

```bash
# Clone and install
git clone https://github.com/stephanbisser/calt.git
cd calt
npm install

# Run in dev mode (no build step, uses tsx)
npm run dev -- scan ./tests/fixtures/valid-manifest.json

# Build to dist/
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## Token Security

Authentication tokens are stored in `~/.calt/token-cache.json` with file permissions `0600` (owner-only read/write). Do not commit this directory to version control.

## Programmatic API

CALT can be used as a library (e.g., from a VS Code extension or custom tooling).

### Installation

```bash
npm install calt-cli
```

### Import

```typescript
import {
  loadConfig,
  loadFromFile,
  runFullScan,
  runInstructionLint,
  runSchemaValidation,
  applyFixes,
  diffManifests,
  formatAsJson,
  formatAsMarkdown,
  formatAsHtml,
  detectProject,
} from "calt-cli";
```

### Exported Functions

| Function | Description |
|----------|-------------|
| `loadConfig(dir?)` | Load and merge `.caltrc.json` with defaults |
| `loadFromFile(path)` | Load an agent manifest from a local file |
| `loadFromRemote(id, token)` | Fetch a single agent from Microsoft Graph API |
| `loadAllFromRemote(token)` | Fetch all agents from a tenant via Graph API |
| `loadFromDataverse(orgUrl, token)` | Load a Copilot Studio agent from Dataverse |
| `listDataverseBots(orgUrl, token)` | List all Copilot Studio bots in a Dataverse org |
| `runFullScan(agent, config)` | Run all checks (schema + instructions + knowledge + actions + starters) |
| `runInstructionLint(agent, config)` | Run instruction-quality checks only |
| `runSchemaValidation(agent, config)` | Run schema validation only |
| `applyFixes(agent, descriptors)` | Auto-fix detected issues |
| `diffManifests(a, b)` | Structured diff between two agent manifests |
| `detectProject(dir)` | Auto-detect project type (Teams Toolkit, Agents Toolkit, etc.) |

### Example

```typescript
import { loadConfig, loadFromFile, runFullScan, formatAsJson } from "calt-cli";

const config = await loadConfig();
const agent = await loadFromFile("./appPackage/declarativeAgent.json");
const report = await runFullScan(agent, config);

if (report.error_count > 0) {
  console.error(formatAsJson(report));
  process.exit(1);
}
console.log(`✅ ${agent.metadata.name}: no errors found`);
```

Types such as `AgentLensConfig`, `ScanReport`, `RuleResult`, `LoadedAgent`, `FixDescriptor`, `DiffReport`, and others are also exported for full type safety.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
