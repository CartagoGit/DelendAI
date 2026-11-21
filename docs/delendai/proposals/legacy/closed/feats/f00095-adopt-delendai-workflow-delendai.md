---
id: f00095
status: done
type: proposal
track: adoption-migration
date: 2026-07-01
kind: feat
title: Adopt delendai workflow (delendai)
shipped-in: []
recan: []
related:
    - f00084 # init command that scaffolded this proposal
    - f00089 # adoption-plan umbrella
ownership:
    - { agent: technical_investigator, task: 'A1: inventory the foreign proposal/skill/tool surface (do not modify it)' }
    - { agent: proposal_guardian, task: 'A2: map the foreign convention onto the canonical delendai layout' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run validate, expect: exit0 }

archived-on: 2026-08-31
---

# f00095 — Adopt delendai (delendai)

## goal

Adopt the delendai workflow in this project: a single canonical
proposals layout, namespace-prefixed tools, the `{ ok, error }` envelope,
and a proposals-driven swarm. Where the project already has its own
proposal/plan convention, **migrate** it onto ours rather than starting
a parallel system.

## why

This proposal was scaffolded by `delendai init` (f00089 U1). The id `f00095`
was allocated as the next free id in this project's canonical proposals
space — it is **not** a hardcoded `f00001`, so it cannot collide with a
proposal that already exists here.

**Foreign proposal system.** No existing proposal/plan convention was
detected in this project. This plan adopts the canonical delendai
layout from scratch under `docs/delendai/proposals/`.

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
> already-satisfied.** This proposal is the output of `delendai init` (f00089
> U1) run against the delendai monorepo itself, kept as living proof that
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
  (`sync_proposals` → `.cache/delendai/proposals/index.json`, 188
  entries); writing a parallel `f00095-a1-inventory.md` would duplicate it.
- **Files**: `docs/delendai/proposals/ready/f00095-a1-inventory.md`
- **Gate**: bun run validate

Capture every existing proposal/record, skill, and tool the project
declares. Save the structured output under
`docs/delendai/proposals/ready/f00095-a1-inventory.md`. Touch nothing.

### S2 — map foreign → canonical

- **Status**: done
- status: done
- **Reconciled**: identity mapping — proposals already use the canonical
  file naming, f/x/a id space, and status folders under
  `docs/delendai/proposals/`. Nothing to map.
- **Files**: `docs/delendai/proposals/`
- **Gate**: bun run validate

Produce the mapping from the foreign convention to the canonical
delendai layout (file naming, id space, status folders). The mapping
is advisory; converting the foreign files is a later, explicit step the
target's agents perform — `init` never converts them in place.

### S3 — skill migration

- **Status**: done
- status: done
- **Reconciled (STALE PREMISE)**: the slice assumed skills live under
  `docs/delendai/skills/`, but f00065 moved the skill surface to the
  package-owned layout — `packages/core/skills/` (with `manifest.json`)
  plus per-plugin `plugins/<name>/skills/<skill>/SKILL.md`. All the listed
  canonical skills already exist there; `docs/delendai/skills/` retains
  only the absorbed `shell-fallback` (exactly the "keep as-is" case this
  slice prescribes). Nothing to migrate.
- **Files**: `docs/delendai/skills/`
- **Gate**: bun run validate

Bring the project's skill surface onto the canonical layout. This is **advisory**: `init` never writes, deletes, or moves a skill here — the target's own agents execute the migration.

**Migrate OUR canonical skills into the target** (`docs/delendai/skills/`):

- `delendai-operator` → applies to `@delendai/*`
- `delendai-plugin-authoring` → applies to `@delendai/*`
- `delendai-failure-modes` → applies to `@delendai/*`
- `delendai-token-budget-discipline` → applies to `@delendai/*`
- `delendai-token-budget-playbook` → applies to `@delendai/*`
- `delendai-conventional-commits-and-release` → applies to `@delendai/*`
- `delendai-proposals-workflow-playbook` → applies to `@delendai/proposals`
- `delendai-proposal-swarm-runner` → applies to `@delendai/proposals`
- `delendai-multi-agent-coordination` → applies to `@delendai/proposals`
- `delendai-concurrency-patterns` → applies to `@delendai/proposals`
- `delendai-state-repair-playbook` → applies to `@delendai/proposals`
- `delendai-legacy-proposal-migration` → applies to `@delendai/proposals`
- `delendai-status-marker-and-closure` → applies to `@delendai/status-marker`
- `delendai-quality-and-rules-gates` → applies to `@delendai/quality`
- `delendai-rules-solid-architecture` → applies to `@delendai/rules`
- `delendai-rules-dogma-priority` → applies to `@delendai/rules`
- `delendai-audit-runner` → applies to `@delendai/audit`
- `delendai-audit-playbook` → applies to `@delendai/audit`

**Absorb the target's EXISTING skills** (inventory, do not clobber):

- `docs/delendai/skills/shell-fallback` (docs-skills)

These are **kept as-is**. `init` inventories them so the migration does not clobber or duplicate them; the target's agents decide whether to fold each one into the canonical `docs/delendai/skills/` layout.

### S4 — tool-namespace unification

- **Status**: done
- status: done
- **Reconciled**: the slice's own body already records the terminal state —
  every plugin namespace is distinct, "No foreign MCP tool surface was
  detected", "No collisions". The host enforces prefixing at boot; nothing
  to unify.
- **Files**: `.vscode/mcp.json`
- **Gate**: bun run validate

Unify the tool surface under the **prefix-per-plugin** contract: every delendai tool is exposed as `<prefix>_<plugin>_<tool>`, so plugins never collide with each other or with the target's own tools. This is **plan output**, not a runtime change — the host enforces the prefixing when the server boots.

**Our tool namespaces** (resolved plugin set):

- `delendai_conventions`_* — delendai `conventions` plugin
- `delendai_deps`_* — delendai `deps` plugin
- `delendai_docs`_* — delendai `docs` plugin
- `delendai_git`_* — delendai `git` plugin
- `delendai_logs`_* — delendai `logs` plugin
- `delendai_memory`_* — delendai `memory` plugin
- `delendai_notification`_* — delendai `notification` plugin
- `delendai_proposals`_* — delendai `proposals` plugin
- `delendai_quality`_* — delendai `quality` plugin
- `delendai_rules`_* — delendai `rules` plugin
- `delendai_search`_* — delendai `search` plugin
- `delendai_status-marker`_* — delendai `status-marker` plugin
- `delendai_test-convention`_* — delendai `test-convention` plugin

No foreign MCP tool surface was detected in this project; only delendai tools are registered.

**No collisions.** Every namespace above is distinct, so ours and the target's tools coexist without renaming either side.

### S5 — single source of truth (filled by f00089 U3)

- **Status**: done
- status: done
- **Reconciled**: f00089 U3 landed
  (`packages/cli/src/lib/init/init-host-instructions.service.ts` + spec),
  and this repo already enforces the consolidated shape it produces:
  `CLAUDE.md`/`AGENTS.md`/copilot-instructions are 1KB pointers into the
  single `docs/delendai/AGENT-BOOTSTRAP.md`, gated by
  `lint:prompt-size`, `lint:bootstrap-canonical` and
  `lint:host-instructions` in `validate`.
- **Files**: `AGENTS.md`, `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: bun run validate

<!-- f00089 U3 embeds the AGENT-BOOTSTRAP + AGENTS consolidation. -->
_Pending f00089 U3._

## acceptance

- `bun run typecheck` → exit 0.
- `bun run test` → exit 0.
- `bun run validate` → exit 0.
- The adoption plan is advisory only: no foreign proposal, skill, or
  tool is written, deleted, or moved by `init`.
