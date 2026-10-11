---
id: x00882
title: "Nothing is left stuck after a swarm, and one mechanism does each job"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-11
last-transition-id: 9c156034-53c0-4218-951f-3ce8411982d9
last-correlation-id: 9c156034-53c0-4218-951f-3ce8411982d9
last-transition-from: ready
last-transition-at: 2026-10-11T12:24:48.449Z
---

# x00882 — Nothing is left stuck after a swarm, and one mechanism does each job

## goal

After a swarm of reviewers ends, every proposal it touched is either closed, back with someone who can act on it, or waiting for a verdict a reviewer can give; and each job of the workflow (naming an agent, bringing a candidate forward, settling a silent unit) is done by one mechanism.

## why

The review swarm of 2026-10-11 ended at 13:09 and its last agent reported that no review was left. `proposals status` still counted nine proposals in review. Read one by one on the forge and in the documents, every one of them was held by something the product did or allowed, and nothing in the product was going to move any of them:

- **A pack in conflict.** #1017 (`glm-5.3-max`) carries eight approvals of f00547 and four of x00881 with its close. Its implementer republished x00881 after the pack was opened; the pack conflicts with the integration branch, no check runs on it, and nobody is told.
- **A pack of nothing.** #1018 holds two claims and two releases, zero changed files, red on `candidate-delivers`. Publishing such a unit is refused since x00880 S11; this one was published the hour before.
- **Changes requested of nobody.** f00271 S1 waits on an implementer named `GitHub`, the committer of a merge. q00014 S7 waits on `unrecorded`. Both proposals sit in `review/` with a slice that only "its implementer" may resubmit, and no such agent exists.
- **Approved and not closable.** x00539 has every slice approved and no `shipped-in` in its frontmatter, which the close requires and nothing writes.
- **A close left to the owner, with no place that says so.** f00538 (#1008).
- **Verdicts in units nobody will publish.** Two reviewers hold one approval of f00547 each in work refs silent for eight hours.

Three more findings of the same day belong here, because each is the same job done by two mechanisms:

- **Two refreshers.** `forge:artifacts` brings forward the head of the queue and what overlaps, as the queue's own rules say. `forge:refresh --apply` brings forward everything that is behind. The orchestrator's own pump ran the second every four minutes for four days: every merge restarted the checks of every open pull request, the head included (x00880, observations 24 and 29).
- **A name the agent has to make up.** x00880 S2 let a project list the names its agents may sign as. The owner's answer: an agent knows what it is (its host, its vendor, its model), and that is what should name it. Three spellings of one model came from asking for a free-form name, not from the agent's not knowing.
- **Long test runs died for ninety minutes.** Between 11:56 and 12:10 four runs of the orchestrator ended with exit code 144 (signal 16) while the swarm was working beside it, and none before or since. Nothing in this repository sends that signal.

## non-goals

- Publishing another reviewer's verdicts under any name but its own.
- A registry of every model that exists.

## slices

- global_gate: none

### S1 — One refresher: what is behind is brought forward by the queue's rules, or not at all

- **Status**: review
- **Files**:
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
  - `package.json`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/tests/src/lib/work-units/workflow-invariants.service.spec.ts`
  - `.github/workflows/keep-the-queue-moving.yml`
- **Gate**: unit
- shipped-in: `878cf31757c9`
- acceptance:
  - There is one command that brings candidates forward, and it follows the queue's dispositions: the head, a red candidate once, a queued one the integration branch changed a file under. A candidate that would land as it is is not touched.
  - `forge:refresh` and `forge:artifacts` are one script; the refresher that brought forward every candidate behind is gone.
  - Whatever names the remedy for a stale candidate names that command.
  - No invariant holds "every candidate contains the integration branch": it is what named the removed command as a remedy.

Delivered 2026-10-11. The hydrator had stopped calling the second refresher weeks ago, for the reason written in its own header; the script stayed, `work doctor` kept reporting candidates behind as a broken invariant with that script as the fix, and the orchestrator did what the doctor said, on a loop of its own outside the product. That loop is stopped (two shell scripts, four days old). 365 lines of refresher, its spec and its types are deleted with the invariant. The host server's own hydration is what brings candidates forward now, and nothing else.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — An agent names itself, and a model keeps the first name it signed with

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/agent-alias.service.ts`
  - `packages/core/src/lib/work-units/agents-seen.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/src/lib/development-policy/declare-workflow.ts`
  - `packages/core/tests/src/lib/work-units/agent-alias.service.spec.ts`
- **Gate**: unit
- shipped-in: `d539ad072e76`
- acceptance:
  - The name is the agent's to give: no list is needed for an agent to work, and the instructions it receives say what a name is made of (maker, model, version, tier).
  - The names that signed work in the project, at work now or landed, are read from its refs and from the merges of its integration branch, oldest first.
  - A name that reads as one of them (the same words and the same version digits, a single letter or a dot apart) is refused with the first one: `minimax-3.1`, `minimax-m31` and `MiniMax M3.1` are one agent.
  - A version, a tier or a word apart is another model and enters. Two models that do differ by one letter are told apart by the project listing both in `development.coordination.roster`, which stays what it was: the owner's list, for a project that wants one.

Delivered 2026-10-11, after the owner's answer to x00880 S2: the agent knows what it runs as, and should say. It does; what the product adds is memory. Read against this repository's own history the rule finds sixteen names that ever signed work, and of the swarm's three ways of writing MiniMax it lets through the first that landed and sends the other two to it. What it cannot see is a model that misstates itself in a way that reads as another model: `glm-5.3-max` for a Flash, `glm-4.6-flash` for a 5.3, `qwen3-flash` for a 3.8. Nothing in a name says which of two well-formed names is true; only the program that launched the model knows, and where it says so (`DELENDAI_AGENT_ID`) that is the name used.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — A request for changes always has someone who can answer it

- **Status**: review
- **Files**:
  - `tools/scripts/proposals/sent-back-proposals.ts`
  - `tools/scripts/proposals/sent-back-proposals.spec.ts`
  - `tools/scripts/proposals/close-approved-proposals.script.ts`
  - `tools/scripts/proposals/close-approved-proposals.script.spec.ts`
  - `plugins/proposals/src/lib/services/review-queue-slice.service.ts`
- **Gate**: unit
- shipped-in: `823b391ef850`
- acceptance:
  - A proposal in review with a slice that was sent back is returned to work by the pass that settles the review folder, with that slice marked as work to do; whoever takes it and resubmits it is its implementer from then on.
  - The proposals already in that state are moved by that pass, not by hand: read-only, it names f00271 and q00014.
  - The review queue says of such a slice that anyone may answer it.
  - A retired slice does not keep an approved proposal from being closed by the same pass.

Delivered 2026-10-11. The request reopens its proposal when it is recorded today; these two were recorded before it did. One waited on `GitHub`, the committer of a merge, read as an implementer.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — An approved proposal closes without a field nobody writes

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`
- **Gate**: unit
- shipped-in: `7dfaf85bbdcd`
- acceptance:
  - Closing a proposal whose slices record what delivered them fills the proposal's `shipped-in` from them; the close is refused only when no slice says.

Delivered 2026-10-11. An approval writes the field since x00692; x00539 was approved before, and every one of its slices names `eaf03fb5c`.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — A pack that cannot land is settled by the queue, and says so

- **Status**: review
- **Files**:
  - `tools/scripts/git/stale-verdict-conflicts.ts`
  - `tools/scripts/git/stale-verdict-conflicts.spec.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/forge/close-unpublished-prs.script.ts`
  - `tools/scripts/forge/close-unpublished-prs.script.spec.ts`
  - `tools/scripts/lint/silent-work-refs.ts`
  - `tools/scripts/lint/silent-work-refs.spec.ts`
  - `tools/scripts/lint/ref-lifecycle-guard.script.ts`
  - `tools/scripts/lib/declared-branches.ts`
  - `packages/core/src/lib/wip-engine/remote-unit-standing.service.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
- **Gate**: unit
- shipped-in: `43acab69adf8`, `3867b485098f`, `4c68dcdd6f9c`, `140dcdfd6b48`
- acceptance:
  - A pack of verdicts in conflict with the integration branch gives up the verdicts on the documents that changed under it, says which in its merge, and is brought forward with the rest; a unit of any other kind in conflict is still its author's.
  - A publication that changes no file is closed by the queue with the reason, and its ref retired by the reap that follows; the sync of the release branch, which is history alone, is not.
  - A work ref on the forge silent past what a unit is given, and never published, is retired by the queue's reap with its tip kept; the periodic publisher does not push back a unit whose tip is the one kept.

Delivered 2026-10-11. Tried read-only on the forge as it stood: #1018 would be closed; the three silent units of the swarm would be retired; #1017 loses the verdicts on x00881 and f00547, both of which changed after it was opened, which is all it carries, and is then closed as delivering nothing. Not done, and taken out: publishing a silent unit's verdicts on its behalf. They are kept, and listed by `work retired`; the proposals return to the queue, where a reviewer that is present gives them. Not done either: a place in `proposals status` for the closes left to the owner; f00538 is the one there is, and is in this document.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — The run that died: what was ruled out, and a trace for next time

- **Status**: review
- **Files**:
  - `docs/delendai/proposals/ready/fixes/x00882-nothing-is-left-stuck-after-a-swarm-and-one-mechanism-does-each-job.md`
- **Gate**: none
- shipped-in: `ad9464c11753`
- acceptance:
  - What was ruled out is recorded, with the evidence, and what would name the sender if it recurs.

Not found. Four commands of the orchestrator ended with exit code 144 (128 + signal 16) at 11:56:44, 12:00:20, 12:05:06 and 12:10:33 local time, among them a shell loop that ran nothing but `grep` and `sleep`; each time every command running under that session died together, and a test runner they had started lived on, orphaned. Before 11:56 and after 12:10 the same suites ran to the end in the same way, 2175 tests, and they ran to the end in a session of their own. Ruled out: the repository (no script, spec or hook sends a signal to a process it did not start, and none names signal 16); memory (4 GB free, no kernel message); the checkout following the integration branch (its moves do not line up). What the four have in common is the minutes in which the swarm's last agent was publishing its packs from the same editor, and nothing on this machine records what that agent ran. A process traced with `strace -e signal=all` now runs under the orchestrator's session; a signal sent to the session is recorded there with the sender's process id, beside a listing of the processes two seconds before.
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- With no agent at work, `proposals status` shows in review only proposals a reviewer can give a verdict on, and the review queue offers each of them.
- One command brings candidates forward.
