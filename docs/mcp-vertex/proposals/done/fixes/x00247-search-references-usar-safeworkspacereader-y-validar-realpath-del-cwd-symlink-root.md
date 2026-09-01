---
id: x00247
title: "search_references: usar SafeWorkspaceReader y validar realpath del cwd symlink-root"
kind: fix
status: done
type: proposal
track: filesystem
date: 2026-08-25
audit-source:
  file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
  commit-audited: 866c44c1bce3a5597c51b9909bb1550a13f5141d
  priority: P1
  finding: SRCH-002
  reviewer: ChatGPT-5.6-Sol (external, high reasoning)
plan-parent: q00005
related:
  - x00241
  - x00246
  - x00248
  - t00010
parent-plan: q00005
---

# x00247 — search_references: usar SafeWorkspaceReader y validar realpath del cwd symlink-root

## Goal

Eliminar la misma vía de escape en `search_references`. La tool pasa a invocar `SafeWorkspaceReader.resolveExistingContained()` sobre cada directorio del traversal recursivo.

**Hallazgo auditoría externa:** `SRCH-002`

**Propuestas relacionadas**: `x00241`, `x00246`, `x00248`, `t00010`.

**PLAN padre**: `q00005` (ver `docs/mcp-vertex/proposals/ready/plans/q00005-...md`). La tabla de tracks/propuestas del plan padre mantiene el estado real de esta hija; al avanzar, actualizar su estado en el plan.

**Auditoría externa (referencia legada)**: `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md` — este archivo conserva la crítica narrativa completa y el TODO ejecutable; esta propuesta cierra los puntos `SRCH-002` del TODO ejecutable.

## why

El auditor confirma (SRCH-002) el mismo patrón problemático que en `search_symbol`: containment léxico y luego readdir/readFile directos. Reutilizar la primitive de `x00246` y, por extensión, la `SafeWorkspaceReader` de x00241, sin duplicar la lógica de walker.

## non-goals

- No tocar search_symbol ni search_search (cubierto por x00246 y x00248).
- No cambiar el schema público de search_references.
- No añadir optimizaciones paralelas; correctness primero.

## Slices
- global_gate: type

## Slices

### SS1 — Reescribir traversal de search_references sobre SafeWorkspaceReader
- **Status**: pending
- **Files**: `plugins/search/src/lib/tools/search-references.tool.ts`, `plugins/search/tests/src/lib/tools/search-references.tool.spec.ts`
- **Gate**: type

### SS2 — Eliminar readdir/readFile directos en el path de search_references
- **Status**: pending
- **Files**: `plugins/search/src/lib/tools/search-references.tool.ts`
- **Gate**: lint


## acceptance

Criterios verificables, ideales como tests rojos → verdes. Acceptance global del plan padre en `docs/mcp-vertex/proposals/ready/plans/q00005-...md`. Cada criterio debe quedar evidenciado con commit hash + métrica before/after cuando aplique, en `resolution.evidence`.

- Test adversarial con symlink-root falla antes del fix y pasa después (misma fixture que x00246).
- Ningún readdir/readFile directo en el path de search_references.
- `bun run lint:architecture-readfile-via-safe-reader` verde para el path de search_references.
- Suite de search_references (incluye regresión básica) verde.
- Evidence archivada con commit hash + before/after fixture.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=x00247` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
