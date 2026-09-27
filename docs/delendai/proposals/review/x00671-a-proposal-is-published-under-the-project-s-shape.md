---
id: x00671
title: "A proposal is published under the project's shape"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-26
priority: P1
related: [x00645, x00563]
last-transition-id: d100fd95-58da-4b7b-b349-80da6e61a2cc
last-correlation-id: d100fd95-58da-4b7b-b349-80da6e61a2cc
last-transition-from: in-progress
shipped-in:
  - "4cfe2cabb0b6264eadc421056bb5b14b952dd256"
---

# x00671 — A proposal is published under the project's shape

## goal

A proposal that `create_proposal` publishes on its own ref is named like
every other publication: `<prefix><agent>/<id>-all-g1/<topic>`. A
proposal written into a unit's worktree is published with that unit, not
on a second ref.

## why

On 2026-09-26 `create_proposal` pushed `delendai/pr/proposal-f00643`. The
maintainer spotted that the name breaks the convention. It was the only
publication ref with no agent, no unit and no topic, so nothing that
reads refs could place it: not the ref lifecycle, not review claims, not
the queue. It was also redundant: the call carried the `checkout` of a
unit that was about to publish the same file. The result was two refs
with one file, and one of them a pull request nobody opened. This
repository's own `publishCommand` told agents to use the same name
(`--ref=delendai/pr/proposal-{id}`).

## why this design

- **One shape.** `publicationRefFor` builds
  `<prefix><agent>/<id>-all-g1/<topic>`. The agent is
  `DELENDAI_AGENT_ID`, or `unattributed` when nothing declares one, never
  a guess (x00548). The topic comes from the title.
- **A unit publishes its own files.** When `checkout` is a worktree on a
  branch under the policy's work-ref prefix, `create_proposal` does not
  publish. It says which unit carries the file, and its `nextAction` is to
  commit the file there and publish the unit.
- **The template follows.** `publishCommand` templates get a `{ref}`
  placeholder, and this repository's template uses it.

## non-goals

- Renaming refs that already exist.

## architecture

- `plugins/proposals/src/lib/tools/publish-proposal.ts`
  (+ `contracts/interfaces/publish-proposal.interface.ts`)
- `plugins/proposals/src/lib/tools/authoring.tool.ts`
- `plugins/proposals/src/lib/tools/proposal-publish-next-action.ts`
- `delendai.config.json`

## Slices

- global_gate: none

### S1 — Proposal publication follows the project's shape

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/publish-proposal.spec.ts plugins/proposals/tests/src/lib/tools/create-proposal-publishes.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/tools/publish-proposal.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/publish-proposal.interface.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/tools/proposal-publish-next-action.ts`
  - `delendai.config.json`
  - `plugins/proposals/tests/src/lib/tools/publish-proposal.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/create-proposal-publishes.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 4cfe2cabb. La publicación de una propuesta usa la FORMA del proyecto: el ref publicado es `<prefix><agent>/<id>-all-g1/<topic>` con `unattributed` cuando no hay agente declarado (delendai.config.json +2 — el template del proyecto); con checkout en la work branch de una unidad, create_proposal no publica nada y nombra la unidad que ya lleva el fichero (no duplica). authoring.tool refactorizado (137 líneas tocadas), publish-proposal +44, specs +88. Acceptance cubierta; gate 22/22 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A published proposal's ref is `<prefix><agent>/<id>-all-g1/<topic>`,
  with `unattributed` when no agent is declared.
- With `checkout` on a unit's work branch, `create_proposal` publishes
  nothing, and names the unit that carries the file.
- A `publishCommand` template's `{ref}` is that ref.
