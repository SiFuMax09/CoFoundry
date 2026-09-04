"use client";

import { useEffect, useRef } from "react";
import type { CanvasEvent } from "@/lib/events";

/** Abonniert die SSE-Events eines Projekts und reicht sie an den Callback durch. */
export function useProjectEvents(projectId: string, onEvent: (event: CanvasEvent) => void) {
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const source = new EventSource(`/api/projects/${projectId}/events`);
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as CanvasEvent;
        handlerRef.current(event);
      } catch {
        // Heartbeat-Kommentare erzeugen keine "message"-Events, hier landen
        // also nur echte Payloads — ein Parse-Fehler wird einfach ignoriert.
      }
    };
    return () => source.close();
  }, [projectId]);
}
