import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">
          Self-hosted · pay-as-you-go
        </p>
        <h1 className="font-display text-5xl font-semibold text-ink sm:text-6xl">
          Cofoundry
        </h1>
        <p className="mx-auto max-w-md text-base text-muted">
          Dein eigener AI-Co-Founder. Kein Abo, keine Credit-Limits — nur dein
          eigener OpenRouter-Key.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/register"
          className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-white shadow-card transition hover:bg-accent-strong"
        >
          Konto erstellen
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-hairline bg-surface px-6 py-3 text-sm font-medium text-ink shadow-card transition hover:border-accent"
        >
          Anmelden
        </Link>
      </div>
    </main>
  );
}
