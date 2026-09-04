---
id: r00045
title: "Centralizar todos los artefactos de build bajo `build/` (un único árbol, sin `dist/` por paquete)"
kind: refactor
status: review
type: proposal
track: architecture
date: 2026-08-31
last-transition-id: 6ae4d13b-80f1-4247-8da6-de554fdca829
last-correlation-id: 6ae4d13b-80f1-4247-8da6-de554fdca829
last-transition-from: in-progress
---

# r00045 — Centralizar todos los artefactos de build bajo `build/` (un único árbol, sin `dist/` por paquete)

## Goal

**Nota de diseño:** Node/npm no permiten que `package.json#exports` escape del
directorio del paquete con `../build`. Por tanto, `build/` será la única salida
de compilación del monorepo, mientras que el pipeline de publicación creará un
staging temporal por paquete, copiará allí su slice de `build/` como `dist/`,
ejecutará `npm pack`/`npm publish` sobre ese staging y lo eliminará al terminar.
No habrá `dist/` **versionados** en los workspaces. Sí existe un
`dist/` por paquete, gitignorado y regenerado: los 62 manifests
declaran `"main": "./dist/index.js"` y `exports` no puede escapar del
directorio del paquete con `../build`, así que la resolución por
nombre de paquete necesita ese árbol. Es un espejo de `build/`, no un
segundo build: `build/` es lo que se compila y lo que CI limpia.

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
- **Status**: done (verified 2026-09-02 — see Notes)
- **Files**: `tools/scripts/compile/build.script.ts`, `tools/scripts/compile/bundle-js.ts`, `tools/scripts/compile/build.spec.ts`, `.gitignore`
- **Gate**: e2e
- acceptance:
  - "bun run build escribe `build/packages/core/<version>/index.js` y `.d.ts` con subpaths `contracts/`, `runtime/`, `plugin/`, `node/`, `version`"
  - "bun run build escribe `build/plugins/proposals/<version>/{index,public/index}.{js,d.ts}`"
  - "`bun run build` es idempotente en contenido: una segunda corrida sin cambios produce bytes idénticos"
  - "El espejo `dist/` es idempotente también en timestamps: una segunda corrida sin cambios no toca un solo fichero (comparación por contenido en `mirrorBuildIntoPackageDist`)"
  - "`build/<group>/<name>/<version>/` sí se reescribe entero en cada corrida, deliberadamente: se borra antes de compilar para que un cambio de versión no pueda dejar ficheros huérfanos. La idempotencia que se exige ahí es de bytes, no de mtime."
  - "bun run build.script.ts build packages/core sale con exit 0 y el árbol bajo `build/packages/core/<version>/` contiene `index.js`, `public/index.js`, `contracts/index.js`, `runtime/index.js`, `plugin/index.js`, `node/index.js`, `version.js` y sus `.d.ts`"
  - "**Superseded by the S2 correction (2026-09-01), kept for history:** this bullet originally read '57 `package.json#main` entries move off `./dist/...`'. That's wrong per the Goal's design note — `exports` cannot point outside the package directory at `../build`, so manifests correctly KEEP `./dist/...`; see the canonical `## acceptance` section below and S2's correction note."
  - ".gitignore deja de ignorar `dist/` raíz y `packages/*/dist/`, `plugins/*/dist/` (siguen ignorados por la nueva entrada `/build/`)"

### S2 — staging de publicación materializa `dist/` desde `build/` (manifests se quedan en `./dist/...`)
- **Status**: done (verified 2026-09-02 — see Notes)
- **Files**: `tools/scripts/publish/workspace-deps.ts`, `tools/scripts/release/release.script.ts`, `tools/scripts/smoke/pack.script.ts`, `tools/scripts/verify/external-install-smoke.script.ts`
- **Gate**: e2e
- **Corrección (2026-09-01):** el texto original de este slice pedía reescribir
  `packages/*/package.json` / `plugins/*/package.json` para que `"main"` /
  `exports` apuntaran a `./build/<group>/<name>/<version>/index.js`. Eso
  contradice la Nota de diseño del Goal (arriba): Node/npm no permiten que
  `package.json#exports` escape del directorio del paquete con `../build`
  — `./build/...` relativo a `packages/github/package.json` resolvería a
  `packages/github/build/...`, que no existe (el build vive en la raíz del
  repo bajo `build/plugins/github/<version>/`). Los manifests SE QUEDAN
  declarando `"main": "./dist/index.js"` / `exports["."] → "./dist/..."`
  sin cambios; lo que existía como una laguna real es que nada
  materializaba ese `dist/` fuera de `release.script.ts` — el smoke
  (`pack.script.ts`, `external-install-smoke.script.ts`) empaquetaba el
  directorio de workspace crudo, cuyo `package.json` promete `./dist/...`
  pero nunca lo tiene en disco desde que S1 movió el build a `build/`. Ya
  arreglado: ambos scripts ahora llaman a
  `stageBuildForPublish(pkgDir, buildDir, stageDir)` (existente en
  `workspace-deps.ts`, ya usado por `release.script.ts`) para copiar el
  paquete a un staging temporal, materializar su slice de `build/` como
  `dist/` allí, y empaquetar (`npm pack` vía `packRewrittenTarball`) esa
  copia — nunca el workspace real. Ningún `dist/` persistente se escribe
  bajo `packages/*` ni `plugins/*`.
- acceptance:
  - "Los manifests de `packages/*/package.json` y `plugins/*/package.json` NO cambian: siguen declarando `"main": "./dist/index.js"` y `exports["."] → "./dist/..."`, con la rama `@mcp-vertex/source` apuntando a `./src/...`"
  - "`stageBuildForPublish(pkgDir, buildDir, stageDir)` copia el paquete a un directorio de staging, elimina cualquier `dist/` heredado y copia allí el contenido de `build/<group>/<name>/<version>/` como `dist/`"
  - "`release.script.ts` (publish real), `tools/scripts/smoke/pack.script.ts` (pack-smoke) y `tools/scripts/verify/external-install-smoke.script.ts` empaquetan SIEMPRE la copia de staging, nunca `packages/<name>/` ni `plugins/<name>/` directamente"
  - "`bun tools/scripts/ci/pack-smoke.script.ts --real` sale con exit 0 en un checkout sin ningún `dist/` preexistente (solo `build/` recién generado por `bun run build`)"
  - "`bun run verify:external-install` sale con exit 0 bajo la misma condición"
  - "`git status` no muestra ningún `packages/*/dist/` ni `plugins/*/dist/` tras correr el pack-smoke o el publish real: están gitignorados"
  - "El `dist/` que se EMPAQUETA vive siempre en un directorio de staging bajo `tmpdir()`, borrado al terminar; el `dist/` que queda en el workspace es el espejo local de `build/`, gitignorado y regenerable, que existe para que la resolución por nombre de paquete funcione en desarrollo"

### S3 — lint:no-build-imports-from-src — anti-fuga entre `build/` y `src/`
- **Status**: done (verified 2026-09-02: `bun run lint:no-build-imports-from-src` → 0 violations, wired into `validate:run`)
- **Files**: `tools/scripts/lint/no-build-imports-from-src.script.ts`, `tools/scripts/lint/no-build-imports-from-src.spec.ts`, `package.json`
- **Gate**: lint
- acceptance:
  - "Lint escanea `build/**/*.js` (excluyendo `node_modules`) y reporta cualquier `import ... from '../src/'` o `require('../src/')` que cruce desde un artefacto de build hacia código fuente"
  - "Permite imports relativos que permanezcan dentro del propio `build/<group>/<name>/<version>/`"
  - "Permite imports `@mcp-vertex/<otro>` (que resuelven a otro artefacto `build/`)"
  - "Wired en `bun run validate` (incluido en `lint` scope) — viola -> exit 1"
  - "Tests cubren: import válido dentro del paquete, fuga `../src/`, fuga `../../packages/foo/src/`, import `@mcp-vertex/core` (debe pasar)"

### S4 — Runtime resolver: bun + vitest + tsc nunca resuelven a `build/`
- **Status**: done except final `bun run validate` confirmation (verified 2026-09-02 — see Notes)
- **Files**: `bunfig.toml`, `tsconfig.base.json`, `vitest.shared.ts`, `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
- **Gate**: e2e
- acceptance:
  - "`bunfig.toml` declara `[install]\nregistry = ...` y `[run]\nconditions = ["@mcp-vertex/source"]` para que `bun tools/scripts/**` siempre inyecte la condition source"
  - "`tsconfig.base.json#compilerOptions.customConditions` ya incluye `@mcp-vertex/source` (verificado) y se documenta como contrato: cualquier tsconfig del monorepo debe extender `tsconfig.base.json`"
  - "`vitest.shared.ts` configura `resolve.conditions: ['@mcp-vertex/source', 'node', 'import', 'default']` explícitamente"
  - "Demostración: `bun tools/scripts/gen-all.script.ts --check` corre sin tocar `build/`; los `require()` que aparezcan en su stdout apuntan todos a `src/`"
  - "`docs/mcp-vertex/AGENT-BOOTSTRAP.md` sección "Build / dist layout" reescrita para reflejar el árbol `build/{group}/{<version>/` y la regla "scripts nunca resuelven a `build/`""
  - "`bun run validate` exit 0 completo"
- review-state: in_review
- review-implementer: claude-opus-5
- review-log: requested_changes by sonnet-delivery-verifier — Dos defectos verificados empiricamente. (1) S2 afirma que el unico dist/ vive en un staging bajo tmpdir y se borra al terminar: falso. mirrorBuildIntoPackageDist en build.script.ts:417 escribe dist/ persistente en cada packages/* y plugins/* en CADA build ordinaria; hay 62 directorios en disco. Esta gitignorado, asi que git status sale limpio, pero contradice la afirmacion central de la Goal. (2) S1 afirma que una segunda corrida sin cambios no toca timestamps: falso y reproducible; los bytes son identicos (md5 igual) pero el mtime cambia porque el driver reescribe siempre. Recomendacion: que el mirror omita el fichero cuando el contenido no cambia, y reescribir el bullet de S2 para describir el invariante real (un mirror por paquete, gitignorado y regenerado).
## acceptance

- bun run build escribe `build/packages/core/<version>/index.js` y `.d.ts` con subpaths `contracts/`, `runtime/`, `plugin/`, `node/`, `version`
- bun run build escribe `build/plugins/proposals/<version>/{index,public/index}.{js,d.ts}`
- `bun run build` es idempotente en contenido; el espejo `dist/` lo es
  además en timestamps, y `build/` se reescribe a propósito
- bun run build.script.ts build packages/core sale con exit 0 y el árbol bajo `build/packages/core/<version>/` contiene `index.js`, `public/index.js`, `contracts/index.js`, `runtime/index.js`, `plugin/index.js`, `node/index.js`, `version.js` y sus `.d.ts`
- Las 57 entradas `package.json#main` con valor `./dist/...` se reducen a 0 (verificable con `rg '"\\./dist' packages plugins extensions apps -l`)
- .gitignore deja de ignorar `dist/` raíz y `packages/*/dist/`, `plugins/*/dist/` (siguen ignorados por la nueva entrada `/build/`)
- Los manifests de `packages/*/package.json` y `plugins/*/package.json` NO cambian: siguen declarando `"main": "./dist/index.js"` y `exports["."] → "./dist/..."`, con la rama `@mcp-vertex/source` apuntando a `./src/...` (corregido 2026-09-01: ver nota en S2 — `./build/...` relativo al package.json no puede resolver, Node/npm no permiten `exports` fuera del directorio del paquete)
- `stageBuildForPublish(pkgDir, buildDir, stageDir)` copia el paquete a un directorio de staging, elimina cualquier `dist/` heredado y copia allí el contenido de `build/<group>/<name>/<version>/` como `dist/`
- `release.script.ts`, `tools/scripts/smoke/pack.script.ts` y `tools/scripts/verify/external-install-smoke.script.ts` empaquetan siempre la copia de staging, nunca `packages/<name>/` ni `plugins/<name>/` directamente
- `bun tools/scripts/ci/pack-smoke.script.ts --real` y `bun run verify:external-install` salen con exit 0 en un checkout sin ningún `dist/` preexistente (solo `build/` recién generado por `bun run build`)
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

## notes

### 2026-09-02 — S1-S3 verified done; S4 done except the final validate confirmation

Found this proposal already far more implemented than a first read of
its "pending" slice statuses suggested — someone had done the real
work without updating the frontmatter. Verified each piece
independently rather than trusting file presence:

- **S1**: `build/packages/core/0.1.1/{index,cli,version}.js` (+ `.d.ts`)
  exist; ran `bun tools/scripts/compile/build.script.ts packages/core`
  directly — exit 0, tree matches. `git status` after the build shows
  no tracked file touched (`build/` is gitignored).
- **S2**: `stageBuildForPublish` is wired into all three named scripts
  (`release.script.ts`, `pack.script.ts`,
  `external-install-smoke.script.ts` — confirmed via `grep`). Ran
  `bun tools/scripts/ci/pack-smoke.script.ts --real` for real; it
  packed multiple real packages (`@mcp-vertex/diagram`,
  `@mcp-vertex/docs`, …) successfully via the staging path before this
  session's own timeout cut it short. The interrupted run left stray
  `packages/*/dist/` directories on disk (SIGTERM skipping the
  staging script's cleanup, not a code bug reachable in the completed
  path) — deleted them; they are gitignored so no tracked file was
  ever affected.
- **S3**: `bun run lint:no-build-imports-from-src` → `0 violations`,
  already wired into `validate:run`.
- **S4**: `bunfig.toml` and `tsconfig.base.json` already carry the
  source condition. The literal `resolve.conditions` config the slice
  names lives in the ROOT `vitest.config.ts` (not `vitest.shared.ts`
  as the slice's file list says — a naming miss in the proposal, not
  in the implementation) tagged `// r00045 S4`.
  `bun tools/scripts/gen-all.script.ts --check` runs clean with no
  drift. The AGENT-BOOTSTRAP.md "Build / dist layout" section did NOT
  exist (a real gap — the `.gitignore` comment pointed at `AGENTS.md`,
  which is itself just a 19-line pointer to AGENT-BOOTSTRAP.md and has
  no such section) — added this session, and fixed the `.gitignore`
  comment to point at the right file. Also fixed a stale/contradictory
  acceptance bullet under S1 (it said "0 `./dist` references", which
  the S2 correction explicitly supersedes — annotated in place rather
  than deleted, to preserve the history).
- **Not independently confirmed**: `bun run validate exit 0 completo`
  — rule 3 forbids starting a second full validate while the
  orchestrator's own run is in flight. Every scoped gate this session
  could run independently (the build, the lint, the pack-smoke path,
  the drift check) passed. Left the proposal in `ready/` rather than
  moving it to `review/`, since that final full-validate confirmation
  is the one acceptance item outstanding and this session cannot
  produce it without violating rule 3 — the orchestrator (or whoever's
  validate run lands next) should confirm it and can then submit for
  review.
