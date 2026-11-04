---
id: c00013
title: "\"ci-lint-architecture-readfile-via-safe-reader-aquired-en-ci-required\""
kind: chore
status: done
type: proposal
track: ci
date: 2026-08-25
parent-plan: q00005
---

# c00013 — exigir el lint de safe-reader en CI

## Goal

Hacer obligatorio en GitHub Actions el lint `lint:architecture-readfile-via-safe-reader` para que cualquier reintroducción de lecturas directas en plugins con `filesystem-read` falle antes del merge.

## why

El lint ya existía y `bun run validate` lo ejecutaba localmente, pero el job `lint-architecture` de CI no lo corría. Esa asimetría dejaba una ventana donde `develop` podía aceptar cambios que violaran la invariante de `SafeWorkspaceReader` si el autor no ejecutaba la validación completa antes de empujar.

## non-goals

- No cambia la implementación del lint ni su allowlist.
- No migra plugins pendientes a `SafeWorkspaceReader`; solo vuelve exigible el guard ya existente en CI.

## Slices

- global_gate: none

### S1 — Añadir el guard al job de arquitectura
- **Status**: done
- **Files**: `.github/workflows/ci.yml`
- **Gate**: none

## acceptance

- El job `lint-architecture` de `.github/workflows/ci.yml` ejecuta `bun run lint:architecture-readfile-via-safe-reader`.
- Un cambio que reintroduzca `readFile` directo en un plugin con `filesystem-read` puede fallar en CI sin depender de `bun run validate` local.
- `bun run typecheck` y `bun run lint:workflow` siguen verdes tras el cambio.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=c00013` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
