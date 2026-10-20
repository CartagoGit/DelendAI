---
id: f00778
title: "The workflow was available and was not used: an agent that writes into the shared checkout instead of its unit is not caught until the commit"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-10-20
---

# f00778 — The workflow was available and was not used: an agent that writes into the shared checkout instead of its unit is not caught until the commit

## goal

An agent working in this repository produces its work through the unit it entered — a worktree, a claim, a ref — and a change that appears in the shared checkout without a unit is reported as the defect it is, with the recovery named. The refusals that already exist stay where they are and gain one thing: they say what to do next, in the sentence that already tells the agent it failed. No existing gate is loosened, no consumer changes shape, and nothing here asks an agent to trust the workflow more than it already does.

## why

On 2026-10-20 an agent authoring three architecture proposals in this repository did all of the following, in this order:

1. Ran `delendai_overview` and `delendai_tool_search`, both of which returned the answer.
2. Found `delendai_proposals_create_proposal` in the catalogue — the tool exists, and its entry said `active: false`.
3. Did not activate the plugin, and did not call it.
4. Instead wrote three proposal files directly into `docs/delendai/proposals/ready/` in the shared checkout, with a filesystem write tool, bypassing the tool that allocates the id, validates the slices, and assigns the unit branch.
5. Only discovered the ids collided with proposals another agent had created in the meantime, and renamed files by hand to resolve it.

**The guards were never reached, so they never fired.** Nothing about that sequence is subtle. Every step is visible in the session, and the reason each one was taken is the same: the filesystem write was right there, and the plugin was one activation away.

**What the correct path cost, and what it gave.** Starting over with `delendai work enter --kind=create --proposal=new` took one command and produced a worktree at `.cache/delendai/.worktrees/minimax-m3.1-flash-preview-new-all`. Every `create_proposal` call then returned an id the system allocated, a path inside that worktree, a slice-validation result, and the unit branch the work belongs on — `delendai/wip/minimax-m3.1-flash-preview/create/f00769-all-g1/author-agnostic-proposals` — which was renamed automatically from `new-all-g1` to `f00769-all-g1` the moment the id existed. The manual path reproduced none of that: it produced no id allocation, no branch, no unit, and no record that any of it belonged to anyone.

**The tool refused the direct write, and the refusal was the best instruction in the session.** Calling `create_proposal` without a unit returned `shared-checkout-write-refused` and named the remedy in full: which command to run, what the ref shape is, that a refused entry prints no path and exits non-zero, that landing goes through a pull request, and — the line that matters most — that a script which carries on after a refusal *"runs in the shared checkout"*. The tool also explained the create-specific case, which is not in the general guidance: a new proposal has no id to enter a unit for yet, so the unit is entered with `--proposal=new` and adopts the id once the proposal exists.

That answer arrived **after** the manual writes. Nothing prompted the agent to ask for it first.

**Two refusals fired for the same underlying gap, and the second one is the instructive one.** `work enter` rejected the agent name for not carrying a version:

> `saba` is not written the way agents name themselves here: it carries no version: write the one your maker publishes for you, in a part of its own.

The name had come from `agent_names assign`, which returned `agent_name: "Saba"` — the tool minted a name, the name did not satisfy the name canon, and the two halves of the same system disagreed. The agent recovered by translating the host's declared model into the project's canonical spelling. That is the intended friction, but it surfaced at `work enter` rather than at the point where the name was chosen.

**The refusals are already strict; they were simply not on the path taken.** The write into the shared checkout was never attempted through a tool, so nothing checked it. A `create_proposal` call from a unit passes today. A `create_proposal` call without a unit refuses today, with an excellent message. The behaviour is correct; the discovery of it was not.

**What made the manual path attractive.** `create_proposal` was reported `active: false` in the catalogue while `overview` and `tool_search` were visible. The correct action — activate the plugin — is available and is what the activation note prescribes ("Refresh tools/list before invoking a newly visible tool"), but nothing in the workflow's own decision tree says what to do when the tool that creates a proposal is the tool that is hidden. The `proposals-workflow-playbook` skill's decision tree starts at `auto_work` and never names `create_proposal`; its `Never Do` list covers polling, pushing and hand-editing the index, and says nothing about writing proposal files directly.

**A second failure the same session, recorded here because it belongs to the same class.** The four proposals were recreated with structured fields (`goal`, `why`, `nonGoals`, `slices`) rather than a prose body, and `create_proposal` filled the scaffold correctly. But the first recreation passed a `body` parameter that does not exist in `CREATE_PROPOSAL_INPUT_SCHEMA` (`authoring.tool.ts:494`) — the schema has `goal`, `why`, `nonGoals`, `globalGate` and `slices`, and no body. The tool returned `ok: true` with a path, the agent reported success, and the files on disk were 36-line scaffolds with `TODO: describe the goal`. The lint said so plainly (`unfilled-scaffold`, 19 findings) and the agent read the message and continued anyway. Three separate signals said the content was not written; none of them was acted on.

**Why this design.** This is a discoverability and reporting proposal, not a control-flow one. The controls exist and work. What is missing is that an agent which never reaches them gets no signal at all, and an agent which does reach them gets a good message too late.

The fix is three slices, each small, none of which changes what the system accepts:

**S1 makes the authoring path nameable.** The workflow documentation gains the authoring entry that its decision tree lacks: a proposal with no id is created by entering a unit with `--kind=create --proposal=new` and calling `create_proposal` inside it, and the unit adopts the id. That sequence exists only in a refusal message today, and a refusal message is the worst place for a procedure to live — it is only read by whoever already failed. The same slice documents that the tool allocates the id, that a prose `body` is not part of the contract, and that the recovery for an author who already wrote files by hand is to re-author inside a create unit rather than to guess at ids.

**S2 makes the discovery cost zero.** Activating a plugin whose tool is the one the agent needs is the correct response to `active: false`, and the catalogue says so. Making that response self-evident when the tool that is needed is the hidden one removes the moment where the filesystem looks like a reasonable substitute.

**S3 makes the failure visible after the fact.** A unit owns a set of files. A change to a path a unit claims, arriving from a checkout that holds no unit, is detectable after the fact even though it is not preventable at write time. Reporting it — as an advisory, in the same place `lint:agent-claims` already reports advisory findings — turns a silent divergence into a visible one, without blocking a human who is editing documentation on purpose.

What this deliberately does not do: add a hook or a filesystem watcher that blocks arbitrary writes. The repo's own rule is that work belongs in units because *"a change written here is committed by nobody and is lost"* — not because the filesystem should be policed. A gate that fires on every keystroke in `docs/` would be noise, and noise is what this proposal is against.

**Re-analysis before working any slice.** Written 2026-10-20 from one session. The playbook's decision tree may already name authoring: `grep -n "create_proposal" plugins/proposals/skills/proposals-workflow-playbook/SKILL.md`. `tool_search` may already name the activation step: `grep -n "active" packages/core/src/lib/tools/tool-search.tool.ts`. `agent-claims.script.ts` may already report cross-checkout changes: `grep -n "checkout\|worktree" tools/scripts/lint/agent-claims.script.ts`. The refusal message may have changed since it was read: search for `shared-checkout-write-refused` and read the `reason` it returns. The knowledge entry may have moved: confirm `plugins/proposals/src/lib/skills/knowledge/proposals-workflow.md` is still the file the `proposals-workflow` knowledge id serves.

## non-goals

- Loosening, bypassing or removing `shared-checkout-write-refused`, or any other refusal.
- Changing `create_proposal`'s contract, its output shape, or its slice validation. The tool is correct; this proposal is about reaching it.
- Adding a pre-commit hook or a file watcher that intercepts writes outside a unit.
- Making the worktree mandatory for every kind of work, or changing the `commit` / `commit-and-push` persist modes. `agentWorktree: false` is a legitimate configuration for this repository and stays legitimate.
- Reconciling the name-canon disagreement between `agent_names assign` and `describeAgentNameShape`. That is a real finding and belongs to the identity proposal, which owns the question of what a name is; this proposal only records that the disagreement surfaced late.
- Any change to `DELENDAI_AGENT_ID`, the dogmas, or how a model is identified.

## slices

- global_gate: type

### S1 — The authoring path is documented where an agent reads before it writes
- **Status**: pending
- **Files**: `plugins/proposals/skills/proposals-workflow-playbook/SKILL.md`, `plugins/proposals/src/lib/skills/knowledge/proposals-workflow.md`
- **Gate**: none
- acceptance:
  - "The playbook's decision tree names proposal authoring: a proposal that does not exist yet is created by entering a unit with `--kind=create --proposal=new`, calling `create_proposal` inside that unit, and letting the unit adopt the id."
  - "It states the two facts an author needs and currently learns only from a refusal: `create_proposal` allocates the id (a hand-written id is not the contract), and the unit branch is renamed from `new-…` to the real id automatically, in the same worktree and the same commit."
  - "It states the recovery for an author who already wrote files by hand: enter a create unit, re-author inside it, and let the tool allocate ids — without deleting or losing the drafted content."
  - "The knowledge entry `proposals-workflow` carries the same authoring step, so an agent that reads knowledge rather than skills reaches it too."
  - "A lint or spec fails when the authoring step is absent from both surfaces, so the procedure cannot silently disappear back into a refusal message."

### S2 — Reaching the hidden authoring tool is the obvious next step
- **Status**: pending
- **Files**: `packages/core/src/lib/tools/tool-search.tool.ts`
- **Gate**: none
- acceptance:
  - "When `tool_search` returns a single match for the authoring capability, its entry names the action to take when the tool is not yet visible — activate the owning plugin — rather than leaving `active: false` as the reader's only clue."
  - "The activation note the server already returns ("Refresh tools/list before invoking a newly visible tool") is reachable from the search result, so the two halves of the instruction are not separated by a tool call."
  - "No tool becomes visible by default. `create_proposal` stays behind the same activation it has today; only the cost of discovering that step changes."
  - "A spec drives `tool_search` with the authoring query and asserts the result names the activation step."

### S3 — A change outside its unit is reported, not prevented
- **Status**: pending
- **Files**: `tools/scripts/lint/agent-claims.script.ts`
- **Gate**: none
- acceptance:
  - "The claims check reports, as an advisory alongside its existing findings, a modified path that belongs to a unit whose checkout does not hold it — naming the path, the unit that claims it, and the unit that does not."
  - "The finding is advisory, in the same class as the check's existing advisory findings since `x00088`; it does not fail `validate` and does not block a human editing documentation."
  - "It does not fire on a change made inside the unit's own worktree, and a spec asserts both directions: the same path modified inside the unit passes, and modified from elsewhere is reported."
  - "It does not fire for a path no unit claims, so an ordinary documentation edit stays silent."
  - "Its message names the recovery — the unit's branch and worktree — so the finding is actionable without a second search."

## acceptance

- The playbook's decision tree names proposal authoring: a proposal that does not exist yet is created by entering a unit with `--kind=create --proposal=new`, calling `create_proposal` inside that unit, and letting the unit adopt the id.
- It states the two facts an author needs and currently learns only from a refusal: `create_proposal` allocates the id (a hand-written id is not the contract), and the unit branch is renamed from `new-…` to the real id automatically, in the same worktree and the same commit.
- It states the recovery for an author who already wrote files by hand: enter a create unit, re-author inside it, and let the tool allocate ids — without deleting or losing the drafted content.
- The knowledge entry `proposals-workflow` carries the same authoring step, so an agent that reads knowledge rather than skills reaches it too.
- A lint or spec fails when the authoring step is absent from both surfaces, so the procedure cannot silently disappear back into a refusal message.
- When `tool_search` returns a single match for the authoring capability, its entry names the action to take when the tool is not yet visible — activate the owning plugin — rather than leaving `active: false` as the reader's only clue.
- The activation note the server already returns ("Refresh tools/list before invoking a newly visible tool") is reachable from the search result, so the two halves of the instruction are not separated by a tool call.
- No tool becomes visible by default. `create_proposal` stays behind the same activation it has today; only the cost of discovering that step changes.
- A spec drives `tool_search` with the authoring query and asserts the result names the activation step.
- The claims check reports, as an advisory alongside its existing findings, a modified path that belongs to a unit whose checkout does not hold it — naming the path, the unit that claims it, and the unit that does not.
- The finding is advisory, in the same class as the check's existing advisory findings since `x00088`; it does not fail `validate` and does not block a human editing documentation.
- It does not fire on a change made inside the unit's own worktree, and a spec asserts both directions: the same path modified inside the unit passes, and modified from elsewhere is reported.
- It does not fire for a path no unit claims, so an ordinary documentation edit stays silent.
- Its message names the recovery — the unit's branch and worktree — so the finding is actionable without a second search.
