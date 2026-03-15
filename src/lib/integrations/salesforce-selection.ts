export type CreatedAtRecord = {
  created_at?: string | null;
};

export type SalesforceToolConfigLike = {
  provider: "salesforce";
  allowed_actions: string[];
};

export type SalesforceToolLike = CreatedAtRecord & {
  id: string;
  tool_type: string;
  integration_id: string | null;
  is_enabled: boolean | null;
  config: unknown;
};

export type SalesforceAgentToolSelectionDiagnostics<TTool extends SalesforceToolLike> = {
  salesforceTools: TTool[];
  selectedTool: TTool | null;
  selectedAllowedActions: string[];
  hasDuplicateSalesforceTools: boolean;
  hasMisalignedSalesforceTools: boolean;
  hasSelectedToolAlignedWithIntegration: boolean;
  hasLookupRecordsAction: boolean;
};

export type SalesforcePromptConflict = {
  hasConflict: boolean;
  snippet: string | null;
};

const CRM_ACCESS_CONFLICT_PATTERNS = [
  /no tengo acceso[\s\S]{0,120}(salesforce|crm|base de datos externa)/i,
  /no estoy conectado[\s\S]{0,120}(salesforce|crm|base de datos externa)/i,
  /no puedo[\s\S]{0,160}(buscar|leer|consultar|actualizar)[\s\S]{0,120}(salesforce|crm|base de datos externa)/i,
  /no prometas lecturas ni escrituras reales en Salesforce[^\n]*/i,
  /Si el usuario pide una accion sobre Salesforce[^\n]*explica ese limite[^\n]*/i,
  /No inventes datos del CRM[^\n]*Salesforce[^\n]*/i,
] as const;

function getCreatedAtTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildPromptConflictSnippet(prompt: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(prompt.length, matchIndex + matchLength + 60);
  return prompt.slice(start, end).replace(/\s+/g, " ").trim();
}

function stripPromptConflicts(prompt: string, patterns: readonly RegExp[]): string {
  let cleaned = prompt;

  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

function detectPromptConflict(
  prompt: string,
  patterns: readonly RegExp[]
): SalesforcePromptConflict {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return { hasConflict: false, snippet: null };
  }

  for (const pattern of patterns) {
    const match = pattern.exec(normalizedPrompt);
    if (!match || match.index === undefined) {
      continue;
    }

    return {
      hasConflict: true,
      snippet: buildPromptConflictSnippet(normalizedPrompt, match.index, match[0].length),
    };
  }

  return { hasConflict: false, snippet: null };
}

function isSalesforceTool<TTool extends SalesforceToolLike>(
  tool: TTool,
  parseConfig: (config: unknown) => SalesforceToolConfigLike | null
): boolean {
  if (tool.tool_type !== "crm") {
    return false;
  }

  const config = parseConfig(tool.config);
  return config?.provider === "salesforce";
}

function getSalesforceToolCandidates<TTool extends SalesforceToolLike>(
  tools: TTool[],
  parseConfig: (config: unknown) => SalesforceToolConfigLike | null
): TTool[] {
  return [...tools]
    .filter((tool) => isSalesforceTool(tool, parseConfig))
    .sort(
      (left, right) =>
        getCreatedAtTimestamp(right.created_at) - getCreatedAtTimestamp(left.created_at)
    );
}

export function selectMostRecentByCreatedAt<TRecord extends CreatedAtRecord>(
  records: TRecord[]
): TRecord | null {
  if (records.length === 0) {
    return null;
  }

  return [...records].sort(
    (left, right) =>
      getCreatedAtTimestamp(right.created_at) - getCreatedAtTimestamp(left.created_at)
  )[0] ?? null;
}

export function selectPreferredSalesforceAgentToolCore<TTool extends SalesforceToolLike>(
  tools: TTool[],
  integrationId: string | null | undefined,
  parseConfig: (config: unknown) => SalesforceToolConfigLike | null
): TTool | null {
  const candidates = getSalesforceToolCandidates(tools, parseConfig);

  if (candidates.length === 0) {
    return null;
  }

  if (integrationId) {
    const matchingEnabled = candidates.find(
      (tool) => tool.integration_id === integrationId && tool.is_enabled === true
    );
    if (matchingEnabled) {
      return matchingEnabled;
    }

    const matchingAny = candidates.find((tool) => tool.integration_id === integrationId);
    if (matchingAny) {
      return matchingAny;
    }
  }

  return (
    candidates.find((tool) => tool.is_enabled === true && Boolean(tool.integration_id)) ??
    candidates.find((tool) => tool.is_enabled === true) ??
    candidates[0] ??
    null
  );
}

export function getSalesforceAgentToolSelectionDiagnostics<TTool extends SalesforceToolLike>(
  tools: TTool[],
  integrationId: string | null | undefined,
  parseConfig: (config: unknown) => SalesforceToolConfigLike | null
): SalesforceAgentToolSelectionDiagnostics<TTool> {
  const salesforceTools = getSalesforceToolCandidates(tools, parseConfig);
  const selectedTool = selectPreferredSalesforceAgentToolCore(
    salesforceTools,
    integrationId,
    parseConfig
  );
  const selectedConfig = selectedTool ? parseConfig(selectedTool.config) : null;
  const selectedAllowedActions = selectedConfig?.allowed_actions ?? [];

  return {
    salesforceTools,
    selectedTool,
    selectedAllowedActions,
    hasDuplicateSalesforceTools: salesforceTools.length > 1,
    hasMisalignedSalesforceTools: Boolean(
      integrationId &&
        salesforceTools.some(
          (tool) => Boolean(tool.integration_id) && tool.integration_id !== integrationId
        )
    ),
    hasSelectedToolAlignedWithIntegration: selectedTool
      ? !integrationId || selectedTool.integration_id === integrationId
      : false,
    hasLookupRecordsAction: selectedAllowedActions.includes("lookup_records"),
  };
}

export function stripSalesforcePromptConflicts(prompt: string): string {
  return stripPromptConflicts(prompt, CRM_ACCESS_CONFLICT_PATTERNS);
}

export function detectSalesforcePromptConflict(prompt: string): SalesforcePromptConflict {
  return detectPromptConflict(prompt, CRM_ACCESS_CONFLICT_PATTERNS);
}

