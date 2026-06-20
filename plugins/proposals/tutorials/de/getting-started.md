---
title: Erste Schritte mit dem proposals-Plugin
plugin: proposals
audience: Orchestrator / Agent
order: 1
lang: de
---

# Erste Schritte mit dem proposals-Plugin

Dieses Tutorial beginnt mit einem leeren Workspace und endet mit
einem funktionierenden Zyklus Vorschlag → Slice → Implementierung →
Abschluss, bei dem die Datei-Mutex-Disziplin intakt bleibt. Es
wird davon ausgegangen, dass das Plugin `proposals` aktiviert ist
(siehe `plugins/proposals/README.md` für das JSON-Snippet).

## 0. Das mentale Modell

Ein **Vorschlag** ist eine Markdown-Datei mit einem
Frontmatter-Header. Ein **Slice** ist ein nummerierter Abschnitt
darin. Das Plugin koordiniert zwei Schreiber pro Slice: einer
beansprucht, einer gibt frei. `auto_work` ist der übergeordnete
Einstiegspunkt „Was soll ich als nächstes tun?".

```
docs/mcp-vertex/proposals/
├─ index.json          (regeneriert von sync_proposals)
├─ p<N>-<titel>.md    (ein Vorschlag)
│  ├─ ## Slices
│  │  ├─ s1-claim
│  │  ├─ s2-implement
│  │  └─ s3-close
```

## 1. Mit `auto_work` starten

`auto_work` gibt den nächsten umsetzbaren Slice über den gesamten
Vorschlagsspeicher zurück, mit einem kompakten, geordneten Plan.
Der Plan ist wörtlich auszuführen — ohne Schritte zu improvisieren.

```json
// MCP-Tool-Aufruf
{ "tool": "proposals_auto_work", "args": {} }

// Typische Antwort (gekürzt)
{
  "state": "work",
  "proposalId": "l110",
  "sliceId": "s1-claim",
  "steps": [
    "docs/mcp-vertex/proposals/l110-…md öffnen und den nächsten atomaren Slice auswählen.",
    "Dateien beanspruchen: proposals_agent_lock { action: \"claim\", … }.",
    "Genau diesen Slice implementieren — nichts außerhalb der beanspruchten Dateien.",
    "Gemäß dem Projekt-Gate validieren (siehe get_validation_matrix, falls vorhanden).",
    "Fortschritt im Vorschlag markieren, dann proposals_sync_proposals aufrufen.",
    "Freigeben: proposals_agent_lock { action: \"release\", task_id }."
  ]
}
```

## 2. Die Dateien des Slices beanspruchen

Das Tool `proposals_agent_lock` erfasst, wer welche Pfade für die
Dauer eines Slices besitzt. Ohne Beanspruchung weigert sich
`sync_proposals`, den Slice als erledigt zu markieren.

```json
{
  "tool": "proposals_agent_lock",
  "args": {
    "action": "claim",
    "files": [
      "apps/web/src/components/PluginPage.astro",
      "apps/web/src/data/capabilities.json"
    ]
  }
}
```

Die Antwort enthält eine `task_id`, die bis zur Freigabe
aufbewahrt werden muss. Zwei Agenten, die dieselbe Datei
beanspruchen ⇒ Konflikt, kein Fortschritt. Der Mutex ist
dateisystemgestützt (nicht beratend) und überlebt Prozess-
Neustarts.

## 3. Den Slice implementieren und validieren

Bearbeiten Sie nur die beanspruchten Dateien. Führen Sie das
Gate aus:

```bash
bun run validate
```

Schlägt das Gate fehl, korrigieren Sie den Slice — erweitern Sie
den Anspruch nicht stillschweigend.

## 4. Fortschritt markieren und synchronisieren

`sync_proposals` liest die Vorschlagsdateien, validiert deren
Frontmatter + Slices-Plan und erstellt `index.json` neu. Es ist
günstig und idempotent.

```json
{ "tool": "proposals_sync_proposals", "args": {} }
```

## 5. Den Slice abschließen

```json
{
  "tool": "proposals_close_slice",
  "args": {
    "proposalId": "l110",
    "sliceId": "s1-claim"
  }
}
```

Dadurch wird der Slice-Status im Vorschlag auf `done` gesetzt,
der Lock entfernt und der Index neu synchronisiert. Rufen Sie dann
erneut `auto_work` auf — es wird den nächsten Slice zurückgeben
(oder `state: "idle"`, wenn der Speicher erschöpft ist).

## Häufige Fehler

- **Dateien außerhalb des Anspruchs bearbeiten**: `sync_proposals`
  weigert sich, den Slice als erledigt zu markieren. Verwenden
  Sie einen zweiten Slice mit eigenem Anspruch oder teilen Sie
  den Vorschlag auf.
- **`sync_proposals` überspringen**: Der Index veraltet. Der nächste
  Agent fragt nach „dem nächsten Slice" und erhält den falschen.
- **Vergessen freizugeben**: Ein veralteter Lock blockiert den
  nächsten Orchestrator für bis zu `staleMs` (Standard 30 s). Rufen
  Sie `proposals_agent_lock { action: "gc" }` zum Bereinigen auf.

## Nächster Schritt

- [Wie das Plugin agent_worktree gleichzeitige Agenten isoliert](#)
- [Persistenzmodi für auto_work (l109)](../../l109-feat-auto-work-persist-modes.md)
- [Round context für wiederaufgenommene Arbeit](#)
