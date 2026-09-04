import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

export interface SaveMessageInput {
  projectId: string;
  phaseId: string;
  role: "user" | "assistant" | "tool" | "system" | "summary";
  content: string;
  toolCalls?: ChatCompletionMessageToolCall[] | null;
  toolCallId?: string | null;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

export function saveChatMessage(input: SaveMessageInput) {
  const id = newId("msg");
  db.insert(chatMessages)
    .values({
      id,
      projectId: input.projectId,
      phaseId: input.phaseId,
      role: input.role,
      content: input.content,
      toolCalls: input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      toolCallId: input.toolCallId ?? null,
      model: input.model ?? null,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
    })
    .run();
  return id;
}

export function getPhaseMessages(phaseId: string) {
  return db.select().from(chatMessages).where(eq(chatMessages.phaseId, phaseId)).orderBy(asc(chatMessages.createdAt)).all();
}

export function getRecentPhaseMessages(phaseId: string, limit: number) {
  const rows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.phaseId, phaseId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit)
    .all();
  return rows.reverse();
}

export function deleteMessages(ids: string[]) {
  if (ids.length === 0) return;
  db.delete(chatMessages).where(inArray(chatMessages.id, ids)).run();
}
