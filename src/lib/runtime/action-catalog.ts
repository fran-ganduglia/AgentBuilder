import type {
  ParamValueV1,
  RuntimeActionType,
  RuntimeApprovalMode,
  RuntimeSideEffectKindV1,
} from "./types";
import { GMAIL_ACTION_CATALOG } from "./action-catalog-gmail";
import { CALENDAR_ACTION_CATALOG } from "./action-catalog-calendar";
import { SHEETS_ACTION_CATALOG } from "./action-catalog-sheets";
import { CRM_ACTION_CATALOG } from "./action-catalog-crm";

type RuntimeParamKindV1 = ParamValueV1["kind"];

export type RuntimeActionOutputContractV1 = {
  summary: string;
};

export type RuntimeParamContractV1 = {
  key: string;
  required: boolean;
  allowedKinds: readonly RuntimeParamKindV1[];
  summary: string;
  resourceFamily?: string;
  criticality?: "critical" | "non_critical";
};

export type RuntimeActionDefinitionV1 = {
  type: RuntimeActionType;
  approvalMode: RuntimeApprovalMode;
  sideEffectKind: RuntimeSideEffectKindV1;
  input: {
    minimum: readonly string[];
    optional: readonly string[];
    params: Readonly<Record<string, RuntimeParamContractV1>>;
  };
  output: RuntimeActionOutputContractV1;
};

export type RuntimeActionContractValidationV1 = {
  missingRequired: string[];
  unknownParams: string[];
  invalidKinds: string[];
  valid: boolean;
};

const ACTION_CATALOG_V1: Readonly<Record<RuntimeActionType, RuntimeActionDefinitionV1>> = {
  ...GMAIL_ACTION_CATALOG,
  ...CALENDAR_ACTION_CATALOG,
  ...SHEETS_ACTION_CATALOG,
  ...CRM_ACTION_CATALOG,
} as Readonly<Record<RuntimeActionType, RuntimeActionDefinitionV1>>;

export function getActionCatalogV1(): Readonly<Record<RuntimeActionType, RuntimeActionDefinitionV1>> {
  return ACTION_CATALOG_V1;
}

export function listActionCatalogV1(): RuntimeActionDefinitionV1[] {
  return Object.values(ACTION_CATALOG_V1);
}

export function getActionDefinitionV1(
  actionType: RuntimeActionType
): RuntimeActionDefinitionV1 {
  return ACTION_CATALOG_V1[actionType];
}

export function getActionApprovalModeV1(actionType: RuntimeActionType): RuntimeApprovalMode {
  return ACTION_CATALOG_V1[actionType].approvalMode;
}

export function validateActionParamsV1(input: {
  actionType: RuntimeActionType;
  params: Record<string, ParamValueV1>;
}): RuntimeActionContractValidationV1 {
  const definition = getActionDefinitionV1(input.actionType);
  const knownKeys = new Set(Object.keys(definition.input.params));
  const paramEntries = Object.entries(input.params);

  const missingRequired = definition.input.minimum.filter((key) => !(key in input.params));
  const unknownParams = paramEntries
    .map(([key]) => key)
    .filter((key) => !knownKeys.has(key));
  const invalidKinds = paramEntries
    .filter(([key, value]) => {
      const contract = definition.input.params[key];
      return contract !== undefined && !contract.allowedKinds.includes(value.kind);
    })
    .map(([key]) => key);

  return {
    missingRequired,
    unknownParams,
    invalidKinds,
    valid:
      missingRequired.length === 0 &&
      unknownParams.length === 0 &&
      invalidKinds.length === 0,
  };
}
