import OpenAI from "openai";
import { getTaskConfig, isAnthropicModel, type TaskType } from "./tasks";
import { logUsage } from "./usage";
import { mockChatCompletion, mockStreamChatCompletion } from "./mock";
import type {
  ORMessage,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatCompletionUsage,
  StreamEvent,
} from "./types";

export type {
  ORMessage,
  ORTextBlock,
  CacheControl,
  WebSearchOptions,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatCompletionUsage,
  StreamEvent,
} from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function mockEnabled(): boolean {
  return process.env.MOCK_OPENROUTER === "1";
}

/**
 * Baut das finale Message-Array für eine Anfrage: `stableContext` zuerst
 * (System-Prompt, Canvas-Overview, Phasen-Brief — über viele Anfragen
 * wortidentisch), `variableContext` danach (die eigentliche neue
 * Nutzer-Nachricht, frisch geladene read_canvas_item-Ergebnisse). Nur ein
 * unveränderter Prefix ist cachebar.
 *
 * Für Anthropic-Modelle wird auf dem letzten Block des stabilen Prefix ein
 * `cache_control`-Breakpoint gesetzt (max. 4 wären laut OpenRouter-Doku
 * möglich — hier bewusst nur einer: der stabile Prefix ist ohnehin ein
 * zusammenhängender Block, ein zweiter Breakpoint würde kaum zusätzlichen
 * Cache-Nutzen bringen). TTL "1h" statt der 5-Minuten-Default, weil zwischen
 * Chat-Nachrichten eines Gründers realistischerweise mehr als 5 Minuten
 * vergehen. Für OpenAI-Modelle passiert hier nichts — die cachen automatisch
 * ab ~1024 Tokens, ganz ohne eigene Konfiguration.
 */
export function buildCachedMessages(
  taskType: TaskType,
  stableContext: ORMessage[],
  variableContext: ORMessage[],
  modelOverride?: string | null
): ORMessage[] {
  const { model } = getTaskConfig(taskType, modelOverride);
  if (!isAnthropicModel(model) || stableContext.length === 0) {
    return [...stableContext, ...variableContext];
  }

  const cloned = stableContext.map((m) => ({ ...m }));
  const lastIndex = cloned.length - 1;
  const last = cloned[lastIndex];
  const text = typeof last.content === "string" ? last.content : last.content.map((b) => b.text).join("\n");
  cloned[lastIndex] = {
    ...last,
    content: [{ type: "text", text, cache_control: { type: "ephemeral", ttl: "1h" } }],
  };
  return [...cloned, ...variableContext];
}

function createClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/SiFuMax09/CoFoundry",
      "X-Title": "Cofoundry",
    },
  });
}

function extractUsage(raw: unknown): ChatCompletionUsage {
  const usage = (raw as { usage?: Record<string, unknown> } | undefined)?.usage;
  if (!usage) return { tokensIn: 0, tokensOut: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  return {
    tokensIn: Number(usage.prompt_tokens ?? 0),
    tokensOut: Number(usage.completion_tokens ?? 0),
    cacheCreationTokens: Number(usage.cache_creation_input_tokens ?? 0),
    cacheReadTokens: Number(promptDetails?.cached_tokens ?? usage.cache_read_input_tokens ?? 0),
  };
}

function buildRequestBody(params: ChatCompletionParams, stream: boolean) {
  const { model, maxTokens, temperature } = getTaskConfig(params.taskType, params.modelOverride);
  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    max_tokens: maxTokens,
    temperature,
    usage: { include: true },
  };
  if (params.tools) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;
  if (params.responseFormat) body.response_format = params.responseFormat;
  if (params.webSearch) {
    body.plugins = [{ id: "web", max_results: params.webSearch.maxResults }];
  }
  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  return { model, body };
}

/** Nicht-streamend — genutzt von Ultraplan-/Research-Sub-Agenten und der Synthese. */
export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  if (mockEnabled()) {
    const result = await mockChatCompletion(params);
    logUsage({ userId: params.userId, model: result.model, taskType: params.taskType, ...result.usage });
    return result;
  }

  const { model, body } = buildRequestBody(params, false);
  const client = createClient(params.apiKey);
  const completion = await client.chat.completions.create(
    body as unknown as Parameters<typeof client.chat.completions.create>[0]
  );
  const usage = extractUsage(completion);
  logUsage({ userId: params.userId, model, taskType: params.taskType, ...usage });

  const choice = (
    completion as unknown as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: ChatCompletionResult["toolCalls"];
          annotations?: Array<{ type: string; url_citation?: { url: string; title?: string; content?: string } }>;
        };
      }>;
    }
  ).choices[0];
  const citations = (choice?.message?.annotations ?? [])
    .filter((a) => a.type === "url_citation" && a.url_citation)
    .map((a) => ({ url: a.url_citation!.url, title: a.url_citation!.title, content: a.url_citation!.content }));

  return {
    content: choice?.message?.content ?? null,
    toolCalls: choice?.message?.tool_calls ?? [],
    usage,
    model,
    citations,
  };
}

/** Streamend — genutzt vom Phasen-Chat (POST /api/ai). */
export async function* streamChatCompletion(params: ChatCompletionParams): AsyncGenerator<StreamEvent> {
  if (mockEnabled()) {
    for await (const event of mockStreamChatCompletion(params)) {
      if (event.type === "done") {
        logUsage({ userId: params.userId, model: event.model, taskType: params.taskType, ...event.usage });
      }
      yield event;
    }
    return;
  }

  const { model, body } = buildRequestBody(params, true);
  const client = createClient(params.apiKey);

  let usage: ChatCompletionUsage = { tokensIn: 0, tokensOut: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  try {
    const stream = await client.chat.completions.create(
      body as unknown as Parameters<typeof client.chat.completions.create>[0]
    );
    for await (const chunk of stream as AsyncIterable<{
      choices?: Array<{
        delta?: {
          content?: string | null;
          tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
      usage?: unknown;
    }>) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        yield { type: "token", delta: delta.content };
      }
      if (delta?.tool_calls) {
        for (const call of delta.tool_calls) {
          yield {
            type: "tool_call_delta",
            index: call.index,
            id: call.id,
            name: call.function?.name,
            argumentsDelta: call.function?.arguments,
          };
        }
      }
      if (chunk.usage) {
        usage = extractUsage(chunk);
      }
    }
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : "OpenRouter-Anfrage fehlgeschlagen." };
    return;
  }

  logUsage({ userId: params.userId, model, taskType: params.taskType, ...usage });
  yield { type: "done", usage, model };
}

/** Prüft einen Key gegen /models — genutzt vom Test-Button in /settings. */
export async function testApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  if (mockEnabled()) return { ok: true };
  try {
    const client = createClient(apiKey);
    await client.models.list();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler." };
  }
}
