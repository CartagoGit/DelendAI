# Auditoría unificada de `@cartago-git/mcp-core` — síntesis de 4 revisiones

> **Fecha:** 15-06-2026. Consolida y contrasta 4 auditorías independientes:
> Antigravity (Claude Sonnet 4.6 Thinking), Antigravity (Gemini 3.5 Flash),
> Codex (GPT-5.5) y Claude Code (Opus 4.8). Las 4 originales se archivan en
> `docs/proposals/done/`. Este documento es la **propuesta de auditoría completa**
> para dejar el proyecto en 11/10.
>
> **ESTADO DE EJECUCIÓN (2026-06-15, sesión autónoma):** ✅ hechos y verdes —
> F1, **F2**, **F3**, **F4**, M1, F5, M2, M3, #10 (create_proposal/close_slice/
> proposal_board + knowledge multi-agent + prompt orchestrate), R1, **R2**, M6, R5,
> R6, R7, R8, R9, R10, **M10**, tokens (overview compact/tag), rules-laravel
> (linter agnóstico).
> ⏸️ pendientes — Tier3/plataforma,
> npm publish. **R14, M7, M4, M5, M8, M9, R12 y R13 también HECHOS** (sesión
> Opus; M6 ya estaba). Detalle en
> `docs/proposals/done/RESUMEN-SESION-AUTONOMA-2026-06-15.md`. **mcp-core 314 tests
> (304+10 skip), verdes.**
>
> **⚠️ CORRECCIÓN DE PREMISA (2026-06-15, sesión Opus):** el "invariante crítico"
> de re-validar Affairs tras tocar engines **está obsoleto**. Verificado: Affairs
> (`/home/cartago/_proyectos/propios/affairs`) **NO importa nada de mcp-core**
> (ni `@cartago-git`, ni alias de vitest, ni paths de tsconfig). Son proyectos
> independientes; mcp-core fue extraído pero Affairs conserva su propia copia.
> Cambios en mcp-core no pueden afectar a Affairs. Sus ~14 tests rojos actuales
> son pre-existentes y ajenos (snapshots, skills docs, baseline MiniMax M3).
>
> ---
>
> ### 🔖 PUNTO DE CONTINUACIÓN (act. 2026-06-15, sesión Opus desde oficina)
>
> **➡️ La cola viva de trabajo ahora está en la [§0 SEGUNDA RONDA](#0-segunda-ronda-de-auditoría-post-p0p1--camino-real-al-1110)** (hallazgos N1–N23 de las 2 auditorías nuevas del estado actual). Lo de abajo es el historial de lo ya cerrado.
>
> **Toda la capa P0 FATAL está cerrada y verde** (F1–F5). Además **M10, R2, R14,
> M7, M4, M5, M8, M9, R12 y R13 cerrados con tests** en esta sesión (336 verdes;
> M6 ya estaba). **Cerrados: todos los FATAL, todos los MUY MAL (M1–M10) y los
> REGULAR accionables (R1·R2·R5–R10·R12·R13·R14).** De la cola original solo
> quedan **Tier3/plataforma** (outputSchema, plugins nuevos, CI, observabilidad)
> y **npm publish** (lo ejecuta el usuario). Abiertos por diseño/menor: R3
> (doctor re-lee config), R4 (sync/async I/O), R11 (auto_work progreso), R15
> (round-context 875 líneas).
>
> **M10 (corrupto ≠ vacío) — HECHO con tests (sesión Opus):**
> - Helper compartido `quarantineCorruptFile`/`quarantineCorruptFileSync` +
>   clase `CorruptFileError` en `@cartago-git/mcp-core/public`
>   ([packages/core/src/lib/shared/quarantine-corrupt-file.ts](../../../packages/core/src/lib/shared/quarantine-corrupt-file.ts)),
>   con sufijo `.corrupt-<ts>-<rand>` anti-colisión.
> - **Estado crítico** (queue `parseQueue`/`loadOrEmptyQueue`, `subagent-registry-store.read`,
>   `memory` store): JSON corrupto → preserva bytes + lanza error; la **capa de tool**
>   lo traduce a error estructurado nombrando el backup (`runTaskQueueMcp`,
>   `runAgentNames`, los 4 handlers de `memory`). Validaciones de negocio (dup id,
>   waitFor, etc.) NO renombran: el fichero queda intacto.
> - **closed-tasks-log** (diagnóstico): preserva + warning a stderr + continúa con
>   `[]` (no bloquea coordinación). Decisión confirmada por el usuario.
> - Specs: `quarantine-corrupt-file.spec.ts` (core), `task-queue-engine.corrupt.spec.ts`,
>   `persistent-task-queue.spec.ts` (parseQueue), `agent-names.spec.ts` (registry),
>   `memory.spec.ts` (store + capa de tool), `closed-tasks-log.spec.ts`.
>
> **NOTA Affairs:** ignorar el viejo "re-validar 1184" — Affairs no consume mcp-core
> (ver corrección de premisa arriba).
>
> **M4 + M5 (agnosticismo de tracks y carpetas) — HECHO (sesión Opus):**
> - **M4**: `IProposalTrack` dejó de ser un union cerrado con vocabulario del
>   host (`ui-demo`/`game-demo`/`scaffold`…) y es ahora `string`. La validación
>   de tracks (`KNOWN_TRACKS`/`isKnownTrack` hardcoded) se sustituyó por un
>   `knownTracks?: ReadonlySet<string>` opcional en
>   `extractParallelismFromFrontmatter`: sin él, agnóstico (cualquier string no
>   vacío); con él, typo-guard. `evaluateParallelism` recibe `auditLanes`
>   configurable (default `['audit']`).
> - **M5**: la carpeta `paused/demos` (host policy) ya no está hardcoded.
>   `syncProposalRegistry`, `scanLiveProposalEntries` y
>   `collectRoundContextSnapshot` aceptan `extraFolders` (rutas relativas a
>   `proposalsDir`); el plugin las lee de `ctx.options['proposalFolders']` y las
>   pasa a sync-proposals/authoring/round-context. Las subtrees genéricas del
>   modelo de propuestas (audits/fixes/historical/paused/revised) se mantienen.
> - Specs: `extract-parallelism-from-frontmatter` (modo agnóstico + typo-guard),
>   `proposal-folders-injection`. 322 verdes.
>
> **M7 (schema de lock único) — HECHO (sesión Opus):** el lector
> `persistent-task-queue` aceptaba DOS formatos (`files`/`claimed_at` viejo y
> `ownership`/`started_at` canónico) vía un `.transform()` de Zod. Ahora
> `ILockEntry` y `LockEntrySchema` usan SOLO el formato canónico que escribe
> `<prefix>_agent_lock` (agent-lock-engine): `{ task_id, agent, ownership[],
> started_at, last_seen? }`. Consumidores `promote`/`reportBackpressure`
> migrados de `.files`→`.ownership`; `zombie-reconcile.loadLockSnapshotLocal`
> dejó de aceptar el campo `claimed_at` del disco (lee `started_at ?? last_seen`).
> Specs: `loadLockSnapshot` canónico + rechazo del formato viejo. 316 verdes.
>
> **R14 (rename subagent-* → agent-*) — HECHO (sesión Opus):** identificadores de
> código del subsistema de registry renombrados (`ISubagent*`→`IAgent*`,
> `SUBAGENT_*`→`AGENT_*`, `createSubagentRegistryStore`→`createAgentRegistryStore`,
> `buildSubagentTree`→`buildAgentTree`, `readSubagentSummary`→`readAgentSummary`,
> campos `activeSubagents`/`subagents`→`activeAgents`/`agents`, source-tag
> `subagent-tree`→`agent-tree`). Archivos renombrados con `git mv`:
> `shared/{agent-registry-store,agent-tree,agent-conventions}.ts`.
> **Preservado a propósito** (compat de schema en disco): el filename
> `subagent-registry.json` (en `registry_filename` y `agentRegistryFile` del
> layout) y la terminología conceptual "subagent"/"subagente" en descripciones
> de tool, prompts y comentarios. 314 tests verdes, typecheck limpio.
>
> **Lo que se hizo en F2/F3/F4 (para no re-derivarlo):**
> - **F2** — `syncProposalRegistry(root)` y `defaultVerifyPaths(root)` ya NO usan
>   `process.cwd()` (root requerido). Fallback de `resolveWorkspacePath` en
>   `agent-lock-engine` se dejó (nunca se dispara; todos los callers inyectan
>   `lockPath`).
> - **F3** — el plugin `proposals` deriva el layout de `ctx`:
>   `const layout = buildSwarmPaths(ctx.cacheDir, ctx.docsDir)` en
>   [plugins/proposals/src/index.ts](../../../plugins/proposals/src/index.ts).
>   Los 2 engines que horneaban `DEFAULT_PATH_LAYOUT` ahora aceptan `layout`
>   opcional (default = DEFAULT para back-compat de Affairs):
>   `syncProposalRegistry(root, layout?)` y
>   `collectRoundContextSnapshot(root, layout?)` (+ `buildOperationalSources`,
>   `scanLiveProposalEntries`). Tools que lo propagan: `sync_proposals`,
>   `round_context`, `authoring`. Spec: `tests/src/lib/swarm/layout-relocation.spec.ts`.
> - **F4** — nuevo helper `withFileMutex(targetPath, fn, opts?)` en
>   [packages/core/src/lib/shared/with-file-mutex.ts](../../../packages/core/src/lib/shared/with-file-mutex.ts)
>   (exportado en `@cartago-git/mcp-core/public`): sidecar `<target>.mutex` con
>   `open('wx')` (O_EXCL), robo por staleness y por timeout (anti-deadlock).
>   Envuelve el read-modify-write en: `agent-lock-engine` (extraído a
>   `executeLockAction`), `task-queue-engine` (acciones `enqueue`/`dequeue`; NO
>   `subscribe`/`report`, que son read-only), y `subagent-registry-store`
>   (upsert/remove/release/markAdopted) — este último además pasó de `writeFile`
>   a `writeFileAtomic`. Specs: `with-file-mutex.spec.ts` (core) y
>   `locks/concurrent-claims.spec.ts` (proposals).
>
> **Cómo continuar (orden sugerido, todo de bajo riesgo salvo donde se indica):**
> 1. ✅ **M10 (corrupto ≠ vacío)** — HECHO con tests (ver bloque de arriba).
> 2. ✅ **R2 (trivial)** — `coreToolRegistrations()` vacío eliminado de
>    `create-mcp-server.ts` y de `public/index.ts`.
> 3. ✅ **R14** (cosmético, amplio) — HECHO (ver bloque de arriba).
> 4. ✅ **M7** (unificar schema de lock) — HECHO (ver bloque de arriba).
> 5. **M4** (tracks configurables) + **M5** (carpetas `paused/demos` inyectables) —
>    vía `ctx.options` del plugin proposals; `scanLiveProposalEntries` ya quedó
>    listo para recibir carpetas extra.
> 6. **M8** (acceptance exec: `cwd`, parser argv que respete comillas/pipes,
>    matar descendientes con process groups) — en el runner de acceptance.
> 7. **R12** (IDs de tool por namespace en `planRegistrationOrder`), **R13**
>    (cerrar `exports ./lib/*` + semver).
> 8. **Tier3**: `outputSchema`/`structuredContent` en tools; plugins nuevos
>    `notification`/`search`/`docs`/`deps`; CI.
> 9. **npm publish** — LO ÚLTIMO, lo ejecuta el usuario con su cuenta siguiendo
>    `docs/NPM_PUBLISH.md` (ya actualizado a 290 tests).
>
> **Comandos de validación (siempre tras cada cambio en engines compartidos):**
> ```bash
> cd /home/cartago/_projects/mcp-core && bun run validate            # 290 verdes
> cd /home/cartago/_projects/games/onrop/affairs \
>   && bun run --cwd libs/mcp-server typecheck \
>   && bun run --cwd libs/mcp-server test                            # 1184 verdes
> ```
> **Invariante crítico:** NUNCA romper Affairs. Los engines son compartidos vía
> alias de vitest/paths de tsconfig; re-validar las 1184 tras tocar cualquier
> engine de `proposals`.

> **Nota de consenso: ~7,3/10** (Sonnet 8 · Gemini 7,9 · Opus 4.8 7,5 · Codex 6,8).
> Arquitectura excelente; el techo lo marca la **persistencia/concurrencia** del
> plugin `proposals` y residuos del host original.

---

## 0. SEGUNDA RONDA DE AUDITORÍA (post P0/P1) — camino real al 11/10

> **Fecha:** 15-06-2026 (tarde/noche). Dos auditorías **nuevas e independientes**
> del estado ACTUAL (tras cerrar F1–F5, M1–M10 y los REGULAR accionables):
> Antigravity·Sonnet 4.6 Thinking (**8,4/10**) y Antigravity·Gemini 3.5 Flash
> (**8,5/10**). Originales archivadas en `docs/proposals/done/…[estado-actual].md`.
> Consenso: la fiabilización P0/P1 fue un éxito; el techo ahora son **bugs de
> concurrencia/IO residuales + deuda de calidad de output (tokens) + capacidades
> de plataforma**. Esta sección es la **cola viva de trabajo** (sustituye al punto
> de continuación de arriba).

Leyenda: ✅ hecho · ⬜ pendiente. Severidad de las 2 auditorías nuevas.

### 🔴/🟠 P0–P1 — Correctitud y concurrencia (cerrar ANTES de publicar)

| # | Hallazgo (verificado en código) | Sev | Quién | Estado |
|---|---|---|---|---|
| N1 | **`memory` sin mutex**: `saveNote`/`removeNote` hacen read-modify-write sync sin `withFileMutex` → *lost update* con 2 agentes | MAL | S·G (2/2) | ✅ |
| N2 | **`syncProposalRegistry` sin mutex**: regenera `index.json` (read FS → writeFileAtomic) sin exclusión → sync concurrente pierde propuestas | FATAL(G) | G | ✅ |
| N3 | **`git` error silencioso** (`catch → ''`): git ausente/timeout = repo limpio falso → un agente podría cerrar propuesta con cambios sin commitear | REG/FATAL | S·G (2/2) | ✅ |
| N4 | **`git.ts` síncrono** (`execFileSync`, hasta 15s) bloquea el event loop del server MCP | MAL | S·G (2/2) | ✅ |
| N5 | **`search` engine síncrono** (`readdirSync`/`statSync`/`readFileSync`) bloquea el event loop en árboles grandes | REG | G | ✅ |
| N6 | **`resolveWorkspacePath` fallback `process.cwd()`** (líneas 33/40): rompe hermeticidad del sandbox (último rastro de cwd) | REG | G·O | ✅ |
| N7 | **`scaffold-host` genera `process.cwd()`** en el host boilerplate → bug latente en el código que generamos para terceros | MAL | S | ✅ |
| N8 | **`prepareServerBlueprintOnStart` síncrono** en el boot (`writeFileSync`) → server no responde hasta acabar análisis/IO | MAL | S | ✅ |
| N9 | **`auto_work`/`continue_proposal` no excluye `in_progress` con lock ajeno** → mini-bucle claim→conflict→auto_work→misma propuesta (= R11) | REG | S | ✅ |
| N10 | **`memory` quotas incompletas**: hay cap título(200)/body(8000) pero NO tags ni total de notas | REG menor | S | ✅ |

> **✅ Tanda P0/P1 (N1–N10) COMPLETADA (2026-06-15, sesión Opus autónoma)** — todo
> verde: mcp-core **354 tests** (344+10 skip). N1 (mutex memory + test concurrencia),
> N2 (mutex syncProposalRegistry), N3+N4 (git `IGitRunResult {ok,output,reason}` +
> `execFile` async + `checkRepo` distingue git-ausente/no-repo), N5 (search engine
> `fs/promises` async), N6 (borrado `resolve-workspace-path.ts`; `getLockPath` exige
> `lockPath` inyectado; eliminado `resolveDefaultDigestPath`), N7 (`buildHostConfig(workspaceRoot)`
> hermético + entry pasa cwd), N8 (`prepareServerBlueprintOnStart` async tras `start()`),
> N9 (excluye `in_progress` con lock activo; `kind:'all-claimed'` anti-bucle + 2 tests),
> N10 (cap por-tag 50 + total `MAX_NOTES=1000`).

### 🟡 P2 — Tokens y UX de agente

| # | Hallazgo | Quién | Estado |
|---|---|---|---|
| N11 | **Pretty-print `\t`** en payloads de salida de `agent_lock`/`task_queue` → desperdicio de tokens; respuestas compactadas (ficheros persistidos se dejan legibles a propósito) | S·G (2/2) | ✅ |
| N12 | **`overview` sin `compact:true`** | S | ✅ (ya existía: `compact`/`tag`) |
| N13 | **Sin `fields[]`/paginación** | S·G | ✅ (memory_list `limit`/`offset`; resto ya acotado) |

### 🟢 P3 — Capacidades que cambian de categoría / plataforma

| # | Capacidad | Quién | Estado |
|---|---|---|---|
| N14 | **Plugin `notification`** (MCP `notifications/message`): mata el polling de locks/cola en swarm (–40% llamadas estimado). *El de mayor impacto.* | S·G (2/2) | ✅ (`@cartago-git/mcp-notification`: watch del lock + `sendLoggingMessage` `lock-released`; fs.watch+poll; +tool `notify_status` + knowledge + 4 tests) |
| N15 | **`state_health` + `state_repair`** (dry-run/execute con backup): auto-heal de `waiterOrphans`, locks >TTL, assignments huérfanas | S·G (2/2) | ✅ (2 tools nuevas en proposals + specs; reusa gc/expireSweep/gcZombies) |
| N16 | **`outputSchema` Zod por tool** (structuredContent ya está; falta declarar el schema → validación/UMI en clientes) | S | ✅ **COMPLETO — ~32 tools** con red e2e real: core-meta (overview compact+full vía uniones, knowledge, validation_matrix), bootstrap (analyze/create_server/plan), scaffold, proposals×15 (preciso en sync_proposals/plan, permisivo `z.record` en los action-multiplexed), memory×4, search, git×4, quality×2, notification. El SDK valida `structuredContent` sólo en éxito (`isError` exento, `server/mcp.js:193`). **Red e2e ESTRICTA** `outputschema.e2e.spec.ts` (ensambla los 8 plugins, falla si cualquier tool read-only no devuelve structuredContent válido sobre el protocolo) — destapó y arregló 2 regresiones que los unit tests ocultaban: `z.record` no vale como outputSchema (→ `z.object({}).catchall`), y tools con content manual sin structuredContent (agent_lock/round_context/get_proposal_workflow/sync_proposals). Refinar los permisivos a uniones por-acción = limitado por el SDK (ver nota). **Precisos ya**: sync_proposals, plan, state_health, proposal_board, get_proposal_workflow, create_proposal, close_slice, compact_status; resto (action-multiplexed) permisivo `z.object().catchall` (el SDK exige ZodObject, no admite unión por-acción → bloqueado). La red e2e cubre read-only **y flujo de escritura** (create_proposal→close_slice). |
| N17 | **`compact_status`** (git+locks+queue+quality en 1 llamada con `fields`) | S | ✅ — `proposals_compact_status`: agrega el estado del PROPIO plugin (locks activos + backpressure de cola + propuestas por estado) en payload mínimo con `fields`. Decisión del usuario: proposals lo posee (core no conoce a los demás plugins). Spec + e2e |
| N18 | **Presets de scaffold `minimal`/`standard`/`swarm`** | S | ✅ — presets de **plugins** en el CLI (`--preset`, aditivos: minimal=git/search · standard=+memory/docs/rules/quality/deps · swarm=+proposals/notification), fusiona con `--plugins` (dedup). `resolvePreset`/`PLUGIN_PRESETS` puros + tests + smoke. Decisión: presets de plugins (no de agentes) por valor/agnosticismo. |
| N19 | **Plugins `docs` y `deps/security`** (autocontenidos, como `search`) | (orig.) | ✅ **HECHO** — `@cartago-git/mcp-docs` (9º: `docs_list`/`docs_read`, navegación curada, anti-traversal) y `@cartago-git/mcp-deps` (10º: `deps_list`/`deps_check`, inventario + salud offline — sin lockfile/rangos laxos/duplicados; SIN red/CVE a propósito). Ambos con outputSchema + red e2e. Security/CVE con red queda como herramienta externa dedicada. |
| N20 | **Refactor `round-context.ts`** (884 líneas → 3-4 módulos) (= R15) | S | 🟡 parcial — tipos+constantes extraídos a `round-context-types.ts` (884→~760), barrel `export *` (consumidores intactos). Falta separar funciones (digest/snapshot/store) que comparten helpers privados. |
| N21 | **Doctor: unificar doble lectura de config** (= R3) | S | ✅ (`assembleCliConfig` devuelve `configDiagnostic` de la única lectura) |
| N22 | **`git`/`search` async runner compartido**; **memoria semántica** (FTS) en `memory_recall` | S·G | ✅ — git/search ya async (2ª ronda). `memory_recall` ahora con **ranking de relevancia BM25-lite** (`rank.ts`, JS puro, título×2 + piso de substring; tags=filtro duro). Decisión: NO embeddings/SQLite (romperían agnóstico/offline; el vectorial real = herramienta externa). +6 tests. |
| N23 | **Excelencia demostrada**: tests de caos/adversarial, observabilidad `IStatusCollector` real + `--verbose`, **benchmarks de tokens** documentados, skills versionadas, semver real + publish automatizado, **SDK de tipos generados** de `outputSchema` | S (2/2 parcial) | 🟡 parcial — **e2e real cliente↔servidor MCP por InMemoryTransport** (`server-client.e2e.spec.ts` + red estricta `outputschema.e2e.spec.ts`) HECHO; destapó y arregló los doble-prefijos `memory_memory_*`→`memory_*` y `git_git_*`→`git_*`, y 2 regresiones de outputSchema (ver N16). **`--verbose` HECHO**. **Tests de caos/adversarial HECHOS** (`coordination-chaos.spec`: 40/20/30/25 ops concurrentes → sin lost-updates, exclusión mutua por fichero, nunca corrupto; memory adversarial: regex-special literal + unicode + query 50k). **`IStatusCollector` real HECHO** (meta-tool `status` agrega colectores; built-in `mcp-core`). **semver + publish automatizado HECHO** (`bun run release`: bump lockstep de los 10 paquetes + reescritura del `peerDependency ^x.y.z` del core en los 9 plugins + publish en orden; dry-run por defecto, `--write`/`--publish`; lógica de versionado pura y testeada en `scripts/release-plan.ts` + 9 tests). Resto (**SDK de tipos generados** de `outputSchema`, limitado por el constraint ZodObject del SDK) ⬜ |

### Orden de ejecución acordado (esta sesión, autónoma)
**Tanda P0/P1 (correctitud)** → N1, N2, N6 (concurrencia/hermeticidad) · N3+N4 (git async+estructurado) · N5 (search async) · N7 (scaffold cwd) · N8 (blueprint async) · N9 (auto_work exclusión) · N10 (quotas).
**Tanda P2 (tokens)** → N11 (compactar) · N12 (`overview compact`) · N13 (`fields`).
**Tanda P3 (plataforma)** → N15 (state_health/repair) · N16 (outputSchema) · N17 (compact_status) · N18 (presets) · N19 (docs/deps) · N14 (**notification**, requiere validar arquitectura de push con el usuario) · N20/N21/N22 · N23 (excelencia).
**Último:** npm publish (lo ejecuta el usuario, `docs/NPM_PUBLISH.md`).

> **Estimación de las auditorías:** prereqs N1–N10 → ~9,0; +notification/state_repair → ~9,5; +outputSchema/compact_status/presets → ~9,8; +caos/observabilidad/benchmarks → ~10,3; +docs-referencia/semver/publish → ~10,7; +SDK tipos generados → **11,0**.

---

## 1. Veredicto conjunto

Los 4 coinciden: **base arquitectónica de alta calidad** (núcleo puro + plugins
por CLI, contratos limpios, orientación low-token, funciones puras, 277 tests
verdes), pero **no cumple aún sus 3 promesas escritas**: rutas inyectadas,
operaciones idempotentes y coordinación sin carreras. El riesgo se concentra en
`proposals` (persistencia por ficheros sin atomicidad ni mutex) y en fugas de
`process.cwd()`. La prioridad **no** es añadir más tools/agentes, sino **hacer
fiable el estado**.

---

## 2. Hallazgos contrastados (consenso → severidad)

Leyenda revisores: S=Sonnet, G=Gemini, C=Codex, O=Opus. (n/4 = cuántos lo vieron)

### 🔴 FATAL — bloqueantes para swarm real

| # | Hallazgo | Quién | Fix |
|---|---|---|---|
| F1 | ✅ **HECHO** — Escrituras atómicas (`writeFileAtomic` temp-mismo-dir+rename) en lock/registry/queue/memory | S·G·C·O (4/4) | hecho |
| F2 | ✅ **HECHO** — `syncProposalRegistry(root)`/`defaultVerifyPaths(root)` sin `process.cwd()`; root requerido | S·G·C·O (4/4) | hecho (fallback de `resolveWorkspacePath` se deja: nunca se dispara) |
| F3 | ✅ **HECHO** — `proposals` deriva `layout = buildSwarmPaths(ctx.cacheDir, ctx.docsDir)`; engines aceptan `layout` opcional (default DEFAULT); spec `layout-relocation.spec.ts` | C·O (2/4) | hecho |
| F4 | ✅ **HECHO** — `withFileMutex` (O_EXCL + robo stale/timeout) envuelve read-modify-write de lock/queue(enqueue,dequeue)/registry; specs `with-file-mutex.spec.ts` + `concurrent-claims.spec.ts` | C (1/4) | hecho |
| F5 | ✅ **HECHO** — `ITaskQueuePaths.lockPath` inyectado en `report` | C (1/4) | hecho |

### 🟠 MUY MAL

| # | Hallazgo | Quién | Fix |
|---|---|---|---|
| M1 | **EXDEV**: escrituras "atómicas" crean el temp en `os.tmpdir()` y `rename` al workspace → falla si están en FS distintos | C | temp en el **mismo directorio** del destino |
| M2 | **Doctor falso positivo**: `--plugins=memory,memory` → `--check` dice `ok:true`, pero el arranque real falla con `duplicate registration id` | C | doctor debe correr `planRegistrationOrder` + validar nombres/URIs reales; loader dedup por specifier |
| M3 | **Sin timeout de `import()`/`register()`** de plugin → boot infinito (la tolerancia solo cubre excepciones, no promesas colgadas) | C | timeout configurable + diagnóstico del plugin culpable |
| M4 | ✅ **HECHO** — `IProposalTrack` es `string` (agnóstico); `extractParallelismFromFrontmatter` acepta `knownTracks?` inyectable (typo-guard opt-in); `evaluateParallelism` con `auditLanes` configurable (default `['audit']`). Vocabulario del host fuera del módulo | S·G | hecho |
| M5 | ✅ **HECHO** — `paused/demos` ya no hardcoded; `syncProposalRegistry`/`scanLiveProposalEntries`/`collectRoundContextSnapshot` aceptan `extraFolders` inyectado por el plugin desde `ctx.options['proposalFolders']`. Spec `proposal-folders-injection` | S·G | hecho |
| M6 | ✅ **HECHO** (sesión autónoma previa) — `scaffold-host` usa `options.defaultModel ?? '<your-model>'`, sin modelo hardcoded | S·G·C | hecho |
| M7 | ✅ **HECHO** — schema de lock único: `ILockEntry`/`LockEntrySchema` en `persistent-task-queue` usan el formato canónico del writer (`ownership`/`started_at`/`last_seen`); `.transform()` de compat eliminado; consumidores (`promote`/`reportBackpressure`) y `zombie-reconcile` alineados. Spec `loadLockSnapshot` (M7) | S·G | hecho |
| M8 | ✅ **HECHO** — acceptance runner reescrito sobre `node:child_process` con `detached:true`: `cwd` inyectable (`runAcceptanceCriteria(criteria, {cwd})`), tokenizer argv que respeta comillas + shell para pipes/redirects, y timeout que mata el **grupo entero** (`process.kill(-pid)`) — sin zombies. Spec `acceptance-exec` (incl. test de descendiente muerto) | C | hecho |
| M9 | ✅ **HECHO** — scaffold de agentes/instrucciones/skill coherente: entry point `<prefix>_overview` (entry canónico de mcp-core, no el inexistente `check_project_state`); el workflow de proposals (`agent_lock`/`continue_proposal`/`get_validation_matrix`) se muestra condicional a `--plugins=proposals`. Spec actualizado | C | hecho |
| M10 | ✅ **HECHO** — corrupto ≠ vacío: helper `quarantineCorruptFile` + `CorruptFileError`; estado crítico (queue/registry/memory) preserva + error estructurado en capa de tool; closed-tasks preserva + warning + sigue. Specs en core/proposals/memory | C | hecho |

### 🟡 REGULAR

| # | Hallazgo | Quién | Fix |
|---|---|---|---|
| R1 | **`joinRel` duplicado** en core/rules/memory | S·G | mover a `@cartago-git/mcp-core/public` |
| R2 | ✅ **HECHO** — `coreToolRegistrations()` vacío eliminado de `create-mcp-server.ts` y `public/index.ts` (`planRegistrationOrder([], extras)`) | S·G | hecho |
| R3 | **Doctor re-lee config** (diagnose + assemble) | S·G | unificar (assemble devuelve diagnóstico) |
| R4 | **Mezcla sync/async I/O** en `persistent-task-queue` | S·G·C | async en rutas calientes |
| R5 | **`rules`: deps eslint del framework no verificadas** → `check_rules` propone comando que fallará | O | detectar/avisar deps ausentes o degradar a core-only |
| R6 | **`rules`: manifest stale** (solo se crea si no existe; cambios de mode/overrides no regeneran) + no valida schema | C | regenerar por hash/version; separar manifest de overrides humanos |
| R7 | **`rules`: `check_rules` solo eslint** (anuncia typecheck pero no lo propone); `eslint` desnudo depende del PATH | C | añadir comando typecheck; resolver binario |
| R8 | **`quality` con `execSync`** bloquea el event loop (hasta 10 min); buffer limitado; timeout indistinguible de exit 1 | C | `spawn` async, salida en streaming acotada, código de timeout, cancelación |
| R9 | **`git` oculta errores** (no-repo/timeout = salida vacía = repo limpio); `git_log.limit` sin límites | C·O | `{ok:false,reason}` + timeout + clamp 1..100 |
| R10 | **`memory` sin quotas** (título/cuerpo/tags/total) ni atomicidad ni redacción de secretos | C | límites + escritura atómica |
| R11 | **`auto_work`/`continue_proposal` sin detección de progreso**: puede re-elegir la misma `in_progress` en bucle | O | excluir in-progress ajenas; `idle` claro |
| R12 | ✅ **HECHO** — `assembleCliConfig` cualifica el `id` de cada tool de plugin a `<ns>_<id>` (su nombre MCP real) antes del registro, así la unicidad de `planRegistrationOrder` es por-namespace; 2 plugins pueden tener una tool interna homónima. Spec `plugin-id-collision` | C | hecho |
| R13 | ✅ **HECHO** — wildcard `./lib/*` eliminado del `exports` de los 6 paquetes (core + 5 plugins); superficie publicada = `.` (= `./public`) + `./public`. Ningún `src` importa `/lib/*` en runtime; los tests siguen vía alias de vitest. Cambios bajo `src/lib` ya no son semver-breaking | C | hecho |
| R14 | ✅ **HECHO** — internos `subagent-*` → `agent-*` (tipos, constantes, funciones, campos, 3 ficheros vía `git mv`); filename `subagent-registry.json` y terminología conceptual preservados | O | hecho |
| R15 | **`round-context.ts` (875 líneas)** hace demasiado | S·G | dividir (hashing/snapshot/resume) |

### 🟢/🌟/💎 LO QUE ESTÁ BIEN (consenso 4/4)
`planRegistrationOrder` (determinista, fail-fast) · `loadPlugins` resiliente ·
`analyzeProject` puro/inyectable · contrato `IMcpPlugin` + `definePlugin` (varios
lo marcan **perfecto**) · `overview` cold-start 1 llamada · knowledge lazy +
resources · round-context fingerprint SHA-256 · `evaluateParallelism` puro ·
`parseQueue` con error codes semánticos · backpressure/zombie-reconcile/
continuity-enforcer (anti-loop conceptual) · tsconfig estricto · empaquetado.

---

## 3. Gaps de tools/plugins/skills (deduplicado de las 4)

**Tools nuevas (alto valor):**
- **`proposals`: `create_proposal` + `close_slice` + `proposal_board`** (O) — cerrar el flujo de slices multi-agente exhaustivo y claro (hoy se editan .md a mano).
- **`state_health` + `state_repair` (dry-run/backup/journal)** (S·G·C, "proposals_heal"/"proposals_repair") — auto-sanación de `waiterOrphans`/locks huérfanos, no solo detección.
- **`doctor_runtime`** (C) — ensamblar el server real (sin stdio) y validar nombres/URIs/handlers duplicados.
- **`compact_status`** (C) — git+quality+proposals+locks en un payload pequeño con `fields`.
- **`cancel_operation`** (C) — cancelar quality/acceptance largas por id.
- **`plugin_capabilities`** (C) — qué escribe/ejecuta/lee cada plugin (modelo de confianza).

**Plugins nuevos:**
- **`notification`** (S·G·C) — usar `notifications/message` de MCP para avisar de release de locks → mata el polling.
- ✅ **`search`/index** (S·G) — HECHO: plugin `@cartago-git/mcp-search`, búsqueda textual grep-like sobre el workspace (roots/extensiones/ignore configurables). Semántica/índice persistente quedan como evolución.
- **`docs`** (O), **`deps`/`security`** (O) — y la integración del `securecoder` externo con `proposals` (S·G; está **fuera** de mcp-core).

**Skills (knowledge versionado, materializable, no cargar todas):**
`plugin-authoring`, `state-recovery`, `concurrency`, `token-budgeting`,
`security/trust-model` (C) + `multi-agent-loop` y prompt `orchestrate` (O).

**Agentes:** NO añadir más por defecto (C·O). 5 roles es demasiado; presets
`minimal` / `standard` / `swarm`. Si se añade uno, que sea un **custodian de
estado** (diagnóstico, no editor).

---

## 4. Eficiencia de tokens (consolidado)

**Bien:** overview, knowledge lazy + resources, JSON compacto en core,
round-context digest, auto_work 1-llamada, git diff stat, caps/tails.
**A mejorar:**
- **`proposals` aún usa pretty-JSON con tabs** en varias tools → migrar al envelope compacto (C·O).
- **`overview` enumera todas las tools** → `compact:true`/agrupar por tags al crecer (C).
- **`rules` materializa convenciones de todos los presets** aunque trabajes 1 área (C).
- **Blueprint genera una tool por quality-role** duplicando lo que ya hace el plugin `quality` (C).
- **Instrucciones repetidas** en prompt/skill/agent/copilot → referenciar knowledge versionado (C).
- Falta **paginar/truncar** salidas grandes (`analyze_project`, `plan_mcp_server.files`) + parámetro `fields` (O·C).

> Estimación Codex: 15-30% de ahorro en cold-start; **beneficio incierto bajo
> concurrencia** hasta que el estado sea fiable (un lock perdido obliga a
> reauditar y gasta más de lo ahorrado).

---

## 5. Bucles y bloqueos (consolidado)

**Mitigados:** lock-conflict devuelve acción alternativa (no polling), GC/TTL de
locks, zombie-reconcile, continuity-enforcer (downgrade a reset), budgets,
backpressure.
**Posibles (a cerrar):**
1. Plugin colgado en import/register (sin timeout) — M3.
2. `quality` síncrono congela el server — R8.
3. ✅ Acceptance deja procesos hijos vivos — M8 HECHO (process-group kill).
4. *Lost update* del lock (no transaccional) — F4.
5. `waiterOrphans` sin promoción/auto-heal fiable — state_repair.
6. Estado corrupto tratado como vacío → ciclos de reasignación — M10.
7. Doctor falso positivo → automatizaciones reintentan un server que no arranca — M2.
8. Polling de locks por falta de notificaciones MCP — plugin `notification`.

> Conclusión unánime: **no se puede afirmar "sin bucles ni bloqueos"**. Faltan
> una capa runtime transaccional y timeouts sistemáticos.

---

## 6. Plan priorizado para 11/10

### P0 — Fiabilidad del estado ✅ COMPLETADO (2026-06-15)
1. ✅ **Store transaccional** (lock/queue/registry/memory): atomic write +
   `withFileMutex` (mutex interproceso) en el read-modify-write. [F1·F4·M1] —
   ✅ **M7 (schema de lock único) también HECHO.**
2. ✅ **Erradicar `process.cwd()`**; `root` requerido en engines. [F2]
3. ✅ **`proposals` deriva rutas de `ctx`** (`--cacheDir`/`--docsDir` reales). [F3]
4. ✅ **`task_queue` recibe `lockPath` inyectado** en `report`. [F5]
5. ✅ **Tests de concurrencia** de claims y escrituras simultáneas
   (`with-file-mutex.spec.ts`, `concurrent-claims.spec.ts`). — ✅ **M10
   (corrupto≠vacío) también HECHO** con tests.

### P1 — Operativa fiable
6. **Doctor real**: ensambla el server (sin stdio), valida nombres/URIs duplicados; loader dedup. [M2]
7. **Timeouts** de import/register; subprocess async/cancelable con process groups. [M3·R8] — ✅ **M8 (acceptance: cwd + argv/shell + process groups) HECHO.**
8. ✅ **Corrupto ≠ vacío**: preservar + error estructurado + backup. [M10] — HECHO con tests.
9. **`state_health` + `state_repair`** (auto-heal de waiterOrphans/locks). [gaps]

### P2 — Calidad de producto
10. **`proposals`: `create_proposal` + `close_slice` + `proposal_board`** (flujo de slices exhaustivo y claro). [O]
11. ✅ **Agnosticismo HECHO**: tracks (M4), carpetas (M5), modelo no-hardcoded (M6), scaffolds que solo prometen tools existentes (M9). [M4·M5·M6·M9]
12. **`rules`**: regenerar manifest por hash, validar deps eslint, añadir typecheck. [R5·R6·R7]
13. **Endurecer plugins**: `git` errores+timeout+clamp, `memory` quotas+atomic, `quality` async+cancelable. [R8·R9·R10]
14. **Tokens**: envelope compacto en proposals, paginado/`fields`, `overview compact:true`. [§4]
15. **DRY/limpieza**: `joinRel` a public, eliminar `coreToolRegistrations` vacío, renombrar `subagent-*`. [R1·R2·R14]
16. ✅ **CI HECHO** (`.github/workflows/ci.yml`): job `validate` (typecheck + tests con Bun + frozen lockfile) y job `pack-smoke` (`npm pack --dry-run` por paquete, valida la superficie `exports` cerrada de R13) en push/PR a main. Pendiente: cobertura mínima. [R17]

### P3 — Evolución / plataforma de referencia
17. **`proposals` por capacidades** (store/locks/queue/swarm) + presets `minimal/standard/swarm`. [C]
18. ✅ **`/lib/*` cerrado** (R13). Pendiente: semver real (bump al publicar) + migraciones de formatos persistidos. [R13]
19. **Plugins nuevos**: ✅ **`search` HECHO** (plugin `@cartago-git/mcp-search`: tool `search` grep-like de bajo token, agnóstico vía options, 8 tests). Pendientes: `notification` (mata polling), `docs`, `deps/security`. [gaps]
20. **Skills versionadas** (authoring/recovery/concurrency/security/token-budgeting) + `multi-agent-loop`/`orchestrate`. [gaps]
21. **Observabilidad** (`IStatusCollector` real, `--verbose`), **benchmarks de tokens**, **caos/multiplataforma**. [S·C]
22. 🟡 **`structuredContent` HECHO** (MCP moderno): helpers compartidos `toolJson`/`toolOk`/`toolError` + `json()` de agent-names + `runTaskQueueMcp` reflejan el payload-objeto en `structuredContent`. Spec `tool-response`. Pendiente: declarar `outputSchema` (Zod) por tool. [O]

---

## 7. Conclusión

Para pasar de **~7,3 a 11/10** el orden es claro y unánime: **primero P0/P1
(estado transaccional, rutas inyectadas, doctor real, timeouts)** — eso convierte
la base en fiable (~8,5). Luego P2 cierra el flujo de propuestas multi-agente y
el agnosticismo, y P3 lo eleva a plataforma de referencia. La arquitectura ya es
buena; el trabajo restante es **disciplina de ingeniería sobre la persistencia**,
no rediseño.
