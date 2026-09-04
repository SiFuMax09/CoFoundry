import type {
  ChatCompletionParams,
  ChatCompletionResult,
  ChatCompletionUsage,
  StreamEvent,
} from "./types";

/**
 * Deterministischer Ersatz für echte OpenRouter-Aufrufe (MOCK_OPENROUTER=1).
 * Nur für Entwicklung/Tests ohne Netzzugang oder Key — liefert plausible,
 * aber klar als Mock erkennbare Antworten, Tool-Calls und "Suchtreffer",
 * damit sich der komplette Flow (Chat, Ultraplan-Dispatch, Research) auch
 * ohne echten API-Call end-to-end durchspielen lässt.
 */

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function lastUserText(params: ChatCompletionParams): string {
  const last = [...params.messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return typeof last.content === "string" ? last.content : last.content.map((b) => b.text).join(" ");
}

/** Füllt ein JSON-Schema mit plausiblen Platzhalterwerten — für Tool-Argumente und Structured-Output-Mocks. */
export function fillSchema(schema: unknown, seed = 0): unknown {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as {
    type?: string;
    enum?: unknown[];
    properties?: Record<string, unknown>;
    required?: string[];
    items?: unknown;
    description?: string;
    minimum?: number;
  };

  if (s.enum && s.enum.length > 0) return s.enum[seed % s.enum.length];

  switch (s.type) {
    case "object": {
      const out: Record<string, unknown> = {};
      const keys = Object.keys(s.properties ?? {});
      for (const key of keys) {
        out[key] = fillSchema(s.properties![key], seed + key.length);
      }
      return out;
    }
    case "array":
      return [fillSchema(s.items, seed + 1)];
    case "number":
    case "integer":
      return s.minimum ?? 0;
    case "boolean":
      return true;
    case "string":
    default:
      return s.description ? `Mock: ${s.description.slice(0, 60)}` : "Mock-Text";
  }
}

function mockUsage(promptChars: number, replyChars: number): ChatCompletionUsage {
  return {
    tokensIn: Math.max(1, Math.round(promptChars / 4)),
    tokensOut: Math.max(1, Math.round(replyChars / 4)),
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };
}

function buildMockReply(params: ChatCompletionParams): { content: string | null; toolCalls: ChatCompletionResult["toolCalls"] } {
  // Structured Output (Ultraplan-/Research-Sub-Agenten erwarten ein
  // JSON-Schema-konformes Ergebnis statt Freitext).
  if (params.responseFormat?.type === "json_schema") {
    const filled = fillSchema(params.responseFormat.json_schema.schema, hashString(lastUserText(params)));
    return { content: JSON.stringify(filled), toolCalls: [] };
  }

  const userText = lastUserText(params);
  const seed = hashString(userText || params.taskType);

  // Mit Tools verfügbar: bei etwa jeder zweiten Anfrage einen Tool-Call
  // simulieren (deterministisch über den Hash der letzten Nutzer-Nachricht,
  // nicht zufällig), sonst eine reine Text-Antwort.
  if (params.tools && params.tools.length > 0 && seed % 2 === 0) {
    const tool = params.tools[seed % params.tools.length];
    const fn = "function" in tool ? tool.function : undefined;
    if (fn) {
      const args = fillSchema(fn.parameters, seed);
      return {
        content: null,
        toolCalls: [
          {
            id: `mock_call_${seed}`,
            type: "function",
            function: { name: fn.name, arguments: JSON.stringify(args) },
          },
        ],
      };
    }
  }

  const content =
    `[Mock] Antwort ohne echten OpenRouter-Aufruf (MOCK_OPENROUTER=1). ` +
    (userText
      ? `Bezogen auf: "${userText.slice(0, 140)}"`
      : "Kein Nutzer-Text im Kontext gefunden.");
  return { content, toolCalls: [] };
}

export async function mockChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const { content, toolCalls } = buildMockReply(params);
  const promptChars = params.messages.reduce(
    (sum, m) => sum + (typeof m.content === "string" ? m.content.length : m.content.map((b) => b.text).join("").length),
    0
  );
  return {
    content,
    toolCalls,
    usage: mockUsage(promptChars, (content ?? "").length + JSON.stringify(toolCalls).length),
    model: `mock:${params.taskType}`,
  };
}

export async function* mockStreamChatCompletion(params: ChatCompletionParams): AsyncGenerator<StreamEvent> {
  const { content, toolCalls } = buildMockReply(params);

  if (toolCalls.length > 0) {
    for (const [index, call] of toolCalls.entries()) {
      if (call.type !== "function") continue;
      yield { type: "tool_call_delta", index, id: call.id, name: call.function.name, argumentsDelta: call.function.arguments };
    }
  } else if (content) {
    for (const word of content.split(" ")) {
      yield { type: "token", delta: `${word} ` };
    }
  }

  const promptChars = params.messages.reduce(
    (sum, m) => sum + (typeof m.content === "string" ? m.content.length : m.content.map((b) => b.text).join("").length),
    0
  );
  yield {
    type: "done",
    usage: mockUsage(promptChars, (content ?? "").length + JSON.stringify(toolCalls).length),
    model: `mock:${params.taskType}`,
  };
}
