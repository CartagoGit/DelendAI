---
id: t00010
title: "\"search-adrversarial-suite-symlink-root-cwd-y-roots-tests-de-regresion\""
kind: test
status: review
type: proposal
track: filesystem
date: 2026-08-25
parent-plan: q00005
---

# t00010 — suite adversarial de symlink-root para search

## Goal

Cubrir con tests de regresión los tres caminos vulnerables del track A: `search_symbol.cwd`, `search_references.cwd` y `search_search.roots` cuando una ruta léxicamente interna resuelve fuera del workspace por symlink.

## why

Sin una suite adversarial dedicada, la regresión puede volver aunque exista `SafeWorkspaceReader`. El fallo original dependía de una diferencia entre containment léxico y realpath, así que la evidencia correcta es un fixture con symlink real en disco.

## non-goals

- No añade tests de permisos, reserved paths ni otros invariantes de filesystem ajenos a este track.
- No reemplaza las specs funcionales existentes; las complementa con casos adversariales concretos.

## Slices

- global_gate: none

### S1 — Añadir regresiones de symlink fuera del workspace
- **Status**: done
- **Files**: `plugins/search/tests/src/lib/tools/search-symbol.tool.spec.ts`, `plugins/search/tests/src/lib/tools/search-references.tool.spec.ts`, `plugins/search/tests/src/lib/services/search.service.spec.ts`, `plugins/search/tests/src/lib/services/search-engine.backends.spec.ts`
- **Gate**: none

## acceptance

- Las specs de `search_symbol` y `search_references` fallan cerrado cuando `cwd` es un symlink a un directorio externo.
- Las specs de `searchWorkspace` y del backend `rg` fallan cerrado cuando `roots` contiene un symlink externo.
- La suite focalizada del plugin search pasa con esos casos adversariales activos.
