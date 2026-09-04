export interface ApiCanvasItem {
  id: string;
  projectId: string;
  phaseId: string | null;
  type: "document" | "note" | "website" | "calendar";
  title: string;
  content: string;
  color: string | null;
  status: "draft" | "final" | null;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiCanvasLink {
  id: string;
  fromItemId: string;
  toItemId: string;
  relationLabel: string;
}

export interface ApiPhase {
  id: string;
  projectId: string;
  title: string;
  goal: string;
  brief: string;
  status: "todo" | "active" | "done";
  order: number;
  systemPromptOverride: string | null;
  activeChatModel: string | null;
  readySummary: string | null;
  readyAt: string | null;
  createdAt: string;
}
