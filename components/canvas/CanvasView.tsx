"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { DocumentNode } from "./nodes/DocumentNode";
import { NoteNode, NOTE_COLORS } from "./nodes/NoteNode";
import { DocumentModal } from "./DocumentModal";
import { AddItemMenu } from "./AddItemMenu";
import { useProjectEvents } from "./useProjectEvents";
import type { ApiCanvasItem, ApiCanvasLink } from "./types";

const nodeTypes = { document: DocumentNode, note: NoteNode };

function nodeTypeFor(item: Pick<ApiCanvasItem, "type">): "document" | "note" {
  return item.type === "note" ? "note" : "document";
}

async function patchItem(id: string, patch: Record<string, unknown>) {
  await fetch(`/api/canvas-items/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

function CanvasInner({
  projectId,
  initialItems,
  initialLinks,
  activePhaseId: initialActivePhaseId,
  registerFocusHandler,
}: {
  projectId: string;
  initialItems: ApiCanvasItem[];
  initialLinks: ApiCanvasLink[];
  activePhaseId: string | null;
  registerFocusHandler?: (fn: (phaseId: string) => void) => void;
}) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [activePhaseId, setActivePhaseId] = useState(initialActivePhaseId);
  const [openDocument, setOpenDocument] = useState<ApiCanvasItem | null>(null);

  const isDimmed = useCallback(
    (phaseId: string | null) => Boolean(activePhaseId) && Boolean(phaseId) && phaseId !== activePhaseId,
    [activePhaseId]
  );

  const buildNode = useCallback(
    (item: ApiCanvasItem): Node => ({
      id: item.id,
      type: nodeTypeFor(item),
      position: { x: item.x, y: item.y },
      style: { width: item.width, height: item.height },
      data:
        item.type === "note"
          ? {
              title: item.title,
              content: item.content,
              color: item.color,
              phaseId: item.phaseId,
              dimmed: isDimmed(item.phaseId),
              onSave: (patch: { title?: string; content?: string }) => patchItem(item.id, patch),
            }
          : {
              title: item.title,
              content: item.content,
              status: item.status,
              phaseId: item.phaseId,
              dimmed: isDimmed(item.phaseId),
              onExpand: () => setOpenDocument(item),
            },
    }),
    [isDimmed]
  );

  const buildEdge = useCallback(
    (link: ApiCanvasLink): Edge => ({
      id: link.id,
      source: link.fromItemId,
      target: link.toItemId,
      label: link.relationLabel || undefined,
      style: { stroke: "var(--color-accent)", strokeDasharray: "4 4" },
      labelStyle: { fill: "var(--color-muted)", fontSize: 11 },
    }),
    []
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialItems.map(buildNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialLinks.map(buildEdge));

  useProjectEvents(projectId, (event) => {
    switch (event.type) {
      case "item_created": {
        const item = event.item as ApiCanvasItem;
        setNodes((prev) => (prev.some((n) => n.id === item.id) ? prev : [...prev, buildNode(item)]));
        break;
      }
      case "item_updated": {
        const item = event.item as ApiCanvasItem;
        setOpenDocument((prev) => (prev && prev.id === item.id ? item : prev));
        setNodes((prev) =>
          prev.map((n) =>
            n.id === item.id
              ? { ...n, position: { x: item.x, y: item.y }, style: { width: item.width, height: item.height }, data: buildNode(item).data }
              : n
          )
        );
        break;
      }
      case "item_deleted": {
        setNodes((prev) => prev.filter((n) => n.id !== event.itemId));
        break;
      }
      case "link_created": {
        const link = event.link as ApiCanvasLink;
        setEdges((prev) => (prev.some((e) => e.id === link.id) ? prev : [...prev, buildEdge(link)]));
        break;
      }
      case "phase_updated": {
        const phase = event.phase as { id: string; status: string };
        if (phase.status === "active") setActivePhaseId(phase.id);
        break;
      }
      default:
        break;
    }
  });

  const onNodeDragStop: OnNodeDrag<Node> = useCallback((_evt, node) => {
    patchItem(node.id, { x: node.position.x, y: node.position.y });
  }, []);

  // "Springen zwischen Phasen" im Kopfzeilen-Dropdown: zoomt/pannt die
  // Canvas auf die Items der gewählten Phase, ohne die tatsächliche
  // Aktiv-Phase (DB-Status) zu ändern — das bleibt dem Phasenübergang im
  // Chat vorbehalten.
  useEffect(() => {
    if (!registerFocusHandler) return;
    registerFocusHandler((phaseId: string) => {
      const ids = nodes
        .filter((n) => (n.data as { phaseId?: string | null }).phaseId === phaseId)
        .map((n) => n.id);
      if (ids.length > 0) {
        fitView({ nodes: ids.map((id) => ({ id })), duration: 400, padding: 0.3 });
      }
    });
  }, [registerFocusHandler, nodes, fitView]);

  const handleAdd = useCallback(
    (type: "document" | "note") => {
      const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const width = type === "note" ? 220 : 280;
      const height = type === "note" ? 180 : 200;
      fetch(`/api/projects/${projectId}/canvas-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: type === "note" ? "Neue Notiz" : "Neues Dokument",
          content: "",
          color: type === "note" ? NOTE_COLORS[0] : undefined,
          x: center.x - width / 2,
          y: center.y - height / 2,
          width,
          height,
        }),
      });
    },
    [projectId, screenToFlowPosition]
  );

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgb(31 29 27 / 0.16)" />
        <Controls showInteractive={false} />
      </ReactFlow>

      <AddItemMenu onAdd={handleAdd} />

      {openDocument && (
        <DocumentModal
          title={openDocument.title}
          content={openDocument.content}
          onClose={() => setOpenDocument(null)}
          onSave={async (patch) => patchItem(openDocument.id, patch)}
        />
      )}
    </div>
  );
}

export function CanvasView(props: {
  projectId: string;
  initialItems: ApiCanvasItem[];
  initialLinks: ApiCanvasLink[];
  activePhaseId: string | null;
  registerFocusHandler?: (fn: (phaseId: string) => void) => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
