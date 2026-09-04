# Agenten-Architektur

Dieses Dokument beschreibt, welche Muster für das Multi-Agent-System
(Ultraplan-Dispatch und Research) recherchiert und übernommen wurden, und
wo Cofoundry bewusst davon abweicht.

## Recherchierte Quellen

- **Anthropic — "How we built our multi-agent research system"**
  (`https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them`
  und die zugehörige Engineering-Fallstudie). Kernaussagen, die übernommen
  wurden:
  - **Orchestrator-Worker-Architektur**: ein Lead-Agent zerlegt eine
    Aufgabe und dispatcht mehrere Sub-Agenten, die parallel mit eigenem
    Kontextfenster und eigenem, engem Auftrag arbeiten.
  - Sub-Agenten brauchen **explizite Task-Boundaries**: klares Ziel,
    vorgegebenes Ausgabeformat, Tool-Guidance — ohne das dupliziert sich
    Arbeit oder es entstehen Lücken.
  - Multi-Agent-Systeme kosten deutlich mehr Tokens als ein Einzel-Chat
    (die Quelle nennt ~15×) — das bestätigt die im Auftrag geforderten
    festen Budgets pro Sub-Agent als notwendig, nicht optional.
- **Anthropic Agent Skills / "Progressive Disclosure"**
  (`https://www.firecrawl.dev/blog/agent-skills`,
  `https://www.newsletter.swirlai.com/p/agent-skills-progressive-disclosure`):
  Kontext nur dann laden, wenn er gebraucht wird — Kurzbeschreibungen
  bleiben dauerhaft im Kontext, Volltext wird gezielt nachgeladen.

## Was Cofoundry davon übernimmt

### Orchestrator-Worker, geteilt zwischen Ultraplan und Research

`lib/ai/agents/dispatch.ts` ist die gemeinsame Basis für beide
Multi-Agent-Flows (`lib/ai/ultraplan/` und `lib/ai/research/`):

1. Ein **Lead-Schritt** (Opus 5) zerlegt die Aufgabe:
   - Ultraplan wählt aus einem Pool von vier Kandidaten-Agenten
     (Domain-Scan, Feasibility, Resource-Gap, Risk-Scan) die für das
     jeweilige Projekt sinnvolle Teilmenge — **nicht fix**, siehe Auftrag.
   - Research zerlegt die Nutzerfrage stattdessen in drei fachlich
     zugeschnittene Teilfragen für **immer dieselben** drei Rollen
     (Wettbewerb, Zielgruppe, Markt/Risiko) — hier gibt es anders als bei
     Ultraplan keine Auswahl-Entscheidung, weil alle drei Blickwinkel für
     jede Recherchefrage relevant sind.
2. **Parallele Sub-Agenten** (`runAgents()`, `Promise.all`) mit festem
   Budget (max. 4 `search_web`-Aufrufe, festes `max_tokens` aus
   `lib/ai/tasks.ts`, 90 s Timeout pro Agent). Jeder Sub-Agent durchläuft
   eine begrenzte Tool-Runde (darf `search_web` aufrufen), gefolgt von
   einer erzwungenen strukturierten JSON-Schema-Extraktion — das
   entspricht der von Anthropic beschriebenen Kombination aus freier
   Tool-Nutzung und einem abschließenden, klar spezifizierten
   Ausgabeformat.
3. Ein einzelner fehlschlagender oder zeitüberschreitender Sub-Agent
   kippt den Gesamtlauf nicht — die Synthese arbeitet mit den
   verbliebenen Ergebnissen weiter (`AgentRunResult.status: "failed" |
   "timeout"` wird an die Synthese durchgereicht, nicht verworfen).
4. Ein **Synthese-Schritt** (Opus 5 bzw. `research_synthesis`) führt die
   Rohergebnisse zu einem strukturierten Ergebnis zusammen — bei Ultraplan
   eine Phasen-Roadmap samt Startkarten, bei Research ein zitiertes
   Markdown-Dokument.

### Progressive Disclosure im laufenden Chat

Der normale Phasen-Chat (`lib/ai/context.ts`) wendet dasselbe Prinzip auf
den Gesprächskontext an, nicht nur auf Skills:

- `get_canvas_overview` liefert nur Kurzsummaries (Titel, Typ, ~140 Zeichen
  Auszug) aller Canvas-Items — Volltext wird erst über `read_canvas_item`
  gezielt nachgeladen, wenn der Agent ihn tatsächlich braucht.
- Ältere Chat-Turns werden ab einem Token-Schwellwert automatisch zu einer
  einzigen `summary`-Nachricht verdichtet (`ensureSummarized`), statt den
  Kontext unbegrenzt wachsen zu lassen.

## Bewusste Abweichungen vom recherchierten Vorbild

- **Kein eigenständiger "Such-Agent" als Tool des Lead-Agenten.** Bei
  Anthropic recherchiert teils auch der Orchestrator selbst. Cofoundry
  lässt ausschließlich die Sub-Agenten suchen (`search_web` ist nicht Teil
  der `active_chat`-Toolliste, siehe `lib/ai/tools.ts`) — das hält die
  Kostenkontrolle an einer Stelle (`lib/ai/agents/dispatch.ts`) statt sie
  über mehrere Ebenen zu verteilen.
- **Kein dynamisches Nachjustieren der Sub-Agenten-Anzahl während des
  Laufs.** Anthropics System kann bei Bedarf weitere Sub-Agenten
  nachlegen; Cofoundry dispatcht eine Runde mit fester (bei Research) bzw.
  einmalig gewählter (bei Ultraplan) Menge an Agenten und synthetisiert
  danach — bewusst einfacher und vorhersagbarer, passend zum Anspruch
  "nachvollziehbar, keine Zufallskomponente" aus dem Modell-Zuordnungs-
  Kapitel des Auftrags.
- **Fixe statt gelernte Modellzuordnung.** Anthropics Artikel beschreibt
  kein festes Modell-Mapping; Cofoundry weist jeder Aufgabenrolle bewusst
  ein festes Modell zu (`lib/ai/tasks.ts`) statt eines Decider-Systems —
  eine explizite Design-Entscheidung aus dem Auftrag, keine Anthropic-
  Empfehlung.
