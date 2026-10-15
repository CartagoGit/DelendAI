---
id: x00901
title: "what the review swarms of 2026-10-14 show the workflow still lets through"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-14
last-transition-id: 05f0d5f4-41d9-4788-89c4-e8c2662ca0cc
last-correlation-id: 05f0d5f4-41d9-4788-89c4-e8c2662ca0cc
last-transition-from: in-progress
last-transition-at: 2026-10-14T23:06:15.473Z
shipped-in:
  - "0ca0d787b80e1e598c5bc2381de801465903f641"
  - "e83bd8cd7e22"
  - "b34e7ef5629d"
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

- **Status**: done
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
  - 18:50 F12 a tool's verdict that can never land: in `qwen3-flash`'s pack (#1101) the approval of x00885 S1 is the review tool's own write (its `shipped-in` frontmatter, its review lines), yet it reached the branch in the start pass's `chore(wip): keep the uncommitted work found at start`, two hours after it was written. The tool's commit had failed; it said so to the agent and kept nothing. Under that subject `verdicts-through-the-tool` reads the lines as hand-written, and the review tool refuses to approve a slice already done, so the pack is red for good. Fixed by S10; #1101 itself needs its publisher to record S1 again in a fresh unit.
  - 19:20 F13 a suite that fails only under an agent: `gpt-5.4` sent x00892 S1, S2 and S3 back because `work-unit.service.spec.ts` failed 'names what a publication is missing instead of guessing' on its run. The spec resolves the agent from the environment; under `DELENDAI_AGENT_ID=gpt-5.4` it guessed that agent's work ref instead of refusing, and as a person (as CI runs it) it passes. The slices were right; the suite read the reviewer. Fixed by S11; x00892's three slices go back to review.
  - 21:20 F14 an attestation that names everybody: in #1133 `glm-5.3-flash` attested `Cartago` as the implementer of q00014's six slices, from `git log` ("traces author Cartago"), then moved q00014 to done. Every agent here commits under that one Git author, so the name says what Git already says and stands for anyone: it fills the implementer field with a name no reviewer can be, and the independence check passes on it. The governance check held the pull request for the owner's label, as it should. The slices' approvals came from a fourth spelling of qwen, `qwen-3.8-max` (with `qwen3-flash`, and neither matches the qwen 3.8 flash the owner launched): the roster (S3) is what ends it. Fixed by S12.
  - 22:30 F15 why #1101 lost its verdict: the server log reads `delendai could not commit what this call wrote to delendai/wip/qwen3-flash/review/batch-all-g5/verdicts (git timed out after 60000ms)`, six times on 2026-10-14. A tool's commit runs the repository's hooks (the guard, the formatter, the secrets scan), and with several agents running `validate` at once they took more than the 60 seconds every git call gets; the commit was killed, and the verdict waited for a start pass that committed it under its own subject (F12). Fixed by S13, and S10 commits what still fails as the tool's.
  - 22:30 F16 an agent acting as another, and one evading the guard: `minimax-m3.1-flash-preview` released a claim of `gemini-3.8-flash` (out of quota) by running `review release --agent=gemini-3.8-flash` from gemini's own worktree, and it worked; `qwen3-flash` prefixed its commands with `unset AI_AGENT`. The claim of a reviewer that went quiet already lapses by itself (S5); the rules now say never to act under another agent's name or in its unit (S3), and never to clear the markers (x00902). Its names show the canon was missing: `minimax-3.1-flash-preview` and `minimax-m3.1-flash-preview` from two instances of one model, `gemini-3.8-flash-high`.
  - 23:50 F17 an attestation that claims nothing: closing q00014 on its session record, `claude-opus-5-5` attested its slices in a review unit that had not claimed it, and #1140 failed `closed-with-independent-approval` ("changes q00014 without having claimed it") after it was published. A verdict claims its proposal before it is written; an attestation, which changes the same document, took a short path that skipped the claim. Fixed by S15.
- shipped-in: `3e998d361bdf`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at 0ca0d787b80e, validate exit 0, tests 1/1; acceptance 1/1: (1) Read the delivered findings F1-F12 in the proposal document at the candidate merge 0ca0d787b80 (PR #1144): each carries its timestamp, the agent and unit ref o… — Judged at 0ca0d787b80 (PR #1144 merge), an ancestor of origin/develop. The findings read as observations with time+agent+ref+expectation+fix, exactly the criterion; F2 and F3 correctly state why no fix follows.

### S2 — An approval's note carries how each acceptance line was checked

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/services/review-verdict-evidence.ts`
  - `plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`
- **Gate**: type
- acceptance:
  - The review-log line of an approval reads `verified at <commit>, validate exit 0, tests N/M; acceptance K/K: (1) … (2) …`, each criterion's evidence on one line and clipped to 160 characters, then the reviewer's reason.
- shipped-in: `e83bd8cd7e22`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at e83bd8cd7e22, validate exit 0, tests 1/1; acceptance 1/1: (1) review-verdict-evidence.ts:35 builds the verified-at prefix; :41-48 joins each criterion as (N) evidence clipped at :55 EVIDENCE_CLIP=160 with ellipsis; the re… — Judged at e83bd8cd7 (PR #1100 merge), an ancestor of origin/develop per the slice shipped-in. The format is implemented exactly as the criterion words it and is observable in the review-log lines already merged into develop.

### S4 — The review queue names the checks a slice needs, and the approval it asks for

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/services/review-queue-slice.service.ts`
  - `plugins/proposals/tests/src/lib/services/review-call.spec.ts`
- **Gate**: type
- acceptance:
  - A slice's next action tells the reviewer to run its gate and the slice's own spec files, named, and not the whole suite, which CI ran on the delivering commit.
  - Its example approval carries `acceptanceCriteria`, one entry per acceptance item, as approve requires.
- shipped-in: `b34e7ef5629d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at b34e7ef5629d, validate exit 0, tests 1/1; acceptance 2/2: (1) review-procedure.ts:40 builds the per-slice approve command demanding evidence with acceptanceCriteria (one entry per acceptance item, criterion + evidence), a… (2) The example approval the procedure serves carries acceptanceCriteria as approve requires; live evidence: the queue served me this criterion-shaped approve comm… — Judged at b34e7ef5629d, an ancestor of origin/develop per the slice shipped-in. Verified in the delivered tree: the queue procedure names the slice gate and specs and its example approval carries acceptanceCriteria per item; also visible live in the approve command the queue served me this session.

### S5 — A review claim lapses when its reviewer's unit has gone quiet

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/review-reservation.service.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-reservation.constant.ts`
  - `plugins/proposals/tests/src/lib/tools/review-reservation.spec.ts`
- **Gate**: type
- acceptance:
  - Past the 15-minute grace, a claim passes to the next reviewer when its holder's unit has left the forge, as before, or when that unit's tip has not moved for an hour; a reviewer at work commits a verdict per slice. The four-hour lapse stays as the outer bound.
- shipped-in: `2d3fcbd61cb3`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — A call from the shared checkout acts in its own session's unit

- **Status**: review
- **Files**:
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `packages/core/src/lib/shared/bind-write-root.ts`
  - `packages/core/tests/src/lib/development-policy/caller-unit-session.spec.ts`
  - `packages/core/tests/src/lib/shared/bind-write-root.spec.ts`
- **Gate**: type
- acceptance:
  - A write tool called from the shared checkout with a `session` acts only in a unit that session holds, or one no session holds; a unit stamped for another session of the same agent is not a candidate.
- shipped-in: `2d3fcbd61cb3`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — The queue keeps a work branch it cannot tell about

- **Status**: review
- **Files**:
  - `tools/scripts/lint/in-progress-work-refs.helper.ts`
  - `tools/scripts/lint/in-progress-work-refs.helper.spec.ts`
  - `tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Gate**: type
- acceptance:
  - Only a read the forge answers with 404 (no in-progress folder at that tip) lets the queue reap a work ref; any other failed read (rate limit, network) keeps it, and a later run decides.
- shipped-in: `ca442e742326`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S8 — A check the slice did not touch sends the claim back, not the slice

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/review-queue-slice.service.ts`
  - `plugins/proposals/tests/src/lib/services/review-call.spec.ts`
- **Gate**: type
- acceptance:
  - A slice's next action tells the reviewer that a failing check the slice did not touch is not the slice's, and to give the claim back with that failure as its reason instead of requesting changes.
- shipped-in: `b34e7ef5629d`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S9 — Approving a retired slice keeps it retired

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/swarm/proposal-review.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/tests/src/lib/proposal-review.spec.ts`
- **Gate**: type
- acceptance:
  - An approve (or a close) of a slice whose Status is `retired` leaves it `retired`, in either spelling of the Status line; a delivered slice still turns `done`.
- shipped-in: `3e998d361bdf`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S10 — A tool's writes whose commit failed are committed as the tool's

- **Status**: review
- **Files**:
  - `packages/core/src/lib/shared/commit-call-writes.ts`
  - `packages/core/src/lib/shared/pending-call-writes.store.ts`
  - `packages/core/src/lib/contracts/interfaces/pending-call-writes.interface.ts`
  - `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
  - `packages/core/tests/src/lib/shared/commit-call-writes.spec.ts`
  - `packages/core/tests/src/lib/shared/pending-call-writes.store.spec.ts`
- **Gate**: type
- acceptance:
  - When a tool's commit fails, its subject and the content it left in each path are kept beside the worktree's git metadata.
  - The next tool call in that worktree, and the start pass before it keeps uncommitted work, commit those paths under the tool's subject while their content is still the tool's; a path changed since is left to whoever commits it.
- shipped-in: `98003fdc9819`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S11 — A suite does not read the identity of the agent running it

- **Status**: review
- **Files**:
  - `tools/scripts/test/hermetic-agent-identity-setup.ts`
  - `vitest.shared.ts`
- **Gate**: type
- acceptance:
  - Every vitest project built on the shared setup starts its specs with no agent identity in the environment (`DELENDAI_AGENT_ID`, the host markers and prefixes, `DELENDAI_SESSION`): `work-unit.service.spec.ts` passes under `DELENDAI_AGENT_ID=gpt-5.4` as it does in CI.
- shipped-in: `5ddb4f933a0c`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S12 — An attestation never names the Git author of the delivering commit

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/attested-implementer.service.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/attestation.interface.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/tests/src/lib/services/attested-implementer.service.spec.ts`
- **Gate**: type
- acceptance:
  - `proposal_review attest` refuses an implementer that is the Git author (name or email) of the slice's `shipped-in` commit, saying that Git already names it and every agent committing here shares it.
- shipped-in: `3e998d361bdf`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S15 — An attestation claims its proposal, as a verdict does

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`
- **Gate**: type
- acceptance:
  - `proposal_review attest` in a review unit claims the proposal before writing, and is refused, writing nothing, when another unit holds it.
- shipped-in: `3e998d361bdf`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — An agent names itself, and always in one shape

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/agent-name-canon.service.ts`
  - `packages/core/src/lib/contracts/constants/agent-name-canon.constant.ts`
  - `packages/core/src/lib/work-units/agents-seen.service.ts`
  - `packages/core/src/lib/contracts/constants/agent-environment.constant.ts`
  - `packages/core/tests/src/lib/work-units/agent-name-canon.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/kept-unit-hydration.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/review-pack-scope.spec.ts`
  - `packages/core/tests/src/lib/work-units/slice-reservation.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/swarm-storm.e2e.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-unit-lease.spec.ts`
- **Gate**: type
- decision (the owner, 2026-10-14): which model an agent is, only the agent knows, and the models change (a version number, a tier); the project does not keep a list of them. It fixes how a name is written, so every instance of one model writes the same name.
- acceptance:
  - `work enter` refuses a name not written in the canon — lowercase, hyphen-separated, the maker first in letters only, the version as the maker publishes it in a part of its own, then the tier, no effort word — and says what is wrong and how it would read (`qwen3-flash` → `qwen-3…`; `gemini-3.8-flash-high` → leave `high` out). A re-spelling of a name already at work is pointed at that name first. The product's own actors (`<namespace>-<role>`, the queue) keep their names.
  - The rules every agent receives state the canon with examples.
  - A declared roster stays optional, for an owner who wants to hold a swarm to fixed names.
- shipped-in: `98003fdc9819`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S13 — A commit of a tool's writes has the time its hooks need

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/constants/call-writes.constant.ts`
  - `packages/core/src/lib/shared/commit-call-writes.ts`
  - `packages/core/src/lib/work-units/unit-forge-sync.service.ts`
- **Gate**: type
- acceptance:
  - The commit of a call's writes, the commit of pending writes and the start pass's commit run with a ten-minute limit (`COMMIT_TIMEOUT_MS`), not the 60 seconds of a plain git call: they run the repository's hooks.
- shipped-in: `98003fdc9819`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The findings of the 2026-10-14 swarms are recorded, and each one that has a product cause is fixed by a slice of this proposal.
