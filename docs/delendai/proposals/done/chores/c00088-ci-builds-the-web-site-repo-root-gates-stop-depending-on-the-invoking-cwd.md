---
id: c00088
title: "CI builds the web site; repo-root gates stop depending on the invoking cwd"
kind: chore
status: done
type: proposal
track: ci+gates
date: 2026-07-15
closed-by: legacy (pre-convention; consolidated pass 2026-07-26)
closed-evidence:
  - c00088 predates the shipped-in convention (pre-2026-07-24)
  - proposal body lists the original audit/fix/test deliverables
  - status was already 'done' before this consolidation pass
---

# c00088 — CI builds the web site; repo-root gates stop depending on the invoking cwd

## Goal

Two honesty gaps in where gates run: (1) CI never executes `bun run site` — astro-check (lint:web) provably misses build-only resolution failures, and the web build has broken twice (04b13fcb vite alias shadowing, 7dae147b f00102 five-way breakage) with validate green both times; add a CI job that builds the site. (2) Two tools-project specs (style-integrity, system-prompt-size) fail when vitest runs from tools/ instead of the repo root because they resolve fixtures via cwd-relative paths — resolve via the repo root helper instead so the suite is invocation-independent.

## why

a00055 F-2/F-3. Evidence: .github/workflows/ci.yml runs lint/typecheck/test:coverage/build/smoke/metrics but never `bun run site`; memory records both historical build-only breakages. The cwd-sensitivity reproduced live this session: `cd tools && bun vitest run` fails style-integrity.script.spec.ts ("../apps/web/src/components/…") and system-prompt-size.script.spec.ts ("AGENTS.md is tracked but missing") while the root runner passes 463/463.

## non-goals

- No validate-chain slowdown: the site build lands in CI (parallel job), not in the local validate.
- No Pagefind/link-checking scope creep — build success is the gate.

## Slices

- global_gate: e2e

### S1 — CI job: build the web site on push/PR to main+develop
- **Status**: done
- **Files**: `.github/workflows/ci.yml`
- **Gate**: lint
- acceptance:
  - "A `site` job (bun install --frozen-lockfile + bun run site) runs alongside validate for both branches; artifact upload optional."

### S2 — cwd-robust tools specs: resolve fixtures from the repo root helper
- **Status**: done
- **Files**: `tools/scripts/lint/style-integrity.script.spec.ts`, `tools/scripts/lint/system-prompt-size.script.spec.ts`
- **Gate**: e2e
- acceptance:
  - "`cd tools && bun vitest run` passes both specs; the root runner stays green (463+/463+)."

## acceptance

- A `site` job (bun install --frozen-lockfile + bun run site) runs alongside validate for both branches; artifact upload optional.
- `cd tools && bun vitest run` passes both specs; the root runner stays green (463+/463+).
