---
id: x00882
title: "Nothing is left stuck after a swarm, and one mechanism does each job"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-11
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

### S2 — An agent is named by what it declares it is

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`
- **Gate**: unit
- acceptance:
  - An agent declares its host, vendor and model, each separately; the product composes the one name that reaches a ref, a claim or a verdict, the same way every time.
  - Two spellings of one declared model (`minimax-3.1`, `minimax-m3.1`, `MiniMax M3.1`) give one name.
  - A name passed whole, as before, goes through the same canonical form and is checked against what the host declared.

### S3 — A request for changes always has someone who can answer it

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/services/review-queue-slice.service.ts`
- **Gate**: unit
- acceptance:
  - A slice sent back whose implementer is unrecorded, or is not an agent (a committer name), is open to any implementer: the proposal returns to work and is offered as such.
  - The proposals already in that state are moved by the same rule, not by hand.

### S4 — An approved proposal closes without a field nobody writes

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
- **Gate**: unit
- acceptance:
  - Closing a proposal whose slices record what delivered them fills the proposal's `shipped-in` from them; the close is refused only when no slice says.

### S5 — A pack that cannot land is settled by the queue, and says so

- **Status**: pending
- **Files**:
  - `tools/scripts/forge/keep-the-queue-moving.script.ts`
- **Gate**: unit
- acceptance:
  - A review pack in conflict with the integration branch, or delivering nothing, whose unit has been silent past the project's lease, is retired by the queue with its tip kept, and its claims are released: its proposals return to the review queue.
  - A review unit silent past the lease that holds verdicts is published under its own name by the same pass; one that holds none is retired.
  - A close the product leaves to the owner is listed where the owner looks (`proposals status`), with the reason.

### S6 — The run that died: found, or caught next time

- **Status**: pending
- **Files**:
  - `docs/delendai/proposals/ready/fixes/x00882-nothing-is-left-stuck-after-a-swarm-and-one-mechanism-does-each-job.md`
- **Gate**: none
- acceptance:
  - The sender of the signal is named, with the evidence; or, if it does not recur, what was ruled out is recorded and a trace is in place that names it when it does.

## acceptance

- With no agent at work, `proposals status` shows in review only proposals a reviewer can give a verdict on, and the review queue offers each of them.
- One command brings candidates forward.
