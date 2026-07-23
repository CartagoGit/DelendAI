---
id: f00132
kind: feat
title: diagram plugin — mermaid diagrams generated from project data (dependency graph, architecture, ERD, proposal DFA)
status: ready
date: 2026-07-23
track: plugin+diagram+docs
---

# f00132 — diagram plugin

## goal

A `diagram` plugin that renders **mermaid** diagrams from data mcp-vertex
already has: the **dependency graph** (from `deps`), a **module/architecture**
graph, a **DB ERD** (from `database`, f00128), and the **proposal DFA** state
graph — so structure is visual and embeddable (mermaid renders natively in the
docs site and in artifacts).

## why

Diagrams-from-code aid comprehension, and this project holds rich structured
data (deps, proposal state machine, plugin graph) that is currently text-only.
Dogfooding: visualise this monorepo's plugin/dependency graph and the proposal
DFA — the very structures agents reason about here.

## why this design

Pure **data→mermaid generators** over the outputs of existing plugins (deps
graph, database ERD, proposal index). No rendering engine is needed — mermaid
is text and the site/artifacts render it — so the plugin stays a set of pure
functions with zero heavy dependencies. It **consumes** existing plugins rather
than adding a new data source.

## non-goals

- No image rasterization service and no bundled renderer.
- No new data source — it visualizes what other plugins already produce.
- No layout tuning beyond mermaid's defaults.

## slices

### S1 — dependency + module graph

- **Status**: pending
- **Files**: `plugins/diagram/src/lib/graph/`, `plugins/diagram/src/lib/tools/diagram-graph.tool.ts`
- **Gate**: bun run validate

`diagram_deps` and `diagram_modules` emit mermaid from `deps` output / a module
scan. Pure generators; deterministic output.

### S2 — ERD passthrough + proposal DFA graph

- **Status**: pending
- **Files**: `plugins/diagram/src/lib/erd/`, `plugins/diagram/src/lib/tools/diagram-proposals.tool.ts`
- **Gate**: bun run validate

`diagram_erd` (from f00128 schema) and `diagram_proposals` (the proposal
status DFA + current counts). Pure over injected data.

### S3 — catalog + site embedding

- **Status**: pending
- **Files**: `plugins/diagram/README.md`, `apps/web/src/pages/`
- **Gate**: bun run validate

Catalog + wiki; optional embed of the generated diagrams into the docs site.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Emits valid mermaid for the repo dependency graph and the proposal DFA.
- Output is deterministic (stable ordering) for snapshot testing.

## notes

Reuses `deps`, `database` (f00128), and the proposal index. Prior art:
mermaid, dependency-cruiser, Structurizr. Mermaid renders natively in
artifacts and the docs site.
