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

### S10 — A retired unit is not reported as lost
- **Status**: review
- **Files**: `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`, `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/retired-tips.service.ts`, `packages/core/src/lib/startup-reconciler/seams.interface.ts`, `packages/core/src/lib/startup-reconciler/finding-catalog.constant.ts`, `packages/core/src/lib/work-units/namespaced-ref.helper.ts`, `packages/core/src/lib/work-units/retired-landed.service.ts`, `packages/core/src/lib/work-units/slice-reservation-reap.service.ts`, `packages/core/src/lib/work-units/slice-reservation.service.ts`, `packages/core/src/lib/work-units/work-retire.service.ts`, `packages/core/src/lib/work-units/work-retired-drop.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/worktree-husks.service.ts`, `config/delendai/repair-resolutions.json`, `packages/core/tests/src/lib/startup-reconciler/swarm-boot.spec.ts`, `packages/core/tests/src/lib/work-units/namespaced-ref.helper.spec.ts`
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/startup-reconciler packages/core/tests/src/lib/work-units`
- Found 2026-10-06 by the owner restarting the server: the boot came up DEGRADED with mutations blocked, on 21 `integration-evidence.ref-vanished` blockers. They were units of the 2026-10-03 swarm and of this session, retired with `work retire` and, after being read, dropped with S5. The reconciler records the checkpoint of every local unit it sees; when the ref is gone and the checkpoint is not in the integration branch it may not guess, and it did not. But a retired unit was kept on the forge, and the reconciler never looked there.
- At boot the reconciler now lists the integration remote's `refs/<namespace>/retired/*` (best effort: offline or with no remote it lists nothing and concludes nothing). A vanished ref whose checkpoint is a retired tip is a note, `integration-evidence.checkpoint-retired`, not a blocker. Once the retired copy is dropped too, nothing keeps it, and the boot asks a person again, as it should. The spec covers both, against real repositories.
- The 21 blockers were each checked (all landed, reconciled, or redone by another unit) and recorded as `resolved-elsewhere` in `config/delendai/repair-resolutions.json` with their reasons.
- Found writing the spec: every hidden ref was built as `refs/${namespace}/…`, which is `refs//retired/…` in a project with no namespace; git refuses it, so retiring, keeping a husk and reserving a slice failed there outright. `namespacedRef` builds them all now.

### S12 — Nothing the clone keeps points into a unit, or collides with one
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`, `packages/cli/src/lib/guard-hooks.service.ts`, `packages/cli/src/lib/guard-hooks.service.spec.ts`
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/work-units/work-retire.service.spec.ts && npx vitest run --project @delendai/cli packages/cli/src/lib/guard-hooks.service.spec.ts`
- Found 2026-10-06 retiring review units: a generation is reused once its unit is gone, and `work retire` of the new `batch-all-g2` was refused because the forge already kept the old `batch-all-g2` under the same retired name, a push that is not a fast-forward. Neither may be lost, so the second is now kept beside the first, named by its commit (`<name>-<12 hex>`). The spec fails without the change.
- Found the same night: one `guard install` run from inside a unit recorded that unit's CLI as `delendai.guard.entry` in the clone's config. When the unit landed and its worktree was removed, every hook of every worktree called a file that was gone (`Module not found …/x00875-S11/packages/cli/src/index.ts`). An entry inside a linked worktree is now recorded as its twin in the main checkout, which outlives every unit; an entry with no twin is kept as given.
### S11 — The boot warns only of what is true
- **Status**: review
- **Files**: `packages/cli/src/lib/guard-hooks.service.ts`, `packages/cli/src/lib/guard-hooks.service.spec.ts`, `delendai.config.json`
- **Gate**: `npx vitest run --project @delendai/cli packages/cli/src/lib/guard-hooks.service.spec.ts`
- Found 2026-10-06 in the same boot log as S10. `guard hooks` reported `commit-msg: absent`, although `lefthook.yml` runs the guard there. It asks as `guard pre-commit`, on purpose: `commit-msg` judges the commit `pre-commit` judges, and runs even for an empty commit, which `pre-commit` skips. The detection accepted only the hook's own name. `commit-msg` now also counts when it asks as `pre-commit`; no other hook does. And `guard install` reported every hook lefthook declares as `unsupported` — `pre-push` and `post-merge` too — even where `lefthook.yml` already runs the guard; such a hook is now `unchanged`, and the boot lists all six as guarded.
- The same boot warned `push-automation-contradicts-policy`: this repository's `commit-policy.push.onCommit` pushed the checked-out branch, which `shared-checkout-pr` never pushes from the shared checkout, so every attempt was refused. Units reach the forge through their work ref (`persistence.autoPushAfterCommit`). `onCommit` is removed from the configuration.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S13 — A unit is published to its own pull request, whatever its generation
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- Found 2026-10-06 publishing two review packs of one agent: `batch-all-g4` tried to push into `batch-all-g1`'s pull request and was refused as not a fast-forward. `work publish` chose the target with the generation of its arguments, which defaults to 1, not with the generation of the work ref it was publishing; the second unit of an agent was sent to the first unit's pull request. The generation now comes from the work ref. The spec publishes two packs by their sessions and fails without the change.

### S14 — A released proposal is not handed back to the reviewer who released it
- **Status**: review
- **Files**: `packages/cli/src/commands/review.command.ts`, `packages/cli/src/commands/review.command.spec.ts`
- **Gate**: `npx vitest run --project @delendai/cli packages/cli/src/commands/review.command.spec.ts`
- Found 2026-10-06: I released `f00547`, which I had changed and so could not judge independently, and the very next `review next` gave it back. The release commit sits beside the claim commit in the unit, and `review next` read only the claims, so it resumed the proposal as the unit's own. What a unit holds is now what it claimed less what it released, and a proposal it released is not offered to it again; another reviewer still gets it. The spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S15 — No tracked file keeps the markers of an unfinished merge
- **Status**: review
- **Files**: `tools/scripts/lint/no-conflict-markers.script.ts`, `tools/scripts/lint/no-conflict-markers.script.spec.ts`, `package.json`, `docs/delendai/proposals/review/x00835-a-review-swarm-leaves-verdicts-that-can-be-checked-and-loses-none.md`, `docs/delendai/proposals/review/x00875-nothing-is-left-beside-the-units.md`
- **Gate**: `bun run lint:no-conflict-markers && npx vitest run --project tools tools/scripts/lint/no-conflict-markers.script.spec.ts`
- Found 2026-10-06: the documents of `x00835` and of this proposal reached `develop` with `<<<<<<< HEAD` and `>>>>>>>` lines in them. My batch script merged another open pull request of the same proposal into a unit, the merge stopped on a conflict, and the next step committed the tree as it was; every gate passed and the queue merged it. Markdown shows the markers as text, and nothing looked for them.
- `lint:no-conflict-markers` refuses any tracked file with a line that starts with git's opening or closing marker (not `=======`, which is also a markdown underline), and runs first in `lint:architecture`, which CI runs. Both documents are repaired by keeping every side: each conflict was two pull requests appending different slices.

### S16 — A review unit reads the integration branch of now
- **Status**: review
- **Files**: `packages/cli/src/commands/review.command.ts`, `packages/cli/src/commands/review.command.spec.ts`
- **Gate**: `npx vitest run --project @delendai/cli packages/cli/src/commands/review.command.spec.ts`
- Found 2026-10-06: `review next` offered `x00766`, which another pack had approved and the queue had already closed into `done/`. Since S35 the queue is read from the reviewer's unit, where its own verdicts are, and a unit made before other verdicts merged still showed their proposals waiting. `review next` now merges the integration branch's remote tip into the unit before it reads; a merge that would conflict is aborted and changes nothing. Like the hydration of an idle unit, the merge runs without hooks: it brings in only what the integration branch already checked. The spec fails without the change.
- Also seen, and left as is: a release is recorded in the unit that released, so a reviewer that opens a new unit is offered again what it released in an old one, and must release it again with its reason.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S17 — A read is not refused as a write
- **Status**: review
- **Files**: `packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts`, `packages/core/src/lib/shared/bind-write-root.ts`, `packages/core/tests/src/lib/shared/bind-write-root.spec.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/bind-write-root.spec.ts`
- Found 2026-10-06: `proposals review <id> <slice> --action=status` in the shared checkout was refused with `shared-checkout-write-refused`, so the only way to ask whether a slice had a round was to open a unit for it. The refusal is decided per tool: `proposal_review` declares `caller-checkout` because submit, approve and request_changes write, and its `status` read was refused with them. A registration now declares `readsOnly(input)`, the calls that write nothing, and the binding never refuses those in the shared checkout; `proposal_review` answers it for `status`. Its writes are refused as before, which the spec pins in the same call sequence.
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
