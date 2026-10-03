---
id: f00137
kind: feat
title: skills pack — debugging, performance, security-hardening, incident-response, pr-review and migration playbooks
status: done
date: 2026-07-23
track: plugin+skills+process
shipped-in:
    - 7dbf9166 # feat(f00137): skills-pack plugin - 6 playbooks + wiring
---

# f00137 — skills pack

## goal

A pack of **skills** (structured markdown playbooks) shipped through the
existing skills surface: `debugging-playbook`, `performance-optimization`,
`security-hardening-checklist`, `incident-response`, `pr-review-checklist`, and
`migrate-from-<X>`. Auto-available via the packs (r00011); zero setup.

## why

Skills are the cheapest capability to add (guidance, no code) and they encode
the project's hard-won process so every agent follows it. Dogfooding: the
repo's own debugging and PR-review discipline becomes reusable, consistent
guidance instead of tribal knowledge.

## why this design

Use the existing skills loader (`load-skills` / `assemble-skills`); each skill
is a structured playbook (goal → steps → checks → exit criteria) with **no
code and no execution** — pure guidance that points at the real gated tools.
Reuse the shape of the existing legacy-migration skill. Pack membership makes
the right skills appear for the right project type.

## non-goals

- No executable code or auto-remediation — skills are guidance.
- No replacement for the gated tools — skills orchestrate them, humanly.
- No project-specific secrets or hardcoded paths in the playbooks.

## slices

### S1 — core dev playbooks

- **Status**: done
- **Files**: `plugins/skills-pack/skills/debugging-playbook/SKILL.md`, `plugins/skills-pack/skills/pr-review-checklist/SKILL.md`
- **Gate**: bun run validate

`debugging-playbook`, `performance-optimization`, `pr-review-checklist` —
each referencing the relevant tools (logs, perf, quality, git/forge).

### S2 — safety playbooks

- **Status**: done
- **Files**: `plugins/skills-pack/skills/security-hardening-checklist/SKILL.md`, `plugins/skills-pack/skills/incident-response/SKILL.md`
- **Gate**: bun run validate

`security-hardening-checklist` (pairs with f00122), `incident-response`
(pairs with observability f00129 + logs).

### S3 — migration playbooks + pack wiring

- **Status**: done
- **Files**: `plugins/skills-pack/skills/migrate-from-x/SKILL.md`, `plugins/skills-pack/src/index.ts`
- **Gate**: bun run validate

`migrate-from-<X>` (extends the legacy-migration skill); register all skills +
pack membership; catalog.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- The skills load and appear in the skill catalog/overview.
- Each playbook references only real, shipped tools (no dangling capability).

## notes

Reuses the skills loader + legacy-migration skill pattern. Pairs with f00122
(security), f00126 (perf), f00129 (observability).

## implementation

Implemented as a pure-guidance plugin under `plugins/skills-pack/` with six
canonical skill bodies under `plugins/skills-pack/skills/**`, typed public
descriptors, plugin registration through `register().skills`, and additive
monorepo wiring through aliases, preset/default catalogs, release ordering, and
the versioned skill manifest.
