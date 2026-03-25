# CALT — Copilot Agent Lint Tool

Lint, validate, and analyze **Microsoft 365 Copilot Agent** configurations — locally or directly from your tenant.

CALT helps Makers and Pro Developers check the quality of their Declarative Agent, Copilot Studio Agent, and Custom Engine Agent configurations **before** they deploy.

> **Note:** Scanning Agent Builder agents from your tenant uses a **beta Microsoft Graph API endpoint** (`/beta/copilot/admin/catalog/packages`). This endpoint may not yet be available in all tenants or regions. Local file scanning works independently of the Graph API.

## Quick Start

```bash
# Install globally
npm install -g calt

# Scan a local agent manifest
calt scan ./path/to/declarativeAgent.json

# Scan a project folder (auto-detects appPackage/ etc.)
calt scan ./my-agent-project

# Scan with auto-fix
calt scan --fix ./declarativeAgent.json
```

## CLI Commands

### Scan — run all checks

```bash
# Scan a local manifest file
calt scan ./path/to/declarativeAgent.json

# Scan a project folder (auto-detects appPackage/ etc.)
calt scan ./my-agent-project

# Scan the current directory
calt scan

# Output as JSON (for CI/CD)
calt scan ./declarativeAgent.json --format json

# Verbose output (shows all passed checks)
calt scan ./declarativeAgent.json --verbose

# Auto-fix applicable issues
calt scan --fix ./declarativeAgent.json
```

### Lint — instruction quality only

```bash
# Lint a local manifest
calt lint ./declarativeAgent.json

# JSON output
calt lint ./declarativeAgent.json --format json
```

### Validate — schema only

```bash
calt validate ./declarativeAgent.json
```

### Fix — auto-fix issues

```bash
# Auto-fix applicable issues
calt fix ./declarativeAgent.json

# Preview fixes without modifying files
calt fix --dry-run ./declarativeAgent.json
```

### Diff — compare two agents

```bash
# Compare two local manifests
calt diff ./agentA.json ./agentB.json

# Compare local vs remote
calt diff ./local.json T_cebfd158-7116-1e34-27f5-0efca5f046f0
```

### Fetch — load agents from your M365 Tenant

Requires authentication first (see below).

```bash
# List all Copilot agents in the tenant
calt fetch --list

# Download a specific agent as a local JSON file
calt fetch --id T_cebfd158-7116-1e34-27f5-0efca5f046f0

# Download all agents into a folder
calt fetch --all --output ./agents/

# Filter by agent type
calt fetch --list --type copilot-studio
```

### Scan remote agents directly (fetch + scan in one step)

```bash
calt scan --remote --id T_cebfd158-7116-1e34-27f5-0efca5f046f0
calt scan --remote --all
```

### Login / Logout — M365 authentication

Uses Device Code Flow via MSAL. Tokens are cached in `~/.agentlens/token-cache.json`.

```bash
# Interactive login
calt login

# Login with a specific tenant
calt login --tenant YOUR_TENANT_ID

# Use a custom Entra App Registration
calt login --client-id YOUR_CLIENT_ID

# Check login status
calt login --status

# Check login status with token details
calt login --status --verbose

# Clear cached tokens
calt logout
```

> **Required permission:** `CopilotPackages.Read.All` (Delegated, Work or School Account — no admin consent required)
>
> The built-in client ID does not have this permission pre-configured. You need to register your own Entra ID app:
> 1. Azure Portal → **Entra ID** → **App registrations** → **New registration**
> 2. **Authentication** → Add platform → **Mobile and desktop applications** → enable device code flow (`https://login.microsoftonline.com/common/oauth2/nativeclient`)
> 3. **API permissions** → Add → **Microsoft Graph** → **Delegated** → `CopilotPackages.Read.All`
> 4. Login: `calt login --client-id <YOUR_APP_ID> --tenant <YOUR_TENANT_ID>`
>
> You can persist these in `.agentlensrc.json` under `graph_api.client_id` and `graph_api.tenant_id`.

### Setup — register Entra App interactively

```bash
# Interactive setup (creates config + registers Entra App via Azure CLI)
calt setup

# With a custom app name
calt setup --app-name "My CALT"

# Login immediately after setup
calt setup --login
```

### Init — create a config file

```bash
calt init
```

Creates a `.agentlensrc.json` in the current directory:

```json
{
  "rules": {},
  "instruction_min_length": 200,
  "instruction_ideal_range": [500, 4000],
  "custom_blocked_phrases": [],
  "require_conversation_starters_min": 2,
  "schema_version_target": "v1.6",
  "graph_api": {},
  "dataverse": {}
}
```

Override any rule severity or turn rules off:

```json
{
  "rules": {
    "INST-005": "off",
    "INST-010": "warning"
  }
}
```

### Report — export in different formats

```bash
# JSON report
calt report ./declarativeAgent.json --format json

# Markdown report
calt report ./declarativeAgent.json --format markdown

# HTML report saved to file
calt report ./declarativeAgent.json --format html --output report.html

# Report all remote agents
calt report --remote --all --format markdown
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

## CI/CD Integration

CALT exits with code `1` when errors are found, making it usable as a CI gate:

```yaml
# GitHub Actions example
- name: Lint Copilot Agents
  run: npx calt scan ./agents/ --format json
```

## Project Structure

```
agentlens/
├── src/
│   ├── index.ts                    # CLI entry point (commander)
│   ├── commands/                   # scan, lint, validate, fix, diff, fetch, login, init, setup, report
│   ├── core/
│   │   ├── types.ts                # All TypeScript interfaces
│   │   ├── index.ts                # Public API (for VS Code extension reuse)
│   │   ├── config-loader.ts        # .agentlensrc.json
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
│   └── config.schema.json          # JSON Schema for .agentlensrc.json
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
cd agentlens
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

Authentication tokens are stored in `~/.agentlens/token-cache.json` with file permissions `0600` (owner-only read/write). Do not commit this directory to version control.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
