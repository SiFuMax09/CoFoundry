# Cofoundry

Dein eigener, self-hosted AI-Co-Founder — ein funktionaler 1:1-Clone von
aicofounder.com / Buildpad, inklusive Canvas-Konzept. Kein Abo, keine
Credit-Limits: einzige Kostenquelle ist dein eigener [OpenRouter](https://openrouter.ai)-Key,
pay-as-you-go, egal wie lange eine Phase dauert.

## Kernidee

- **Canvas als persistenter Arbeitsbereich** — Dokumente, Notizen und
  Verbindungen bleiben liegen, während Chats flüchtig sind.
- **Phasen-Roadmap statt starrer Schritte** — "Ultraplan" dispatcht
  parallele Recherche-Agenten und schlägt daraus eine Roadmap vor, die du
  bestätigst, bevor irgendetwas auf die Canvas geschrieben wird.
- **Ein einziger Key für alles** — Chat, Recherche-Agenten und Websuche
  laufen alle über denselben OpenRouter-Key (das `web`-Plugin), keine
  zweite API, keine zweite Rechnung.

## Tech-Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4
· [@xyflow/react](https://reactflow.dev) für die Canvas · SQLite über
`drizzle-orm` + `better-sqlite3` · `iron-session` für Auth · das `openai`-
Paket gegen die OpenRouter-API.

## Setup

```bash
pnpm install
```

Zwei Secrets in `.env.local` (Beispiel in `.env.local.example`):

```bash
cp .env.local.example .env.local
# In .env.local eintragen:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → SESSION_SECRET
```

**Kein OpenRouter-Key in `.env`** — der wird nach dem ersten Start in der
App selbst unter `/settings` hinterlegt (verschlüsselt in der SQLite-DB
gespeichert, nie im Klartext an den Client zurückgegeben).

Datenbank anlegen und migrieren:

```bash
pnpm db:migrate
pnpm db:seed        # legt einen ersten Account an, Zugangsdaten werden ausgegeben
```

Optional per Umgebungsvariable steuerbar:

```bash
SEED_EMAIL=du@example.com SEED_PASSWORD=eigenes-passwort pnpm db:seed
```

Entwicklung starten:

```bash
pnpm dev
```

App läuft auf `http://localhost:3000`. Registrieren, unter `/settings`
den eigenen OpenRouter-Key eintragen (Test-Button prüft ihn direkt gegen
die API) — danach ist alles startklar.

## Ablauf einmal komplett durchgespielt

1. Registrierung → `/settings` → OpenRouter-Key eintragen und testen
2. `/dashboard` → "Neues Projekt" → kurzer Auswahllisten-Wizard (Kategorie,
   Branche, Zeit/Budget, Teamgröße, Commitment)
3. Landet direkt im Chat der automatisch angelegten Phase 0
   ("Grundlagen klären") — der Agent stellt gezielte Rückfragen zur
   eigentlichen Idee
4. Sobald genug Substanz gesammelt ist, erscheint eine Karte im Chat:
   "Ultraplan starten" (inkl. grober Kosten-/Zeitschätzung)
5. Klick löst den Ultraplan-Dispatch aus: mehrere Sub-Agenten recherchieren
   parallel (Markt, Machbarkeit, Ressourcen-Lücken, Risiken), ein
   Synthese-Schritt schlägt daraus eine Phasen-Roadmap samt Startkarten vor
6. Vorschlag prüfen, bei Bedarf "Anpassen" (Freitext-Korrektur, kein neuer
   Sub-Agenten-Lauf), dann "Roadmap übernehmen" — erst jetzt landen Phasen
   und Karten wirklich auf der Canvas
7. Phase für Phase weiterarbeiten: Chat mit `gpt-5-mini` (Standard) oder
   manuell hochgeschaltet auf `claude-sonnet-5`, Notizen/Dokumente manuell
   oder vom Agenten angelegt, 🔍-Button für gezielte Multi-Agent-Recherche
   zu einer Frage
8. Am Ende jeder Phase: "Bereit für Phase X?"-Hinweis, Klick übernimmt in
   die nächste Phase — kein automatischer Übergang ohne diesen Klick

## Entwicklung ohne echten OpenRouter-Zugriff

`MOCK_OPENROUTER=1` (in `.env.local` oder als Umgebungsvariable) schaltet
alle OpenRouter-Aufrufe auf einen deterministischen Mock um — nützlich für
lokale Entwicklung/Tests ohne Netzzugang oder ohne bezahlten Key. Im
Normalbetrieb weglassen.

```bash
MOCK_OPENROUTER=1 pnpm dev
```

## Projektstruktur

```
app/                    Next.js App Router (Seiten + API-Routen)
components/
  canvas/                React-Flow-Canvas, Nodes, Versionshistorie
  chat/                  Chat-Panel, Ultraplan-/Research-Karten, SSE-Parsing
  dashboard/, project/, onboarding/, settings/, icons/
lib/
  ai/
    openrouter.ts         OpenRouter-Client, Prompt-Caching
    tasks.ts               feste Modell-Zuordnung pro Aufgabenrolle
    tools.ts                Canvas-Agent-Tools (Function Calling)
    mock.ts                  deterministischer Mock (MOCK_OPENROUTER=1)
    search.ts                 search_web + Such-Cache
    agents/dispatch.ts         gemeinsame Multi-Agent-Infrastruktur
    ultraplan/, research/       Ultraplan- bzw. Research-Orchestratoren
  db/                    Drizzle-Schema, Migrationen, Seed
  canvas/                Layout-Algorithmus, Versionierung, Textutils
  auth.ts, crypto.ts, api-keys.ts, events.ts, phases.ts, projects.ts
docs/agent-architecture.md   recherchierte Multi-Agent-Muster & Quellen
drizzle/                Generierte SQL-Migrationen
```

## Daten & Sicherheit

- `data/cofoundry.db` (SQLite) und `data/projects/<id>/` (Datei-Uploads,
  Wissensordner) liegen außerhalb von `/public`, sind nie direkt per URL
  erreichbar und werden nicht ins Repo committet (`.gitignore`).
- Der OpenRouter-Key wird AES-256-GCM-verschlüsselt gespeichert
  (Server-Secret aus `ENCRYPTION_KEY`), Passwörter mit bcrypt gehasht.
- Von der KI generiertes Website-HTML/JS würde ausschließlich in einem
  sandboxed `<iframe>` gerendert (Website-Builder selbst ist im aktuellen
  Stand nicht enthalten).
- Kein Tracking, keine externen Analytics, keine Payment-/Abo-Logik.

## Nützliche Befehle

```bash
pnpm dev            # Entwicklungsserver (Turbopack)
pnpm build           # Produktions-Build
pnpm start            # Produktions-Server
pnpm lint              # ESLint
pnpm db:generate        # neue Migration aus dem Schema erzeugen
pnpm db:migrate           # Migrationen anwenden
pnpm db:seed                # ersten Account anlegen
```
