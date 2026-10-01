---
id: c00144
title: "chore: pin surfaceMode=native in mcp-vertex.config.json so first tools/list enumerates every plugin"
kind: chore
status: done
type: proposal
track: agent-orchestrator
date: 2026-08-26
date_iso: 2026-08-26
mode: general
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)
related:
  - f00182 # S1
  - f00186 # S5 dogfooding
---
# c00144 — `surfaceMode: "native"` in repo config

## Goal

The dogfooding of `agent-orchestrator` (q00007) brought the
`--preset=swarm` plugin surface up. The default `adaptive` surface
mode (post-r00026 / TOK-004) ships only the 6 core tools
(`overview`, `tool_search`, `plugin_activate`, `plugin_deactivate`,
`status`, `vertex`) and expects the MCP client to re-fetch
`tools/list` after a `notifications/tools/list_changed` notification
when a plugin is activated.

VS Code's MCP client honours the initial `tools/list` and
**ignores** the `listChanged` notification when the client did not
declare the capability (which is the default for every spec-compliant
client). The repo's dogfooding VS Code host therefore saw
"Discovered 6 tools" and never refreshed — meaning the user could
not see `agent-orchestrator` tools without restarting the server
every time they wanted to call one.

Pinning `surfaceMode: "native"` in the repo's `mcp-vertex.config.json`
restores the legacy behaviour: the first `tools/list` enumerates
every tool of every loaded plugin, including all 4
`agent-orchestrator_*` tools. No notification round-trip needed.

## Why "native" is still the right default for this repo

- The repo's own `validate` script runs every tool under every
  plugin via `verify:tools` (q00008 etc.). A native surface keeps
  the tool listing stable across MCP-client upgrades.
- The token cost of the full `tools/list` schema is bounded by the
  preset-metadata measurement (r00024 / PRESET-001) and the
  `tokens:gate` / `tokens:dashboard:check` lints. With the `swarm`
  preset (8 plugins) it lands well under the r00019 ceiling.
- Adaptive stays the right default for **adopters** who don't dogfood
  the whole surface. They can still set `surfaceMode: "adaptive"` in
  their own `mcp-vertex.config.json` — the `native` value in this
  repo's config affects only this repo's host.

## Acceptance

- `mcp-vertex.config.json` has `surfaceMode: "native"`.
- A `tools/list` against `tools/scripts/host/host-server.script.ts
  --preset=swarm` returns 199 tools (was 6 with `adaptive`).
- `agent-orchestrator_*` (plan / dispatch / budget / plan_ref) is
  present in the list.
- `bun run catalog:generate` and the pre-commit drift checks stay
  green.

## Files changed

- `mcp-vertex.config.json` — added `surfaceMode: "native"`.
- `docs/mcp-vertex/agent-catalog.generated.json` — regenerated.
- `docs/mcp-vertex/host-hints/agent-instructions.generated.md` —
  regenerated.
