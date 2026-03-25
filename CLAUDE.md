# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CALT** (Copilot Agent Lint Tool) is a TypeScript/Node.js CLI tool for linting, validating, and analyzing Microsoft 365 Copilot Agent configurations (Declarative Agents, Copilot Studio Agents, Custom Engine Agents) before deployment. It also exposes a public API for use as a library (e.g., by a VS Code extension).

## Commands

```bash
# Build
npm run build          # Compile TS → JS + copy schemas to dist/
npm run dev -- [args]  # Run CLI in dev mode without building (uses tsx)

# Test
npm test               # Run all tests (vitest run)
npm run test:watch     # Watch mode
npm test -- tests/rules/instruction-rules.test.ts  # Run single test file
npm test -- --grep "INST-001"                       # Run tests matching pattern

# Lint
npm run lint           # ESLint on src/
```

## Architecture

The codebase follows a three-layer architecture:

**1. Command Layer** (`src/commands/`) — 8 commands registered via Commander.js in `src/index.ts`:
- `scan`: Full check (schema + instructions + knowledge + actions + starters)
- `lint`: Instruction-quality checks only
- `validate`: Schema-only validation
- `fetch`: Download agent manifests from M365 tenant via Graph API
- `login`/`logout`: MSAL Device Code Flow authentication
- `init`: Create `.caltrc.json` config file
- `setup`: Register an Entra App interactively
- `report`: Export scan results (json/markdown/html)

**2. Core Layer** (`src/core/`):
- `types.ts`: All TypeScript interfaces (manifests, rules, configs, reports)
- `config-loader.ts`: Reads and merges `.caltrc.json` with defaults
- `project-detector.ts`: Auto-detects project type (Teams Toolkit, Agents Toolkit, standalone)
- `manifest-loader.ts`: Loads manifests from local files or Microsoft Graph API
- `index.ts`: Public API exports (for programmatic use)

**3. Rule Engine** (`src/rules/`):
- `rule-engine.ts`: Orchestrates all checks; routes to appropriate rule categories
- `schema/`: AJV-based JSON Schema validation for manifest versions v1.3–v1.6 (schemas live in `src/rules/schema/schemas/`)
- `instructions/`: 15 quality rules (INST-001 to INST-015) split across `length-rules.ts`, `structure-rules.ts`, `language-rules.ts`, `reference-rules.ts`
- `knowledge/`: SharePoint URL, WebSearch, and GraphConnector rules
- `actions/`: Plugin file existence checks
- `conversation-starters/`: Count, duplicate, and relevance checks

**Output Layer** (`src/formatters/`): terminal (Chalk), JSON, Markdown, HTML.

**Graph Integration** (`src/graph/`): MSAL Device Code Flow auth with token cache at `~/.calt/token-cache.json`, Graph API client with pagination, response-to-manifest transformer.

### Data Flow

```
CLI command → Config Loader → Project Detector → Manifest Loader (file or Graph API)
                                                          ↓
                                                    Rule Engine
                                                          ↓
                                                    Formatter → Output
```

### Key Configuration

`.caltrc.json` (per-project, committed to repo):
- Override rule severities (`"off"` | `"warning"` | `"error"`)
- Tune thresholds (`instruction_min_length`, `instruction_ideal_range`)
- Store `graph_api.client_id` and `graph_api.tenant_id` for tenant scanning

### Public API

`src/core/index.ts` re-exports functions for programmatic use. The package exports both a CLI binary (`calt` → `dist/index.js`) and a library entry point (`dist/core/index.js`).

## Key Technical Details

- **ES modules** (`"type": "module"` in package.json); imports need explicit `.js` extensions in source
- **Node 18+** required
- **Test framework**: Vitest with globals enabled (`vitest.config.ts`); test fixtures in `tests/fixtures/`
- Schemas are copied from `src/rules/schema/schemas/` to `dist/` during build — if adding new schemas, update the build script in `package.json`
