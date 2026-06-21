---
id: f00035
status: ready
type: proposal
track: apps+monorepo+docs
date: 2026-06-21
kind: feat
title: Rename IDE shell + relocate extensions — apps/ide → packages/ui-extension, apps/vscode → extensions/vscode, app name → ui-extension / extension-vscode
shipped-in: []
reservedFiles:
    - apps/ide/
    - apps/ide/package.json
    - apps/ide/src/
    - apps/ide/tests/
    - apps/vscode/
    - apps/vscode/package.json
    - apps/vscode/src/
    - apps/vscode/media/
    - apps/vscode/scripts/
    - tsconfig.base.json
    - tsconfig.json
    - vitest.config.ts
    - vitest.shared.ts
    - package.json
    - docs/CROSS-IDE.md
    - docs/IDE-EXTENSION.md
    - docs/proposals/done/feats/f00014-feat-ide-extension-vscode-and-friends.md
    - tools/scripts/dev/dev.script.ts
    - tools/scripts/lib/monorepo-paths.ts
    - tools/scripts/lib/monorepo-paths.spec.ts
related:
    - f00022 # IDE extension v2 — defined apps/ide and apps/vscode with their current names; this proposal supersedes that naming
    - f00034 # CLI mcp-vertex single binary — its `packages/cli/` move is the precedent for non-app workspace packages
    - f00014 # original IDE extension vscode and friends
ownership:
    - {
          agent: implementation_runner,
          task: 'S1: git mv apps/ide → packages/ui-extension + rename package.json name "@mcp-vertex/ide" → "@mcp-vertex/ui-extension"',
      }
    - {
          agent: implementation_runner,
          task: 'S2: update tsconfig.base.json paths + vitest.shared.ts alias map + vitest.config.ts projects + tsconfig.json include globs',
      }
    - {
          agent: implementation_runner,
          task: 'S3: git mv apps/vscode → extensions/vscode + rename package.json name "mcp-vertex-vscode" → "@mcp-vertex/extension-vscode"',
      }
    - {
          agent: implementation_runner,
          task: 'S4: update root package.json workspaces + scripts (lint:ide, check:i18n:ide, lint:brand, sync:logo, lint:cross-ide, package) to point at extensions/vscode and packages/ui-extension',
      }
    - {
          agent: implementation_runner,
          task: 'S5: update extension-vscode internal imports + extension.ts references + tools/scripts/dev/dev.script.ts (root/title paths)',
      }
    - {
          agent: implementation_runner,
          task: 'S6: update tools/scripts/lib/monorepo-paths.ts WELL_KNOWN map (extensions/vscode instead of apps/vscode) + corresponding spec',
      }
    - {
          agent: implementation_runner,
          task: 'S7: update docs/CROSS-IDE.md + docs/IDE-EXTENSION.md + AGENTS.md to reference new paths + new naming',
      }
    - {
          agent: implementation_runner,
          task: 'S8: bun run validate green + .vsix packaging test + update CHANGELOG.md with rename entry',
      }
globalGate: lint
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint:cross-ide, expect: exit0 }
    - { command: bun run check:i18n:ide, expect: exit0 }
    - { command: bun run lint:brand, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: cd extensions/vscode && bun run package, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00035 — Rename IDE shell + relocate extensions to dedicated folder

## Goal

Resolver tres confusiones reales del layout actual en una sola pasada,
sin cambiar comportamiento ni romper consumidores externos:

1. **`@mcp-vertex/ide` se llama como si fuera la extensión**. Hoy el
   nombre del paquete induce a error: alguien que aterriza en el repo
   lee "ide" y asume que es "la extensión para IDEs". En realidad es
   una **librería de UI agnóstica** que las extensiones consumen para
   renderizar su dashboard. Renombrar a **`@mcp-vertex/ui-extension`**
   deja claro que **es UI que sirve para construir extensiones**, no
   que es una extensión en sí misma.
2. **`apps/ide` está en la carpeta equivocada**. `apps/` está
   reservada para aplicaciones con un entrypoint publicable (hoy
   `apps/web` es Astro, `apps/vscode` produce un `.vsix`). `apps/ide`
   no es ninguna de las dos cosas: es una librería reusable sin
   binario, sin servidor y sin proceso. Debe vivir en **`packages/`**
   junto a `packages/core` y `packages/client`. Mover a
   **`packages/ui-extension/`** (reflejando el rename de S1).
3. **Las extensiones no son "apps" ordinarias**. `apps/vscode` convive
   con `apps/web` pero pertenecen a categorías distintas: la web es un
   sitio estático, la extensión VS Code es un binario instalable. Crear
   **`extensions/`** como categoría propia deja libre `apps/` para
   productos con un entrypoint único y deja claro que las extensiones
   son un dominio con su propia carpeta.

Layout resultante tras la propuesta:

````
packages/
├── core/                # MCP server (sin cambios)
├── client/              # stdio client (sin cambios)
└── ui-extension/        # ← antes apps/ide — librería reusable, sin entrypoint

extensions/
├── vscode/              # ← antes apps/vscode — produce .vsix
├── jetbrains/           # (futuro, se crea cuando se implemente)
└── zed/                 # (futuro, se crea cuando se implemente)

apps/
└── web/                 # sitio Astro (sin cambios)
````

El naming sigue un patrón simétrico: **`ui-extension`** ↔
**`extension-vscode`**. El primero es la UI que las extensiones
componen; el segundo es la instancia concreta para VS Code.

## Why

### Evidencia de la confusión de naming

Sesión 2026-06-21: al presentar `apps/ide` y `apps/vscode` al usuario,
su primera lectura fue "ide es la extensión, vscode es una extensión
para él". Esa lectura es incorrecta pero **es la lectura natural**
del nombre actual. Renombrar elimina la ambigüedad sin tener que
explicarla en cada README.

### Evidencia de la categoría equivocada

- `apps/` en este repo se usa para entrypoints publicables con un
  ciclo de vida claro (sitio web servible, extensión `.vsix`
  instalable). `apps/ide` no encaja: su `package.json` es
  `private: true`, no produce binario, no tiene `main` ni `bin`, y
  su único script es `vitest`. Es estructuralmente idéntico a
  `packages/core` o `packages/client` — debe vivir con ellos.
- El precedente `f00034` mueve `packages/cli/` con la misma
  justificación ("no es app, es binario CLI"), pero `packages/cli`
  sí tiene `bin` y entrypoint. **`ui-extension` ni siquiera tiene
  eso**: es todavía más librera que CLI.

### Evidencia de la categoría de extensiones

- `f00014` y `f00022` ya hablan de "extensions" como dominio
  (`IHostAdapter`, `extensions.cross-IDE`). Tener una carpeta
  física `extensions/` no es nuevo, es **consistente** con la
  terminología que el repo ya usa.
- Mañana, cuando se añadan `extensions/jetbrains/` y
  `extensions/zed/`, `extensions/` ya existe y solo se rellena.

### Por qué no aplazar

Cada nueva extensión añade coste de renombre si se hace después.
Hacerlo ahora, con un solo consumidor (`extensions/vscode`), cuesta
8 slices pequeños. Hacerlo cuando haya 3-4 hosts cuesta 3-4 veces
más y bloquea trabajo paralelo durante la migración.

## why this design

Las decisiones de layout y naming que se toman aquí están guiadas por
cinco reglas no negociables:

1. **`packages/core` se queda agnóstico.** Ningún import nuevo a
   `vscode`, `jetbrains`, `zed` o cualquier host aparece bajo
   `packages/core` o plugins. La regla de `f00014` y `f00022` se
   preserva intacta.
2. **`@mcp-vertex/ui-extension` se queda host-agnostic.** Ningún
   import nuevo a `vscode.*`, `@types/vscode`, `com.intellij.*`,
   `zed_extension_api`, etc. Los únicos imports de hosts permitidos
   siguen viviendo en `extensions/<host>/src/`.
3. **`bun run validate` queda verde** después de cada slice. El
   refactor no puede dejar el repo roto en ningún commit intermedio.
4. **`git mv` se usa para preservar historial.** El rename de
   carpetas se hace con `git mv`, no con `rm + mkdir + git add`,
   para que `git log --follow` siga el rastro de archivos a través
   del renombre.
5. **`@mcp-vertex/ide` queda como alias deprecated durante 1 minor.**
   El nuevo paquete publica `exports['./legacy']` que apunta al
   barrel antiguo durante un ciclo de release, con un warning a
   consola si se importa desde `apps/vscode` u otros consumers.
   Esto permite revertir sin romper a quien ya integró.

## Slices

### S1 — `apps/ide/` → `packages/ui-extension/` + rename package

- **Status**: pending
- **Files**:
  - `apps/ide/`
  - `packages/ui-extension/package.json`
- `git mv apps/ide packages/ui-extension` (preserva historial)
- En `packages/ui-extension/package.json`:
  - `name`: `@mcp-vertex/ide` → `@mcp-vertex/ui-extension`
  - `description`: actualizar para reflejar "UI reusable que las
    extensiones consumen para renderizar su dashboard"
  - `version`: bump `0.1.0` → `1.0.0` (BREAKING: cambio de nombre
    público)
- **Acceptance**:
  - "Tras `git mv`, `git log --follow packages/ui-extension/src/index.ts`
    muestra el historial completo desde `apps/ide`."
  - "El `package.json` declara el nuevo nombre y la versión major."
- **Gate**: `bun run typecheck` (expect exit0)

### S2 — Update tsconfig + vitest paths

- **Status**: pending
- **Files**:
  - `tsconfig.base.json`
  - `tsconfig.json`
  - `vitest.config.ts`
  - `vitest.shared.ts`
- [`tsconfig.base.json`](tsconfig.base.json) — actualizar paths:
  - `"@mcp-vertex/ide"` → `"@mcp-vertex/ui-extension"`
  - `"@mcp-vertex/ide/public"` → `"@mcp-vertex/ui-extension/public"`
  - `"@mcp-vertex/ide/*"` → `"@mcp-vertex/ui-extension/*"`
  - Apuntar a `packages/ui-extension/src/index.ts` y subpaths
- [`vitest.shared.ts`](vitest.shared.ts) — actualizar el alias map
  (`find`/`replacement` de `@mcp-vertex/ide` → `@mcp-vertex/ui-extension`,
  rutas de `apps/ide/src/...` → `packages/ui-extension/src/...`)
- [`vitest.config.ts`](vitest.config.ts) — actualizar el array de
  projects: `'apps/ide'` → `'packages/ui-extension'`
- [`tsconfig.json`](tsconfig.json) — actualizar globs include:
  - `"apps/ide/src/**/*"` → `"packages/ui-extension/src/**/*"`
  - `"apps/ide/tests/**/*"` → `"packages/ui-extension/tests/**/*"`
- **Acceptance**:
  - "`grep -rn '@mcp-vertex/ide[^a-z-]' packages apps extensions` no
    devuelve resultados (solo el legacy alias en `ui-extension`)."
  - "`bun run typecheck` exit 0."
- **Gate**: `bun run typecheck` (expect exit0)

### S3 — `apps/vscode/` → `extensions/vscode/` + rename package

- **Status**: pending
- **Files**:
  - `apps/vscode/`
  - `extensions/vscode/package.json`
- `git mv apps/vscode extensions/vscode` (preserva historial)
- En `extensions/vscode/package.json`:
  - `name`: `mcp-vertex-vscode` → `@mcp-vertex/extension-vscode`
  - `description`: actualizar para reflejar "instancia concreta del
    host VS Code que consume `@mcp-vertex/ui-extension`"
  - `version`: bump `0.2.0` → `1.0.0` (BREAKING: cambio de nombre
- **Gate**: `bun run typecheck` (expect exit0)

### S4 — Update root `package.json` workspaces + scripts

- **Status**: pending
- **Files**:
  - `package.json`
  - `bun.lock`
  - "`git log --follow extensions/vscode/src/extension.ts` muestra
    el historial completo desde `apps/vscode`."
  - "El `package.json` declara el nuevo nombre y la versión major."

### S4 — Update root `package.json` workspaces + scripts

- [`package.json`](package.json) `workspaces` — reemplazar
  `"apps/*"` por `"apps/*"` + `"extensions/*"`:
  ```json
  "workspaces": [
      "packages/*",
      "plugins/*",
      "apps/*",
      "extensions/*",
      "examples/*"
  ]
  ```
- Scripts a actualizar (referencias a `apps/vscode` y `apps/ide`):
  - `lint:ide`: `cd apps/vscode` → `cd extensions/vscode`
  - `check:i18n:ide`: idem
  - `lint:brand`: idem
  - `sync:logo`: idem
  - `lint:cross-ide`: `apps/ide` → `packages/ui-extension`
  - `package`: `cd apps/vscode` → `cd extensions/vscode`
- **Acceptance**:
  - "`grep -n 'apps/vscode\\|apps/ide' package.json` no devuelve
    resultados."
  - "`bun install` regenera `bun.lock` con los nuevos paths."
- **Gate**: `bun install` (expect exit0)

### S5 — Update `extensions/vscode` internal imports

- **Status**: pending
- **Files**:
  - `extensions/vscode/src/`

- [`extensions/vscode/src/extension.ts`](apps/vscode/src/extension.ts)
  y todo el árbol `src/` — reemplazar imports relativos y aliases:
  - `from '@mcp-vertex/ide'` → `from '@mcp-vertex/ui-extension'`
  - `from '@mcp-vertex/ide/public'` → `from '@mcp-vertex/ui-extension/public'`
- **Acceptance**:
  - "`grep -rn '@mcp-vertex/ide' extensions/vscode/src/` no devuelve
    resultados."
  - "`cd extensions/vscode && bun run type` exit 0."
- **Gate**: `bun run --cwd extensions/vscode typecheck` (expect exit0)

### S6 — Update dev script + monorepo paths library

- **Status**: pending
- **Files**:
  - `tools/scripts/dev/dev.script.ts`
  - `tools/scripts/lib/monorepo-paths.ts`
  - `tools/scripts/lib/monorepo-paths.spec.ts`

- [`tools/scripts/dev/dev.script.ts`](tools/scripts/dev/dev.script.ts):
  - `root: join(ROOT, 'apps/ide')` → `join(ROOT, 'packages/ui-extension')`
  - `title: 'apps/ide — dashboard preview'` → `'packages/ui-extension — dashboard preview'`
  - `root: join(ROOT, 'apps/vscode')` → `join(ROOT, 'extensions/vscode')`
  - `title: 'apps/vscode — webviews preview'` → `'extensions/vscode — webviews preview'`
  - Mensaje de error: `'apps/ide/src/dev/entry.ts'` →
    `'packages/ui-extension/src/dev/entry.ts'`
- [`tools/scripts/lib/monorepo-paths.ts`](tools/scripts/lib/monorepo-paths.ts):
  - `WELL_KNOWN.vscode()`: `${repoRoot()}/build/apps/vscode` →
    `${repoRoot()}/build/extensions/vscode`
  - Doc comments que mencionan `apps/vscode/<version>` →
    `extensions/vscode/<version>`
- [`tools/scripts/lib/monorepo-paths.spec.ts`](tools/scripts/lib/monorepo-paths.spec.ts):
  - Actualizar asserts con los nuevos paths
- **Acceptance**:
  - "`bun tools/scripts/dev/dev.script.ts --ide` arranca sirviendo en
    el puerto esperado desde `packages/ui-extension/`."
  - "`bun run test -- tools/scripts/lib/monorepo-paths.spec.ts` exit 0."
- **Gate**: `bun run test -- tools/scripts/lib/monorepo-paths.spec.ts` (expect exit0)

### S7 — Update docs

- **Status**: pending
- **Files**:
  - `docs/CROSS-IDE.md`
  - `docs/IDE-EXTENSION.md`
  - `AGENTS.md`

- [`docs/CROSS-IDE.md`](docs/CROSS-IDE.md):
  - `apps/ide/src/host-adapter.types.ts` →
    `packages/ui-extension/src/host-adapter.types.ts`
  - `apps/vscode/package.json` → `extensions/vscode/package.json`
  - `apps/vscode/src/host/vscode-host-adapter.ts` →
    `extensions/vscode/src/host/vscode-host-adapter.ts`
  - `apps/vscode/src/i18n/` → `extensions/vscode/src/i18n/`
  - `apps/ide/tests/host-adapter.types.spec.ts` →
    `packages/ui-extension/tests/host-adapter.types.spec.ts`
  - `bun run lint:cross-ide` (texto): `apps/ide` →
    `packages/ui-extension`
  - `@mcp-vertex/ide` → `@mcp-vertex/ui-extension` en toda la prosa
- [`docs/IDE-EXTENSION.md`](docs/IDE-EXTENSION.md):
  - Diagrama ASCII: `@mcp-vertex/ide` → `@mcp-vertex/ui-extension`,
    `apps/vscode` → `extensions/vscode`
  - Sección "Brand assets": `apps/vscode/media/...` →
    `extensions/vscode/media/...`
  - Sección "Development": `apps/vscode` → `extensions/vscode`
  - Sección "Troubleshooting": idem
- [`AGENTS.md`](AGENTS.md):
  - Sección "What this repo is": enumerar `packages/ui-extension` y
    `extensions/vscode` en lugar de `apps/ide` y `apps/vscode`
- **Acceptance**:
  - "`grep -rn 'apps/ide\\|apps/vscode' docs/` solo devuelve el
    historial en `docs/proposals/done/feats/f00014-feat-ide-extension-vscode-and-friends.md`
    (que es una feat histórica; se acepta como referencia inmutable)."
  - "`bun run lint:proposals` exit 0."
- **Gate**: `bun run lint:proposals` (expect exit0)

### S8 — Validate + CHANGELOG + .vsix packaging test

- **Status**: pending
- **Files**:
  - `CHANGELOG.md`
  - `dist/extensions/vscode/` (artefacto generado)

- `bun run validate` — typecheck + lint + scss + test verde
- `cd extensions/vscode && bun run package` — produce el `.vsix`
  con el nuevo nombre en `dist/extensions/vscode/<version>/@mcp-vertex-extension-vscode-<version>.vsix`
  (o el nombre equivalente que decida `vsce` para el nuevo
  package name — verificar)
- [`CHANGELOG.md`](CHANGELOG.md) — añadir entrada bajo la sección
  Unreleased:
  ```markdown
  ### Changed (BREAKING)
  - `@mcp-vertex/ide` renombrado a `@mcp-vertex/ui-extension`.
    La API pública y los paneles son byte-identical; solo cambia
    el nombre del package y su ubicación (`apps/ide` →
    `packages/ui-extension`).
  - `mcp-vertex-vscode` renombrado a `@mcp-vertex/extension-vscode`.
    Sin cambios funcionales; nueva ubicación (`apps/vscode` →
    `extensions/vscode`).
  - Los workspaces de Bun ahora incluyen `extensions/*` además de
    `apps/*`.
- **Gate**: `bun run validate` (expect exit0)

## acceptance

Criterios verificables que la propuesta completa debe satisfacer
más allá de los gates individuales de cada slice:

- [ ] `bun run typecheck` exit 0 (sin errores residuales de alias)
- [ ] `bun run lint` exit 0 (biome + `lint:cross-ide` verde)
- [ ] `bun run test` exit 0 (toda la suite pasa tras los moves)
- [ ] `bun run lint:proposals` exit 0 (esta propuesta sigue el
      canonical scaffold)
- [ ] `cd extensions/vscode && bun run package` produce un `.vsix`
      válido en `dist/extensions/vscode/<version>/`
- [ ] `bun run check:i18n:ide` exit 0 (las 12 lenguas siguen
      paritarias tras el move)
- [ ] `bun run lint:brand` exit 0 (el logo sigue sincronizado tras
      el move de la carpeta media)
- [ ] CHANGELOG.md tiene una entrada BREAKING documentando los dos
      renames + la nueva categoría `extensions/`
- [ ] `git log --follow packages/ui-extension/src/index.ts` y
      `git log --follow extensions/vscode/src/extension.ts` muestran
      el historial completo a través del rename (git mv, no rm+add)
  ```
- **Acceptance**:
  - "`bun run validate` exit 0."
  - "`cd extensions/vscode && bun run package` produce un `.vsix`
    válido."
  - "CHANGELOG.md tiene la entrada BREAKING documentada."

## notes

### Migration map (referencia rápida)

| Antes | Después |
|---|---|
| `apps/ide/` | `packages/ui-extension/` |
| `apps/vscode/` | `extensions/vscode/` |
| `@mcp-vertex/ide` (package) | `@mcp-vertex/ui-extension` (package) |
| `mcp-vertex-vscode` (package) | `@mcp-vertex/extension-vscode` (package) |
| `@mcp-vertex/ide` (alias TS) | `@mcp-vertex/ui-extension` (alias TS) |
| `@mcp-vertex/ide/*` (alias TS) | `@mcp-vertex/ui-extension/*` (alias TS) |
| `@mcp-vertex/ide/public` (alias TS) | `@mcp-vertex/ui-extension/public` (alias TS) |
| `apps/ide` (root scripts) | `packages/ui-extension` (root scripts) |
| `apps/vscode` (root scripts) | `extensions/vscode` (root scripts) |
| `apps/vscode` (vitest project) | `extensions/vscode` (vitest project) |
| `apps/vscode/media/...` (docs) | `extensions/vscode/media/...` (docs) |
| `apps/vscode/src/...` (docs) | `extensions/vscode/src/...` (docs) |
| `build/apps/vscode` (paths) | `build/extensions/vscode` (paths) |
| `dist/apps/vscode/<version>` (paths) | `dist/extensions/vscode/<version>` (paths) |

## risks and mitigations

- **R1 — `vsce` rechaza el nuevo package name `@mcp-vertex/extension-vscode`**.
  Los nombres con scope `@org/pkg` son válidos en `vsce` desde 2022,
  pero el `.vsix` resultante puede llevar un nombre distinto al
  declarado en `package.json`. **Mitigación**: S8 incluye un test
  manual de packaging; si `vsce` rechaza, fallback a mantener
  `mcp-vertex-vscode` como `name` y añadir `@mcp-vertex/extension-vscode`
  como `displayName`.
- **R2 — Bun workspaces no resuelve `extensions/*` por glob**.
  Bun sí soporta `workspaces: ['extensions/*']` desde 1.0, pero si
  la versión de Bun del repo es anterior hay que actualizar.
  **Mitigación**: S4 valida con `bun install` + `bun run validate`
  antes de seguir con S5+.
- **R3 — `git mv` falla porque `apps/ide/` o `apps/vscode/` tienen
  cambios sin commitear**. **Mitigación**: S0 (fuera de scope, pero
  prerrequisito) — `git status --porcelain` limpio antes de empezar.
- **R4 — Algún consumer externo (downstream) importa
  `@mcp-vertex/ide` por nombre**. **Mitigación**: S1 publica un
  alias `exports['./legacy']` con deprecation warning durante un
  minor.

## notes (cross-references)

- Sustituye el naming propuesto por `f00022` (que reservó los nombres
  actuales). Las reservedFiles de `f00022` quedan obsoletas tras
  esta propuesta — quien ejecute `f00022` debe correr antes
  `f00035` para que los paths sigan existiendo.
- Sigue el precedente de `f00034` (`packages/cli/` como workspace
  package, no `apps/`). La justificación de "no es app, es librería"
  es la misma.
- Documenta la categoría `extensions/` que ya aparecía en la
  terminología de `f00014` y `f00022` (`CROSS-IDE.md`, `IHostAdapter`,
  multi-IDE).# Cross-references