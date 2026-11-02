---
id: x01001
title: "a consumer project is not stopped by delendai or by its development"
kind: fix
status: in-progress
type: proposal
track: startup
date: 2026-11-01
last-transition-id: ee0b80ba-1bde-45e5-8a30-4655ba9f91de
last-correlation-id: ee0b80ba-1bde-45e5-8a30-4655ba9f91de
last-transition-from: ready
last-transition-at: 2026-11-02T14:55:43.999Z
---

# x01001 — a consumer project is not stopped by delendai or by its development

## goal

Findings from a real consumer: a false blocker, a block that does not say why, a block that can be gone round, and a server restarted by this repository's work.

## why

Findings from a real consumer, api-source-tanit, read from its logs on 2026-11-01 and 2026-11-02. Its agent reported the delendai CLI as blocked by another agent; no other agent was involved.

- Its boots are DEGRADED with `Mutations blocked: true`: 10 ref-vanished, 25 history-rewritten and 25 governance-drift errors in one day. The vanished ref `batch-infra-g11` belongs to a pull request that merged (#56), so the blocker carries no risk.
- The refusal did not reach the agent as its cause: it blamed another agent, then went round the block through a `pr/` branch with a self-approval workflow.
- That server runs this repository's checkout (`../delendai/...`), so it restarted onto new code 23 times on 2026-11-01, each time develop moved here: dogfooding work interrupts an unrelated project.
- Every worktree it opens leaves 'file not found' errors in editors once a unit ends.

## non-goals

- Changing api-source-tanit itself: its owner decides its repairs and governance.
- Loosening what blocks mutations when a real loss is possible.

## slices

- global_gate: type

### S1 — A merged pull request answers a vanished ref
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-reconciler/phases/integration-evidence.ts`, `packages/core/src/lib/startup-reconciler/phases/merged-publications.helper.ts`, `packages/core/src/lib/startup-reconciler/seams.interface.ts`, `packages/core/src/lib/startup-reconciler/git-seam.ts`, `packages/core/src/lib/startup-reconciler/merge-subjects.service.ts`, `packages/core/src/lib/startup-reconciler/finding-catalog.constant.ts`, `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`, `packages/core/tests/src/lib/startup-reconciler/integration-evidence.spec.ts`
- **Gate**: type
- acceptance:
  - "A vanished ref whose publication merged is a note, not a blocker."

### S2 — A block says what blocks and how to clear it
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-gate/render-gate.ts`, `packages/core/tests/src/lib/startup-gate/run-startup-gate.spec.ts`, `docs/delendai/ADOPTER-CONFIG-FOOTGUNS.md`
- **Gate**: type
- acceptance:
  - "An agent refused by blocked mutations receives each blocking finding and its repair command, and never a message it can read as another agent's lock."

### S3 — A blocked workspace cannot be gone round
- **Status**: pending
- **Files**: `tools/scripts/git`
- **Gate**: type
- acceptance:
  - "While mutations are blocked, opening a publication outside the work flow is refused or recorded as a departure the owner sees."

### S4 — A consumer does not run a moving checkout
- **Status**: pending
- **Files**: `tools/scripts/host/host-server.script.ts`, `tools/scripts/host/branch-runtime.helper.ts`, `tools/scripts/host/branch-runtime.helper.spec.ts`, `tools/scripts/lint/check-stray-cache-files.script.ts`, `packages/core/src/lib/contracts/constants/core-eviction.constant.ts`
- **Gate**: type
- acceptance:
  - "A project picks the delendai branch it runs with `--branch=<name>` on its MCP entry, the shared checkout stays where it is, a move on another branch restarts nothing there, and a branch that does not exist falls back to the checkout's code and says so."

### S5 — Creating a proposal moves no other proposal
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`
- **Gate**: type
- acceptance:
  - "Creating a proposal in a project writes that proposal and its index entry, and moves no other file: in api-source-tanit, creating x00077 moved 16 archived proposals to the folders this repository's rule names, which that project's own lint refuses."
  - "Where a consumer files done proposals is the consumer's: one rule, read from its configuration."

## acceptance

- A vanished ref whose publication merged is a note, not a blocker.
- An agent refused by blocked mutations receives each blocking finding and its repair command, and never a message it can read as another agent's lock.
- While mutations are blocked, opening a publication outside the work flow is refused or recorded as a departure the owner sees.
- A project picks the delendai branch it runs with `--branch=<name>` on its MCP entry, the shared checkout stays where it is, a move on another branch restarts nothing there, and a branch that does not exist falls back to the checkout's code and says so.

## notes
- 2026-11-02: the owner chose `main` over a registry: delendai is not published, and a consumer's agents are useful evidence. Their logs and refs are read from here for findings.
- 2026-11-02: the owner chose a `--branch` flag on the MCP entry over any copy kept by hand. delendai keeps the tree in its cache. Moving a consumer to `main` waits for a promotion, since `main` trails develop by 1,418 commits.
- 2026-11-02: seen in api-source-tanit while landing x00077 there: `proposals create` moved 16 archived proposals between `done/` subfolders (S5). Its own suite also has a test that fails under load and passes alone, `tests/cli/writing-commands.test.ts > generate --open` (tanit's to fix).
- S1, 2026-11-02. Read from tanit: the vanished checkpoint `6098918` of `batch-infra-g11` is not the commit PR #56 merged (`891bb0d`, same subject, a different diff), and the integration branch changed those files later, so neither ancestry, nor identical content, nor patch equivalence (`git cherry` answers `+`) holds. What does hold is local and cheap: the integration branch's merge names the publication of the same unit (`Merge pull request #56 from CartagoGit/pr/minimax-m3/implement/batch-infra-g11/…`). A vanished ref whose unit's publication a merge of the integration commit names is now the note `integration-evidence.publication-merged`, naming its checkpoint; one with no such merge stays the blocker.
- S2, 2026-11-02. Nothing refuses work for a startup finding: `mutationsBlocked` is read by nothing but the banner, and only a strict start (`DELENDAI_STARTUP_STRICT=1`) refuses to serve. The banner's `Mutations blocked: true` read as a lock, and tanit's agent went round a block that did not exist. It now says that nothing is locked and no work is refused, how many findings wait for a decision (and whether recovery is required), and each generated repair names its `delendai repair resolve` command.
