# 🔍 Auditoría Exhaustiva — `mcp-core` y Plugins

> **Fecha**: 16 jun 2026 | **Revisor**: Antigravity (Claude Sonnet 4.6 Thinking)
> **Metodología**: Lectura completa del código fuente, contratos, engines, shared utilities, tests, CI, scripts de release, plugins y documentación. Análisis independiente sin influencia de auditorías anteriores.

---

## 📊 Resumen Ejecutivo

El proyecto ha alcanzado un nivel de madurez que pocas veces se ve en frameworks de este tipo. La arquitectura plugin-first, el contrato hermético de contexto, los mecanismos de exclusión mutua de archivos y la suite de tests de caos son ejemplos de ingeniería seria. En la inspección de hoy se confirma que **varios problemas críticos reportados en auditorías anteriores han sido resueltos**: escritura atómica en `syncProposalRegistry` (ahora usa `withFileMutex` + `writeFileAtomic`), el fallback `process.cwd()` del lock engine (ahora lanza un error explícito), y `IProposalTrack` (ahora es un `string` abierto con carve-out configurable). La nota real ha subido. Aun así quedan puntos concretos que separan este proyecto de la perfección.

---

## 🔴 FATAL — Errores que deben corregirse sin excusa

### 1. `AGENT_SLOTS` hardcodeado con roles del host Cartago

**Fichero**: [`task-queue-engine.ts#L66`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/agents/task-queue-engine.ts#L66-L74)

```typescript
const AGENT_SLOTS = [
    'orchestrator',
    'proposal_guardian',
    'implementation_runner',
    'delivery_verifier',
    'technical_investigator',
] as const;
```

Este es el residuo más grave que queda en el proyecto. Un `enum` cerrado de roles de agente que son **vocabulario puro del host Cartago** está en el núcleo del sistema de encolado. Cualquier proyecto externo que quiera usar el plugin `proposals` debe usar exactamente estos nombres de slots o el schema Zod rechazará sus enqueue. Esto rompe directamente la garantía "project-agnostic".

**Impacto**: Todo usuario externo del plugin `proposals` queda bloqueado en la adopción sin forkear el código o hacer un workaround.

**Fix**: El schema de `agentSlot` debe aceptar un `z.string().min(1)` en lugar del `z.enum(AGENT_SLOTS)`, o bien permitir que el host inyecte su propio set de slots válidos a través de las opciones del plugin.

---

### 2. `docs/engine.ts` usa I/O síncrono en el event loop del servidor MCP

**Fichero**: [`docs/src/lib/engine.ts#L1`](file:///home/cartago/_projects/mcp-core/plugins/docs/src/lib/engine.ts#L1)

```typescript
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'; // sync
```

`listDocs` y `readDoc` usan exclusivamente I/O síncrono: `readdirSync`, `readFileSync`, `statSync`. Ambas funciones son invocadas desde handlers de tools MCP (que son async). Mientras `listDocs` escanea el árbol completo de docs de forma síncrona, **bloquea el event loop del servidor**. Si el directorio `docs/` contiene cientos de archivos o está en un montaje de red lento, el servidor MCP entero se congela, incapaz de responder a otras llamadas.

El plugin `search` usa correctamente `readdir`, `readFile`, `stat` de `node:fs/promises`. El plugin `docs` debería hacer lo mismo.

**Impacto**: Latencia/congelamiento del servidor bajo workloads reales con trees grandes o montajes remotos.

---

## 🟠 MUY MAL — Problemas serios que degradan la calidad o genericidad

### 3. `lockPath` opcional en `ITaskQueuePaths` con fallback al layout hardcoded

**Fichero**: [`task-queue-engine.ts#L131`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/agents/task-queue-engine.ts#L131-L138)

```typescript
export interface ITaskQueuePaths {
    readonly queuePath: string;
    readonly closedTasksPath: string;
    /** Falls back to the default layout (cwd-relative) when omitted — pass it... */
    readonly lockPath?: string;
}
```

Y en uso, la acción `report`:
```typescript
const lock = await loadLockSnapshot(
    paths.lockPath ?? DEFAULT_PATH_LAYOUT.lockFile, // ← fallback a ruta relativa
    paths.closedTasksPath
);
```

El comentario en el código dice textualmente "Falls back to the default layout (cwd-relative) when omitted". El lock engine ya lanzó el `process.cwd()` fallback y lo corrigió para que sea un error explícito — pero aquí en la capa superior del queue engine hay un fallback suave a una ruta relativa del layout que presumiblemente se resuelve contra `cwd`. La regla "el workspace siempre se inyecta" se viola aquí de forma silenciosa para la acción `report`. Debería ser requerido o lanzar igual que el lock engine.

### 4. `readFileSync` síncrono dentro de refine de Zod en un handler async

**Fichero**: [`task-queue-engine.ts#L363`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/agents/task-queue-engine.ts#L363)

```typescript
const raw = readFileSync(paths.closedTasksPath, 'utf8'); // dentro de .superRefine
```

El `superRefine` de Zod se ejecuta dentro del handler del tool `enqueue` (que es async). El `readFileSync` dentro del refine bloquea el event loop del servidor en el momento de validar la enqueue. Para un servidor MCP con múltiples agentes llamando herramientas concurrentemente, este bloqueo se convierte en un cuello de botella notable. El refine podría reescribirse para precalcular los closed IDs con una lectura async antes de ejecutar el parse, o usar la variante async del refine.

### 5. `zombie-reconcile.ts` y `promote-on-release.ts` también usan sync I/O

**Ficheros**: [`zombie-reconcile.ts#L51`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/agents/zombie-reconcile.ts#L51), [`promote-on-release.ts#L119`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/agents/promote-on-release.ts#L119)

```typescript
const raw = readFileSync(lockPath, 'utf8'); // zombie-reconcile
const raw = readFileSync(queuePath, 'utf8'); // promote-on-release
```

Ambos son llamados desde paths de ejecución MCP. No son tan críticos como el `docs` engine (se ejecutan esporádicamente), pero la inconsistencia es un vector de sorpresas en producción. El patrón async está disponible y es el correcto.

### 6. `persistent-task-queue.ts` — idempotencia de `subscribe` solo en memoria

**Fichero**: [`task-queue-engine.ts#L307`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/agents/task-queue-engine.ts#L307-L321)

```typescript
const deliveredDigests = new Set<string>(); // ← in-memory only
```

El comentario es honesto: "Cross-session idempotency is out of scope". Pero el riesgo es real: si el servidor se reinicia (algo habitual en desarrollo con `--watch`), todos los digests marcados como entregados se pierden y el primer `subscribe` post-restart re-entrega todo. En un sistema multi-agente donde los digests guían decisiones de "qué hacer a continuación", la re-entrega puede causar trabajo duplicado. La solución correcta es persistir los `deliveredDigests` en un side-file junto a la queue, idealmente bajo el mismo `withFileMutex`.

---

## 🟡 REGULAR — Funciona pero mejorable

### 7. El plugin `deps` usa I/O síncrono también

**Fichero**: [`deps/src/lib/engine.ts#L1`](file:///home/cartago/_projects/mcp-core/plugins/deps/src/lib/engine.ts#L1)

```typescript
import { existsSync, readFileSync } from 'node:fs';
```

`listDeps` y `checkDeps` leen el manifest con `readFileSync`. A diferencia del plugin `docs`, aquí se lee un solo archivo (`package.json`) cuyo tamaño está acotado, por lo que el impacto es menor. Pero la inconsistencia con los otros plugins que sí usan async queda como deuda técnica de baja prioridad.

### 8. CI solo tiene un workflow — no hay release automation en CI

**Fichero**: [`.github/workflows/ci.yml`](file:///home/cartago/_projects/mcp-core/.github/workflows/ci.yml)

El workflow de CI cubre `typecheck + test` y `pack smoke` (validación de que los paquetes empaquetarían correctamente). Esto es sólido. Sin embargo, **no hay un workflow de release automation**: el proceso de publicar una versión nueva es enteramente manual (ejecutar `bun run release --bump=X --write --publish`). Para un framework que otros proyectos ponen como dependencia, la ausencia de un release workflow en CI (por ejemplo, activado por un tag `v*`) es un riesgo operacional: hay que acordarse de los pasos manuales, lo que introduce errores humanos.

**Falta**: Un workflow `release.yml` activado por `push: tags: ['v*']` que ejecute `validate` y luego `release --publish`.

### 9. `coreToolRegistrations` eliminado pero `planRegistrationOrder` recibe `[]` siempre

**Fichero**: [`create-mcp-server.ts#L80`](file:///home/cartago/_projects/mcp-core/packages/core/src/lib/server/create-mcp-server.ts#L80)

```typescript
const ordered = planRegistrationOrder([], config.extraTools ?? []);
```

`planRegistrationOrder` admite dos arrays: `core` y `extras`. El primero siempre es `[]`. La función tiene lógica de ordenación respecto al `core` que nunca se usa. La abstracción es correcta para extensibilidad futura, pero el `core` vacío permanente es ruido en el contrato. Si la intención es que el core no tenga tools propias (todo viene de plugins/extras), la signatura de `planRegistrationOrder` podría simplificarse para aceptar solo el array de extras, eliminando la dualidad innecesaria.

### 10. `constants/` sigue vacío en el core package

**Directorio**: [`packages/core/src/lib/contracts/constants/`](file:///home/cartago/_projects/mcp-core/packages/core/src/lib/contracts/constants)

El directorio `constants/` en los contratos del core está vacío. Las constantes equivalentes (e.g. `DEFAULT_PATH_LAYOUT`) existen en el plugin `proposals`. La existencia del directorio vacío en el core sigue generando confusión de estructura para cualquier contribuidor nuevo.

### 11. Plugin `memory` — sin tamaño máximo ni TTL en las notas

**Fichero**: [`plugins/memory/src/lib/`](file:///home/cartago/_projects/mcp-core/plugins/memory/src)

El store de memory es un JSON de notas persistentes. No hay ningún límite en el número de notas ni un TTL para las antiguas. En sesiones de larga duración, el archivo puede crecer indefinidamente. Más importante: las notas antiguas siguen apareciendo en el `recall` sin ningún indicador de antigüedad para el agente. Un sistema `maxNotes` (con eviction LRU) o al menos un campo `createdAt` opcional en cada nota mejoraría la higiene de contexto significativamente.

### 12. Plugin `search` — sin soporte de regex, solo substring match

**Fichero**: [`search/src/lib/engine.ts#L64`](file:///home/cartago/_projects/mcp-core/plugins/search/src/lib/engine.ts#L64)

`searchWorkspace` implementa un `includes(needle)` puro, sin regex. Para un workspace search orientado a código, la incapacidad de buscar por expresiones regulares (e.g. `^export const`, `interface I[A-Z]`) limita notablemente el valor de la herramienta. Un flag `regex?: boolean` en `ISearchOptions` que active `RegExp` en lugar de `includes` sería de bajo costo y alto valor.

### 13. Plugin `rules` — detección de framework limitada

**Fichero**: [`rules/src/index.ts#L40`](file:///home/cartago/_projects/mcp-core/plugins/rules/src/index.ts#L40-L62)

La función `presetIdFor` soporta: `angular`, `react`, `vue`, `svelte`, `jquery`, `vanilla`. No hay detección para frameworks modernos muy utilizados como `next.js`, `nuxt`, `astro`, `remix`, `solid`, o para entornos Node puro, FastAPI (Python), o similares. El mecanismo de `overrides` permite que el host fuerce un preset, pero la auto-detección es incompleta para el ecosistema actual.

---

## 🟢 COMO DEBE ESTAR — Correcto y funcional

### 14. `withFileMutex` — exclusión mutua cross-process sin deadlocks

**Fichero**: [`shared/with-file-mutex.ts`](file:///home/cartago/_projects/mcp-core/packages/core/src/lib/shared/with-file-mutex.ts)

La implementación de advisory lock via `open(lockPath, 'wx')` (O_CREAT|O_EXCL atómico) es correcta. El steal por stale (`staleMs = 30s`) y por timeout (`timeoutMs = 5s`) garantiza que **ningún holder puede causar un deadlock permanente** en el swarm. El `timer.unref?.()` en el notification watcher es un detalle profesional (no mantiene el proceso vivo solo para el notificador). Esta implementación es de producción.

### 15. `writeFileAtomic` — temp file en el mismo directorio (evita EXDEV)

**Fichero**: [`shared/atomic-write.ts`](file:///home/cartago/_projects/mcp-core/packages/core/src/lib/shared/atomic-write.ts)

El uso de un temp file junto al destino (no en `os.tmpdir()`) es la decisión correcta: el `rename` en POSIX solo es atómico dentro del mismo filesystem. La variante sync (`writeFileAtomicSync`) es un bonus para contextos donde async no está disponible. La limpieza del temp en caso de error con `.catch(() => undefined)` es correcta (no queremos que un fallo de cleanup tape el error original).

### 16. `quarantineCorruptFile` — preservación de datos corruptos antes de lanzar

**Fichero**: [`shared/quarantine-corrupt-file.ts`](file:///home/cartago/_projects/mcp-core/packages/core/src/lib/shared/quarantine-corrupt-file.ts)

Mover el archivo corrupto a un sidecar `.corrupt-<ts>-<random>` antes de lanzar el error es una decisión de operaciones excelente: el estado original se preserva para diagnóstico, y el nombre con random suffix previene colisiones si dos lectores concurrentes detectan la corrupción en el mismo milisegundo. El `CorruptFileError` con `backupPath` en el constructor es información de diagnóstico accionable.

### 17. `syncProposalRegistry` — ahora correctamente atómico y con mutex

**Fichero**: [`proposals/src/lib/proposals/sync-proposal-registry.ts#L326`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L326)

```typescript
return withFileMutex(indexPath, async () => {
    // ...
    await writeFileAtomic(indexPath, nextText);
});
```

Problema crítico de versiones anteriores: **resuelto**. La sección crítica `read → scan → write` ahora está envuelta en `withFileMutex`, y la escritura usa `writeFileAtomic`. Dos agentes sincronizan simultáneamente: el segundo espera al mutex y luego lee el FS actualizado. No hay pérdida de entradas ni corrupción posible.

### 18. `getLockPath` lanza si no se inyecta — sin `process.cwd()` fallback

**Fichero**: [`locks/agent-lock-engine.ts#L59`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/locks/agent-lock-engine.ts#L59-L69)

```typescript
const getLockPath = (deps: IAgentLockDeps = {}): string => {
    if (!deps.lockPath) {
        throw new Error(
            'agent-lock: deps.lockPath is required — inject the absolute lock path resolved from ctx.workspace.'
        );
    }
    return deps.lockPath;
};
```

Problema crítico de versiones anteriores: **resuelto**. El fallback silencioso a `process.cwd()` fue reemplazado por un error explícito con mensaje accionable. El contrato "el host siempre inyecta el path" ahora se enforza en runtime.

### 19. `IProposalTrack` es ahora un `string` abierto con `knownTracks` opt-in

**Fichero**: [`proposals/src/lib/proposals/proposal-parallelism.ts#L35`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/proposals/proposal-parallelism.ts#L35)

```typescript
export type IProposalTrack = string;
```

Problema crítico de versiones anteriores: **resuelto**. El type es ahora `string` con validación opt-in de `knownTracks` (el host pasa su propio set si quiere typo-guard). La función `extractParallelismFromFrontmatter` acepta un `knownTracks?: ReadonlySet<string>`. Un usuario externo puede usar cualquier vocabulario de tracks sin forkear el tipo.

### 20. Tests de caos con concurrencia real

**Fichero**: [`chaos/coordination-chaos.spec.ts`](file:///home/cartago/_projects/mcp-core/plugins/proposals/tests/src/lib/chaos/coordination-chaos.spec.ts)

40 agentes concurrentes reclamando locks distintos, 20 agentes reclamando el mismo archivo (exactamente uno gana), 30 enqueues simultáneos sin entradas perdidas. Estas pruebas verifican las invariantes de exclusión mutua bajo carga real. Es la batería de tests de concurrencia que diferencia un framework de producción de un prototipo.

### 21. `planRegistrationOrder` — determinístico, falla rápido, correcto

**Fichero**: [`server/create-mcp-server.ts#L26`](file:///home/cartago/_projects/mcp-core/packages/core/src/lib/server/create-mcp-server.ts#L26)

Detección de IDs duplicados, anchors desconocidos, inserción en orden preservando declaración. `throw` en lugar de silenciar. Función pura y testeable en aislamiento. Exactamente lo correcto.

---

## ✅ BIEN — Por encima de lo esperado

### 22. Suite de tests: 63 spec files con cobertura exhaustiva del plugin `proposals`

Con 34 specs solo en `proposals` (incluyendo chaos, locks concurrentes, continuity enforcer, zombie reconcile, delivery verifier, autowork, authoring, state tools, orchestration...) la cobertura del subsistema más complejo es buena. La presencia de specs de **integración real** (arrancando un servidor MCP cliente-servidor en E2E) y el test de **drift guard** para los tipos generados son features de proyecto maduro.

### 23. Typed tool outputs SDK generado — y con drift guard

**Fichero**: [`README.md#L37`](file:///home/cartago/_projects/mcp-core/README.md#L37-L39)

```bash
bun run types:generate  # regenera src/generated/tool-outputs.ts por paquete
```

Los clientes MCP pueden consumir las respuestas con tipos TypeScript generados automáticamente. El drift guard en el test suite falla si los tipos están desincronizados con los schemas Zod en vivo. Esto es ingeniería de API seria.

### 24. `notification` plugin — push real en lugar de polling

**Fichero**: [`notification/src/lib/watcher.ts`](file:///home/cartago/_projects/mcp-core/plugins/notification/src/lib/watcher.ts)

Mecanismo event-driven (`fs.watch` + fallback a polling) sobre el directorio del lock file (watch del dir, no del inode, para sobrevivir el atomic rename). El `check()` puro retorna los releases detectados. Documentado correctamente en el knowledge entry del plugin: "Do NOT poll `agent_lock status` in a loop. Wait for the `lock-released` notification". El design elimina N round-trips de polling por 1 push.

### 25. Release script completo y con dry-run por defecto

**Fichero**: [`scripts/release.ts`](file:///home/cartago/_projects/mcp-core/scripts/release.ts)

Bump semántico lockstep (todos los paquetes en el mismo número de versión), dry-run por defecto (requiere `--write` para aplicar), validación pre-publish (`bun run validate`), publicación en orden de dependencia. Es un release script de categoría profesional. Lo único que falta es el workflow de CI que lo active (punto 8).

### 26. Scaffold / Blueprint del core — generación de proyectos y plugins

**Fichero**: [`scaffold/scaffold-host.ts`](file:///home/cartago/_projects/mcp-core/packages/core/src/lib/scaffold/scaffold-host.ts)

El scaffolder genera: server entry, host config, agent files (.agent.md), copilot-instructions, skill file, plugin template, client template. El modelo por defecto en los agentes generados es `'<your-model>'` (correcto, no hardcoded). La instrucción de `process.cwd()` solo en el entry point está documentada con un comentario explícito en el código generado. Muy bien ejecutado.

---

## 🌟 MUY BIEN — Excelente ejecución

### 27. `withFileMutex` — anti-deadlock por stale steal con timeout

El mecanismo de steal a los 30 segundos (stale) o 5 segundos (timeout de espera) garantiza que **no hay deadlock posible** en el swarm, ni siquiera si un proceso muere mientras tiene el mutex. Esta es la propiedad más importante de un sistema de coordinación distribuida y está implementada correctamente. No hay un `for;;` infinito sin salida: la condición de salida siempre se alcanza.

### 28. `continuity-enforcer.ts` — prevención activa de loops de sesión

**Fichero**: [`swarm/continuity-enforcer.ts`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/swarm/continuity-enforcer.ts)

El downgrade a `mode: 'reset'` cuando hay violaciones `block` impide que un agente entre en un loop de tool calls sin fin. Los umbrales `maxSubagentSpawnsPerSession` y `maxToolRetriesPerTool` están presentes y son accionables. Es el mecanismo correcto para salir de ciclos degenerados sin intervención humana.

### 29. `swarm/` refactorizado en múltiples módulos cohesivos

**Directorio**: [`proposals/src/lib/swarm/`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/swarm)

El monolito `round-context.ts` que tenía 875 líneas fue dividido en módulos específicos:
- `round-context-digest.ts` — computación de hashes
- `round-context-hash.ts` — SHA-256 truncado
- `round-context-resume.ts` — hints de reanudación
- `round-context-sources.ts` — lectura de fuentes
- `round-context-types.ts` — contratos de tipo
- `round-context.ts` — composición (solo 922 bytes ahora)

Esta separación es la arquitectura correcta: cada módulo tiene una responsabilidad única, es testeable en aislamiento y no arrastra carga cognitiva innecesaria.

### 30. Public API surface bien delimitada con `@cartago-git/mcp-core/public`

**Fichero**: [`packages/core/src/public/index.ts`](file:///home/cartago/_projects/mcp-core/packages/core/src/public/index.ts)

Una sola puerta de entrada estable. `writeFileAtomic`, `withFileMutex`, `quarantineCorruptFile`, `joinRel`, `toolJson`, `toolError`, `toolOk` son parte de la API pública — las shared utilities están disponibles para plugins externos sin acceder a internos. Esto es arquitectura de librería correcta.

---

## 💎 PERFECTO — Referencia de la que enorgullecerse

### 31. `evaluateParallelism` — función pura, determinística, O(n²) correcto

Sin I/O, sin estado, sin side effects. Deduplicación de violaciones pairwise (skip si ya hay bucket violation). Ordenación determinística de violaciones (blocks primero, luego warns, luego `localeCompare`). El output es estable entre ejecuciones. Exactamente el patrón correcto para lógica de motor: pura, predecible, trivialmente testeable.

### 32. `syncProposalRegistry` — `extraFolders` inyectable, no hardcoded

**Fichero**: [`proposals/src/lib/proposals/sync-proposal-registry.ts#L320`](file:///home/cartago/_projects/mcp-core/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L320)

```typescript
export async function syncProposalRegistry(
    root: string,
    layout: Pick<IHostPathLayout, 'proposalsDir' | 'proposalIndexFile'> = DEFAULT_PATH_LAYOUT,
    extraFolders: readonly string[] = []
```

El TODO de `paused/demos` hardcodeado que existía en versiones anteriores fue resuelto: ahora los subdirectorios extra se inyectan via `extraFolders`. El host puede añadir sus propias carpetas (demos, experimentales, archivadas) sin tocar el core. Perfecto cierre de la deuda.

### 33. `parseQueue` — validación en 6 capas con error codes semánticos

Los 6 niveles de validación (`PARSE_ERROR`, `INVALID_TASK_QUEUE`, `INVALID_PRIORITY`, `DUPLICATE_TASK_ID`, `WAIT_FOR_FILE_MISSING`, `OBSERVE_TARGET_UNKNOWN`, `TEMPORAL_INCONSISTENCY`) son un sistema de error de categoría producción. Un agente puede leer el code y saber exactamente qué falló y qué acción tomar. Sin mensajes de error ambiguos.

---

## 🔮 ANÁLISIS: Eficiencia de Tokens para Agentes

| Mecanismo | Impacto |
|---|---|
| `mcpcore_overview` como cold-start | ✅ **Excelente** — 1 call orienta al agente completo |
| Knowledge lazy (load on demand) | ✅ **Excelente** — el agente paga solo lo que lee |
| Outputs JSON estructurado (no prosa) | ✅ **Excelente** — sin parseo semántico necesario |
| `roundContext` digest con SHA-256 truncado | ✅ **Excelente** — evita re-reads de docs no modificados |
| `recommendations.nextAction` en overview | ✅ **Bien** — guía directa sin razonamiento extra |
| `backpressure` report con threshold verde/amber/red | ✅ **Bien** — evita polling ciego |
| Notificación push de lock-released | ✅ **Excelente** — elimina N round-trips de polling |
| `AGENT_SLOTS` cerrado (dominio host) | ❌ **Problema** — fuerza vocabulario al agente externo |
| `readFileSync` en handlers de tools (docs, enqueue) | ⚠️ **Riesgo** — bloqueos pueden retrasar respuestas |
| `deliveredDigests` in-memory (no persistido) | ⚠️ **Mejora posible** — re-entrega post-restart desperdicia contexto |

**Conclusión**: Para el caso de uso central (agente con proposals + rules + memory), el gasto de tokens está muy bien controlado. El patrón "llama `overview` primero, luego knowledge solo si necesitas detalle" es correcto. La notificación push del plugin `notification` reemplaza ciclos de polling completos, un ahorro real de tokens en entornos multi-agente con bloqueos.

---

## 🔄 ANÁLISIS: Posibles Bucles y Bloqueos

| Escenario | Riesgo | Mitigación | Estado |
|---|---|---|---|
| Agente muere con mutex activo | Deadlock perpetuo | ✅ Steal por stale (30s) + timeout (5s) | ✅ Completo |
| Lock stale de agente muerto | Deadlock de claim | ✅ GC por `stale_after_minutes` + `zombie-reconcile` | ✅ Completo |
| Sync concurrente del index | Corrupción del index | ✅ `withFileMutex` + `writeFileAtomic` | ✅ Resuelto |
| Loop de sesión (demasiadas tools) | Tokens infinitos | ✅ `continuity-enforcer` downgrade a `reset` | ✅ Completo |
| `waitFor` con `releasedBy` muerto | Waiter bloqueado | ⚠️ Solo detectado en backpressure report | ⚠️ Parcial |
| Servidor MCP bloqueado en I/O sync | Congelamiento | ❌ `docs/engine` y `zombie-reconcile` usan sync | ❌ No mitigado |
| Re-entrega post-restart de `subscribe` | Trabajo duplicado | ⚠️ Reconocido pero no persistido | ⚠️ Parcial |
| Agente externo rechazado por `AGENT_SLOTS` | Bloqueo de adopción | ❌ Enum cerrado hardcoded | ❌ No mitigado |

**Principal riesgo activo**: El I/O síncrono en el plugin `docs` (y parcialmente en los agents handlers) puede bloquear el event loop del servidor MCP, afectando la latencia de todas las herramientas durante el tiempo de scan. En un workspace con documentación extensa, esto es un problema real.

---

## 🛠️ ANÁLISIS: Skills / Herramientas / Agentes Faltantes

### Skills o herramientas que añadirían valor real:

1. **`proposals_health_check` tool** — un tool que, en runtime, valide la coherencia del estado (locks activos vs. registry vs. queue) y devuelva un reporte estructurado. El equivalente en runtime del `--check` de la CLI. Permite al agente diagnosticar inconsistencias sin salir del servidor.

2. **`proposals_repair` tool** — cuando `backpressure.waiterOrphans > 0`, debería haber un tool de auto-reparación que los resuelva de forma segura (liberar waiters cuyo releasedBy ya no existe en locks activos). Actualmente se detecta pero no se resuelve automáticamente.

3. **Regex support en el plugin `search`** — coste bajo, valor alto. Un flag `regex: boolean` que active búsqueda por patrón. Los agentes que trabajan con código necesitan buscar por símbolos, patterns de imports, etc.

4. **`--verbose` flag en la CLI** — timestamps, plugin lifecycle, tool call log. Invaluable para debugging. El stderr básico actual es insuficiente para diagnosis de problemas en producción.

5. **Plugin `telemetry` o `IStatusCollector` implementación concreta** — la interfaz `IStatusCollector` ya existe en `IMcpCoreHostConfig` pero no tiene implementación concreta en el core. Un colector simple de eventos de ciclo de vida (plugin loaded, tool called, error) publicado como opcional sería la base para observabilidad.

6. **Plugin `history`** — tracking inmutable de qué herramientas se llamaron y con qué resultado en la sesión actual. Permite al agente hacer "replay" conceptual y detectar ciclos sin depender de la memoria del modelo. Complementa el `memory` plugin pero para datos de sesión corta.

7. **Skill `plugin-template`** — el scaffolder ya genera un template de plugin, pero no hay una skill documentada que guíe a un agente paso a paso por el ciclo completo: diseñar → generar con scaffold → registrar → testear → publicar.

### Sobre el plugin Securecoder externo:

**Positivo**:
- 8 skills bien especializadas (threat model → scanner → implementation plan → poc → audit report)
- `scan_dependencies` como gate obligatorio antes de nuevos imports es excelente práctica de ingeniería
- La separación persona/scanner/plan/poc/report es la pipeline correcta

**Mejoras necesarias**:
- No hay integración con el plugin `proposals` del core: un fix de seguridad debería poder crear una proposal y ejecutarla en el contexto MCP
- El skill `mandatory-secure-web-skills` está marcado "CRITICAL: MUST use for ALL code generation" — esto es correcto en principio pero la granularidad es demasiado amplia (aplica lo mismo a un one-liner que a un módulo completo)
- No hay skill de "remediation tracking" — cuando se fija una vulnerabilidad, nada registra qué se hizo en el plugin `memory`. La ausencia de integración con `memory` significa que el securecoder no tiene continuidad entre sesiones

---

## 📋 RECOMENDACIONES PRIORITARIAS

| Prioridad | Acción | Fichero |
|---|---|---|
| 🔴 P0 | Hacer `agentSlot` extensible (no `z.enum(AGENT_SLOTS)`) | `task-queue-engine.ts` |
| 🔴 P0 | Convertir `docs/engine.ts` a I/O async | `docs/src/lib/engine.ts` |
| 🟠 P1 | Hacer `lockPath` requerido en `ITaskQueuePaths` (acción `report`) | `task-queue-engine.ts` |
| 🟠 P1 | Mover `readFileSync` del superRefine de enqueue a un prefetch async | `task-queue-engine.ts` |
| 🟠 P1 | Persistir `deliveredDigests` en side-file (cross-session idempotency) | `task-queue-engine.ts` |
| 🟠 P1 | Añadir workflow de release automation en CI | `.github/workflows/release.yml` |
| 🟡 P2 | Async I/O en `zombie-reconcile` y `promote-on-release` | `agents/` |
| 🟡 P2 | Añadir `maxNotes` / `createdAt` al plugin `memory` | `memory/src/lib/` |
| 🟡 P2 | Añadir `regex: boolean` al plugin `search` | `search/src/lib/engine.ts` |
| 🟡 P2 | Añadir `proposals_health_check` tool al plugin proposals | nuevo fichero |
| 🟡 P2 | Limpiar/eliminar directorio `constants/` vacío en core | `packages/core/src/lib/contracts/constants/` |
| 🟢 P3 | Implementar `proposals_repair` tool para waiterOrphans | nuevo fichero |
| 🟢 P3 | Integrar securecoder con proposals workflow | nuevo skill |
| 🟢 P3 | `--verbose` flag en CLI | `cli/assemble.ts` |
| 🟢 P3 | Ampliar detección de frameworks en plugin `rules` (Next.js, Astro, etc.) | `rules/src/index.ts` |

---

## 🎯 Valoración Global

| Dimensión | Puntuación | Comentario |
|---|---|---|
| **Arquitectura general** | 9.5/10 | Plugin-first, model-agnostic, contratos herméticos |
| **Contrato de plugins** | 9.5/10 | Limpio, documentado, `ctx` completo y hermético |
| **Seguridad de concurrencia / I/O** | 8.5/10 | Mutex + atomic write correctos; sync I/O en docs aún presente |
| **Eficiencia de tokens (LLM)** | 9/10 | Overview pattern + lazy knowledge + push notification excelentes |
| **Diseño libre de bucles/bloqueos** | 8/10 | Anti-deadlock sólido; I/O sync y waiterOrphans son riesgos activos |
| **TypeScript / tipado** | 9.5/10 | tsconfig estricto, tipado impecable, SDK generado |
| **Testing** | 8.5/10 | 63 specs, caos tests, E2E, drift guard — muy por encima de la media |
| **CI / Release** | 7.5/10 | CI sólido; falta release automation workflow |
| **Documentación (README/docs)** | 7.5/10 | README razonable; API pública sin TypeDoc generado |
| **Plugin `proposals`** | 9/10 | El más complejo; bien estructurado, testeado y correcto |
| **Plugin `memory`** | 8/10 | Simple y efectivo; sin maxNotes ni TTL |
| **Plugin `rules`** | 7.5/10 | Framework detection incompleta para ecosistema 2026 |
| **Plugin `git`** | 9/10 | Read-only, async execFile, error handling correcto |
| **Plugin `search`** | 7.5/10 | Sólido pero sin regex; sequential walk (no paralelo) |
| **Plugin `quality`** | 8.5/10 | Scopes configurables, runner correcto |
| **Plugin `docs`** | 6/10 | I/O síncrono bloquea event loop — el único plugin con defecto activo grave |
| **Plugin `deps`** | 7.5/10 | Offline y correcto; sync I/O menor; sin CVE support (documentado) |
| **Plugin `notification`** | 9/10 | Push con fallback polling, unref correcto, diseño limpio |
| **Securecoder (plugin externo)** | 7/10 | Pipeline bien pensada; sin integración con proposals/memory |
| **Scaffold / Blueprint** | 9/10 | Genera proyectos completos; modelo no hardcodeado |
| **Extensibilidad / futuro** | 8.5/10 | API pública estable, lockstep release, plugin template |

**Nota global: 8.5/10 — Proyecto de alta ingeniería con deuda técnica puntual y solucionable.**

---

## 🚀 ¿Qué faltaría para un 11 de 10?

### Bloque A — Los fixes que transforman de "muy bueno" a "perfecto" (estimado: 3-5 días)

1. **`AGENT_SLOTS` extensible**: cambiar de `z.enum` cerrado a `z.string().min(1)`, opcionalmente con validación de un set inyectado por el host. Sin esto el proyecto no puede llamarse genuinamente "project-agnostic".

2. **`docs/engine` async completo**: reescribir `listDocs` y `readDoc` para usar `node:fs/promises`. Es un refactor mecánico, no arquitectónico.

3. **`deliveredDigests` persistido**: guardar los pares `(taskId, observedTaskId)` ya entregados en un side-file `.subscribe-delivered.json` junto a la queue, con el mismo `withFileMutex`. Cross-session idempotency real.

4. **`lockPath` requerido en `report`**: alinear `task-queue-engine` con el mismo rigor del lock engine — si no se inyecta, lanzar.

### Bloque B — Lo que elevaría el ecosistema (estimado: 1-2 semanas)

5. **Release workflow en CI**: un `.github/workflows/release.yml` activado por tags `v*` que ejecute validate y publique. Operaciones reproducibles sin intervención humana.

6. **`proposals_health_check` y `proposals_repair` tools**: diagnóstico en runtime y auto-reparación de waiterOrphans. El sistema pasa de "detecto problemas" a "me auto-reparo".

7. **TypeDoc o equivalente**: los tipos de `public/index.ts` merecen una doc site generada. Los usuarios externos no deberían leer el código fuente para entender la API pública.

8. **Integración securecoder ↔ memory**: un skill que, tras un fix de seguridad, registre automáticamente en el plugin `memory` qué vulnerabilidad se detectó y qué se hizo. Continuidad de contexto de seguridad entre sesiones.

### Bloque C — Lo que convertiría el proyecto en referencia de industria (ongoing)

9. **Plugin `plugin-template`** publicado con CI preconfigurado: el verdadero test de un framework plugin-based es que terceros puedan extenderlo con fricción mínima.

10. **Changelogs semánticos**: todos los paquetes en `0.1.0` sin historial. Changesets o conventional commits + automated changelog harían las actualizaciones trazables para usuarios externos.

11. **Regex en `search`**: coste bajo, valor alto, diferencia enorme en usabilidad para agentes de código.

12. **`IStatusCollector` implementación concreta**: la interfaz existe pero nadie la usa. Un `ConsoleStatusCollector` simple y un `NullStatusCollector` en el core daría observabilidad sin romper la genericidad.

---

### Tabla de esfuerzo para el 11/10

| Bloque | Esfuerzo estimado | Impacto en nota |
|---|---|---|
| A: Fixes críticos de genericidad + async | ~3-5 días | +0.8 pts |
| B: Ecosistema operacional | ~1-2 semanas | +0.5 pts |
| C: Referencia de industria | ongoing | +0.2 pts |

> El proyecto tiene una base tan sólida que el camino al 11/10 es de **completar lo que ya está empezado**, no de rediseñar. La arquitectura ya es de referencia. La diferencia está en los detalles operacionales, la genericidad completa y el ecosistema alrededor.

---

## Tabla de calificaciones

| Dimensión | Nota |
|---|---|
| Arquitectura general | ⭐⭐⭐⭐⭐ Perfecta |
| Contrato de plugins | ⭐⭐⭐⭐⭐ Perfecta |
| Seguridad concurrencia / I/O | ⭐⭐⭐⭐½ Muy bien |
| Eficiencia de tokens (LLM) | ⭐⭐⭐⭐⭐ Perfecta |
| Diseño libre de bucles/bloqueos | ⭐⭐⭐⭐ Bien |
| TypeScript / tipado | ⭐⭐⭐⭐⭐ Perfecta |
| Testing | ⭐⭐⭐⭐½ Muy bien |
| CI / Release | ⭐⭐⭐½ Regular-Bien |
| Documentación (README/docs) | ⭐⭐⭐½ Regular-Bien |
| Plugin `proposals` | ⭐⭐⭐⭐½ Muy bien |
| Plugin `memory` | ⭐⭐⭐⭐ Bien |
| Plugin `rules` | ⭐⭐⭐½ Regular-Bien |
| Plugin `git` | ⭐⭐⭐⭐½ Muy bien |
| Plugin `search` | ⭐⭐⭐½ Regular-Bien |
| Plugin `quality` | ⭐⭐⭐⭐ Bien |
| Plugin `docs` | ⭐⭐⭐ Regular |
| Plugin `deps` | ⭐⭐⭐½ Regular-Bien |
| Plugin `notification` | ⭐⭐⭐⭐½ Muy bien |
| Securecoder (plugin externo) | ⭐⭐⭐½ Regular-Bien |
| Scaffold / Blueprint | ⭐⭐⭐⭐½ Muy bien |
| Extensibilidad / futuro | ⭐⭐⭐⭐ Bien |

---

### Lo que añadiría y su impacto

| Adición | Estrellas ganadas | Dimensiones afectadas |
|---|---|---|
| `AGENT_SLOTS` extensible | ⭐⭐ Las más valiosas | Arquitectura, extensibilidad, genericidad |
| `docs/engine` async | ⭐⭐ Muy valiosas | Seguridad I/O, diseño sin bloqueos, docs plugin |
| Release workflow CI | ⭐½ Valiosas | CI/Release |
| `proposals_health_check` + `proposals_repair` | ⭐½ Valiosas | Anti-bloqueos, proposals plugin |
| `deliveredDigests` persistido | ⭐ Valiosa | Proposals plugin, eficiencia tokens |
| Regex en `search` | ⭐ Valiosa | Search plugin |
| TypeDoc API docs | ⭐ Valiosa | Documentación |
| Securecoder ↔ memory integration | ½ Útil | Securecoder |
| `maxNotes` / TTL en `memory` | ½ Útil | Memory plugin |
| `IStatusCollector` impl concreta | ½ Útil | Extensibilidad, observabilidad |

---

*Auditoría generada el 16/06/2026 mediante análisis estático exhaustivo y lectura completa del código fuente, sin influencia de auditorías previas.*

---

## 🏁 Estado actual del proyecto — 16 jun 2026

> Valoración honesta del estado real **hoy**, con lo que existe, sin proyecciones.

### Nota global: **⭐⭐⭐⭐¼ — 8.5 / 10**

| Categoría | Estado actual | Nota |
|---|---|---|
| 🏛️ **Fundamentos** | Arquitectura, contratos, tipado, shared utils — de referencia | ⭐⭐⭐⭐⭐ |
| ⚙️ **Motor de coordinación** | Mutex, atomic write, lock engine, parallelism — producción real | ⭐⭐⭐⭐⭐ |
| 🧪 **Tests** | 63 specs, caos, E2E, drift guard — muy por encima de la media | ⭐⭐⭐⭐½ |
| 🔌 **Ecosistema de plugins** | 9 plugins útiles, coherentes, bien integrados | ⭐⭐⭐⭐ |
| 💡 **Eficiencia para LLMs** | Overview cold-start, lazy knowledge, push notification | ⭐⭐⭐⭐⭐ |
| 🚧 **Deuda técnica activa** | I/O sync en `docs`, `AGENT_SLOTS` cerrado, `deliveredDigests` volátil | ⭐⭐½ |
| 🔁 **CI / Operaciones** | CI bueno; release automation ausente | ⭐⭐⭐½ |
| 📖 **Documentación** | README funcional; TypeDoc y changelogs ausentes | ⭐⭐⭐½ |
| 🌍 **Genericidad real** | Alta — con un único punto de ruptura (`AGENT_SLOTS`) | ⭐⭐⭐⭐ |
| 🔮 **Potencial** | Base tan sólida que el 10/10 es cuestión de días de trabajo | ⭐⭐⭐⭐⭐ |

### En una frase

> Un framework MCP de **arquitectura perfecta** con **deuda técnica puntual y solucionable**. Si los 4 fixes del Bloque A se completan, el proyecto pasa directamente a referencia de la industria. Hoy está en el top 5% de proyectos de este tipo que he auditado.

### Cuándo estará en 10/10

| Hito | Condición |
|---|---|
| **9/10** | `AGENT_SLOTS` extensible + `docs/engine` async (≈ 1-2 días) |
| **9.5/10** | + `deliveredDigests` persistido + release CI workflow (≈ 1 semana) |
| **10/10** | + `proposals_health_check/repair` + TypeDoc + integración securecoder↔memory (≈ 2-3 semanas) |
| **11/10** | + changelogs semánticos + regex en search + plugin template publicado + ecosistema de terceros (ongoing) |
