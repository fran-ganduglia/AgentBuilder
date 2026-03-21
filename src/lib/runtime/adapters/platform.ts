import type {
  AdapterCapabilityProbeV1,
  AdapterHealthSnapshotV1,
  IntegrationAdapterV1,
  RuntimeNormalizedAdapterErrorV1,
  RuntimeProviderV1,
} from "@/lib/runtime/types";

import { RuntimeAdapterError } from "./shared";

type CircuitState = {
  consecutiveFailures: number;
  circuitOpenUntil?: string;
  lastFailureReason?: string;
};

export type AdapterPlatformV1 = {
  probeAdapter: (adapter: IntegrationAdapterV1) => AdapterCapabilityProbeV1;
  getHealth: (input: {
    adapter: IntegrationAdapterV1;
    integrationId?: string;
  }) => AdapterHealthSnapshotV1;
  assertAvailable: (input: {
    adapter: IntegrationAdapterV1;
    integrationId?: string;
  }) => void;
  recordSuccess: (input: {
    adapter: IntegrationAdapterV1;
    integrationId?: string;
  }) => void;
  recordFailure: (input: {
    adapter: IntegrationAdapterV1;
    integrationId?: string;
    error: RuntimeNormalizedAdapterErrorV1;
  }) => void;
};

function buildCircuitKey(input: {
  provider: RuntimeProviderV1;
  integrationId?: string;
}): string {
  return `${input.provider}:${input.integrationId ?? "provider"}`;
}

function isFailureCircuitRelevant(
  error: RuntimeNormalizedAdapterErrorV1
): boolean {
  return [
    "auth",
    "scope",
    "rate_limit",
    "provider_retryable",
    "provider_fatal",
    "circuit_open",
  ].includes(error.code);
}

export function createAdapterPlatformV1(input?: {
  featureFlags?: Partial<Record<RuntimeProviderV1, boolean>>;
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => Date;
}): AdapterPlatformV1 {
  const now = input?.now ?? (() => new Date());
  const failureThreshold = input?.failureThreshold ?? 3;
  const cooldownMs = input?.cooldownMs ?? 5 * 60 * 1000;
  const circuitStates = new Map<string, CircuitState>();

  function isProviderEnabled(provider: RuntimeProviderV1): boolean {
    return input?.featureFlags?.[provider] ?? true;
  }

  function getState(inputValue: {
    provider: RuntimeProviderV1;
    integrationId?: string;
  }): CircuitState {
    const key = buildCircuitKey(inputValue);
    const existing = circuitStates.get(key);
    if (existing) {
      return existing;
    }

    const created: CircuitState = {
      consecutiveFailures: 0,
    };
    circuitStates.set(key, created);
    return created;
  }

  function getHealth(inputValue: {
    adapter: IntegrationAdapterV1;
    integrationId?: string;
  }): AdapterHealthSnapshotV1 {
    const checkedAt = now().toISOString();
    if (!isProviderEnabled(inputValue.adapter.provider)) {
      return {
        status: "disabled",
        checkedAt,
        provider: inputValue.adapter.provider,
        integrationId: inputValue.integrationId,
        reason: `Feature flag ${inputValue.adapter.manifest.featureFlagKey} desactivado.`,
        consecutiveFailures: 0,
      };
    }

    const state = getState({
      provider: inputValue.adapter.provider,
      integrationId: inputValue.integrationId,
    });
    const openUntil = state.circuitOpenUntil
      ? new Date(state.circuitOpenUntil)
      : null;

    if (openUntil && openUntil.getTime() > now().getTime()) {
      return {
        status: "circuit_open",
        checkedAt,
        provider: inputValue.adapter.provider,
        integrationId: inputValue.integrationId,
        reason: state.lastFailureReason ?? "El circuit breaker sigue abierto.",
        consecutiveFailures: state.consecutiveFailures,
        circuitOpenUntil: state.circuitOpenUntil,
      };
    }

    if (openUntil && openUntil.getTime() <= now().getTime()) {
      state.circuitOpenUntil = undefined;
    }

    if (state.consecutiveFailures >= Math.max(1, failureThreshold - 1)) {
      return {
        status: "degraded",
        checkedAt,
        provider: inputValue.adapter.provider,
        integrationId: inputValue.integrationId,
        reason: state.lastFailureReason ?? "El adapter acumula fallas recientes.",
        consecutiveFailures: state.consecutiveFailures,
      };
    }

    return {
      status: "healthy",
      checkedAt,
      provider: inputValue.adapter.provider,
      integrationId: inputValue.integrationId,
      consecutiveFailures: state.consecutiveFailures,
    };
  }

  return {
    probeAdapter(adapter) {
      const health = getHealth({
        adapter,
      });
      return {
        adapterId: adapter.manifest.id,
        provider: adapter.provider,
        version: adapter.manifest.version,
        enabled: health.status !== "disabled",
        supportedActionTypes: [...adapter.manifest.supportedActionTypes],
        ...(health.reason ? { reason: health.reason } : {}),
      };
    },
    getHealth,
    assertAvailable(inputValue) {
      const health = getHealth(inputValue);
      if (health.status === "disabled") {
        throw new RuntimeAdapterError({
          message: health.reason ?? "El adapter esta deshabilitado por feature flag.",
          status: "blocked",
          code: "feature_disabled",
          provider: inputValue.adapter.provider,
        });
      }

      if (health.status === "circuit_open") {
        throw new RuntimeAdapterError({
          message:
            health.reason ??
            "El provider quedo temporalmente aislado por fallas repetidas.",
          status: "blocked",
          code: "circuit_open",
          provider: inputValue.adapter.provider,
          retryAfterMs: health.circuitOpenUntil
            ? Math.max(
                0,
                new Date(health.circuitOpenUntil).getTime() - now().getTime()
              )
            : undefined,
        });
      }
    },
    recordSuccess(inputValue) {
      const state = getState({
        provider: inputValue.adapter.provider,
        integrationId: inputValue.integrationId,
      });
      state.consecutiveFailures = 0;
      state.circuitOpenUntil = undefined;
      state.lastFailureReason = undefined;
    },
    recordFailure(inputValue) {
      if (!isFailureCircuitRelevant(inputValue.error)) {
        return;
      }

      const state = getState({
        provider: inputValue.adapter.provider,
        integrationId: inputValue.integrationId,
      });
      state.consecutiveFailures += 1;
      state.lastFailureReason = inputValue.error.reason;

      if (state.consecutiveFailures >= failureThreshold) {
        state.circuitOpenUntil = new Date(now().getTime() + cooldownMs).toISOString();
      }
    },
  };
}
