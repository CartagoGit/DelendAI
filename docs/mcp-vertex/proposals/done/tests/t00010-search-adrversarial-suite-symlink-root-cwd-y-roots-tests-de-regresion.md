---
id: t00010
title: "Search adversarial suite — symlink-root cwd/roots, tests de regresión"
kind: test
status: done
type: proposal
track: filesystem
date: 2026-08-25
audit-source:
  file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
  commit-audited: 866c44c1bce3a5597c51b9909bb1550a13f5141d
  priority: P1
  finding: SRCH-001 + SRCH-002 + SRCH-003
  reviewer: ChatGPT-5.6-Sol (external, high reasoning)
plan-parent: q00005
related:
  - x00246
  - x00247
  - x00248
parent-plan: q00005
---

# t00010 — Search adversarial suite — symlink-root cwd/roots, tests de regresión

## Goal

Construir una suite adversarial que cubra las 3 vías de escape de filesystem en search con fixtures reproducibles y plataforma-aware.

**Hallazgo auditoría externa:** `SRCH-001 + SRCH-002 + SRCH-003`

**Propuestas relacionadas**: `x00246`, `x00247`, `x00248`.

**PLAN padre**: `q00005` (ver `docs/mcp-vertex/proposals/ready/plans/q00005-...md`). La tabla de tracks/propuestas del plan padre mantiene el estado real de esta hija; al avanzar, actualizar su estado en el plan.

**Auditoría externa (referencia legada)**: `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md` — este archivo conserva la crítica narrativa completa y el TODO ejecutable; esta propuesta cierra los puntos `SRCH-001`, `SRCH-002`, `SRCH-003` del TODO ejecutable.

## why

Sin tests adversariales las hijas x00246..x00248 podrían marcarse como 'fix' sin haber demostrado que el bug ya no existe. La suite es **prerequisite** de los fixes: se observa rojo, luego se aplica fix, luego se observa verde.

## non-goals

- No incluir tests de performance.
- No cubrir symlinks de fichero (no es el ataque descrito por SRCH).
- No crear fixtures que dependan de binarios externos.

## Slices
- global_gate: type

## Slices

### SS1 — Fixture platform-aware (Linux/macOS real symlinks, Windows skip condicional) y los 3 tests adversariales
- **Status**: pending
- **Files**: `plugins/search/tests/src/fixtures/symlink-root-fixture.ts`, `plugins/search/tests/src/lib/tools/search-symbol.tool.symlink.spec.ts`, `plugins/search/tests/src/lib/tools/search-references.tool.symlink.spec.ts`, `plugins/search/tests/src/lib/tools/search.tool.symlink.spec.ts`
- **Gate**: type


## acceptance

Criterios verificables, ideales como tests rojos → verdes. Acceptance global del plan padre en `docs/mcp-vertex/proposals/ready/plans/q00005-...md`. Cada criterio debe quedar evidenciado con commit hash + métrica before/after cuando aplique, en `resolution.evidence`.

- Test 1: search_symbol con cwd = symlink-root → 0 hits externos y la tool devuelve error/diagnóstico de containment.
- Test 2: search_references análogo.
- Test 3: search_search con roots = [symlink-root] → 0 hits externos.
- Windows: si `canCreateSymlinks` es false, los tests se saltan con mensaje explícito (no fallan).
- Los 3 tests son rojos antes de x00246..x00248 y verdes después.
- Evidence archivada con before/after fixture + hash del binario bun usado.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=t00010` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
