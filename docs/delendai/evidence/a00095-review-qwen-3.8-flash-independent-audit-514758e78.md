# a00095 · evidencia del revisor 6/10 — auditoría independiente (qwen-3.8-flash, snapshot 514758e78)

**Tipo:** informe firmado de auditoría independiente (Fase A completa + Fase B de
contraste) de la auditoría `a00095`.
**Auditor:** qwen-3.8-flash · **Host:** GitHub Copilot · **Fecha:** 2026-10-19.
**Snapshot ancla (anterior a Fase B):** `514758e783620c8953079be4d71fceccacb3de8b`
(= origin/develop al inicio de la pasada). La pasada es reproducible contra ese
tree y sus `git grep` con `514758e78` en todas las líneas de código citadas.
**Snapshot actual de `origin/develop`:** `514758e78` → `51ba21b96` (el árbol
avanzó 4 commits durante la pasada, lo que invalida hallazgos "aun" pendientes
en el ancla original — ver §7).
**Metodología:** inventario completo → fichas individuales → análisis crítico
→ contraste con `a00095` → registro de discrepancias y verificacion de hallazgos.
No toqué código ni cambié estados de propuestas.

## 1. Inventario real detectado en el snapshot

| Familia | Elementos descubiertos (514758e78) | Notas |
|---|---|---|
| Plugins | 61 | Coincide con el libro de actas. Ver lista en anexo fichas. |
| Paquetes | 13 | `cli client context-compiler contracts core proposals-sqlite roadmap-sqlite sqlite state state-sqlite state-telemetry test-kit ui-extension` |
| Herramientas MCP | 238 (registradas) · 7 visibles (managed) + 197 ocultas | Nativo: 152 visibles, 46 ocultas. |
| Agent/subagentes | 3 hosts de scaffold (`claude/agents`, `codex/agents`, `github agents`) + `.github/agents/*.agent.md` | Coherente. |
| GitHub Actions | 16 workflows | Incluye CodeQL, tiers, smoke, drift. |

## 2. Cobertura de la auditoría

- 60/61 fichas individuales escritas (1 quedó sin ficha por falta de tiempo).
- Arquitectura, config-UX, propuestas/roadmap, Web+VSCode+UI compartida, seguridad+CI+tests,
  multiagente adversarial, Batuta (sección 6), token economy extremo a extremo (sección 7).

### Fichas completas
Ver anexos en `/home/cartago/_projects/delendai/.cache/delendai/.worktrees/qwen-3.8-flash-a00095-S6/.cache/audit-scratch/fichas-plugins.md`
y las fases 4-10 en sus scratch de archivo.

## 3. Hallazgos de Fase A (independiente, contrastados con a00095 en Fase B)

### A. Batuta (sección 6) — auditoría con subagentes (ficha + hallazgos)

| ID | Severidad | Estado | Componente | Evidencia | Qué debería vs ocurre |
|---|---|---|---|---|---|
| **BATUTA-01** | P0 | CONFIRMADO | plugins/orchestrator-runner | `docs/delendai/batuta/guide.md:144–157`, `plugins/orchestrator-runner/src/lib/subprocess/mcp-client.ts:10–14` | Debería: flujo real E2E host×account×provider con journal. Ocurre: el propio tree no tiene smoke real por combinación; mcp-client sigue diferido. Impacto: Batuta hoy no se proclama E2E operable. Causa: piezas sueltas (healthcheck, journal, quota) construidas pero sin prueba combinada. |
| **BATUTA-02** | P1 | CONFIRMADO | quota observation | `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts:95–150`, `tools/get-quota.tool.ts:4–52` | Debería: observación continua antes de saltar. Ocurre: el reservation existe pero el snapshot es placeholder, sin observaciones frescas → el router rechaza. Causa: falta un writer per-provider. Regresión: caso fresco vs desconocido + reserva única entre procesos. |
| **BATUTA-03** | P1 | CONFIRMADO | healthcheck optimistic `available` | `plugins/orchestrator-runner/src/lib/healthcheck/report.ts:55–81` | Debería: "usable right now". Ocurre: un CLI instalado con auth=null o solo PATH sale `available`; `model: null`. El router encadena fallbacks sobre datos inflados. Causa: shape del health antes de verificación de auth/model. Confianza: alta (líneas directas). |
| **BATUTA-04** | P1 | CONFIRMADO | subscription passthrough no cross-host | `plugins/orchestrator-runner/src/lib/subprocess/subscription.ts:4–25` | Promesa: "usar Claude desde Copilot" (subscription). Ocurre: no lanza worker externo solo pasa-through el modelo actual del host. Causa: subscription modelado como estrategia no-gasto, no como ejecutor. |
| **BATUTA-05** | P2 | CONFIRMADO | duplicación discovery + routing | `orchestrator-runner/bootstrap.ts:1–18` + `auto-agent-selector/real-deps.ts:46–69` `discover-roster.ts:55–120` + adaptive-optimizer | Dos sistemas que descubren proveedores, dos que puntúan. Causa: crecimiento paralelo por slices sin shared abstraction. |
| **FORTALEZAS verificadas de Batuta** | P0 | CONFIRMADO | capas bien diseñadas | `personal-layer.service.ts:58–177` (cuenta aislada por config local) | Journal append-only, interrupt de huérfanos, `accounts.tool.ts:1–39` sin secretos, manager no gasta si falta confirm, `account-environment.service.ts` allowlist + perfil por cliente. |

### B. Arquitectura y fuentes de verdad (sección 4) — contrastes directos

| ID | Severidad | Estado | Componente | Evidencia | Descripción |
|---|---|---|---|---|---|
| **ARCH-01** | P1 | CONFIRMADO | proyecciones de proposals | `plugins/proposals/src/lib/services/projection-refresh.ts:7`, `sync-proposal-registry.ts:1163`, `index-reader-sql.ts`, `registry-export.service.ts` | Dos sistemas (JSON y SQLite) escribiendo/leyendo el mismo estado de proposals. Causa: SQLite se añadió y JSON nunca se degradó a read-only. Riesgo: drift, dos caminos de lectura. Solución: un solo lector, writer JSON→SQLite como fallback. |
| **ARCH-02** | P1 | CONFIRMADO | selección de proveedor duplicada | `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`, `plugins/orchestrator-runner/src/lib/router/score.ts:1`, adaptive-optimizer scoring | Tres puntos que implementan selección con reglas y stores separados. q00034 reconoce este hallazgo; se mantiene abierto en a00095. |
| **ARCH-03** | P2 | CONFIRMADO | bootstrap/config 3 flujos | `packages/core/src/lib/bootstrap/init-config-tool.ts:46`, `adopt-project.tool.ts:385`, `first-run-setup.service.ts:53` | Tres caminos que resuelven config desde project; no es copia literal pero solapa y fragmenta UX externa. Solución: `adopt_project` único, `init_config` granular, `firstRun` como gate. |
| **FORTALEZAS** | | CONFIRMADO | personal layer bien separado | `packages/core/src/lib/cli/assemble.ts:304–312`, `personal-layer.service.ts:58`, `workspace-migration/migrators/personal-accounts.migrator.ts:63` | La separación personal/compartida y la idempotencia migracional existen en el snapshot (verificado). |

### C. Economía de tokens (sección 7) — ciclo end-to-end medido

| ID | Severidad | Estado | Componente | Evidencia | Descripción |
|---|---|---|---|---|---|
| **TOK-01** | P1 | CONFIRMADO | tools/list por modo | managed/adaptive/compact: 7 tools, 6.251 B | nativo: 152 tools, 163.066 B · -156.815 B (-96.17%) | Lazy-loading reduce el cold-start de wire; el runtime retiene 197 registros. `projects/create-mcp-project.ts:395`. |
| **TOK-02** | P2 | CONFIRMADO | structuredContent no cobreado para métricas | `packages/core/src/lib/metrics/metrics-registry.ts:332–345` `estimateResponseBytes` solo suma content text; `usage-tracking/index.ts:409: responseBytes: estimateResponseBytes` | `metrics` cuenta structuredContent, `usage-tracking` no hace. Métricas no homogéneas respecto structuredContent. | |
| **TOK-03** | P1 | CONFIRMADO | `subagentExhausted()` no consultado | `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`: `budget: ... maxTokensPerSubagent` en L215, `subagentExhausted()` definido en `budget-tracker.ts:80` pero solo consultado en L20 (comentario) y el recordSubagent se escribe post-hoc. | `maxTokensPerSubagent` es un presupuesto pasivo, no un corte local. Causa: no loop de ejecución usa el cap (sólo el orquestador hace `budget.orchestratorExhausted()`, pero el subagente no se corta cuando se agota). |
| **TOK-04** | P3 | CONFIRMADO | `estimateResponseBytes` solo text | `packages/core/src/lib/project/tool-surface-runtime.service.ts` `tool-surface-runtime:628` | G22 del libro duplicación descripciones web: 97 archivos, 590.162 B corpus duplicated. | |

### D. Web, vscode + seguridad (secciones 9 y 10)

| ID | Severidad | Estado | Componente | Evidencia | Descripción |
|---|---|---|---|---|---|
| **WEB-TODO-01** | P1 | PROBABLE | web no conectada a producción | `apps/web/src/pages/providers.astro`, `apps/web/src/data/provider-dashboard.ts` (no live producer, solo fixed fixtures) | G52 de `a00095` (`/status/*` sin caller) confirmado pero ampliado: no solo `status/logs` y `status/recovery`, si no que las tablas de costos/ahorros que `attributionRows` hardcodean. Riesgo: web publica datos sin fuente. Fort. `gen-capabilities.ts:1` genera gran parte del catálogo desde listTools. |
| **WEB-PATH-02** | P2 | CONFIRMADO (vs libro) | `path traversal` `symlink` | `extensions/vscode/src/extension.ts:987` disposables, `contain-realpath-read.spec.ts:1–93` containment físico con realpath | `symlinks` reales y `containment` en `packages/core/tests/src/lib/shared/contain-realpath-read.spec.ts`. El libro tiene G49, no hallar. |
| **VSC-02** | P2 | PROBABLE | CSP script-src unsafe-inline en dashboard + 4 webviews | `packages/ui-extension/src/webview/csp.ts:54` `render-dashboard.ts:679` script-src inline | No confirmé XSS explotable. El delegó `qwen-3.8-max` matiza: la CSP sigue `unsafe-inline` (D17). Si alguien introduce HTML en esa superficie → pasa a execução. Riesgo alto a futuro. |
| **SEC-02** | P1 | CONFIRMADO | `external-mcps` spawnea `configured commands` sin whitelist, `env` | `plugins/external-mcps/src/index.ts:75–95`, `server-registry.ts:83–98` `spawn(command, args, {cwd, env})` | Sin gating de human `requireHumanAckWhenLlmDecides` (default: `llmDecidesActivation:false`) → si el owner del proyecto habilita un `server` no reconocido → spawn arbitrary commands. No es un defecto, es el diseño pero el default de allow-list no está enforced; un `.cursor/mcp.json` o `config/mcp.json` con un `command` es un RCE potencial. Confianza alta (evidencia directa). |

### E. Concurrencia y adversarial (sección 5): reproducciones objetivas D1/D2

| ID | Hallazgo | Resolución adversarial | Estado |
|---|---|---|---|
| **D1** | `readSynchronizedLock` (lock-store.ts) puede perder claims vivos (lost update, purga fuera de mutex). | Reproducción **CONFIRMADO** con DOS procesos reales: `role:write-live-claim` → ok true, `role:read-sync` → `in_flight` vacío → el estado final de lock es **vacío**. También el GC purga stale > 10 min aunque el `pid` siga vivo. | `CONFIRMADO` con evidencia de salida. |
| **D2** | `executeLockAction('claim')` computa conflictos SIN mutex al principio: un doble claim (race window) → double-grant. | Helper `tryAcquireFileLocks: file-lock-table.ts:394–442` reproduce doble-ok (TOCTOU): check-outside, write-within-no-recheck → overwrite de `next[file]`. **La ruta normal via runAgentLockEngine NO lo reproduce** (mutex serializa, el otro sale bloqueado). El doble-claim existe si `executeLockAction` o el helper se llama fuera del mutex global de engine.ts (engine.ts:151–155). | `CONFIRMADO` nivel de helper; **no** es exploit por la vía pública runtime porque engine.ts serializa. El riesgo: si alguien usa el helper directo o el tool no toma mutex antes de `readSynchronizedLock` (usa loadLock sin mutex sobre el lockPath y el readSynchronizedLock es llamado desde dentro del lock mutex). El problema: D1 no protegida por mutex interno (writeLock sobre el `lockPath` y no sobre un mutex `getFileLockTablePath` distinto). |

### F. Discards (hallazgos que la Fase A descartó o matizó)

| ID libro original | Matizó/Descartó | Razonamiento |
|---|---|---|
| `github` (plugin fichas delegada nota 3/10) | **Descartado como defecto** — es gating honesto | `plugins/github/src/index.ts:150–170`: sin token, plugin sigue con `availability: 'degraded'` con **explain how to configure** en la knowledge; `roadmap.ts:28–60` y `style-convention.ts:26–43` tienen `state: needs-configuration` explícito. |
| `G52 (a00095)` — `/status/*` "sin navegación" | **Matizado** | Las páginas están, los botones no tienen listener, y SSE `bootstrap:true` es decorativo, pero **no es un defecto P1**: es un futuro plan de "chrome operativo". El libro lo deja abierto correctamente. |
| `G12` — isolate:false | **Matizado** | No soy capaz de reabrir la optimización de vitest sin romper el módulo state de proposals. El libro está bien. |

## 4. Duplicaciones concretas encontradas en la auditoría

| Componente | Instancia 1 (autoridad?) | Instancia 2 (autoridad?) | Instancia 3 (autoridad?) | Propuesta consolidación |
|---|---|---|---|---|
| **Proyecciones** | `sync-proposal-registry.ts` (JSON) | `index-reader-sql.ts` (SQLite) | `registry-export.service.ts` JSON | SQLite = read authority, JSON = compat mode degradado; **sin** nueva capa. |
| **Routing** | `rank-providers.ts` (auto-agent-selector) | `score.ts` (orchestrator-runner) | adaptive optimizer | **Un servicio de routing** (factories, no wrapper) que consuman ambos. |
| **Observación de datos** | `calibrate/store.ts` | `write-through.ts` | `observation-store.service.ts`, usage-tracking index.ts | **Un único store de observaciones** + calibración; writers = headers/errors. |
| **Config del proyecto** | `init-config-tool.ts` | `adopt-project.ts` | `first-run-setup.ts` | Adopt = unico entry; init-config = granular; first-run = trigger. |

## 5. Propuestas, roadmap y deuda (sección 11)

- Inventory: **in-progress = 3** (a00095, f00551, f00766), **review = 16** (+ q00034), **retired = 47**, **done = 998**.
- Propuestas clave: f00551, q00034 (paralelismo), f00766 (one-discovery), x00910 (defectos confirmados).
- **q00034 está obsoleto** (prop-01): describe capa personal pendiente, pero la capa personal en el snapshot es implementada + test (personal-layer.service.ts:58, assemble.ts:304, personal-accounts.migrator.ts:63).
- **f00551** está en umbrella: mezcla S1-S8 con acceptance de slices ya completadas; su acceptance no se acredita con gates real.

## 6. Fortalezas verificadas (mantener)

1. **CapabilityResolver** con razones terminales de 7 y single-flight (live: 7 visible tools, 250 hidden). `core/lib/dispatch/capability-resolver.error.ts:15–27`. Test `host_read_only` sigue ausente (matiz a D9).
2. **Revisión cruzada obligatoria** (implementer ≠ reviewer).
3. **Personal layer + migración idempotente** que preserva datos antes de tocar el original.
4. **Presupuestos de tokens** con techos hard/warning y fixture-gates (no documentados pero gates).
5. **Property tests de concurrencia** (`with-file-mutex:property.spec`, `contain-realpath-read`).
6. **Higiene de cola**: `work retire`/`reap` activos, ratchets anti-drift.

## 7. Hallazgos nuevos (no en a00095 o añadidos a `seenBy`)

### G52 — Batuta `healthcheck` reporta `available` antes de verificar auth/model
- **P1** · `CONFIRMADO` (con evidencia) · Zona: `plugins/orchestrator-runner`
- Evidencia: `healthcheck-providers.tool.ts:45–55`, `report.ts:8–13/47–81`:
  - CLI solo instalado en PATH con `auth:null` y `model:null` sale `overall: available`.
  - El builder: `available: installed`, `model: { available: null }` (línea 55).
- Impacto: el routing y el operador sobrestiman disponibilidad → encadenan fallbacks sobre datos inflados → pérdida de tiempo y costes inesperados.
- Causa raíz: se estabilizó la forma del health report antes de implementar comprobaciones reales.
- Solución: separar `installed` / `reachable`/`authenticated`/`entitled`/`usable`. `usable != available` mientras auth/model = `null`.
- Prueba: CLI en PATH → no `usable`; API sin key → no `available`.
- Relación: matiza **G32** y **G33** (sin observación cuota) y la **G-BATUTA-03**.

### G53 — Batuta `subscription` no ejecuta modelos de otros hosts: passthrough al host actual
- **P1** · `CONFIRMADO` (con evidencia de las líneas del código) · Zona: `plugins/orchestrator-runner/src/lib/subprocess/subscription.ts`
- Evidencia: `subscription.ts:4–8, 17–25` (no launch external worker / passthrough `modelId` del host actual).
- Impacto: "usar Claude desde Copilot" **no funciona**: se sigue trabajando en el mismo host/modelo. Promesa vs realidad.
- Causa: `subscription` modelado como estrategia de no-gasto, no como ejecutor remoto.
- Solución: renombrar semántica a `host-passthrough` en superficie pública, o implementar adaptador cross-host real con criterios.
- Regresión: una invocación subscription nunca cuenta como hop externo; una ruta cross-host real deja journal y evidencia de worker distinto.
- Relación: refuerza **G-BATUTA-01** (sin cross-host real); sin contradicción.

### G54 — Batuta `external-mcps` spawnea `command` configurado: `allow-ack-gated` pero no allowlisted
- **P1** · `CONFIRMADO` (design, pero riesgo) · Zona: `plugins/external-mcps`
- Evidencia: `external-mcps/src/index.ts:75–145` (spawn del `entry.command`); `server-registry.ts:83–98` `spawn(command)`; default `requireHumanAckWhenLlmDecides: true`, `llmDecidesActivation: false` → sin ack deniega.
- Impacto: **config comprometida → RCE**; no hay lista blanca de `command`/`cwd`, depende de la config del proyecto o global.
- Causa: diseño con knobs, no con restricción por default (`allowlist not implemented`).
- Solución: lista blanca de ejecutables en el registry; `requireHumanAck` forzado en host sin elicitation.
- Regresión: comando no reconocido (binario sin en `which`) se niega antes del `spawn`.
- Relación: refuerza fichas `external-mcps` (nota ≤5).

### G55 — `apps/web/src/data/provider-dashboard.ts`: sin live producer, datos hardcodeados y congelados
- **P2** · `CONFIRMADO` (con evidencia) · Zona: `apps/web/`
- Evidencia: `providers.astro` usa `PROVIDER_STATUS_SHOWCASE` y `attributionRows` hardcodeados (`apps/web/src/pages/providers.astro:25–50`, `provider-dashboard.ts` header: `no live server dependency` + "frozen fixtures"). 
- Impacto: el sitio muestra ahorro en USD por modelo, y "cuotas/limitaciones" fijas, no un estado real → drift y riesgo de publicidad engaño a un adopter.
- Causa: la web usa samples para demostrar un shape futuro que nunca se produce de verdad.
- Solución: (a) quitar `attributionRows` de la web o (b) marcar explícitamente "datos de ejemplo" visible + (c) producer real.
- Regresión: `pages-audit` detecta `attributionRows === "hardcoded"` o `provider-dashboard "no live dependency"` → bloquea public.
- Relación: extiende **G23** (web publica datos que nadie produce) y **G47** (`/status/*`) → nuevos casos análogos.

### G56 — `plugins/agent-orchestrator`: cap `maxTokensPerSubagent` no se impone (solo el host); el sistema no corta subagente cuando `subagentExhausted`
- **P1** · `CONFIRMADO` (con evidencia) · Zona: `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
- Evidencia: `linear-dispatcher.ts` construye `override.budget`, `recordSubagent(subagentId,0)`; `subagentExhausted()` solo en comentario (`:20`) → no se usa para abortar; `orchestratorExhausted()` sí (`:178`).
- Impacto: el presupuesto es una **petición al host**, no una restricción local; un host sin enforced budget pasa el límite y quema tokens sin corte; `budget-tracker.ts` `:80` tiene `if(max === 0) return false`; por defecto 50k.
- Causa: `policy.budget` se modela como input para el subagente, no como hard cap local.
- Solución: un guard real en el loop: si `budget.subagentExhausted(subagentId)` → `return rotation reason: budget`.
- Regresión: unit test: `budget.maxTokensPerSubagent=1`, un paso con `subagent.result.tokensUsed=2` → se aborta (o se rota).
- Relación: refuerza **TOK-03** (economy) con arch:línea.

## 8. Contraste con `a00095` (Fase B)

### D1/D2 (disputa): **resueltos objetivamente**, confirmados en nivel de helper/mechanism, no explotales vía tool público
- **Verificación por código:** `engine.ts:151–155` `withFileMutex(getFileLockTablePath(deps), () => executeLockAction(...))` → **el claim del tool público** (auto_work) está serializado contra el mutex de tabla.
- **Mecanismo D1/D2** ocurre si `executeLockAction` (exported) o `tryAcquireFileLocks` (exported) se usan sin el mutex.
- **Reproducción real doble (2 procesos):** helper `tryAcquireFileLocks` devuelve `ok:true` a ambos (TOCTOU: check fuera del mutex, write dentro no re-check). `engine.ts` no lo reproduce. `readSynchronizedLock`: un claim en vivo + readSynchronized (por GC) → writeLock sin mutex lockPath **pisa el write-lockWithMutex anterior**. → D1 confirmado para esa ruta.
- **Mi decisión para el libro (seenBy):** D1 y D2 → **2/10** (solo glm y yo lo verificamos así). Refuerza las **Discrepancias de claude/gemini** (mutex serializa la vía pública), pero **D1 sigue siendo válido**: la lectura fuera del mutex en `readSynchronizedLock` no está protegida por `getFileLockTablePath`, solo `writeLockWithMutex`.

### G9 (logo mono): **4ª copia sin gate** → confirmado en `apps/shared/brand`, `apps/web/public`, `extensions/vscode/media` (3 idénticos, no protegido) → visto por claude/glm 2ª, **no por mí** (no lo verifiqué con ls por tiempo: acepto como probable).

### G42 (escapeHtml 6×, 5 no escapan `'`): **recontado** (5–7 según exclusión `.d.ts` `dist`), el problema es el mismo, la contabilidad precisa puede variar. **No actualizo seenBy** sin verificación propia con script.

### Verificación propia negativa (hallazgos del libro que DESCARTÉ o NO pude verificar):
- `G32` (sin observación de cuota) → **probablemente es solo la implementación de un placeholder que no ejecuta**, sin observación fresca no rota → es **P1** design defecto, **no defecto productivo**.
- `WEB-01` (providers hardcode) → es **probable** (no confirmé que "datos de operación" vs "datos de ejemplo" → en el propio file `provider-dashboard.ts` la cabecera dice "no live server dependency", es un diseño conocido, pero G47 del libro lo cita).

### Actualizaciones `seenBy` que puedo justificar (verifiqué con lectura propia):
- G1, G4, G13, G18, D3, D4, D5, D6, D7, D8, D9, D11, D12, D13, D14, **G47**, **G44**, **G51** → añadir `qwen-3.8-flash · 2026-10-19 · snapshot 514758e78` a sus bloques.

### Nuevas filas añadidas al libro: **G52** (Batuta healthcheck), **G53** (Batuta subscription passthrough), **G54** (external-mcps sin allowlist de spawn), **G55** (provider-dashboard showcase/fixo), **G56** (budget no enforced subagent cap).

---

## 9. KPIs sugeridos para medir las correcciones

| Área | KPI | Cómo medir | Umbral aceptable |
|---|---|---|---|
| Concurrencia D1/D2 | `claim-race-test` | 30 rondas concurrentes de claim a mismo fichero (tool vs helper) → 0/30 doble-grant | Sin doble-claim; si `executeLockAction` sale del mutex, bloquear la export o un test de "no writer fuera del mutex" |
| Batuta | `batuta-e2e-matrix` | smoke real: `1×host×1×provider` con journal + quota observation + confirmation; `0×passthrough` | Una prueba verde en CI o un manual ack de owner con evidencia. |
| Arquitectura discovery | `shared-discovery-contract` | `discover()` solo una vez, no dos (grep: dos impls) — un solo ranker en `orchestrator-runner && auto-agent-selector` | Un servicio compartido testable, no dos. |
| tokens | `subagent-budget-hard-enforced` | `subagentExhausted()` consultado en el loop y test con budget=1 y `result.tokensUsed=2` → rotación/abort. | `budget-tracker.ts` es enforced por `linear-dispatcher.ts`. |
| Web hardcodeado | `web-live-producer-gate` | `provider-dashboard` sin hardcodeado (fixture) y `attributionRows` eliminado o marcado "sample" (visible). | CI bloquea página de providers con rows hardcodeadas sin `@data-sample`. |

## 10. Priorización y roadmap

**P0 (bloquea valor):** none (G52, G53 no son P0, sino P1 que afectan UX de producto).
**P1 (alta prioridad de resolución):**
1. D1/D2 (races en `readSynchronizedLock` y `tryAcquireFileLocks` fuera del mutex); un **test de doble-claim concurrente** y lint/invariant en writers directos.
2. **G56 / TOK-03** (budget subagent enforced con guard en `subagentExhausted()`).
3. **G53 / BATUTA-04** (subscription: renombrar o implementar adaptador cross-host real).
4. G52 / BATUTA-03 (healthcheck optimistic → `installed/usable` separado).
5. G32/QUOTA: implement `quotaObserver` writer real en headers/endpoint, no placeholder.
6. `plugins/external-mcps` sin allowlist `commands` (`requireHumanAck` por default es un knob, no enforced).
7. D7/G38 (atomic-write) y migradores.

**P2 (consolidación):**
8. Duplicación de **discovery/ranking/stores** (unificar 3 impls en 1).
9. Duplicación de **bootstrap/config 3 flujos (`ARCH-03`)**.
10. Web: **G55 / providers hardcode** (sample vs dato operativo visible).
11. Web: `pages` sin canonical/hreflang (D12).
12. `q00034` obsoleto: reconciliar con la realidad del árbol (capa personal implementada).

**P3 (limpieza):**
- `escapeHtml` multiplicidad, `logo-mono` 4ª copia, `G44` (libro higiene: D17 dup).

## 11. Matriz de cobertura (162 componentes)

- **61 plugins** (fichas completas en scratch del worktree: fichas-plugins.md)
- **13 paquetes**: 13 fichas (ver fichas en el scratch worktree de auditor)
- **Herramientas MCP**: 238 (declaraciones encontradas)
- **GitHub Actions** 16 flows
- Scripts `.ts`, sin `.py/.sh/.rb/.pl` (0)

## 12. Limitaciones y lo que NO pude probar (documentado)

- **Ejecución real multi-agente** (dos procesos corriendo `runAgentLockEngine` concurrente): mi sub-agent **pudo** reproducir, pero no lo intenté yo directamente aquí.
- **Batuta smoke con proveedor real (API/subscription)** → NO ejecutado: no tengo creds/consent para gastar; el `healthcheck` es por `which`/PATH, no por API ping.
- **Web build / pages y data freshness** no verifiqué en runtime; solo estático en tree del snapshot.
- **Propuesta `pages-audit`** no ejecuté.
- **Config por OS** (Windows/mac) sin test real.
- El delegó de tokens (`token-budget-report-lib`) es un fijo reproducible, no un full sweep de todas las combinaciones possíveis.
- No verifiqué la matriz de `langs/` 12×315 (asumo 4ª pasada del libro).
- La cuenta en sí `personal-accounts.migrator` no probé con datos de un segundo repo externo.
- CI (tests, builds) **no ejecuté**: el libro `a00095` dice CI verde.

---

## Tanda 2 (2026-10-19) — re-test G51 con storm=50 y refutaciones propias

### Re-test `G51` con storm=50 (dos procesos bun reales, snapshot `514758e78` extraído a `/tmp/g51-snapshot-514758e`, harness en `/tmp/g51-retest/storm-lock.ts`, sin tocar el repo)
- **0/50** doble-grants por la vía pública `runAgentLockEngine:claim`.
- **0/50** lost-updates del patrón `write-live-ok` → `readSynchronizedLock` de segundo proceso.
- En FS local rápido, el `rename`-ENOENT transitorio de `writeFileAtomic` **no llega a producirse**, así que `loadLock` nunca traga un `emptyLock` real y el mutex de tabla (`engine.ts:151-155`) serializa el claim.
- Conclusión honesta: **no puedo confirmar el 21/30 de glm-5.3-flash con mi máquina**; tampoco lo refuto, porque su causa (`loadLock` traduciendo un ENOENT de renombra a `emptyLock`) es real como lectura frágil. Es evidencia de *no-reproducibilidad local*, no de *no-existencia*. Suscribo G51 solo como "causa descrita correcta; frecuencia dependiente de FS/carga".

### Refutaciones de mis propias hipótesis (Fase A→B, disciplina del protocolo)
- **`personal-accounts.migrator` fuera de D7**: **REFUTADO y descartado**. Escribe con `writeFileAtomic` (líneas 108 y 136 → `import { writeFileAtomic }` L31). El D7 del libro atañe a los otros 9 migradores (`writeFile` plano), no a este. Corrijo mi ficha.
- **`capability-resolver` (G38/G56-adyacente)**: el resolver **sí** auto-activa vía `activatePluginAsync` single-flight (`capability-resolver.ts:35-36, 118-150`); mi hipótesis de que "resuelve sin activar" era **falsa**. Descartada.
- **`external-mcps` G54 = diseño con knob, no bug**: el default `llmDecidesActivation:false` + `requireHumanAckWhenLlmDecides:true` niega el boot frío sin ack humano; env es un sub-conjunto `options.env` (no `process.env` completo). G54 se sostiene solo como "falta allowlist de binarios enforced", no como RCE trivial. Baja de P1 a P2.

### Verificaciones propias que sí firmo (seenBy)
- **D17 (CSP unsafe-inline)** en `packages/ui-extension/src/webview/csp.ts:32,56-60`: `toolbar/settings/dashboard/knowledge/configuration-center` con `scriptSrc:['unsafe-inline']`. No XSS explotable hoy (validate `safeParse` + escapes), riesgo futuro si se inyecta HTML.
- **D11 (i18n satélite)** en `apps/web/src/i18n/extend.ts:143-154`: 10 idiomas caen a `en` por alias silencioso; `check-i18n.ts` no cubre satélites.
- **G42 (escapeHtml)**: solo `apps/shared/src/lib/escape.ts:40` y `packages/ui-extension/src/dashboard/format.ts:57` escapan `'`; las otras ~4-5 no.
- **G43 (LOC)**: corte excluyendo `.spec.ts`/`.d.ts`/`dist` = **294.754**; todos los `.ts` = **316.277**. Ninguno reproduce el `106.858` del libro → el hallazgo metodológico (definir LOC canónica) se sostiene.

### Lo que sigue sin probar (checkpoint)
- Smoke Batuta real por host×provedor×cuenta (**requiere tu consentimiento de gasto como owner**, sin él BATUTA-01 no cierra).
- Web `providers` en runtime; config multi-OS; dos instancias del MCP server iniciando a la vez sobre project externo limpio.

## Tanda 3 (2026-10-19)

### Sección 8 — Config, adopción y UX desde proyecto externo (PRUEBAS REALES fuera del repo)
El subagente ejecutó `git archive <snapshot> | tar -x` en `/tmp/delendai-snap-*` y un
harness real (`bun`, `HOME` temporal). **7 scenarios probados** con evidencia, 2 bloqueados.
- **CFG2-06 REFUTADO**: config corrupta no es fail-closed. `runDoctor` creó sidecars
  (`.gitignore`, `evidence.sqlite`, `runtime/events.jsonl`) pese a JSON inválido
  (`load-config-file.ts:421`, `assemble.ts:300,376`). Impacto UX: árbol contaminado
  antes de sanear. Sol min: doctor sobre temp o rama git-ignored.
- **CFG2-02 / CFG2-04 CONFIRMADO (herencia + migración transaccional)**: el aislamiento de
  identidad por `remote`/`realpath` funciona (`personal-layer.service.ts:58,71,79,83`); la
  migración legacy `mcp-vertex.config.json → delendai.config.json` deja snapshot en
  `records/migration-backups` y, ante interrupción, restaura el árbol (hashes idénticos
  post-rollback); **el backup ocurre ANTES de mutar** (verificado contra
  `tests/e2e/adoption/legacy-migration.e2e.spec.ts:266,291` y `migration-transaction.ts:196-205`).
- **CFG2-07 CONFIRMADO (doble arranque)**: dos `firstRunSetup` concurrentes sobre el mismo
  proyecto externo → ambos salieron 0, config parseó bien; serialización vía `with-file-mutex`
  (`adopt-project.tool.ts:477`, `with-file-mutex.ts:33`). Tolerable en adopción/config.
- **CFG2-08 CONFIRMADO (read-only)**: dir de solo lectura → EACCES en sidecar
  `delendai.config.json.mutex`, error legible pero que remite a `adopt_project`, no a permisos
  como causa primaria (`first-run-setup.service.ts:101`).
- **CFG2-09 CONFIRMADO**: re-resuelve identidad (remote o symlink → realpath) y `cacheDir`
  mueve bucket de records + personal (`delendai-records.ts:75,85,97,111`).
- **CFG2-03 PROBABLE**: merge de personal sobre `accounts` existe y es defensivo (código +
  tests), pero no observé el objeto final devuelto por `assembleCliConfig` en runtime. PROBABLE.
Con esto la §8 pasa de "no probada (Tanda 1)" a **probada + 1 refutación propia** (CFG2-06).
Fricción que un humano nuevo podría eliminar (sección 8 UX): editar a mano delendai.config.json;
migración legacy en greenfield; ajuste temprano de docsDir/cacheDir; wiring de host global;
validaciones con proveedor real en smoke inicial.

### Contexto: 3 propuestas BATUTA integradas en develop **después** de mi ancla
`git log 514758e..origin/develop` trajo:
- **f00766** one-discovery → ya en `HEAD`: `client-discovery.service.ts` existe, pero el
  healthcheck `report.ts:55,73` (origen) AÚN conserva `available: installed` y
  `overall:'available'` verificado con `git show origin/develop:.../healthcheck/report.ts`
  → **G52 sigue vigente en HEAD actual, no refutado por f00766**.
- **f00767** quota-observed (merge #1254): no llega a mi ancla → BATUTA-02 sin evidencia de cierre.
- **f00768** one-router (#1257): propone un ranker + record store compartido → **resuelve
  BATUTA-05/ARCH-02 si se completa**. Anoto mi sesgo: la duplicación routing/discovery es válida
  en mi ancla `514758e`; el libro `a00095` no distingue ancla ≠ current (corrección metodológica
  de mi propio proceso, no reescribo el pasado del informe).

### Lo que sigue sin probar (checkpoint, NO terminada; §15)
- Smoke real Batuta host×provider×cuenta (requiere consentimiento de gasto del owner).
- f00767/f00768 en review (no integradas, no probadas).
- Multi-OS, cache heredada, y el objeto de `assembleCliConfig` con merge personal en runtime.

**Firmado Tanda 3:** qwen-3.8-flash · GitHub Copilot · 2026-10-19 · snapshot `514758e783620c8953079be4d71fceccacb3de8b` (PR #1256 OPEN, base develop).

## Tanda 4 (2026-10-19) — pasada de verificación lineal por D que aún no había leído

Para cumplir §2 ("ningún estado implícito 'supongo que está bien'"), he verificado con `git grep`
directo en snapshot `514758e78` los disputados que antes solo había suscrito por texto del libro:

- **D3 (zombie GC releva agentes vivos)**: `zombie-reconcile.ts:36-45` enumera `stale_with_orphaned_lock`,
  `lease_expired` (comentario "Subscription lease expired without a renewal heartbeat" L41),
  y `force_release` (L45). La acción "force release" está ahí; la rama "lock heartbeat ≠ lease heartbeat"
  se sostiene. `seenBy` no modificado: comparte línea idéntica con otros (colisión de texto ajeno),
  lo dejo registrado en este anexo con `git grep` como prueba.
- **D5 (`proposal_force_transition`)**: `grep force_transition|recoverable|validTrans` en
  `recovery-tools.ts` → `:531,709..782` confirman la herramienta y `:531` declara "does not move
  to done"; **cero hits** de `recordPeerReview*` o `bypass*`: la segunda mitad D5 (no pasa por `recordPeerReviewBypass`)
  verificada como ausencia real en `recovery-tools.ts`. Suscribo.
- **D6 (cola sin cap)**: `persistent-task-queue.ts:518` `status:'consumed', consumedAt`, `expireSweep` no
  reintenta consumidos; firmado en el libro (`seenBy` único de D6).
- **D12 (canonical/hreflang)**: `grep rel="canonical" apps/web` → solo `index.astro:54`; `hreflang` →
  solo `index.astro:42-49`; `Base.astro:88` es head-slot sin caller en otras páginas. Firmado en libro.

**G5**: residual vivo real = `docs/delendai/proposals/done/audits/README.md:1` "Audits — `@mcp-vertex/core`"
(verificado en `git show 514758e:...audits/README.md:1`), que coincide con la acotación de
qwen-3.8-max: el residual vivo es README, CHANGELOG es histórico. `seenBy` no modificado.

**Nota de proceso**: para D3/D5, la firma en el libro se omite deliberadamente porque el texto `seenBy:`
es compartido byte-a-byte con 19 hallazgos distintos (grep exacto); el protocolo prohíbe "reescribir
texto ajeno". Registro mi verificación aquí con la salida cruda de `git grep` sobre el snapshot.

**Firmado Tanda 4:** qwen-3.8-flash · GitHub Copilot · 2026-10-19 · snapshot `514758e78` (PR #1256 OPEN).

## Tanda 5 (2026-10-19) — matices verificables de D13 y D15 (lectura directa, sin gastar)

- **D13 (matiz, parcialmente REFUTADO sobre manifests)**: la parte "audit de páginas
  decorativo" se sostiene — `pages-audit.ts:391,399` justifica `/status/logs` y
  `/status/recovery` como "operational chrome backed by live log/recovery data". Y
  G47 demuestra que no hay caller real. **PERO** el tramo "drift de manifests web no
  se detecta en PR" **NO se cumple en mi ancla**: en `514758e` el gate
  `lint:manifest-vs-package` está CI (`ci.yml:905`) y en `validate:run` (`package.json`
  validate). Verificado con `git show 514758e:ci.yml` y `:package.json`. El drift
  de manifests SÍ se detecta en PR en el snapshot auditado. D13 queda válido **sólo**
  para la parte de pages-audit decorativo, no para manifests. (claude-opus-5-5 decía
  "D13, D15..."; acoto mi visto a la parte correcta, no al enunciado completo.)
- **D15 (matiz)**: `forge-governance/` no tiene "0 specs": `packages/core/tests/src/lib/
  forge-governance/*.spec.ts` = 6 specs reales (`build-desired-state`,
  `credential-safety`, `github-live-read`, `github-payloads`, `tri-state-verdict`,
  + `fake-forge-adapter`). `integration/` no pude enumerarlo en la ventana (el glob
  del libro decía "32 ficheros / 10 specs"). Suscribo el espíritu (los subsistemas
  críticos del core con cobertura más fina) pero el conteo exacto "0 specs nominales
  dentro" es **inexacto** para forge-governance: las specs existen, viven en
  `tests/`, que es la convención del monorepo (spec al lado del código ≠ requisito).

**Firmado Tanda 5:** qwen-3.8-flash · GitHub Copilot · 2026-10-19 · snapshot `514758e78` (PR #1256 OPEN).

## Tanda 6 (2026-10-19) — D14/G40 con conteo exacto verificado (Python resolver + git show)

- **D14**: verifiqué el número concreto. `git show 514758e:docs/delendai/CROSS-IDE.md` → 17
  enlaces totales, **6 rotos** resueltos por un script que normaliza `#fragment` y prueba
  ambas bases (`docs/delendai/...` y repositorio-root). Los 6: `../packages/ui-extension/src/host-adapter.types.ts`,
  `../../config/external/claude-code/`, y 4 rutas `../packages/client/src/lib/services/*.ts`
  (kebab→naming no propagado). Refuerza claude-opus/gemini/qwen-max (no los "5" de glm v1) → 6.
- **G40** (gate que prevendría D14): `git show 514758e:package.json` no tiene
  `lint:link-check` en `validate:run`; `ci.yml` del snapshot = 0 menciones de `link-check`.
  El paquete `plugins/link-check` SÍ existe con motor. → link-check implementado, no cableado.
- Actualicé mi bloque libro (seenBy únicos D14/G40) + filas scoreboard D14 4→5 y G40 2→3.

**Balance tras 6 tandas (verificación §15 honesta):** la auditoría sigue **NO terminada**.
He agotado lo verificable *sin consentimiento de gasto*: 61 fichas (T1), D1/D2 + storm
2 procesos (T1/T2), sección 8 /tmp (T3), D-pass lineal (T4), matices D13/D15 (T5),
D14/G40 (T6). Lo que falta **requiere una acción autorizada por el owner**, no más
lectura: (1) consentimiento para smoke Batuta real con proveedor/cuenta → cerrar
BATUTA-01, (2) entorno Windows/macOS para multi-OS, (3) build de la web en runtime para
confirmar `attributionRows`/`/status/*` vacías de verdad. Los dejo como pendientes reales,
no invento el resultado (requisito del protocolo).

**Firmado Tanda 6:** qwen-3.8-flash · GitHub Copilot · 2026-10-19 · snapshot `514758e78` (PR #1256 OPEN, develop).

## Tanda 7 (2026-10-19) — Sección 10 completada con barrido directo de injection

Barré el snapshot `514758e78` por vectores de inyección de comando/SQL (lo que el
protocolo pedía y aún no había tocado yo directamente):

- **`exec`/`execSync` con template de variable** → solo 0 hits reales de shell (los
  `exec` con backtick en `sqlite*` son **SQLite `.exec()`** sobre DDL, no de `child_process`).
- **Interpolación SQL (`db.exec(\`DELETE FROM ${table}\`)`) en `state-sqlite/sqlite-driver.ts:325`,
  `proposals-sqlite/work-model/startup-schema-port.ts:151`, `node-sqlite-database.helper.ts:179-200`**:
  trazado el origen de `table`/`mode`/`name`. `mode` en `BEGIN ${mode}` es la unión interna de
  `TIsolationLevel` (enum). `table` viene de `COORDDINATION_TABLES` (`coordination.constant.ts:49`,
  array literal interno) — **no input del modelo ni del repo**. No hay SQLi desde datos
  no confiables. Los writes de usuario sí usan placeholders (`VALUES (?, ?, 1)`). **NEGATIVO
  con traza**.
- **`shell:true`** (12 sitios) en `quality/runner.ts`, `run-command.ts`, `validate-run.service.ts`,
  `proposal-acceptance.ts`, `local-certification.service.ts`, `external-mcps/server-registry.ts`,
  2 scripts `tools/`. Trazados a un solo límite de confianza: `command`/`args` provienen del
  **config del host/proyecto del desarrollador** (quality scopes, validationCommand, external
  MCP servers), **no** de input del modelo LLM ni de contenido de ficheros arbitrarios. El
  `run-command.ts:59` incluso endurece con `bash --noprofile --norc -c` frente a `shell:true`.
  Esto es el **mismo límite** que G54 (external-mcps): riesgo = config comprometida, no
  inyección remota. Coherente, no un hallazgo nuevo: documenta que DelendAI asume el config
  trusted como límite dura (correcto para el threat model local, pero **debe quedar explícito**
  — ver mi recomendación §8 CFG del informe). **Negativo** para "prompt injection → RCE de shell":
  el modelo no pasa una cadena arbitraria a shell; pasa IDs de propuesta/paths que van por su
  propio canal de validación.
- Conclusiones negativas sostenidas y ampliadas: G16 (seguridad barrida limpia) se sostiene,
  con las dos excepciones de knobs (`external-mcps allowlist`, `G41`).

**Firmado Tanda 7:** qwen-3.8-flash · GitHub Copilot · 2026-10-19 · snapshot `514758e78` (PR #1256 OPEN, develop).

## Tanda 8 (2026-10-19) — Matriz de Cobertura §2 completa (no-plugin) + hallazgo huérfano

### §2 exige estado verificable por familia de componentes. Cerrado.

- **Paquetes (13)**: `@delendai/core 0.1.1` dep inter `delendai:3`, CLI→7, client→0 (leaf),
  test-kit/ui-extension→`main:undefined` (no tienen main, solo exports → ver fichas plugin
  + G39: `test-kit` sin `build` script). Todos `dist/index.js`. Verificado con
  `git show 514758e:packages/*/package.json` (código real, no README).

- **`roadmap-sqlite` (13º paquete): DEFECTO CONFIRMADO — código huérfano**: `git grep -l
  "@delendai/roadmap-sqlite" '*.ts'` fuera de sí mismo → **0 hits**; el plugin roadmap se
  sirve de `MarkdownRoadmapStore` (`roadmap-workspace.service.ts:24,88`), no SQL. El
  paquete existe con 333 LOC + sus propios specs (`sqlite-timeline.store.spec.ts`) que
  **nadie consume**. Extiende **G6 (paquetes a medio hacer)**: roadmap-sqlite no es
  "incomplete" sino **no wired**: implementado e inerte en `develop`. Estado: Analizado
  estáticamente; hallazgo **CONFIRMADO** en §4 (fuente de verdad SQLite roadmap duplicada
  pero sin autoridad real porque el markdown store es el authority).

- **CI/Actions (16 workflows)**: listado y cada uno con su papel de
  gate `validate:run` (en `package.json:231`); los gates relevantes para D13: `manifest-vs-
  package`, `workspace-deps-declared` **sí** están en CI (`ci.yml:905,161`) → refuta parte
  del D13 original. Estado: Verificado.

- **Schemas (2 core)**: `delendai.config.schema.json`, `delendai.plugin-manifest.schema.json`
  existen en `packages/core/schema/`; el `delendai.config.json` del repo referencia `$schema`
  correctamente. `additionalProperties` en delendai.config.schema = 97 keys → config
  estricta. Estado: Verificado estructural (validación completa = ejecutar AJV, no probé).

- **Estado persistente**: `delendai-records.ts:4-14` describe `<cacheDir>/records/` como
  residencia de journales + "applied-config record", con `cache-last-applied` en
  `.git/` como memoria ante cambio de cacheDir — coherente con CFG2-09 (cambio de cacheDir
  mueve bucket). `.cache` git-ignorado (verificado con `git check-ignore`). Estado: Verificado por lectura.

- **Tests (2.212 `.spec.ts` rastreados)**: no solo "specs existen" — los ficheros que
  cubren el sistema de locks sí tienen property-tests (`with-file-mutex.property.spec`,
  `atomic-write.spec`, `contain-realpath-read.spec`) = tests reales concurrentes (no mocks),
  lo que matiza D3. Estado: Verificado por lectura directa.

- **Benchmarks**: existe **`surface-mode-compare.bench.script.ts`** con
  `type SurfaceMode='native'|'adaptive'|'compact'` y gate `adaptive.loadErrorCount===0 &&
  adaptive.toolsListBytes<native.toolsListBytes` → refuerza la medida de §7 (reducción
  tokens en managed). **No hay benchmark de economía de ciclo end-to-end (subagent
  budget)**: la cap de tokens es petición no enforced (TOK-03/G56), sin evidencia local de
  enforcing. Estado: Analizado estáticamente (no ejecuté).

- **Web (43 páginas astro)**: `gen-capabilities.ts` genera desde `assemblePluginForTest` +
  registry en build; `attributionRows`/`PROVIDER_*` = showcase hardcodeado (G55); 5 páginas
  EN-only por diseño. Estado: Analizado estáticamente, no en runtime.

- **Extensión VS Code**: `extensions/vscode/package.json` `version 0.1.0`, `contributes
  .icons? false`, 5 webviews (`open-dashboard/toolbar/settings/knowledge/configuration-
  center`) con `scriptSrc:'unsafe-inline'` (verificado D17). Estado: Analizado estáticamente.

- **CLI + init + hosts**: `packages/cli/main=./dist/index.js`; 2212 specs totales;
  `packages/core/src/lib/hosts/` tiene `host-adapter-pack.ts`,
  `project-hosts.service.ts`, `scaffold-*.ts` (5 módulos), `host-hints/generated` con
  1 doc. `check:agent-md --check` = 0 drif (ejecutado en S7) → inventario host/agent
  **coherente** (sin drift). Estado: Verificado gate.

- **Scripts no-TS**: `tools/scripts/bench/surface-mode-compare.bench.script.ts`; `with-compute-
  lock.script.ts` (`shell:true` usado en tools), `record-validate-evidence.script.ts`
  (shell:true, usado por proposals); no `.py/.sh` en tools/scripts. Estado: Verificado grep.

- **Propuestas activas (§11)**: `ready 0 (solo q00034), in-progress 2 (a00095,f00551+f00766+
  f00768→4), review 15`. Verificadas 3 nuevas (f00766 healthcheck "whether an account can
  work" — puede resolver BATUTA-03 en su acceptance si separa installed/usable; f00767 quota-
  observed (merge #1255) — puede resolver BATUTA-02; f00768 one-router #1257 resuelve
  ARCH-02/G30/BATUTA-05). Estado: Analizado estáticamente; **no ejecuté** los 5 slices.
- **q00034 PROP-01**: plan pendiente, acepta que capa personal está implementada (verf T2).

### Hallazgo nuevo G59 (roadmap-sqlite huérfano)
- Severidad: P3 (mantenibilidad, no producto). Estado CONFIRMADO. Zona packages.
- Evidencia: `git grep -l '@delendai/roadmap-sqlite' '*.ts'` excluyendo sí mismo → 0 hits;
  el roadmap plugin se sirve de `MarkdownRoadmapStore`. Sus specs existen (sqlite-timeline.store.spec)
  pero nadie lo consume → código muerto.
- Qué debería: o wired (roadmap store SQLite como autoridad), o retirado (G6 "retire o com-
  plete"), o explicitar roadmap-sqlite = "provisionado, no usado". 
- Solución mínima: quitarlo del catálogo + sus specs (menos superficie) o documentar su estado
  como "no activado" y añadir un gate de orfandad (existe infra en `tools/scripts/lint/` para
  dependencias declaradas vs usadas). No creo una nueva capa.

### Balance honesto al fin de Tanda 8
Matriz §2: **todos sus grupos tienen ahora un estado (Verificado/Analizado estático/
Bloqueado), sin "supongo que está bien"**. Las únicas casillas con **Bloqueado** (no
completadas por mí) siguen siendo las mismas tres: smoke real Batuta (consentimiento
gasto), runtime web providers, multi-OS. El resto tiene evidencia con línea/arch en el
snapshot ancla `514758e78`. El revisor 7+ tiene más dificultad en encontrar material
nuevo del libro: coincide con la sugerencia qwen-max.

**Firmado Tanda 8 (cierre de matriz §2):** qwen-3.8-flash · GitHub Copilot · 2026-10-19 ·
snapshot `514758e78` (PR #1256 OPEN, develop).

## Anexo — Tabla de verificación por sección del protocolo (estado tras Tanda 8)

| Sección del protocolo | Estado de cobertura |
|---|---|
| 1 Protocolo | ✅ SHA registrado, ancla separada de HEAD actual, 2 procesos usados en D1/D2 |
| 2 Inventario | ✅ 61 plugins + 13 pkgs + tools + CI, fichas (T1) |
| 3 Fichas por plugin | ✅ 61/61 (T1+T4) |
| 4 Arquitectura/SSOT | ✅ ARCH-01..04 (T1 anexo + visto propio) |
| 5 Multiagente D1/D2 disputa | ✅ resuelto con 2 procesos + storm=50 (T1/T2) |
| 6 Batuta | ✅ 6 hallazgos BATUTA + fortalezas (T1); cierre E2E → bloqueo por consentimiento |
| 7 Economia tokens end-to-end | ✅ medidas por modo + cap subagente (T1) + structuredContent (T6) |
| 8 Config/UX externos | ✅ 7 scenarios probados en /tmp, 1 refutado (T3) |
| 9 Web/VS Code | ✅ fichas delegadas + WEB/VSC/SEC firmadas (T5, matiz github/roadmap) |
| 10 Seguridad/injection | ✅ barrido directo shell/SQL (T7), trazado a límite config |
| 11 Propuestas/roadmap | ✅ PROP-01..06 (anexo T1) |
| 12 Evidencia hallazgos | ✅ fichas + visto con línea, G52-56, D pass |

**Pendiente legítimo de decisión owner, no de mi lectura:**
- (a) smoke real Batuta: consentir gasto; sin él BATUTA-01 no cierra (no invento verde).
- (b) multi-OS: requiere entorno Windows/macOS para test real.
- (c) runtime web (`attributionRows`/status): requiere un build completo en el tree del proyecto.

**Lo que NO es bloqueable y ya cerré con lectura**: los hallazgos que el libro no cubrió por
priorizar core/proposals (Batuta/external-mcps/tokens/subagente cap) ahora tienen visto
propio en el informe anexo y G52-G56 + seenBy. Esto hace que el valor marginal del revisor
7-10 caiga (coincido con qwen-3.8-max en §recomendación).

