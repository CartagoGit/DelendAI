---
id: x00645
title: "Edits no work ref carries are reported, not silent"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-25
last-transition-id: 0ea704a5-4fad-4942-9bae-5cc44640519f
last-correlation-id: 0ea704a5-4fad-4942-9bae-5cc44640519f
last-transition-from: review
shipped-in:
  - "abdd94bb3d6a27422527cc4b5f1482028e866336"
  - "2c27eec1e689b84671a485c6144ad0bf68e17fa2"
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
- **Status**: done
- **Files**: `packages/cli/src/commands/work.command.ts`, `packages/core/src/lib/work-units/work-dirty-paths.service.ts`, `packages/core/tests/src/lib/work-units/work-dirty-paths.service.spec.ts`, `packages/core/src/lib/contracts/interfaces/work-dirty-paths.interface.ts`
- **Gate**: type
- acceptance:
  - "Rename and copy entries of `git status -z` yield both repository paths intact."
  - "`work status` lists the dirty paths no work ref carries under `undurable`, and its text output names the checkpoint command to run."
  - "A path carried by some work ref is not listed as undurable."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real abdd94bb3. work-dirty-paths: rename/copy de git status -z producen AMBAS rutas (no solo la origen); work status lista los dirty paths que ningún work ref lleva bajo undurable y el texto nombra el comando checkpoint; un path que algún ref lleva no se lista. Además create_proposal bajo perfiles shared-* publica su fichero en el publication ref sin mover HEAD ni stagear nada en el índice compartido. Acceptance cubierta — work-dirty-paths.service.spec 128 líneas + create-proposal-publishes.spec; gate 43/43 en lote. Sin cambios fuera de alcance.
### S2 — a proposal is published from a private index, never from HEAD
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/publish-proposal.ts`, `plugins/proposals/src/lib/contracts/interfaces/publish-proposal.interface.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/tools/publish-proposal.spec.ts`, `plugins/proposals/tests/src/lib/tools/create-proposal-publishes.spec.ts`
- **Gate**: type
- acceptance:
  - "The publication commit is built with a temporary index and `commit-tree` on the integration branch head; `HEAD`, the checked-out branch and `.git/index` are unchanged afterwards."
  - "Only the proposal file differs between the publication commit and its parent."
  - "A failure at any step leaves nothing staged in the shared index."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 2c27eec1e (x00645 S2, merge abdd94bb3 = PR #450). publish-proposal.ts construye el commit con índice temporal y commit-tree sobre el head de la rama de integración; HEAD/branch/.git/index quedan intactos. Diff del commit = solo el fichero de propuesta. Fallo en cualquier paso no deja nada stageado en el índice compartido (los 2 tests 'reports a failed push...' + 'reports a failed commit...' cubren ambos paths). 20/20 verde en los 2 specs focalizados. claude-opus-5-5 != minimax-m3 → veredicto independiente. Sin cambios fuera de alcance.

## acceptance

- Rename and copy entries of `git status -z` yield both repository paths intact.
- `work status` lists the dirty paths no work ref carries under `undurable`, and its text output names the checkpoint command to run.
- A path carried by some work ref is not listed as undurable.
- `create_proposal` under a `shared-*` profile publishes its file on the publication ref without moving `HEAD` or staging anything in the shared index.
