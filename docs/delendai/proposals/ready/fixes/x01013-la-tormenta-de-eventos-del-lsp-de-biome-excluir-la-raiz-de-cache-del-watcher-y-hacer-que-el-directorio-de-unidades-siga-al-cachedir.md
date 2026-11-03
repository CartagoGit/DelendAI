---
id: x01013
title: "La tormenta de eventos del LSP de Biome: excluir la raíz de caché del watcher y hacer que el directorio de unidades siga al cacheDir"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-03
---

# x01013 — La tormenta de eventos del LSP de Biome: excluir la raíz de caché del watcher y hacer que el directorio de unidades siga al cacheDir

## goal

Que el cliente LSP de Biome deje de inundar el log con «Notifying file events failed / Client is not running (-32096)»: (1) el repositorio excluye su raíz de caché del watcher de VS Code, y (2) el motor de trabajo coloca las unidades bajo el cacheDir configurado —la autoridad canónica que ya usan buildSwarmPaths y EVICTION_PROTECTED_PATHS— en vez de una constante fija.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — El watcher de VS Code ignora la raíz de caché
- **Status**: pending
- **Files**: `.vscode/settings.json`
- **Gate**: lint
- acceptance:
  - "`.vscode/settings.json` declara `files.watcherExclude` con `**/.cache/**` en `true`."
  - "`.vscode/settings.json` declara `search.exclude` con `**/.cache/**` en `true`."
  - "El fichero sigue siendo JSONC válido: se parsea con el parser JSONC del repo y conserva sus comentarios."
  - "La exclusión cubre `.cache/delendai/.worktrees/`, la ruta donde el enjambre abre sus worktrees."

### S2 — El directorio de unidades sigue al `cacheDir` configurado
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/units-directory.constant.ts`, `packages/core/src/lib/work-units/units-directory.service.ts`, `packages/core/src/lib/work-units/development-policy.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/worktree-husks.service.ts`, `packages/core/tests/src/lib/work-units/units-directory.spec.ts`
- **Gate**: type
- acceptance:
  - "Un `cacheDir` declarado en `delendai.config.json` decide dónde vive el directorio de unidades: `<cacheDir>/.worktrees`."
  - "Sin `cacheDir` declarado, el directorio de unidades sigue siendo `.cache/delendai/.worktrees`: el comportamiento por defecto no cambia."
  - "`work enter` y el invariante `no-husk-directories` de `work doctor` miran el mismo directorio."
  - "Un `cacheDir` absoluto coloca las unidades fuera del checkout, sin dejar un directorio suelto en la rama de integración."
  - "El typecheck del paquete core pasa y los tests del motor de trabajo pasan."

## acceptance

- `.vscode/settings.json` declara `files.watcherExclude` con `**/.cache/**` en `true`.
- `.vscode/settings.json` declara `search.exclude` con `**/.cache/**` en `true`.
- El fichero sigue siendo JSONC válido: se parsea con el parser JSONC del repo y conserva sus comentarios.
- La exclusión cubre `.cache/delendai/.worktrees/`, la ruta donde el enjambre abre sus worktrees.
- Un `cacheDir` declarado en `delendai.config.json` decide dónde vive el directorio de unidades: `<cacheDir>/.worktrees`.
- Sin `cacheDir` declarado, el directorio de unidades sigue siendo `.cache/delendai/.worktrees`: el comportamiento por defecto no cambia.
- `work enter` y el invariante `no-husk-directories` de `work doctor` miran el mismo directorio.
- Un `cacheDir` absoluto coloca las unidades fuera del checkout, sin dejar un directorio suelto en la rama de integración.
- El typecheck del paquete core pasa y los tests del motor de trabajo pasan.
