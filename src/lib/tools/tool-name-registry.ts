export type ParsedToolName = {
  provider: string;
  surface: string;
  action: string;
};

const SURFACE_PREFIXES: Record<string, { provider: string; surface: string }> = {
  gmail_: { provider: "google", surface: "gmail" },
  google_calendar_: { provider: "google", surface: "google_calendar" },
  google_sheets_: { provider: "google", surface: "google_sheets" },
  salesforce_: { provider: "salesforce", surface: "salesforce" },
};

export function parseToolName(toolName: string): ParsedToolName | null {
  for (const [prefix, meta] of Object.entries(SURFACE_PREFIXES)) {
    if (toolName.startsWith(prefix)) {
      return {
        provider: meta.provider,
        surface: meta.surface,
        action: toolName.slice(prefix.length),
      };
    }
  }

  return null;
}

export function buildToolName(surface: string, action: string): string {
  return `${surface}_${action}`;
}
