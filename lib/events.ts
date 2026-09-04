import { EventEmitter } from "node:events";

/**
 * In-Process-Event-Bus für Live-Updates der Canvas (SSE). Passt zu einer
 * self-hosted Single-Instance-Installation — bei mehreren Node-Prozessen
 * hinter einem Load Balancer bräuchte es stattdessen Redis Pub/Sub.
 */

export type CanvasEvent =
  | { type: "item_created"; item: unknown }
  | { type: "item_updated"; item: unknown }
  | { type: "item_deleted"; itemId: string }
  | { type: "link_created"; link: unknown }
  | { type: "phase_updated"; phase: unknown }
  | { type: "agent_progress"; message: string; done: number; total: number }
  | { type: "chat_token"; phaseId: string; delta: string }
  | { type: "chat_done"; phaseId: string };

const buses = new Map<string, EventEmitter>();

function busFor(projectId: string): EventEmitter {
  let bus = buses.get(projectId);
  if (!bus) {
    bus = new EventEmitter();
    bus.setMaxListeners(50);
    buses.set(projectId, bus);
  }
  return bus;
}

export function publishCanvasEvent(projectId: string, event: CanvasEvent) {
  busFor(projectId).emit("event", event);
}

export function subscribeCanvasEvents(
  projectId: string,
  onEvent: (event: CanvasEvent) => void
): () => void {
  const bus = busFor(projectId);
  bus.on("event", onEvent);
  return () => {
    bus.off("event", onEvent);
    if (bus.listenerCount("event") === 0) {
      buses.delete(projectId);
    }
  };
}
