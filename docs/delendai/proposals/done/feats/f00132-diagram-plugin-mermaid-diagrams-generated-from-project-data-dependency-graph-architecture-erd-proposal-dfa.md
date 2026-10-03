---
id: f00132
kind: feat
title: diagram plugin — mermaid diagrams generated from project data (dependency graph, architecture, ERD, proposal DFA)
status: done
date: 2026-07-23
track: plugin+diagram+docs
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 5 commits referencing f00132 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 5-commit batch
shipped-in:
  - 96113266 # fix(f00132 + agent-lock): propagate mutex options + mkdir for tmp dirs
  - 7187e2a3 # fix(diagram): wire into standard preset + mark S3 done
  - bc937a95 # feat(f00132): S2 — diagram_erd passthrough + diagram_proposals DFA
  - 854b4d7d # feat(f00132): S1 — diagram_modules + diagram-graph tool (deps + modules)
  - c755f263 # feat(diagram): new diagram plugin — workspace dependency graph as mermaid (f0013
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

- **Status**: done
- **Files**: `plugins/diagram/src/lib/graph/`, `plugins/diagram/src/lib/tools/diagram-graph.tool.ts`
- **Gate**: bun run validate

`diagram_deps` and `diagram_modules` emit mermaid from `deps` output / a module
scan. Pure generators; deterministic output.

### S2 — ERD passthrough + proposal DFA graph

- **Status**: done
- **Files**: `plugins/diagram/src/lib/erd/`, `plugins/diagram/src/lib/tools/diagram-proposals.tool.ts`
- **Gate**: bun run validate

`diagram_erd` (from f00128 schema) and `diagram_proposals` (the proposal
status DFA + current counts). Pure over injected data.

### S3 — catalog + site embedding

- **Status**: done
- **Files**: `plugins/diagram/README.md`, `packages/core/src/lib/plugins/preset-catalog.ts`
- **Gate**: bun run validate

Catalog + wiki; diagram now in `standard` preset; optional embed of the
generated diagrams into the docs site.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Emits valid mermaid for the repo dependency graph and the proposal DFA.
- Output is deterministic (stable ordering) for snapshot testing.

## notes

Reuses `deps`, `database` (f00128), and the proposal index. Prior art:
mermaid, dependency-cruiser, Structurizr. Mermaid renders natively in
artifacts and the docs site.
