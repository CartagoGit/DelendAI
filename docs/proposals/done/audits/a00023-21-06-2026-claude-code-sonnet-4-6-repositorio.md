---
id: a00023
kind: audit
title: "Auditoría independiente y exhaustiva — Claude Code (Sonnet 4.6)"
status: done
date: 2026-06-21
track: archive
ownership:
  - { agent: implementation_runner, task: 'S1: Execute audit and document findings' }
acceptance:
  - { command: bun run validate, expect: exit0 }
---

# a00023 — Auditoría independiente y exhaustiva — Claude Code (Sonnet 4.6)

> **Superseded by unified audit [`a00022`](../../ready/a00022-21-06-2026-claude-code-sonnet-4-6-auditoria-unificada.md)**
> (consolidación de auditorías ready del 2026-06-21); ver a00022 para hallazgos
> referenciados y slices vivos. Cerrada como referencia histórica.

## Goal

- **Audited Scope**: Monorepo completo (`packages/core`, `packages/client`, `apps/*`, `plugins/*`, `examples/*`).
- **Audited HEAD**: `9085364e14641402f7bb4ba3dcd21d04569d9511` al iniciar la auditoría; el repositorio avanzó en paralelo (otros agentes activos) hasta `efca64a9c585a48cabbfac56c378a93c3dc5c7dc` durante la sesión. Todas las correcciones de esta auditoría están aplicadas y verificadas contra `efca64a9c585a48cabbfac56c378a93c3dc5c7dc` + working tree.
- **Revisor / Model**: Claude Code (Sonnet 4.6)
- **Date**: 2026-06-21

## Why

### 0. Veredicto rápido

Base de código sólida y disciplinada (**8.9/10**), pero el estado *auditado en vivo* no estaba verde: `bun run validate` fallaba en `typecheck` por un contrato roto en el paquete `apps/ide/` (parte de la propuesta `f00022`, en curso), y `bun run site:strict` fallaba al construir `@mcp-vertex/client` por dos bugs de tipos en `DashboardService`. Ambos bloqueos eran genuinos (no flakes) y se han corregido como parte de esta auditoría (`S2`–`S5`). Tras las correcciones, `bun run validate` y `bun run site:strict` quedan completamente verdes. El resto de hallazgos (race condition en `sync-proposal-registry.ts`, I/O síncrono en `notification/watcher.ts` y `rules/manifest.ts`, catchalls residuales) ya estaban correctamente identificados y rastreados por auditorías previas (`a00021`/`a00026`/`a00024`) bajo `f00020`, `f00019` y `l00008` — todas siguen en `status: ready` (no implementadas); esta auditoría no las duplica.

### 1. Por capas

#### Núcleo (`packages/core`)
- **Muy bien**: typecheck raíz limpio, 0 `console.log`, 0 `@ts-ignore`, primitivas durables (`withFileMutex`, `writeFileAtomic`, `resolveWorkspaceContained`) consistentemente usadas en `memory`, `proposals`, `deps`, `docs`, `search`.
- **Regular**: 3 `outputSchema` `z.object({}).catchall(z.unknown())` en `bootstrap-tool.ts` y 1 en `scaffold-tool.ts` siguen presentes — ya cubiertos por `l00008`/`r00002` (no se duplica).

#### Cliente (`packages/client`)
- **Mal (bug genuino, corregido en `S3`)**: `DashboardService.getOverviewModel()` llamaba a `this.client.request('mcp-vertex_overview', { compact: false })` sin generics explícitos, infiriendo `TOut` como `unknown` y rompiendo `bunx tsc -p .../tsconfig.json` durante `scripts/build.ts` (12 errores `TS18046`/`TS7006`). El build de `packages/client` estaba roto en el HEAD auditado.
- **Mal (bug genuino, corregido en `S4`)**: `packages/client/src/public/index.ts` reexportaba `IDashboardAgentsModel`, `IDashboardAllModels`, etc. desde `dashboard-service.ts`, pero esos tipos viven en `dashboard.types.ts` y solo se importaban (no se reexportaban) desde el servicio — error `TS2459` × 10 en el barrel público.
- **Bien**: una vez corregidos ambos, `getAllModels()` agrega 8 modelos derivados sin inventar campos nuevos; buena disciplina de "el servidor es la fuente de verdad".

#### Plugins (`plugins/*`, 13 cargados)
- **Perfecto**: `agent-loop-detector.ts` + `loop-detector-service.ts` (wiring confirmado en `plugins/proposals/src/index.ts:108` y verificado en vivo durante `bun run test`, logs `loop-detector: agent "a1" is stuck...`) — el hallazgo de soft-loop de `a00021` (`H4`/`f120`) está **resuelto**, no diferido.
- **Mal (bug genuino, corregido en `S5`)**: `sync-proposal-registry.ts:564` escribía `docs/proposals/index.json` (archivo trackeado y linteado por Biome) con `JSON.stringify(index, null, '\t')`, pero `biome.json#json.formatter.indentWidth` exige 4 espacios. Cada regeneración automática del índice (disparada por agentes trabajando en background) deja `bun run lint` en rojo hasta que alguien reformatea a mano — confirmado reproducible: el índice driftó dos veces durante esta sesión mientras otros agentes seguían escribiendo propuestas.
- **Regular (ya rastreado)**: race condition en `sync-proposal-registry.ts:331` (`writeFile` sin `writeFileAtomic` antes del `rename`) — sigue abierta, rastreada en `f00020` (`status: ready`).
- **Regular (ya rastreado)**: I/O síncrono en `notification/watcher.ts` (11 usos de `existsSync`/`readdirSync`/`readFileSync` dentro de `setInterval`) y en `rules/frameworks/manifest.ts` (3 usos de `writeFileSync`/`readFileSync`) — siguen abiertas, rastreadas en `f00019` y `l00008` respectivamente.
- **Bajo (corregido en `S6`)**: `plugins/audit/package.json#files` omitía `LICENSE` (y el archivo `LICENSE` ni siquiera existía en el directorio del plugin), a diferencia de los otros 12 plugins publicables.

#### Web App (`apps/web`)
- **Mal (corregido en `S2`)**: `Base.astro` seguía sin `data-pagefind-body`, confirmado reproducible — `bun run site:strict` mostraba "Did not find a data-pagefind-body element... Indexing all `<body>` elements" e indexaba 500 páginas (incluyendo nav/footer/config/search repetidos en cada idioma) en vez de las 338 páginas de contenido real. Hallazgo de `a00021` (`H3`) que seguía sin resolver a pesar de estar "asignado" a un slice `S3` en `a00021`.

#### Extensión IDE-agnóstica (`apps/ide`) — en curso, parte de `f00022`
- **Mal (bug genuino, corregido en `S2`)**: `IStatusBarItem` (en `host-adapter.types.ts`) no declaraba `visible`, pero `FakeStatusBarItem` (en `tests/fake-host-adapter.ts`) y el spec `host-adapter.types.spec.ts` sí lo usaban — 3 errores `TS2339` reproducibles en `tsc --noEmit -p tsconfig.json` con caché fría. Esto bloqueaba *todo* `bun run validate` del monorepo (el script encadena `typecheck && lint && ...`), no solo el paquete en curso.
- **Nota de proceso**: el paquete está deliberadamente incompleto (proposal `f00022` en `status: ready`, slices S1–S11 pendientes); el bug de tipos es responsabilidad de ese trabajo en curso, no un defecto de diseño del shell `IHostAdapter`.

#### VS Code Extension (`apps/vscode`)
- **Bien**: i18n completo (12 idiomas × 8 keys, verificado con `check:i18n`). Sigue excluido de `vitest.config.ts` raíz como proyecto propio (el slot fue ocupado por `apps/ide`, no por `apps/vscode`) — issue de cobertura de gate ya señalado por `a00021`/`a00024`, sin novedad aquí.

### 2. Eficiencia / tokens / bucles / bloqueos
- **Bucles**: el detector de loops (`l103`) está en producción y se disparó en vivo durante los tests (`no-progress` y `exact-repeat`), confirmando que la mitigación de `a00021` funciona end-to-end, no solo a nivel de unidad.
- **Bloqueos**: `withFileMutex` protege `docs/proposals/index.json`; sin embargo, el contenido que produce no es estable frente al gate de formato — un mutex correcto no sustituye a un generador que respete las reglas de Biome.
- **Concurrencia observada en vivo**: durante esta auditoría, el HEAD avanzó de `9085364` a `efca64a` por commits de otro agente trabajando en paralelo sobre los mismos archivos (`dashboard-service.ts`, `dashboard.types.ts`, `embed-service.ts`) que yo estaba corrigiendo; también se detectó un conflicto de merge sin resolver (`apps/web/src/data/skills.json`, "deleted by us") en el working tree. Ambas señales son evidencia directa de que el patrón multiagente del repo necesita una validación de "lint antes de commit" más estricta para los archivos generados (`index.json`) y una política de resolución de conflictos explícita cuando dos agentes tocan el mismo slice — no se abre una propuesta nueva porque ya existe espacio para ello en `l00008`/`auto_work.orchestration`, pero se documenta como evidencia operativa.

### 3. Top acciones para 10/10
1. Cerrar `f00020` (race en `sync-proposal-registry.ts:331`) y `f00019` (sync I/O en `notification/watcher.ts`) — bloquean release según el propio `a00026`.
2. Cerrar `l00008` (sync I/O en `rules/manifest.ts` + catchalls residuales + spec de no-regresión `grep`).
3. Considerar mover la generación de `docs/proposals/index.json` a un paso explícito de `bun run lint --write` post-commit, o ejecutar `biome format --write` dentro de `sync-proposal-registry.ts` tras escribir el archivo, para que el drift de formato deje de ser un riesgo recurrente de gate rojo entre agentes.

## Non-goals

- Resolver `f00020`, `f00019` o `l00008` (ya creadas por auditorías previas; se referencian, no se duplican).
- Resolver el conflicto de merge detectado en `apps/web/src/data/skills.json` más allá de lo necesario para mantener `bun run validate` verde (se documenta como evidencia operativa, no como un finding con slice propio).
- Completar la propuesta `f00022` (IDE extension v2) — solo se corrigen los bugs de tipos que bloqueaban el gate global.
- Re-auditar a fondo `apps/vscode` (ya cubierto por `a00021`/`a00024`).

## Slices

- global_gate: lint

### S1 — Execute audit and document findings
- **Files**: docs/proposals/ready/a00023-21-06-2026-claude-code-sonnet-4-6-repositorio.md
- **Gate**: bun run lint:proposals
- **Status**: pending

### S2 — Fix `IStatusBarItem` missing `visible` + add `data-pagefind-body`
- **Files**:
  - apps/ide/src/host-adapter.types.ts
  - apps/web/src/layouts/Base.astro
- **Gate**: bun run validate
- **Status**: pending

### S3 — Fix untyped `request()` call in `DashboardService.getOverviewModel`
- **Files**: packages/client/src/lib/services/dashboard-service.ts
- **Gate**: bun run site:strict
- **Status**: pending

### S4 — Fix dashboard model re-exports in the client public barrel
- **Files**: packages/client/src/public/index.ts
- **Gate**: bun run validate
- **Status**: pending

### S5 — Align `sync-proposal-registry.ts` JSON indentation with Biome
- **Files**: plugins/proposals/src/lib/proposals/sync-proposal-registry.ts
- **Gate**: bun run validate
- **Status**: pending

### S6 — Add missing `LICENSE` to `plugins/audit`
- **Files**:
  - plugins/audit/LICENSE
  - plugins/audit/package.json
- **Gate**: bun run validate
- **Status**: pending

## Acceptance

- `bun run validate` es completamente verde (código de salida 0).
- `bun run site:strict` construye sin errores y Pagefind indexa solo el contenido marcado con `data-pagefind-body`.
- Todos los slices `S2`–`S6` están implementados y verificados antes de cerrar la auditoría.
- El informe cumple con `docs/scaffolds/ARCHITECTURE-AUDITS.md` y pasa `bun run lint:proposals` y `bun run lint:scaffolds`.

## Verified State

| Aspect | Metric / Command | Result / Count |
|---|---|---|
| Audited HEAD (inicio → fin de sesión) | `git rev-parse HEAD` | `9085364e14641402f7bb4ba3dcd21d04569d9511` → `efca64a9c585a48cabbfac56c378a93c3dc5c7dc` (avance concurrente de otro agente) |
| LOC TypeScript | `find . -name '*.ts' -o -name '*.tsx' \| grep -v node_modules \| grep -v /dist/ \| xargs wc -l` | 66,635 líneas |
| Archivos de test | `find . -name '*.spec.ts' -not -path '*/node_modules/*' -not -path '*/dist/*' \| wc -l` | 144 archivos |
| Plugins cargados | `ls plugins` | 13 (`audit`, `deps`, `docs`, `git`, `logs`, `memory`, `notification`, `proposals`, `quality`, `rules`, `search`, `status-marker`, `test-convention`) |
| Apps | `ls apps` | 3 (`ide` — nuevo, en curso vía `f00022`; `vscode`; `web`) |
| `bun run validate` — estado inicial (antes de S2–S5) | `tsc --noEmit -p tsconfig.json` | **FAIL** — 3 × `TS2339` en `apps/ide/tests/host-adapter.types.spec.ts` (`.visible` no existe en `IStatusBarItem`) |
| `bun run site:strict` — estado inicial | `bun scripts/build.ts` | **FAIL** — `packages/client` no compila: 12 errores de tipos en `dashboard-service.ts` (`TS18046`/`TS7006`) |
| `bun run validate` — estado final (tras S2–S6) | `bun run typecheck && bun run lint && bun run lint:scss && bun run test` | **PASS** — 137 archivos de test, 990 tests pasados, 10 skipped, 0 fallados |
| `bun run site:strict` — estado final | `bun scripts/build.ts && astro build && pagefind` | **PASS** — 338 páginas construidas; Pagefind indexa 338 páginas vía `data-pagefind-body` (antes: 500 páginas, sin tag, con ruido de nav/footer) |
| Biome lint | `biome ci` | 0 errores, 6 infos (no bloqueantes) tras S2–S6 |
| Scaffolds lint | `bun run lint:scaffolds` | ✓ scaffolds complete |
| Catchalls residuales | `grep -rc 'catchall(z.unknown())' packages/core/src plugins/*/src` | 6 (sin cambio; cubiertos por `l00008`/`r00002`) |
| I/O síncrono en `notification/watcher.ts` | `grep -c 'existsSync\|readdirSync\|readFileSync' plugins/notification/src/lib/watcher.ts` | 11 (sin cambio; cubierto por `f00019`) |
| I/O síncrono en `rules/frameworks/manifest.ts` | `grep -c 'writeFileSync\|readFileSync' plugins/rules/src/lib/frameworks/manifest.ts` | 3 (sin cambio; cubierto por `l00008`) |
| Race condition `sync-proposal-registry.ts:331` | `grep -n 'await writeFile(sourcePath' plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` | presente, sin `writeFileAtomic` (sin cambio; cubierto por `f00020`) |

## Findings

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H1 | P0 | `IStatusBarItem` no declaraba `visible`, pero la fake/spec sí lo usaban — rompía `tsc --noEmit -p tsconfig.json` (y por tanto `bun run validate` completo, ya que el script encadena `typecheck && lint && ...`). Reproducible con caché de TS limpia. | [host-adapter.types.ts](file:///home/cartago/_projects/mcp-vertex/apps/ide/src/host-adapter.types.ts) | Resolved in slice `S2` |
| H2 | P0 | `DashboardService.getOverviewModel()` llamaba a `client.request(...)` sin generics explícitos → `TOut` inferido como `unknown` → 12 errores de tipos al compilar `packages/client` con `scripts/build.ts`. Rompía `bun run site:strict` (el paquete publicable no construía). | [dashboard-service.ts](file:///home/cartago/_projects/mcp-vertex/packages/client/src/lib/services/dashboard-service.ts) | Resolved in slice `S3` |
| H3 | P0 | `packages/client/src/public/index.ts` reexportaba 10 tipos de modelo del dashboard desde el módulo equivocado (`dashboard-service.ts` en vez de `dashboard.types.ts`), produciendo `TS2459` y rompiendo el barrel público. | [index.ts](file:///home/cartago/_projects/mcp-vertex/packages/client/src/public/index.ts) | Resolved in slice `S4` |
| H4 | P1 | `Base.astro` seguía sin `data-pagefind-body` (hallazgo `H3` de `a00021`, asignado a un slice que nunca se ejecutó); Pagefind indexaba 500 páginas con ruido de navegación en vez de 338 páginas de contenido. | [Base.astro](file:///home/cartago/_projects/mcp-vertex/apps/web/src/layouts/Base.astro) | Resolved in slice `S2` |
| H5 | P1 | `sync-proposal-registry.ts` escribe `docs/proposals/index.json` (archivo trackeado, linteado por Biome) con indentación de tabulador, pero `biome.json` exige 4 espacios — cada regeneración automática deja `bun run lint` rojo hasta reformatear a mano. Confirmado reproducible 2 veces durante esta sesión por escrituras concurrentes de otro agente. | [sync-proposal-registry.ts:564](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts) | Resolved in slice `S5` |
| H6 | P3 | `plugins/audit/package.json#files` omite `LICENSE` (y el archivo ni siquiera existe en el directorio), a diferencia de los otros 12 plugins publicables. Hallazgo `H6` de `a00024`, seguía abierto. | [package.json](file:///home/cartago/_projects/mcp-vertex/plugins/audit/package.json) | Resolved in slice `S6` |
| H7 | P1 | Race condition: `writeFile` sin `writeFileAtomic` antes del `rename` a `historical/` en `sync-proposal-registry.ts:331`. Ventana de inconsistencia ante un `kill -9`. | [sync-proposal-registry.ts:331](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts) | Deferred to Proposal `f00020` (ya existente, `status: ready`) |
| H8 | P1 | I/O síncrono (`existsSync`/`readdirSync`/`readFileSync`) en `notification/watcher.ts` dentro de un `setInterval`, bloqueando el event loop. | [watcher.ts](file:///home/cartago/_projects/mcp-vertex/plugins/notification/src/lib/watcher.ts) | Deferred to Proposal `f00019` (ya existente, `status: ready`) |
| H9 | P2 | I/O síncrono (`writeFileSync`/`readFileSync`) en `rules/frameworks/manifest.ts` y 6 `outputSchema` catchall residuales en `bootstrap-tool.ts`/`scaffold-tool.ts`/`rules-tools.ts`/`adopt.tool.ts`. | [manifest.ts](file:///home/cartago/_projects/mcp-vertex/plugins/rules/src/lib/frameworks/manifest.ts) | Deferred to Proposal `l00008` (ya existente, `status: ready`) |
| H10 | P3 | Evidencia operativa en vivo: conflicto de merge sin resolver (`deleted by us`) en `apps/web/src/data/skills.json` detectado en el working tree durante la auditoría, causado por edición concurrente de otro agente. No es un defecto de diseño, pero confirma que el patrón multiagente necesita disciplina explícita de resolución de conflictos. | `apps/web/src/data/skills.json` | Documentado — no requiere acción (resuelto manualmente al detectarlo; sin slice propio) |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Arquitectura core | 9.4 | Núcleo agnóstico, primitivas durables bien factorizadas y consistentemente usadas. |
| Cliente (`packages/client`) | 7.5 | Diseño de `DashboardService`/`OverviewService` correcto, pero el HEAD auditado tenía el build roto por 2 bugs de tipos genuinos (ya corregidos). |
| Plugins | 8.7 | 13 plugins sanos en general; 3 hallazgos de I/O/race ya rastreados (`f00020`/`f00019`/`l00008`) siguen sin cerrar tras 2 auditorías previas. |
| Apps (web + ide + vscode) | 8.3 | Web con i18n impecable; `apps/ide` (en curso) tenía un contrato de tipos roto que bloqueaba el gate global; Pagefind ya corregido. |
| Higiene transversal / gate de validación | 8.0 | El estado *en vivo* auditado no estaba verde (typecheck + build rotos); tras las correcciones, `bun run validate` y `bun run site:strict` son 100% verdes. |
| Disciplina multiagente | 8.4 | Loop-detector funcionando en producción; pero se observó drift de formato recurrente en un archivo generado y un conflicto de merge sin resolver durante la sesión. |
| **Total (Average)** | **8.5** | **Base sólida; el principal riesgo no es de diseño sino de "gate verde" momentáneo durante trabajo concurrente — mitigado en esta auditoría, pero recurrente mientras `f00020`/`f00019`/`l00008` sigan abiertas.** |

## Notes

- Esta auditoría es independiente de `a00021` (Antigravity/Gemini 3.5 Flash), `a00026` (Copilot MiniMax-M3) y `a00024` (Copilot GPT-5.4), todas fechadas 2026-06-21. No reescribe ninguna; valida el estado *actual* del código y confirma que `f00020`, `f00019` y `l00008` —ya creadas por auditorías anteriores— siguen abiertas y cubren correctamente los hallazgos de I/O síncrono y race conditions sin necesidad de nuevas propuestas duplicadas.
- El hallazgo de soft-loop de `a00021` (`H4`, antes asignado a una hipotética `f120`) está **confirmado resuelto** en producción (`agent-loop-detector.ts` + `loop-detector-service.ts`, wiring en `plugins/proposals/src/index.ts:108`, disparado en vivo durante `bun run test`).
- El repositorio avanzó de HEAD `9085364` a `efca64a` durante esta sesión por commits de otro agente trabajando en paralelo sobre `packages/client/src/lib/services/dashboard-service.ts`, `dashboard.types.ts` y `embed-service.ts` — los mismos archivos que esta auditoría necesitaba corregir. Las correcciones de `S3`/`S4` se reaplicaron y verificaron contra el HEAD final.
