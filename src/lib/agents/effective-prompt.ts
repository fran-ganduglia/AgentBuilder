import {
  buildRecommendedSystemPrompt,
  getRecommendedPromptCandidates,
  type PromptSyncMode,
  type RecommendedPromptEnvironment,
  type RecommendedPromptVariant,
} from "@/lib/agents/agent-templates";
import type { AgentSetupState } from "@/lib/agents/agent-setup";
import type { PromptVariant } from "@/lib/agents/prompt-compiler";
import {
  detectSalesforcePromptConflict,
  stripSalesforcePromptConflicts,
} from "@/lib/integrations/salesforce-selection";

export type SystemPromptProfile = "full" | "compact_v2" | "custom_full";

export type EffectiveAgentPromptResolution = {
  effectivePrompt: string;
  syncMode: PromptSyncMode;
  matchedVariant: RecommendedPromptVariant | null;
  promptVariant: PromptVariant;
  systemPromptProfile: SystemPromptProfile;
  compactPromptCandidate: string | null;
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

  return {
    hasConflict: false,
    snippet: null,
    cleanedPrompt: input.savedPrompt,
  };
}

export function resolveEffectiveAgentPrompt(input: {
  savedPrompt: string;
  setupState: AgentSetupState | null;
  matchSetupState?: AgentSetupState | null;
  promptEnvironment?: RecommendedPromptEnvironment;
  allowConflictCleanupForCustom?: boolean;
  promptVariant?: PromptVariant;
}): EffectiveAgentPromptResolution {
  const promptEnvironment = input.promptEnvironment ?? {};
  const promptVariant = input.promptVariant ?? "full";

  if (input.setupState) {
    const candidateSetupStates = [
      input.matchSetupState,
      input.setupState,
    ].filter((setupState, index, array): setupState is AgentSetupState =>
      Boolean(setupState) && array.findIndex((candidate) => candidate === setupState) === index
    );

    const matchedCandidate = candidateSetupStates
      .flatMap((setupState) => getRecommendedPromptCandidates(setupState, promptEnvironment))
      .find((candidate) => normalizePrompt(candidate.prompt) === normalizePrompt(input.savedPrompt));

    if (matchedCandidate) {
      const effectivePromptVariant = promptVariant === "compact" ? "compact" : "full";
      return {
        effectivePrompt: buildRecommendedSystemPrompt(input.setupState, promptEnvironment, {
          promptVariant: effectivePromptVariant,
        }),
        syncMode: "recommended",
        matchedVariant: matchedCandidate.variant,
        promptVariant: effectivePromptVariant,
        systemPromptProfile:
          effectivePromptVariant === "compact" ? "compact_v2" : "full",
        compactPromptCandidate:
          effectivePromptVariant === "full"
            ? buildRecommendedSystemPrompt(input.setupState, promptEnvironment, {
                promptVariant: "compact",
              })
            : null,
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
    promptVariant: "full",
    systemPromptProfile: "custom_full",
    compactPromptCandidate: null,
    hadConflictCleanup: shouldCleanup,
    hasPromptConflict: promptConflict.hasConflict,
    promptConflictSnippet: promptConflict.snippet,
  };
}
