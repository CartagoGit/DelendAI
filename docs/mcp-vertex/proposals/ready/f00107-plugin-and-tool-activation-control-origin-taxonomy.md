---
id: f00107
kind: feat
status: ready
type: proposal
track: core+config+ui-extension+vscode+web
date: 2026-07-08
title: "Plugin & tool activation control — origin taxonomy (ours / user / external) + selection UI"
shipped-in: []
recan: []
related:
    - f00068 # external-mcps — the 'external' origin tier this classifies
    - f00087 # config plugin `path` — the 'user-local' origin evidence
    - f00098 # provider dashboard / cli-ui-parity — the UI surface + contract this extends
    - f00090 # token budget — fewer active tools = smaller prompt = the savings this enables
ownership:
    - { agent: implementation_runner, task: 'S1: plugin-origin taxonomy in core (bundled / user-local / external)' }
    - { agent: implementation_runner, task: 'S2: activation resolver — which plugins/tools are on, and why' }
    - { agent: implementation_runner, task: 'S3: extension selection UI (toggle + origin badges)' }
    - { agent: implementation_runner, task: 'S4: web catalog parity + docs' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
---

# f00107 — Plugin & tool activation control with origin taxonomy

## goal

Let a user of the library **see and choose** which plugins and tools are
active, with a clear origin distinction: **(a) bundled by us** (mcp-vertex's
first-party plugins), **(b) the user's own local plugins** (their custom
code), and **(c) external** (third-party MCP servers via external-mcps). Fewer
active tools = a smaller tool surface in every prompt = direct token savings
for the LLM — so activation control is a token-efficiency feature, not just
UX. Give the LLM (and the human) a legible switchboard.

## why

Today there is no origin concept and no selection surface:

- Plugins are enabled by three merged mechanisms — preset (`--preset`,
  `preset-catalog.ts`), the config `plugins` block, and `--plugins` — with
  **no typed notion of where a plugin came from.** The config `path` field
  (f00087, `load-config-file.ts`) already distinguishes a local plugin
  physically, but nothing surfaces it as "the user's own vs ours."
- There is **no bundled/first-party/third-party classification** anywhere in
  core (grep: no `pluginOrigin` / `bundled` / `first-party` type).
- There is **no toggle UI** in the extension or web (grep: no
  `togglePlugin`/`enablePlugin`) — activation is edit-the-config-by-hand only.
- external-mcps (f00068) adds a real third tier (external MCP servers), but it
  is invisible next to the native plugins — the user can't see "these 9 are
  mcp-vertex's, this 1 is mine, these 2 are external servers I mounted."

The result: a user consuming mcp-vertex cannot reason about, or trim, their
active tool surface — the single biggest lever on prompt size and thus on the
token cost of every call the LLM makes.

## non-goals

- **No plugin sandboxing / permission model** — this is visibility + on/off,
  not a security boundary (that is a separate concern).
- **No hot-reload** — toggling writes the config; the server restart picks it
  up (the extension already has a restart command).
- **No change to how plugins are authored** (f00101 owns authoring).

## Slices

- global_gate: validate

### S1 — Plugin-origin taxonomy in core

- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/plugin-origin.interface.ts`, `packages/core/src/lib/contracts/constants/first-party-scope.constant.ts`, `packages/core/src/lib/plugins/classify-origin.ts`, `packages/core/tests/src/lib/plugins/classify-origin.spec.ts`
- **Gate**: bun run typecheck && bun run test
- **Acceptance**:
  - "A `PluginOrigin = 'bundled' | 'user-local' | 'external'` type + a pure `classifyOrigin(input)`. **Design choice (scope-based, not a hardcoded list):** bundled = a plugin whose RESOLVED specifier is under the `@mcp-vertex/` scope — the same convention `resolvePluginSpecifier` already applies — so there is NO 20-name list to maintain and it cannot drift as plugins are added/removed (strictly better than the originally-proposed enumerated list; the user granted free rein to pick the most correct). user-local = an explicit `path` entry (precedence) or a third-party `mcp-*`/bare package; external = an external-mcps composed server (`isExternalServer`). Precedence external > path > scope > user-local."
  - "Data-only (no I/O); AGENTS.md rule #1 preserved (no vendor vocabulary — the scope string is the maintainer's own npm scope). A drift-guard spec reuses the filesystem truth (the `plugins/` dirs) to assert every shipped plugin classifies bundled via its scoped specifier — so the convention and the shipped set can never disagree. Exported from `@mcp-vertex/core/public`. 8 specs green."

### S2 — Activation resolver: what is on, and why

- **Status**: in-progress (pure builder done; overview wiring pending)
- **Files**: `packages/core/src/lib/plugins/activation-report.ts` ✅, `packages/core/src/lib/contracts/interfaces/activation-report.interface.ts` ✅, `packages/core/tests/src/lib/plugins/activation-report.spec.ts` ✅, `packages/core/src/lib/plugins/parse-cli-args.ts` (source-tracking, pending), `packages/core/src/lib/tools/overview-tool.ts` + `assemble.ts` (additive wiring, pending)
- **Depends on**: S1
- **Gate**: bun run validate
- **Acceptance**:
  - "DONE: pure `buildActivationReport(loaded, sources)` returns, per plugin, `{ id, origin, active, source: 'preset'|'config'|'flag', toolCount }` + per-origin `counts` + `totalTools` (the prompt-facing surface size), sorted origin-then-id. Source precedence flag > config > preset. Exported from `@mcp-vertex/core/public`; 4 specs (classify+attribute+tally, precedence, ordering, empty)."
  - "PENDING (why it is a separate careful step): accurate `preset` vs `flag` attribution needs `parse-cli-args` to STOP collapsing them — `IMcpVertexCliArgs.plugins` today already merges `--preset` expansion + `--plugins` into one list, so assemble cannot tell them apart. S2's wiring adds a `presetMembers`/`flagPlugins` split to the parsed args (hot-path — done carefully), threads them + `configPluginNames` + the loaded set (with resolved specifier + `path` + tool count) into `buildActivationReport`, and surfaces it additively on `overview` (only when asked; token-lean). A spec then proves the report reconciles with the real loaded set."

### S3 — Extension selection UI (toggle + origin badges)

- **Status**: done
- **Files**: `packages/ui-extension/src/dashboard/builders/plugin-switchboard.builder.ts`, `packages/ui-extension/src/contracts/interfaces/plugin-switchboard.interface.ts`, `packages/client/src/lib/services/plugin-activation.service.ts`, `extensions/vscode/src/commands/plugin-activation.ts`, `extensions/vscode/src/i18n/plugin-switchboard.strings.ts`, `extensions/vscode/package.json`, `tools/scripts/lint/cli-ui-parity.map.json`, config/activation contracts + colocated specs
- **Depends on**: S2
- **Gate**: bun run lint && cd extensions/vscode && bun run test
- **Acceptance**:
  - "A pure host-agnostic switchboard builder groups stable rows by origin in ours / yours / external order, with tool count, source, current state and next toggle state. Missing activation introspection degrades to an actionable compatibility hint."
  - "The VS Code `Manage Plugin Activation` QuickPick requests `overview { compact:true, activation:true }`, renders distinct origin/state badges, persists the selected inverse state, and offers a one-click MCP server restart. Copy is complete in all 12 languages; command/contribution and CLI↔UI parity ratchets are updated."
  - "Persistent native overrides use `plugins.<id>.enabled`; `false` suppresses even preset/CLI selections and inactive entries stay in overview for re-enabling. The last known `origin` is stored beside the override so an unloaded bare package is never misclassified."
  - "External children use `plugins.external-mcps.options.servers.<id>.enabled`; disabled children remain visible but are filtered from the lazy subprocess registry. Their pinned command/version/env definition is preserved."
  - "Config writes live in reusable `@mcp-vertex/client` service code and use `withFileMutex` + `writeFileAtomic`; native entries preserve path/prefix/options, external entries preserve their full definition, and repeated writes are idempotent."

### S4 — Web catalog parity + docs

- **Status**: pending
- **Files**: `apps/web/src/pages/plugins.astro` (coordinate — web owner), `apps/web/src/data/plugin-origins.ts`, `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md`
- **Depends on**: S1
- **Gate**: bun run lint:web
- **Acceptance**:
  - "The web plugins surface labels each plugin by origin (bundled/first-party) and documents how a consumer adds a user-local plugin (`path`) or an external server (external-mcps), so the ecosystem story — ours vs yours vs external — is visible without opening a config file. `bun run site` green."

## acceptance

- `bun run validate` → exit 0.
- One introspection call answers "which plugins/tools are active, from which
  origin, and why."
- The extension shows a switchboard grouped by origin (ours / yours /
  external) that toggles activation via the config.
- Trimming the active set measurably shrinks the tool surface the LLM sees.
