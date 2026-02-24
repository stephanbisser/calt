# Contributing to AgentLens

Thanks for your interest in contributing to AgentLens! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/stephanbisser/agentlens.git
cd agentlens
npm install
npm run build
npm test
```

## Running Locally

```bash
# Dev mode (no build needed)
npm run dev -- scan <path>

# Or link globally
npm link
agentlens scan <path>
```

## Project Structure

- `src/commands/` — CLI commands (Commander.js)
- `src/core/` — Config loading, manifest loading, types, public API
- `src/rules/` — Rule engine and all lint/validation rules
- `src/formatters/` — Output formatters (terminal, JSON, Markdown, HTML)
- `src/graph/` — Microsoft Graph API integration
- `src/dataverse/` — Dataverse/Copilot Studio integration
- `tests/` — Vitest test suite

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Run `npm test` to ensure all tests pass
4. Run `npm run lint` to check for lint issues
5. Submit a PR with a clear description

## Adding a New Rule

1. Create or extend a rule file in the appropriate `src/rules/` subdirectory
2. Register the rule in `src/rules/rule-engine.ts`
3. Add tests in `tests/rules/`
4. Update the rule reference table in `README.md`

## Code Style

- TypeScript with strict mode
- ES modules (explicit `.js` extensions in imports)
- Vitest for testing
- ESLint for linting

## Reporting Issues

Use [GitHub Issues](https://github.com/stephanbisser/agentlens/issues) to report bugs or request features.
