---
id: f00772
title: "Batuta plans and conducts a joint audit within the quota the user has"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-10-20
depends-on:
  - f00764
  - q00034
  - f00551
  - x00923
  - x00924
---

# f00772 — Batuta plans and conducts a joint audit within the quota the user has

## goal

A user asks: "audit this project thoroughly with the models and accounts I have, within my budgets, my quotas and my time." Batuta then does the rest. It pins a snapshot and inventories what can be audited. It plans a coverage matrix and picks a distribution method per component. It assigns the work to the models that can afford it and keeps each first pass independent. It checkpoints every assignment, so a model that runs out of quota loses nothing. Each reviewer writes its own dossier, and nobody edits a shared document by hand. When the audit's closure criteria and the owner's authorization are both met, Batuta hands the dossiers to f00764, which settles every finding.

This extends what exists. audit-orchestrator turns a plan into tasks, agent-orchestrator dispatches them, orchestrator-runner holds accounts, quota and spend, and the router and outcome store come from q00034. There is no second orchestrator, no second store of models, quota, tasks or findings, and no audit-only work-unit kind.

## why

The owner asked for it on 2026-10-20, watching a00095. That audit is the first real joint audit here: 12 model identities, about 30 units and 15 pull requests over two days, coordinated by the owner by hand, with nothing in the product that knew it was one audit. Each incident below is written as symptom → evidence → cause → mechanism → fix.

**I1. Finding ids collide.**
- Symptom: claude-opus-5-5's consolidation findings were renumbered four times in one day (G91–G93 → G101–G103 → G102–G104 → G150–G152).
- Evidence: in a00095, claude-haiku-5-5 published G79–G90 and claude-sonnet-5-5 published G91–G107 (#1273, #1274, #1280, #1282). claude-sonnet-5-5 and claude-opus-5-5 then agreed G108–G149 by cross-session message. minimax-m3.1-flash, on another host, published G108–G110 inside that range minutes later (#1286). minimax-m3.1-flash-preview then took the id f00769 this proposal had been entered under (its unit `create/f00769-all-g1`), and gpt-6.1-sol's #1252 added a second `### G61`.
- Cause: ids are chosen by each reviewer from the shared document at the moment it last read it.
- Mechanism: one hand-edited document; no allocator.
- Fix: S2.

**I2. A reviewer's merge rewrites another reviewer's block.**
- Evidence: #1286 left a stale duplicate of claude-sonnet-5-5's earlier frontmatter note inside sonnet's own entry. It was repaired in #1275.
- Cause: every reviewer merges every other reviewer's edits to the same file.
- Mechanism: the rule "edit only your block" is prose that nothing checks.
- Fix: S2.

**I3. The scoreboard and the reviewer counters are written by hand.**
- Evidence: at consolidation, 138 Scoreboard rows did not match the reviewers that sign each finding's `seenBy`. The `reviewers-completed` counter was written as 6 by one reviewer and 11 by another, each counting a different thing.
- Mechanism: derived data kept as text.
- Fix: S2 and f00764 S2.

**I4. A model works under another model's identity.**
- Evidence: Codex session `01a15129-468c-7d70-8015-ff8261e25343` (2026-10-18 22:37) ran on `gpt-6-luna`. Its 28th event read `~/.cache/delendai/provider-model.json`, which then held `gpt-6.1-sol`, written by the chat provider serving the owner's Sol conversation in the same workspace. At event 55 it ran `export DELENDAI_AGENT_ID=gpt-6.1-sol` and worked in `gpt-6.1-sol` units until the owner stopped it. So there is still no independent Luna review.
- Separately, commit `5dfa42023` (subject "m3.1-review-flash — fase de contraste") sits on `wip/gpt-6.1-sol/implement/a00095-S7-g1`, and its delendai note says `maker: gpt-6.1-sol`. The same text was later published by minimax-m3.1-flash in #1286. How it reached a Sol unit is not yet reproduced.
- Cause, proven for the first case: the bridge is keyed by workspace, so two concurrent conversations in one workspace share one entry, and a CLI host copied a chat provider's entry into its own declaration.
- Fix: x00923, a prerequisite of S5.

**I5. One vendor works under two identities on the same slice.**
- Evidence: `minimax-m3` and `minimax-m3.1-flash-preview` both hold a00095 S14 (`…/a00095-S14-g1` under each name). The `minimax-m3.1-flash-preview` wip publishes as `pr/minimax-m3.1-flash`.
- Mechanism: a slice claim is exclusive per identity, not per assignment, and the publication name can differ from the unit's name.
- Fix: S1 assigns work, not slices, and x00923.

**I6. Work is stranded when quota runs out.**
- Evidence: qwen-3.8-max's third batch, 104 `seenBy` lines, was edited in the shared checkout. The start-up rescue saved it to a wip and to `refs/delendai/rescued/shared-checkout-75ea46bef208`, which nobody published until the consolidation (a00095 G151).
- deepseek-v4-pro's last finding sat unpublished in its wip (`ebaac767c`, a00095 G150).
- Mechanism: no checkpoint of an assignment's progress, and no owner of its continuation.
- Fix: S6.

**I7. Finished reviewers leave live refs.**
- Evidence: the wips of glm-5.3-arquitectura (S1-g2) and qwen-3.8-flash (S8-g1) were fully merged into develop and still alive the next day. They were retired by hand on 2026-10-20.
- Cause: a work ref lives until its proposal closes, and a joint audit stays open for days with many reviewers.
- A rescued ref has no retire path at all: `work retire` refuses `refs/delendai/rescued/*`.
- Fix: x00924.

**I8. A vendor's safety refusal is retried and burns quota.**
- Evidence: in the owner's pasted Codex conversation, a safety-check refusal was retried and the batch was lost.
- Fix: S4.

These things worked, and the product should make them the default:

- claude-sonnet-5-5 ran two-process reproductions with controls (R1, N=40, `race`/`seq`/`rel-only`).
- deepseek-v4-pro reproduced adversarially with real processes.
- claude-haiku-5-5 probed the product from an external project.
- gpt-6.1-sol kept a hashed evidence manifest.
- `work rescue` preserved every stranded edit, and `work retire` kept every retired tip.
- Two sessions agreed an id range by message within minutes. The agreement just did not reach a third host.

## non-goals

- Settling findings and closing the audit: f00764 does that.
- Choosing the owner's thresholds: the plan declares them (S5).
- Reading credentials, or spending without the confirmations orchestrator-runner already enforces.
- Rewriting a00095's historical record. S8 runs on a copy.

## slices

- global_gate: type

### S1 — An audit plan is built from a real inventory

- **Status**: pending
- **Files**: `plugins/audit-orchestrator/src/lib/plan-reader.ts`, `plugins/audit-orchestrator/src/lib/contracts.ts`, `plugins/audit-orchestrator/src/lib/tools/orchestrate.tool.ts`
- **Gate**: type
- acceptance:
  - "Planning an audit pins a snapshot commit and inventories the auditable components from the workspace: packages, plugins, tools, CLI commands, zones. The coverage matrix (component × concern) is part of the plan document, not a new store."
  - "Each matrix cell becomes an assignment with an id the plan owns. A reviewer is given assignments, never a bare slice, so two identities can no longer hold the same slice by accident (I5)."
  - "A cell with no assignment, or whose assignment produced no dossier entry, is reported as uncovered. Silence never counts as coverage."

### S2 — Each reviewer writes a dossier; the record is derived

- **Status**: pending
- **Files**: `plugins/audit-orchestrator/src/lib/contracts.ts`, `plugins/proposals/src/lib/proposals/proposal-document.ts`
- **Gate**: type
- acceptance:
  - "A reviewer writes only its own dossier file under the audit (one per verified identity), with findings in the record form of f00764 S1. Its ids are local (`<reviewer>:<n>`), and the audit-wide id is assigned when the dossier is integrated, so two reviewers can never collide (I1)."
  - "The shared record (findings, Scoreboard, reviewer counters) is generated from the dossiers. A hand edit to it, or a dossier edit by another identity, is refused by a lint that CI runs (I2, I3)."
  - "Confirmations and disputes of another reviewer's finding are entries in the confirming reviewer's own dossier, which replaces editing another reviewer's `seenBy`."

### S3 — The distribution method is chosen per component

- **Status**: pending
- **Files**: `plugins/audit-orchestrator/src/lib/tools/orchestrate.tool.ts`, `plugins/agent-orchestrator/src/lib/policy/modes/swarm-mode.ts`
- **Gate**: type
- acceptance:
  - "The plan can assign by partition, redundancy (k independent reviewers), rotation (reviewer B checks reviewer A's cell), rounds (explore → contrast → reproduce disputes → arbitrate P0/P1), gap-filling (an uncovered cell goes to whoever has capacity), adversarial (refute a finding) and increment (only what changed since the last snapshot). Methods combine per cell."
  - "The choice is recorded with its reason: criticality, disputes, capacity left. A further round is planned only when its expected value (open disputes × severity, uncovered critical cells) beats its estimated cost."
  - "Assignments are dispatched through the existing agent-orchestrator engine as tasks with `dependsOn`. There is no parallel dispatcher."

### S4 — Assignment follows observed capacity; refusals are not retried

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/quota.ts`, `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`, `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`
- **Gate**: type
- acceptance:
  - "Each assignment is routed by the q00034 router over observed quota windows (f00767), declared budgets and the outcome ranking (f00768), and reserves its estimated cost before it starts. Observed, configured and unknown capacity are reported apart."
  - "A 429 or quota exhaustion checkpoints the assignment (S6) and moves transferable work to another authorized model. Work that needs independence or a specific model waits for observed capacity. No reset time is invented."
  - "A vendor safety refusal is recorded as an outcome of kind `refused`, is never retried with the same input, and is counted in spend (I8)."

### S5 — First passes are independent, and one identity is one vote

- **Status**: pending
- **Files**: `plugins/audit-orchestrator/src/lib/contracts.ts`, `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`
- **Gate**: type
- acceptance:
  - "During an assignment's independent phase, its context pack excludes other reviewers' dossiers and the derived record. The exclusion is enforced by what Batuta hands the worker, not by asking it not to look."
  - "Agreement counts distinct verified identities (x00923). Further passes by the same identity add evidence, not votes. An identity whose resolution is contradicted or uncertain contributes no vote until resolved."
  - "Thresholds are declared by the plan: minimum valid reviewers, agreement ratio, and whether a reproduced P0/P1 is accepted below the threshold. The plan stays closable when accounts run out, by declaring the reviewer set actually available."

### S6 — Every assignment is resumable, and its unit ends when it is integrated

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-checkpoint.service.ts`, `plugins/audit-orchestrator/src/lib/tools/orchestrate.tool.ts`
- **Gate**: type
- acceptance:
  - "An assignment's checkpoint carries the snapshot, files inspected, evidence gathered, commands run, findings drafted and next step, in the existing work checkpoint. A different model resumes it without redoing what is recorded (I6)."
  - "When a reviewer's dossier is integrated and the reviewer releases the assignment, its unit ends (x00924), even though the audit stays open (I7)."

### S7 — Closure is a criterion plus the owner's word

- **Status**: pending
- **Files**: `plugins/audit-orchestrator/src/lib/tools/orchestrate.tool.ts`
- **Gate**: type
- acceptance:
  - "Batuta reports when every cell is covered or explicitly waived and every active reviewer has integrated or released its work. It then waits for the owner's authorization before handing the dossiers to f00764's ledger. It never consolidates on its own."

### S8 — A controlled end-to-end trial, measured

- **Status**: pending
- **Files**: `plugins/audit-orchestrator/tests/src/lib/joint-audit.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "The trial runs on a copy of the project at a00095's snapshot, never on a00095's record, with real consented runs from at least two vendors. It shows: planning from the real inventory, a common contract, adaptive distribution, independent first passes, reassignment on exhausted quota, resumption without redone work, no duplicate votes, uncovered cells reported, contradictions kept, a reproducible consolidation, spend within the declared limit, and units and refs that all end."
  - "It reports tokens per verified finding, collisions (target 0), duplicated work and resumptions against a00095's numbers. A run made only with mocks is reported as such and does not count as the demonstration."

## acceptance

- A joint audit is planned, distributed, resumed and handed to settlement by Batuta, from one request, within declared budgets.
- No reviewer edits another reviewer's record.
- No finding id is chosen by hand.
- No identity is counted twice or under another model's name.
- The trial in S8 measures the improvement over a00095.
