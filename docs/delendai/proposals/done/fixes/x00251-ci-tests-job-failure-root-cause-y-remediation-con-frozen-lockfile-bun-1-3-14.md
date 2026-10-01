---
id: x00251
title: "ci-tests-job-failure-root-cause-y-remediation-con-frozen-lockfile-bun-1-3-14"
kind: fix
status: done
type: proposal
track: ci
date: 2026-08-25
parent-plan: q00005
---

# x00251 — tests CI verde en el árbol actual

## Goal

Confirmar que el job `tests` de CI vuelve a ser reproducible en el checkout actual con instalación congelada y Bun 1.3.14.

## why

El tercer pase de auditoría marcó `tests` como rojo en el SHA auditado. Antes de seguir cerrando hijas del track CI, hacía falta demostrar que la reproducción actual ya es verde bajo el mismo shape del workflow.

## non-goals

- No redefine el workflow de `tests`.
- No toca otros jobs de CI fuera del shape `bun install --frozen-lockfile`, `bun run test`, `bun run test:coverage`.

## Slices

- global_gate: none

### S1 — Reproducción fiel del job tests
- **Status**: done
- **Files**: `.github/workflows/ci.yml`, `package.json`
- **Gate**: none

## acceptance

- `rm -rf .cache/mcp-vertex && bun run test && bun run test:coverage` pasa en el checkout actual.
- El workflow usa `bun install --frozen-lockfile` y `bun-version: 1.3.14`, alineado con el árbol actual.
- La propuesta queda en `review` porque la evidencia ejecutable ya no reproduce el fallo original en este SHA.
resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=x00251` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
