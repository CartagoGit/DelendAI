---
id: c00014
title: "\"ci-lint-privacy-aquired-en-ci-required\""
kind: chore
status: done
type: proposal
track: ci
date: 2026-08-25
parent-plan: q00005
---

# c00014 — exigir los lints de privacidad en CI

## Goal

Hacer obligatorio en GitHub Actions el agregado `lint:privacy` para que las invariantes de tool identity segura e `internalOnly` deprecado fallen en CI antes de cerrar o promover propuestas.

## why

La tercera auditoría marcó privacidad como invariante P0 legal. Aunque `bun run validate` ya ejecutaba `lint:privacy`, ningún job de CI lo corría de forma explícita. Si el pipeline es la definición de integración, la misma garantía debe vivir en CI y no solo en la disciplina local del autor.

## non-goals

- No cambia la semántica de `lint:privacy` ni de sus sublints.
- No sustituye los tests adversariales de `error-reporting`; solo garantiza que el gate arquitectónico ya existente también viva en CI.

## Slices

- global_gate: none

### S1 — Añadir el guard al job de seguridad
- **Status**: done
- **Files**: `.github/workflows/ci.yml`
- **Gate**: none

## acceptance

- El job `lint-security` de `.github/workflows/ci.yml` ejecuta `bun run lint:privacy`.
- Una regresión que vuelva a exponer `toolName` bruto o reutilice `internalOnly` fuera del punto de compatibilidad permitido puede fallar en CI.
- `bun run typecheck` y `bun run lint:workflow` siguen verdes tras el cambio.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=c00014` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
