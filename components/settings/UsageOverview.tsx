"use client";

import { useEffect, useState } from "react";

interface UsageRow {
  taskType: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  costEstimate: number;
  requestCount: number;
}

function formatCost(value: number): string {
  return `$${value.toFixed(3)}`;
}

export function UsageOverview() {
  const [byTask, setByTask] = useState<UsageRow[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/usage")
      .then((r) => r.json())
      .then((data) => {
        setByTask(data.byTask ?? []);
        setTotalCost(data.totals?.costEstimate ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-base font-semibold text-ink">Nutzung & Kosten</h2>
        <p className="text-sm text-muted">
          Geschätzt gesamt: <span className="font-medium text-ink">{formatCost(totalCost)}</span>
        </p>
      </div>
      <p className="mt-1 text-xs text-muted">
        Grobe Schätzung anhand geloggter Token-Zahlen — für die exakte Abrechnung gilt dein OpenRouter-Dashboard.
      </p>

      {loading && <p className="mt-3 text-sm text-muted">Lädt …</p>}

      {!loading && byTask.length === 0 && (
        <p className="mt-3 text-sm text-muted">Noch keine Nutzung erfasst.</p>
      )}

      {!loading && byTask.length > 0 && (
        <div className="thin-scroll mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-muted">
                <th className="py-1.5 pr-3">Aufgabenrolle</th>
                <th className="py-1.5 pr-3">Modell</th>
                <th className="py-1.5 pr-3">Anfragen</th>
                <th className="py-1.5 pr-3">Tokens (in/out)</th>
                <th className="py-1.5">Kosten</th>
              </tr>
            </thead>
            <tbody>
              {byTask.map((row, i) => (
                <tr key={i} className="border-b border-hairline last:border-0">
                  <td className="py-1.5 pr-3 text-ink">{row.taskType}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs text-muted">{row.model}</td>
                  <td className="py-1.5 pr-3 text-ink">{row.requestCount}</td>
                  <td className="py-1.5 pr-3 text-ink">
                    {row.tokensIn}/{row.tokensOut}
                  </td>
                  <td className="py-1.5 text-ink">{formatCost(row.costEstimate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
