import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { ApiKeyManager } from "@/components/settings/ApiKeyManager";
import { UsageOverview } from "@/components/settings/UsageOverview";
import { TASK_CONFIG } from "@/lib/ai/tasks";

const TASK_LABELS: Record<string, string> = {
  ultraplan_orchestrator: "Ultraplan (Dispatch-Planung + Synthese)",
  ultraplan_subagent: "Ultraplan-Sub-Agenten",
  research_subagent: "Research-Sub-Agenten",
  research_synthesis: "Research-Synthese",
  active_chat: "Phasen-Chat (Standard)",
  chat_summarization: "Chat-Zusammenfassung",
  website_copy: "Website-Texte",
  youtube_script: "YouTube-Skripte",
  marketing_content: "Marketing-Content",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar email={user.email} />

      <main className="flex-1 overflow-y-auto px-8 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="font-display text-2xl font-semibold text-ink">Einstellungen</h1>

          <ApiKeyManager />

          <div className="card p-6">
            <h2 className="font-display text-base font-semibold text-ink">Aufgabenrolle → Modell</h2>
            <p className="mt-1 text-sm text-muted">
              Rein informativ — Änderungen erfolgen in <code className="font-mono text-xs">lib/ai/tasks.ts</code>,
              nicht hier.
            </p>
            <div className="thin-scroll mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs text-muted">
                    <th className="py-1.5 pr-3">Aufgabenrolle</th>
                    <th className="py-1.5 pr-3">Modell</th>
                    <th className="py-1.5">Begründung</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(TASK_CONFIG).map(([taskType, config]) => (
                    <tr key={taskType} className="border-b border-hairline last:border-0">
                      <td className="py-1.5 pr-3 text-ink">{TASK_LABELS[taskType] ?? taskType}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs text-muted">{config.model}</td>
                      <td className="py-1.5 text-xs text-muted">{config.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <UsageOverview />
        </div>
      </main>
    </div>
  );
}
