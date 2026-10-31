---
id: v00144
title: "Work is proved locally by the plan the forge follows, the forge judges only what a change reaches, and every unit ends with nothing left behind"
kind: perf
status: in-progress
type: proposal
track: ci
date: 2026-10-29
last-transition-id: 1dce85fa-7b21-4d0d-9cb2-81355e0f44d0
last-correlation-id: 1dce85fa-7b21-4d0d-9cb2-81355e0f44d0
last-transition-from: ready
last-transition-at: 2026-10-31T19:40:00.989Z
---

# v00144 — Work is proved locally by the plan the forge follows, the forge judges only what a change reaches, and every unit ends with nothing left behind

## goal

Checks keep the project from drifting without becoming the work: a change is proved where it was made by the plan CI will follow, so the forge's run is green the first time; the forge runs only what the change reaches, and lets nothing land on an agent's word; a documentation change is judged by the documentation rules alone. When a unit ends, nothing of it is left: no worktree, no directory, no branch, no ref that holds nothing the integration branch or a publication lacks.

## why

The owner, on 2026-10-29: the checks exist so the project does not run wild, and when the checks themselves make the work slow they defeat their purpose; delendai exists so swarms can work and save tokens. Measured on 2026-10-28 (v00142, v00143 hold the numbers): a pull request's wall time is its slowest job, and that job is CodeQL, 312 s, analysing the whole repository with `security-and-quality` on every pull request (`.github/workflows/codeql.yml`); every lint job is declared `always` in `job-scope.constant.ts`, so a one-file Markdown change ran 38 jobs; and the same plan was run twice, once by the agent and once by the forge.

The same day the repository held, besides live work: two worktree directories git no longer knew, a detached `f00794-ci` worktree, two `.orig` merge backups in `.cache/delendai/.worktrees/`, local branches of units that ended, 15 `refs/delendai/stranded/*` (8 that morning), 29 `refs/delendai/retired/*` on the forge with no expiry, and a second, empty pull request (#1563) opened by republishing a unit whose first one had merged.

## non-goals

- Weakening the integration branch's own full run, which still runs every check after each merge and stops the queue when red.
- Deleting work that exists nowhere else.

## slices

- global_gate: type

### S1 — A pull request runs a scoped CodeQL
- **Status**: pending
- **Files**: `.github/workflows/codeql.yml`
- **Gate**: type
- acceptance:
  - "On a pull request CodeQL analyses with `security-extended` only the workspaces the change touches (a minimal path for a change touching none), so the required check still reports; a push to develop analyses everything with `security-and-quality`."
- shipped-in: `099561bea4df`

### S2 — A documentation change is judged by the documentation rules
- **Status**: pending
- **Files**: `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.ts`, `tools/scripts/ci/job-scope.interface.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: type
- acceptance:
  - "When every changed path is Markdown under docs/ or at the root, the jobs that judge code (biome, presets, manifests, metrics, the test matrix, typecheck, builds) report skipped; the documentation, proposal, secret and generated-artifact checks run."
- shipped-in: `099561bea4df`

### S3 — The forge judges only what the change reaches, and never on the author's word
- **Status**: pending
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.ts`, `tools/scripts/ci/job-scope.interface.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: type
- acceptance:
  - "On a pull request the secret scan reads the change's diff (`--range base...HEAD`), `lint:generated-determinism` runs only when a generator changed and `lint:cross-ide` only when the UI extension, the client or core did (together 214 s of lint-security's 175 s-plus, measured locally); a push to develop runs them over the whole tree."
  - "pack smoke runs when a manifest, the lockfile, the build configuration or an entry file changes, not for an edit inside a module (job-scope.script.spec.ts)."
  - "No job is skipped because an agent says it ran it: `bun run prove` runs the pull request's plan locally so the first run on the forge is green, and every verdict that lets a change land is the forge's."
- shipped-in: `bf6fa917402e`

### S4 — What a start finds left over and holding nothing is removed
- **Status**: pending
- **Files**: `packages/core/src/lib/cache/cache-layout-bootstrap.ts`, `packages/core/tests/src/lib/cache/cache-layout-bootstrap.spec.ts`, `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/tests/src/lib/work-units/stranded-edits.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Start-up removes a cache folder a day old that holds no file (65 such folders on 2026-10-29) and keeps any folder with a file (cache-layout-bootstrap.spec.ts)."
  - "Start-up drops a stranded ref whose every saved file is, byte for byte, on the integration branch, on a work or publication branch, or in a larger stranded ref kept, and keeps one that holds a file found nowhere else (stranded-edits.service.spec.ts; on 2026-10-29: 5 of 15 dropped, 10 kept)."
- shipped-in: `373e3f316977`

### S5 — Publishing refuses a unit that holds nothing new
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-publish-failure.spec.ts`
- **Gate**: type
- acceptance:
  - "`work publish` refuses a unit whose tip the integration branch already contains, or that carries only merges of it, saying it holds nothing the integration branch lacks and how to end it (work-unit-publish-failure.spec.ts); on 2026-10-28 such a republish opened #1563, an empty pull request."
- shipped-in: `6202e06e7aaf`

### S6 — Every unit ends clean
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-reap.service.ts`
- **Gate**: type
- acceptance:
  - "`work reap --apply` removes the worktree and local branch of every delivered unit and every directory beside the units that is no unit, keeping on the forge what such a directory held that no commit has, and it reports only without `--apply`. Measured on 2026-10-31 after a week of units: three local branches and no orphan directory. No second command was added."
- shipped-in: `27e997af5202`

## acceptance

- On a pull request CodeQL analyses with `security-extended` only the workspaces the change touches (a minimal path for a change touching none), so the required check still reports; a push to develop analyses everything with `security-and-quality`.
- When every changed path is Markdown under docs/ or at the root, the jobs that judge code (biome, presets, manifests, metrics, the test matrix, typecheck, builds) report skipped; the documentation, proposal, secret and generated-artifact checks run.
- On a pull request the secret scan reads the change's diff (`--range base...HEAD`), `lint:generated-determinism` runs only when a generator changed and `lint:cross-ide` only when the UI extension, the client or core did (together 214 s of lint-security's 175 s-plus, measured locally); a push to develop runs them over the whole tree.
- pack smoke runs when a manifest, the lockfile, the build configuration or an entry file changes, not for an edit inside a module (job-scope.script.spec.ts).
- No job is skipped because an agent says it ran it: `bun run prove` runs the pull request's plan locally so the first run on the forge is green, and every verdict that lets a change land is the forge's.
- Start-up removes a cache folder a day old that holds no file (65 such folders on 2026-10-29) and keeps any folder with a file (cache-layout-bootstrap.spec.ts).
- Start-up drops a stranded ref whose every saved file is, byte for byte, on the integration branch, on a work or publication branch, or in a larger stranded ref kept, and keeps one that holds a file found nowhere else (stranded-edits.service.spec.ts; on 2026-10-29: 5 of 15 dropped, 10 kept).
- `work publish` refuses a unit whose tip the integration branch already contains, or that carries only merges of it, saying it holds nothing the integration branch lacks and how to end it (work-unit-publish-failure.spec.ts); on 2026-10-28 such a republish opened #1563, an empty pull request.
- `work reap --apply` removes the worktree and local branch of every delivered unit and every directory beside the units that is no unit, keeping on the forge what such a directory held that no commit has, and it reports only without `--apply`. Measured on 2026-10-31 after a week of units: three local branches and no orphan directory. No second command was added.
