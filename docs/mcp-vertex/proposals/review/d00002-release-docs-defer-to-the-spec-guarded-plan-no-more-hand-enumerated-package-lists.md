---
id: d00002
title: "Release docs defer to the spec-guarded plan — no more hand-enumerated package lists"
kind: docs
status: review
type: proposal
track: release+docs
date: 2026-07-15
---

# d00002 — Release docs defer to the spec-guarded plan — no more hand-enumerated package lists

## Goal

The npm-publish prose drifted from the pipeline: NPM_PUBLISH.md hand-enumerates 17 of the 24 publishable packages (missing cache, conventions, external-mcps, issues, orchestrator-runner, test-policy, usage-tracking) and release.yml's comments still say "10 packages" (x2). The pipeline itself is correct and spec-guarded (release-plan.ts PUBLISH_ORDER, release-plan.spec derives the expected set from presets+docs). Replace the manual per-package `cd && npm publish` ladder with the canonical `bun run release --publish` flow (dry-run first to see the plan), and fix the stale counts so the docs can never rot this way again — the command, not the prose, owns the list.

## why

a00055-adjacent npm-readiness review (2026-07-15): the user's publish decision is gated on trusting the docs; a guide that misses 7 packages would produce a broken partial publish if followed literally. Evidence: docs/mcp-vertex/NPM_PUBLISH.md:100-121 (17 cd-ladder entries), .github/workflows/release.yml:7,59 ("10 packages").

## non-goals

- No workflow behaviour changes — release.yml's run line already delegates to the dynamic script.
- No publishing — that stays the user's operational call (NPM_TOKEN + org + develop→main).

## Slices

- global_gate: lint

### S1 — Guide + workflow prose defer to the canonical release command
- **Status**: done
- **Files**: `docs/mcp-vertex/NPM_PUBLISH.md`, `.github/workflows/release.yml`
- **Gate**: lint
- acceptance:
  - "NPM_PUBLISH.md's publish section is the canonical `bun run release` (dry-run) + `bun run release --set/--write --publish` flow, with the package COUNT stated as derived from release-plan.ts and no hand-enumerated ladder."
  - "release.yml comments no longer claim a hardcoded package count."
  - "bun run validate's lint gates stay green."

## acceptance

- NPM_PUBLISH.md's publish section is the canonical `bun run release` (dry-run) + `bun run release --set/--write --publish` flow, with the package COUNT stated as derived from release-plan.ts and no hand-enumerated ladder.
- release.yml comments no longer claim a hardcoded package count.
- bun run validate's lint gates stay green.
