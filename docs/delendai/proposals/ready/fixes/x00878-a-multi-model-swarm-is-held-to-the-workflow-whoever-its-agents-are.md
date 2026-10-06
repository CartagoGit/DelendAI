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

- **2026-10-06 17:50, identities on the forge.** Review units appeared as `minimax-3` (two units), `minimax-m31`, `glm-5.3-flash` (four units, g1–g4), `gpt-5.4` and `illyria`. `minimax-3` names a family, not the model the agent runs (MiniMax M3.1, as the owner reports); `minimax-m31` is that model with its dot dropped, so the same model has two spellings; `illyria` is no model at all. Every one was accepted, and the name is now recorded as the reviewer in proposal documents (`review-reviewer: minimax-3` on x00752), which is where model independence (`reviewIndependence: model`) is judged.
- **2026-10-06 17:44, a verdict committed by hand.** `minimax-3` committed `chore(review): approve x00752 S1 — …`, moving the proposal to `done` with its review lines, under a message of its own instead of the review tool's record (`chore(delendai): delendai_proposals_proposal_review …`). Nothing distinguishes it from a verdict the tool checked.
- **2026-10-06 17:49, one agent, two spellings, two record shapes.** `gpt-5.4`'s unit recorded `review-reviewer: GPT-5.4` and `approved by GPT-5.4` (f00275): the ref and the document disagree on case. Its verdicts were committed under two subjects, `chore(delendai): delendai_proposals_proposal_review f00275 S1 approve` and `chore(delendai): delendai review approve f00275`; a check that tells a tool's record from a hand-written one needs one shape (or a trailer), not a subject that varies with the entry point.
- **2026-10-06 18:50, a commit says more than it did.** `minimax-3` committed `chore(review): approve x00835 S1-S33 — …`; the commit adds one approval (one slice). A reader of the history, or a reviewer counting verdicts, is told thirty-three.
- **2026-10-06 19:00, proposals closed by hand, beside the closer.** `minimax-3` committed `chore(review): close x00770, x00799, x00868, x00870, x00873 — …`, moving three of them (not five) from `review/` to `done/` and editing their status, without the transition tool, while the owner machine's closer had the same five in its own pull request (#848). Two writers for one transition, and the closes are not the tool's.
- **2026-10-06 18:21–18:50, verdict commits under the agents' own subjects.** `glm-5.3-flash` (`chore(review): x00556 S3+S6 approve (proposal done)`, `docs(review): record batch verdicts for x00790 x00872 f00547`, `chore(review): x00556 close — S1-S6 approved by …`), `illyria` (`chore(delendai): f00538 closes after the last approval`, `chore(review): q00010 S3 requested changes (…)`) and `minimax-3` committed verdicts and closes under messages of their own. Their review lines carry the tool's evidence format, so the tool may have written them and the agent committed (as when the CLI's call timed out, x00875 S20); either way the record does not say which, and the pull requests of these packs are titled by those messages (#854 `chore(review): approve x00752 S1 — …`, #850 `review batch`).
- **2026-10-06 ~20:00, what the swarm left when its agents said they were done.** The review queue still held 20 proposals (44 slices needing a verdict, 16 claimed by others, 9 approved and not closed), where a swarm that worked would have left none. On the forge: publications `minimax-3` ×5, `glm-5.3-flash` ×2, `illyria` ×1, work refs `minimax-3` ×2 and `gpt-5.4` ×1, and 43 review reservations, 25 of them naming a unit whose work ref and publication no longer exist. A reservation lapses only after its hours (`REVIEW_RESERVATION_SECONDS`), not when its unit ends, so a finished agent kept proposals out of every other reviewer's hands, and nothing deletes the ref afterwards.
- **2026-10-06, swarm packs that cannot land.** `lint-governance` refused #851 (`glm-5.3-flash`: it closes a proposal whose slices lack an approval by someone other than their implementer), #856 (`minimax-3`: it closes x00770, x00799, x00868, x00870 and x00873, which it never claimed) and #858 (`illyria`: `proposal-cited-commits`, it cites commits that do not exist). Each pack waits for a person, and its verdicts with it; the agents reported done. The owner machine's closer was refused the same way (x00875 S29 fixes that one).
- **2026-10-06, `--alongside` reused a generation an open publication held.** `work enter --alongside` gave `x00875-S29-g1` while `delendai/pr/…/x00875-S29-g1/…` (#861) was open, a second ref with the same identity; only `--generation=2` avoided it. An open publication is a generation in use.
- **2026-10-06, a `new` unit keeps its slot after it names its proposal.** Once `proposals create` turned `new/all` into x00877, the `new/all` reservation and the `claude-opus-5-5-new-all` directory still blocked the next new proposal: `work enter --proposal=new` was refused until given `--alongside` and `--dir`.

## non-goals

- Correcting an agent's behaviour by instruction alone: every finding is closed by a gate or a product change that holds for any model and host.
- Judging the quality of a verdict's reasoning: this is about records the workflow can check (who, through which tool, with which evidence).

## slices

- global_gate: none

### S1 — An agent signs with the model it runs as
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/agent-identity.service.ts`
- **Gate**: type
- acceptance:
  - "An identity that names no model (a persona such as `illyria`), or a family without its version (`minimax-3` for MiniMax M3.1), is refused at `work enter` and at every verdict, with the spelling the host reports for the model it runs."
  - "One model has one spelling everywhere: the ref segment, the verdict line and the review lines agree (`minimax-m3.1`, not `minimax-m31` in the ref and something else in the document)."

### S2 — A verdict reaches the document only through the review tool
- **Status**: pending
- **Files**: `tools/scripts/lint/review-lines-written-by-the-tool.script.ts`
- **Gate**: type
- acceptance:
  - "A commit that changes a slice's review lines or a proposal's status without the review tool's record (its commit, or its trailer) fails a gate, so a verdict written by hand cannot pass for one the tool checked."

### S3 — A created proposal releases the reservation and directory of its `new` unit
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/new-proposal-unit.service.ts`
- **Gate**: type
- acceptance:
  - "After `proposals create` names a `new` unit's proposal, the `new/all` reservation and the `<agent>-new-all` worktree directory are free: a second new proposal can be started without `--alongside` or `--dir`."

### S4 — A review reservation ends with its unit
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/review-reservation.service.ts`, `plugins/proposals/src/lib/contracts/constants/review-reservation.constant.ts`, `plugins/proposals/tests/src/lib/tools/review-reservation.spec.ts`, `tools/scripts/git/ended-reservations.service.ts`, `tools/scripts/git/ended-reservations.service.spec.ts`, `tools/scripts/git/maintain-ref-namespace.script.ts`
- **Gate**: type
- acceptance:
  - "A reservation whose unit has neither a work ref nor a publication on the forge is free at once, whatever its hours, and the queue does not count it as held."
  - "Such a reservation ref is deleted by the reaper that already removes finished units, so none outlives its unit on the forge."
- Delivered: a reservation whose unit is on the forge neither as a work ref nor as a publication (one `ls-remote` of the path after the agent matches both), and that is older than `REVIEW_RESERVATION_UNIT_GRACE_SECONDS` (15 minutes, the time a fresh unit needs to be pushed), counts as lapsed: the next reviewer takes it over at once. The namespace maintenance that runs after every merge drops such reservations from the forge, each only if it is still the commit it read. A dry run on this repository's forge found 14 to drop. Both specs fail without the change.

### S5 — A pack that cannot land is refused before it is published
- **Status**: pending
- **Files**: `packages/cli/src/commands/review.command.ts`
- **Gate**: type
- acceptance:
  - "`review finish` (and `review next` when it publishes a full pack) runs the pack's governance checks (independent approval, claimed proposals, cited commits) before publishing, and refuses with what to fix, so a reviewer is never told its pack is done while CI will refuse it."

### S6 — An open publication is a generation in use
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-generation.service.ts`
- **Gate**: type
- acceptance:
  - "`work enter`, with or without `--alongside`, never gives a generation whose publication is open on the forge."

## acceptance

- An identity that names no model (a persona such as `illyria`), or a family without its version (`minimax-3` for MiniMax M3.1), is refused at `work enter` and at every verdict, with the spelling the host reports for the model it runs.
- One model has one spelling everywhere: the ref segment, the verdict line and the review lines agree (`minimax-m3.1`, not `minimax-m31` in the ref and something else in the document).
- A commit that changes a slice's review lines or a proposal's status without the review tool's record (its commit, or its trailer) fails a gate, so a verdict written by hand cannot pass for one the tool checked.
- After `proposals create` names a `new` unit's proposal, the `new/all` reservation and the `<agent>-new-all` worktree directory are free: a second new proposal can be started without `--alongside` or `--dir`.
