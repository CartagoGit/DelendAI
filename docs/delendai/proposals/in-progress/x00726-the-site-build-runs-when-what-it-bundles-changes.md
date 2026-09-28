---
id: x00726
title: "The site build runs when what it bundles changes"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P1
related: [x00571, x00725]
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

- **Status**: in-progress
- **Gate**: `npx vitest run tools/scripts/ci/job-scope.script.spec.ts`
- **Files**:
  - `tools/scripts/ci/job-scope.constant.ts`
  - `tools/scripts/ci/job-scope.script.spec.ts`

## dependency graph

None.

## acceptance

- A change to `packages/cli/`, `packages/core/`, `packages/proposals-sqlite/`
  or a plugin runs the site job.
- A change to a proposal document alone does not.
