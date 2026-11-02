---
id: t00016
title: "memory plugin — regression guard de dispose (storeWatcher + freshnessDebouncer)"
kind: test
type: proposal
status: done
track: regression
date: 2026-08-25
plan-parent: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "MEM-001 — Regression guard"
    finding: MEM-001
    priority: P3 (regression guard)
related:
    - x00240 # memory watcher dispose cleanup (already closed)
    - plugins/memory/tests/src/lib/memory.spec.ts (existing test at line 482)
shipped-in:
    - 20f495b6733bde651e7068f36ac19e81d9e06c7a # test(memory): t00016 — memory dispose regression guard
---

# t00016 — memory dispose regression guard

## Goal

Mantener y documentar el test que verifica que al hacer `dispose()`
del plugin `memory`, ambos:
- `storeWatcher.dispose()` se ejecuta (y no quedan `fs.watch`
  handles abiertos).
- `freshnessDebouncer.cancel()` se ejecuta (y no quedan timers
  pendientes).

## why

MEM-001 (P3, "CONFIRMADO como arreglado"). El test ya existe en
`plugins/memory/tests/src/lib/memory.spec.ts` alrededor de la línea
482 (caso *"disposes the watcher lifecycle and cancels pending
debounce timers"*). El audit pide mantener la cobertura.

## non-goals

- No cambia el lifecycle del plugin memory.
- No añade cobertura para plugins distintos de memory.

## Slices

- global_gate: type

### S1 — Verificar cobertura actual

- **Status**: pending
- **Files**: `plugins/memory/tests/src/lib/memory.spec.ts`
- **Gate**: type
- notes: "Confirmar que el caso del audit sigue verde."

### S2 — Añadir asserts faltantes (si los hay)

- **Status**: pending
- **Files**: `plugins/memory/tests/src/lib/memory.spec.ts`
- **Gate**: type
- notes: "Si el test actual no assertea explícitamente 'no quedan
  watchers' o 'no quedan timers', añadir el assert."

## acceptance

- Test verde que verifica que tras `dispose()` no quedan watchers
  ni timers.
- `bun test plugins/memory/tests/src/lib/memory.spec.ts` verde.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
