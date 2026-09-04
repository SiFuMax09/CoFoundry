export interface UltraplanPhaseProposal {
  title: string;
  goal: string;
  brief: string;
}

export interface UltraplanStarterCard {
  phase_index: number;
  type: "note" | "document";
  title: string;
  content: string;
  color?: string;
}

export interface UltraplanProposalData {
  phases: UltraplanPhaseProposal[];
  starter_cards: UltraplanStarterCard[];
  briefing_document: { title: string; content: string };
}
