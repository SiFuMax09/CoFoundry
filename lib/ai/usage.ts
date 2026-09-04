import { db } from "@/lib/db";
import { usageLog } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import type { TaskType } from "./tasks";

/**
 * Grobe Kosten-Schätzung fürs Settings-Dashboard, keine exakte Abrechnung
 * (die bleibt bei OpenRouter selbst). $/1M Tokens, Stand der in tasks.ts
 * hinterlegten Modelle — bewusst nur für die drei tatsächlich genutzten
 * Modelle, kein generischer Preis-Katalog.
 */
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  "anthropic/claude-opus-5": { input: 5, output: 25 },
  "anthropic/claude-sonnet-5": { input: 2, output: 10 },
  "openai/gpt-5-mini": { input: 0.25, output: 2 },
};

function estimateCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
  cacheReadTokens: number
): number {
  const price = PRICE_PER_MILLION[model];
  if (!price) return 0;
  // Cache-Reads sind deutlich günstiger als reguläre Input-Tokens (0.1x bei
  // Anthropic, 0.25x-0.5x bei OpenAI) — hier grob mit 0.2x angenähert, exakt
  // genug für eine Kostenübersicht, nicht für eine Abrechnung.
  const billableInput = Math.max(tokensIn - cacheReadTokens, 0);
  const cost =
    (billableInput / 1_000_000) * price.input +
    (cacheReadTokens / 1_000_000) * price.input * 0.2 +
    (tokensOut / 1_000_000) * price.output;
  return cost;
}

export interface UsageRecord {
  userId: string;
  model: string;
  taskType: TaskType | string;
  tokensIn: number;
  tokensOut: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export function logUsage(record: UsageRecord) {
  const cacheCreationTokens = record.cacheCreationTokens ?? 0;
  const cacheReadTokens = record.cacheReadTokens ?? 0;
  const costEstimate = estimateCost(record.model, record.tokensIn, record.tokensOut, cacheReadTokens);

  db.insert(usageLog)
    .values({
      id: newId("usage"),
      userId: record.userId,
      model: record.model,
      taskType: record.taskType,
      tokensIn: record.tokensIn,
      tokensOut: record.tokensOut,
      cacheCreationTokens,
      cacheReadTokens,
      costEstimate,
    })
    .run();
}
