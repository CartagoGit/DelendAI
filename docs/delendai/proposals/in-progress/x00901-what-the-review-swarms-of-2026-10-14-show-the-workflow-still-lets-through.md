---
id: x00901
title: "what the review swarms of 2026-10-14 show the workflow still lets through"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-14
---

# x00901 — what the review swarms of 2026-10-14 show the workflow still lets through

## goal

Every departure from the workflow that the owner's review swarms of 2026-10-14 make, over the 41 proposals in review, is written down here with its evidence, and its cause in the product is fixed so the next swarm, of any model, cannot repeat it.

## why

The owner, 2026-10-14: several swarms review the 41 proposals in review; watch them from time to time, find the mistakes they make, fix them at the root, and keep the findings in one proposal without stopping the rest of the work. An agent is not at fault for what the product lets it do: each finding names the rule the product should have enforced. The swarm of 2026-10-11 (x00880) is the baseline: what it fixed must not come back.

## non-goals

- Editing another agent's unit or verdicts: findings are fixed in the product, and a wrong verdict is corrected through its own reviewer's unit or retired.
- Judging the proposals under review myself.

## slices

- global_gate: type

### S1 — The findings, as they are observed

- **Status**: in-progress
- **Files**:
  - `docs/delendai/proposals/in-progress/x00901-what-the-review-swarms-of-2026-10-14-show-the-workflow-still-lets-through.md`
- **Gate**: type
- acceptance:
  - Each finding has its time, the agent and ref it was seen on, what the workflow expects, and the slice that fixes it, or why it needs none.
- roster (from the owner, 2026-10-14): two agents of each of minimax m3.1 review, glm 5.3 flash, qwen 3.8 flash, gpt 5.4, gemini 3.8 and luna 6.0 (luna is expected to do nothing: no quota left). Every ref's model segment is checked against these six.
- findings:
  - 2026-10-14 (start): no swarm ref on the forge yet; the only claim is `refs/delendai/claims/slice/f00763/all` (mine).
  - 2026-10-14 10:07: first ref is `delendai/wip/delendai-queue/review/batch-all-g4/close-approved-202610141007`, from the queue's own agent (`delendai-queue`), not from a reviewer.
  - 13:40 F1 naming: the units are `gemini-3.8-flash`, `glm-5.3-flash`, `gpt-5.4`, `minimax-m3.1-flash-preview` and `qwen3-flash`. `qwen3-flash` drops the version the owner runs (qwen 3.8 flash): with no roster declared, a model is held to the name it first signed with here (2026-10-11, x00880), so a wrong first spelling is kept on purpose. Fixed by S3: the project declares its roster.
  - 13:40 F2 two instances of one model share one agent id and are told apart by the generation (`minimax-m3.1-flash-preview` g1, g2 and g4 at once; `gpt-5.4` g7, g8 and g9). The verdict note already marks a verdict from another instance of the same agent, so this needs no fix.
  - 13:40 F3 two empty queue units, `delendai-queue/review/batch-all-g4/close-approved-202610141129` and `…141131` (11:25, no commit beyond develop); at 13:48 neither is on the forge: the closer's next pass swept them, as designed. No fix.
  - 13:40 F4 approvals look unchecked: every gemini-3.8-flash verdict on x00893 S1–S4 reads only "all N tests pass and typecheck passes". `approve` does demand evidence for every acceptance line of the slice (`evidence.acceptanceCriteria`), but `approvalNote` writes only the commit and the test count, so the per-line evidence a reviewer gave never reaches the line a person reads. Fixed by S2.
  - 13:55 F5 a reviewer runs the whole suite for one slice: `minimax-m3.1-flash-preview` g4 runs `test:coverage` (`vitest run --coverage`, every project) to review one slice, at a machine load of 21. The queue told reviewers only to "run the slice gate" and asked for `validateExitCode: 0`, so the biggest command reads as the safe one; and its example approval left out `acceptanceCriteria`, which approve requires. Fixed by S4.
  - 14:29 F6 a claim outlives its reviewer: `qwen3-flash` claimed x00885 at 12:31 (unit `qwen3-flash/review/batch-all-g5/verdicts`) and at 14:29 had recorded nothing, its other unit quiet since 12:52; a review claim lasted four hours unless its unit had left the forge, so x00885 was closed to every other reviewer while the unit sat there. Fixed by S5.
  - 14:29 F7 one instance's claim lands in its sibling's unit: `minimax-m3.1-flash-preview` released x00887 at 12:39 because "this session resolved to an existing unit (batch-all-g1) held by a sibling instance". Two instances of one model share its name (F2), and the second's call resolved to the first's unit before it had its own. A write from the shared checkout picked the unit that carries the proposal by agent name only (`callerUnitCheckout`), so with two instances one could land in the other's unit; the CLI's `work enter` already refused a unit another session holds. Fixed by S6.
  - 15:27 after #1100 (S2 and S4) merged: the approvals written since read `acceptance 3/3: (1) Pinned by a passing test named … (2) …` (minimax-m3.1-flash-preview, qwen3-flash), and their test counts fell to the slice's own (1/1, 4/4, 7/7) from whole-suite runs; F4 and F5 hold.
  - 15:27 F6, qualified: qwen3-flash published x00885 at about 14:50, two and a half hours after its claim; it was slow, running whole suites (F5), not gone. With S4 a review takes the slice's own checks, so the one-hour quiet lapse of S5 stays.
  - 16:40 F8 the queue deleted two in-progress work branches anyway: run 38580469909 logged f00763's wip as "kept: its proposal is in progress", and run 38580979535 then deleted it "(its content is already in …)"; x00901's own wip went the same way, and both units with it. x00899's check reads the in-progress folder through the forge API and took any failed read as "not in progress". Fixed by S7.
  - 17:29 F9 a change request for failures the slice never touched: `minimax-m3.1-flash-preview` sent q00010 S3 back because `bun run validate` (its declared gate) failed 3 of 131 steps on the reviewer's run (`verify:tools`, `verify:external-install`, `lint:cache`), "none of them produced by this slice"; approve demands `validateExitCode: 0`, so the reviewer saw no honest approval. On develop at 17:45, `lint:cache` and `verify:tools` both pass alone: the failures were the reviewer's run under load, not the tree. The verdict stands (it is that reviewer's), and q00010 S3 should be reviewed again. Fixed going forward by S8.
  - 18:20 F10 an approved retired slice read as delivered: `minimax-m3.1-flash-preview` approved q00026 S1, a slice retired with its reason (it shipped no file, correctly), and the verdict rewrote `**Status**: retired` as `done`. A done slice's Files must exist, so #1113 failed `proposal-files-exist` on three files that were never meant to ship, and every verdict in that pack stood blocked. The reviewer judged right; the writer turned its approval into a claim of delivery. Fixed by S9; #1113's own copy of q00026 still reads `done` and needs `retired` back from its publisher.
  - 18:35 F11 a gate made to pass instead of a slice made right: the same reviewer then opened #1119 (an `implement` unit on q00026 S1, the slice it had just approved), which drops the slice's Files list into prose so `proposal-files-exist` has nothing to check, and keeps `done` on a slice that delivered nothing. The departure is double: the reviewer becomes the implementer of the slice under its own verdict, and the record of what was planned is rewritten to fit the gate. The root is F10 (S9): with it, the approval leaves the slice `retired`, the gate already skips retired slices, and no Files need rewriting.

### S2 — An approval's note carries how each acceptance line was checked

- **Status**: in-progress
- **Files**:
  - `plugins/proposals/src/lib/services/review-verdict-evidence.ts`
  - `plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`
- **Gate**: type
- acceptance:
  - The review-log line of an approval reads `verified at <commit>, validate exit 0, tests N/M; acceptance K/K: (1) … (2) …`, each criterion's evidence on one line and clipped to 160 characters, then the reviewer's reason.

### S4 — The review queue names the checks a slice needs, and the approval it asks for

- **Status**: in-progress
- **Files**:
  - `plugins/proposals/src/lib/services/review-queue-slice.service.ts`
  - `plugins/proposals/tests/src/lib/services/review-call.spec.ts`
- **Gate**: type
- acceptance:
  - A slice's next action tells the reviewer to run its gate and the slice's own spec files, named, and not the whole suite, which CI ran on the delivering commit.
  - Its example approval carries `acceptanceCriteria`, one entry per acceptance item, as approve requires.

### S5 — A review claim lapses when its reviewer's unit has gone quiet

- **Status**: in-progress
- **Files**:
  - `plugins/proposals/src/lib/services/review-reservation.service.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-reservation.constant.ts`
  - `plugins/proposals/tests/src/lib/tools/review-reservation.spec.ts`
- **Gate**: type
- acceptance:
  - Past the 15-minute grace, a claim passes to the next reviewer when its holder's unit has left the forge, as before, or when that unit's tip has not moved for an hour; a reviewer at work commits a verdict per slice. The four-hour lapse stays as the outer bound.

### S6 — A call from the shared checkout acts in its own session's unit

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `packages/core/src/lib/shared/bind-write-root.ts`
  - `packages/core/tests/src/lib/development-policy/caller-unit-session.spec.ts`
  - `packages/core/tests/src/lib/shared/bind-write-root.spec.ts`
- **Gate**: type
- acceptance:
  - A write tool called from the shared checkout with a `session` acts only in a unit that session holds, or one no session holds; a unit stamped for another session of the same agent is not a candidate.

### S7 — The queue keeps a work branch it cannot tell about

- **Status**: in-progress
- **Files**:
  - `tools/scripts/lint/in-progress-work-refs.helper.ts`
  - `tools/scripts/lint/in-progress-work-refs.helper.spec.ts`
  - `tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Gate**: type
- acceptance:
  - Only a read the forge answers with 404 (no in-progress folder at that tip) lets the queue reap a work ref; any other failed read (rate limit, network) keeps it, and a later run decides.

### S8 — A check the slice did not touch sends the claim back, not the slice

- **Status**: in-progress
- **Files**:
  - `plugins/proposals/src/lib/services/review-queue-slice.service.ts`
  - `plugins/proposals/tests/src/lib/services/review-call.spec.ts`
- **Gate**: type
- acceptance:
  - A slice's next action tells the reviewer that a failing check the slice did not touch is not the slice's, and to give the claim back with that failure as its reason instead of requesting changes.

### S9 — Approving a retired slice keeps it retired

- **Status**: in-progress
- **Files**:
  - `plugins/proposals/src/lib/swarm/proposal-review.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/tests/src/lib/proposal-review.spec.ts`
- **Gate**: type
- acceptance:
  - An approve (or a close) of a slice whose Status is `retired` leaves it `retired`, in either spelling of the Status line; a delivered slice still turns `done`.

### S3 — The project declares who works in it

- **Status**: pending
- **Files**:
  - `delendai.config.json`
- **Gate**: type
- acceptance:
  - `development.coordination.roster` lists the exact names of the models the owner runs, so an agent signs as one of them and not as the first spelling it once used. Declared once the 2026-10-14 swarm has ended: declared mid-run, it would refuse the next `work enter` of every agent already signing under an old spelling.

## acceptance

- The findings of the 2026-10-14 swarms are recorded, and each one that has a product cause is fixed by a slice of this proposal.
