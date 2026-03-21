import assert from "node:assert/strict";
import { resolveRecommendedPromptVariantForOrganization } from "./prompt-variant.server";

function withEnv<T>(values: Record<string, string | undefined>, fn: () => T): T {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]])
  );

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function run(): void {
  withEnv(
    {
      AGENT_COMPACT_PROMPT_ENABLED: "false",
      AGENT_COMPACT_PROMPT_ORG_IDS: "",
    },
    () => {
      assert.equal(resolveRecommendedPromptVariantForOrganization("org-a"), "full");
    }
  );

  withEnv(
    {
      AGENT_COMPACT_PROMPT_ENABLED: "true",
      AGENT_COMPACT_PROMPT_ORG_IDS: "",
    },
    () => {
      assert.equal(resolveRecommendedPromptVariantForOrganization("org-a"), "compact");
    }
  );

  withEnv(
    {
      AGENT_COMPACT_PROMPT_ENABLED: "true",
      AGENT_COMPACT_PROMPT_ORG_IDS: "org-a, org-b",
    },
    () => {
      assert.equal(resolveRecommendedPromptVariantForOrganization("org-a"), "compact");
      assert.equal(resolveRecommendedPromptVariantForOrganization("org-z"), "full");
    }
  );

  console.log("prompt-variant checks passed");
}

run();
