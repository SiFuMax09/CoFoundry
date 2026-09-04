import type { ChatCompletionTool, ChatCompletionToolChoiceOption, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import type { TaskType } from "./tasks";

/**
 * Gemeinsame Typen für lib/ai/openrouter.ts und lib/ai/mock.ts — in einer
 * eigenen Datei, damit beide Module sich nicht gegenseitig importieren
 * müssen (mock.ts wird von openrouter.ts für den MOCK_OPENROUTER-Modus
 * aufgerufen).
 */

export interface CacheControl {
  type: "ephemeral";
  ttl?: "5m" | "1h";
}

export interface ORTextBlock {
  type: "text";
  text: string;
  cache_control?: CacheControl;
}

export interface ORMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ORTextBlock[];
  tool_calls?: ChatCompletionMessageToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface WebSearchOptions {
  maxResults: number;
}

export interface ChatCompletionParams {
  apiKey: string;
  userId: string;
  taskType: TaskType;
  modelOverride?: string | null;
  messages: ORMessage[];
  tools?: ChatCompletionTool[];
  toolChoice?: ChatCompletionToolChoiceOption;
  webSearch?: WebSearchOptions;
  responseFormat?: { type: "json_schema"; json_schema: { name: string; schema: object; strict?: boolean } };
}

export interface ChatCompletionUsage {
  tokensIn: number;
  tokensOut: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ChatCompletionResult {
  content: string | null;
  toolCalls: ChatCompletionMessageToolCall[];
  usage: ChatCompletionUsage;
  model: string;
}

export type StreamEvent =
  | { type: "token"; delta: string }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: "done"; usage: ChatCompletionUsage; model: string }
  | { type: "error"; message: string };
