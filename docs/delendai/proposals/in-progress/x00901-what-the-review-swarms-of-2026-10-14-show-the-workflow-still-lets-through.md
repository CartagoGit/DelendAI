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

### S3 — The project declares who works in it

- **Status**: pending
- **Files**:
  - `delendai.config.json`
- **Gate**: type
- acceptance:
  - `development.coordination.roster` lists the exact names of the models the owner runs, so an agent signs as one of them and not as the first spelling it once used. Declared once the 2026-10-14 swarm has ended: declared mid-run, it would refuse the next `work enter` of every agent already signing under an old spelling.

## acceptance

- The findings of the 2026-10-14 swarms are recorded, and each one that has a product cause is fixed by a slice of this proposal.
