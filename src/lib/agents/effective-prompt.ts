import {
  buildRecommendedSystemPrompt,
  getRecommendedPromptCandidates,
  type PromptSyncMode,
  type RecommendedPromptEnvironment,
  type RecommendedPromptVariant,
} from "@/lib/agents/agent-templates";
import type { AgentSetupState } from "@/lib/agents/agent-setup";
import {
  detectHubSpotPromptConflict,
  detectSalesforcePromptConflict,
  stripHubSpotPromptConflicts,
  stripSalesforcePromptConflicts,
} from "@/lib/integrations/salesforce-selection";

export type EffectiveAgentPromptResolution = {
  effectivePrompt: string;
  syncMode: PromptSyncMode;
  matchedVariant: RecommendedPromptVariant | null;
  hadConflictCleanup: boolean;
  hasPromptConflict: boolean;
  promptConflictSnippet: string | null;
};

function normalizePrompt(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

function resolveCustomPromptConflict(input: {
  savedPrompt: string;
  promptEnvironment: RecommendedPromptEnvironment;
}): {
  hasConflict: boolean;
  snippet: string | null;
  cleanedPrompt: string;
} {
  const salesforceConflict = detectSalesforcePromptConflict(input.savedPrompt);
  if (salesforceConflict.hasConflict) {
    return {
      hasConflict: true,
      snippet: salesforceConflict.snippet,
      cleanedPrompt: stripSalesforcePromptConflicts(input.savedPrompt),
    };
  }

  const hubspotConflict = detectHubSpotPromptConflict(input.savedPrompt);
  if (hubspotConflict.hasConflict) {
    return {
      hasConflict: true,
      snippet: hubspotConflict.snippet,
      cleanedPrompt: stripHubSpotPromptConflicts(input.savedPrompt),
    };
  }

  return {
    hasConflict: false,
    snippet: null,
    cleanedPrompt: input.savedPrompt,
  };
}

export function resolveEffectiveAgentPrompt(input: {
  savedPrompt: string;
  setupState: AgentSetupState | null;
  promptEnvironment?: RecommendedPromptEnvironment;
  allowConflictCleanupForCustom?: boolean;
}): EffectiveAgentPromptResolution {
  const promptEnvironment = input.promptEnvironment ?? {};

  if (input.setupState) {
    const matchedCandidate = getRecommendedPromptCandidates(input.setupState, promptEnvironment).find(
      (candidate) => normalizePrompt(candidate.prompt) === normalizePrompt(input.savedPrompt)
    );

    if (matchedCandidate) {
      return {
        effectivePrompt: buildRecommendedSystemPrompt(input.setupState, promptEnvironment),
        syncMode: "recommended",
        matchedVariant: matchedCandidate.variant,
        hadConflictCleanup: false,
        hasPromptConflict: false,
        promptConflictSnippet: null,
      };
    }
  }

  const promptConflict = resolveCustomPromptConflict({
    savedPrompt: input.savedPrompt,
    promptEnvironment,
  });
  const shouldCleanup = Boolean(input.allowConflictCleanupForCustom) && promptConflict.hasConflict;

  return {
    effectivePrompt: shouldCleanup
      ? promptConflict.cleanedPrompt
      : input.savedPrompt,
    syncMode: "custom",
    matchedVariant: null,
    hadConflictCleanup: shouldCleanup,
    hasPromptConflict: promptConflict.hasConflict,
    promptConflictSnippet: promptConflict.snippet,
  };
}
