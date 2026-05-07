import * as vscode from "vscode";

/**
 * Lightweight JSON property locator. Returns the range of a top-level field's
 * KEY (the `"fieldName"` token) in the document, or undefined if not found.
 *
 * Avoids pulling in a full JSON parser dep — a regex scan is sufficient for
 * the well-formed manifests CALT operates on. For malformed JSON, the schema
 * validator already produces its own diagnostics, and we fall back to line 0.
 */
export function findFieldRange(doc: vscode.TextDocument, fieldName: string): vscode.Range | undefined {
  const text = doc.getText();
  const re = new RegExp(`"${escapeRegex(fieldName)}"\\s*:`, "g");
  const m = re.exec(text);
  if (!m) return undefined;
  const start = doc.positionAt(m.index);
  const end = doc.positionAt(m.index + fieldName.length + 2); // include both quotes
  return new vscode.Range(start, end);
}

/**
 * Best-effort range for a finding given the rule category.
 */
export function rangeForCategory(doc: vscode.TextDocument, category: string): vscode.Range {
  const fieldByCategory: Record<string, string[]> = {
    schema: ["name", "description", "instructions"],
    instructions: ["instructions"],
    knowledge: ["capabilities"],
    actions: ["actions"],
    "conversation-starters": ["conversation_starters"],
    security: ["instructions"],
  };
  const candidates = fieldByCategory[category] ?? ["name"];
  for (const f of candidates) {
    const r = findFieldRange(doc, f);
    if (r) return r;
  }
  // Fall back to the first non-empty line of the document.
  const firstLine = doc.lineAt(0);
  return firstLine.range;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
