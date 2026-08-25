---
id: x00248
title: "\"search-search-usar-safe-workspace-reader-y-validar-realpath-de-roots-symlink\""
kind: fix
status: review
type: proposal
track: filesystem
date: 2026-08-25
parent-plan: q00005
---

# x00248 — search_search valida roots por realpath con SafeWorkspaceReader

## Goal

Hacer que `search_search` rechace `roots` cuyo realpath salga del workspace y reutilice `SafeWorkspaceReader` como primitive de validación y lectura segura en sus backends.

## why

`searchWorkspace()` filtraba raíces con containment léxico, pero una raíz symlink dentro del workspace seguía pudiendo apuntar fuera. Eso afectaba al backend in-house y al backend `rg`, y podía materializarse incluso cuando el input parecía relativo y válido.

## non-goals

- No cambia la semántica de matching, límites ni fallback entre backends.
- No vacía todavía la allowlist completa del lint de safe-reader; esa limpieza final vive en `c00016`.

## Slices

- global_gate: none

### S1 — Validar roots reales en ambos backends
- **Status**: done
- **Files**: `plugins/search/src/lib/services/search-engine.in-house.ts`, `plugins/search/src/lib/services/search-engine.backends.ts`, `plugins/search/src/lib/services/search-safe-reader.ts`, `plugins/search/tests/src/lib/services/search.service.spec.ts`, `plugins/search/tests/src/lib/services/search-engine.backends.spec.ts`
- **Gate**: none

## acceptance

- `searchWorkspace()` rechaza raíces que resuelven fuera del workspace aunque su path léxico parezca interno.
- El backend in-house y el backend `rg` comparten la misma validación fail-closed para `roots` explícitas.
- Las specs focalizadas cubren el caso adversarial de symlink-root y mantienen el diagnóstico de `scanned: 0` accionable.
