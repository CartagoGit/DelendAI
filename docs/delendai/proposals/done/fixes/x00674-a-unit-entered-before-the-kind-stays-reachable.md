---
id: x00674
title: "A unit entered before the kind stays reachable"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [f00644]
last-transition-id: 8a5f19a8-232e-4c75-9ed8-579df0dd3838
last-correlation-id: 8a5f19a8-232e-4c75-9ed8-579df0dd3838
last-transition-from: review
shipped-in:
  - "5fe5c9728c671de03aaf26da81c995c40cf818f5"
---

# x00674 — A unit entered before the kind stays reachable

## goal

`work enter`, `checkpoint` and `publish` find a unit that was entered
before the work-ref shape named its kind, instead of rendering only the
new name and reporting that the unit does not exist.

## why

On 2026-09-27 publishing x00672 failed with "`…/implement/x00672-S1-g1/…`
does not exist". The unit had been entered by the shared checkout's
CLI while it was still 20 commits behind, before f00644, under
`…/x00672-S1-g1/…`. The new CLI rendered the name with the kind segment
only, so every unit entered before f00644 became impossible to publish.
f00644 promised that such units stay pushable and publishable; the
guard kept that promise, but the CLI did not.

## why this design

- **Look for the unit that exists.** When `--kind` is not given and the
  kinded name does not exist, the unit is looked for under the same
  template with its `${kind}/` segment taken out. The template is read,
  not re-spelled. An explicit `--kind` always means the new name.
- The publication keeps the name of the work it publishes, so an old
  unit is published under its old name, which the guard and CI accept
  (f00644).

## non-goals

- Renaming old units.

## architecture

- `packages/cli/src/commands/work.command.ts`: `existingWorkRef`, used
  by enter, checkpoint and publish.

## Slices

- global_gate: none

### S1 — Existing units are found under their old name

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/commands/work.command.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 5fe5c9728. Una unidad cuyo ref no tiene segmento de kind (creada antes de que la forma nombrara el kind, x00644/f00644) sigue siendo publicable: work publish SIN --kind publica bajo SU PROPIO nombre (el template sin el segmento); con --kind usa el nombre kinded. work.command +44 y spec +39 — es el existingWorkRef que esta sesión vio en el código al publicar el pack 1. Acceptance cubierta; gate 82/82 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- A unit whose ref has no kind segment is published by `work publish`
  without `--kind`, under its own name.
- With `--kind`, the kinded name is used.
