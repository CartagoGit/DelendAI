# Auditoría unificada de `@cartago-git/mcp-core` — síntesis de 4 revisiones

> **Fecha:** 15-06-2026. Consolida y contrasta 4 auditorías independientes:
> Antigravity (Claude Sonnet 4.6 Thinking), Antigravity (Gemini 3.5 Flash),
> Codex (GPT-5.5) y Claude Code (Opus 4.8). Las 4 originales se archivan en
> `docs/proposals/done/`. Este documento es la **propuesta de auditoría completa**
> para dejar el proyecto en 11/10.
>
> **Nota de consenso: ~7,3/10** (Sonnet 8 · Gemini 7,9 · Opus 4.8 7,5 · Codex 6,8).
> Arquitectura excelente; el techo lo marca la **persistencia/concurrencia** del
> plugin `proposals` y residuos del host original.

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
| F1 | **Escrituras NO atómicas** en `agent-lock-engine.writeLock` y `sync-proposal-registry` (y `memory`): dos agentes → JSON truncado/corrupto que tumba el server | S·G·C·O (4/4) | patrón `tmp-en-mismo-dir + rename` (ya existe en `persistQueue`) en TODOS los stores |
| F2 | **`process.cwd()` filtrado** en `syncProposalRegistry(root=process.cwd())`, `resolveWorkspacePath`, `delivery-verifier.defaultVerifyPaths`, fallback de `agent-lock` | S·G·C·O (4/4) | `root` requerido; todo desde `ctx.workspace`; prohibir cwd en engines |
| F3 | **`proposals` ignora `--cacheDir`/`--docsDir`**: usa `DEFAULT_PATH_LAYOUT` horneado; overview/doctor informan rutas distintas a las reales; 2 instancias comparten estado sin querer | C·O (2/4) | derivar layout de `ctx.corePaths` (`buildSwarmPaths(ctx.pluginCacheDir, ctx.docsDir)`) o documentar contrato explícito |
| F4 | **Lock no es un mutex real** (read→check→write sin exclusión): dos claims simultáneos creen ambos poseer el fichero (*lost update*) | C (1/4) | creación exclusiva/lock interproceso + revisión/CAS + test multiproceso |
| F5 | **`task_queue report` lee el lock equivocado** (`DEFAULT_PATH_LAYOUT.lockFile`, relativo a cwd) → backpressure falso | C (1/4) | `ITaskQueuePaths` debe incluir `lockPath` inyectado |

### 🟠 MUY MAL

| # | Hallazgo | Quién | Fix |
|---|---|---|---|
| M1 | **EXDEV**: escrituras "atómicas" crean el temp en `os.tmpdir()` y `rename` al workspace → falla si están en FS distintos | C | temp en el **mismo directorio** del destino |
| M2 | **Doctor falso positivo**: `--plugins=memory,memory` → `--check` dice `ok:true`, pero el arranque real falla con `duplicate registration id` | C | doctor debe correr `planRegistrationOrder` + validar nombres/URIs reales; loader dedup por specifier |
| M3 | **Sin timeout de `import()`/`register()`** de plugin → boot infinito (la tolerancia solo cubre excepciones, no promesas colgadas) | C | timeout configurable + diagnóstico del plugin culpable |
| M4 | **`IProposalTrack` con vocabulario del host** (`ui-demo`, `game-demo`, `scaffold`…) → rompe agnosticismo | S·G | tracks configurables por `mcp-core.config.json` |
| M5 | **`paused/demos` hardcodeado** (TODO sin resolver) en round-context/sync | S·G | carpetas inyectables vía opciones del plugin |
| M6 | **Modelo `MiniMax-M3 (customendpoint)` hardcoded** en scaffold-host | S·G·C | omitir o pedir como opción `<provider/model>` |
| M7 | **Schema de lock dual** (`files`/`claimed_at` vs `ownership`/`started_at`) con `.transform()` de compat | S·G | migrar a formato único, quitar capa de compat |
| M8 | **Acceptance commands** sin `cwd` inyectado, `split(/\s+/)` rompe comillas/pipes, timeout no mata descendientes (zombies) | C | `cwd=workspace`, shell declarada/parser argv, process groups |
| M9 | **Scaffold de agentes incoherente** con el host generado (ordena llamar tools que el host no registra; no integra `proposals`) | C | generar solo tools existentes / wirear proposals |
| M10 | **Corrupción silenciosa → estado vacío** (memory/queue/registry tratan JSON corrupto como `[]`) → pérdida de datos, reasignaciones dobles | C | preservar fichero corrupto + error estructurado + recovery |

### 🟡 REGULAR

| # | Hallazgo | Quién | Fix |
|---|---|---|---|
| R1 | **`joinRel` duplicado** en core/rules/memory | S·G | mover a `@cartago-git/mcp-core/public` |
| R2 | **`coreToolRegistrations` vacío** perpetuo | S·G | eliminar o rellenar |
| R3 | **Doctor re-lee config** (diagnose + assemble) | S·G | unificar (assemble devuelve diagnóstico) |
| R4 | **Mezcla sync/async I/O** en `persistent-task-queue` | S·G·C | async en rutas calientes |
| R5 | **`rules`: deps eslint del framework no verificadas** → `check_rules` propone comando que fallará | O | detectar/avisar deps ausentes o degradar a core-only |
| R6 | **`rules`: manifest stale** (solo se crea si no existe; cambios de mode/overrides no regeneran) + no valida schema | C | regenerar por hash/version; separar manifest de overrides humanos |
| R7 | **`rules`: `check_rules` solo eslint** (anuncia typecheck pero no lo propone); `eslint` desnudo depende del PATH | C | añadir comando typecheck; resolver binario |
| R8 | **`quality` con `execSync`** bloquea el event loop (hasta 10 min); buffer limitado; timeout indistinguible de exit 1 | C | `spawn` async, salida en streaming acotada, código de timeout, cancelación |
| R9 | **`git` oculta errores** (no-repo/timeout = salida vacía = repo limpio); `git_log.limit` sin límites | C·O | `{ok:false,reason}` + timeout + clamp 1..100 |
| R10 | **`memory` sin quotas** (título/cuerpo/tags/total) ni atomicidad ni redacción de secretos | C | límites + escritura atómica |
| R11 | **`auto_work`/`continue_proposal` sin detección de progreso**: puede re-elegir la misma `in_progress` en bucle | O | excluir in-progress ajenas; `idle` claro |
| R12 | **`planRegistrationOrder` exige IDs globales únicos** (impide 2 plugins con tool interna homónima) | C | identidad por plugin/namespace o reescritura de IDs |
| R13 | **`/lib/*` demasiado abierto** (wildcard) → dificulta semver; consumidores (affairs) dependen masivamente | C | cerrar gradualmente + semver real |
| R14 | **Nombres internos `subagent-*`** aunque la tool es `agent_names` | O | renombrar a `agent-*` |
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
- **`search`/index** (S·G) — búsqueda textual/semántica sobre workspace/proposals/memory.
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
3. Acceptance deja procesos hijos vivos — M8.
4. *Lost update* del lock (no transaccional) — F4.
5. `waiterOrphans` sin promoción/auto-heal fiable — state_repair.
6. Estado corrupto tratado como vacío → ciclos de reasignación — M10.
7. Doctor falso positivo → automatizaciones reintentan un server que no arranca — M2.
8. Polling de locks por falta de notificaciones MCP — plugin `notification`.

> Conclusión unánime: **no se puede afirmar "sin bucles ni bloqueos"**. Faltan
> una capa runtime transaccional y timeouts sistemáticos.

---

## 6. Plan priorizado para 11/10

### P0 — Fiabilidad del estado (antes de usar swarm en serio)
1. **Store transaccional común** (lock/queue/registry/closed/memory): temp en
   mismo dir + `rename`, revisión/CAS, mutex interproceso. [F1·F4·M1·M7]
2. **Erradicar `process.cwd()`**; todo desde `ctx.workspace`; `root` requerido. [F2]
3. **`proposals` deriva rutas de `ctx`** (`--cacheDir`/`--docsDir` reales). [F3]
4. **`task_queue` recibe `lockPath` inyectado** en `report`. [F5]
5. **Tests multiproceso** de claims y escrituras simultáneas; corrupción/recovery. [F1·M10]

### P1 — Operativa fiable
6. **Doctor real**: ensambla el server (sin stdio), valida nombres/URIs duplicados; loader dedup. [M2]
7. **Timeouts** de import/register; subprocess async/cancelable con process groups. [M3·M8·R8]
8. **Corrupto ≠ vacío**: preservar + error estructurado + backup antes de reparar. [M10]
9. **`state_health` + `state_repair`** (auto-heal de waiterOrphans/locks). [gaps]

### P2 — Calidad de producto
10. **`proposals`: `create_proposal` + `close_slice` + `proposal_board`** (flujo de slices exhaustivo y claro). [O]
11. **Agnosticismo**: tracks y carpetas configurables; quitar modelo hardcoded; scaffolds que solo prometan tools existentes. [M4·M5·M6·M9]
12. **`rules`**: regenerar manifest por hash, validar deps eslint, añadir typecheck. [R5·R6·R7]
13. **Endurecer plugins**: `git` errores+timeout+clamp, `memory` quotas+atomic, `quality` async+cancelable. [R8·R9·R10]
14. **Tokens**: envelope compacto en proposals, paginado/`fields`, `overview compact:true`. [§4]
15. **DRY/limpieza**: `joinRel` a public, eliminar `coreToolRegistrations` vacío, renombrar `subagent-*`. [R1·R2·R14]
16. **CI**: typecheck + tests + pack/install smoke + cobertura mínima por paquete. [R17]

### P3 — Evolución / plataforma de referencia
17. **`proposals` por capacidades** (store/locks/queue/swarm) + presets `minimal/standard/swarm`. [C]
18. **Semver real**, cerrar `/lib/*`, migraciones de formatos persistidos. [R13]
19. **Plugins nuevos**: `notification` (mata polling), `search`/index, `docs`, `deps/security`. [gaps]
20. **Skills versionadas** (authoring/recovery/concurrency/security/token-budgeting) + `multi-agent-loop`/`orchestrate`. [gaps]
21. **Observabilidad** (`IStatusCollector` real, `--verbose`), **benchmarks de tokens**, **caos/multiplataforma**. [S·C]
22. **`outputSchema`/`structuredContent`** en tools (MCP moderno). [O]

---

## 7. Conclusión

Para pasar de **~7,3 a 11/10** el orden es claro y unánime: **primero P0/P1
(estado transaccional, rutas inyectadas, doctor real, timeouts)** — eso convierte
la base en fiable (~8,5). Luego P2 cierra el flujo de propuestas multi-agente y
el agnosticismo, y P3 lo eleva a plataforma de referencia. La arquitectura ya es
buena; el trabajo restante es **disciplina de ingeniería sobre la persistencia**,
no rediseño.
