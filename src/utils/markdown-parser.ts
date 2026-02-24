export interface MarkdownStructure {
  hasHeaders: boolean;
  headerCount: number;
  headers: string[];
  hasNumberedList: boolean;
  numberedListCount: number;
  hasBulletList: boolean;
  bulletListCount: number;
  hasBoldText: boolean;
  hasCodeBlocks: boolean;
  lineCount: number;
}

export function parseMarkdownStructure(text: string): MarkdownStructure {
  const lines = text.split("\n");

  const headers: string[] = [];
  let numberedListCount = 0;
  let bulletListCount = 0;
  let hasBoldText = false;
  let hasCodeBlocks = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Markdown headers: # ## ### etc.
    const headerMatch = trimmed.match(/^#{1,6}\s+(.+)/);
    if (headerMatch) {
      headers.push(headerMatch[1]);
    }

    // Numbered lists: 1. or 1)
    if (/^\d+[.)]\s+/.test(trimmed)) {
      numberedListCount++;
    }

    // Bullet lists: - or * or •
    if (/^[-*•]\s+/.test(trimmed)) {
      bulletListCount++;
    }

    // Bold text
    if (/\*\*.+\*\*/.test(trimmed) || /__.+__/.test(trimmed)) {
      hasBoldText = true;
    }

    // Code blocks
    if (trimmed.startsWith("```")) {
      hasCodeBlocks = true;
    }
  }

  return {
    hasHeaders: headers.length > 0,
    headerCount: headers.length,
    headers,
    hasNumberedList: numberedListCount > 0,
    numberedListCount,
    hasBulletList: bulletListCount > 0,
    bulletListCount,
    hasBoldText,
    hasCodeBlocks,
    lineCount: lines.length,
  };
}

// Detect key sections in instructions (supports EN and DE)
const SECTION_PATTERNS: Record<string, RegExp[]> = {
  purpose: [
    /(?:^|\n)#*\s*(?:objective|purpose|goal|ziel|zweck|aufgabe|rolle|role)/i,
    /(?:^|\n)(?:you are|du bist|your (?:role|purpose)|deine (?:rolle|aufgabe))/i,
  ],
  workflow: [
    /(?:^|\n)#*\s*(?:workflow|steps|process|ablauf|schritte|arbeitsablauf|prozess)/i,
    /(?:^|\n)(?:step\s+\d|schritt\s+\d|\d+\.\s+(?:first|next|then|zuerst|dann|danach))/i,
  ],
  errorHandling: [
    /(?:^|\n)#*\s*(?:error|fehler|fallback|edge.?case|exception|ausnahme)/i,
    /(?:if.+(?:fail|error|not found|unknown)|wenn.+(?:fehler|nicht gefunden|unbekannt))/i,
  ],
  outputFormat: [
    /(?:^|\n)#*\s*(?:output|format|response|antwort|ausgabe|formatierung)/i,
    /(?:respond (?:with|in|using)|antworte (?:mit|in)|use (?:bullet|markdown|table))/i,
  ],
  examples: [
    /(?:^|\n)#*\s*(?:example|beispiel|sample|muster)/i,
    /(?:for example|zum beispiel|e\.g\.|z\.b\.)/i,
    /(?:user:|nutzer:|input:|eingabe:|output:|ausgabe:)/i,
  ],
};

export function detectSection(text: string, section: keyof typeof SECTION_PATTERNS): boolean {
  const patterns = SECTION_PATTERNS[section];
  return patterns.some((p) => p.test(text));
}
