# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in AgentLens, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email: **stephan@bisser.at**

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

You should receive a response within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Scope

This policy applies to the AgentLens CLI tool and its npm package. It covers:

- Authentication token handling (MSAL, token cache)
- Credential exposure in output or logs
- Rule engine bypasses that could mask security issues
- Dependency vulnerabilities

## Token Security

AgentLens caches Microsoft authentication tokens locally at `~/.agentlens/token-cache.json` with file permissions `0600` (owner read/write only). Tokens are never transmitted to any service other than Microsoft's authentication and API endpoints.
