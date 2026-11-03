---
id: x01013
title: "La tormenta de eventos del LSP de Biome: excluir la raíz de caché del watcher y hacer que el directorio de unidades siga al cacheDir"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-03
shipped-in:
  - "9740e9514"
  - "5e2124099"
---

# x01013 — La tormenta de eventos del LSP de Biome: excluir la raíz de caché del watcher y hacer que el directorio de unidades siga al cacheDir

## goal

Que el cliente LSP de Biome deje de inundar el log con «Notifying file events failed / Client is not running (-32096)»: (1) el repositorio excluye su raíz de caché del watcher de VS Code, y (2) el motor de trabajo coloca las unidades bajo el cacheDir configurado —la autoridad canónica que ya usan buildSwarmPaths y EVICTION_PROTECTED_PATHS— en vez de una constante fija.

## why

El enjambre abre un worktree git por agente y slice bajo `.cache/delendai/.worktrees/`, y cada worktree trae su propio `biome.json` y su propio `.gitignore`. El repositorio no excluye `.cache/` del watcher de VS Code, así que cada alta y cada baja de worktree (unas veinte rutas) llega al cliente LSP de Biome; las que caen en la ventana en que el cliente no está corriendo fallan con `-32096`. En dos días el log de Biome acumuló 2040 de esos errores frente a 415 notificaciones entregadas, con cuatro reinicios de servidor y dos lecturas de ficheros ya borrados.

La segunda mitad es la causa que el repositorio puede cerrar para siempre: `cacheDir` está documentado como «Where the server keeps its caches — worktrees, indexes, generated artefacts», pero el motor de trabajo lo ignora y usa la constante `DEFAULT_UNITS_DIRECTORY = '.cache/delendai/.worktrees'`. Un proyecto que declara otra `cacheDir` sigue metiendo sus worktrees dentro del árbol, sigue recibiendo la tormenta y además rompe la única autoridad de rutas que ya existe (`buildSwarmPaths` → `<cacheDir>/.worktrees`; `EVICTION_PROTECTED_PATHS` → `.worktrees` bajo la raíz de caché).

## non-goals

- No se mueve la caché de este repositorio fuera del árbol: `delendai.config.json` no cambia, porque el lint del repo exige una única raíz `.cache/` dentro del checkout.
- No se toca `biome.json` ni la extensión `biomejs.biome`: el formateador ya excluye `!.cache` y `!.worktrees`; el problema es de entrega de eventos, no de análisis.
- No se añade un knob nuevo de configuración: la autoridad ya existe (`cacheDir`), y un knob paralelo volvería a tener dos verdades.
- No se cambia la política de eviction, la creación de refs ni la forma de publicar una unidad.

## slices

- global_gate: lint

### S1 — El watcher de VS Code ignora la raíz de caché
- **Status**: pending
- **Files**: `.vscode/settings.json`
- **Gate**: lint
- acceptance:
  - "`.vscode/settings.json` declara `files.watcherExclude` con `**/.cache/**` en `true`."
  - "`.vscode/settings.json` declara `search.exclude` con `**/.cache/**` en `true`."
  - "El fichero sigue siendo JSONC válido: se parsea con el parser JSONC del repo y conserva sus comentarios."
  - "La exclusión cubre `.cache/delendai/.worktrees/`, la ruta donde el enjambre abre sus worktrees."
- shipped-in: `9740e9514`

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
- shipped-in: `5e2124099`

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
