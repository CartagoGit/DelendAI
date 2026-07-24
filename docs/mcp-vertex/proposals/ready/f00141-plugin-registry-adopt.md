---
id: f00141
kind: feat
title: plugin registry + one-command adopt — a discoverable index of plugins with mcpv plugin add that installs, wires and configures
status: ready
date: 2026-07-23
track: plugin+registry+dx
---

# f00141 — plugin registry + one-command adopt

## goal

A discoverable **registry** of plugins (first-party + community) and a
one-command **adopt** flow — `mcpv plugin add <id>` / `plugin_add` — that
installs the package, wires it, and adds it to the config (or a pack) so a
generated or published plugin (f00120) can be pulled into any project in one
step. The inverse of the generator: create once, adopt anywhere.

## why

The ecosystem only compounds if plugins are **discoverable and trivially
adoptable**. Today adopting a plugin means hand-editing config and knowing the
package name. A registry + one-command adopt turns "everything auto-configured"
into a network effect: the project (and its community) can share capability
with zero ceremony — directly serving "todo fácilmente configurable o que se
configure automáticamente."

## why this design

The registry is **plain data** (a signed/first-party index + optional
user-declared sources), consumed by a pure resolver — no hosted service.
`plugin_add` composes the existing installer + f00120's wiring writer + the
`configuration_center`, so adopt reuses the exact code paths that create/wire a
plugin; nothing new touches the config format. Untrusted community entries are
clearly labelled and never auto-trusted.

## non-goals

- No hosted marketplace backend — a data index + local resolver.
- No silent install of untrusted code — community plugins need explicit consent.
- No new config format — adopt writes the same config a human would.

## slices

### S1 — registry index + resolver

- **Status**: pending
- **Files**: `packages/core/src/lib/registry/resolve.ts`, `packages/core/src/lib/contracts/interfaces/plugin-registry.interface.ts`
- **Gate**: bun run validate

A first-party index (id → package, summary, tags, origin) + a pure resolver
with search/filter. Community sources are opt-in and labelled untrusted.

### S2 — plugin_add (install + wire + configure)

- **Status**: pending
- **Files**: `packages/core/src/lib/tools/plugin-add.tool.ts`, `packages/cli/src/commands/groups/plugin-add.ts`
- **Gate**: bun run validate

`plugin_add`/`mcpv plugin add` installs (existing installer), wires (f00120),
and adds to config/pack; consent required for community entries. Idempotent.

### S3 — registry browse surface + catalog

- **Status**: pending
- **Files**: `packages/core/src/lib/tools/plugin-search.tool.ts`, `apps/web/src/pages/`
- **Gate**: bun run validate

`plugin_search` + a web `/plugins` index; catalog/wiki.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`, `catalog:check`).
- `mcpv plugin add <first-party-id>` installs, wires, and configures it so
  `overview` lists it — with zero manual edits; re-running is a no-op.
- Community entries are labelled untrusted and require explicit consent.

## notes

Reuses the installer, f00120 wiring, and `configuration_center`. Pairs with
f00120 (create) and r00011 (packs). Prior art: npm, VS Code Marketplace,
MCP registries — but first-party-trusted and auto-wiring.
