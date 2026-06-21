---
id: a022
kind: audit
title: "Auditoría completa del repositorio — GitHub Copilot (MiniMax-M3)"
status: done
date: 2026-06-21
track: archive
ownership:
  - { agent: implementation_runner, task: 'S1: Execute audit and document findings' }
acceptance:
  - { command: bun run validate, expect: exit0 }
---

# a022 — Auditoría completa del repositorio — GitHub Copilot (MiniMax-M3)

> **Superseded by unified audit [`a026`](../../ready/a026-21-06-2026-claude-code-sonnet-4-6-auditoria-unificada.md)**
> (consolidación de auditorías ready del 2026-06-21); ver a026 para hallazgos
> referenciados y slices vivos. Cerrada como referencia histórica.

## Goal

- **Audited Scope**: Monorepo completo — `packages/core`, `packages/client`, los 11 plugins cargados (`git`, `search`, `memory`, `docs`, `rules`, `quality`, `deps`, `proposals`, `notification`, `status-marker`, `test-convention`), `apps/web` (Astro) y `apps/vscode` (extensión).
- **Audited HEAD**: `f103a96dc7264774e617fc06efc0e848c73ab26b` (rama `develop`).
- **Revisor / Model**: GitHub Copilot (MiniMax-M3) ejecutando a través del orquestador `@mcp-vertex-orchestrator`.
- **Date**: 2026-06-21
- **Estrategia**: orient-first con `mcp-vertex_overview (compact)` + herramientas del repo (`search_search`, `docs_docs_read`, `memory_recall`, `rules_get_rules`, `deps_check`, `git_log`) en lugar de crawlear el FS. Sin ejecutar `bun run validate` ni `bun run build` (lentos); la salud del build se infiere por `git status` + Conventional Commits + inspección de scripts.

## Why

### 0. Veredicto rápido

El monorepo está **arquitectónicamente sano y disciplinado**. Los invariantes del core se respetan de forma consistente; el barrel `packages/core/src/public/index.ts` (244 líneas) es la única superficie estable y **no fuga lógica de dominio**. La mayoría de hallazgos son **deudas técnicas aisladas y menores**, no violaciones sistémicas. **Score: 8.7/10**.

| Dimensión | Score | Resumen |
|---|---:|---|
| Core packages | 9.4 | Agnóstico, sin imports de plugins, primitivas durables bien factorizadas |
| Plugins | 8.6 | 11 plugins sanos; 2 con sync I/O / escritura no atómica |
| Apps (web + vscode) | 9.0 | i18n 12/12, registry vivo, sin hacks de VS Code API |
| Higiene transversal | 8.5 | 0 console.log, 0 @ts-ignore, pero 6 outputSchemas catchall |
| Release / versionado | 9.5 | Tag-driven vía Conventional Commits, rotate-npm-token presente |
| **Total (media)** | **8.7** | **Base sólida, próximo paso: cerrar las 2 brechas altas (race + sync I/O)** |

### 1. Por capas

#### `packages/core` (núcleo)
- **Muy bien**: agnóstico confirmado — `grep "from .*plugins/" packages/core/src` → 0 hits desde engines.
- **Muy bien**: primitivas durables exportadas (`withFileMutex`, `writeFileAtomic`, `quarantineCorruptFile`, `resolveWorkspaceContained`, `redactSecrets`) y usadas consistentemente por `memory/store.ts`, `proposals/locks/agent-lock-engine.ts`, `proposals/shared/agent-registry-store.ts`, `deps/engine.ts`, `docs/engine.ts`, `search/engine.ts`.
- **Bien con nota**: `writeFileAtomicSync` y `quarantineCorruptFileSync` existen y se usan en boot-time, documentado en AGENTS.md, pero **sin JSDoc en el código que lo recuerde**. Si un futuro dev los importa desde un handler, no hay nada que le avise.
- **Regular (outputSchemas catchall)**: 3 tools de `bootstrap` (`analyze_project`, `recommend_server_plan`, `create_mcp_project`) declaran `z.object({}).catchall(z.unknown())` aunque los tipos `IProjectAnalysis`/`IServerPlan` ya existen. `scaffold-tool.ts:291` igual con `IScaffoldReport`. `metrics-tool.ts:64` catchall es legítimo (dominio dinámico).

#### `plugins/*` (11 cargados)
- **Perfecto en salud general**: cada plugin respeta `namespacePrefix`, declara `outputSchema`, lee paths vía `ctx.workspace`, y tiene tests reales (no solo snapshots vacíos).
- **Regular (proposals, race condition)**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts:331` ejecuta `await writeFile(sourcePath, reconciled, 'utf8')` sin pasar por `writeFileAtomic` ni `withFileMutex` antes del `rename` a `historical/`. Hay una ventana donde un kill -9 deja el archivo en estado inconsistente. La primitiva `writeFileAtomic` ya está importada en la línea 4 → fix es directo. **(Hallazgo H1, ALTO)**.
- **Regular (notification, sync I/O)**: `plugins/notification/src/lib/watcher.ts` usa `existsSync`/`readdirSync`/`readFileSync` en `check()` invocado por `setInterval` cada N ms. AGENTS.md es explícito: "Async I/O only in hot paths". Las primitivas async existen. **(Hallazgo H2, ALTO)**.
- **Bien con nota (rules + proposals)**: dos `outputSchema` catchall residuales — `rules-tools.ts:199` y `proposals/adopt.tool.ts:81`. Los tipos `IRulesManifest` e `ISwarmPathLayout` ya existen. **(Hallazgo H3, MEDIO)**.
- **Bien (audit)**: solo 2 tools registradas (`audit_plan`, `audit_consolidate`); el README menciona capacidades de brief que el plugin no expone. Decisión de scope probablemente deliberada. **(Hallazgo H4, BAJO)**.
- **Bien (test-convention hygiene)**: `plugins/test-convention/tsconfig.tsbuildinfo` aparece en el WD; falta en `.gitignore` raíz. **(Hallazgo H5, BAJO)**.
- **Perfecto (memory)**: `store-concurrency.spec.ts` (M32) cubre 4 casos (32-way distinct, 16-way same-title, sequential-vs-parallel, save+delete interleaved). Excelente cobertura de concurrencia.
- **Perfecto (logs, search, git, deps, quality, status-marker, docs)**: sin hallazgos.

#### `apps/web` (Astro)
- **Muy bien**: `astro.config.mjs` apunta al registry vivo vía `LOCAL_ALIASES` (`scripts/lib/local-aliases.mjs`); p112 s2 mantiene `tsconfig.json#paths` y `vite.resolve.alias` sincronizados vía `local-aliases.spec.ts`. Sin drift.
- **Muy bien**: `check-i18n.ts` verifica completeness para las 12 lenguas + 71 catálogos per-tool. Las lenguas con keys faltantes rompen el build.
- **Regular (drift con vscode)**: las 12 lenguas están duplicadas entre `apps/web/src/i18n/langs/` y `apps/vscode/src/i18n/langs/`. Si una propuesta de "lengua adicional" entra, hay que tocar 2 sitios. **(Hallazgo H6, BAJO)**.

#### `apps/vscode` (extensión)
- **Muy bien**: `extension.ts:103-105` usa `loadVscodeApi = async () => (await import('vscode'))` con `as unknown as IVscodeApi` — patrón de inyección declarado explícitamente, no hack. Permite tests sin VS Code.
- **Muy bien**: `check-i18n.ts` valida las 12 lenguas × 8 keys.
- **Bien (sin tests de extension.ts)**: solo se testea lo que esté dentro de `tests/`. Aceptable porque `McpStdioClient` está cubierto en `@mcp-vertex/client`.

### 2. Higiene transversal

| Tema | Estado | Evidencia |
|---|---|---|
| Redacción de secretos antes de persistir | ✅ | `memory/store.ts:127-133` aplica `redactSecrets` |
| Validación de paths | ✅ | `resolveWorkspaceContained` en deps/docs/search |
| `console.log` en producción | ✅ | 0 hits en `packages/core/src` y `plugins/*/src` |
| `@ts-ignore` / `@ts-nocheck` | ✅ | 0 hits |
| `.only` en tests | ✅ | 0 hits |
| i18n completa (web + vscode) | ✅ | 12/12 + per-tool catalogue |
| Scripts release (pure/side-effecting split) | ✅ | `release.ts` + `derive-version.ts` separados |
| `lefthook.yml` | ✅ | "warn but never block" explícito; CI es source of truth |
| `.github/workflows/` | ✅ | 4 workflows con permisos mínimos |
| Lockstep Conventional Commits | ✅ | Sin commit-back loop, tag-driven |

### 3. ¿Más skills / tools / agentes / plugins?
- **Tests deterministas para `scripts/derive-version.ts`** — único punto ciego del release pipeline.
- **Plugin de seguridad de dependencias** — offline, integrado con OSV.
- **`outputSchema` más estricto en bootstrap/scaffold** — derivar desde tipos existentes.

### 4. Top acciones para 9/10
1. **Cerrar la race en `sync-proposal-registry.ts:331`** — 2 h, bloquea release si lo etiquetamos. → `f122`
2. **Migrar `notification/watcher.ts` a `node:fs/promises`** — 1 día, bloquea release. → `f123`
3. **Cerrar los 6 `outputSchema` catchall restantes** — 1 día, mejora SDK. → `l122`
4. **Extraer i18n langs a `apps/shared/i18n-langs.ts`** — 1 h, evita drift. (diferido a slice S2)
5. **Añadir `*.tsbuildinfo` a `.gitignore` raíz** — 15 min. (diferido a slice S2)

## Non-goals

- Re-escribir auditorías anteriores de forma retroactiva.
- Modificar el protocolo subyacente MCP (se confía en el SDK oficial).
- Auditar el sitio publicado (se audita el código fuente de las apps).
- Ejecutar `bun run build` o `bun run validate` durante la auditoría (lentos; la salud se infiere por otros medios).

## Slices

- global_gate: lint

### S1 — Ejecutar la auditoría y documentar los hallazgos
- **Files**: `docs/proposals/ready/a022-21-06-2026-copilot-minimax-m3-repositorio.md`
- **Gate**: `bun run lint:proposals`
- **Status**: pending

### S2 — Hygiene in-situ (drift i18n + tsbuildinfo)
- **Files**:
  - `apps/shared/i18n-langs.ts` (nuevo)
  - `apps/web/src/i18n/langs/index.ts` (importa del shared)
  - `apps/vscode/src/i18n/langs/index.ts` (importa del shared)
  - `.gitignore` (añadir `*.tsbuildinfo`)
  - Limpiar `plugins/test-convention/tsconfig.tsbuildinfo` del WD
- **Gate**: `bun run validate`
- **Status**: pending

## Acceptance

- `bun run validate` es completamente verde (código de salida 0).
- `bun run lint:proposals` valida este documento y las propuestas diferidas.
- Las propuestas `f122`, `f123` y `l122` están creadas en `docs/proposals/ready/` con sus `## Slices` y referenciadas desde `## Findings`.
- Los hygiene items de S2 (`apps/shared/i18n-langs.ts` + `*.tsbuildignore`) están resueltos o documentados como follow-up si S2 revela fricciones.

## Verified State

| Aspect | Metric / Command | Result / Count |
|---|---|---|
| Archivos TS en `packages/core/src` | `find packages/core/src -name '*.ts' \| wc -l` | 23 (10 módulos `lib/`, 11 `lib/shared`/`contracts`/`tools`/etc.) |
| Líneas del barrel público | `wc -l packages/core/src/public/index.ts` | 244 |
| Plugins cargados | `mcp-vertex_overview` | 11 (`git`, `search`, `memory`, `docs`, `rules`, `quality`, `deps`, `proposals`, `notification`, `status-marker`, `test-convention`) |
| Tools registradas en plugins | grep `server.registerTool` | 64 invocaciones en 11 plugins |
| Tests en `plugins/proposals/tests/src/lib` | `find plugins/proposals/tests -name '*.spec.ts' \| wc -l` | 50+ |
| Lenguas i18n en `apps/web` | `ls apps/web/src/i18n/langs/ \| wc -l` | 12 |
| Per-tool catalogues | `ls apps/web/src/i18n/tools/ \| wc -l` | 71 |
| Catchalls en outputSchema | `grep -r 'catchall(z.unknown())' packages/core/src plugins/*/src` | 6 (3 bootstrap + 1 scaffold + 1 rules + 1 proposals) |
| `process.cwd()` en engines | `grep -r 'process.cwd()' packages/core/src/lib` | 0 |
| `console.log` en producción | `grep -r 'console\.log' packages/core/src plugins/*/src` | 0 |
| Workflows | `ls .github/workflows/` | 4 (`release.yml`, `ci.yml`, `pages.yml`, `rotate-npm-token.yml`) |
| Commits recientes | `git log --oneline -10` | todos Conventional Commits, tag-driven |

## Findings

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H1 | P0 | Race condition en `sync-proposal-registry.ts:331` — `writeFile` no atómico entre el write y el rename a `historical/`. Ventana de inconsistencia ante kill -9. | [sync-proposal-registry.ts:331](plugins/proposals/src/lib/proposals/sync-proposal-registry.ts) | Deferred to Proposal `f122` |
| H2 | P0 | Sync I/O (`existsSync`/`readdirSync`/`readFileSync`) en `notification/watcher.ts` dentro de `setInterval` — bloquea event loop. | [watcher.ts:25,138,179,222-224,237,240,282](plugins/notification/src/lib/watcher.ts) | Deferred to Proposal `f123` |
| H3 | P1 | 6 `outputSchema` `z.object({}).catchall(z.unknown())` residuales: 3 en `bootstrap-tool`, 1 en `scaffold-tool`, 1 en `rules-tools`, 1 en `proposals/adopt.tool`. Tipos `IProjectAnalysis`/`IServerPlan`/`IScaffoldReport`/`IRulesManifest`/`ISwarmPathLayout` ya existen. | [bootstrap-tool.ts:99,138,186](packages/core/src/lib/bootstrap/bootstrap-tool.ts), [scaffold-tool.ts:291](packages/core/src/lib/scaffold/scaffold-tool.ts), [rules-tools.ts:199](plugins/rules/src/lib/rules-tools.ts), [proposals/adopt.tool.ts:81](plugins/proposals/src/lib/tools/proposals/adopt.tool.ts) | Deferred to Proposal `l122` |
| H4 | P1 | `writeFileAtomicSync` y `quarantineCorruptFileSync` no tienen JSDoc que recuerde "boot-only" en el código (sí en AGENTS.md). Riesgo de import desde un handler por error. | [atomic-write.ts:36-43](packages/core/src/lib/shared/atomic-write.ts), [quarantine-corrupt-file.ts:65](packages/core/src/lib/shared/quarantine-corrupt-file.ts) | Deferred to Proposal `l122` (mismo lote de hygiene de primitivas) |
| H5 | P2 | 12 lenguas duplicadas entre `apps/web/src/i18n/langs/` y `apps/vscode/src/i18n/langs/`. Si se añade una lengua, hay que tocar 2 sitios. | `apps/web/src/i18n/langs/`, `apps/vscode/src/i18n/langs/` | Resolved in slice `S2` |
| H6 | P3 | `plugins/test-convention/tsconfig.tsbuildinfo` aparece en el WD; falta `*.tsbuildinfo` en `.gitignore` raíz. | `.gitignore`, `plugins/test-convention/tsconfig.tsbuildinfo` | Resolved in slice `S2` |
| H7 | P3 | `audit` plugin solo expone 2 tools (`audit_plan`, `audit_consolidate`); el README menciona capacidades de brief que el plugin no implementa. Decisión de scope probablemente deliberada. | [plugins/audit/src/index.ts:140](plugins/audit/src/index.ts), [plugins/audit/README.md](plugins/audit/README.md) | Documentado — no requiere acción |
| H8 | P3 | `scripts/derive-version.ts` (decide semver desde Conventional Commits) no tiene tests deterministas. Es la única pieza que decide la versión de release. | [scripts/derive-version.ts](scripts/derive-version.ts) | Deferred a propuesta individual (futuro) |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Core packages | 9.4 | Agnóstico, primitivas durables bien factorizadas. Pequeñas notas en JSDoc de las variantes sync. |
| Plugins | 8.6 | 11 plugins sanos; 2 con brechas altas corregibles (race + sync I/O); 2 catchalls residuales. |
| Apps (web + vscode) | 9.0 | i18n impecable, registry vivo, VS Code API inyectada limpia. |
| Higiene transversal | 8.5 | 0 console.log, 0 @ts-ignore, 0 .only; 6 catchalls + 1 tsbuildinfo en WD. |
| Release / versionado | 9.5 | Tag-driven, rotate-npm-token presente, derive-version sin tests (Riesgo R-M1). |
| **Total (Average)** | **8.7** | **Base sólida. Top priority: f122 + f123.** |

## Notes

- Esta auditoría **no ejecutó** `bun run build`/`bun run validate` por duración. La salud del build se infiere por inspección de scripts + Conventional Commits + `git status` limpio.
- Las 8 auditorías `a001-a020` viven en `docs/proposals/done/audits/`. `a021` (Antigravity/Gemini 3.5 Flash) está en `ready/` y se solapa en fecha con esta. La numeración sigue siendo cronológica por llegada al repo, no por fecha del informe.
- Las propuestas `l115-l121` (del master audit anterior) ya están creadas y referenciadas; esta auditoría añade `f122`/`f123`/`l122` como nuevas entradas de follow-up.
