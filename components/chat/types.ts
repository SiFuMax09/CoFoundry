export interface ChatMessageRow {
  id: string;
  projectId: string;
  phaseId: string;
  role: "user" | "assistant" | "system" | "summary";
  content: string;
  toolCalls: string | null;
  model: string | null;
  createdAt: string;
}

export interface DisplayToolCall {
  name: string;
  label: string;
}

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls: DisplayToolCall[];
  pending?: boolean;
}
