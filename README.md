# AgentLens

Lint, validate, and analyze **Microsoft 365 Copilot Agent** configurations — locally or directly from your tenant.

AgentLens helps Makers and Pro Developers check the quality of their Declarative Agent, Copilot Studio Agent, and Custom Engine Agent configurations **before** they deploy.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run against a local manifest
node dist/index.js scan ./tests/fixtures/valid-manifest.json

# Run against a manifest with issues
node dist/index.js scan ./tests/fixtures/bad-instructions-manifest.json
```

## Running Tests

```bash
# Run all 104 tests (10 test files)
npm test

# Watch mode — re-runs on file changes
npm run test:watch
```

Test coverage:

| Test File | What it covers |
|-----------|----------------|
| `tests/graph/transform.test.ts` | Parsing Graph API responses, extracting manifests from escaped JSON `definition` fields, slugify |
| `tests/rules/instruction-rules.test.ts` | All 15 instruction lint rules (INST-001 – INST-015) |
| `tests/rules/knowledge-rules.test.ts` | SharePoint URL validation, WebSearch site limits, GraphConnector checks |
| `tests/rules/schema-rules.test.ts` | AJV schema validation against v1.3 – v1.6, required fields, field length |
| `tests/rules/starter-rules.test.ts` | Conversation starter min/max count, duplicates, empty text |
| `tests/rules/rule-engine.test.ts` | Full scan orchestration, instruction-only lint, config override integration |
| `tests/core/project-detector.test.ts` | Auto-detection of Agents Toolkit, Teams Toolkit, standalone JSON, nested dirs |
| `tests/core/config-loader.test.ts` | Loading `.agentlensrc.json`, merging with defaults, severity overrides |
| `tests/core/markdown-parser.test.ts` | Header/list/bold detection, section detection (EN + DE) |
| `tests/utils/url-validator.test.ts` | SharePoint URL checks, path segment counting, query parameter detection |

## CLI Commands

### Scan — run all checks

```bash
# Scan a local manifest file
node dist/index.js scan ./path/to/declarativeAgent.json

# Scan a project folder (auto-detects appPackage/ etc.)
node dist/index.js scan ./my-agent-project

# Scan the current directory
node dist/index.js scan

# Output as JSON (for CI/CD)
node dist/index.js scan ./declarativeAgent.json --format json

# Verbose output
node dist/index.js scan ./declarativeAgent.json --verbose
```

### Lint — instruction quality only

```bash
# Lint a local manifest
node dist/index.js lint ./declarativeAgent.json

# JSON output
node dist/index.js lint ./declarativeAgent.json --format json
```

### Validate — schema only

```bash
node dist/index.js validate ./declarativeAgent.json
```

### Fetch — load agents from your M365 Tenant

Requires authentication first (see below).

```bash
# List all Copilot agents in the tenant
node dist/index.js fetch --list

# Download a specific agent as a local JSON file
node dist/index.js fetch --id T_cebfd158-7116-1e34-27f5-0efca5f046f0

# Download all agents into a folder
node dist/index.js fetch --all --output ./agents/
```

### Scan remote agents directly (fetch + scan in one step)

```bash
node dist/index.js scan --remote --id T_cebfd158-7116-1e34-27f5-0efca5f046f0
node dist/index.js scan --remote --all
```

### Login / Logout — M365 authentication

Uses Device Code Flow via MSAL. Tokens are cached in `~/.agentlens/token-cache.json`.

```bash
# Interactive login
node dist/index.js login

# Login with a specific tenant
node dist/index.js login --tenant YOUR_TENANT_ID

# Use a custom Entra App Registration
node dist/index.js login --client-id YOUR_CLIENT_ID

# Check login status
node dist/index.js login --status

# Clear cached tokens
node dist/index.js logout
```

> **Required permission:** `CopilotPackages.Read.All` (Delegated, Work or School Account — no admin consent required)
>
> The built-in client ID does not have this permission pre-configured. You need to register your own Entra ID app:
> 1. Azure Portal → **Entra ID** → **App registrations** → **New registration**
> 2. **Authentication** → Add platform → **Mobile and desktop applications** → enable device code flow (`https://login.microsoftonline.com/common/oauth2/nativeclient`)
> 3. **API permissions** → Add → **Microsoft Graph** → **Delegated** → `CopilotPackages.Read.All`
> 4. Login: `node dist/index.js login --client-id <YOUR_APP_ID> --tenant <YOUR_TENANT_ID>`
>
> You can persist these in `.agentlensrc.json` under `graph_api.client_id` and `graph_api.tenant_id`.

### Init — create a config file

```bash
node dist/index.js init
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
  "graph_api": {
    "client_id": "",
    "tenant_id": ""
  }
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
node dist/index.js report ./declarativeAgent.json --format json

# Markdown report
node dist/index.js report ./declarativeAgent.json --format markdown

# HTML report saved to file
node dist/index.js report ./declarativeAgent.json --format html --output report.html

# Report all remote agents
node dist/index.js report --remote --all --format markdown
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

AgentLens exits with code `1` when errors are found, making it usable as a CI gate:

```yaml
# GitHub Actions example
- name: Lint Copilot Agents
  run: npx agentlens scan ./agents/ --format json
```

## Project Structure

```
agentlens/
├── src/
│   ├── index.ts                    # CLI entry point (commander)
│   ├── commands/                   # scan, lint, validate, fetch, login, init, report
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
│   ├── rules/
│   │   ├── rule-engine.ts          # Orchestrates all checks
│   │   ├── schema/                 # AJV validation + embedded JSON schemas
│   │   ├── instructions/           # INST-001 through INST-015
│   │   ├── knowledge/              # SharePoint, WebSearch, Connector rules
│   │   ├── actions/                # Plugin file checks
│   │   └── conversation-starters/  # Starter validation
│   ├── formatters/                 # terminal (chalk), json, markdown, html
│   └── utils/                      # URL validator, Markdown parser
├── schemas/
│   └── config.schema.json          # JSON Schema for .agentlensrc.json
├── tests/
│   ├── fixtures/                   # Sample manifests + Graph API response
│   ├── core/                       # project-detector, config-loader, markdown-parser
│   ├── graph/                      # transform tests
│   ├── rules/                      # All rule tests + rule-engine integration
│   └── utils/                      # URL validator tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Test Fixtures

The `tests/fixtures/` folder contains sample files you can use for testing:

| File | Description |
|------|-------------|
| `valid-manifest.json` | Well-structured agent with all best practices |
| `minimal-manifest.json` | Bare minimum v1.3 manifest |
| `bad-instructions-manifest.json` | Poor instruction quality (vague language, no structure) |
| `invalid-manifest.json` | Missing required fields, name too long |
| `websearch-manifest.json` | WebSearch with too many sites and bad URLs |
| `graph-api-response.json` | Real Graph API response with escaped `definition` JSON |

## Development

```bash
# Run in dev mode (no build step, uses tsx)
npm run dev -- scan ./tests/fixtures/valid-manifest.json

# Type-check without building
npx tsc --noEmit

# Build to dist/
npm run build
```

## Token Security

Authentication tokens are stored in `~/.agentlens/token-cache.json` with file permissions `0600` (owner-only read/write). Do not commit this directory to version control.

## License

MIT
