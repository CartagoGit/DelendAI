---
id: x00646
title: "Reviewing proposals works the same in any project and from any host"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-25
last-transition-id: abac2222-0636-4243-ab91-777645e68abc
last-correlation-id: abac2222-0636-4243-ab91-777645e68abc
last-transition-from: review
shipped-in:
  - "9b774a2915ab51c60d5f669e245fe475ca8e6340"
  - "1a7be4e0143a276600ab9e66335ab5751f3f4e0b"
  - "b01987f5f3cb2bb40c908666de2819d5e7c13b08"
  - "2b5fe0e77f4946dc1fc250cf581666ae9118458e"
---

# x00646 — Reviewing proposals works the same in any project and from any host

## Goal

An agent told to review the proposals in review — from Claude Code, Codex, Copilot, any MCP client or a bare console — finds every proposal awaiting review, learns for each slice what to verify and which commit delivered it, and leaves each one approved, sent back or blocked with the missing datum, in any project that adopts delendai, whatever its forge, merge style or ref naming.

## why

x00643 made a review possible where no round was ever opened, but by rules only this repository satisfies. The implementer is read from a `Merge pull request #N from owner/<prefix><agent>/...` subject: GitHub phrasing, a GitHub merge commit, and the agent assumed to be the first segment of the ref, although `branches.workRefTemplate` lets a project put it anywhere; a squash or rebase merge leaves no such subject at all. Nothing tells an agent the review backlog exists: the overview counts ready and in-progress work only, `get_proposal_workflow` describes the review loop from the implementer's side, and nothing lists what each slice in review needs. A console-only agent cannot approve at all: `delendai proposals review` passes neither evidence nor a commit, and approve requires evidence. And two product messages send adopters to scripts that exist only in this repository (`tools/scripts/review/proposal-review.script.ts`, `tools/scripts/lint/proposal-uniqueness.script.ts`).

## non-goals

- Host-specific instructions: every host reads the same server-provided procedure; no host file lists tools.
- Relaxing reviewer ≠ implementer, the evidence an approval carries, or the gates of review → done.
- A reviewer that edits code or submits on the implementer's behalf.

## Slices

- global_gate: e2e

### S1 — A checkpoint names the work ref it belongs to
- **Status**: done
- **Files**: `packages/core/src/lib/wip-engine/scope.ts`, `packages/core/src/lib/wip-engine/scope.constant.ts`, `packages/core/src/lib/wip-engine/checkpoint.ts`, `packages/core/src/lib/wip-engine/rebase.ts`, `packages/core/tests/src/lib/wip-engine/checkpoint.spec.ts`, `packages/core/tests/src/lib/wip-engine/rebase.spec.ts`
- **Gate**: type
- acceptance:
  - "Every checkpoint commit the WIP engine writes carries a trailer naming the ref it was written for, next to the scope and digest trailers."
  - "The trailer survives a squash merge that keeps commit bodies and a rebase, so the delivery stays attributable whatever the forge does."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 9b774a291 (S1+S2). S1 (atribución de implementador): cada checkpoint del WIP engine lleva un trailer con el ref para el que se escribió (junto a scope y digest); el trailer sobrevive squash y rebase; el implementador se lee en orden: trailer work-ref del commit entregador → refs nombrados en el mensaje del merge (GitHub/GitLab/Bitbucket/git plano) → Co-Authored-By; el ref se decodifica con el workRefTemplate del proyecto y el publication ref se mapea atrás; squash/rebase/merge-commit y template no-default se testean sobre repo real. S2 (review queue + CLI): tool read-only lista lo pendiente oldest-first con estado, implementador (grabado/derivable/faltante), candidatos con su origen, gate, acceptance y la llamada exacta; el CLI expone la cola y proposals review acepta commit + evidencia; el knowledge del workflow declara el procedimiento del reviewer; el overview cuenta las pendientes y apunta a la cola. Acceptance: 30/30 review-attribution.spec + 43/43 en el lote. Sin cambios fuera de alcance.
### S2 — Attribution reads the project's declared ref shape, whatever the forge
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/services/work-ref-mention.ts`, `plugins/proposals/src/lib/services/review-attribution.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-attribution.interface.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/services/work-ref-mention.spec.ts`, `plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-repo.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-close.spec.ts`
- **Gate**: e2e
- acceptance:
  - "The implementer is read, in order, from the work-ref trailer of the delivering commit, from any work or publication ref named in the message of the merge that brought it in (GitHub, GitLab, Bitbucket and plain git phrasings), and from a Co-Authored-By trailer."
  - "A ref is decoded with the project's own workRefTemplate, so the agent is found wherever the template puts it; a publication ref is mapped back to its work ref first."
  - "Squash, rebase and merge-commit histories each attribute in a test on a real repository, and so does a project with a non-default template."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 9b774a291 (S1+S2). S1 (atribución de implementador): cada checkpoint del WIP engine lleva un trailer con el ref para el que se escribió (junto a scope y digest); el trailer sobrevive squash y rebase; el implementador se lee en orden: trailer work-ref del commit entregador → refs nombrados en el mensaje del merge (GitHub/GitLab/Bitbucket/git plano) → Co-Authored-By; el ref se decodifica con el workRefTemplate del proyecto y el publication ref se mapea atrás; squash/rebase/merge-commit y template no-default se testean sobre repo real. S2 (review queue + CLI): tool read-only lista lo pendiente oldest-first con estado, implementador (grabado/derivable/faltante), candidatos con su origen, gate, acceptance y la llamada exacta; el CLI expone la cola y proposals review acepta commit + evidencia; el knowledge del workflow declara el procedimiento del reviewer; el overview cuenta las pendientes y apunta a la cola. Acceptance: 30/30 review-attribution.spec + 43/43 en el lote. Sin cambios fuera de alcance.
### S3 — One call tells a reviewer what the review backlog needs
- **Status**: done
- **DependsOn**: [S2]
- **Files**: `plugins/proposals/src/lib/tools/review-queue.tool.ts`, `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`, `plugins/proposals/src/lib/services/review-attribution.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-attribution.interface.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/surface/disclosure.ts`, `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-repo.ts`, `packages/cli/src/commands/groups/proposals.ts`, `packages/cli/src/commands/groups/proposals.spec.ts`, `plugins/proposals/src/lib/services/delivery-history.service.ts`, `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`, `packages/cli/src/commands/registry.spec.ts`, `plugins/proposals/tests/src/lib/plugin.spec.ts`
- **Gate**: e2e
- acceptance:
  - "A read-only tool lists every proposal in review, oldest first, and for each slice: its review state, the implementer (recorded, derivable from Git, or the datum that is missing), the candidate delivering commits with where each came from, its gate and acceptance, and the exact next call."
  - "A proposal whose slices are all reviewed but which is still in review names the transition that closes it, or why it cannot close."
  - "The CLI exposes the queue, and `proposals review` accepts the commit and the evidence an approval needs, so a console-only agent can finish a review."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 1a7be4e01 (x00646 S3, merge 9b774a291 = PR #459). review-queue.tool.ts (read-only) lista oldest-first cada propuesta en review con por-slice: estado, implementador (grabado/derivable/faltante), candidatos con origen, gate, acceptance y la llamada exacta (next-action). Las propuestas listas para cerrar (todas las slices revisadas) aparecen con readyToClose y el next-action que propone la transición. El CLI expone la cola vía proposals review-queue; proposals review acepta --commit + --validate-exit + --tests-passing + --tests-total para aprobar desde consola. 16/16 verde en los 2 specs focalizados (review-queue.tool + review-queue-candidates). claude-opus-5-5 != minimax-m3 → veredicto independiente. Sin cambios fuera de alcance.

### S4 — Every host receives the same review procedure from the server
- **Status**: done
- **Files**: `plugins/proposals/src/lib/knowledge/proposal-workflow.ts`, `plugins/proposals/src/lib/skills/proposals-workflow-contribution.ts`, `plugins/proposals/src/lib/services/review-identity.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`, `plugins/proposals/tests/src/lib/knowledge/proposal-workflow-review.spec.ts`, `plugins/proposals/tests/src/lib/skills/proposals-workflow-contribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/review-identity.spec.ts`
- **Gate**: type
- acceptance:
  - "The workflow knowledge states the reviewer's procedure: take the queue, verify each slice against its diff, gate and acceptance, then approve with evidence or request changes naming what, where, how to reproduce and what must hold; never edit code, never submit for the implementer, never close without a verdict."
  - "The overview's proposals snapshot counts the proposals awaiting review and points at the queue."
  - "No product message tells an adopter to run a script that exists only in this repository."
  - "A reviewer in another clone, machine, CI job or cloud agent can approve a round the document records, although the local submit journal is absent there; self-approval is still refused."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé b01987f5f (x00646 S4, merge 9b774a291 = PR #459). knowledge/proposal-workflow.ts añade el texto del procedimiento del reviewer (cola → verificar diff/gate/acceptance → aprobar con evidencia o pedir cambios con what/where/repro/what-must-hold → nunca editar código, nunca submit por el implementer, nunca cerrar sin veredicto). skills/proposals-workflow-contribution.ts lo enrola en el assembly genérico. review-identity.ts + sync-proposals.ts consolidan que un reviewer en otro clone/MCP/CI/cloud aprueba rondas grabadas sin journal local de submit; self-approval sigue siendo rehusada. 13/13 verde en los 3 specs focalizados + bun run typecheck exit 0. claude-opus-5-5 != minimax-m3 → veredicto independiente. Sin cambios fuera de alcance.

### S5 — A delivery nobody signed is reviewed as unrecorded
- **Status**: done
- **Files**: `plugins/proposals/src/lib/contracts/constants/review-attribution.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-attribution.interface.ts`, `plugins/proposals/src/lib/services/review-attribution.ts`, `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`, `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-queue-candidates.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
- **Gate**: e2e
- acceptance:
  - "When a commit belongs to the slice but nothing in Git names who delivered it, the round opens under the reserved implementer `unrecorded`, the slice records that independence could not be verified, and the review goes ahead (maintainer decision, 2026-09-25)."
  - "A candidate that names its author is preferred over an unsigned one; no reviewer may review under the reserved name."
  - "A change request needs no delivering commit, so work that was never delivered can be sent back; an approval still needs one."
  - "The review queue lists unsigned deliveries as needs-verdict with implementerSource `unrecorded`."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 2b5fe0e77 (x00646 S5, merge 9b774a291 = PR #459). review-attribution.service.ts añade la fallback chain: work-ref trailer → merge-message refs (GitHub/GitLab/Bitbucket/git) → Co-Authored-By → reserved 'unrecorded'. La reserved name es usable por el sistema pero no por un reviewer (auto-rechazo). Un request_changes NO necesita commitHash (ya estaba opcional), un approve SÍ (gate). La cola lista las entregas unsigned como needs-verdict con implementerSource='unrecorded' (visible en review-queue.tool.spec). 145/145 verde en los 5 specs focalizados. claude-opus-5-5 != minimax-m3 → veredicto independiente. Sin cambios fuera de alcance.

## acceptance

- Every checkpoint commit the WIP engine writes carries a trailer naming the ref it was written for, next to the scope and digest trailers.
- The trailer survives a squash merge that keeps commit bodies and a rebase, so the delivery stays attributable whatever the forge does.
- The implementer is read, in order, from the work-ref trailer of the delivering commit, from any work or publication ref named in the message of the merge that brought it in (GitHub, GitLab, Bitbucket and plain git phrasings), and from a Co-Authored-By trailer.
- A ref is decoded with the project's own workRefTemplate, so the agent is found wherever the template puts it; a publication ref is mapped back to its work ref first.
- Squash, rebase and merge-commit histories each attribute in a test on a real repository, and so does a project with a non-default template.
- A read-only tool lists every proposal in review, oldest first, and for each slice: its review state, the implementer (recorded, derivable from Git, or the datum that is missing), the candidate delivering commits with where each came from, its gate and acceptance, and the exact next call.
- A proposal whose slices are all reviewed but which is still in review names the transition that closes it, or why it cannot close.
- The CLI exposes the queue, and `proposals review` accepts the commit and the evidence an approval needs, so a console-only agent can finish a review.
- The workflow knowledge states the reviewer's procedure: take the queue, verify each slice against its diff, gate and acceptance, then approve with evidence or request changes naming what, where, how to reproduce and what must hold; never edit code, never submit for the implementer, never close without a verdict.
- The overview's proposals snapshot counts the proposals awaiting review and points at the queue.
- No product message tells an adopter to run a script that exists only in this repository.
