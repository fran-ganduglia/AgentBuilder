import type {
  AdapterCapabilityProbeV1,
  AdapterHealthSnapshotV1,
  ExecutionContextV1,
  ProviderPayloadV1,
} from "@/lib/runtime/types";
import type { RuntimeActionV1 } from "@/lib/runtime/types";

import {
  createGmailAdapterV1,
  getDefaultGmailAdapterDeps,
  type RuntimeApprovalRecordV1,
} from "./gmail-adapter";
import {
  createGoogleCalendarAdapterV1,
  getDefaultGoogleCalendarAdapterDeps,
} from "./google-calendar-adapter";
import {
  createGoogleSheetsAdapterV1,
  getDefaultGoogleSheetsAdapterDeps,
} from "./google-sheets-adapter";
import {
  createSalesforceAdapterV1,
  getDefaultSalesforceAdapterDeps,
} from "./salesforce-adapter";
import { createAdapterPlatformV1, type AdapterPlatformV1 } from "./platform";

type DbResult<T> = { data: T | null; error: string | null };

export type RuntimeApprovalEnqueuerV1 = (input: {
  ctx: ExecutionContextV1;
  provider: "gmail" | "google_calendar" | "google_sheets" | "salesforce";
  action: string;
  integrationId: string;
  toolName: string;
  summary: string;
  payload: ProviderPayloadV1;
  idempotencyKey: string;
  runtimeAction: RuntimeActionV1;
}) => Promise<DbResult<RuntimeApprovalRecordV1>>;

export type AdapterRegistryV1 = {
  adapters: Record<string, import("@/lib/runtime/types").IntegrationAdapterV1>;
  platform: AdapterPlatformV1;
};

export function createAdapterRegistryV1(input: {
  enqueueApproval: RuntimeApprovalEnqueuerV1;
  featureFlags?: Partial<Record<"gmail" | "google_calendar" | "google_sheets" | "salesforce", boolean>>;
  platform?: AdapterPlatformV1;
}): AdapterRegistryV1 {
  const platform =
    input.platform ??
    createAdapterPlatformV1({
      featureFlags: input.featureFlags,
    });

  return {
    platform,
    adapters: {
      gmail: createGmailAdapterV1(
        getDefaultGmailAdapterDeps({
          enqueueApproval: input.enqueueApproval,
          platform,
        })
      ),
      google_calendar: createGoogleCalendarAdapterV1(
        getDefaultGoogleCalendarAdapterDeps({
          enqueueApproval: input.enqueueApproval,
          platform,
        })
      ),
      google_sheets: createGoogleSheetsAdapterV1(
        getDefaultGoogleSheetsAdapterDeps({
          enqueueApproval: input.enqueueApproval,
          platform,
        })
      ),
      salesforce: createSalesforceAdapterV1(
        getDefaultSalesforceAdapterDeps({
          enqueueApproval: input.enqueueApproval,
          platform,
        })
      ),
    },
  };
}

export function listAdapterManifestsV1(
  registry: AdapterRegistryV1
): Array<import("@/lib/runtime/types").AdapterManifestV1> {
  return Object.values(registry.adapters).map((adapter) => adapter.manifest);
}

export function probeAdapterRegistryCapabilitiesV1(
  registry: AdapterRegistryV1
): AdapterCapabilityProbeV1[] {
  return Object.values(registry.adapters).map((adapter) =>
    adapter.probeCapabilities
      ? adapter.probeCapabilities()
      : registry.platform.probeAdapter(adapter)
  ) as AdapterCapabilityProbeV1[];
}

export function getAdapterHealthSnapshotsV1(
  registry: AdapterRegistryV1
): AdapterHealthSnapshotV1[] {
  return Object.values(registry.adapters).map((adapter) =>
    adapter.getHealth ? adapter.getHealth() : registry.platform.getHealth({ adapter })
  ) as AdapterHealthSnapshotV1[];
}
