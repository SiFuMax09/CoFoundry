"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PillSelect } from "@/components/onboarding/PillSelect";

const KATEGORIE = ["SaaS", "E-Commerce", "Content & Creator", "Physisches Produkt", "Dienstleistung", "Sonstiges"];
const BRANCHE = ["Tech & Software", "Gesundheit & Wellness", "Bildung", "Finanzen", "Konsumgüter", "Kreativwirtschaft", "Sonstiges"];
const ZEIT_BUDGET = ["Nebenbei, knappes Budget", "Teilzeit, kleines Budget", "Vollzeit, solides Budget"];
const TEAM_GROESSE = ["Solo", "2-3 Personen", "4+ Personen"];
const COMMITMENT = ["Erstmal ausprobieren", "Ernsthaft verfolgen", "All-in"];

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [branche, setBranche] = useState<string | null>(null);
  const [zeitBudget, setZeitBudget] = useState<string | null>(null);
  const [teamGroesse, setTeamGroesse] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const complete = name.trim() && kategorie && branche && zeitBudget && teamGroesse && commitment;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          onboarding: { kategorie, branche, zeitBudget, teamGroesse, commitment },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Projekt konnte nicht angelegt werden.");
        return;
      }
      router.push(`/project/${data.project.id}`);
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">Neues Projekt</h1>
          <p className="mt-1 text-sm text-muted">
            Ein paar Klicks für den groben Rahmen — die eigentlichen Details klärst du danach im Chat.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-6 p-8">
          <div>
            <label htmlFor="name" className="text-sm font-medium text-ink">
              Projektname
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Rechnungstool für Freelancer"
              className="mt-2 w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none"
            />
          </div>

          <PillSelect label="Kategorie" options={KATEGORIE} value={kategorie} onChange={setKategorie} />
          <PillSelect label="Branche" options={BRANCHE} value={branche} onChange={setBranche} />
          <PillSelect label="Zeit & Budget" options={ZEIT_BUDGET} value={zeitBudget} onChange={setZeitBudget} />
          <PillSelect label="Teamgröße" options={TEAM_GROESSE} value={teamGroesse} onChange={setTeamGroesse} />
          <PillSelect label="Commitment" options={COMMITMENT} value={commitment} onChange={setCommitment} />

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={!complete || loading}
            className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-50"
          >
            {loading ? "Wird angelegt …" : "Projekt anlegen"}
          </button>
        </form>
      </div>
    </main>
  );
}
