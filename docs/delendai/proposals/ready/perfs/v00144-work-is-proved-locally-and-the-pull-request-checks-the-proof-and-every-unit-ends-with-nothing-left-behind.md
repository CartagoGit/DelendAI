---
id: v00144
title: "Work is proved locally and the pull request checks the proof, and every unit ends with nothing left behind"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# v00144 — Work is proved locally and the pull request checks the proof, and every unit ends with nothing left behind

## goal

Checks keep the project from drifting without becoming the work: a change is proved once, where it was made, by the plan CI would follow; the pull request confirms that proof and runs only what a proof cannot stand in for; a documentation change is judged by the documentation rules alone. When a unit ends, nothing of it is left: no worktree, no directory, no branch, no ref that holds nothing the integration branch or a publication lacks.

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

### S2 — A documentation change is judged by the documentation rules
- **Status**: pending
- **Files**: `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.ts`, `tools/scripts/ci/job-scope.interface.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: type
- acceptance:
  - "When every changed path is Markdown under docs/ or at the root, the jobs that judge code (biome, presets, manifests, metrics, the test matrix, typecheck, builds) report skipped; the documentation, proposal, secret and generated-artifact checks run."

### S3 — The pull request checks the local proof
- **Status**: pending
- **Files**: `tools/scripts/ci/prove-plan.script.ts`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "`bun run prove` records its verdict as a git note on the proved commit (tree, base, plan digest, steps and their results) and `work publish` pushes it; the pull request's `proof` job accepts it when the tree, the base and the plan match the pull request's, and the test matrix and typecheck then report skipped; without a valid proof they run as today."
  - "The integration branch's full run after each merge, and a re-run of one proved pull request in five chosen at random, keep a wrong or forged proof from going unnoticed; a proof found wrong is reported against its author."

### S4 — Every unit ends clean
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-gc.service.ts`
- **Gate**: type
- acceptance:
  - "`work gc` (also run when a unit is published, retired or claimed, and at start-up) removes worktree directories git does not know, `.orig` and other merge leftovers under the worktrees folder, local branches of ended units, stranded refs whose paths all reached develop, a unit or a publication, and retired refs older than 30 days whose tips develop contains; it lists what it removed and why, and never removes a ref holding work found nowhere else."
  - "`work publish` refuses to open a pull request whose tree equals the integration branch's, naming the merged pull request that already holds it."

## acceptance

- On a pull request CodeQL analyses with `security-extended` only the workspaces the change touches (a minimal path for a change touching none), so the required check still reports; a push to develop analyses everything with `security-and-quality`.
- When every changed path is Markdown under docs/ or at the root, the jobs that judge code (biome, presets, manifests, metrics, the test matrix, typecheck, builds) report skipped; the documentation, proposal, secret and generated-artifact checks run.
- `bun run prove` records its verdict as a git note on the proved commit (tree, base, plan digest, steps and their results) and `work publish` pushes it; the pull request's `proof` job accepts it when the tree, the base and the plan match the pull request's, and the test matrix and typecheck then report skipped; without a valid proof they run as today.
- The integration branch's full run after each merge, and a re-run of one proved pull request in five chosen at random, keep a wrong or forged proof from going unnoticed; a proof found wrong is reported against its author.
- `work gc` (also run when a unit is published, retired or claimed, and at start-up) removes worktree directories git does not know, `.orig` and other merge leftovers under the worktrees folder, local branches of ended units, stranded refs whose paths all reached develop, a unit or a publication, and retired refs older than 30 days whose tips develop contains; it lists what it removed and why, and never removes a ref holding work found nowhere else.
- `work publish` refuses to open a pull request whose tree equals the integration branch's, naming the merged pull request that already holds it.
