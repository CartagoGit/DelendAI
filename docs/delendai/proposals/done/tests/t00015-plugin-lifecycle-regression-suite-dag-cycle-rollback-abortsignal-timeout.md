---
id: t00015
title: "Plugin lifecycle — regression suite (DAG, cycle, rollback, AbortSignal, timeout)"
kind: test
type: proposal
status: done
track: regression
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "LIFE-001 — Regression suite del lifecycle"
    finding: LIFE-001
    priority: P3 (regression guard)
related:
    - x00240 # lifecycle dispose (already closed)
    - plugins/usage-tracking/tests/src/lib/lifecycle-races.spec.ts (existing test)
    - packages/core/src/lib/lifecycle/
shipped-in:
    - 44e9cc529bcce5853d3fb5c024a9bc2515a8fe05 # test(lifecycle): t00015 — plugin lifecycle DAG/cycle/rollback/AbortSignal
---

# t00015 — Plugin lifecycle regression suite

## Goal

Mantener y extender la cobertura del plugin lifecycle con tests que
cubran las 11 clases de escenarios que el audit LIFE-001 enumera:

1. DAG construction (topological order).
2. Cycle detection (rechaza deps circulares).
3. Missing dependencies (rechaza deps inexistentes).
4. Blocked dependents (si una dep falla al register, las
   dependientes se bloquean).
5. Topological registration (orden correcto).
6. Register failure rollback (deshace en orden inverso).
7. Partial runtime dispose (al abortar, dispose los plugins ya
   registrados en orden inverso).
8. AbortSignal propagation (un AbortSignal cascada por todos los
   plugins).
9. Timeout (un plugin que tarda más del timeout se cancela).
10. Late resolution disposal (un plugin resuelto tarde se dispone
    correctamente al unload).
11. External cancellation (un caller cancela desde fuera; el
    lifecycle responde).

## why

LIFE-001 (P3, "CONFIRMADO como mejora ya implementada"). Hay un test
existente en `plugins/usage-tracking/tests/src/lib/lifecycle-races.spec.ts`
pero es específico a usage-tracking (rollup + shutdown). El audit
pide cobertura del lifecycle subsystem en general.

## non-goals

- No rehace el lifecycle subsystem.
- No añade cobertura de side effects que un plugin puede hacer
  externamente (eso es responsabilidad del plugin SDK, no del
  lifecycle).

## Slices

- global_gate: type

### S1 — Inventariar tests existentes del lifecycle

- **Status**: pending
- **Files**: `packages/core/tests/src/lib/lifecycle/` (a localizar)
- **Gate**: type
- notes: "Buscar tests que cubran el lifecycle subsystem. Si ya
  existen los 11 casos, este slice es solo documental."

### S2 — Añadir tests para los gaps

- **Status**: pending
- **Files**: `packages/core/tests/src/lib/lifecycle/lifecycle.spec.ts`
- **Gate**: type
- notes: "Para cada uno de los 11 casos del audit: si no hay test,
  añadir uno."

## acceptance

- 11 casos del audit con al menos un test verde cada uno.
- `bun test packages/core/tests/src/lib/lifecycle/` verde.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
