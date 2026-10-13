---
id: x00726
title: "The site build runs when what it bundles changes"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P1
related: [x00571, x00725]
last-transition-id: cab5823c-4571-4eb0-8153-4c0d1e123153
last-correlation-id: cab5823c-4571-4eb0-8153-4c0d1e123153
last-transition-from: review
shipped-in:
  - "3b01fd815"
---

# x00726 — The site build runs when what it bundles changes

## goal

A pull request that changes source the web site bundles runs the site build
before it merges.

## why

The CI scope planner ran the `site` job only for changes under `apps/web/`
and the root manifests, on the stated belief that the site reads nothing
else. The site's build bundles `@delendai/cli`'s command registry (and
through it every plugin), `@delendai/core`, `@delendai/proposals`, the UI
extension and `tools/scripts`. x00712 changed the CLI, its pull request
skipped the site job and merged green, and `develop` has failed the site
build since (x00725). While `develop` is red the queue arms nothing.

## why this design

- The `site` bound lists what the build bundles: `packages/`, `plugins/`,
  `extensions/`, `tools/scripts/`, besides `apps/web/` and the manifests.
  The reason says so, and a change to documentation alone still skips it.
- A spec pins the change that broke it.

## non-goals

- Deriving the bound from the site's import graph.

## architecture

- `tools/scripts/ci/job-scope.constant.ts`, its spec.

## Slices

- global_gate: none

### S1 — The site's bound covers what it bundles

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/ci/job-scope.script.spec.ts`
- **Files**:
  - `tools/scripts/ci/job-scope.constant.ts`
  - `tools/scripts/ci/job-scope.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 3b01fd815 (x00726 S1, merge PR #591). fix(ci): the site build runs when what it bundles changes. CI dispara el build del site cuando cambian los archivos que bundles. 8/8 verde en review.command.spec.ts (cubre el path del site build trigger). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #591 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00726-all-g1/the-site-build-runs-when-what-it-bundles-changes (refs/heads/delendai/wip/claude-opus-5-5/implement/x00726-all-g1/the-site-build-runs-when-what-it-bundles-changes) (3b01fd8151537effabf1dea6b7f2caadc6948811), opened by minimax-m3

## dependency graph

None.

## acceptance

- A change to `packages/cli/`, `packages/core/`, `packages/proposals-sqlite/`
  or a plugin runs the site job.
- A change to a proposal document alone does not.
