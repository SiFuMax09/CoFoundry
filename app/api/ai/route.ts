import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedPhase } from "@/lib/phases";
import { getDecryptedApiKey } from "@/lib/api-keys";
import { streamChatCompletion, buildCachedMessages, type ORMessage } from "@/lib/ai/openrouter";
import { buildChatContext, ensureSummarized } from "@/lib/ai/context";
import { buildToolDefinitions, executeToolCall, type ToolContext } from "@/lib/ai/tools";
import { saveChatMessage } from "@/lib/ai/chat-log";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  projectId: z.string(),
  phaseId: z.string(),
  message: z.string().min(1).max(8000),
  taskType: z.literal("active_chat"),
});

const MAX_ROUNDS = 8;

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.", 400);
  }
  const { projectId, phaseId, message } = parsed.data;

  const owned = getOwnedPhase(phaseId, auth.user.id);
  if (!owned || owned.project.id !== projectId) {
    return jsonError("Phase nicht gefunden.", 404);
  }

  const apiKey = getDecryptedApiKey(auth.user.id);
  if (!apiKey) {
    return jsonError(
      "Kein OpenRouter-Key hinterlegt. Bitte zuerst unter /settings einen Key eintragen.",
      400,
      { needsApiKey: true }
    );
  }

  saveChatMessage({ projectId, phaseId, role: "user", content: message });
  await ensureSummarized({ projectId, phaseId, userId: auth.user.id, apiKey });

  const { stableMessages, variableMessages } = await buildChatContext({ projectId, phaseId, userMessage: message });
  const modelOverride = owned.phase.activeChatModel;
  let conversation: ORMessage[] = buildCachedMessages("active_chat", stableMessages, variableMessages, modelOverride);

  const tools = buildToolDefinitions();
  const ctx: ToolContext = {
    projectId,
    userId: auth.user.id,
    currentPhaseId: phaseId,
    createdItemIds: new Set<string>(),
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          let assistantText = "";
          const toolCallAccum = new Map<number, { id: string; name: string; args: string }>();
          let hadError = false;

          for await (const event of streamChatCompletion({
            apiKey,
            userId: auth.user.id,
            taskType: "active_chat",
            modelOverride,
            messages: conversation,
            tools,
          })) {
            if (event.type === "token") {
              assistantText += event.delta;
              send({ type: "token", delta: event.delta });
            } else if (event.type === "tool_call_delta") {
              const entry = toolCallAccum.get(event.index) ?? {
                id: event.id ?? `call_${event.index}`,
                name: event.name ?? "",
                args: "",
              };
              if (event.id) entry.id = event.id;
              if (event.name) entry.name = event.name;
              if (event.argumentsDelta) entry.args += event.argumentsDelta;
              toolCallAccum.set(event.index, entry);
            } else if (event.type === "error") {
              hadError = true;
              send({ type: "error", message: event.message });
            }
          }

          if (hadError) {
            controller.close();
            return;
          }

          const toolCalls = [...toolCallAccum.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, c]) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: c.args },
            }));

          if (toolCalls.length === 0) {
            saveChatMessage({
              projectId,
              phaseId,
              role: "assistant",
              content: assistantText,
              model: modelOverride ?? undefined,
            });
            send({ type: "done" });
            controller.close();
            return;
          }

          saveChatMessage({
            projectId,
            phaseId,
            role: "assistant",
            content: assistantText,
            toolCalls,
            model: modelOverride ?? undefined,
          });
          conversation = [...conversation, { role: "assistant", content: assistantText, tool_calls: toolCalls }];

          for (const call of toolCalls) {
            const result = await executeToolCall(call.function.name, call.function.arguments, ctx);

            send({
              type: "tool_call",
              name: call.function.name,
              summary: result.summary,
            });
            if (result.canvasUpdate) {
              send({ type: "canvas_update", kind: result.canvasUpdate.kind, data: result.canvasUpdate.data });
            }
            if (call.function.name === "set_phase_ready") {
              send({ type: "phase_ready", phaseId });
            }

            saveChatMessage({
              projectId,
              phaseId,
              role: "tool",
              content: JSON.stringify(result.result),
              toolCallId: call.id,
            });
            conversation = [
              ...conversation,
              { role: "tool", content: JSON.stringify(result.result), tool_call_id: call.id },
            ];
          }
        }

        // Rundenlimit erreicht, ohne dass das Modell final geantwortet hat —
        // sauber beenden statt abzustürzen.
        send({ type: "done", limitReached: true });
        controller.close();
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Unerwarteter Fehler." });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
