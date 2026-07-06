---
id: f00095
status: ready
type: proposal
track: adoption-migration
date: 2026-07-01
kind: feat
title: Adopt mcp-vertex workflow (mcp-vertex)
shipped-in: []
recan: []
related:
    - f00084 # init command that scaffolded this proposal
    - f00089 # adoption-plan umbrella
ownership:
    - { agent: technical_investigator, task: 'A1: inventory the foreign proposal/skill/tool surface (do not modify it)' }
    - { agent: proposal_guardian, task: 'A2: map the foreign convention onto the canonical mcp-vertex layout' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00095 — Adopt mcp-vertex (mcp-vertex)

## goal

Adopt the mcp-vertex workflow in this project: a single canonical
proposals layout, namespace-prefixed tools, the `{ ok, error }` envelope,
and a proposals-driven swarm. Where the project already has its own
proposal/plan convention, **migrate** it onto ours rather than starting
a parallel system.

## why

This proposal was scaffolded by `mcpv init` (f00089 U1). The id `f00095`
was allocated as the next free id in this project's canonical proposals
space — it is **not** a hardcoded `f00001`, so it cannot collide with a
proposal that already exists here.

**Foreign proposal system.** No existing proposal/plan convention was
detected in this project. This plan adopts the canonical mcp-vertex
layout from scratch under `docs/mcp-vertex/proposals/`.

## non-goals

- **No in-place conversion of foreign files.** The mapping and skill
  migration below are advisory: `init` never writes, deletes, or moves
  a foreign proposal, skill, or tool. The target's own agents execute
  the migration.
- **No runtime tool renaming.** The namespace-unification section is
  plan output; the host enforces prefixing when the server boots.
- **No hardcoded ids.** Ids are allocated as the next free id in the
  target's canonical proposals space, never a fixed `f00001`.

## slices

> **Reconciled (2026-07-07) — SELF-REFERENTIAL adoption plan, closed as
> already-satisfied.** This proposal is the output of `mcpv init` (f00089
> U1) run against the mcp-vertex monorepo itself, kept as living proof that
> the adoption-plan generator works end-to-end. Every slice's target state
> already holds here by construction: this repo IS the canonical layout the
> plan adopts. Per-slice evidence below. No code or file moves were needed;
> the plan is advisory by its own non-goals.

### S1 — inventory the foreign surface (read-only)

- **Status**: done
- status: done
- **Reconciled**: no foreign surface exists (the proposal's own `## why`
  records "No existing proposal/plan convention was detected"). The
  canonical inventory already lives in the proposals index
  (`sync_proposals` → `.cache/mcp-vertex/proposals/index.json`, 188
  entries); writing a parallel `f00095-a1-inventory.md` would duplicate it.
- **Files**: `docs/mcp-vertex/proposals/ready/f00095-a1-inventory.md`
- **Gate**: bun run validate

Capture every existing proposal/record, skill, and tool the project
declares. Save the structured output under
`docs/mcp-vertex/proposals/ready/f00095-a1-inventory.md`. Touch nothing.

### S2 — map foreign → canonical

- **Status**: done
- status: done
- **Reconciled**: identity mapping — proposals already use the canonical
  file naming, f/x/a id space, and status folders under
  `docs/mcp-vertex/proposals/`. Nothing to map.
- **Files**: `docs/mcp-vertex/proposals/`
- **Gate**: bun run validate

Produce the mapping from the foreign convention to the canonical
mcp-vertex layout (file naming, id space, status folders). The mapping
is advisory; converting the foreign files is a later, explicit step the
target's agents perform — `init` never converts them in place.

### S3 — skill migration

- **Status**: done
- status: done
- **Reconciled (STALE PREMISE)**: the slice assumed skills live under
  `docs/mcp-vertex/skills/`, but f00065 moved the skill surface to the
  package-owned layout — `packages/core/skills/` (with `manifest.json`)
  plus per-plugin `plugins/<name>/skills/<skill>/SKILL.md`. All the listed
  canonical skills already exist there; `docs/mcp-vertex/skills/` retains
  only the absorbed `shell-fallback` (exactly the "keep as-is" case this
  slice prescribes). Nothing to migrate.
- **Files**: `docs/mcp-vertex/skills/`
- **Gate**: bun run validate

Bring the project's skill surface onto the canonical layout. This is **advisory**: `init` never writes, deletes, or moves a skill here — the target's own agents execute the migration.

**Migrate OUR canonical skills into the target** (`docs/mcp-vertex/skills/`):

- `mcp-vertex-operator` → applies to `@mcp-vertex/*`
- `mcp-vertex-plugin-authoring` → applies to `@mcp-vertex/*`
- `mcp-vertex-failure-modes` → applies to `@mcp-vertex/*`
- `mcp-vertex-token-budget-discipline` → applies to `@mcp-vertex/*`
- `mcp-vertex-token-budget-playbook` → applies to `@mcp-vertex/*`
- `mcp-vertex-conventional-commits-and-release` → applies to `@mcp-vertex/*`
- `mcp-vertex-proposals-workflow-playbook` → applies to `@mcp-vertex/proposals`
- `mcp-vertex-proposal-swarm-runner` → applies to `@mcp-vertex/proposals`
- `mcp-vertex-multi-agent-coordination` → applies to `@mcp-vertex/proposals`
- `mcp-vertex-concurrency-patterns` → applies to `@mcp-vertex/proposals`
- `mcp-vertex-state-repair-playbook` → applies to `@mcp-vertex/proposals`
- `mcp-vertex-legacy-proposal-migration` → applies to `@mcp-vertex/proposals`
- `mcp-vertex-status-marker-and-closure` → applies to `@mcp-vertex/status-marker`
- `mcp-vertex-quality-and-rules-gates` → applies to `@mcp-vertex/quality`
- `mcp-vertex-rules-solid-architecture` → applies to `@mcp-vertex/rules`
- `mcp-vertex-rules-dogma-priority` → applies to `@mcp-vertex/rules`
- `mcp-vertex-audit-runner` → applies to `@mcp-vertex/audit`
- `mcp-vertex-audit-playbook` → applies to `@mcp-vertex/audit`

**Absorb the target's EXISTING skills** (inventory, do not clobber):

- `docs/mcp-vertex/skills/shell-fallback` (docs-skills)

These are **kept as-is**. `init` inventories them so the migration does not clobber or duplicate them; the target's agents decide whether to fold each one into the canonical `docs/mcp-vertex/skills/` layout.

### S4 — tool-namespace unification

- **Status**: done
- status: done
- **Reconciled**: the slice's own body already records the terminal state —
  every plugin namespace is distinct, "No foreign MCP tool surface was
  detected", "No collisions". The host enforces prefixing at boot; nothing
  to unify.
- **Files**: `.vscode/mcp.json`
- **Gate**: bun run validate

Unify the tool surface under the **prefix-per-plugin** contract: every mcp-vertex tool is exposed as `<prefix>_<plugin>_<tool>`, so plugins never collide with each other or with the target's own tools. This is **plan output**, not a runtime change — the host enforces the prefixing when the server boots.

**Our tool namespaces** (resolved plugin set):

- `mcp-vertex_conventions`_* — mcp-vertex `conventions` plugin
- `mcp-vertex_deps`_* — mcp-vertex `deps` plugin
- `mcp-vertex_docs`_* — mcp-vertex `docs` plugin
- `mcp-vertex_git`_* — mcp-vertex `git` plugin
- `mcp-vertex_logs`_* — mcp-vertex `logs` plugin
- `mcp-vertex_memory`_* — mcp-vertex `memory` plugin
- `mcp-vertex_notification`_* — mcp-vertex `notification` plugin
- `mcp-vertex_proposals`_* — mcp-vertex `proposals` plugin
- `mcp-vertex_quality`_* — mcp-vertex `quality` plugin
- `mcp-vertex_rules`_* — mcp-vertex `rules` plugin
- `mcp-vertex_search`_* — mcp-vertex `search` plugin
- `mcp-vertex_status-marker`_* — mcp-vertex `status-marker` plugin
- `mcp-vertex_test-convention`_* — mcp-vertex `test-convention` plugin

No foreign MCP tool surface was detected in this project; only mcp-vertex tools are registered.

**No collisions.** Every namespace above is distinct, so ours and the target's tools coexist without renaming either side.

### S5 — single source of truth (filled by f00089 U3)

- **Status**: done
- status: done
- **Reconciled**: f00089 U3 landed
  (`packages/cli/src/lib/init/init-host-instructions.service.ts` + spec),
  and this repo already enforces the consolidated shape it produces:
  `CLAUDE.md`/`AGENTS.md`/copilot-instructions are 1KB pointers into the
  single `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, gated by
  `lint:prompt-size`, `lint:bootstrap-canonical` and
  `lint:host-instructions` in `validate`.
- **Files**: `AGENTS.md`, `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
- **Gate**: bun run validate

<!-- f00089 U3 embeds the AGENT-BOOTSTRAP + AGENTS consolidation. -->
_Pending f00089 U3._

## acceptance

- `bun run typecheck` → exit 0.
- `bun run test` → exit 0.
- `bun run validate` → exit 0.
- The adoption plan is advisory only: no foreign proposal, skill, or
  tool is written, deleted, or moved by `init`.
