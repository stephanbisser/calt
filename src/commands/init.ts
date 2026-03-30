import chalk from "chalk";
import { writeFile, access, constants, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const DEFAULT_CONFIG = {
  $schema:
    "https://raw.githubusercontent.com/stephanbisser/calt/main/schemas/config.schema.json",
  rules: {},
  instruction_min_length: 200,
  instruction_ideal_range: [500, 4000],
  custom_blocked_phrases: [],
  require_conversation_starters_min: 2,
  schema_version_target: "v1.6",
  graph_api: {},
  dataverse: {},
};

export type TemplateName = "basic" | "enterprise" | "minimal";

const VALID_TEMPLATES: ReadonlySet<string> = new Set(["basic", "enterprise", "minimal"]);

export interface InitOptions {
  force?: boolean;
  template?: string;
  output?: string;
}

const BASIC_TEMPLATE = {
  $schema:
    "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.4/schema.json",
  version: "v1.4",
  name: "My Agent",
  description: "A helpful assistant",
  instructions:
    "## Purpose\n\nYou are a helpful assistant that assists users with [describe purpose].\n\n## Guidelines\n\n- Be concise and clear in your responses\n- Ask for clarification when the request is ambiguous\n- Provide sources when referencing specific information\n\n## Workflow\n\n1. Understand the user's request\n2. Search available knowledge sources\n3. Provide a clear, actionable response",
  conversation_starters: [
    { title: "Get started", text: "What can you help me with?" },
    { title: "Learn more", text: "What are your capabilities?" },
  ],
};

const ENTERPRISE_TEMPLATE = {
  $schema:
    "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.4/schema.json",
  version: "v1.4",
  name: "My Agent",
  description: "An enterprise assistant with access to organizational knowledge",
  instructions:
    "## Purpose\n\nYou are an enterprise assistant that helps employees find information and complete tasks using organizational knowledge sources.\n\n## Guidelines\n\n- Be concise and clear in your responses\n- Ask for clarification when the request is ambiguous\n- Provide sources when referencing specific information\n- Always cite the source document or page when providing information\n\n## Security\n\n- Never share confidential information outside the user's access scope\n- Do not generate or store passwords, tokens, or secrets\n- Redirect compliance or legal questions to the appropriate department\n- Respect data classification labels on all documents\n\n## Workflow\n\n1. Understand the user's request\n2. Search available knowledge sources including SharePoint and web\n3. Verify information accuracy across multiple sources when possible\n4. Provide a clear, actionable response with source citations",
  capabilities: [
    { name: "WebSearch" },
    {
      name: "OneDriveAndSharePoint",
      items_by_url: [
        { url: "https://contoso.sharepoint.com/sites/knowledge" },
      ],
    },
  ],
  conversation_starters: [
    { title: "Get started", text: "What can you help me with?" },
    { title: "Search knowledge base", text: "Find information about our company policies" },
    { title: "Recent updates", text: "What are the latest organizational announcements?" },
    { title: "Help with a task", text: "Help me draft a document based on our templates" },
    { title: "Learn more", text: "What data sources do you have access to?" },
  ],
};

const MINIMAL_TEMPLATE = {
  $schema:
    "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.4/schema.json",
  version: "v1.4",
  name: "My Agent",
  description: "A helpful assistant",
  instructions: "You are a helpful assistant.",
};

export function getTemplate(name: string): Record<string, unknown> {
  switch (name) {
    case "basic":
      return structuredClone(BASIC_TEMPLATE);
    case "enterprise":
      return structuredClone(ENTERPRISE_TEMPLATE);
    case "minimal":
      return structuredClone(MINIMAL_TEMPLATE);
    default:
      throw new Error(
        `Unknown template "${name}". Valid templates: ${[...VALID_TEMPLATES].join(", ")}`,
      );
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function createConfig(options: InitOptions): Promise<void> {
  const filePath = resolve(process.cwd(), ".caltrc.json");

  if ((await fileExists(filePath)) && !options.force) {
    console.log(chalk.yellow("⚠ .caltrc.json already exists. Use --force to overwrite."));
    return;
  }

  await writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  console.log(chalk.green("✓ Created .caltrc.json"));
  console.log(chalk.gray("  Customize rules, thresholds, and Graph API settings as needed."));
  console.log(chalk.gray("  Run 'calt setup' to register an Entra App and configure tenant access."));
}

export async function initCommand(options: InitOptions): Promise<void> {
  await createConfig(options);

  if (options.template) {
    const template = getTemplate(options.template);
    const outputPath = resolve(process.cwd(), options.output || "declarativeAgent.json");

    if ((await fileExists(outputPath)) && !options.force) {
      console.log(
        chalk.yellow(`⚠ ${options.output || "declarativeAgent.json"} already exists. Use --force to overwrite.`),
      );
      return;
    }

    const dir = dirname(outputPath);
    await mkdir(dir, { recursive: true });

    await writeFile(outputPath, JSON.stringify(template, null, 2) + "\n");
    console.log(chalk.green(`✓ Created ${options.output || "declarativeAgent.json"} from "${options.template}" template`));
    console.log(chalk.gray("  Run 'calt scan " + (options.output || "declarativeAgent.json") + "' to validate your agent."));
  }
}
