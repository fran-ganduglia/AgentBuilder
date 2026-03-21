import { RUNTIME_GRAPH_NODES, type RuntimeGraphNodeId } from "./types";

export function getRuntimeGraphV1(): readonly RuntimeGraphNodeId[] {
  return RUNTIME_GRAPH_NODES;
}
