---
id: f00186
title: "agent-orchestrator S5 — dogfood on develop with defaultMode: auto + regen"
kind: feat
status: done
type: proposal
track: agent-orchestrator
date: 2026-08-26
date_iso: 2026-08-26
mode: general
parent-plan: q00007
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)
---
# f00186 — `agent-orchestrator` S5

## Goal

Adopt the plugin in this repo's own `mcp-vertex.config.json` with
`defaultMode: "auto"` so the dogfood validates every assertion from
S1..S4. The repo now ships with the workflow policy engine
loaded alongside every other plugin it owns.

## Acceptance

- `mcp-vertex.config.json` → `plugins.agent-orchestrator.options.policy`
  declares `defaultMode: "auto"` with the S2 defaults.
- `bun run generate:from-manifests` picked up the new plugin
  (verified in `packages/core/src/lib/registry/generated/...`,
  `apps/web/src/data/plugins/...`, `docs/mcp-vertex/generated/...`).
- `bun run catalog:generate` picked it up in
  `docs/mcp-vertex/agent-catalog.generated.json` and the host hints.
- `packages/core/src/lib/plugins/preset-catalog.ts` registers the
  plugin in `standard`, `swarm`, `full`, and `vertex` presets.
- `bun run lint:manifest-vs-presets` and
  `bun run lint:plugin-manifest` stay green.
- `bun run typecheck` green.
- `tools/scripts/types/generate-tool-types.script.ts` PLUGIN_LIST
  includes `agent-orchestrator` so future regenerates include the
  plugin's tool output schema.

## Files changed

- `mcp-vertex.config.json` — added the policy block.
- `packages/core/src/lib/plugins/preset-catalog.ts` — registered
  `agent-orchestrator` in 4 presets.
- `tools/scripts/types/generate-tool-types.script.ts` — added the
  plugin id to the `PLUGIN_LIST` constant.
- All the `*generated*` files updated to include the new plugin.
