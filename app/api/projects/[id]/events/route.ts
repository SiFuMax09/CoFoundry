import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/projects";
import { subscribeCanvasEvents, type CanvasEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

function encode(event: CanvasEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await params;

  const project = getOwnedProject(id, auth.user.id);
  if (!project) {
    return new Response("Projekt nicht gefunden.", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      unsubscribe = subscribeCanvasEvents(id, (event) => {
        controller.enqueue(encoder.encode(encode(event)));
      });

      // Hält die Verbindung durch Proxys/Load Balancer offen, die Idle-
      // Connections sonst nach kurzer Zeit trennen.
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 25_000);
    },
    cancel() {
      unsubscribe();
      clearInterval(heartbeat);
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
