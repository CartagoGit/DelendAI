---
id: r00045
title: "Centralizar todos los artefactos de build bajo `build/` (un único árbol, sin `dist/` por paquete)"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-08-31
---

# r00045 — Centralizar todos los artefactos de build bajo `build/` (un único árbol, sin `dist/` por paquete)

## Goal

**Nota de diseño:** Node/npm no permiten que `package.json#exports` escape del
directorio del paquete con `../build`. Por tanto, `build/` será la única salida
de compilación del monorepo, mientras que el pipeline de publicación creará un
staging temporal por paquete, copiará allí su slice de `build/` como `dist/`,
ejecutará `npm pack`/`npm publish` sobre ese staging y lo eliminará al terminar.
No habrá `dist/` persistentes en los workspaces.

Eliminar el layout disperso actual — 60+ carpetas `dist/` regadas por `packages/*`, `plugins/*`, `extensions/*`, `apps/*` y `tools/*` — y centralizar todos los artefactos de transpilación/bundling bajo un único árbol versionado por nombre + versión: `build/{group}/{name}/{version}/{...}`. Cada `package.json#main` / `#exports` apunta a su ruta canónica en `build/`. Esto cierra tres clases de bugs que arrastramos: (a) drift entre `dist/`s al ejecutar `gen-all --check` porque el resolver cae a `dist/` cuando un consumidor (bun, vitest, tsc) no inyecta la condition `@mcp-vertex/source`; (b) fugas cruzadas entre bundlers (un `dist/` que importa `../src/` de otro paquete) porque cada `package.json#exports` es ahora un único árbol inmutable; (c) 25 MB de `dist/` duplicados en cada clonación de CI, todos resueltos con un solo `git clean -fdx build/`. El trabajo se estructura en 4 slices paralelos por dominio: (S1) build driver — `tools/scripts/compile/build.script.ts` reescrito para emitir bajo `build/packages/<name>/<version>/`, `build/plugins/<name>/<version>/`, etc., con `--outdir` absoluto; (S2) `package.json#exports` — reescribir los 57 paquetes con `main` y `exports` apuntando a `../../build/<group>/<name>/<version>/...` (relativos al `package.json`); (S3) anti-fuga — nuevo lint `lint:no-build-imports-from-src` que escanea `build/**/*.js` y falla si algún `from '../src/'` o `from '../../src/'` cruza de `build/` a `src/`; (S4) runtime resolver — forzar `bun --conditions @mcp-vertex/source` globalmente vía `bunfig.toml` y `tsconfig.base.json#customConditions` para que `bun tools/scripts/**`, `vitest` y `tsc --noEmit` nunca resuelvan contra `build/` salvo para `npm publish`. Acceptance/DoD: (1) `git status` no muestra ningún `dist/` modificado tras `bun run build`; (2) `bun tools/scripts/gen-all.script.ts --check` resuelve TODOS sus `@mcp-vertex/*` desde `src/`, no `build/`; (3) `bun run validate` exit 0 incluyendo el nuevo lint; (4) `npm publish --dry-run` sobre `packages/core` genera un tarball con el árbol canónico bajo `build/packages/core/<version>/` y los consumers lo importan vía `exports`; (5) cero referencias a `./dist/` o `dist/index.js` en cualquier `package.json` del monorepo (validable con `rg '"\\./dist' packages plugins extensions apps`).

## why

1) **`DUPLICATE_SLICE_GIT_OWNER` sale de `plugins/proposals/dist/index.js`** (no del `src/`), prueba de que los `gen-all --check` están corriendo contra artefactos compilados obsoletos, no contra el código real. 2) **25 MB de `dist/` por clonación** (60 directorios; `packages/core/dist` 4.8M, `plugins/proposals/dist` 2.9M, raíz `dist/` 2.8M, top 5 ya suman 14.1M). Cada CI rebuildea desde cero aunque `src/` no haya cambiado. 3) **Cada paquete tiene su propio `dist/` aislado**, lo que invita a bundlers a hacer `require('../src/foo')` cuando su `package.json#exports` no cubre el path — ver `plugins/proposals/dist/index.js` para ver un bundle que importa rutas internas de otros paquetes. 4) **Bun sin `--conditions @mcp-vertex/source` resuelve a `dist/`**: el resolver real del monorepo ignora `customConditions` cuando el script se invoca fuera del tsconfig root, lo que es exactamente lo que pasa con `tools/scripts/gen-all.script.ts`. 5) **`/build/` ya existe** (`build/apps/`, `build/docs-api/`, `build/inspect/`, `build/ci/`) con `.gitignore` que lo marca como artefacto. La pieza que falta es mover los `dist/` allí.

## non-goals

- No convertir el proyecto a `npm` workspaces — se mantiene `bun` workspaces.
- No eliminar la condition `@mcp-vertex/source` — es el mecanismo que evita el drift en CI y se mantiene.
- No migrar a un sistema de build distribuido (turborepo/nx) — `bun build` + `tsc --emitDeclarationOnly` sigue siendo el pipeline.
- El packaging de VS Code usa `vsce`, pero su staging y artefacto final deben vivir bajo `build/extensions/vscode/`; no debe recrear `extensions/vscode/dist/`.
- No consolidar extensiones (`extensions/vscode/`) dentro de `apps/` — son dominios distintos con pipelines distintos.

## Slices

- global_gate: e2e

### S1 — build driver: emitir bajo `build/{group}/{name}/{version}/`
- **Status**: pending
- **Files**: `tools/scripts/compile/build.script.ts`, `tools/scripts/compile/bundle-js.ts`, `tools/scripts/compile/build.spec.ts`, `.gitignore`
- **Gate**: e2e
- acceptance:
  - "bun run build escribe `build/packages/core/<version>/index.js` y `.d.ts` con subpaths `contracts/`, `runtime/`, `plugin/`, `node/`, `version`"
  - "bun run build escribe `build/plugins/proposals/<version>/{index,public/index}.{js,d.ts}`"
  - "bun run build es idempotente: una segunda corrida sin cambios no toca timestamps ni genera bytes"
  - "bun run build.script.ts build packages/core sale con exit 0 y el árbol bajo `build/packages/core/<version>/` contiene `index.js`, `public/index.js`, `contracts/index.js`, `runtime/index.js`, `plugin/index.js`, `node/index.js`, `version.js` y sus `.d.ts`"
  - "Las 57 entradas `package.json#main` con valor `./dist/...` se reducen a 0 (verificable con `rg '"\\./dist' packages plugins extensions apps -l`)"
  - ".gitignore deja de ignorar `dist/` raíz y `packages/*/dist/`, `plugins/*/dist/` (siguen ignorados por la nueva entrada `/build/`)"

### S2 — package.json main/exports apuntan al árbol `build/` canónico
- **Status**: pending
- **Files**: `packages/*/package.json`, `plugins/*/package.json`, `tools/scripts/migrate-package-exports.script.ts`, `tools/scripts/migrate-package-exports.script.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Todos los `packages/*/package.json` y `plugins/*/package.json` declaran `"main": "./build/<group>/<name>/<version>/index.js"` con paths relativos al package.json (no absolutos)"
  - "Cada `exports["."]` resuelve a `./build/<group>/<name>/<version>/index.js` (import) y `./build/<group>/<name>/<version>/index.d.ts` (types), con la rama `@mcp-vertex/source` preservada apuntando a `./src/...`"
  - "Cada `exports["./public"]` apunta a `./build/<group>/<name>/<version>/public/index.js`"
  - "`bun pm ls` sigue reconociendo los 57 workspaces con la misma jerarquía"
  - "Script `tools/scripts/migrate-package-exports.script.ts --check` retorna exit 0 sobre todo el monorepo (validación de que no quedó ningún `./dist/` literal)"

### S3 — lint:no-build-imports-from-src — anti-fuga entre `build/` y `src/`
- **Status**: pending
- **Files**: `tools/scripts/lint/no-build-imports-from-src.script.ts`, `tools/scripts/lint/no-build-imports-from-src.spec.ts`, `package.json`
- **Gate**: lint
- acceptance:
  - "Lint escanea `build/**/*.js` (excluyendo `node_modules`) y reporta cualquier `import ... from '../src/'` o `require('../src/')` que cruce desde un artefacto de build hacia código fuente"
  - "Permite imports relativos que permanezcan dentro del propio `build/<group>/<name>/<version>/`"
  - "Permite imports `@mcp-vertex/<otro>` (que resuelven a otro artefacto `build/`)"
  - "Wired en `bun run validate` (incluido en `lint` scope) — viola -> exit 1"
  - "Tests cubren: import válido dentro del paquete, fuga `../src/`, fuga `../../packages/foo/src/`, import `@mcp-vertex/core` (debe pasar)"

### S4 — Runtime resolver: bun + vitest + tsc nunca resuelven a `build/`
- **Status**: pending
- **Files**: `bunfig.toml`, `tsconfig.base.json`, `vitest.shared.ts`, `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
- **Gate**: e2e
- acceptance:
  - "`bunfig.toml` declara `[install]\nregistry = ...` y `[run]\nconditions = ["@mcp-vertex/source"]` para que `bun tools/scripts/**` siempre inyecte la condition source"
  - "`tsconfig.base.json#compilerOptions.customConditions` ya incluye `@mcp-vertex/source` (verificado) y se documenta como contrato: cualquier tsconfig del monorepo debe extender `tsconfig.base.json`"
  - "`vitest.shared.ts` configura `resolve.conditions: ['@mcp-vertex/source', 'node', 'import', 'default']` explícitamente"
  - "Demostración: `bun tools/scripts/gen-all.script.ts --check` corre sin tocar `build/`; los `require()` que aparezcan en su stdout apuntan todos a `src/`"
  - "`docs/mcp-vertex/AGENT-BOOTSTRAP.md` sección "Build / dist layout" reescrita para reflejar el árbol `build/{group}/{<version>/` y la regla "scripts nunca resuelven a `build/`""
  - "`bun run validate` exit 0 completo"

## acceptance

- bun run build escribe `build/packages/core/<version>/index.js` y `.d.ts` con subpaths `contracts/`, `runtime/`, `plugin/`, `node/`, `version`
- bun run build escribe `build/plugins/proposals/<version>/{index,public/index}.{js,d.ts}`
- bun run build es idempotente: una segunda corrida sin cambios no toca timestamps ni genera bytes
- bun run build.script.ts build packages/core sale con exit 0 y el árbol bajo `build/packages/core/<version>/` contiene `index.js`, `public/index.js`, `contracts/index.js`, `runtime/index.js`, `plugin/index.js`, `node/index.js`, `version.js` y sus `.d.ts`
- Las 57 entradas `package.json#main` con valor `./dist/...` se reducen a 0 (verificable con `rg '"\\./dist' packages plugins extensions apps -l`)
- .gitignore deja de ignorar `dist/` raíz y `packages/*/dist/`, `plugins/*/dist/` (siguen ignorados por la nueva entrada `/build/`)
- Todos los `packages/*/package.json` y `plugins/*/package.json` declaran `"main": "./build/<group>/<name>/<version>/index.js"` con paths relativos al package.json (no absolutos)
- Cada `exports["."]` resuelve a `./build/<group>/<name>/<version>/index.js` (import) y `./build/<group>/<name>/<version>/index.d.ts` (types), con la rama `@mcp-vertex/source` preservada apuntando a `./src/...`
- Cada `exports["./public"]` apunta a `./build/<group>/<name>/<version>/public/index.js`
- `bun pm ls` sigue reconociendo los 57 workspaces con la misma jerarquía
- Script `tools/scripts/migrate-package-exports.script.ts --check` retorna exit 0 sobre todo el monorepo (validación de que no quedó ningún `./dist/` literal)
- Lint escanea `build/**/*.js` (excluyendo `node_modules`) y reporta cualquier `import ... from '../src/'` o `require('../src/')` que cruce desde un artefacto de build hacia código fuente
- Permite imports relativos que permanezcan dentro del propio `build/<group>/<name>/<version>/`
- Permite imports `@mcp-vertex/<otro>` (que resuelven a otro artefacto `build/`)
- Wired en `bun run validate` (incluido en `lint` scope) — viola -> exit 1
- Tests cubren: import válido dentro del paquete, fuga `../src/`, fuga `../../packages/foo/src/`, import `@mcp-vertex/core` (debe pasar)
- `bunfig.toml` declara `[install]\nregistry = ...` y `[run]\nconditions = ["@mcp-vertex/source"]` para que `bun tools/scripts/**` siempre inyecte la condition source
- `tsconfig.base.json#compilerOptions.customConditions` ya incluye `@mcp-vertex/source` (verificado) y se documenta como contrato: cualquier tsconfig del monorepo debe extender `tsconfig.base.json`
- `vitest.shared.ts` configura `resolve.conditions: ['@mcp-vertex/source', 'node', 'import', 'default']` explícitamente
- Demostración: `bun tools/scripts/gen-all.script.ts --check` corre sin tocar `build/`; los `require()` que aparezcan en su stdout apuntan todos a `src/`
- `docs/mcp-vertex/AGENT-BOOTSTRAP.md` sección "Build / dist layout" reescrita para reflejar el árbol `build/{group}/{<version>/` y la regla "scripts nunca resuelven a `build/`"
- `bun run validate` exit 0 completo
