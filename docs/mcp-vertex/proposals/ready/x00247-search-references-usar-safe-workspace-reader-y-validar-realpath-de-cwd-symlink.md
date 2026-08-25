---
id: x00247
title: "\"search-references-usar-safe-workspace-reader-y-validar-realpath-de-cwd-symlink\""
kind: fix
status: review
type: proposal
track: filesystem
date: 2026-08-25
parent-plan: q00005
---

# x00247 — search-references usa SafeWorkspaceReader para validar cwd real

## Goal

Hacer que `search_references` rechace `cwd` cuyo realpath salga del workspace y que lea archivos TypeScript mediante `SafeWorkspaceReader`.

## why

El tool compartía el mismo patrón vulnerable que `search_symbol`: containment léxico con `resolveWorkspaceContained` y lectura directa de ficheros. Un symlink raíz podía exponer fuentes fuera del workspace declarado por el host.

## non-goals

- No cambia la heurística de referencias ni el formato de hits.
- No aborda `roots` de `search_search`; eso se cubre en `x00248`.

## Slices

- global_gate: none

### S1 — Migrar search_references al reader seguro
- **Status**: done
- **Files**: `plugins/search/src/lib/tools/search-references.tool.ts`, `plugins/search/src/lib/services/search-safe-reader.ts`, `plugins/search/tests/src/lib/tools/search-references.tool.spec.ts`
- **Gate**: none

## acceptance

- `search_references` usa `SafeWorkspaceReader` para validar y recorrer `cwd`.
- Un `cwd` symlink que resuelve fuera del workspace devuelve `toolError` y no inspecciona archivos externos.
- La spec focalizada de `search_references` cubre el caso adversarial del symlink.
