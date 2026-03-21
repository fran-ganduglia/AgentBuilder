export type ToolFunction = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolDefinition = {
  type: "function";
  function: ToolFunction;
};

export type ToolCallPart = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: undefined }
  | { role: "assistant"; content: string | null; tool_calls: ToolCallPart[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatCompletionInput = {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  organizationId: string;
  agentId: string;
  conversationId: string;
  context?: string;
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none";
  responseFormat?: "json_object";
};

export type CompletionStatus = "success" | "error" | "timeout" | "rate_limited";

export type ChatCompletionOutput = {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  responseTimeMs: number;
  model: string;
  status: CompletionStatus;
  errorType?: string;
  toolCalls?: ToolCallPart[];
  finishReason?: "stop" | "tool_calls";
};

export type OpenAIChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: ToolCallPart[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenAIChoice = {
  message: {
    content: string | null;
    tool_calls?: ToolCallPart[];
  };
  finish_reason?: string | null;
};

export type OpenAIUsage = {
  prompt_tokens: number;
  completion_tokens: number;
};

export type OpenAIChatResponse = {
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
  model: string;
};

export type LiteLLMErrorBody = {
  error?: {
    message?: string;
    type?: string | null;
    code?: string | number | null;
  };
};

export type ObservabilityLog = {
  organization_id: string;
  agent_id: string;
  conversation_id: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  latency_ms: number;
  status: CompletionStatus;
  error_type?: string;
  timestamp: string;
};

export type StreamDelta = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: OpenAIUsage | null;
  model?: string;
};

export type StreamingChatResult = {
  stream: ReadableStream<Uint8Array>;
  onReady: Promise<void>;
  onComplete: Promise<ChatCompletionOutput>;
};
