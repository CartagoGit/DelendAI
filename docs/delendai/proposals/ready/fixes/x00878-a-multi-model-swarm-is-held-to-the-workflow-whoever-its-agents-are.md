---
id: x00878
title: "A multi-model swarm is held to the workflow, whoever its agents are"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-10-06
---

# x00878 — A multi-model swarm is held to the workflow, whoever its agents are

## goal

Agents of several models and hosts working or reviewing at once (MiniMax M3.1, GLM, Luna, GPT-5.4, Claude) each sign as the model they are, write through the tools, and leave records the workflow can check; every departure observed in such a swarm becomes a gate or a fix.

## why

On 2026-10-06 the owner ran a review swarm on another host: several MiniMax M3.1 instances, GLM, Luna and GPT-5.4, alongside the Claude orchestrators of this repository. This proposal collects what such a swarm does that the workflow should not allow, as it is observed; each finding becomes a slice that fixes the product, not the agent. It is implemented once the swarm has finished.

### Findings log

- **2026-10-06 17:50, identities on the forge.** Review units appeared as `minimax-3` (two units), `minimax-m31`, `glm-5.3-flash` (four units, g1–g4), `gpt-5.4` and `illyria`. `minimax-3` names a family, not the model the agent runs (MiniMax M3.1, as the owner reports); `minimax-m31` is that model with its dot dropped, so the same model has two spellings; `illyria` is no model at all: the owner reports that agent was ChatGPT Luna 6.0, so it signed with a name it invented. Every one was accepted, and the name is now recorded as the reviewer in proposal documents (`review-reviewer: minimax-3` on x00752), which is where model independence (`reviewIndependence: model`) is judged.
- **2026-10-06 17:44, a verdict committed by hand.** `minimax-3` committed `chore(review): approve x00752 S1 — …`, moving the proposal to `done` with its review lines, under a message of its own instead of the review tool's record (`chore(delendai): delendai_proposals_proposal_review …`). Nothing distinguishes it from a verdict the tool checked.
- **2026-10-06 17:49, one agent, two spellings, two record shapes.** `gpt-5.4`'s unit recorded `review-reviewer: GPT-5.4` and `approved by GPT-5.4` (f00275): the ref and the document disagree on case. Its verdicts were committed under two subjects, `chore(delendai): delendai_proposals_proposal_review f00275 S1 approve` and `chore(delendai): delendai review approve f00275`; a check that tells a tool's record from a hand-written one needs one shape (or a trailer), not a subject that varies with the entry point.
- **2026-10-06 18:50, a commit says more than it did.** `minimax-3` committed `chore(review): approve x00835 S1-S33 — …`; the commit adds one approval (one slice). A reader of the history, or a reviewer counting verdicts, is told thirty-three.
- **2026-10-06 19:00, proposals closed by hand, beside the closer.** `minimax-3` committed `chore(review): close x00770, x00799, x00868, x00870, x00873 — …`, moving three of them (not five) from `review/` to `done/` and editing their status, without the transition tool, while the owner machine's closer had the same five in its own pull request (#848). Two writers for one transition, and the closes are not the tool's.
- **2026-10-06 18:21–18:50, verdict commits under the agents' own subjects.** `glm-5.3-flash` (`chore(review): x00556 S3+S6 approve (proposal done)`, `docs(review): record batch verdicts for x00790 x00872 f00547`, `chore(review): x00556 close — S1-S6 approved by …`), `illyria` (`chore(delendai): f00538 closes after the last approval`, `chore(review): q00010 S3 requested changes (…)`) and `minimax-3` committed verdicts and closes under messages of their own. Their review lines carry the tool's evidence format, so the tool may have written them and the agent committed (as when the CLI's call timed out, x00875 S20); either way the record does not say which, and the pull requests of these packs are titled by those messages (#854 `chore(review): approve x00752 S1 — …`, #850 `review batch`).
- **2026-10-06 ~20:00, what the swarm left when its agents said they were done.** The review queue still held 20 proposals (44 slices needing a verdict, 16 claimed by others, 9 approved and not closed), where a swarm that worked would have left none. On the forge: publications `minimax-3` ×5, `glm-5.3-flash` ×2, `illyria` ×1, work refs `minimax-3` ×2 and `gpt-5.4` ×1, and 43 review reservations, 25 of them naming a unit whose work ref and publication no longer exist. A reservation lapses only after its hours (`REVIEW_RESERVATION_SECONDS`), not when its unit ends, so a finished agent kept proposals out of every other reviewer's hands, and nothing deletes the ref afterwards.
- **2026-10-06, swarm packs that cannot land.** `lint-governance` refused #851 (`glm-5.3-flash`: it closes a proposal whose slices lack an approval by someone other than their implementer), #856 (`minimax-3`: it closes x00770, x00799, x00868, x00870 and x00873, which it never claimed) and #858 (`illyria`: `proposal-cited-commits`, it cites commits that do not exist). Each pack waits for a person, and its verdicts with it; the agents reported done. The owner machine's closer was refused the same way (x00875 S29 fixes that one).
- **2026-10-06, `--alongside` reused a generation an open publication held.** `work enter --alongside` gave `x00875-S29-g1` while `delendai/pr/…/x00875-S29-g1/…` (#861) was open, a second ref with the same identity; only `--generation=2` avoided it. An open publication is a generation in use.
- **2026-10-06, the owner's analysis: a claim is an existing ref, not a living holder.** Every claim the proposals plugin reads (a review's `Claims:` commits in its unit, a slice's reservation, the forge's review reservation) means "a ref exists". A ref survives its agent: one that ran out of quota, crashed or lost its context leaves a unit that looks like work in progress. The repository already has what a claim should mean (the owner names it lease-based claims with heartbeat, fencing and recovery): unit leases with owner, session and `heartbeatAt` and the live / idle / abandoned / delivered verdict (`unit-lease.service.ts`, `unit-verdict.service.ts`), leases with `expires_at` and `releaseClaimsOfExpiredLeases` in the state database, the startup reconciler turning a vanished owner's unit RECOVERABLE without deleting its work, and fencing tokens (`STALE_SWARM_LEASE`). The proposals plugin's claims do not read them. S4 ties a review reservation to its unit's existence; S7 ties every claim to its holder's life.
- **2026-10-06 ~21:00, the swarm ran in this very repository, and left its units in it.** Its worktrees are under `.cache/delendai/.worktrees/`: thirty with no commit and no change (25 of `glm-5.3-flash`, g1–g30, three of `minimax-3`, one of `illyria`, one of `gpt-5.4`), retired by hand except four still inside their holder's lease. One agent asking `review next` without its session every few minutes opened a unit per question (S8). `gpt-5.4` finished with a unit holding three approvals (f00267, r00056, f00275) it never published; adopted with `work claim` so they can land under its own signature. A temporary worktree of the candidates' refresh (`/tmp/candidate-refresh-*`, detached) was left behind too.
- **2026-10-06, a `new` unit keeps its slot after it names its proposal.** Once `proposals create` turned `new/all` into x00877, the `new/all` reservation and the `claude-opus-5-5-new-all` directory still blocked the next new proposal: `work enter --proposal=new` was refused until given `--alongside` and `--dir`.

## non-goals

- Correcting an agent's behaviour by instruction alone: every finding is closed by a gate or a product change that holds for any model and host.
- Judging the quality of a verdict's reasoning: this is about records the workflow can check (who, through which tool, with which evidence).

## slices

- global_gate: none

### S1 — An agent signs with the model it runs as
- **Status**: review
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/services/review-claim.service.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`
- **Gate**: type
- acceptance:
  - "An identity that names no model (a persona such as `illyria`), or a family without its version (`minimax-3` for MiniMax M3.1), is refused at `work enter` and at every verdict, with the spelling the host reports for the model it runs."
  - "One model has one spelling everywhere: the ref segment, the verdict line and the review lines agree (`minimax-m3.1`, not `minimax-m31` in the ref and something else in the document)."
- Progress 2026-10-06: a verdict is signed with the same canonical spelling the unit's ref uses (`resolveWorkAgentId`: `GPT-5.4` and `gpt-5.4` are one reviewer), and a verdict recorded in a review unit is refused unless it is signed by the agent the unit is named after, so a pack has one reviewer and a name cannot be chosen per call. Both specs fail without the change. Still open: an identity that names no model (`illyria`, which was ChatGPT Luna 6.0) or a family without its version (`minimax-3` for MiniMax M3.1) cannot be told from a real model id by its spelling; that needs the identity to come from the host, which knows the model it runs (its declared agent id), rather than from the agent's own words.

### S2 — A verdict reaches the document only through the review tool
- **Status**: review
- **Files**: `tools/scripts/lint/verdicts-through-the-tool.script.ts`, `tools/scripts/lint/verdicts-through-the-tool.script.spec.ts`, `package.json`, `.github/workflows/ci.yml`
- **Gate**: type
- acceptance:
  - "A commit that changes a slice's review lines or a proposal's status without the review tool's record (its commit, or its trailer) fails a gate, so a verdict written by hand cannot pass for one the tool checked."
- Delivered: `lint:verdicts-through-the-tool`, run in CI's governance job and in `validate:run`, reads every non-merge commit of the branch that touches the proposals directory and fails one that adds a `review-*` line under a subject other than a tool's own (`chore(delendai): <namespace>_<tool> …`), naming the commit and the lines. Run on the swarm's `q00010 S3 requested changes` commit (`chore(review): …`, signed Illyria) it names all five lines; on this branch it passes. Removing review lines is not a verdict and passes. Not covered: a proposal's `status:` moved by hand, and a hand commit that borrows the tool's subject — the subject is the record, and it can be typed.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — A created proposal releases the reservation and directory of its `new` unit
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/unit-adoption.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/free-directory.helper.ts`, `packages/core/tests/src/lib/work-units/unit-adoption.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: type
- acceptance:
  - "After `proposals create` names a `new` unit's proposal, the `new/all` reservation and the `<agent>-new-all` worktree directory are free: a second new proposal can be started without `--alongside` or `--dir`."
- Delivered: two holds outlived the `new` unit. Its slice reservation (`refs/delendai/claims/slice/new/all`) named a unit that no longer existed once it took its proposal's id, and was released only by the reaper hours later; renaming the unit now releases it. And the renamed unit keeps standing in the `<agent>-new-all` directory, which the next `work enter --proposal=new` was refused; a default directory something already occupies now gives way to the first free `<dir>-<n>` (resuming a unit finds its own worktree before this point). Both specs fail without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A review reservation ends with its unit
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/review-reservation.service.ts`, `plugins/proposals/src/lib/contracts/constants/review-reservation.constant.ts`, `plugins/proposals/tests/src/lib/tools/review-reservation.spec.ts`, `tools/scripts/git/ended-reservations.service.ts`, `tools/scripts/git/ended-reservations.service.spec.ts`, `tools/scripts/git/maintain-ref-namespace.script.ts`
- **Gate**: type
- acceptance:
  - "A reservation whose unit has neither a work ref nor a publication on the forge is free at once, whatever its hours, and the queue does not count it as held."
  - "Such a reservation ref is deleted by the reaper that already removes finished units, so none outlives its unit on the forge."
- Delivered: a reservation whose unit is on the forge neither as a work ref nor as a publication (one `ls-remote` of the path after the agent matches both), and that is older than `REVIEW_RESERVATION_UNIT_GRACE_SECONDS` (15 minutes, the time a fresh unit needs to be pushed), counts as lapsed: the next reviewer takes it over at once. The namespace maintenance that runs after every merge drops such reservations from the forge, each only if it is still the commit it read. A dry run on this repository's forge found 14 to drop. Both specs fail without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — A pack that cannot land is refused before it is published
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/pack-governance.service.ts`, `plugins/proposals/src/public/index.ts`, `plugins/proposals/tests/src/lib/services/pack-governance.service.spec.ts`, `tools/scripts/lint/closed-with-independent-approval.script.ts`, `packages/cli/src/lib/review/review-pack-check.service.ts`, `packages/cli/src/commands/review.command.ts`, `packages/cli/src/commands/review.command.spec.ts`
- **Gate**: type
- acceptance:
  - "`review finish` (and `review next` when it publishes a full pack) runs the pack's governance checks (independent approval, claimed proposals, cited commits) before publishing, and refuses with what to fix, so a reviewer is never told its pack is done while CI will refuse it."
- Delivered: the predicates `closed-with-independent-approval` applied only in CI (approvals by someone other than the pack's author, proposals changed without a claim) now live in the proposals plugin (`packRefusals`), and the gate reads them from there; `review finish --session` asks them of the unit's own commits before `work publish`, and refuses with each reason and nothing published. #873 is the case: approvals signed by GPT-5.4 in a unit named for claude-opus-5-5, published and red for good. The spec fails without the change. Not covered: a pack published with the `work` tool directly, and the cited-commit check, which needs the forge.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — An open publication is a generation in use
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`work enter`, with or without `--alongside`, never gives a generation whose publication is open on the forge."
- Delivered: the rule that kept a review batch from reusing the name of a pack still published now holds for every unit: a generation whose publication is open is skipped, with or without `--alongside`. The spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — A claim holds while its holder lives, for every kind of work
- **Status**: in-progress
- **Files**: `plugins/proposals/src/lib/services/review-claims.service.ts`, `plugins/proposals/src/lib/services/claim-liveness.service.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`, `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/src/lib/tools/review-queue.tool.ts`, `plugins/proposals/tests/src/lib/services/claim-liveness.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A claim on a proposal or a slice (review, implementation, any unit kind) holds only while the unit that made it has a live lease (its heartbeat within the lease window); without one it no longer blocks another agent, and the queue and `work enter` say so."
  - "Two windows, not one: the exclusive claim lapses on a short window, the unit's work is judged abandoned on the conservative one; a lapsed claim frees the work, it never deletes it (the unit becomes recoverable, its commits and branch stay)."
  - "A unit whose publication is open keeps its claim whatever its heartbeat: its verdicts or its work can still land, and another agent must not duplicate them (states live, recoverable, published, integrated)."
  - "A taken-over claim carries a higher generation; a write by the previous holder after the takeover is refused as stale (fencing), so an agent that comes back cannot write over the one that adopted its work."
- Progress 2026-10-06, reviews: the review queue reads a claim through core's verdict on its unit (`claimHolding`, from `readUnitStandings`: the lease's heartbeat, or the unit's last commit where no lease is visible on this machine). A claim holds while its unit is live or its publication is open; a unit idle past its lease window, abandoned or delivered holds nothing, and its work stays where it is; a unit core has no verdict for holds. Still to do: implementation units (`work enter` holds a slice for an `idle` unit through `isUnitHolding`; the short window should apply there too), the verdict and claim tools reading the same predicate, and fencing (a taken-over claim's generation refusing the previous holder's writes).

### S8 — Asking the queue opens no unit
- **Status**: review
- **Files**: `packages/cli/src/lib/review/review-peek.service.ts`, `packages/cli/src/commands/review.command.spec.ts`
- **Gate**: type
- `review next` without a session reads the queue first and enters a unit only when a proposal waits for a verdict that nobody holds; otherwise it answers that nothing is waiting, and no ref, worktree or lease is made. The spec (three questions, no unit) fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S9 — A unit nobody holds leaves nothing behind
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/unit-reaper.service.ts`, `packages/core/tests/src/lib/work-units/unit-reaper.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A unit whose owner is gone (abandoned: past the lease windows) and that carries no commit beyond the integration branch has its worktree and local branch removed by `work reap --apply`, which the post-merge hook already runs; one holding an uncommitted edit is kept and reported with the paths, and one carrying a commit of its own is left alone."
- Delivered: the reaper only ever removed delivered units, and a unit entered and never committed to is never delivered, so every reviewer of a swarm that stopped before its first verdict left a full copy of the repository and a branch behind (four `glm-5.3-flash` units here, each at the integration tip, clean). Such a unit is now reaped once it is abandoned; an idle one is left for its owner, and the edit and own-commit cases are unchanged. The removal case fails without the change; the three that keep a unit pin what must not change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S10 — A publication closed without merging is retired, not left
- **Status**: review
- **Files**: `packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/tests/src/lib/ref-lifecycle/reconcile.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A publication whose pull request was closed without merging, an hour or more ago, with no open request and no work branch of its unit on the forge, is retired by the queue's reap pass: its tip is kept under the retired namespace (where `work retired` lists it and `work retired --drop` ends it) and its branch is deleted. It is never deleted outright."
- Delivered: x00697 stopped deleting such publications, since the tip may be the only copy, and kept them "for the author to reopen or end". Nobody ended them, and every swarm pack closed as a duplicate stayed on the forge (`delendai/pr/minimax-3/review/batch-all-g4/verdicts`, #860, closed by its own author). The reconcile now lists them as retirable after `DEFAULT_CLOSED_RETIREMENT_GRACE_SECONDS`, and `lint:ref-lifecycle --reap`, which the queue already runs, writes the retired ref through the forge API before deleting the branch; a retired ref already holding another tip leaves both alone. A dry run here names #860 and nothing else. The reconcile case and the helper's cases fail without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S11 — An id reservation ends when a higher one supersedes it
- **Status**: review
- **Files**: `plugins/proposals/src/lib/proposals/proposal-id-sources.ts`, `plugins/proposals/tests/src/lib/proposals/proposal-id-sources.spec.ts`
- **Gate**: type
- acceptance:
  - "Reserving an id releases the forge's reservations of the same prefix below it, so the forge holds at most one id reservation per prefix; the counter every clone reads is unchanged."
- Delivered: an id is reserved as `refs/delendai/ids/<id>` and nothing ever removed one: a ref per proposal created piled up on the forge (nine after one afternoon). Only the highest reservation of a prefix feeds the counter — the allocator hands out the next one above it — so a successful reservation now deletes the lower ones of its prefix in the same `send-pack` way it was made; a failure to delete leaves them, harmless. The spec (three reservations, two left, the counter still 812) fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S12 — A retired close pass ends once its closes have landed
- **Status**: review
- **Files**: `tools/scripts/proposals/close-approved-proposals.script.ts`, `tools/scripts/proposals/close-approved-proposals.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Each run of the closer drops from the forge its own retired passes whose every closed proposal is in `done/` on the integration branch; a pass with a close that has not landed is kept."
- Delivered: thirty-seven passes of the closer were retired on the forge after an afternoon, each holding the close of the same five proposals. The reaper of landed retired work drops a tip the integration branch contains, and a pass's commits never are contained: its copy of each close differs from the one that lands in the transition ids it stamped. The closer now reads its own retired passes, the proposals each added under `done/`, and drops (`work retired --drop`) those whose closes are all on the integration branch. The helpers' spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S13 — A publication its author left in conflict is adopted or retired, not left
- **Status**: review
- **Files**: `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A publication that does not merge trivially and whose author's unit has been abandoned (past the lease windows) is reported once as adoptable, with the exact `work enter` + merge + `work retire --unowned` steps, instead of `its author decides` on every pass; after a further window with nobody adopting it, its pull request is closed with that reason, and S10 retires it."
- Found 2026-10-06: after the swarm stopped, #856, #857 and #858 sat on the forge, two of them conflicted, each reported on every hydration as "its author decides" by an author that was gone. Done by hand that day: #857's verdicts were adopted into a pack of the orchestrator's (less one approval that judged an earlier definition of x00875 S20), #858 was retired (signed `illyria`, a name of no model; its q00010 changes superseded), and #856 duplicates the queue's own close pass #878.
- Delivered: the hydrator's report of a candidate that does not merge trivially now tells an author still around from one gone: when the candidate's unit is no longer on the forge and nobody has pushed it for a day (far past any lease; a threshold of the hydrator's own, so the queue tooling reaches no core internals), it says how the conflict ends — adopted on its own publication (approvals land only through their reviewer's pull request) or retired with `work retire --unowned`, which keeps the tip — instead of "its author decides" on every pass. Not delivered: closing such a pull request on its own after a further window. Whether to end another agent's work stays a decision someone makes with the report in hand; once it is closed, S10 retires it. The spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S14 — A unit that only merged landed work in is delivered
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/landed-work.service.ts`, `packages/core/src/lib/work-units/unit-standings.service.ts`, `packages/core/src/lib/work-units/unit-reaper.service.ts`, `packages/core/tests/src/lib/work-units/unit-reaper.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A unit whose only commits beyond the integration branch are merges joining commits the integration branch already holds is judged delivered and reaped like any other delivered unit."
- Delivered: x00878 S4, S6 and S8 landed through #879, which carried them, and their units stood for good as `idle`: each had merged develop in before a publish that was refused, and that merge commit — joining two commits develop holds — was the one thing develop lacked. `carriesNothingBeyond` reads every commit past the integration branch and accepts only merges whose parents are integrated or among those merges; the unit verdict and the reaper's empty-unit rule (S9) both use it. The spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S15 — A retired pack that changes no file is dropped
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/retired-landed.service.ts`, `packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`work reap --apply` drops from the forge a retired tip whose commits change no file against where it left the integration branch (a pack retired before its first verdict holds only empty claim and release commits); a retired tip that changes a file is kept."
- Delivered: six of the fifteen retired refs left after the swarm were review packs that never recorded a verdict, each a claim commit or two, and the landed-retired reaper kept them because empty commits are never contained in the integration branch. They are now dropped with the landed ones. The same afternoon, by hand and with a reason each, the other spent ones went too (contents identical on develop, closes landed through #878, a slice that landed under its next generation): fifty-two retired refs became four, each holding verdicts that have not landed. The spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S16 — A submit through the CLI is committed, or the CLI says why
- **Status**: review
- **Files**: `packages/core/src/lib/shared/commit-call-writes.ts`, `packages/core/src/lib/contracts/constants/call-writes.constant.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/shared/commit-call-writes.spec.ts`, `packages/cli/src/lib/stdio-context.factory.ts`, `packages/cli/src/lib/stdio-context.factory.spec.ts`
- **Gate**: type
- acceptance:
  - "`proposals review <id> <slice> --action=submit --workspace=<unit>` commits the review lines it writes in the unit, every time; when the commit fails, the reason is in what the CLI prints (today it is only a text note beside the structured result, which the CLI does not print)."
- Found 2026-10-07, after x00875 S20's timeout fix landed: of seven submits in this proposal's units, S9, S12, S3 and S5 were committed by the tool, and S10, S11, S14 and S15 were left staged — `git add` ran, the commit did not — with an `ok: true` result and no word of it. The same `git commit -- <path>` run by hand in the unit, with the agent's environment, passes every hook. Each was committed by hand with the tool's subject.
- Delivered: the reason was invisible, so it is made visible first: the server's line saying a call's writes were not committed (`CALL_WRITES_NOT_COMMITTED`) is passed on by the CLI to its own stderr, whole however the server's output is chunked. A commit with a minimal environment like the one the SDK gives the server passes every hook, so the environment is ruled out; every failure here happened while other units of the clone were fetching and committing, so a commit git refuses only because another process holds a lock (`cannot lock ref`, `index.lock`) is now tried again, five times a second apart. The lock case's spec fails without the change. The retry covers the `git add` too, which takes the unit's own index lock: a submit left unstaged (S16's first, run with develop's code) is that step meeting `index.lock`, held for a moment by whatever refreshes the worktree's index (an editor's Git integration watches every worktree). The same submit run again with this unit's code was committed. If a submit is left staged again, the CLI now prints why.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S17 — A merge leaves the proposal-id counter level with what it brought
- **Status**: review
- **Files**: `lefthook.yml`
- **Gate**: type
- acceptance:
  - "After a merge that brings in a proposal created elsewhere, `lint:proposal-id-drift` passes in the merging worktree without anyone reseeding the counter by hand."
- Delivered: twice on 2026-10-07 a unit's publish was refused by `check-proposal-id-drift` (x00878, then f00756 from another host): the counter is a cache in each worktree's `.cache/delendai/`, and nothing moved it when a merge brought ids it had not handed out. Since x00868 the allocator takes the highest of the files in every worktree, the forge's reservations and the cache, so a lagging cache hands out no taken id; it only failed the gate. The post-merge hook now reseeds it (`sync-proposal-counters`, which only raises), in the shared checkout and in every unit that merges.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S18 — Retired work that is dropped is not taken for lost work
- **Status**: review
- **Files**: `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`, `packages/core/tests/src/lib/startup-reconciler/swarm-boot.spec.ts`, `config/delendai/repair-resolutions.json`
- **Gate**: type
- acceptance:
  - "A checkpoint the reconciler once saw kept as retired work is not reported as vanished after its retired ref is dropped; one dropped before this clone ever saw it retired still is."
- Found 2026-10-07 in the MCP server's boot log: after S12 and the analysed drops of the same day, every boot was DEGRADED with mutations blocked, on five `integration-evidence.ref-vanished` blockers — close passes of the queue and the `illyria` pack, retired with a reason and dropped once their content was on develop or judged worthless. Seeing a checkpoint retired only wrote a note on each boot, so the moment its tip went, the work looked lost.
- Delivered: the first time the reconciler sees a checkpoint kept as retired work, it records that in the journal (`recovery-decision`, `retired`, with the commit), and a checkpoint so recorded is reported as retired, not vanished, after the ref is dropped: dropping is itself the decision (`work retired --drop --reason`, or the reapers' evidence). A checkpoint this clone never saw retired still asks. The five that were already blocking are resolved in `config/delendai/repair-resolutions.json` with what each held. The spec that asked again after a drop now pins the new contract, and a new case pins the one that still asks.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S19 — The server's log says a thing once, not every five minutes
- **Status**: review
- **Files**: `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`, `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
- **Gate**: type
- acceptance:
  - "The work-checkout publisher writes a pass's report to the server's log only when it differs from the previous pass's."
- Delivered: after the swarm stopped, the MCP server's log carried the same `work-checkouts.published` line — four empty units, "no commits of its own yet" — every five minutes for a day, burying the boot reports that mattered. The server's report writer now keeps the last line and writes a new one only when the outcome changes. The spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S20 — Everyday listings show live work, not what was given up
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-swarm-relations.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- **Gate**: type
- acceptance:
  - "`work status`, `work swarm` and the overview list live, waiting-for-review and adoptable units by default; retired, superseded and collectable ones are counted on one line and listed only with `--all`, so an agent asking what to do next is not paid for the history of every swarm."
- Found 2026-10-07 by the external audit of the second swarm (ChatGPT, `.cache/chat-with-llms/2026_10_07_01:08_…`): after a swarm, the default listings enumerate every ended unit, a token cost on each call and a distraction for the next agent.
- Delivered, for `work swarm`: units the verdict calls delivered or abandoned are counted on one line (`… N ended (delivered or abandoned); --all lists them`) and listed only with `--all`; `--json` still carries every unit. On this repository it folds three. `work status` already prints counts only. The overview is not changed. The spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S21 — The forge reaper sees a branch whose only extra commit merged landed work
- **Status**: review
- **Files**: `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A work branch whose only commits beyond the integration branch are merges of commits it already holds is reapable by `lint:ref-lifecycle --reap`, the same way S14 made it delivered for the local reaper."
- Delivered: after #879 landed x00878 S4, S6 and S8 through S9's publication, their three work branches stayed on the forge for good: each held one merge of develop that develop did not, so `containedInGit` said no. It now asks `carriesNothingBeyond` (S14's predicate, one source) when the tip is not an ancestor. A dry run named exactly those three and `--reap` deleted them. A branch carried by another slice's open publication (x00877 S7 inside #891) is still left until that publication lands: only a unit's own publication proves it ended. The spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S22 — The unit that wrote a proposal holds none of its slices
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/slice-holders.service.ts`, `packages/core/tests/src/lib/work-units/slice-holders.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A `create` unit (and its open publication) does not hold the slices of the proposal it wrote: another agent's `work enter --kind=implement` on one of them is not refused for it; a second `create` unit on the same proposal still is."
- Found 2026-10-07: an implementer dispatched to f00757 S1 was refused, "already being worked on by another agent", because the proposal's `create` publication (#892) is named `f00757-all` and `all` covers every slice. The proposal was not even on the integration branch yet, so nobody could start any of its slices until the document's pull request merged. The only way round it, `--alongside`, is the deliberate-duplicate escape, and an agent's permission classifier rightly refused it.
- Delivered: `holdersOfSlice` leaves a `create` unit out unless the asker is creating too. The existing case that used a `create` unit as its whole-proposal example now uses an `implement` one, which is what holds every slice. The new case fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S23 — The boot sees a checkpoint whose only extra commit merged landed work
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/landed-work.service.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/checkpoint-containment.ts`, `packages/core/tests/src/lib/work-units/landed-work.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A checkpoint whose only commits beyond the integration branch are merges of commits it holds is integration evidence at boot, so the unit's ref going (S21's reaper, or anyone's) is not reported as vanished."
- Found 2026-10-07 in the MCP log: right after S21's reaper deleted x00878 S4, S6 and S8 from the forge, the next boot was DEGRADED with mutations blocked, on three `ref-vanished` blockers for exactly those units. The reconciler judges containment its own way — ancestry, or the same content at every path — and develop had changed those files again since, so a branch S14 and S21 call delivered looked lost to it.
- Delivered: the rule is one predicate now. `parentsOutsideMerges` (pure) says which parents a merge-only tip needs the base to hold; `carriesNothingBeyond` (reapers, unit verdict) and the reconciler's git seam (asynchronous) both ask it. On the three real tips it answers yes. The spec pins the reading.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S24 — A unit another unit of its agent published ends with that publication
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/carried-units.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/work-units/carried-units.service.spec.ts`
- **Gate**: type
- acceptance:
  - "When `work publish` publishes a unit, every other work ref of the same agent and proposal whose tip the publication contains is ended the way the published one is (clean worktree removed, remote copy and local ref deleted); a unit of another agent, and one entered on top and not committed to yet, are left alone."
- Found 2026-10-07 by the owner: `origin/delendai/wip/claude-opus-5-5/implement/x00877-S7-g1/…` stayed on the forge after x00877 S5 merged it in and published it as #891. The forge reaper takes only a unit's own publication as proof, deliberately — a unit stacked on another's publication starts at its tip and is not finished — and S5 had been fast-forwarded onto S7, so git cannot tell the two cases apart from the outside.
- Delivered: the publisher, which knows what it carried, ends the carried units of its own agent and proposal (`endCarriedUnits`, reported as `carried-*` steps in the publish result). A unit whose tip is still the commit it was entered at (its lease's `entrySha`) is a fresh stack, not carried work, and is kept; `endWorkRef` keeps any worktree with uncommitted changes. x00877 S7 itself was retired by hand with that reason; once #891 lands the landed-retired reaper drops it. The spec fails without the change.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S25 — The server keeps its own log in the workspace
- **Status**: review
- **Files**: `packages/core/src/lib/shared/server-log.ts`, `packages/core/src/lib/contracts/constants/server-log.constant.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/shared/server-log.spec.ts`, `packages/cli/src/index.ts`, `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "Every line a server writes to stderr is also kept in `<cacheDir>/logs/mcp-server/mcp-server.<day>.log`, stamped with the time and the process (`cli-serve`, `host-server` or `host-supervisor`), whatever host started it; the logs of the last ten days are kept and older ones are removed when a server starts."
- Asked by the owner on 2026-10-07: what a boot reported (DEGRADED, the repair tasks, a restart onto new code) lived only where the host put its stderr — VS Code's per-window log under the user's application data — and reached an agent only when a person pasted it. The server now copies its stderr into the workspace's cache, one file per day, so an agent can read back the boots after its own changes or another agent's and see how they reacted. A brief `__serve` here wrote the day's file with the guard and boot lines. The spec covers the copy, partial lines and the ten days kept.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S26 — A queue whose candidates are all behind still moves
- **Status**: review
- **Files**: `tools/scripts/git/hydrate-candidates-after-merge.script.ts`, `tools/scripts/git/hydrate-candidates-after-merge.script.spec.ts`
- **Gate**: type
- acceptance:
  - "When every open candidate is behind the integration branch and none can land as it is, the owner machine brings them forward within one cadence, without waiting for a merge: the queue never waits on itself."
  - "The hydration log says when each pass ran and is set aside before it outgrows 2 MB."
- Found 2026-10-07: for three hours nothing merged. The queue arms only candidates that land as they are; all six were behind, so it armed none and reported "refresh it from the machine that owns it".
- Root cause, read from the hydration log on 2026-10-07: the cadence existed (the host server runs the pass every ten minutes), but every pass failed on the same candidate: the flat forward sync `delendai/pr/forward-sync-<sha>` could not be brought forward, because the pre-push guard refused its shape, 184 times. The candidate never moved and the queue waited on it. That is fixed at its source by x00879 S11 (the forward sync's branch is a canonical publication), not by a second cadence. What this slice adds is what hid it: the log grew to 17 MB and 130,000 lines without a date, so the same refusal repeated for hours unread. Each pass now writes a dated header, and the log is set aside as `.1` past 2 MB.

### S27 — A stale generated catalog does not stop its own regeneration
- **Status**: review
- **Files**: `packages/core/src/lib/plugins/managed-lazy-catalog-lookup.ts`, `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`, `packages/core/src/lib/plugins/managed-plugin-environment.ts`, `packages/core/src/lib/cli/assemble-plugins.ts`, `tools/scripts/generate/managed-lazy-catalog.script.ts`, `packages/core/tests/src/lib/plugins/managed-lazy-catalog-lookup.spec.ts`, `packages/core/tests/src/lib/project/tool-surface-runtime.exposure.spec.ts`, `plugins/proposals/tests/src/lib/surface/disclosure.spec.ts`
- **Gate**: type
- acceptance:
  - "The generated managed lazy catalog exports one runtime value, the catalog array; what is derived from it (the lookup by id) is computed in authored code, so a stale copy of the file cannot break the import chain of the generator that replaces it."
- Found 2026-10-07 while repairing two candidates: a merge left an older `managed-lazy-catalog.generated.ts` without `MANAGED_LAZY_PLUGIN_BY_ID`. The generator imports `@delendai/core/public`, which imports `assemble-plugins`, which imported that export, so every generator, gate and pre-push hook failed with "Export named 'MANAGED_LAZY_PLUGIN_BY_ID' not found" and the file could only be restored by hand. The map now lives in `managed-lazy-catalog-lookup.ts`, and a spec holds the generated module to its single export.

### S28 — A run that lost its required check runs again
- **Status**: review
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`
- **Gate**: type
- acceptance:
  - "When an armed candidate's workflow run finished as a failure with no check failing and a required check absent, the queue runs it again once and says so; a run that loses its checks a second time is reported and not run a third time."
- Found 2026-10-07 on #907: the forge concluded its run `failure` having created 35 of the workflow's 37 jobs, all green; `tests` and `delendai-validate` were never created. The candidate was armed and BLOCKED with nothing red on it, so the queue (which moves red candidates to their authors and waits on green ones) waited on it for good. A full re-run created all 37 jobs and the candidate merged. The queue now notices that shape, the same way it already releases runs the forge parks.

### S29 — An approved proposal closes on the integration branch's certified run
- **Status**: retired
- **Files**: `plugins/proposals/src/lib/services/validate-blocker.ts`, `tools/scripts/proposals/close-approved-proposals.script.ts`
- **Gate**: type
- acceptance:
  - "Closing an approved proposal accepts, as its validate evidence, the integration branch's full CI run at the commit that carries the proposal's work, when that run is green; a local journalled validate run still counts, and neither a red nor a missing certification closes anything."
- Found 2026-10-07 in the hydration log: `close-approved-proposals` failed 218 times with "x00834 refused — validate required: No validate run has been journalled for this workspace". Approved proposals waited for a local `validate` (the whole chain, about ten minutes, that nobody runs on the owner machine) while the integration branch's certified full run, a stronger proof of the same tree, sat green.
- Retired 2026-10-07 on reading the code: closing already accepts the integration branch's certified full run as evidence (`certifiedDelivery` in `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, tried after the local journal), when every commit in the proposal's `shipped-in` is contained in a certified tip. The 218 refusals in the hydration log were for x00834 before it had `shipped-in`; it is done, and the passes since report nothing in review ready to close.

### S30 — A proposal that moves folders keeps the approvals it already had
- **Status**: review
- **Files**: `tools/scripts/lint/closed-with-independent-approval.script.ts`, `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`lint:closed-with-independent-approval` pairs a proposal's old and new versions by its id, so a proposal that changes folder and much of its content in one pull request does not have its existing approvals counted as added by that pull request; an approval that is new in it still is."
- Found 2026-10-08 by the agent finishing r00040: its pull request moved the proposal from in-progress to review and rewrote its Files list (645 paths). The move fell under git's 50% rename similarity, read as a deletion and an addition, and the lint refused the implementer for "adding approvals by gpt-5.4" it had only carried; the agent worked around it by listing directories instead of files.

### S31 — A unit answers for what it deleted, not for what the branch gained
- **Status**: review
- **Files**: `tools/scripts/lint/mass-content-removal.script.ts`, `tools/scripts/lint/mass-content-removal.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`lint:mass-content-removal` measures a branch from where it left the integration branch, read from the project's declared branches, so files the integration branch gained afterwards are not counted as deleted by a unit that never had them."
- Found 2026-10-08 by the agent on f00757 S1: its unit, one merge behind, was refused for a mass removal of eight files it had never touched; they had landed on the integration branch after the unit left. The lint compared the two tips (`develop..branch`) and named the branch `develop` in code. It had no spec of its own; it has one now.
- Follow-up 2026-10-09: the lint already had a spec, in `plugins/proposals/tests`, importing the script by a relative path; this slice's first publication (#942) did not see it, changed the diff range, and left the integration branch red on it, because a change under `tools/` does not select the proposals zone. Its cases now live in the spec beside the script, where the planner selects them with it, and the cross-zone copy is gone.

### S32 — A change reaches the zones of the files that import it by path
- **Status**: review
- **Files**: `tools/scripts/ci/path-importers.ts`, `tools/scripts/ci/path-importers.spec.ts`, `tools/scripts/ci/test-zones.script.ts`
- **Gate**: type
- acceptance:
  - "The test planner adds, for every changed source file, the zone of each tracked file that imports it by a relative path, in whatever workspace that file lives, so a spec that tests another workspace's script runs when the script changes."
- Found 2026-10-09: S31 changed a lint under `tools/`, its older spec sat in the proposals zone and imported the script by path, the planner selected only the tools zone, the pull request (#942) was green and the integration branch went red. The workspace graph follows package names and has no edge for such an import; thirty-four files import across workspaces this way, twelve of them in core.

### S33 — What the product writes in its cache is not stray
- **Status**: review
- **Files**: `tools/scripts/lint/check-stray-cache-files.script.ts`
- **Gate**: type
- acceptance:
  - "`lint:stray-cache-files` accepts the cache directories the product itself writes: `telemetry/` (the work-event and transition-duration journals) and `logs/` (the server's own log)."
- Found 2026-10-09: handing a proposal to review wrote the transition journal under `.cache/delendai/telemetry/`, the lint called the directory stray, and the pre-commit hook refused the commit the transition itself needed. The server log directory of S25 was unknown to it in the same way.

### S34 — A slice's reservation ends when its unit's publication lands
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/slice-reservation-reap.service.ts`, `packages/core/tests/src/lib/work-units/slice-reservation.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A slice reservation whose unit has no branch on the forge and whose publication a merge on the integration branch names is released at once; one whose unit is simply gone is still kept for the abandonment window."
- Found 2026-10-10: `work enter --slice=all` on this proposal was refused because S31 was "reserved on the forge", hours after its unit had published and merged (#951). The reaper released a branchless unit's reservation only after the whole abandonment window, which is right for a unit nobody knows the fate of and wrong for one that landed.

## acceptance

- An identity that names no model (a persona such as `illyria`), or a family without its version (`minimax-3` for MiniMax M3.1), is refused at `work enter` and at every verdict, with the spelling the host reports for the model it runs.
- One model has one spelling everywhere: the ref segment, the verdict line and the review lines agree (`minimax-m3.1`, not `minimax-m31` in the ref and something else in the document).
- A commit that changes a slice's review lines or a proposal's status without the review tool's record (its commit, or its trailer) fails a gate, so a verdict written by hand cannot pass for one the tool checked.
- After `proposals create` names a `new` unit's proposal, the `new/all` reservation and the `<agent>-new-all` worktree directory are free: a second new proposal can be started without `--alongside` or `--dir`.
