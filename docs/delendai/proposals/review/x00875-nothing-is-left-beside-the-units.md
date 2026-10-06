---
id: x00875
title: "Nothing is left beside the units"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-05
last-transition-id: e0796df3-f7eb-4576-8f54-7fd19b6c508d
last-correlation-id: e0796df3-f7eb-4576-8f54-7fd19b6c508d
last-transition-from: in-progress
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
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `e18619dcb3ae`

### S2 — A directory beside the units that is no unit is reaped
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/worktree-husks.service.ts`, `packages/core/src/lib/work-units/units-directory.constant.ts`, `packages/core/src/lib/contracts/interfaces/worktree-husks.interface.ts`, `packages/core/src/lib/work-units/work-unit-reap.service.ts`, `packages/core/src/lib/work-units/workflow-doctor.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/tests/src/lib/work-units/worktree-husks.service.spec.ts`
- **Gate**: `bunx vitest run --root packages/core tests/src/lib/work-units/worktree-husks.service.spec.ts`
- `work doctor` gains `no-husk-directories`: every directory in the units' folder is a registered worktree. A directory written to within one lease window is not counted, so a unit being created is never reported.
- `work reap` reports husks, and with `--apply` removes them. First, the husk and every checkout found inside it are read as git would read them, under the repository's ignore rules. A tree no commit of this clone has is committed and pushed to `refs/<namespace>/retired/husk/<name>`; only then is the directory removed. A husk git cannot read, or whose files the forge does not take, stays and says why.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `4542131c19e2`

### S3 — A route selection explains itself
- **Status**: review
- **Files**: `plugins/auto-agent-selector/src/lib/routing/selection-explain.service.ts`, `plugins/auto-agent-selector/src/lib/contracts/interfaces/selection-explain.interface.ts`, `plugins/auto-agent-selector/src/lib/routing/economic-preference.ts`, `plugins/auto-agent-selector/src/public/index.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/selection-explain.service.spec.ts`
- **Gate**: `bunx vitest run --root plugins/auto-agent-selector tests/src/lib/routing`
- Ported from the rescued commit `fa510753d` and reshaped to today's conventions. A ranked route keeps the parts of its score (`qualityEvidence`, `alreadyPaidBonus`, `scarcityPenalty`, `headroomTiebreak`, `total`); `explainSelection` names the chosen route, every discarded one with its reasons, and the fallback order.
- `f00507` S4 now names the files that shipped.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `e18619dcb3ae`

### S4 — A build refuses to write a database a newer build wrote
- **Status**: review
- **Files**: `packages/proposals-sqlite/src/lib/schema-guard.service.ts`, `packages/proposals-sqlite/src/lib/schema-guard.interface.ts`, `packages/proposals-sqlite/src/lib/schema-guard.service.spec.ts`, `packages/proposals-sqlite/src/lib/sqlite-driver.ts`, `packages/proposals-sqlite/src/lib/work-model/startup-state-ports.ts`, `packages/proposals-sqlite/src/index.ts`
- **Gate**: `bun test --timeout 30000 packages/proposals-sqlite/src/lib/schema-guard.service.spec.ts packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
- Ported from the rescued commit `ce0c35eec`. A writable open of a database whose recorded schema version is above the build's throws `SchemaAheadOfRuntimeError` before the migration sweep and before `user_version` is stamped; the file is left as it was. A read-only handle still opens, so the diagnostic is not blinded. Startup binds no port and reports the sentence that says which build to install.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `05515492f69d`

### S5 — Retired work that was read and is nothing can be dropped
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-retired-drop.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
- **Gate**: `bunx vitest run --root packages/core tests/src/lib/work-units/work-retire.service.spec.ts`
- `delendai work retired --drop=<unit> --reason=<why>` removes retired work from the forge, by the name `work retired` lists or by a pattern ending in `*`. It is refused without a reason and for a name that is not there.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `dd4b4305f8cd`

### S6 — A delivery is read however its key was spelled
- **Status**: review
- **Files**: `plugins/proposals/src/lib/swarm/slice-shipping-record.ts`, `plugins/proposals/tests/src/lib/swarm/slice-shipping-record.spec.ts`
- **Gate**: `bunx vitest run --root plugins/proposals tests/src/lib/swarm/slice-shipping-record.spec.ts`
- Found handing `f00509` to review: its S1 records `- **Shipped-In**: 27c6cf021 feat(…)`, and the hand-off was refused with "nothing records which commit delivered it". The reader took only `- shipped-in:` in lower case with the hash in backticks. It now takes the key in any case, bold or not, and a hash in backticks or bare at the start of the value; a word is still no hash.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — Retired work the integration branch came to hold is reaped
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/retired-landed.service.ts`, `packages/core/src/lib/work-units/work-unit-reap.service.ts`, `packages/core/src/lib/contracts/interfaces/work-retire.interface.ts`, `packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
- **Gate**: `bunx vitest run --root packages/core tests/src/lib/work-units/work-retire.service.spec.ts`
- Found using S5 on 2026-10-05: of 62 retired tips, 22 were ancestors of `develop`. A unit given up is often finished by another agent or merged a minute later, and from then on its kept tip keeps nothing. `work reap` now lists the retired refs whose commit the integration branch contains and, with `--apply`, drops them from the forge. A forge that cannot be reached drops nothing.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8 — A slice reservation whose unit is gone is released
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/slice-reservation-reap.service.ts`, `packages/core/src/lib/work-units/work-unit-reap.service.ts`, `packages/core/src/lib/contracts/interfaces/slice-reservation.interface.ts`, `packages/core/tests/src/lib/work-units/slice-reservation.service.spec.ts`
- **Gate**: `bunx vitest run --root packages/core tests/src/lib/work-units/slice-reservation.service.spec.ts`
- Found in the audit after the queue emptied on 2026-10-05: eighteen refs under `refs/delendai/claims/slice/` for slices that had landed. A reservation was released only when its unit was retired, and a unit that lands is not retired. They kept nobody out, since an entrant takes over a reservation whose unit is gone, but each delivered slice left a ref for ever. `work reap` now lists the reservations whose unit has no branch on the forge and that are older than an abandoned unit is given and, with `--apply`, releases them.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S9 — A cited proposal is found in any status folder
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/proposal-completeness.ts`, `plugins/proposals/tests/src/lib/services/proposal-completeness.spec.ts`
- **Gate**: `bunx vitest run --root plugins/proposals tests/src/lib/services/proposal-completeness.spec.ts`
- Found 2026-10-05 handing `x00539` to review: its S4 cites `f00534` by the `ready/` path it had when written, and the hand-off was refused with "declared files do not exist". The repository's lints had been taught the same thing an hour earlier (`f00536`); the plugin's own check, which only spared the proposal's own document, had not. A declared path under `docs/delendai/proposals/` now counts as present when a proposal document of that file name exists in any status folder; any other missing file is still owed.
- review-state: in_review
- review-implementer: claude-opus-5-5

<<<<<<< HEAD
### S10 — A retired unit is not reported as lost
- **Status**: review
- **Files**: `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`, `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/retired-tips.service.ts`, `packages/core/src/lib/startup-reconciler/seams.interface.ts`, `packages/core/src/lib/startup-reconciler/finding-catalog.constant.ts`, `packages/core/src/lib/work-units/namespaced-ref.helper.ts`, `packages/core/src/lib/work-units/retired-landed.service.ts`, `packages/core/src/lib/work-units/slice-reservation-reap.service.ts`, `packages/core/src/lib/work-units/slice-reservation.service.ts`, `packages/core/src/lib/work-units/work-retire.service.ts`, `packages/core/src/lib/work-units/work-retired-drop.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/worktree-husks.service.ts`, `config/delendai/repair-resolutions.json`, `packages/core/tests/src/lib/startup-reconciler/swarm-boot.spec.ts`, `packages/core/tests/src/lib/work-units/namespaced-ref.helper.spec.ts`
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/startup-reconciler packages/core/tests/src/lib/work-units`
- Found 2026-10-06 by the owner restarting the server: the boot came up DEGRADED with mutations blocked, on 21 `integration-evidence.ref-vanished` blockers. They were units of the 2026-10-03 swarm and of this session, retired with `work retire` and, after being read, dropped with S5. The reconciler records the checkpoint of every local unit it sees; when the ref is gone and the checkpoint is not in the integration branch it may not guess, and it did not. But a retired unit was kept on the forge, and the reconciler never looked there.
- At boot the reconciler now lists the integration remote's `refs/<namespace>/retired/*` (best effort: offline or with no remote it lists nothing and concludes nothing). A vanished ref whose checkpoint is a retired tip is a note, `integration-evidence.checkpoint-retired`, not a blocker. Once the retired copy is dropped too, nothing keeps it, and the boot asks a person again, as it should. The spec covers both, against real repositories.
- The 21 blockers were each checked (all landed, reconciled, or redone by another unit) and recorded as `resolved-elsewhere` in `config/delendai/repair-resolutions.json` with their reasons.
- Found writing the spec: every hidden ref was built as `refs/${namespace}/…`, which is `refs//retired/…` in a project with no namespace — git refuses it, so retiring, keeping a husk and reserving a slice failed there outright. `namespacedRef` builds them all now.
=======
### S11 — The boot warns only of what is true
- **Status**: review
- **Files**: `packages/cli/src/lib/guard-hooks.service.ts`, `packages/cli/src/lib/guard-hooks.service.spec.ts`, `delendai.config.json`
- **Gate**: `npx vitest run --project @delendai/cli packages/cli/src/lib/guard-hooks.service.spec.ts`
- Found 2026-10-06 in the same boot log as S10. `guard hooks` reported `commit-msg: absent`, although `lefthook.yml` runs the guard there. It asks as `guard pre-commit`, on purpose: `commit-msg` judges the commit `pre-commit` judges, and runs even for an empty commit, which `pre-commit` skips. The detection accepted only the hook's own name. `commit-msg` now also counts when it asks as `pre-commit`; no other hook does. And `guard install` reported every hook lefthook declares as `unsupported` — `pre-push` and `post-merge` too — even where `lefthook.yml` already runs the guard; such a hook is now `unchanged`, and the boot lists all six as guarded.
- The same boot warned `push-automation-contradicts-policy`: this repository's `commit-policy.push.onCommit` pushed the checked-out branch, which `shared-checkout-pr` never pushes from the shared checkout, so every attempt was refused. Units reach the forge through their work ref (`persistence.autoPushAfterCommit`). `onCommit` is removed from the configuration.
>>>>>>> 6cd2de32c4addce980bd8fe782b3688f284ca2ed
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Two agents each enter `--kind=create --proposal=new --slice=all` and neither is refused.
- `work doctor` reports a directory in the units' folder that git has no worktree for, once it is quiet; `work reap --apply` removes it, and any file in it that no commit has is on the forge under `refs/<namespace>/retired/husk/`.
- `explainSelection` is exported by `auto-agent-selector` and every ranked route carries the parts of its score.
- Opening for writing a state database one schema version ahead throws, changes nothing in the file, and startup reports why.
- `work retired --drop` removes exactly the named retired refs from the forge.
- A slice recording `- **Shipped-In**: <sha> <subject>` is handed to review without being asked for its delivering commit.
- After `work reap --apply`, no ref under `refs/<namespace>/retired/` names a commit the integration branch contains.
- After `work reap --apply`, no ref under `refs/<namespace>/claims/slice/` names a unit that is gone from the forge and past its grace.
