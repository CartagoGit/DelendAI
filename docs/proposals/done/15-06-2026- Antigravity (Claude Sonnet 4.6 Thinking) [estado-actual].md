# Auditoría exhaustiva de `@cartago-git/mcp-vertex` — Antigravity (Claude Sonnet 4.6 Thinking)

> **Fecha:** 15-06-2026  
> **Modelo:** Antigravity · Claude Sonnet 4.6 (Thinking)  
> **Alcance:** Revisión completa e independiente del repositorio en su estado actual (post-sesiones P0/P1/P2 de la auditoría unificada). Se examinan: arquitectura del core, todos los plugins, sistema de tests, eficiencia de tokens, gestión de concurrencia/bloqueos, plugins del IDE (securecoder), y oportunidades de mejora.  
> **Nota metodológica:** Esta auditoría ignora deliberadamente las conclusiones de auditorías previas. Es una perspectiva fresca sobre el estado actual del código, no una revisión del historial de cambios.

---

## Veredicto global: **8,4 / 10**

El proyecto ha completado con éxito su fase de fiabilización (P0/P1). La base arquitectónica es sólida y la infraestructura de concurrencia —que era el talón de Aquiles— está ahora bien resuelta. El techo actual lo pone la **deuda de calidad de output** (tokens, paginado, schemas declarados) y el hecho de que la capa `proposals` sigue siendo la única pieza densa y compleja. Con los pendientes identificados en esta auditoría, el proyecto puede llegar cómodamente a 9,5+/10.

---

## 1. Lo que está PERFECTO 💎

### 1.1 Contrato `IMcpPlugin` + `definePlugin`
`plugin-contract.ts` es ejemplar. La interfaz es mínima, tipada con `readonly` en todos los campos, y `definePlugin` es la identidad pura como type-helper —sin magia, sin registros globales. El contrato dice explícitamente en comentarios qué NO debe hacer un plugin (`process.cwd()`, leer args directamente). Documentación viva en el código.

### 1.2 `withFileMutex` — Mutex interproceso sin dependencias
`shared/with-file-mutex.ts` es una joya pequeña: mutex O_EXCL con robo por staleness y por timeout, sin depender de ninguna librería externa. Robusto, portable, testable. El mecanismo de `staleMs` para detectar holders caídos es exactamente el enfoque correcto para entornos donde los procesos pueden morir sin cleanup. La documentación en JSDoc explica perfectamente por qué existe (lost update entre writeFileAtomic).

### 1.3 `writeFileAtomic` / `writeFileAtomicSync`
Temp en el mismo directorio, rename POSIX-atómico, cleanup en caso de error. El comentario "never `os.tmpdir()`" es exactamente el tipo de decisión explícita que vale oro. Soluciona el EXDEV que hubiera sido un bug silencioso en entornos multi-FS.

### 1.4 `planRegistrationOrder` — Registro determinista, fail-fast
Pura, sin efectos secundarios, lanza en duplicados y en anclas desconocidas. El sistema `registerAfter` es elegante y permite dependencias de orden sin un grafo complejo. El hecho de que el servidor falle en boot antes que registrar estado incoherente es la decisión correcta.

### 1.5 `loadPlugins` — Carga resiliente con timeout
El pipeline `resolvePluginSpecifier → import → asPlugin → optionsSchema → register` está bien estructurado. La deduplicación por especificador Y por nombre de plugin es correcta (dos caminos al mismo paquete). El timeout por fase (`timeoutMs`) resuelve el M3 que bloqueaba boots. Un plugin mal instalado nunca tumba el servidor.

### 1.6 Sistema de tests (350 tests, 340 pasan)
50 archivos de test, 340 tests verdes, 10 skip justificados. La cobertura es real: hay tests de integración de concurrencia (`concurrent-claims.spec.ts`), tests de zombie kill en acceptance (`acceptance-exec.spec.ts`), tests de corrupción de ficheros. No es una suite de unit tests triviales; prueba los invariantes que importan.

### 1.7 TypeScript estricto al máximo
`tsconfig.base.json` activa `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`. Es la configuración más restrictiva posible. Esto elimina clases enteras de bugs a nivel de tipos.

### 1.8 `toolOk` / `toolError` / `toolJson` — Envelope uniforme
`shared/tool-response.ts` es pequeño y perfecto: JSON compacto (sin pretty-print), envelope `{ ok, error: { reason, nextAction } }`, `structuredContent` para clientes MCP modernos. Todos los tools deberían usarlo y en gran medida lo hacen.

### 1.9 `quarantineCorruptFile` — Corrupto ≠ vacío
El helper preserva los bytes corruptos con timestamp y random suffix anti-colisión, lanza `CorruptFileError` estructurado. La distinción entre "archivo vacío" (arrancar limpio) y "JSON corrupto" (preservar + error) es exactamente la semántica correcta.

---

## 2. Lo que está MUY BIEN ✅

### 2.1 `assembleCliConfig` — Configuración limpia por capas
La precedencia CLI > config file > default es clara y está implementada sin sorpresas. El `buildContext` lazy garantiza que cada plugin recibe exactamente su contexto sin contaminación. La cualificación de IDs de tool por namespace (R12) está resuelta: dos plugins pueden tener tool `status` sin colisionar.

### 2.2 `runDoctor` — Diagnóstico que ejecuta el servidor real
El doctor ahora ensambla el server real (sin stdio) para detectar errores de registro duplicado que un check de config-only no vería. Esto es más honesto que cualquier chequeo estático.

### 2.3 Agnosticismo de tracks y carpetas (M4, M5)
`IProposalTrack` es `string` libre, `knownTracks` es opt-in. `extraFolders` inyectado desde `ctx.options`. El código no tiene vocabulario del host. Correcto.

### 2.4 Plugin `proposals` — Layout derivado de `ctx`
`buildSwarmPaths(ctx.cacheDir, ctx.docsDir)` en el `register()` garantiza que todo el swarm comparte el mismo layout y que relocatear es una operación de config, no de código.

### 2.5 `proposal-acceptance.ts` — Ejecución de criterios segura
`detached: true` + `process.kill(-pid)` para matar el grupo entero. Tokenizador de argv que respeta comillas. Detección de metacaracteres para shell vs. exec. Cap de 64 KiB por stream. Código de timeout 124 distinto del exit 1. Muy limpio.

### 2.6 `round-context.ts` — Fingerprinting de estado
SHA-256 truncado a 8 bytes con prefijo `rh-`, portable Bun/Node. La función `isDigestStale` compara hashes y metadatos de fuentes: un agente puede saber si necesita re-leer sin leer los archivos. La lógica de `buildResumeHint` es sofisticada pero correcta.

### 2.7 `continuity-enforcer.ts` — Anti-bucle conceptual
El downgrade a `reset` con mensajes de violación claros evita que un agente atascado siga retrying eternamente. La separación entre `block` y `warn` es correcta.

### 2.8 Scaffold completo: host/plugin/client
`scaffold-host.ts` genera 4 tipos de artefactos (host, plugin, client, instrucciones). Las plantillas solo referencian tools que existen (`overview` + condicional `proposals`). El cliente MCP generado es usable directamente.

### 2.9 CI con `ci.yml`
Job `validate` (typecheck + tests) + job `pack-smoke` (npm pack --dry-run por paquete). Frozen lockfile. Esto es lo mínimo correcto y está bien.

---

## 3. Lo que está BIEN 👍

### 3.1 Plugin `quality` — Async, con timeout y cap
`runner.ts` usa `spawn` (no `execSync`), timeout con SIGKILL, cap de 64 KiB. Ya no bloquea el event loop. Correcto.

### 3.2 Plugin `git` — Orientación read-only
API limpia: `gitStatus`, `gitChanged`, `gitDiffStat`, `gitLog`. `execFileSync` con timeout. El `try/catch → ''` es discutible (ver §5) pero al menos no crashea.

### 3.3 Plugin `memory` — Store con quarantine
`readStore` distingue missing, vacío, y corrupto. Usa `writeFileAtomicSync`. Sin mutex (es sync, single-caller) pero los writes son atómicos.

### 3.4 Plugin `search`
Existe. Grep-like, agnóstico vía options. Mata el polling de "busca en el workspace" que antes forzaba al agente a leer archivos uno a uno.

### 3.5 `IMcpPluginContext` bien documentado
Cada campo del contexto tiene un comentario de una línea explicando su propósito y restricciones. El contrato es autoexplicativo.

### 3.6 `bun.lock` + monorepo workspaces
Gestión de dependencias limpia. `bun.lock` frozen en CI evita sorpresas de resolución. La estructura `packages/*` + `plugins/*` es estándar y escalable.

---

## 4. Lo que está REGULAR ⚠️

### 4.1 `round-context.ts` — 884 líneas en un solo archivo
El archivo hace 6 cosas distintas: types, I/O de fuentes, hashing, construcción del digest, detección de staleness, resume hint. Aunque está bien organizado con secciones comentadas, supera cómodamente el umbral de mantenibilidad. Una refactorización en 3-4 módulos (`round-context-types.ts`, `round-context-io.ts`, `round-context-digest.ts`, `round-context-resume.ts`) mejoraría la legibilidad sin cambiar ningún contrato.

**Impacto en tokens:** el módulo es interno, no lo lee el agente directamente. Pero el **test** que lo cubre es más difícil de escribir y mantener.

### 4.2 Plugin `git` — Error silencioso en no-repos
```ts
} catch {
    return '';
}
```
`execFileSync` que lanza (no-repo, timeout, git no instalado) devuelve string vacío. `isGitRepo` retorna `false` (correcto), pero el agente no sabe si el repo está limpio o si git no existe. `git_log` con un repo git limpio y con git desinstalado devuelve la misma respuesta vacía. Debería retornar `{ ok: false, reason: 'git not available' }` para distinguir los casos.

### 4.3 `memory` sin quotas ni redacción de secretos
`saveNote` acepta título, cuerpo y tags sin validar longitud. Un agente que cometa un error puede escribir un cuerpo de 100 MB. No hay ningún mecanismo de TTL ni de purgado automático. No hay redacción de secretos (tokens, contraseñas en notas).

**Límites sugeridos:** título ≤ 200 chars, cuerpo ≤ 64 KB, tags ≤ 20 items de ≤ 50 chars cada uno, total de notas ≤ 1000 o ≤ 10 MB.

### 4.4 `doctor` — Doble lectura del config
`runDoctor` llama a `assembleCliConfig` que lee el config, y antes llama a `diagnoseConfigFile` que también lee el config. Son dos lecturas del mismo archivo. El resultado de `assembleCliConfig` debería reutilizar el diagnóstico. Bajo impacto real, pero innecesariamente redundante.

### 4.5 `auto_work` y `continue_proposal` — Sin detección de progreso real
El anti-stall conceptual (`continuity-enforcer`) captura violaciones de política de sesión, pero **no detecta si el agente está seleccionando la misma propuesta `in_progress` de otra sesión sin haber adquirido el lock**. Un agente puede entrar en un mini-bucle: ver `in_progress`, intentar `agent_lock`, recibir `lock-conflict`, reportar conflict, volver a `auto_work`, ver la misma propuesta, etc. La solución correcta es que `auto_work` excluya propuestas `in_progress` con lock activo de otro agente, o al menos las coloque al final de la cola.

### 4.6 Pretty-print JSON en `writeStore` (memory) y `blueprint.json`
```ts
writeFileAtomicSync(absPath, `${JSON.stringify({ notes }, null, '\t')}\n`);
```
Las notas se serializan con tabs. El blueprint también usa `null, '\t'`. Para archivos persisitidos que los agentes no leen directamente (o leen raramente), el pretty-print es aceptable. Pero para payloads de tool en flight deberían ser compactos. Validar caso a caso.

### 4.7 `vitest.shared.ts` — Alias `./lib/*` en tests
Los tests importan vía alias `@cartago-git/mcp-vertex/lib/...` aunque en producción esa ruta no está en `exports`. Esto es correcto para testing (los tests necesitan acceso interno), pero requiere mantener sincronizados el `vitest.shared.ts` y `tsconfig.base.json`. Un test que usa un símbolo interno puede pasar en CI y fallar si alguien elimina el símbolo sin actualizar el alias.

---

## 5. Lo que está MAL ❌

### 5.1 Plugin `git` — `execFileSync` bloquea el event loop
```ts
export const createGitRunner = (cwd: string, timeoutMs = 15_000): IGitRunner =>
    (args) => {
        try {
            return execFileSync('git', [...args], { ... timeout: timeoutMs ... });
        } catch {
            return '';
        }
    };
```
`execFileSync` es **síncrono**: bloquea el event loop del servidor MCP durante hasta 15 segundos. En un repositorio grande con `git log -n 100`, esto puede ser perceptible. La solución es `execFile` (async) o el mismo patrón de `spawn` que ya usa `quality/runner.ts`. El código de `runner.ts` ya existe; `git.ts` debería usarlo o extraer el runner async a un shared.

**Severidad: MUY MAL** — no es fatal porque `git` suele ser rápido, pero es una inconsistencia de modelo y un riesgo latente.

### 5.2 `prepareServerBlueprintOnStart` — I/O síncrono bloqueante al boot
```ts
writeFileSync(absPath, `${JSON.stringify(..., null, '\t')}\n`, 'utf8');
```
En el path de arranque del servidor (`runCli`), se escribe el blueprint de forma síncrona. Si el análisis del proyecto es lento (repositorio grande) o el disco es lento (NFS, contenedor), el servidor MCP no responde a ninguna llamada hasta que termine. Debería ser fire-and-forget async o moverse fuera del path crítico de boot.

**Severidad: MAL** — raro en la práctica, pero viola el principio de arranque rápido.

### 5.3 `memory` — `saveNote` sin mutex
`store.ts` usa `writeFileAtomicSync` (correcto para crash-safety) pero NO usa `withFileMutex`. Si dos herramientas de memory se llaman concurrentemente (e.g., un orchestrador y un subagente ambos con `memory` en el mismo servidor):
```
agente A: readStore → [ note1 ]
agente B: readStore → [ note1 ]
agente A: writeStore → [ note1, note_A ]
agente B: writeStore → [ note1, note_B ]  ← sobrescribe note_A
```
Lost update. Exactamente el problema que `withFileMutex` resuelve en las otras stores.

**Severidad: MAL** — un servidor multi-plugin con memory es un caso real.

### 5.4 `scaffold-host.ts` — `process.cwd()` en código generado
```ts
const workspace = createWorkspacePathProvider(process.cwd());
```
La plantilla `scaffoldHostConfigFile` genera código de host que usa `process.cwd()`. El proyecto promueve activamente no usar `process.cwd()` en plugins, pero el boilerplate que genera para los hosts lo usa. Cuando el host se ejecute desde un directorio distinto (CI, contenedor) el workspace apuntará al lugar equivocado. Debería generar `createWorkspacePathProvider(import.meta.dir)` (Bun) o una estrategia basada en `__dirname` / `fileURLToPath(import.meta.url)`.

**Severidad: MAL** — genera hosts con un bug latente que solo aparece en producción.

---

## 6. Lo que está FATAL 🔴

> En el estado actual (post P0/P1), no hay bloqueantes de producción de nivel crítico que no hayan sido abordados. Los issues de §5 son "mal" pero no "fatal". El único candidato a fatal que queda:

### 6.1 Plugin `git` — Error silencioso = estado limpio falso

Esto cruza de "regular" a potencialmente "fatal" en un swarm: si `git` no está disponible en el entorno del agente (contenedor minimal, sandbox), `isGitRepo()` devuelve `false`, pero `gitStatus()` devuelve `{ clean: true, entries: [] }` porque `parseStatus('')` es válido. Un agente que confía en el estado git para decidir si hay cambios pendientes podría concluir erróneamente que no hay nada sin commitear, saltar validaciones y cerrar una propuesta prematuramente.

**Fix:** hacer que `git.ts` sea async y que `createGitRunner` devuelva `{ ok: boolean; output: string; reason?: string }` en lugar de `string`.

---

## 7. Análisis de eficiencia de tokens

### 7.1 Lo que ya está bien
- `overview` en 1 llamada de cold-start: perfecto
- Knowledge lazy (se lee solo si se pide por id)
- JSON compacto en tools con `toolOk`/`toolError` (sin pretty-print)
- `round-context` digest evita re-lectura de docs si el hash no cambió
- `git diff --stat` en lugar del diff completo
- `tail` en quality (últimas 20 líneas, no la salida completa)

### 7.2 Problemas de tokens identificados

| Problema | Magnitud | Fix sugerido |
|---|---|---|
| `memory` store con pretty-print (`\t`) | Bajo (archivo en disco, no en tool response) | Compacto en writes, pretty solo para lectura humana |
| `blueprint.json` con pretty-print al arranque | Bajo | Compacto; el agente parsea JSON de todas formas |
| `overview` enumera TODAS las tools siempre | Medio | `compact:true` agrupa por tags; `full:false` omite summaries |
| `scaffold_host` genera un bloque de código grande | Medio | Retornar paths + tamaños; el agente pide el contenido con `knowledge` |
| `rules` materializa convenciones de todos los presets aunque trabajes 1 área | Medio | Filtrar por área detectada del workspace |
| `round-context` retorna el digest completo siempre | Bajo | Parámetro `fields:[]` para retornar solo lo necesario |
| `analyze_project` retorna análisis completo sin paginado | Medio | `fields:[]` + truncar listas largas |
| `continue_proposal` retorna plan completo incluyendo criterios de aceptación | Medio | Resumen por defecto; `full:true` para detalle |

**Estimación conservadora de ahorro:** 10-20% en cold-start con `compact:true` en overview. 15-25% en sesiones de proposals con `fields` y `round-context` selectivo.

---

## 8. Bucles y bloqueos — Estado actual

### 8.1 Resueltos ✅
| Riesgo | Mecanismo |
|---|---|
| Lost update en lock/queue/registry | `withFileMutex` + `writeFileAtomic` |
| Plugin colgado en import/register | `withTimeout` (15s por defecto) |
| Proceso hijo zombie en acceptance | `detached:true` + `process.kill(-pid)` |
| Bucle de agente sin progreso | `continuity-enforcer` → downgrade a `reset` |
| JSON corrupto tratado como vacío | `quarantineCorruptFile` + `CorruptFileError` |
| Doctor falso positivo | `runDoctor` ensambla server real |

### 8.2 Posibles — No resueltos ⚠️
| Riesgo | Descripción | Probabilidad | Fix |
|---|---|---|---|
| `auto_work` mini-bucle por in_progress ajeno | Agente selecciona propuesta con lock activo de otro, recibe conflict, vuelve al inicio | Media | Excluir in_progress con lock activo de la selección |
| Polling de locks por ausencia de notificaciones MCP | Sin `notification` plugin, los agentes pollan `agent_lock status` | Alta (en swarm real) | Plugin `notification` con `notifications/message` MCP |
| `memory` lost update bajo concurrencia | Sin mutex, dos agentes pueden sobrescribirse | Media (servidor multi-plugin) | `withFileMutex` en `saveNote`/`removeNote` |
| `git` bloquea event loop 15s | En repo grande, todas las llamadas MCP se serializan | Baja (git es rápido) | Async runner |
| `state_repair` inexistente | `waiterOrphans` y locks huérfanos se acumulan sin auto-heal | Media (largo plazo) | Tool `state_health` + `state_repair` |

**Conclusión:** El proyecto ha eliminado los bloqueos más graves. Los restantes son de probabilidad media-baja y tienen mitigaciones parciales. No puede afirmarse "cero bucles ni bloqueos posibles" pero tampoco es un sistema bloqueado por diseño.

---

## 9. Análisis de plugins (IDE/securecoder)

Los plugins del IDE (`/home/cartago/.gemini/config/plugins/Google.securecoder.securecoder`) son un sistema de skills para el agente de coding:

### 9.1 Lo que está bien en los plugins securecoder
- **Separación de responsabilidades clara:** cada skill tiene un propósito único (scan, audit report, PoC, threat model, dependency scan).
- **`scan_dependencies` como gate obligatorio** antes de añadir imports: esto es la decisión correcta para evitar supply chain issues.
- **`mandatory-secure-web-skills`** cubre los vectores principales (XSS, SQLi, secrets, CSRF, file handling).
- **`securecoder-persona`** define el workflow de "Fix All" de forma estructurada.

### 9.2 Lo que está regular en los plugins securecoder
- **Ausencia de integración con `proposals`:** un fix de seguridad significativo debería crear una propuesta con criterios de aceptación. Las skills no mencionan este flujo aunque el agente tiene acceso al plugin `proposals`.
- **`run-poc`** genera un PoC conceptual, no lo ejecuta. En un entorno con `quality` disponible, podría validarse realmente con el runner de acceptance.
- **Skills como texto plano:** no hay ningún mecanismo de versionado de skills. Si la API de MCP cambia (por ejemplo, `structuredContent` se vuelve obligatorio), las skills que generan código no lo sabrán.

### 9.3 Lo que está mal en los plugins securecoder
- **Sin conexión a `mcp-vertex`:** los plugins del IDE generan código de seguridad pero no verifican si el proyecto tiene un servidor MCP activo que podría ejecutar validaciones automatizadas. Un scan podría desencadenar una tarea en `task_queue` automáticamente.
- **`mandatory-secure-web-skills` asume tecnología web:** si el proyecto es una CLI Node.js o un servidor MCP en sí mismo, muchas de las reglas (CSRF, XSS) no aplican. Debería detectar el tipo de proyecto (vía `analyzeProject`) antes de aplicar el perfil completo.

---

## 10. Skills, herramientas y agentes — ¿Qué falta?

### 10.1 Skills que aportarían valor real

| Skill | Justificación | Coste de tokens |
|---|---|---|
| `token-budgeting` | Guía para que los agentes usen `compact:true`, `fields:[]`, y no re-lean lo que ya tienen en el digest | Muy bajo |
| `plugin-authoring` | Guía step-by-step para crear un plugin completo, incluyendo tests, quarantine, mutex | Bajo |
| `state-recovery` | Qué hacer cuando `round_context` muestra locks huérfanos o registry corrupto | Bajo |
| `concurrency-patterns` | Cuándo usar `withFileMutex`, cuándo `writeFileAtomic` es suficiente, cuándo no hace falta nada | Bajo |
| `mcp-security` | Qué datos NO poner en `memory`, cómo validar rutas de workspace antes de leer, surface de ataque de `acceptance` criteria | Bajo |

### 10.2 Tools que aportarían valor

| Tool | Plugin | Justificación |
|---|---|---|
| `state_health` | proposals | Detecta waiterOrphans, locks >TTL sin `last_seen` reciente, registry con assignments huérfanas |
| `state_repair` | proposals | Auto-heal dry-run: propone qué remover; con `--execute` lo hace con backup |
| `compact_status` | core o proposals | git + quality + proposals + locks en un payload pequeño; `fields` selectivos |
| `cancel_operation` | quality | Cancelar una calidad en curso por id (complemento a timeout) |
| `plugin_capabilities` | core | Qué escribe/ejecuta/lee cada plugin cargado (modelo de confianza/auditoría) |

### 10.3 Sobre añadir más agentes

**NO recomendado.** El sistema de 5 roles (orchestrator + 4 subagents) ya es suficientemente complejo. Añadir agentes sin añadir capacidad de coordinación real solo aumenta la superficie de bloqueos. Lo que mejoraría el sistema es **presets de agent configuration** (`minimal`, `standard`, `swarm`) que el scaffold genere según el tamaño del proyecto.

### 10.4 Plugin `notification` — El pendiente de mayor impacto

Sin este plugin, todo swarm multi-agente debe pollar `agent_lock status` para saber si un lock fue liberado. Con `notifications/message` de MCP, el holder podría notificar la liberación y eliminar el polling completamente. Este es el pendiente de mayor impacto en eficiencia de tokens y de latencia en swarms reales.

---

## 11. Arquitectura general — Diagnóstico final

```
┌─────────────────────────────────────────────────────────────────┐
│  CLI (mcp-vertex --plugins=...)                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ parseCliArgs│→ │assembleConfig│→ │    createMcpProject     │ │
│  └─────────────┘  │  (loadPlugins │  │  planRegistrationOrder│ │
│                   │  + contexts)  │  └────────────────────────┘ │
│                   └──────────────┘                              │
├──────────────┬─────────────┬────────────────┬──────────────────┤
│  core tools  │  proposals  │  git/memory    │  quality/rules   │
│  overview    │  (swarm)    │  (lightweight) │  search          │
│  knowledge   │  ┌────────┐ │                │                  │
│  scaffold    │  │mutex + │ │                │                  │
│  analyze     │  │atomic  │ │                │                  │
│              │  │write   │ │                │                  │
│              │  └────────┘ │                │                  │
└──────────────┴─────────────┴────────────────┴──────────────────┘
```

**Fortalezas arquitectónicas:**
1. Separación core / plugins es limpia y mantenida
2. Contratos tipados en todas las fronteras
3. Puerta de registro fail-fast
4. I/O crítico transaccional (mutex + atomic write)
5. Timeout en todos los paths async peligrosos

**Debilidades arquitectónicas restantes:**
1. `round-context.ts` como monolito de 884 líneas (interno, no fatal)
2. `git.ts` síncrono (técnicamente incorrecto respecto al modelo async)
3. `memory` sin mutex (lost update en concurrencia)
4. Scaffold genera `process.cwd()` en hosts generados
5. Sin `notification` plugin → swarms deben pollar

---

## 12. Tabla de hallazgos priorizados

| # | Hallazgo | Severidad | Categoría | Fix estimado |
|---|---|---|---|---|
| N1 | `memory.saveNote` sin mutex → lost update | MAL | Concurrencia | 30 min |
| N2 | `git.ts` síncrono → bloquea event loop | MAL | Rendimiento | 2h |
| N3 | `scaffold-host` genera `process.cwd()` | MAL | Correctitud | 30 min |
| N4 | `prepareServerBlueprintOnStart` síncrono en boot | MAL | Rendimiento | 1h |
| N5 | `git` error silencioso → estado limpio falso | REGULAR/FATAL | Correctitud | 1h |
| N6 | `auto_work` sin exclusión de in_progress con lock | REGULAR | Anti-bucle | 2h |
| N7 | `memory` sin quotas | REGULAR | Robustez | 1h |
| N8 | `round-context.ts` 884 líneas monolito | REGULAR | Mantenibilidad | 4h refactor |
| N9 | Doctor doble lectura del config | REGULAR | Limpieza | 30 min |
| N10 | `overview` sin `compact:true` | REGULAR | Tokens | 2h |
| N11 | `state_health` / `state_repair` ausentes | REGULAR | Operatividad | 1 día |
| N12 | Plugin `notification` ausente | REGULAR | Eficiencia swarm | 2 días |
| N13 | Scaffold sin `minimal/standard/swarm` presets | MINOR | DX | 4h |
| N14 | Skills securecoder sin integración proposals | MINOR | DX | 4h |
| N15 | `analyze_project` sin `fields` / paginado | MINOR | Tokens | 3h |

---

## 13. Recomendaciones ordenadas por impacto/esfuerzo

### P0 — Correctitud (hacer antes de publicar)
1. **N1:** `withFileMutex` en `memory.saveNote` y `memory.removeNote`
2. **N3:** Corregir plantilla de `scaffoldHostConfigFile` para no usar `process.cwd()`
3. **N5:** `git.ts` → devolver `{ ok, output, reason? }` y hacer async (o al mínimo documentar el riesgo claramente)

### P1 — Rendimiento y robustez
4. **N2:** `git.ts` async con el mismo patrón de `runner.ts`
5. **N4:** `prepareServerBlueprintOnStart` fire-and-forget async
6. **N6:** `auto_work` excluir propuestas in_progress con lock activo de otro agente
7. **N7:** Quotas en `memory` (título, cuerpo, tags, total)

### P2 — Tokens y UX de agente
8. **N10:** `overview` con parámetro `compact:true`
9. **N15:** `analyze_project` con `fields:[]`
10. **N11:** `state_health` + `state_repair` (diagnóstico y auto-heal de orphans)
11. **N12:** Plugin `notification` (eliminar polling en swarm)

### P3 — Calidad y plataforma
12. **N8:** Dividir `round-context.ts` en 3-4 módulos
13. **N9:** Unificar lectura de config en `runDoctor`
14. **N13:** Presets de scaffold (`minimal`, `standard`, `swarm`)
15. **N14:** Skills securecoder con flujo de proposal para fixes de seguridad

---

## 14. Conclusión

`@cartago-git/mcp-vertex` en su estado actual (15-06-2026) es un proyecto de calidad de producción en su núcleo: contratos limpios, registro determinista, I/O transaccional, tests que prueban invariantes reales, TypeScript al límite de la strictness. La fase de fiabilización P0/P1 se completó con éxito.

Los pendientes restantes no son deuda técnica acumulada por descuido — son la frontera natural de un sistema en evolución activa. Los más urgentes (mutex en memory, process.cwd() en scaffold, git síncrono) son correcciones de 30 minutos a 2 horas cada una.

El proyecto está listo para publicación como librería. Para usarlo como plataforma de swarms en producción, P1 completo (especialmente el mutex de memory y la exclusión de in_progress en auto_work) es el prerequisito mínimo.

**Puntuación detallada:**
- Arquitectura core: **9,5/10**
- Plugin proposals: **8,5/10**
- Plugins auxiliares (git, memory, quality, rules, search): **7,5/10**
- Eficiencia de tokens: **7,5/10**
- Fiabilidad de concurrencia: **9,0/10**
- Cobertura de tests: **8,5/10**
- Documentación y DX: **9,0/10**
- Plugins securecoder (IDE): **7,0/10** *(funcional pero desconectados del ecosistema mcp-vertex)*

**Media ponderada: 8,4 / 10**

---

## 15. El camino al 11/10 — Excelencia absoluta

Un 11/10 no es marketing: significa que el proyecto **supera las expectativas razonables de una plataforma de su tipo** en todas las dimensiones relevantes. Actualmente está en 8,4. Para llegar a 11 hacen falta tres cosas distintas: cerrar los bugs existentes, añadir capacidades que cambien de categoría al sistema, y alcanzar un nivel de pulido y documentación que lo convierta en referencia para otros.

### 15.1 Lo que debe estar cerrado (prerequisitos irrenunciables)

Estos no son opcionales. Sin ellos el proyecto no puede llamarse "listo para producción" sin asterisco:

| # | Qué | Por qué es irrenunciable |
|---|---|---|
| **A** | `withFileMutex` en `memory` (`saveNote` + `removeNote`) | Un sistema que promueve multi-agente no puede tener lost updates en la store de memoria. Es una contradicción en sus términos. |
| **B** | `git.ts` async + respuesta estructurada `{ ok, output, reason? }` | El silencio ante `git not found` puede hacer que un agente archive una propuesta con cambios sin commitear. |
| **C** | `scaffoldHostConfigFile` sin `process.cwd()` | El scaffold es la primera impresión que un developer tiene del proyecto. Generar código con un bug latente es un fracaso de DX en el momento más crítico. |
| **D** | `prepareServerBlueprintOnStart` async | El servidor debe responder en <200ms al primer ping MCP, no en "5s + tiempo de análisis del repo". |
| **E** | `auto_work` excluir propuestas con lock activo de otro agente | Sin esto, el loop claim→conflict→auto_work→same_proposal es un mini-bucle documentado que nadie ha cerrado. |
| **F** | Quotas en `memory` | Sin límites, una nota de 100 MB puede colapsar un agente que intente leerla de vuelta. |

### 15.2 Las capacidades que cambian de categoría

Estas son las piezas que elevan el proyecto de "buena librería" a "plataforma de referencia":

#### Plugin `notification` — Eliminar el polling en swarms
Sin este plugin, cada agente en un swarm debe pollar `agent_lock status` cada N segundos para saber si puede continuar. Esto genera un flujo constante de llamadas MCP que consumen tokens sin producir trabajo. Con `notifications/message` del protocolo MCP, el holder del lock podría emitir un evento al liberarlo y los waiters reaccionarían inmediatamente. **Esto es lo que convierte un swarm de "funciona" a "eficiente".**

Impacto estimado: -40% de llamadas MCP en sesiones de proposals con múltiples agentes.

#### `state_health` + `state_repair` — Auto-curación sin intervención humana
El sistema detecta `waiterOrphans` (backpressure) pero no los resuelve. Un swarm que corre sin supervisión durante horas puede acumular:
- Locks con `last_seen` > TTL sin `agent_names release`
- Assignments en registry con `status: active` de agentes que ya terminaron
- Tareas en queue con `waitFor` apuntando a task_ids que ya están en closed-tasks

`state_health` diagnostica. `state_repair --dry-run` propone. `state_repair --execute` actúa con backup. Sin esto, cualquier fallo parcial en un swarm largo requiere intervención manual.

#### `outputSchema` declarado en todas las tools (Zod)
El protocolo MCP moderno permite declarar el schema del output de cada tool. Hoy `structuredContent` se rellena para clients modernos, pero sin `outputSchema` declarado los clients no pueden validar el output sin re-parsear el JSON. Añadir `outputSchema: z.object({...}).describe(...)` a cada tool:
1. Permite a clientes MCP hacer type-checking del output
2. Documenta el contrato de forma machine-readable
3. Habilita UI automáticas en clients que renderizan forms/tablas

#### `compact_status` — Estado del sistema en una llamada
Un agente que necesita saber "¿cómo está todo?" debe llamar a `overview`, `agent_names`, `agent_lock status`, `task_queue subscribe`, `git_status`, `quality_run`. Con `compact_status { fields: ['git', 'locks', 'queue'] }` obtiene exactamente lo que necesita en una sola llamada, con payload mínimo. **Esto es la diferencia entre 5-7 llamadas de orientación y 1.**

#### Presets de scaffold (`minimal` / `standard` / `swarm`)
Hoy el scaffold genera el mismo set de 5 agentes + instrucciones + config para cualquier proyecto. Un proyecto pequeño no necesita un orchestrator + 4 subagents. Los presets permitirían:
- `minimal`: solo core tools + 1 agente + instrucciones básicas
- `standard`: + proposals + memory + git + quality
- `swarm`: + 4 subagents diferenciados + rules + search + conocimiento de concurrencia

### 15.3 El nivel de pulido que distingue una referencia

#### Cobertura de tests: 95%+ con tests de caos
Los 340 tests actuales son buenos pero prueba el happy path y algunos error paths. Faltan:
- **Tests de caos/adversarial**: ¿qué pasa si el disco se llena a mitad de un `writeFileAtomic`? ¿Si un proceso muere con el mutex tomado pero antes de que expire `staleMs`? ¿Si el JSON del lock está truncado a la mitad?
- **Tests de rendimiento baseline**: asegurarse de que `overview` responde en <50ms en un proyecto con 20 plugins cargados.
- **Tests de integración end-to-end**: arrancar un servidor MCP real y llamar herramientas desde un cliente real, no solo unit tests de los engines.

#### Observabilidad: `IStatusCollector` real
`IStatusCollector` existe en los contratos pero no tiene ninguna implementación. Para un sistema multi-agente que puede correr durante horas sin supervisión, necesitas saber en tiempo real:
- Cuántas llamadas MCP se han atendido
- Qué plugins están cargados y cuánto tardaron en registrarse
- Cuántos locks se han adquirido, liberado, robado por stale, y cuántos están activos ahora mismo
- Histograma de tiempos de respuesta por tool

Sin esto, operar el sistema en producción es operar a ciegas.

#### Benchmarks de tokens documentados
El README promete "low-token". ¿Cuántos tokens exactamente? Un 11/10 tiene números reales:
- "Cold-start con `overview` + `auto_work`: ~800 tokens de input, ~300 de output"
- "Una sesión de proposals completa (claim → edit → validate → sync → release): ~2400 tokens"
- "Comparativa polling vs. `notification`: polling 150 llamadas/hora × 400 tokens = 60k tokens; con notification: 12 llamadas × 400 = 4800 tokens"

Sin benchmarks, "low-token" es marketing. Con benchmarks, es una promesa medible.

#### Documentación como plataforma de referencia
La documentación actual (README, PLUGINS-MCP-VERTEX.md) es buena para "cómo usar". Para ser referencia necesita:
- **Guía de arquitectura**: por qué `withFileMutex` sobre un lock de BD, por qué `rename` sobre `write`, por qué plugins sobre extensión directa.
- **Guía de concurrencia para autores de plugins**: cuándo necesitas mutex, cuándo no, cómo testear concurrencia.
- **Libro de runbooks operativos**: "el swarm se atascó, qué hago", "un plugin no carga, cómo depuro", "el disco está lleno de `.tmp`, por qué".
- **Changelog semántico con migraciones**: cuando cambia `ILockEntry`, qué tienen que hacer los usuarios del plugin.

#### Semver real y ciclo de publicación
`version: "0.1.0"` en todos los paquetes. Para ser una librería de producción se necesita:
- Política de semver documentada: qué es breaking, qué no
- Guía de migración entre versiones
- Tags de release en git
- Automatización del publish (el `docs/NPM_PUBLISH.md` manual no escala)

### 15.4 El único cambio de paradigma posible: SDK de plugins con types generados

El nivel verdaderamente excepcional —que ningún sistema MCP hace todavía— sería generar tipos TypeScript del output de cada tool a partir de los `outputSchema` declarados. Esto permitiría que un plugin que consume otro plugin tenga type-safety completa:

```ts
import type { IOverviewResult } from '@cartago-git/mcp-vertex/types';
// IOverviewResult generado automáticamente del outputSchema de overview_tool
```

Esto convertiría mcp-vertex en un framework tipado end-to-end, no solo un runtime.

---

### Resumen — De 8,4 a 11/10

| Fase | Qué | Impacto en nota | Esfuerzo estimado |
|---|---|---|---|
| **Prereqs (A-F)** | Bugs existentes cerrados | +0,6 → 9,0 | 1-2 días |
| **Notificaciones + state_repair** | Swarms sin polling, sin acumulación de orphans | +0,5 → 9,5 | 3-5 días |
| **outputSchema + compact_status + presets** | DX y eficiencia de tokens de nivel plataforma | +0,3 → 9,8 | 3-4 días |
| **Tests de caos + observabilidad + benchmarks** | Confianza operativa demostrada, no asumida | +0,5 → 10,3 | 1 semana |
| **Documentación de referencia + semver + CI publish** | El proyecto se convierte en referencia citada por otros | +0,4 → 10,7 | 1 semana |
| **SDK de tipos generados** | Cambio de paradigma: type-safety end-to-end en el ecosistema | +0,3 → 11,0 | 2 semanas |

El 11/10 no es "añadir más cosas". Es completar las que están a medias, hacer que las existentes sean demostrablemente correctas con números reales, y pulir hasta que quien lo descubra quiera escribir sobre él.
