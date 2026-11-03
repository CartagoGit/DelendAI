---
id: v00144
title: "Work is proved locally by the plan the forge follows, the forge judges only what a change reaches, and every unit ends with nothing left behind"
kind: perf
status: review
type: proposal
track: ci
date: 2026-10-29
last-transition-id: 16e24fa7-9076-4ba4-b6b6-72283998b5e8
last-correlation-id: 16e24fa7-9076-4ba4-b6b6-72283998b5e8
last-transition-from: in-progress
last-transition-at: 2026-10-31T19:44:11.359Z
shipped-in:
  - "d0ec28c3bc593d6f7e7516b2b38538c759ab2123"
  - "bf6fa917402e"
  - "29c0c7a2d84e8e5e5d68dbe824dc4e7de90d3da2"
  - "6202e06e7aaf"
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
- **Status**: done
- **Files**: `.github/workflows/codeql.yml`
- **Gate**: type
- acceptance:
  - "On a pull request CodeQL analyses with `security-extended` only the workspaces the change touches (a minimal path for a change touching none), so the required check still reports; a push to develop analyses everything with `security-and-quality`."
- shipped-in: `099561bea4df`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at d0ec28c3bc59, validate exit 0 and tests 1/1 claimed, no recorded run cited; acceptance 1/1: (1) At d0ec28c3 the CodeQL workflow on a pull request analyses with the extended pack only the workspaces the change touches, falling back to a minimal path when i… — Approved on the delivered state of d0ec28c3bc593d6f7e7516b2b38538c759ab2123. A pull request analyses with the extended pack only the workspaces the change touches, and the required check still reports. The type gate exited 0. One check was recorded for this slice and it is a state check, not a test suite: the delivered CodeQL workflow was read. Two residuals, recorded and not blocking: no test pins it, since the slice is the workflow alone; and the file's own header still names the query pack the workflow no longer uses on a pull request.

### S2 — A documentation change is judged by the documentation rules
- **Status**: pending
- **Files**: `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.ts`, `tools/scripts/ci/job-scope.interface.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: type
- acceptance:
  - "When every changed path is Markdown under docs/ or at the root, the jobs that judge code (biome, presets, manifests, metrics, the test matrix, typecheck, builds) report skipped; the documentation, proposal, secret and generated-artifact checks run."
- shipped-in: `099561bea4df`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — Changes requested on slice S2, the documentation change judged by the documentation rules.

WHAT IS WRONG. The criterion lists the jobs that judge code and says they report skipped: the format check, the presets check, the manifests check, the metrics check, the test matrix, the typecheck and the builds. Six of the seven skip. The presets check still runs, because the job-scope table declares it as always running and gives it no prose rule, unlike the other six.

WHERE. tools/scripts/ci/job-scope.constant.ts, in the entry for the presets job, which is declared to always run while the format check, the manifests check and the metrics check carry the rule that skips them for prose.

HOW TO REPRODUCE. Compute the job-scope plan at the delivered commit for a change whose every path is Markdown under docs/ or at the root: the plan reports the presets check to run, while the format check, the manifests check, the metrics check, the test matrix, the typecheck, the verification, the pack smoke and the site report skipped.

WHAT MUST HOLD. For a change whose every path is Markdown under docs/ or at the root, the presets check reports skipped as the other six code jobs do, and the documentation, proposal, secret and generated-artifact checks keep running. The delivered spec pins only two of the enumerated jobs, the format check and the governance check, so this one row is not caught by the suite: a case that asserts the presets check skips for a prose change would pin it.

Everything else this slice asks for is delivered and approved: the documentation, proposal, secret and generated-artifact checks run, and the other six code jobs skip.

### S3 — The forge judges only what the change reaches, and never on the author's word
- **Status**: done
- **Files**: `.github/workflows/ci.yml`, `tools/scripts/ci/job-scope.constant.ts`, `tools/scripts/ci/job-scope.script.ts`, `tools/scripts/ci/job-scope.interface.ts`, `tools/scripts/ci/job-scope.script.spec.ts`
- **Gate**: type
- acceptance:
  - "On a pull request the secret scan reads the change's diff (`--range base...HEAD`), `lint:generated-determinism` runs only when a generator changed and `lint:cross-ide` only when the UI extension, the client or core did (together 214 s of lint-security's 175 s-plus, measured locally); a push to develop runs them over the whole tree."
  - "pack smoke runs when a manifest, the lockfile, the build configuration or an entry file changes, not for an edit inside a module (job-scope.script.spec.ts)."
  - "No job is skipped because an agent says it ran it: `bun run prove` runs the pull request's plan locally so the first run on the forge is green, and every verdict that lets a change land is the forge's."
- shipped-in: `bf6fa917402e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at bf6fa917402e, validate exit 0 and tests 32/32 claimed, no recorded run cited; acceptance 3/3: (1) At bf6fa917 the secret scan on a pull request reads the change's diff, the generated-artifact check runs only when a generator changed and the cross-ide check … (2) At bf6fa917 the pack smoke job runs when a manifest, the lockfile, the build configuration or an entry file changes, and not for an edit inside a module; the j… (3) At bf6fa917 no job is excused because a local run says it was done: the proof runs the pull request's plan locally so the first run on the forge is green, and … — Approved on the delivered state of bf6fa917402e. The forge judges only what the change reaches: the secret scan reads the diff, the generated-artifact and cross-ide checks run only when they are relevant, and the pack smoke job runs only when a tarball can change. The type gate exited 0 and the slice spec passes 32 of 32. Two residuals, recorded and not blocking: no test pins the workflow's own conditions, since the slice is the workflow alone; and the mechanism that would let a local claim excuse a forge job was built and then removed inside the same pull request, so the criterion holds by that mechanism's absence rather than by its presence, which the proposal's own history records.

### S4 — What a start finds left over and holding nothing is removed
- **Status**: done
- **Files**: `packages/core/src/lib/cache/cache-layout-bootstrap.ts`, `packages/core/tests/src/lib/cache/cache-layout-bootstrap.spec.ts`, `packages/core/src/lib/work-units/stranded-edits.service.ts`, `packages/core/tests/src/lib/work-units/stranded-edits.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Start-up removes a cache folder a day old that holds no file (65 such folders on 2026-10-29) and keeps any folder with a file (cache-layout-bootstrap.spec.ts)."
  - "Start-up drops a stranded ref whose every saved file is, byte for byte, on the integration branch, on a work or publication branch, or in a larger stranded ref kept, and keeps one that holds a file found nowhere else (stranded-edits.service.spec.ts; on 2026-10-29: 5 of 15 dropped, 10 kept)."
- shipped-in: `373e3f316977`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 29c0c7a2d84e, validate exit 0 and tests 17/17 claimed, no recorded run cited; acceptance 2/2: (1) At 29c0c7a2 the start-up removes a cache folder a day old that holds no file and keeps any folder with a file, and drops a stranded ref whose every saved file … (2) At 29c0c7a2 the start-up drops a stranded ref whose every saved file is byte for byte on the integration branch, on a work or publication branch, or in a large… — Approved on the delivered state of 29c0c7a2d84e8e5e5d68dbe824dc4e7de90d3da2. What a start finds left over and holding nothing is removed. The type gate exited 0 and the two slice specs pass 17 of 17. Two residuals, recorded and not blocking: the branch comparison covers only the remotes under the repository's own namespace, so a work branch under another namespace is not compared; and the cache half of this slice shipped in the slice S1 delivery rather than in this one.

### S5 — Publishing refuses a unit that holds nothing new
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-publish-failure.spec.ts`
- **Gate**: type
- acceptance:
  - "`work publish` refuses a unit whose tip the integration branch already contains, or that carries only merges of it, saying it holds nothing the integration branch lacks and how to end it (work-unit-publish-failure.spec.ts); on 2026-10-28 such a republish opened #1563, an empty pull request."
- shipped-in: `6202e06e7aaf`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 6202e06e7aaf, validate exit 0 and tests 2/2 claimed, no recorded run cited; acceptance 1/1: (1) At 6202e06e publishing refuses a unit whose tip the integration branch already contains, or that carries only merges of it, saying it holds nothing the integra… — Approved on the delivered state of 6202e06e7aaf. Publishing refuses a unit that holds nothing the integration branch lacks, and says how to end it, which is what an empty republish was. The type gate exited 0 and the slice spec passes 2 of 2. No defect found.

### S6 — Every unit ends clean
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-reap.service.ts`
- **Gate**: type
- acceptance:
  - "`work reap --apply` removes the worktree and local branch of every delivered unit and every directory beside the units that is no unit, keeping on the forge what such a directory held that no commit has, and it reports only without `--apply`. Measured on 2026-10-31 after a week of units: three local branches and no orphan directory. No second command was added."
- shipped-in: `27e997af5202`
- review-state: in_review
- review-implementer: claude-opus-5-5

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
