---
id: x00246
title: "\"search-symbol-usar-safe-workspace-reader-y-validar-realpath-de-cwd-symlink\""
kind: fix
status: review
type: proposal
track: filesystem
date: 2026-08-25
parent-plan: q00005
---

# x00246 — search-symbol usa SafeWorkspaceReader para validar cwd real

## Goal

Hacer que `search_symbol` rechace `cwd` cuyo realpath salga del workspace y que lea archivos TypeScript a través de `SafeWorkspaceReader` en lugar de `readFile` y `readdir` directos.

## why

La validación previa solo comprobaba containment léxico. Un `cwd` que apuntara a un symlink de directorio dentro del repo pero resuelto fuera permitía leer código externo. Eso contradice la invariante del track A y dejaba al tool fuera del guard arquitectónico ya disponible en core.

## non-goals

- No cambia la lógica de matching de símbolos ni el schema de salida.
- No migra otros tools de search fuera de `search_symbol`; eso vive en las propuestas hermanas del mismo track.

## Slices

- global_gate: none

### S1 — Migrar search_symbol al reader seguro
- **Status**: done
- **Files**: `plugins/search/src/lib/tools/search-symbol.tool.ts`, `plugins/search/src/lib/services/search-safe-reader.ts`, `plugins/search/tests/src/lib/tools/search-symbol.tool.spec.ts`
- **Gate**: none

## acceptance

- `search_symbol` usa `SafeWorkspaceReader` para validar y recorrer `cwd`.
- Un `cwd` que entra por symlink y resuelve fuera del workspace devuelve `toolError` y no lee archivos externos.
- La spec focalizada de `search_symbol` cubre el caso adversarial del symlink.
