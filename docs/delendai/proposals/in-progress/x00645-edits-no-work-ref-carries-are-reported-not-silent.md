---
id: x00645
title: "Edits no work ref carries are reported, not silent"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
last-transition-id: 3006165c-43ce-4cb4-a1e6-879018f43258
last-correlation-id: 3006165c-43ce-4cb4-a1e6-879018f43258
last-transition-from: ready
---

# x00645 — Edits no work ref carries are reported, not silent

## Goal

An agent that edits the shared checkout without checkpointing learns it from `delendai work status`, every path shown there is the real repository path, and `create_proposal` publishes its file on a ref without touching the shared index or `HEAD`.

## why

Measured on 2026-09-25: a Codex session edited 23 paths in the shared checkout for an hour, launched two sub-agents that did the same, and ended with none of it on a work ref — the WIP engine checkpoints only on a claimed slice event, and nothing it could run said the work was not durable. `work status` reported only `dirty paths 23`, and for every rename it printed the source path without its first three characters (`s/delendai/...`) because `-z` porcelain puts the rename source in its own NUL field.

The same session showed the second way work misses its ref: `create_proposal` publishes by `git add` + `git commit --only` in the caller's checkout, i.e. onto whatever `HEAD` is — the integration branch under every `shared-*` profile. The hook refuses that commit, so the publication fails every time under this repository's own policy, and the file is left staged in the shared index where the next agent's commit can sweep it in. Its own doc comment says the commit is made "on a detached ref"; it is not.

## non-goals

- Checkpointing another agent's edits automatically — ownership is the agent's to declare.
- Refusing edits in the shared checkout; editing there is the documented model.

## Slices

- global_gate: type

### S1 — work status separates durable from undurable paths
- **Status**: pending
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/cli/src/lib/work-dirty-paths.service.ts`, `packages/cli/src/lib/work-dirty-paths.service.spec.ts`, `packages/cli/src/contracts/interfaces/work-dirty-paths.interface.ts`
- **Gate**: type
- acceptance:
  - "Rename and copy entries of `git status -z` yield both repository paths intact."
  - "`work status` lists the dirty paths no work ref carries under `undurable`, and its text output names the checkpoint command to run."
  - "A path carried by some work ref is not listed as undurable."

### S2 — a proposal is published from a private index, never from HEAD
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/publish-proposal.ts`, `plugins/proposals/src/lib/contracts/interfaces/publish-proposal.interface.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/tools/publish-proposal.spec.ts`, `plugins/proposals/tests/src/lib/tools/create-proposal-publishes.spec.ts`
- **Gate**: type
- acceptance:
  - "The publication commit is built with a temporary index and `commit-tree` on the integration branch head; `HEAD`, the checked-out branch and `.git/index` are unchanged afterwards."
  - "Only the proposal file differs between the publication commit and its parent."
  - "A failure at any step leaves nothing staged in the shared index."

## acceptance

- Rename and copy entries of `git status -z` yield both repository paths intact.
- `work status` lists the dirty paths no work ref carries under `undurable`, and its text output names the checkpoint command to run.
- A path carried by some work ref is not listed as undurable.
- `create_proposal` under a `shared-*` profile publishes its file on the publication ref without moving `HEAD` or staging anything in the shared index.
