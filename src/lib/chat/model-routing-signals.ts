import type { RequestShapingResult } from "@/lib/chat/request-shaping";
import { parseToolName } from "@/lib/tools/tool-name-registry";
import type { RoutingSignals } from "@/lib/llm/model-routing";

type ToolActionKind = "read" | "write" | "destructive" | "unknown";

function classifyToolActionKind(action: string): ToolActionKind {
  if (
    action.startsWith("read_") ||
    action.startsWith("get_") ||
    action.startsWith("list_") ||
    action.startsWith("lookup_") ||
    action.startsWith("search_") ||
    action.startsWith("find_") ||
    action.startsWith("preview_") ||
    action.startsWith("summarize_") ||
    action.startsWith("check_")
  ) {
    return "read";
  }

  if (
    action.startsWith("delete_") ||
    action.startsWith("clear_") ||
    action.startsWith("cancel_") ||
    action.startsWith("archive_")
  ) {
    return "destructive";
  }

  if (
    action.startsWith("create_") ||
    action.startsWith("append_") ||
    action.startsWith("insert_") ||
    action.startsWith("copy_") ||
    action.startsWith("duplicate_") ||
    action.startsWith("update_") ||
    action.startsWith("rename_") ||
    action.startsWith("reschedule_") ||
    action.startsWith("set_") ||
    action.startsWith("apply_") ||
    action.startsWith("sort_") ||
    action.startsWith("freeze_") ||
    action.startsWith("format_") ||
    action.startsWith("protect_") ||
    action.startsWith("send_")
  ) {
    return "write";
  }

  return "unknown";
}

function summarizeToolComplexity(shapedRequest: RequestShapingResult): {
  readOnlyTools: boolean;
  hasSensitiveWrites: boolean;
  toolComplexity: "low" | "medium" | "high";
} {
  let writeCount = 0;
  let destructiveCount = 0;
  let unknownCount = 0;

  for (const definition of shapedRequest.selectedToolDefinitions) {
    const parsed = parseToolName(definition.function.name);
    const kind = parsed ? classifyToolActionKind(parsed.action) : "unknown";

    if (kind === "read") {
      continue;
    }

    if (kind === "write") {
      writeCount += 1;
      continue;
    }

    if (kind === "destructive") {
      destructiveCount += 1;
      continue;
    }

    unknownCount += 1;
  }

  const readOnlyTools =
    shapedRequest.selectedToolDefinitions.length > 0 &&
    writeCount === 0 &&
    destructiveCount === 0 &&
    unknownCount === 0;
  const hasSensitiveWrites = writeCount > 0 || destructiveCount > 0;
  const toolComplexity: "low" | "medium" | "high" =
    destructiveCount > 0
      ? "high"
      : hasSensitiveWrites || unknownCount > 0 || shapedRequest.selectedSurfaces.length >= 2
        ? "medium"
        : "medium";

  return {
    readOnlyTools,
    hasSensitiveWrites,
    toolComplexity,
  };
}

export function buildRoutingSignalsFromShapedRequest(input: {
  shapedRequest: RequestShapingResult;
  ragChunkCount: number;
  channel: RoutingSignals["channel"];
  turnType: RoutingSignals["turnType"];
  needsHighQualitySynthesis?: boolean;
  previousFailures?: number;
}): RoutingSignals {
  const toolComplexity = summarizeToolComplexity(input.shapedRequest);

  return {
    hasTools: input.shapedRequest.selectedToolDefinitions.length > 0,
    toolCount: input.shapedRequest.selectedToolDefinitions.length,
    readOnlyTools: toolComplexity.readOnlyTools,
    hasSensitiveWrites: toolComplexity.hasSensitiveWrites,
    toolComplexity: toolComplexity.toolComplexity,
    hasRag: input.shapedRequest.ragMode === "on",
    ragChunkCount: input.ragChunkCount,
    historySize: input.shapedRequest.messages.length,
    surfaceCount: input.shapedRequest.selectedSurfaces.length,
    isAmbiguous: input.shapedRequest.intent === "tool_ambiguous",
    needsHighQualitySynthesis: input.needsHighQualitySynthesis ?? false,
    previousFailures: input.previousFailures ?? 0,
    channel: input.channel,
    turnType: input.turnType,
  };
}
