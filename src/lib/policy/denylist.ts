const MAX_PATTERN_LENGTH = 500;
const MAX_RULES = 50;

export type DenylistRule = {
  pattern: string;
  message: string;
};

type DenylistResult = {
  blocked: boolean;
  rule: DenylistRule | null;
};

function compilePattern(pattern: string): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return null;
  }

  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

export function getDenylistRules(agentMetadata: Record<string, unknown> | null): DenylistRule[] {
  if (!agentMetadata) return [];
  const rules = agentMetadata.denylist_rules;
  if (!Array.isArray(rules)) return [];
  return rules.filter((r): r is DenylistRule =>
    typeof r === "object" && r !== null && typeof (r as DenylistRule).pattern === "string" && typeof (r as DenylistRule).message === "string"
  );
}

export function evaluateDenylist(
  content: string,
  rules: DenylistRule[]
): DenylistResult {
  const trimmed = content.trim();
  if (!trimmed || rules.length === 0) {
    return { blocked: false, rule: null };
  }

  const safeRules = rules.slice(0, MAX_RULES);

  for (const rule of safeRules) {
    const regex = compilePattern(rule.pattern);
    if (!regex) {
      continue;
    }

    if (regex.test(trimmed)) {
      return { blocked: true, rule };
    }
  }

  return { blocked: false, rule: null };
}
