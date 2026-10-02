---
id: x00790
title: "A change with nothing to test passes its tests"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-10-01
priority: P1
related: [f00538, x00556]
last-transition-id: 3232c5fe-47c1-466d-bcf6-9e96d6ddacb4
last-correlation-id: 3232c5fe-47c1-466d-bcf6-9e96d6ddacb4
last-transition-from: review
---

# x00790 — A change with nothing to test passes its tests

## goal

A pull request whose change reaches no test zone gets a `tests` verdict
instead of a failure, so a forward-sync of `main` into `develop` can land.

## why

On 2026-09-30 the forward-sync pull request #686 (main 0720e8436 into
develop) failed `tests` and could never merge. Its content is already in
develop, so the test planner mapped it to no zone; every zone job ran no
shard and uploaded no blob, and the `tests` job's merge failed with
`ENOENT .vitest-reports`. The release commit stayed outside develop's
history, which is the one thing a forward-sync exists to fix.

## why this design

- The plan is the verdict. The `tests` job reads the planner's own output:
  only a plan that succeeded, whose zone jobs succeeded, and which lists
  its zones with none of them run, skips the merge. Every other case still
  goes through the merge, so a lost blob or a crashed planner still fails.
- Nothing is lowered: the coverage gate and the merge are untouched for
  any run that executed a shard.

## non-goals

- Changing what the planner selects.

## Slices

- global_gate: none

### S1 — The tests job accepts a plan that runs no zone

- **Status**: in-progress
- **Gate**: `bun run lint:workflow`
- **Files**:
  - `.github/workflows/ci.yml`
- shipped-in: `429c2a77fd2b`
- review-state: changes_requested
- review-implementer: unrecorded
- review-reviewer: glm-5.3-max
- review-log: requested_changes by glm-5.3-max — No puedo emitir approve con la evidencia disponible: el diff del commit no quedó inspeccionado y el gate declarado (bun run lint:workflow) no se ejecutó. La verificación de calidad configurada solo expone bun run build y no prueba por sí misma las dos condiciones de acceptance. Adjunta evidencia reproducible del workflow que verifica plan exitoso y zonas no ejecutadas, además de preservar merge/coverage cuando alguna zona sí corre; luego vuelve a solicitar revisión.
- review-attribution: unrecorded — no delivering commit was named for x00790 S1; independence could not be verified, opened by glm-5.3-max

## dependency graph

None.

## acceptance

- A pull request with no content change against develop passes `tests`.
- A run in which any zone ran still merges the blobs and enforces coverage.
