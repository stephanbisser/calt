import type { Rule, RuleContext, RuleResult } from "../../core/types.js";

// Secret patterns with named groups for identification
/* eslint-disable no-useless-escape */
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "API key", pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}["']?/i },
  { name: "Secret/Token", pattern: /(?:secret|token|password|passwd|pwd)\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}["']?/i },
  { name: "Bearer token", pattern: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/i },
  { name: "Stripe key", pattern: /(?:sk|pk)[-_](?:live|test)[-_][A-Za-z0-9]{10,}/i },
  { name: "GitHub PAT", pattern: /ghp_[A-Za-z0-9]{36,}/i },
  { name: "GitHub OAuth", pattern: /gho_[A-Za-z0-9]{36,}/i },
  { name: "AWS Access Key", pattern: /AKIA[A-Z0-9]{16}/i },
  { name: "Slack token", pattern: /xox[bpras]-[A-Za-z0-9\-]{10,}/i },
  { name: "Private key", pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/i },
  { name: "MongoDB connection string", pattern: /mongodb(?:\+srv)?:\/\/[^\s"']{10,}/i },
  { name: "SQL Server connection string", pattern: /(?:Server|Data Source)\s*=\s*[^;]+;.*(?:Password|Pwd)\s*=\s*[^;]+/i },
  { name: "Connection string", pattern: /(?:mysql|postgres|postgresql|redis|amqp):\/\/[^\s"']{10,}/i },
];

// PII patterns
const PII_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "Email address", pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
  { name: "US phone number", pattern: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
  { name: "DE phone number", pattern: /(?:\+49[-.\s]?|0)\d{2,4}[-.\s]?\d{4,8}/g },
  { name: "SSN", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
];

// Whitelisted email domains/patterns (reduce false positives)
const EMAIL_WHITELIST = [
  "example.com", "example.org", "example.net",
  "contoso.com", "contoso.org",
  "noreply", "no-reply",
  "test.com", "test.org",
  "placeholder",
  "fabrikam.com",
  "adventure-works.com",
  "northwindtraders.com",
];

// Internal URL patterns
const INTERNAL_URL_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "Private IP (10.x)", pattern: /https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}/g },
  { name: "Private IP (172.16-31.x)", pattern: /https?:\/\/172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/g },
  { name: "Private IP (192.168.x)", pattern: /https?:\/\/192\.168\.\d{1,3}\.\d{1,3}/g },
  { name: "Localhost URL", pattern: /https?:\/\/localhost(?::\d+)?/g },
  { name: "Internal domain (.internal)", pattern: /https?:\/\/[a-zA-Z0-9.\-]+\.internal(?:\/|\s|$)/g },
  { name: "Corporate domain (.corp)", pattern: /https?:\/\/[a-zA-Z0-9.\-]+\.corp(?:\/|\s|$)/g },
  { name: "Local domain (.local)", pattern: /https?:\/\/[a-zA-Z0-9.\-]+\.local(?:\/|\s|$)/g },
  { name: "Intranet domain (.intranet)", pattern: /https?:\/\/[a-zA-Z0-9.\-]+\.intranet(?:\/|\s|$)/g },
  { name: "Database connection URL", pattern: /(?:jdbc|redis|amqp|mongodb):\/\/[^\s"']+/g },
];
/* eslint-enable no-useless-escape */

function isWhitelistedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return EMAIL_WHITELIST.some((w) => lower.includes(w));
}

export const noSecretsInInstructions: Rule = {
  id: "SEC-003",
  name: "no-secrets-in-instructions",
  description: "Instructions must not contain API keys, tokens, passwords, or connection strings (OWASP LLM02)",
  category: "security",
  defaultSeverity: "error",
  check(context: RuleContext): RuleResult[] {
    const inst = context.manifest.instructions ?? "";
    const results: RuleResult[] = [];

    for (const { name, pattern } of SECRET_PATTERNS) {
      const match = inst.match(pattern);
      if (match) {
        const matched = match[0];
        // Redact the actual secret value
        const redacted = matched.length > 12
          ? matched.slice(0, 8) + "..." + matched.slice(-4)
          : matched.slice(0, 4) + "***";

        // Find the full line containing the secret for removal
        const lineWithSecret = inst.split("\n").find((l) => l.includes(matched)) ?? matched;

        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: this.defaultSeverity,
          passed: false,
          message: `${name} detected in instructions.`,
          details: `Found pattern matching ${name}: "${redacted}". Remove secrets from instructions immediately and rotate any exposed credentials.`,
          fix: { type: "remove" as const, pattern: lineWithSecret },
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No secrets detected in instructions.",
      });
    }

    return results;
  },
};

export const noPiiInInstructions: Rule = {
  id: "SEC-004",
  name: "no-pii-in-instructions",
  description: "Instructions should not contain personally identifiable information (OWASP LLM02)",
  category: "security",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult[] {
    const inst = context.manifest.instructions ?? "";
    const results: RuleResult[] = [];

    for (const { name, pattern } of PII_PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
      const matches = [...inst.matchAll(pattern)];

      for (const match of matches) {
        const value = match[0];

        // Skip whitelisted emails
        if (name === "Email address" && isWhitelistedEmail(value)) {
          continue;
        }

        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: this.defaultSeverity,
          passed: false,
          message: `${name} detected in instructions: "${value}"`,
          details: `Remove PII from instructions. Use placeholders or references instead of actual ${name.toLowerCase()}s.`,
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No PII detected in instructions.",
      });
    }

    return results;
  },
};

export const noInternalUrlsInInstructions: Rule = {
  id: "SEC-005",
  name: "no-internal-urls-in-instructions",
  description: "Instructions should not expose internal infrastructure URLs (OWASP LLM02)",
  category: "security",
  defaultSeverity: "warning",
  check(context: RuleContext): RuleResult[] {
    const inst = context.manifest.instructions ?? "";
    const results: RuleResult[] = [];

    for (const { name, pattern } of INTERNAL_URL_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = [...inst.matchAll(pattern)];

      for (const match of matches) {
        const lineWithUrl = inst.split("\n").find((l) => l.includes(match[0])) ?? match[0];
        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: this.defaultSeverity,
          passed: false,
          message: `${name} detected in instructions: "${match[0]}"`,
          details: "Remove internal URLs from instructions. These expose infrastructure details that could aid attackers.",
          fix: { type: "remove" as const, pattern: lineWithUrl },
        });
      }
    }

    if (results.length === 0) {
      results.push({
        ruleId: this.id,
        ruleName: this.name,
        severity: this.defaultSeverity,
        passed: true,
        message: "No internal URLs detected in instructions.",
      });
    }

    return results;
  },
};

export const sensitiveInfoRules: Rule[] = [
  noSecretsInInstructions,
  noPiiInInstructions,
  noInternalUrlsInInstructions,
];
