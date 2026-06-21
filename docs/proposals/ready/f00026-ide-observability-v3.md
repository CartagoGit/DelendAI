---
id: f00026
status: ready
type: proposal
track: apps+client+docs
date: 2026-06-21
kind: feat
title: IDE observability v3 — logs en vivo, búsqueda, knowledge, health, memory, settings, connection-health
shipped-in: []
related:
    - f00022 # v2 — dashboard + multi-IDE shell (closed)
    - f00015 # logs plugin — source of truth for the new Logs panel
    - f00016 # proposal state machine — health diagnostics consume proposals_state_health
    - f00012 # i18n baseline — new strings mirror the 12 languages
    - f00011 # capabilities surface — new services are first-class IDE citizens
ownership:
    - {
          agent: implementation_runner,
          task: 'S1: LogsService + Notification bridge in packages/client (logs_subscribe / logs_tail / logs_correlate)',
      }
    - {
          agent: implementation_runner,
          task: 'S2: SearchService in packages/client + tool-search QuickPick command in extensions/vscode',
      }
    - {
          agent: implementation_runner,
          task: 'S3: KnowledgeService expansion (list + search) + Knowledge navigator webview in packages/ui-extension',
      }
    - {
          agent: implementation_runner,
          task: 'S4: HealthService in packages/client (state_health + stale_list + agent_lock) + Health panel in dashboard',
      }
    - {
          agent: implementation_runner,
          task: 'S5: MemoryService in packages/client (recall/save/forget/list) + Memory panel in dashboard + tree provider',
      }
    - {
          agent: implementation_runner,
          task: 'S6: SettingsService in packages/client (config reader/writer) + settings webview + 3 commands',
      }
    - {
          agent: implementation_runner,
          task: 'S7: ConnectionHealthService in packages/client (stdio ping + retry) + status-bar banner + restart command',
      }
    - {
          agent: implementation_runner,
          task: 'S8: Wire all 6 new services in extensions/vscode activation, expand tree views, add 2 new activity-bar entries',
      }
    - {
          agent: implementation_runner,
          task: 'S9: i18n for ~20 new keys across all 12 languages (ar, de, en, es, fr, hi, it, ja, pt, th, vi, zh)',
      }
    - {
          agent: implementation_runner,
          task: 'S10: full test coverage (≥90% on new services) + bun run validate green + .vsix repackaging',
      }
    - {
          agent: implementation_runner,
          task: 'S11: docs (CROSS-IDE.md addendum, IDE-EXTENSION.md v3 section, README, CHANGELOG 0.3.0)',
      }
globalGate: lint
acceptance:
    - { command: bun run type, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run site:strict, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run check:i18n:ide, expect: exit0 }
    - { command: bun run lint:brand, expect: exit0 }
    - { command: bun run lint:cross-ide, expect: exit0 }
    - { command: cd extensions/vscode && bun run package, expect: exit0 }
---

# f00023 — IDE observability v3

## goal

Promote the IDE extension from "view the registry + dashboard KPIs" to
**a real observability cockpit for someone using the extension day-to-day**.
The server already exposes 60+ tools across 12 plugins; this proposal
adds the missing client services + UI surfaces that turn those tools
into something a human can act on without opening a terminal.

Three dimensions of observability are added, in seven independent
slices. Every slice is **additive** — no existing API breaks.

| Dimension | Block | Server tool(s) used |
|---|---|---|
| **Operacional** | Connection health (S7) | stdio ping + retry |
| **Operacional** | Health diagnostics (S4) | `proposals_state_health`, `proposals_proposal_stale_list`, `proposals_agent_names` |
| **Contenido** | Knowledge navigator (S3) | `mcp-vertex_knowledge` |
| **Contenido** | Search global (S2) | `search_search` |
| **Contenido** | Memory (S5) | `memory_recall`, `memory_save`, `memory_list`, `memory_forget` |
| **Debug** | Logs en vivo (S1) | `logs_subscribe`, `logs_tail`, `logs_correlate` |
| **Debug** | Settings UI (S6) | workspace config (no MCP tool) |

## why

`f00022` shipped the dashboard + multi-IDE shell. The user then asked
**"¿qué más herramientas serían útiles para alguien que vaya a usar la
extensión?"**. An audit of the 60+ tools exposed by the server
identified 7 missing client+UI surfaces that a daily user of the
extension would notice immediately:

1. **Logs inaccesibles** — the logs plugin emits events (f00015) but the
   extension never surfaces them. When a tool fails, the user has to
   open a terminal and tail a file.
2. **No search** — 50+ tools in the tree, no way to filter. A user
   types a keyword and gets nothing.
3. **Knowledge is opaque** — `mcp-vertex_knowledge` returns
   `{entries: [{id, title}]}` but the extension never lists them. The
   user has to know IDs to read them.
4. **No health visibility** — the proposals plugin reports
   `proposals_state_health` with stale proposals, orphan locks, etc.
   Nothing surfaces this.
5. **No memory UI** — the memory plugin is 4 tools, none of them are
   reachable from the extension.
6. **No config UI** — every config option requires editing
   `mcp-vertex.config.json` by hand.
7. **No connection health** — if stdio drops, the extension silently
   shows an empty tree. No retry, no banner.

This proposal closes all 7 in 11 slices.

## non-goals

- **No new MCP plugin.** Every data source is already on the server.
- **No new dashboard panel inside the existing 8 tabs** — each new
  surface (Health, Memory, Settings) gets its **own view container**
  in the activity bar, mirroring how the existing Tools/Proposals
  containers work. This keeps the dashboard focused on KPIs.
- **No CodeLens** — that needs the inverse index proposed in
  f00024+.
- **No auth** — same scope as f00014/f00022.
- **No telemetry of our own.**
- **No git tree view** — already covered by VS Code's built-in git
  extension; we only surface `git_status` as a status-bar indicator.

## architecture

### 2.1 Layered architecture (unchanged from f00022)

```
                ┌────────────────────────┐
                │ @mcp-vertex/core       │
                │ (MCP server, stdio)    │
                └──────────┬─────────────┘
                           │ JSON-RPC over stdio
                           ▼
                ┌────────────────────────┐
                │ @mcp-vertex/client     │
                │ - (f00022) Dashboard…    │
                │ - (f00023) LogsService   │
                │ - (f00023) SearchService │
                │ - (f00023) KnowledgeSvc+ │
                │ - (f00023) HealthService │
                │ - (f00023) MemoryService │
                │ - (f00023) SettingsSvc   │
                │ - (f00023) ConnHealthSvc │
                └──────────┬─────────────┘
                           │ typed JS objects
                           ▼
                ┌────────────────────────┐
                │ packages/ui-extension/  (panel HTML)│
                │ + Logs panel           │
                │ + Memory panel         │
                │ + Settings panel       │
                │ + Health panel         │
                └──────────┬─────────────┘
                           │ implements IHostAdapter
                           ▼
                ┌────────────────────────┐
                │ extensions/vscode            │
                │ - 7 new commands       │
                │ - 4 new view containers│
                │ - Status-bar banner    │
                │ - Tree providers       │
                └────────────────────────┘
```

### 2.2 Hard rules (preserved from f00022)

- `packages/core` stays agnostic — no `vscode`/`jetbrains` import.
- `packages/client` stays IDE-agnostic — no `@vscode/*`. The new
  services are pure TypeScript; tests run under `node`/`bun`.
- `packages/ui-extension/` is host-agnostic UI — every new panel returns HTML,
  same convention as f00022's 8 dashboard panels.
- `extensions/vscode/` is the reference adapter. **The only file that
  imports `vscode` is `vscode-host-adapter.ts`** (lazily loaded).
- i18n parity — every new visible string added to all 12
  dictionaries.

### 2.3 New `IHostAdapter` requirements

No new methods on `IHostAdapter`. Every new service uses the existing
12 methods. The one addition is **`registerOutputChannel`** for the
Logs panel (already in the interface as optional `?` method added in
f00022; if missing, Logs panel degrades to a "no output channel
available" message).

## slices

Each slice ends green (`bun run validate`), ships a Conventional
Commit, and updates this proposal's `shipped-in` list in `index.json`.

### S1 — `LogsService` + `NotificationLogsBridge` in `packages/client` _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `packages/client/src/lib/services/logs-service.ts`
  - `packages/client/src/lib/services/notification-logs-bridge.ts`
  - `packages/client/src/lib/services/logs.types.ts`
  - `packages/client/tests/services/logs-service.spec.ts`
  - `packages/client/tests/services/notification-logs-bridge.spec.ts`
- `LogsService` wraps `logs_subscribe`, `logs_tail`,
  `logs_correlate`, `logs_query`, `logs_redact_test` over the same
  `McpStdioClient`. Exposes `subscribe(channel, signal): AsyncIterable<ILogEvent>`,
  `tail(channel, n)`, `correlate(toolName, since)`, `query(filter)`.
- `NotificationLogsBridge` subscribes to `notification_notify_status`
  + `notification_await_lock` and **cross-references every event with
  the last N tool calls** from `MetricsService` (correlation ID is
  the `correlationId` field on both the log and the metric row).
- All log payloads go through `redactSecrets` before being emitted
  (the `redact` helper is exposed by `plugins/logs`; we re-implement
  the same regex set in the client to avoid pulling the plugin into
  the client).
- **Gate**: `bun run test packages/client` exit 0; coverage on the
  two new services ≥ 90%.

### S2 — `SearchService` + tool-search command _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `packages/client/src/lib/services/search-service.ts`
  - `packages/client/src/lib/services/search.types.ts`
  - `packages/client/tests/services/search-service.spec.ts`
  - `extensions/vscode/src/commands/tool-search.ts`
  - `extensions/vscode/src/test/tool-search.spec.ts`
- `SearchService` wraps `search_search` and provides:
  - `searchTools(query, opts): Promise<IToolHit[]>` — uses
    `search_search` against `docs/` + the live tool names from
    `OverviewService` as a built-in corpus, so the user can search
    the docs and the registry with one keystroke.
  - `searchKnowledge(query, opts): Promise<IKnowledgeHit[]>` — same
    idea but over `mcp-vertex_knowledge`.
- `tool-search` VS Code command opens a QuickPick, types the query,
  shows results grouped by category, Enter → run the tool (calls
  `request(toolName, {})`) and shows the JSON in an output channel.
- **Gate**: `bun run test packages/client extensions/vscode` exit 0.

### S3 — `KnowledgeService` expansion + Knowledge navigator webview _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `packages/client/src/lib/services/knowledge-service.ts` (extend
    existing)
  - `packages/client/src/lib/services/knowledge.types.ts`
  - `packages/client/tests/services/knowledge-service.spec.ts`
  - `packages/ui-extension/src/dashboard/render-panel-knowledge.ts` (or its own
    `packages/ui-extension/src/knowledge/render-knowledge-navigator.ts`)
  - `packages/ui-extension/src/knowledge/render-knowledge-navigator.ts`
  - `packages/ui-extension/src/knowledge/render-knowledge-entry.ts`
  - `packages/ui-extension/tests/knowledge/render-knowledge-navigator.spec.ts`
  - `packages/ui-extension/tests/knowledge/render-knowledge-entry.spec.ts`
  - `extensions/vscode/src/commands/open-knowledge.ts`
  - `extensions/vscode/src/test/open-knowledge.spec.ts`
- `KnowledgeService` gains:
  - `list(opts): Promise<readonly IKnowledgeSummary[]>` (already
    existed) — added `query?: string` filter.
  - `search(query): Promise<readonly IKnowledgeHit[]>` — uses
    `mcp-vertex_knowledge` with body matching.
  - `categories(): Promise<readonly string[]>` — derived from the
    knowledge entries (e.g. groups like "Tool", "Concept", "Workflow").
- New panel: **Knowledge Navigator** — left pane = grouped tree
  (categories → entries), right pane = Markdown-rendered body of the
  selected entry. A search box at the top filters as you type. The
  Markdown renderer reuses the safe subset already used in
  `apps/web/src/components/`.
- VS Code command: `mcp-vertex.openKnowledge` — opens the
  navigator in a webview.
- **Gate**: `bun run test packages/client packages/ui-extension extensions/vscode` exit 0.

### S4 — `HealthService` + Health panel in dashboard _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `packages/client/src/lib/services/health-service.ts`
  - `packages/client/src/lib/services/health.types.ts`
  - `packages/client/tests/services/health-service.spec.ts`
  - `packages/ui-extension/src/dashboard/render-panel-health.ts`
  - `packages/ui-extension/tests/dashboard/render-panel-health.spec.ts`
- `HealthService` aggregates:
  - `proposals_state_health` → 3 counts (stale, orphan-lock, healthy).
  - `proposals_proposal_stale_list` → list of stale proposals with
    age.
  - `proposals_agent_names` → currently active agents.
  - `mcp-vertex_status` → server health snapshot.
- Returns a single `IHealthSnapshot` model that the new **Health
  panel** renders: a top row of 4 KPI tiles (Healthy / Stale /
  Orphan / Agents), a table of stale proposals with a "Renew" button
  (calls `proposals_proposal_force_transition`), a list of active
  agents with their current proposal/slice.
- **Gate**: `bun run test packages/client packages/ui-extension` exit 0.

### S5 — `MemoryService` + Memory panel + tree provider _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `packages/client/src/lib/services/memory-service.ts`
  - `packages/client/src/lib/services/memory.types.ts`
  - `packages/client/tests/services/memory-service.spec.ts`
  - `packages/ui-extension/src/dashboard/render-panel-memory.ts`
  - `packages/ui-extension/tests/dashboard/render-panel-memory.spec.ts`
  - `extensions/vscode/src/providers/memory-tree-data-provider.ts`
  - `extensions/vscode/src/test/memory-tree-data-provider.spec.ts`
  - `extensions/vscode/src/commands/memory-save.ts`
  - `extensions/vscode/src/commands/memory-forget.ts`
  - `extensions/vscode/src/test/memory-save.spec.ts`
  - `extensions/vscode/src/test/memory-forget.spec.ts`
- `MemoryService` wraps `memory_recall`, `memory_save`, `memory_list`,
  `memory_forget`. Returns `IMemoryEntry { key, value, tags,
  createdAt, expiresAt }`.
- New panel: **Memory** — list view with create/edit/delete. The
  "create" opens a small webview with a textarea + tags input.
- New tree provider: `mcp-vertex.memory` — every key as a node with
  hover preview, click → open the entry in the Memory panel.
- 2 new commands: `mcp-vertex.memorySave`,
  `mcp-vertex.memoryForget`. Both have command-palette entries.
- **Gate**: `bun run test packages/client packages/ui-extension extensions/vscode` exit 0.

### S6 — `SettingsService` + settings webview _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `packages/client/src/lib/services/settings-service.ts`
  - `packages/client/src/lib/services/settings.types.ts`
  - `packages/client/tests/services/settings-service.spec.ts`
  - `packages/ui-extension/src/settings/render-settings.ts`
  - `packages/ui-extension/tests/settings/render-settings.spec.ts`
  - `extensions/vscode/src/commands/open-settings.ts`
  - `extensions/vscode/src/test/open-settings.spec.ts`
- `SettingsService` reads/writes `mcp-vertex.config.json#extension`
  via the host adapter. Exposes:
  - `get(): Promise<IExtensionSettings>` — `{ docsUrl, allowLocalhost,
    allowPrivateIps, logLevel, theme }`.
  - `set(patch): Promise<void>` — atomic write via
    `writeFileAtomic` from the core, redacts secrets, validates URL.
- New webview: **Settings** — a single-page form with all the
  options, "Save" + "Reset" buttons. The form re-reads the config on
  open so changes from outside are reflected.
- VS Code command: `mcp-vertex.openSettings`.
- **Gate**: `bun run test packages/client packages/ui-extension extensions/vscode` exit 0.

### S7 — `ConnectionHealthService` + status-bar banner + restart command _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `packages/client/src/lib/services/connection-health-service.ts`
  - `packages/client/src/lib/services/connection-health.types.ts`
  - `packages/client/tests/services/connection-health-service.spec.ts`
  - `extensions/vscode/src/providers/connection-health-status-bar.ts`
  - `extensions/vscode/src/test/connection-health-status-bar.spec.ts`
  - `extensions/vscode/src/commands/restart-server.ts`
  - `extensions/vscode/src/test/restart-server.spec.ts`
- `ConnectionHealthService` pings the server every 5s with
  `status-marker_ping` (the cheapest tool). Exposes:
  - `EventTarget`-style: `addEventListener("up" | "down" | "retry",
    cb)`. Drops events on slow subscribers.
  - `lastSeen: Date | undefined` and `lastError: Error | undefined`.
  - `restart(): Promise<void>` — calls the host's
    `restartServerCommand` (defaults to a VS Code task that re-spawns
    `bun run mcp-vertex`).
- Status bar shows: `$(circle-green) mcp-vertex` (up) /
  `$(circle-red) mcp-vertex (down 12s)` (down) /
  `$(sync~spin) mcp-vertex (retrying)` (retrying). Click → open the
  dashboard.
- New command: `mcp-vertex.restartServer`.
- **Gate**: `bun run test packages/client extensions/vscode` exit 0.

### S8 — Wire 6 new services in `extensions/vscode` activation + tree views _(excl. `packages/ui-extension/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `extensions/vscode/src/extension.ts` (updated activation: instantiate 6
    new services, register 6 new commands, 2 new view containers).
  - `extensions/vscode/package.json` (updated `contributes.viewsContainers`
    + `contributes.views` + `contributes.commands`).
  - `extensions/vscode/src/test/extension-integration.spec.ts` (new spec
    verifying every command + every view is registered).
- The 2 new view containers are:
  - `mcp-vertex.memory` — Memory tree (S5).
  - `mcp-vertex.health` — Health KPI webview view (S4).
- Backward-compat: all v1 + v2 commands continue to work.
- **Gate**: `bun run test extensions/vscode` exit 0; typecheck exit 0.

### S9 — i18n for ~20 new keys across all 12 languages _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `extensions/vscode/src/i18n/langs/{ar,de,en,es,fr,hi,it,ja,pt,th,vi,zh}.ts`
    — add ~20 new keys:
    `openKnowledge`, `openSettings`, `restartServer`, `searchTools`,
    `memorySave`, `memoryForget`, `logsPanelTitle`,
    `healthPanelTitle`, `memoryPanelTitle`, `settingsPanelTitle`,
    `kpiHealthy`, `kpiStale`, `kpiOrphan`, `kpiAgents`,
    `connectionUp`, `connectionDown`, `connectionRetrying`,
    `connectionLost`, `restartNow`, `logSearch`, `logSubscribe`.
  - `extensions/vscode/src/i18n/index.ts` — extend `IExtensionTranslations`.
- `bun run check:i18n:ide` must pass.
- **Gate**: `bun run check:i18n:ide` exit 0.

### S10 — Tests + `bun run validate` green + `.vsix` repackaging _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**: existing test files; bumped `extensions/vscode/package.json#version` to `0.3.0`.
- **Gate**:
  - `bun run type` exit 0.
  - `bun run test` exit 0.
  - `bun run lint` exit 0.
  - `bun run check:i18n:ide` exit 0.
  - `bun run lint:brand` exit 0.
  - `bun run lint:cross-ide` exit 0.
  - `bun run site:strict` exit 0.
  - `bun run lint:proposals` exit 0.
  - `cd extensions/vscode && bun run package` exit 0, produces
    `extensions/vscode/mcp-vertex-vscode-0.3.0.vsix`.

### S11 — Docs (CROSS-IDE addendum + IDE-EXTENSION v3 section + README + CHANGELOG 0.3.0) _(excl. `apps/`, `plugins/`, `packages/`)_

- **Status**: ready
- **Files**:
  - `docs/CROSS-IDE.md` (add an "Observability v3" addendum section
    listing the new services + commands).
  - `docs/IDE-EXTENSION.md` (add a v3 section: "What changed in 0.3.0",
    the 6 new commands, the 2 new view containers, the Logs/Memory
    panels, the Settings webview, the Connection-health banner).
  - `extensions/vscode/README.md` (refreshed feature list + commands table).
  - `extensions/vscode/CHANGELOG.md` (new `0.3.0` entry summarising all
    additions).
- **Gate**: `bun run site:strict` exit 0.

## acceptance

- All 9 commands in `acceptance:` at the top exit 0.
- A new `extensions/vscode/mcp-vertex-vscode-0.3.0.vsix` is produced.
- A user opening the extension can:
  - **Search** any tool by name (S2).
  - **Browse** the 30+ knowledge entries with a Markdown preview (S3).
  - **See** stale proposals + active agents in the Health panel (S4).
  - **Inspect** every memory entry, create new ones, delete old ones
    (S5).
  - **Reconfigure** the extension without editing YAML/JSON (S6).
  - **See** when the stdio connection drops + click "Restart" (S7).
  - **Tail** live logs correlated to tool calls (S1).
- Every visible string is translated to all 12 languages.
- The brand logo is byte-identical between
  `apps/web/public/logo.svg` and `extensions/vscode/media/logo.svg`.

## notes

These are the other 13 tools/features identified in the audit but
not in this proposal:

- **Quality gates status** (`quality_get_quality_scopes`,
  `quality_run_quality`) — defer until f00024 (proposed).
- **Git status contextual** (`git_status`, `git_diff`, etc.) —
  covered by VS Code's built-in git extension; we only show
  `git_status` in the status bar in f00024+.
- **Deps** (`deps_deps_list`, `deps_deps_outdated`,
  `deps_deps_check`) — defer to f128.
- **Audit** (`audit_audit_plan`, `audit_audit_consolidate`) — defer
  to f129 (the audit plugin is a heavy tool; UI is non-trivial).
- **Status-marker explicit close** (`status-marker_close`) — minor;
  covered by `close` icon in Connection health banner (S7).
- **Proposal board extension** (already in v2 dashboard; v3 adds
  nothing here).
- **CodeLens / hover for tool calls** — needs inverse index, defer
  to f130.
- **Export metrics / proposals as JSON/CSV** — small follow-up to
  the dashboard, defer to f131.
- **Recent proposals / slices / agents** — small "recently active"
  pane, defer to f131.
- **Trends / historical chart** (uses persisted `metrics`
  snapshots) — defer to f132.
- **Custom alerts** (notify when a tool fails, or when a metric
  crosses a threshold) — defer to f132.
- **Rules panel** (`rules_get_rules`, `rules_apply_rules`,
  `rules_check_rules`) — defer to f133.
- **Knowledge autocomplete in tool calls** — needs integration with
  VS Code IntelliSense, defer to f133.
