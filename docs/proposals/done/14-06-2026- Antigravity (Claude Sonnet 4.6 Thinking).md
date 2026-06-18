# 🔍 Auditoría Exhaustiva — `mcp-vertex` y Plugins

> **Fecha**: 14 jun 2026 | **Revisor**: Antigravity (Claude Sonnet 4.6 Thinking)
> **Metodología**: Lectura completa del código fuente, contratos, lógica de engines, configuración, tests y documentación.

---

## 📊 Resumen Ejecutivo

El proyecto es **arquitectónicamente sólido y conceptualmente avanzado**. El diseño plugin-first, model-agnostic y low-token es correcto y bien ejecutado. Hay áreas con código de clase mundial, pero también zonas con deuda técnica puntual y algunos riesgos de bloqueo que merecen atención.

---

## 🔴 FATAL — Errores críticos o de diseño que deben corregirse

### 1. `syncProposalRegistry` usa `process.cwd()` como default
**Fichero**: [`sync-proposal-registry.ts#L309`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L309)

```typescript
export async function syncProposalRegistry(
    root: string = process.cwd()  // ← FATAL: viola la regla de oro
```

Esta es **la violación más grave** del proyecto. La regla de oro explicitada en la doc, en el `PLUGINS-MCP-VERTEX.md` ("Never use `process.cwd()`") y en el `IMcpPluginContext` ("Never call `process.cwd()` outside the CLI entry") es quebrada aquí directamente dentro de un engine. El `root` debería ser un parámetro **requerido** sin valor por defecto, o el caller debería proveerlo siempre.

**Impacto**: Si algún tool llama a `syncProposalRegistry()` sin argumento en un contexto donde `process.cwd()` no coincide con el workspace, produce resultados silenciosamente incorrectos.

### 2. `agent-lock-engine.ts` usa `resolveWorkspacePath` como fallback hardcoded
**Fichero**: [`agent-lock-engine.ts#L60`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/locks/agent-lock-engine.ts#L60)

```typescript
const getLockPath = (deps: IAgentLockDeps = {}): string =>
    deps.lockPath ?? resolveWorkspacePath(DEFAULT_PATH_LAYOUT.lockFile);
```

El `resolveWorkspacePath` es un fallback que presumiblemente también usa `process.cwd()` (o algo análogo). Según el contrato del framework, **el lock path debe venir siempre del host** a través del `ctx.workspace`. Que exista un fallback a una resolución de ruta "mágica" es un vector de bug silencioso.

### 3. `constants/` directory está **vacío**
**Directorio**: [`packages/core/src/lib/contracts/constants/`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/contracts/constants)

El directorio existe pero está completamente vacío. Las constantes que debería contener (según el patrón de los plugins, que sí tienen `default-path-layout.constant.ts`) están sueltas en otros lugares. **Dead structure** que genera ruido y confusión.

---

## 🟠 MUY MAL — Problemas serios que degradan la calidad

### 4. Escritura NO atómica en `syncProposalRegistry`
**Fichero**: [`sync-proposal-registry.ts#L347`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L347)

```typescript
await writeFile(indexPath, nextText, 'utf8');  // ← no atómico
```

A diferencia de `persistQueue` (que usa `tmp + rename` correctamente), `syncProposalRegistry` escribe directamente. Si dos agentes sincronizan simultáneamente, el index puede quedar corrupto o truncado. Debería usar el mismo patrón `tmp + rename` que ya existe.

### 5. Inconsistencia en el schema de `ILockEntry` — dos formatos en producción
**Ficheros**: [`agent-lock-engine.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/locks/agent-lock-engine.ts) vs [`persistent-task-queue.ts#L748`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts#L748-L765)

El engine de locks escribe `ownership` + `started_at` + `last_seen`, pero el `LockEntrySchema` en `persistent-task-queue.ts` tiene que hacer un `.transform()` para normalizar también `files` y `claimed_at` del formato histórico. Esto indica que hubo una migración de schema que **no se completó limpiamente**. El comentario "T1/T2 fixtures used `files` + `claimed_at`" confirma deuda técnica presente.

### 6. `IProposalTrack` con valores de dominio específicos del host
**Fichero**: [`proposal-parallelism.ts#L33`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-parallelism.ts#L33)

```typescript
export type IProposalTrack =
    | 'bootstrap' | 'scaffold' | 'engine' | 'editor'
    | 'ui-demo' | 'game-demo' | 'meta' | 'audit'
    | 'audit-meta' | 'retired';
```

Estos tracks (`'ui-demo'`, `'game-demo'`, `'scaffold'`) son **vocabulario específico del host original** (el proyecto Cartago), no vocabulario genérico de framework. Un usuario externo que quiera usar el plugin `proposals` tiene que adoptar estos tracks o el parallelism engine los rechazará. Esto rompe la premisa de "project-agnostic".

### 7. `scanLiveProposalEntries` en `round-context.ts` tiene un `TODO` hardcodeado
**Fichero**: [`round-context.ts#L347`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/round-context.ts#L347)

```typescript
// TODO: the paused-demos subfolder is host folder policy;
// inject it via IProposalStoreConfig.folders when tools migrate.
join(monorepoRoot, DEFAULT_PATH_LAYOUT.proposalsDir, 'paused/demos'),
```

Hay un TODO que explica que una ruta hardcodeada (`paused/demos`) es política del host, no del framework, y que debería ser inyectable. Este TODO lleva tiempo sin resolverse y es un leak de acoplamiento al host.

### 8. `recommend-plan.ts` y `build-blueprint.ts` — inferencias sobre "stack preferido"
Estos ficheros generan recomendaciones con sesgos hacia Bun/TypeScript que pueden resultar incorrectos para proyectos Python/Go/Rust donde el analyzer devuelve `language: 'python'` etc. El blueprint generado asume herramientas del ecosistema JS sin bifurcar lo suficiente para otros stacks.

---

## 🟡 REGULAR — Funciona pero mejorable

### 9. `coreToolRegistrations` retorna siempre array vacío
**Fichero**: [`create-mcp-server.ts#L23`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/server/create-mcp-server.ts#L23-L27)

```typescript
export function coreToolRegistrations(
    _config: IMcpVertexHostConfig
): readonly IToolRegistration[] {
    return [];  // ← perpetually empty
}
```

El comentario dice "Empty until the tool engines migrate from the host project". Esta función lleva siendo un placeholder desde el inicio. O debe rellenarse o debe eliminarse — su presencia genera confusión sobre si hay algo "core" que se registra aparte de los plugins.

### 10. El `--check`/`--doctor` duplica lógica de `assembleCliConfig`
**Fichero**: [`assemble.ts#L245`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/cli/assemble.ts#L245-L275)

`runDoctor` llama internamente a `assembleCliConfig` (que ya carga todos los plugins) y encima re-lee el config file por separado para el `diagnoseConfigFile`. Esto significa que en modo `--check` se carga todo dos veces. Podría restructurarse para que `assembleCliConfig` devuelva también el diagnóstico.

### 11. Mezcla de estilo `async/await` y sync FS en el mismo módulo
**Fichero**: [`persistent-task-queue.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts)

```typescript
import { existsSync, readFileSync } from 'node:fs';   // sync
import { readFile, rename, writeFile } from 'node:fs/promises';  // async
```

`parseQueue` usa `readFileSync` para leer `closedTasks` dentro de una función async. No es un bug per se, pero en un módulo de operaciones I/O heavy, mezclar sync/async es inconsistente y puede crear problemas de rendimiento bajo carga.

### 12. `joinRel` duplicado en tres plugins
La función `joinRel` está copiada literalmente en:
- `packages/core/src/lib/cli/assemble.ts`
- `plugins/rules/src/index.ts`
- `plugins/memory/src/index.ts`

Debería estar en el `public/index.ts` del core como utilidad compartida.

### 13. `scaffold-host.ts` tiene hardcoded `MiniMax-M3 (customendpoint)`
**Fichero**: [`scaffold-host.ts#L182`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/scaffold-host.ts#L182)

```typescript
const model = options.defaultModel ?? 'MiniMax-M3 (customendpoint)';
```

Este es un modelo específico del ecosistema del desarrollador original que no tiene sentido para usuarios externos. Debería ser `'<your-model>'` o similar.

### 14. Tests: cobertura desconocida y estructura mínima
El directorio `tests/` existe con estructura `src/lib/{bootstrap,cli,plugins,scaffold,server,workspace}` pero no se ha podido verificar qué % de cobertura hay ni si los tests más críticos (especialmente del swarm y el lock engine) están cubiertos. Para `persistent-task-queue.ts` (833 líneas de lógica crítica), la ausencia de evidencia de cobertura es preocupante.

---

## 🟢 COMO DEBE ESTAR — Correcto y funcional

### 15. `planRegistrationOrder` es determinístico y falla rápido
**Fichero**: [`create-mcp-server.ts#L37`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/server/create-mcp-server.ts#L37-L77)

Excelente implementación: detecta IDs duplicados, anchors desconocidos, y la inserción ordenada es correcta. El uso de `throw` en lugar de silenciar errores es la decisión correcta.

### 16. `loadPlugins` es resiliente y no bloquea el boot
**Fichero**: [`load-plugins.ts#L76`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts#L76-L135)

El manejo de errores es correcto: cada plugin fallido se reporta en `errors` pero **no aborta** el resto. La resolución de especificadores en cascada (`@cartago-git/mcp-X` → `mcp-X` → `X`) es pragmática. La inyección del `importer` para testing es un buen seam.

### 17. `analyzeProject` es pura, inyectable y no lanza excepciones
**Fichero**: [`analyze-project.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/bootstrap/analyze-project.ts)

Diseño impecable: la interfaz `IFileReader` como seam, sin I/O directo, sin efectos secundarios, sin throws. Degradación graceful a `'unknown'/'generic'`. Detección de CI, agente configs, monorepo tools y MCP evidence es completa.

### 18. `persistQueue` usa write atómico (tmp + rename)
**Fichero**: [`persistent-task-queue.ts#L386`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts#L386-L397)

```typescript
const tmpPath = join(tmpdir(), `mcp-queue-${Date.now()}-${Math.random()...}.json`);
await writeFile(tmpPath, content, 'utf8');
await rename(tmpPath, absolutePath);
```

Correcto. La escritura atómica vía `rename` garantiza que lectores concurrentes nunca vean un JSON parcial. Debería aplicarse también a `syncProposalRegistry` (issue #4).

### 19. El `IMcpPluginContext` está bien diseñado y es completo
**Fichero**: [`plugin-contract.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/plugin-contract.ts)

El contrato es limpio: `workspace`, `corePaths`, `pluginCacheDir`, `pluginDocsDir`, `namespacePrefix`, `options`, `args`. La regla "no `process.cwd()`" es correcta y está documentada. El `optionsSchema` con `safeParse` es una decisión elegante (permite zod sin forzar la versión).

### 20. El schema de `tsconfig.base.json` es muy estricto y eso es bueno
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noImplicitOverride`… Es un tsconfig de alta calidad que previene bugclasses enteros. El TypeScript 6.x como versión objetivo es adelantado pero coherente con Bun.

---

## ✅ BIEN — Por encima de lo esperado

### 21. El backpressure system del task queue es sofisticado
**Fichero**: [`persistent-task-queue.ts#L608`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts#L608-L695)

El `reportBackpressure` calcula: queueLength, counts por estado, oldest age, **waiterOrphans** (tareas bloqueadas cuyo liberador ya no existe), y **releaseSignalBacklog** (tareas bloqueadas cuyos ficheros ya están libres). Los thresholds `green/amber/red` son accionables para un modelo. Esto es nivel producción.

### 22. El sistema de zombie detection y GC es elegante
**Fichero**: [`zombie-reconcile.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/zombie-reconcile.ts)

La clasificación de zombies en `cooldown_null`, `stale_no_lock`, `stale_with_orphaned_lock` con acciones recomendadas (`force_release`, `extend_cooldown`, `escalate`) y thresholds `green/yellow/red` es un sistema anti-deadlock bien pensado. El `dryRun` mode es profesional.

### 23. `continuity-enforcer.ts` previene loops activamente
**Fichero**: [`continuity-enforcer.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/continuity-enforcer.ts)

El downgrade a `mode: 'reset'` cuando hay violaciones `block` es el mecanismo correcto para salir de loops de sesión. El `ORCHESTRATOR_DEFAULT_POLICY` hardcodeado con valores concretos (`maxSubagentSpawnsPerSession: 2`, `maxToolRetriesPerTool: 3`) da un piso de seguridad sensato.

### 24. El `overview` tool como punto de entrada de baja latencia
La arquitectura de `mcpvertex_overview` como primer tool obligatorio, que devuelve el mapa completo del servidor (plugins, tools, knowledge, next action) en un solo round-trip, es exactamente lo correcto para minimizar tokens. Un agente nuevo paga UNA llamada para orientarse.

### 25. `--check`/`--doctor` mode sin arrancar el servidor
La separación entre diagnosticar y arrancar es una feature de operaciones realmente útil. `bunx @cartago-git/mcp-vertex --plugins=proposals --check` da un JSON estructurado con errores, counts y paths sin levantar el transport. Permite CI validation del setup MCP.

---

## 🌟 MUY BIEN — Excelente ejecución

### 26. `proposal-parallelism.ts` — lógica pairwise O(n²) correcta y deduplicada
**Fichero**: [`proposal-parallelism.ts#L122`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-parallelism.ts#L122-L212)

La evaluación pairwise con deduplicación de violaciones (skip si uno de los buckets ya reportó violación), la exención del lane `audit` como carve-out, y la separación `block`/`warn` son correctas. El sort determinístico de `conflictingProposals` evita ruido en comparaciones.

### 27. `round-context.ts` — digest con hashing SHA-256 truncado e invalidación inteligente
El sistema de fingerprinting SHA-256 (8 bytes, prefijo `rh-`) para detectar cambios en core docs sin releer ficheros completos es una optimización excelente de tokens. El `isDigestStale` compara tanto hashes de docs como estado de fuentes (age, fingerprint, temporallyStale). Muy sofisticado.

### 28. Dual import surface (`/public` + `/lib/*`) bien planteada
La distinción entre `@cartago-git/mcp-vertex/public` (API estable) y `@cartago-git/mcp-vertex/lib/*` (acceso deep) es la arquitectura correcta para una librería que también es CLI. Permite usar el 80% sin comprometerse con internos, y el 20% de casos avanzados tienen el escape hatch.

---

## 💎 PERFECTO — Referencia de la que enorgullecerse

### 29. El contrato de plugin como función pura + `definePlugin` helper
`IMcpPlugin.register(ctx)` retorna `IMcpPluginRegistrations | Promise<IMcpPluginRegistrations>`. No tiene side effects durante el registro, no accede a globals, recibe todo en `ctx`. El `definePlugin` helper es un identity function que solo existe para type inference — esto es TypeScript idiomático de alta calidad.

### 30. `evaluateParallelism` — función pura con output determinístico
```typescript
export const evaluateParallelism = (
    actives: readonly IProposalParallelism[]
): IParallelismResult => { ... }
```
Sin I/O, sin estado, sin side effects. Testeable en aislamiento. Las violaciones se ordenan (blocks primero, luego warns, luego localeCompare) para output estable. Este es el patrón ideal para lógica de motor.

### 31. `parseQueue` — validación en capas con error codes semánticos
La secuencia de validación es ejemplar:
1. JSON parse → `PARSE_ERROR`
2. Zod schema → `INVALID_TASK_QUEUE` / `INVALID_PRIORITY`
3. Duplicate ID check → `DUPLICATE_TASK_ID`
4. waitFor files on disk → `WAIT_FOR_FILE_MISSING`
5. observe targets in closedTasks → `OBSERVE_TARGET_UNKNOWN`
6. Temporal consistency → `TEMPORAL_INCONSISTENCY`

Cada capa tiene su error code semántico, lo que permite al agente saber exactamente qué falló y qué acción tomar.

### 32. La documentación técnica de `round-context.ts` es excepcional
El header de 25 líneas explica el algoritmo de hashing (SHA-256 truncado a 8 bytes, por qué, compatibilidad Bun/Node, diferencia con `rapidhash`, implicaciones de staleness al recomputar). Es la documentación de librería seria que raramente se ve en proyectos de este tipo.

---

## 🔮 ANÁLISIS: Eficiencia de Tokens para Agentes

| Mecanismo | Impacto en tokens |
|---|---|
| `overview` tool como cold-start | ✅ **Excelente** — 1 call orienta al agente completo |
| Knowledge lazy (load on demand) | ✅ **Excelente** — el agente paga solo lo que lee |
| Outputs JSON estructurado (no prosa) | ✅ **Excelente** — sin necesidad de parseo semántico |
| `roundContext` digest con hashes | ✅ **Excelente** — evita re-reads de docs no modificados |
| `recommendations.nextAction` en overview | ✅ **Bien** — guía directa al agente |
| `backpressure` report en task queue | ✅ **Bien** — evita polling ciego |
| `IProposalTrack` cerrado (dominio host) | ⚠️ **Problema** — fuerza vocabulario al agente |
| `suggest` en scaffold output | ⚠️ **Mejora posible** — podría reducir más el output |
| `signals[]` en análisis de proyecto | ✅ **Bien** — contexto pre-digerido para el modelo |

**Conclusión de eficiencia**: Para el caso de uso central (agente con proposals + rules + memory), el gasto de tokens está bien controlado. El design pattern de "llama `overview` primero, luego `knowledge` solo si necesitas detalle" es correcto y el mecanismo de digest evita re-reads costosos.

---

## 🔄 ANÁLISIS: Posibles Bucles y Bloqueos

### Bucles identificados y sus mitigaciones:

| Escenario | Riesgo | Mitigación existente | Completa? |
|---|---|---|---|
| Agente reclama lock que ya tiene | Refresh silencioso sin bloqueo | ✅ `existing.last_seen` update | ✅ |
| Lock stale de agente muerto | Deadlock potencial | ✅ GC por `stale_after_minutes` + `gc` action | ✅ |
| Zombie subagent en registry | Recursos perdidos | ✅ `zombie-reconcile.ts` | ✅ |
| Loop de sesión (demasiadas tools) | Gasto infinito de tokens | ✅ `continuity-enforcer.ts` downgrade a `reset` | ✅ |
| waitFor apunta a releasedBy que ya no existe | Waiter bloqueado para siempre | ✅ `waiterOrphans` en backpressure | ⚠️ Solo detecta, no resuelve automáticamente |
| Dos agentes sincronizan el index al mismo tiempo | Corrupción del index.json | ❌ Sin escritura atómica | ❌ **No mitigado** |
| Agente consume tarea sin hacer release del lock | Tarea consumida, lock activo | ⚠️ GC por timeout, pero ventana amplia | ⚠️ Parcial |
| `observe` target nunca se cierra | Observador bloqueado indefinidamente | ✅ TTL `expiresAt` + `expireSweep` | ✅ |

**Principal riesgo de bloqueo**: La combinación de `waitFor` con `releasedBy` ya muerto (`waiterOrphans`) es detectada pero no resuelta automáticamente. El agente necesita leer el backpressure report y actuar, lo que introduce un paso manual.

---

## 🛠️ ANÁLISIS: Skills/Herramientas/Agentes Faltantes

### Skills ausentes que serían valiosas:

1. **`mcp-notification` plugin** — no hay mecanismo para que el servidor notifique activamente al agente (MCP soporta `notifications/message`). Útil para avisar cuando un lock es liberado.

2. **`mcp-search` plugin** — búsqueda semántica o textual sobre el contenido del workspace, proposals, y knowledge. Actualmente el agente tiene que leer ficheros manualmente.

3. **`mcp-version` plugin** — control de versiones de las propias configuraciones y proposals. Historial de cambios en el estado del sistema.

4. **Plugin `proposals` carece de herramienta de auditoría de health** — no hay un tool equivalente al `--check` de la CLI que un agente pueda llamar para verificar que el estado (locks, queue, registry) es consistente en runtime sin salir del servidor.

5. **Herramienta `proposals_repair`** — cuando se detectan `waiterOrphans` o inconsistencias, debería existir una herramienta de auto-reparación en lugar de solo reportar.

6. **Skill para el securecoder plugin**: el securecoder no tiene skill de "post-fix verification workflow" integrada con el proposals workflow. Si un agente arregla una vulnerability detectada por el scanner debería poder crear una proposal y ejecutarla en el contexto de mcp-vertex.

### Sobre el plugin Securecoder externo:

**Positivo**:
- Tiene una estructura de skills bien pensada (threat model → scanner → implementation plan → poc → report)
- La separación en 8 skills especializadas con nombres descriptivos es correcta
- `scan_dependencies` como gate obligatorio antes de importar es excelente práctica

**Negativo/Mejoras**:
- No tiene integración con el `proposals` plugin — un fix de seguridad debería poder crear una proposal directamente
- El skill `mandatory-secure-web-skills` está marcado como "CRITICAL: MUST use" pero es muy amplio para ser cargado en cada generación de código
- No hay skill para "remediation tracking" — cuando se fija una vulnerabilidad, no hay forma de registrar qué se hizo en el `memory` plugin

---

## 📋 ANÁLISIS: El Plugin `proposals` — Complejidad vs. Necesidad

El plugin `proposals` es el más complejo del repo (~25 ficheros, ~120KB de código). La pregunta legítima es: ¿está justificada esa complejidad?

**Sí, está justificada porque**:
- Resuelve un problema genuinamente difícil: coordinación de múltiples agentes sin un servidor central
- Usa ficheros como sustrato de estado (correcto para sistemas distribuidos livianos)
- Cada componente tiene responsabilidad clara y testeable

**Pero hay complejidad accidental**:
- El `round-context.ts` (875 líneas) mezcla: leer estado, computar hashes, detectar staleness, inferir resume hints y escribir digest. Podría dividirse en 3-4 ficheros
- La presencia de TODO comments indica que la extracción del host original no está completa

---

## 📝 RECOMENDACIONES PRIORITARIAS

| Prioridad | Acción | Fichero |
|---|---|---|
| 🔴 P0 | Eliminar `process.cwd()` default de `syncProposalRegistry` | `sync-proposal-registry.ts` |
| 🔴 P0 | Hacer escritura atómica en `syncProposalRegistry` | `sync-proposal-registry.ts` |
| 🔴 P0 | Eliminar fallback `resolveWorkspacePath` del lock engine | `agent-lock-engine.ts` |
| 🟠 P1 | Hacer `IProposalTrack` extensible por el host | `proposal-parallelism.ts` |
| 🟠 P1 | Resolver TODO de `paused/demos` en `round-context.ts` | `round-context.ts` |
| 🟠 P1 | Migrar schema de lock a un único formato (eliminar compat layer) | `persistent-task-queue.ts` |
| 🟡 P2 | Mover `joinRel` al `public/index.ts` del core | múltiples ficheros |
| 🟡 P2 | Cambiar el modelo default en `scaffold-host.ts` | `scaffold-host.ts` |
| 🟡 P2 | Eliminar o rellenar `coreToolRegistrations` | `create-mcp-server.ts` |
| 🟡 P2 | Añadir tool `proposals_health_check` al plugin | nuevo fichero |
| 🟢 P3 | Dividir `round-context.ts` (875 líneas) en módulos más pequeños | `round-context.ts` |
| 🟢 P3 | Añadir auto-resolución de `waiterOrphans` | `task-queue-engine.ts` |
| 🟢 P3 | Integrar securecoder con el proposals workflow | nuevo skill |

---

## 🎯 Valoración Global

| Dimensión | Puntuación | Comentario |
|---|---|---|
| **Arquitectura** | 9/10 | Plugin-first, model-agnostic, bien separado |
| **Contratos e interfaces** | 9/10 | Limpios, documentados, bien tipados |
| **Eficiencia de tokens** | 8/10 | Muy bien, con mejoras posibles en discovery |
| **Anti-deadlock** | 7/10 | Buena cobertura, falta auto-reparación |
| **Código fuente (calidad media)** | 7/10 | Alto nivel, con deuda técnica puntual |
| **Documentación** | 8/10 | Excelente en ficheros clave, irregular en otros |
| **Tests** | ?/10 | Estructura presente, cobertura no verificable |
| **Seguridad operacional** | 7/10 | Escritura no atómica en sync es un riesgo real |
| **Genericidad (project-agnostic)** | 6/10 | Penalizado por tracks del host y process.cwd() |

**Nota final: 8/10 — Proyecto de alta calidad con deuda técnica puntual pero solucionable.**

---

## 🚀 ¿Qué faltaría para llegar al 10/10?

No son cambios menores — son los que transformarían este proyecto de "muy bueno" a **referencia de la industria para frameworks MCP**. Agrupados por bloque:

### 1. Cierre de la deuda técnica existente (los P0/P1 del plan)

Sin esto el potencial queda hipotecado. Concretamente:

- **Eliminar todos los `process.cwd()`** de los engines (sync-proposal-registry, lock engine). Mientras exista uno solo, la garantía de "project-agnostic" es mentira.
- **Escritura atómica en `syncProposalRegistry`**. El patrón `tmp + rename` ya existe en `persistQueue` — aplicarlo aquí es cuestión de minutos, pero hasta que no se haga el sistema no es seguro bajo concurrencia real.
- **Migración de schema de lock a formato único**. Eliminar el compat layer `files`/`claimed_at` → `ownership`/`started_at`. Los sistemas de producción no deberían tener capas de compatibilidad con formatos "históricos" de hace meses.
- **`IProposalTrack` extensible por el host**. Cambiar el closed union a un string abierto con validation opt-in, o permitir que el host inyecte su propio set de tracks en el contexto del plugin. Sin esto, cualquier usuario externo tiene que adoptar el vocabulario de Cartago.

### 2. Cobertura de tests verificable y suficiente

Actualmente la estructura de tests existe pero la cobertura es una caja negra. Para ser 10/10:

- **Coverage mínimo del 85%** en los engines críticos: `persistent-task-queue`, `agent-lock-engine`, `round-context`, `continuity-enforcer`, `evaluateParallelism`.
- **Tests de concurrencia** para los ficheros compartidos (lock.json, queue.json, index.json). Simular dos agentes escribiendo simultáneamente y verificar que no hay corrupción.
- **Tests de integración** end-to-end que arranquen un servidor MCP real con plugins y validen el flujo `overview → auto_work → claim → sync → release`.
- **Mutation testing** o al menos property-based tests para `parseQueue` (los 6 niveles de validación merecen fuzzing).

### 3. Auto-reparación de estados inconsistentes

El sistema actual **detecta** problemas pero no los **resuelve**:

- `waiterOrphans` — detectados por `backpressure`, pero el agente tiene que leer el report y actuar manualmente. Debería existir un `proposals_repair` tool que, dado un backpressure report con `waiterOrphans > 0`, los resuelva de forma segura y atómica.
- **Lock claim sin release posterior** — el GC existe pero la ventana es `stale_after_minutes` (10 min por defecto). Debería haber un evento de "lease heartbeat" que los agentes activos refresquen periódicamente, reduciendo la ventana de locks fantasma.
- **Index corrupto** — si `index.json` queda corrupto (ej. por un kill en medio de un write), no hay ningún mecanismo de recovery. `syncProposalRegistry` debería detectar un JSON malformado previo y emitir una advertencia estructurada antes de sobreescribir.

### 4. Genericidad real (desacoplar del host Cartago completamente)

El proyecto dice ser "project-agnostic" pero hay residuos del host original por limpiar:

- **`paused/demos` subtree hardcodeado** en `round-context.ts` y `sync-proposal-registry.ts`. La estructura de carpetas del store de proposals debería ser 100% configurable por el host.
- **Modelo de agente hardcoded** (`MiniMax-M3 (customendpoint)`) en el scaffolder. Debería ser `'<provider>/<model>'` o similar.
- **`AGENT_SLOTS`** en `persistent-task-queue.ts` (`orchestrator`, `proposal_guardian`, `implementation_runner`, etc.) — son roles del host original, no del framework. El framework debería permitir slots arbitrarios definidos por el host.
- **El `coreToolRegistrations` vacío** debería eliminarse o rellenarse. Su presencia crea una expectativa falsa de que el core registra tools propias aparte de los plugins.

### 5. Observabilidad y debugging para operadores

Un 10/10 es también operable en producción:

- **Telemetría opcional** — un mecanismo (sin romper el model-agnostic) para que el host emita eventos de ciclo de vida (plugin loaded, tool called, lock claimed/released). No tiene que ser OTEL, puede ser un simple array de `IStatusCollector` (la interfaz ya existe en `IMcpVertexHostConfig` pero no tiene implementación concreta).
- **`--verbose` flag** — actualmente los errores van a stderr de forma básica. Un modo verbose con timestamps, plugin lifecycle y tool call log sería invaluable para debugging.
- **`proposals_health_check` tool** — que en runtime valide la coherencia del estado (locks activos vs. registry vs. queue) y devuelva un reporte estructurado, equivalente al `--check` de la CLI pero consultable desde el propio servidor sin reiniciarlo.

### 6. Publicación y ecosistema

El proyecto es privado/monorepo ahora, pero para ser referencia necesita:

- **Changelogs semánticos** — actualmente todos los paquetes están en `0.1.0` sin historial. Un sistema de versionado (changesets, conventional commits) haría las actualizaciones trazables.
- **Documentación de API pública generada** — los tipos de `public/index.ts` merecen una doc site (TypeDoc o similar) para que usuarios externos sepan qué es estable.
- **Al menos 2-3 plugins de ejemplo publicados** por la comunidad — el verdadero test de un framework plugin-based es que terceros puedan extenderlo sin fricción. Un `plugin-template` de referencia con CI preconfigurado sería el empujón.

---

### Tabla de cierre: de 8/10 a 10/10

| Bloque | Esfuerzo estimado | Impacto en nota |
|---|---|---|
| Cerrar deuda técnica P0/P1 | ~2-3 días | +0.5 pts |
| Tests con cobertura verificable | ~1-2 semanas | +0.5 pts |
| Auto-reparación de estados | ~3-5 días | +0.3 pts |
| Genericidad total (desacoplar host) | ~3-5 días | +0.4 pts |
| Observabilidad operacional | ~1 semana | +0.2 pts |
| Ecosistema y publicación | ongoing | +0.1 pts |

> En resumen: los 2 puntos que faltan son **todos alcanzables** — no requieren rediseño arquitectónico, sino completar lo que ya está empezado. La base es tan sólida que llegar al 10/10 es cuestión de disciplina de ingeniería, no de inspiración.

---

*Auditoría generada el 14/06/2026 mediante análisis estático completo del código fuente.*
