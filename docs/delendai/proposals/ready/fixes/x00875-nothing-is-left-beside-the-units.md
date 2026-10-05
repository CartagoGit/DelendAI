---
id: x00875
title: "Nothing is left beside the units"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-05
---

# x00875 — Nothing is left beside the units

## goal

A finished run leaves nothing beside its units: no directory that is no unit, no retired tip nobody will read again, no closed slice whose code never landed. And two agents writing two different proposals do not collide.

## why

Found on 2026-10-05, reading what the last runs left behind.

- **A new proposal was a slice somebody held.** A unit entered for a proposal not yet written is named `new-all`. A pull request creating one proposal was open, and `work enter --kind=create --proposal=new` for another was refused: "new all is already being worked on by another agent". The placeholder names no proposal; the two agents were writing different documents.
- **Three directories in the units' folder were no unit.** `git worktree list` named none of them and neither did `work doctor`. Two held caches written after their worktree was removed. The third (273 MB) held a whole checkout an agent had made inside another unit's cache, its link to the repository gone, with files differing from every commit.
- **Eleven works of September were kept and never read.** They were rescued from unreachable commits to `refs/delendai/retired/rescued-2026-10-04/`. Read against `develop`: nine were replaced or landed under other names. Two held code that never landed:
  - `f00507` S4 is `done` and names `selection-explain.ts`. The file is not on `develop`; a selection carried reasons but not the parts of its score, nor the routes it discarded.
  - A guard that stops a build writing a state database a newer build wrote. Without it the migration sweep sees every file it ships as applied, reports success, and the older runtime writes a schema it does not know.
- **Retired work could only grow.** There was no way to say "read, and it is nothing", so the list kept every tip for ever.

## non-goals

- Stopping whatever writes into a removed worktree's path. A validation still running or a server started there cannot be told; the reap that already runs after every merge removes what they leave.
- Reviving the gentle-ai bridge (`f00501`). It was removed on purpose on 2026-09-07 in favour of native host capabilities.
- A separate `schema-ahead` state for startup. The refusal is reported through the existing `unreadable` state with the sentence that says what to install.

## slices

- global_gate: none

### S1 — A proposal not yet written holds nobody out
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/slice-holders.service.ts`, `packages/core/src/lib/work-units/unit-proposal.constant.ts`, `packages/core/src/lib/work-units/unit-adoption.service.ts`, `packages/core/tests/src/lib/work-units/slice-holders.service.spec.ts`
- **Gate**: `bunx vitest run --root packages/core tests/src/lib/work-units/slice-holders.service.spec.ts`
- `holdersOfSlice` returns nobody for the placeholder proposal `new`: each agent under it writes its own document, and the unit takes the proposal's id as soon as it is allocated.

### S2 — A directory beside the units that is no unit is reaped
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/worktree-husks.service.ts`, `packages/core/src/lib/work-units/units-directory.constant.ts`, `packages/core/src/lib/contracts/interfaces/worktree-husks.interface.ts`, `packages/core/src/lib/work-units/work-unit-reap.service.ts`, `packages/core/src/lib/work-units/workflow-doctor.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/tests/src/lib/work-units/worktree-husks.service.spec.ts`
- **Gate**: `bunx vitest run --root packages/core tests/src/lib/work-units/worktree-husks.service.spec.ts`
- `work doctor` gains `no-husk-directories`: every directory in the units' folder is a registered worktree. A directory written to within one lease window is not counted, so a unit being created is never reported.
- `work reap` reports husks, and with `--apply` removes them. First, the husk and every checkout found inside it are read as git would read them, under the repository's ignore rules. A tree no commit of this clone has is committed and pushed to `refs/<namespace>/retired/husk/<name>`; only then is the directory removed. A husk git cannot read, or whose files the forge does not take, stays and says why.

### S3 — A route selection explains itself
- **Status**: review
- **Files**: `plugins/auto-agent-selector/src/lib/routing/selection-explain.service.ts`, `plugins/auto-agent-selector/src/lib/contracts/interfaces/selection-explain.interface.ts`, `plugins/auto-agent-selector/src/lib/routing/economic-preference.ts`, `plugins/auto-agent-selector/src/public/index.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/selection-explain.service.spec.ts`
- **Gate**: `bunx vitest run --root plugins/auto-agent-selector tests/src/lib/routing`
- Ported from the rescued commit `fa510753d` and reshaped to today's conventions. A ranked route keeps the parts of its score (`qualityEvidence`, `alreadyPaidBonus`, `scarcityPenalty`, `headroomTiebreak`, `total`); `explainSelection` names the chosen route, every discarded one with its reasons, and the fallback order.
- `f00507` S4 now names the files that shipped.

### S4 — A build refuses to write a database a newer build wrote
- **Status**: review
- **Files**: `packages/proposals-sqlite/src/lib/schema-guard.service.ts`, `packages/proposals-sqlite/src/lib/schema-guard.interface.ts`, `packages/proposals-sqlite/src/lib/schema-guard.service.spec.ts`, `packages/proposals-sqlite/src/lib/sqlite-driver.ts`, `packages/proposals-sqlite/src/lib/work-model/startup-state-ports.ts`, `packages/proposals-sqlite/src/index.ts`
- **Gate**: `bun test --timeout 30000 packages/proposals-sqlite/src/lib/schema-guard.service.spec.ts packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
- Ported from the rescued commit `ce0c35eec`. A writable open of a database whose recorded schema version is above the build's throws `SchemaAheadOfRuntimeError` before the migration sweep and before `user_version` is stamped; the file is left as it was. A read-only handle still opens, so the diagnostic is not blinded. Startup binds no port and reports the sentence that says which build to install.

### S5 — Retired work that was read and is nothing can be dropped
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-retired-drop.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
- **Gate**: `bunx vitest run --root packages/core tests/src/lib/work-units/work-retire.service.spec.ts`
- `delendai work retired --drop=<unit> --reason=<why>` removes retired work from the forge, by the name `work retired` lists or by a pattern ending in `*`. It is refused without a reason and for a name that is not there.

## acceptance

- Two agents each enter `--kind=create --proposal=new --slice=all` and neither is refused.
- `work doctor` reports a directory in the units' folder that git has no worktree for, once it is quiet; `work reap --apply` removes it, and any file in it that no commit has is on the forge under `refs/<namespace>/retired/husk/`.
- `explainSelection` is exported by `auto-agent-selector` and every ranked route carries the parts of its score.
- Opening for writing a state database one schema version ahead throws, changes nothing in the file, and startup reports why.
- `work retired --drop` removes exactly the named retired refs from the forge.
