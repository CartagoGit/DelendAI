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

- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/plugin-origin.interface.ts`, `packages/core/src/lib/plugins/classify-origin.ts`, `packages/core/src/lib/plugins/load-config-file.ts`, `packages/core/tests/src/lib/plugins/classify-origin.spec.ts`
- **Gate**: bun run typecheck && bun run test
- **Acceptance**:
  - "A `PluginOrigin = 'bundled' | 'user-local' | 'external'` type + a pure `classifyOrigin(entry, resolvedSpecifier)`: bundled = a first-party `@mcp-vertex/*` plugin from the shipped set (a canonical list, cross-checked against PUBLISH_ORDER so it can't drift); user-local = a config entry with a `path`/relative specifier the user owns; external = an external-mcps `ext.*` server. A spec covers all three + an unknown-specifier fallback."
  - "The classification is data-only (no I/O beyond the already-parsed config); AGENTS.md rule #1 (core stays vendor-agnostic) preserved — the bundled list is the first-party set, not vendor knowledge."

### S2 — Activation resolver: what is on, and why

- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/activation-report.ts`, `packages/core/src/lib/tools/overview-tool.ts` (additive), `packages/core/tests/src/lib/plugins/activation-report.spec.ts`
- **Depends on**: S1
- **Gate**: bun run validate
- **Acceptance**:
  - "A pure `buildActivationReport({ requested, loaded, preset, config })` returns, per plugin: `{ id, origin, active, source: 'preset'|'config'|'flag', toolCount }` — the authoritative answer to 'which plugins/tools are on and why they're on.' Surfaced additively on `overview` (compact-safe: only when asked / non-default) so an agent can introspect its own active surface in one call (token-lean)."
  - "A spec proves the report reconciles with the actual loaded set (no phantom/missing plugin), reusing the assemble.ts loaded-set (never string-parsing tool names — the carried-owner rule)."

### S3 — Extension selection UI (toggle + origin badges)

- **Status**: pending
- **Files**: `packages/ui-extension/src/dashboard/builders/plugin-switchboard.builder.ts`, `packages/ui-extension/src/contracts/interfaces/plugin-switchboard.interface.ts`, `extensions/vscode/src/commands/plugin-activation.ts`, `extensions/vscode/src/i18n/plugin-switchboard.strings.ts`, `extensions/vscode/package.json`, `tools/scripts/lint/cli-ui-parity.map.json`
- **Depends on**: S2
- **Gate**: bun run lint && cd extensions/vscode && bun run test
- **Acceptance**:
  - "A switchboard render-model (pure builder, mcpv-* classes) grouped by origin with a per-plugin tool count + an on/off state; the vscode command writes the toggle into `mcp-vertex.config.json` (merge-aware) and prompts a restart. Each origin tier has a distinct badge (ours / yours / external). 12-lang strings; parity map updated; degrades to opt-in hint when the introspection surface is unavailable."

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
