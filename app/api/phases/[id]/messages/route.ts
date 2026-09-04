import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedPhase } from "@/lib/phases";
import { getPhaseMessages } from "@/lib/ai/chat-log";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const owned = getOwnedPhase(id, auth.user.id);
  if (!owned) return NextResponse.json({ error: "Phase nicht gefunden." }, { status: 404 });

  // Rohe "tool"-Nachrichten sind für die UI uninteressant (deren Wirkung
  // zeigt sich in den tool_calls der zugehörigen assistant-Nachricht) —
  // hier nicht mit ausliefern, spart Payload.
  const messages = getPhaseMessages(id).filter((m) => m.role !== "tool");

  return NextResponse.json({ messages });
}
