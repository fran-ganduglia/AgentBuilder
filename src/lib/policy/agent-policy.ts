import {
  buildAmbiguousScopeResponse,
  buildOutOfScopeResponse,
  classifyScopeIntent,
  type AgentScope,
} from "@/lib/agents/agent-scope";
import { evaluateDenylist, type DenylistRule } from "@/lib/policy/denylist";

export type AgentPolicyOutcome =
  | "allowed"
  | "redirect_out_of_scope"
  | "deny_security"
  | "clarify_missing_data";

export type AgentSecuritySignal = {
  code:
    | "prompt_injection"
    | "sql_injection"
    | "command_injection"
    | "secret_exfiltration";
  reasonCode:
    | "security_prompt_injection"
    | "security_sql_injection"
    | "security_command_injection"
    | "security_secret_exfiltration";
  matchedText: string;
};

export type AgentPolicyDecision = {
  outcome: AgentPolicyOutcome;
  provider: string | null;
  action: string | null;
  reasonCode:
    | "allowed"
    | "scope_redirect"
    | "scope_ambiguous"
    | "security_prompt_injection"
    | "security_sql_injection"
    | "security_command_injection"
    | "security_secret_exfiltration"
    | "denylist_blocked";
  userMessage: string | null;
  approvalRequired: boolean;
  securitySignals: AgentSecuritySignal[];
};

type SecurityRule = {
  code: AgentSecuritySignal["code"];
  reasonCode: AgentSecuritySignal["reasonCode"];
  message: string;
  patterns: RegExp[];
};

const SECURITY_RULES: SecurityRule[] = [
  {
    code: "prompt_injection",
    reasonCode: "security_prompt_injection",
    message:
      "No puedo ayudar con intentos de alterar instrucciones internas, politicas o jerarquias del sistema.",
    patterns: [
      /\b(?:ignora|ignore)\b[\s\S]{0,40}\b(?:instrucciones|instructions|policy|politica)\b/i,
      /\b(?:system prompt|prompt del sistema|developer instructions|instrucciones del desarrollador)\b/i,
      /\b(?:actua como sistema|act as system|override policy|salta las reglas|bypass)\b/i,
    ],
  },
  {
    code: "sql_injection",
    reasonCode: "security_sql_injection",
    message:
      "No puedo ayudar con payloads o instrucciones que intenten inyeccion SQL o acceso no autorizado a datos.",
    patterns: [
      /\b(?:union\s+select|drop\s+table|information_schema|or\s+1=1|insert\s+into|delete\s+from|update\s+\w+\s+set)\b/i,
    ],
  },
  {
    code: "command_injection",
    reasonCode: "security_command_injection",
    message:
      "No puedo ayudar con instrucciones para ejecutar comandos destructivos, evasivos o sobre infraestructura interna.",
    patterns: [
      /\b(?:rm\s+-rf|curl\s+https?:\/\/169\.254\.169\.254|wget\s+https?:\/\/169\.254\.169\.254|powershell\s+-enc|cmd\.exe|\/bin\/sh)\b/i,
    ],
  },
  {
    code: "secret_exfiltration",
    reasonCode: "security_secret_exfiltration",
    message:
      "No puedo revelar secretos, tokens, keys ni configuracion interna sensible del sistema o de integraciones.",
    patterns: [
      /\b(?:supabase_service_role_key|service role key|api[_ -]?key|access token|refresh token|secret|password|litellm_api_key)\b[\s\S]{0,30}\b(?:muestra|revela|dump|print|show|expon|export)\b/i,
    ],
  },
];

function buildAllowedDecision(): AgentPolicyDecision {
  return {
    outcome: "allowed",
    provider: null,
    action: null,
    reasonCode: "allowed",
    userMessage: null,
    approvalRequired: false,
    securitySignals: [],
  };
}

export function detectAgentSecuritySignals(message: string): AgentSecuritySignal[] {
  const signals: AgentSecuritySignal[] = [];
  const normalized = message.trim();

  if (!normalized) {
    return signals;
  }

  for (const rule of SECURITY_RULES) {
    const match = rule.patterns
      .map((pattern) => normalized.match(pattern))
      .find((candidate) => Boolean(candidate?.[0]));

    if (!match?.[0]) {
      continue;
    }

    signals.push({
      code: rule.code,
      reasonCode: rule.reasonCode,
      matchedText: match[0].slice(0, 160),
    });
  }

  return signals;
}

function resolveSecurityDecision(
  signals: AgentSecuritySignal[]
): AgentPolicyDecision | null {
  if (signals.length === 0) {
    return null;
  }

  const firstSignal = signals[0];
  const rule = SECURITY_RULES.find((candidate) => candidate.code === firstSignal.code);

  return {
    outcome: "deny_security",
    provider: null,
    action: null,
    reasonCode: firstSignal.reasonCode,
    userMessage: rule?.message ?? "No puedo ayudar con esa solicitud por una politica de seguridad.",
    approvalRequired: false,
    securitySignals: signals,
  };
}

export function evaluatePreAgentMessagePolicy(input: {
  latestUserMessage: string;
  agentScope: AgentScope;
}): AgentPolicyDecision {
  const securitySignals = detectAgentSecuritySignals(input.latestUserMessage);
  const securityDecision = resolveSecurityDecision(securitySignals);
  if (securityDecision) {
    return securityDecision;
  }

  const scopeDecision = classifyScopeIntent({
    content: input.latestUserMessage,
    agentScope: input.agentScope,
  });

  if (scopeDecision.decision === "ambiguous") {
    return {
      outcome: "clarify_missing_data",
      provider: null,
      action: null,
      reasonCode: "scope_ambiguous",
      userMessage: buildAmbiguousScopeResponse(input.agentScope),
      approvalRequired: false,
      securitySignals: [],
    };
  }

  if (scopeDecision.decision === "out_of_scope") {
    return {
      outcome: "redirect_out_of_scope",
      provider: null,
      action: null,
      reasonCode: "scope_redirect",
      userMessage: buildOutOfScopeResponse({
        agentScope: input.agentScope,
        targetScope: scopeDecision.targetScope,
      }),
      approvalRequired: false,
      securitySignals: [],
    };
  }

  return buildAllowedDecision();
}

export function evaluateInputPolicy(
  content: string,
  customRules: DenylistRule[]
): { blocked: boolean; message: string | null } {
  const securitySignals = detectAgentSecuritySignals(content);
  if (securitySignals.length > 0) {
    const rule = SECURITY_RULES.find((r) => r.code === securitySignals[0].code);
    return { blocked: true, message: rule?.message ?? "Bloqueado por politica de seguridad." };
  }

  const denylistResult = evaluateDenylist(content, customRules);
  if (denylistResult.blocked) {
    return { blocked: true, message: denylistResult.rule?.message ?? "Bloqueado por regla personalizada." };
  }

  return { blocked: false, message: null };
}

export function evaluateOutputPolicy(
  content: string,
  customRules: DenylistRule[]
): { blocked: boolean; message: string | null } {
  const denylistResult = evaluateDenylist(content, customRules);
  if (denylistResult.blocked) {
    return { blocked: true, message: denylistResult.rule?.message ?? "La respuesta fue bloqueada por una regla de seguridad." };
  }

  return { blocked: false, message: null };
}
