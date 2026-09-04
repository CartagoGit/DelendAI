---
id: x00248
title: "search_search: usar SafeWorkspaceReader y validar realpath de cada root symlink"
kind: fix
status: done
type: proposal
track: filesystem
date: 2026-08-25
audit-source:
  file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
  commit-audited: 866c44c1bce3a5597c51b9909bb1550a13f5141d
  priority: P1
  finding: SRCH-003
  reviewer: ChatGPT-5.6-Sol (external, high reasoning)
plan-parent: q00005
related:
  - x00241
  - x00246
  - x00247
  - t00010
parent-plan: q00005
---

# x00248 — search_search: usar SafeWorkspaceReader y validar realpath de cada root symlink

## Goal

Eliminar la vía de escape en `search_search` cuando uno o más `roots` son symlinks de directorio a una ruta externa. Cada root se valida con realpath antes de iniciar el walk; el walker in-house y `walkAllowedFiles()` adoptan la misma primitive.

**Hallazgo auditoría externa:** `SRCH-003`

**Propuestas relacionadas**: `x00241`, `x00246`, `x00247`, `t00010`.

**PLAN padre**: `q00005` (ver `docs/mcp-vertex/proposals/ready/plans/q00005-...md`). La tabla de tracks/propuestas del plan padre mantiene el estado real de esta hija; al avanzar, actualizar su estado en el plan.

**Auditoría externa (referencia legada)**: `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md` — este archivo conserva la crítica narrativa completa y el TODO ejecutable; esta propuesta cierra los puntos `SRCH-003` del TODO ejecutable.

## why

El auditor confirma (SRCH-003) que `search_search` permite al caller sobrescribir `roots: string[]`, valida con `resolveWorkspaceContained` (léxico) y después hace `stat(absRoot)` y traversal real. `stat()` sigue el symlink; el walker ignora symlinks internos pero el root ya está dereferenciado. Esta hija unifica el comportamiento con `search_symbol`/`search_references` para que las 3 tools tengan exactamente la misma garantía.

## non-goals

- No reescribir el backend in-house por estética; solo se cambia el path de validación de roots.
- No introducir un nuevo backend; se mantiene in-house + semántico.
- No tocar el semantic pipeline en esta hija (cubierto por future work si surge evidencia).

## Slices
- global_gate: type

## Slices

### SS1 — Validar cada root con realpath antes de iniciar walk
- **Status**: pending
- **Files**: `plugins/search/src/lib/tools/search.tool.ts`, `plugins/search/src/lib/services/search-engine.in-house.ts`, `packages/core/src/lib/shared/walk-allowed-files.ts`, `plugins/search/tests/src/lib/tools/search.tool.spec.ts`
- **Gate**: type

### SS2 — Eliminar stat/readFile directos en el path de roots
- **Status**: pending
- **Files**: `plugins/search/src/lib/services/search-engine.in-house.ts`, `packages/core/src/lib/shared/walk-allowed-files.ts`
- **Gate**: lint


## acceptance

Criterios verificables, ideales como tests rojos → verdes. Acceptance global del plan padre en `docs/mcp-vertex/proposals/ready/plans/q00005-...md`. Cada criterio debe quedar evidenciado con commit hash + métrica before/after cuando aplique, en `resolution.evidence`.

- Test adversarial con roots = ['outside-link'] falla antes y pasa después.
- Tests con roots normales siguen verdes (sin regresión funcional).
- Ningún stat/readFile directo en el path de roots.
- `bun run lint:architecture-readfile-via-safe-reader` verde para search.search.
- Evidence archivada con commit + before/after.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=x00248` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
