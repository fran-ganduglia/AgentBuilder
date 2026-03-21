import "server-only";

import { env } from "@/lib/utils/env";
import type { PromptVariant } from "@/lib/agents/prompt-compiler";

function parseOrgIdAllowlist(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  );
}

export function resolveRecommendedPromptVariantForOrganization(
  organizationId: string
): PromptVariant {
  if (!env.AGENT_COMPACT_PROMPT_ENABLED) {
    return "full";
  }

  const allowlist = parseOrgIdAllowlist(env.AGENT_COMPACT_PROMPT_ORG_IDS);
  if (allowlist.size === 0) {
    return "compact";
  }

  return allowlist.has(organizationId) ? "compact" : "full";
}
