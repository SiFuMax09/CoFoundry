import { getTaskConfig } from "./tasks";
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

function allText(params: ChatCompletionParams): string {
  return params.messages
    .map((m) => (typeof m.content === "string" ? m.content : m.content.map((b) => b.text).join(" ")))
    .join("\n");
}

function lastUserText(params: ChatCompletionParams): string {
  const last = [...params.messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return typeof last.content === "string" ? last.content : last.content.map((b) => b.text).join(" ");
}

/**
 * Sucht im bisherigen Kontext nach echten IDs (Format "<prefix>_<uuid>",
 * wie lib/db/ids.ts sie vergibt) — die zuletzt genannte je Präfix. Der Mock
 * erfindet nie eigene IDs für item_id/phase_id & Co., sonst würden Aufrufe
 * wie update_canvas_item oder link_items gegen nicht existierende Zeilen
 * laufen (bei phase_id sogar gegen die Fremdschlüssel-Prüfung).
 */
function extractKnownIds(params: ChatCompletionParams): Record<string, string> {
  const text = allText(params);
  const matches = text.matchAll(/\b([a-z]+)_[0-9a-f]{8}-[0-9a-f-]{27}\b/g);
  const known: Record<string, string> = {};
  for (const m of matches) {
    known[m[1]] = m[0];
  }
  return known;
}

const ID_FIELD_PREFIX: Record<string, string> = {
  phase_id: "phase",
  item_id: "item",
  from_item_id: "item",
  to_item_id: "item",
};

/** Füllt ein JSON-Schema mit plausiblen Platzhalterwerten — für Structured-Output-Mocks (dort keine IDs). */
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

/**
 * Füllt NUR die Pflichtfelder eines Tool-Parameter-Schemas — optionale
 * Felder (z. B. phase_id bei create_note) lässt der Mock bewusst weg, statt
 * sie mit erfundenem Text zu belegen. Für ID-Felder wird eine im bisherigen
 * Kontext vorkommende echte ID eingesetzt.
 */
function fillRequiredArgs(schema: unknown, seed: number, knownIds: Record<string, string>): Record<string, unknown> | null {
  const s = schema as { type?: string; properties?: Record<string, unknown>; required?: string[] } | undefined;
  if (!s || s.type !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const key of s.required ?? []) {
    const prefix = ID_FIELD_PREFIX[key];
    if (prefix) {
      const known = knownIds[prefix];
      if (!known) return null; // Tool ohne bekannte ID nicht aufrufbar — Mock lässt es aus.
      out[key] = known;
      continue;
    }
    out[key] = fillSchema(s.properties?.[key], seed + key.length);
  }
  return out;
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
  // Variiert je Runde innerhalb desselben Turns (messages.length wächst mit
  // jeder Tool-Runde) — sonst würde eine Konversation, deren erste Runde
  // deterministisch einen Tool-Call auslöst, denselben Tool-Call in jeder
  // weiteren Runde wiederholen und nie zu einer Text-Antwort finden.
  const seed = hashString(`${userText || params.taskType}:${params.messages.length}`);

  if (params.tools && params.tools.length > 0 && seed % 3 === 0) {
    const knownIds = extractKnownIds(params);
    const eligible = params.tools.filter((tool) => {
      const fn = "function" in tool ? tool.function : undefined;
      return fn ? fillRequiredArgs(fn.parameters, seed, knownIds) !== null : false;
    });
    if (eligible.length > 0) {
      const tool = eligible[seed % eligible.length];
      const fn = "function" in tool ? tool.function : undefined;
      if (fn) {
        const args = fillRequiredArgs(fn.parameters, seed, knownIds) ?? {};
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
    model: `mock:${getTaskConfig(params.taskType, params.modelOverride).model}`,
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
    model: `mock:${getTaskConfig(params.taskType, params.modelOverride).model}`,
  };
}
