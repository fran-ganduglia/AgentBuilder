import type {
  ExecutionContextV1,
  IntegrationAdapterV1,
  RuntimeActionV1,
} from "@/lib/runtime/types";

import type { AdapterRegistryV1 } from "./registry";
import { RuntimeAdapterError } from "./shared";

export function selectAdapter(input: {
  ctx: ExecutionContextV1;
  action: RuntimeActionV1;
  registry: AdapterRegistryV1;
}): IntegrationAdapterV1 {
  const adapter = Object.values(input.registry.adapters).find((candidate) =>
    candidate.supports({
      ctx: input.ctx,
      action: input.action,
    })
  );

  if (!adapter) {
    throw new RuntimeAdapterError({
      message: `No existe adapter registrado para ${input.action.type}.`,
      status: "blocked",
      code: "validation",
    });
  }

  return adapter;
}
