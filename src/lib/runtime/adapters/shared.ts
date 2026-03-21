import { createHash } from "node:crypto";

import { isProviderRequestError } from "@/lib/integrations/provider-errors";
import type {
  ExecutionContextV1,
  ParamValueV1,
  ProviderPayloadV1,
  RuntimeAdapterErrorCodeV1,
  RuntimeNormalizedAdapterErrorV1,
  RuntimeActionV1,
  RuntimeProviderV1,
} from "@/lib/runtime/types";

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

export class RuntimeAdapterError extends Error {
  status: "failed" | "blocked";
  code: RuntimeAdapterErrorCodeV1;
  provider?: RuntimeProviderV1;
  providerRequestId?: string;
  retryAfterMs?: number;

  constructor(input: {
    message: string;
    status?: "failed" | "blocked";
    code?: RuntimeAdapterErrorCodeV1;
    provider?: RuntimeProviderV1;
    providerRequestId?: string;
    retryAfterMs?: number;
  }) {
    super(input.message);
    this.name = "RuntimeAdapterError";
    this.status = input.status ?? "failed";
    this.code = input.code ?? "validation";
    this.provider = input.provider;
    this.providerRequestId = input.providerRequestId;
    this.retryAfterMs = input.retryAfterMs;
  }
}

export function asString(value: ParamValueV1 | undefined): string | null {
  if (!value || value.kind !== "primitive") {
    return null;
  }

  if (typeof value.value === "string") {
    const normalized = value.value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  return null;
}

export function asStringArray(value: ParamValueV1 | undefined): string[] {
  if (!value || value.kind !== "primitive") {
    return [];
  }

  if (typeof value.value === "string") {
    return value.value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (Array.isArray(value.value)) {
    return value.value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

export function asNumber(value: ParamValueV1 | undefined): number | null {
  if (!value || value.kind !== "primitive") {
    return null;
  }

  return typeof value.value === "number" && Number.isFinite(value.value)
    ? value.value
    : null;
}

export function asReference(value: ParamValueV1 | undefined): {
  refType: string;
  value: string;
  label?: string;
} | null {
  if (!value || value.kind !== "reference") {
    return null;
  }

  const normalized = value.value.trim();
  if (normalized.length === 0) {
    return null;
  }

  return {
    refType: value.refType,
    value: normalized,
    label: value.label,
  };
}

export function asEntity(value: ParamValueV1 | undefined): {
  entityType: string;
  value: string;
  label?: string;
  identifiers?: Record<string, string>;
} | null {
  if (!value || value.kind !== "entity") {
    return null;
  }

  const normalized = value.value.trim();
  if (normalized.length === 0) {
    return null;
  }

  return {
    entityType: value.entityType,
    value: normalized,
    label: value.label,
    identifiers: value.identifiers,
  };
}

export function asTime(value: ParamValueV1 | undefined): {
  value: string;
  timezone?: string;
  granularity?: "datetime" | "date" | "time" | "range";
} | null {
  if (!value || value.kind !== "time") {
    return null;
  }

  const normalized = value.value.trim();
  if (normalized.length === 0) {
    return null;
  }

  return {
    value: normalized,
    timezone: value.timezone,
    granularity: value.granularity,
  };
}

function normalizeForHash(value: unknown): JsonLike {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, JsonLike>>((acc, key) => {
        acc[key] = normalizeForHash((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return String(value);
}

export function canonicalizePayload(payload: ProviderPayloadV1): string {
  return JSON.stringify(normalizeForHash(payload));
}

export function normalizeProviderPayloadValue(
  value: unknown
): string | number | boolean | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return JSON.stringify(normalizeForHash(value));
}

export function normalizeProviderPayloadMatrix(value: unknown): Array<
  Array<string | number | boolean | null>
> {
  if (!Array.isArray(value)) {
    throw new RuntimeAdapterError({
      message: "El payload tabular debe ser una matriz de filas.",
      code: "validation",
    });
  }

  return value.map((row) => {
    if (!Array.isArray(row)) {
      throw new RuntimeAdapterError({
        message: "Cada fila del payload tabular debe ser una lista.",
        code: "validation",
      });
    }

    return row.map((cell) => normalizeProviderPayloadValue(cell));
  });
}

export function normalizeProviderPayloadRecords(
  value: unknown
): Array<Record<string, string | number | boolean | null>> {
  if (!Array.isArray(value)) {
    throw new RuntimeAdapterError({
      message: "El payload tabular estructurado debe ser una lista de registros.",
      code: "validation",
    });
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new RuntimeAdapterError({
        message: "Cada registro tabular debe ser un objeto.",
        code: "validation",
      });
    }

    return Object.entries(entry as Record<string, unknown>).reduce<
      Record<string, string | number | boolean | null>
    >((acc, [key, cell]) => {
      acc[key] = normalizeProviderPayloadValue(cell);
      return acc;
    }, {});
  });
}

export function normalizeUnknownAdapterError(input: {
  error: unknown;
  provider: RuntimeProviderV1;
  fallback: string;
}): RuntimeNormalizedAdapterErrorV1 {
  if (input.error instanceof RuntimeAdapterError) {
    return {
      code: input.error.code,
      status: input.error.status,
      reason: input.error.message,
      retryAfterMs: input.error.retryAfterMs,
      provider: input.error.provider ?? input.provider,
      providerRequestId: input.error.providerRequestId,
    };
  }

  if (isProviderRequestError(input.error)) {
    const errorCode = input.error.errorCode;
    const mappedCode: RuntimeAdapterErrorCodeV1 =
      errorCode === "budget_queued"
        ? "budget_queued"
        : errorCode === "budget_throttled"
          ? "budget_throttled"
          : errorCode === "budget_exhausted"
            ? "budget_exhausted"
            : input.error.statusCode === 401
              ? "auth"
              : input.error.statusCode === 403
                ? "scope"
                : input.error.statusCode === 429
                  ? "rate_limit"
                  : input.error.statusCode !== null && input.error.statusCode >= 500
                    ? "provider_retryable"
                    : "provider_fatal";

    return {
      code: mappedCode,
      status:
        mappedCode === "provider_retryable" || mappedCode === "rate_limit"
          ? "failed"
          : "blocked",
      reason: input.error.message || input.fallback,
      retryAfterMs:
        input.error.retryAfterSeconds !== null
          ? input.error.retryAfterSeconds * 1000
          : undefined,
      provider: input.provider,
      providerRequestId: input.error.requestId ?? undefined,
    };
  }

  return {
    code: "provider_fatal",
    status: "failed",
    reason: input.error instanceof Error ? input.error.message : input.fallback,
    provider: input.provider,
  };
}

export function buildRuntimeActionIdempotencyKey(input: {
  ctx: Pick<
    ExecutionContextV1,
    "organizationId" | "agentId" | "conversationId"
  >;
  action: Pick<RuntimeActionV1, "type">;
  payload: ProviderPayloadV1;
}): string {
  const canonicalPayload = canonicalizePayload(input.payload);
  const canonicalParamsHash = createHash("sha256")
    .update(canonicalPayload)
    .digest("hex");

  return [
    input.ctx.organizationId,
    input.ctx.agentId,
    input.ctx.conversationId,
    input.action.type,
    canonicalParamsHash,
  ].join(":");
}
