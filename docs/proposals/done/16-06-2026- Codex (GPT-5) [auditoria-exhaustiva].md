# Auditoria exhaustiva de `mcp-core` y plugins - Codex (GPT-5)

> **Fecha:** 16-06-2026  
> **Revisor:** Codex (GPT-5)  
> **Alcance:** Auditoria independiente del workspace `mcp-core` en su estado actual. Se revisan arquitectura, core, plugins, tests, CI, concurrencia, bloqueos, eficiencia de tokens, extensibilidad, scaffold y necesidades futuras de skills/herramientas/agentes.  
> **Nota metodologica:** Se han mirado documentos previos solo para copiar el estilo general de nombre y formato. Las conclusiones de esta auditoria salen del codigo actual, no de las conclusiones anteriores.

---

## Veredicto global: **9,1 / 10**

`mcp-core` ya no parece un experimento: parece una base MCP real, modular, testeada y bastante consciente de los problemas que suelen romper sistemas de agentes: rutas globales, escrituras concurrentes, corrupcion de estado, polling, payloads gigantes y bucles de "vuelvo a intentar lo mismo".

Lo mas importante: el proyecto esta **bien planteado**. El core es pequeno y agnostico, los plugins cargan por contrato, los paths entran por `ctx.workspace`, hay un `overview` barato para orientar modelos, hay knowledge lazy, hay locks con mutex, hay escritura atomica, hay cuarentena de ficheros corruptos, hay doctor mode, CI y una suite verde de **425 tests** (`415 passed | 10 skipped`) con typecheck limpio.

No le doy 10 ni 11 porque todavia hay deuda de producto y operacion:

- varios plugins pequenos son utiles pero todavia no son "best in class";
- algunas rutas calientes siguen usando FS sincrono;
- varias respuestas de tools siguen usando JSON pretty-print;
- el `proposals` plugin es potentisimo, pero denso;
- faltan capacidades de seguridad, observabilidad, benchmarking, snapshots/replay y documentacion de operacion avanzada;
- hay algunos comentarios/tipos obsoletos que pueden confundir al siguiente mantenedor.

Mi impresion honesta: **es un 9 alto como framework local de coordinacion MCP**, y puede llegar a **10/10** con una ronda de pulido. Para ser **11/10**, necesita moverse de "codigo excelente" a "plataforma operable": seguridad, metricas, replay, versionado de estado, hardening de releases y guias de uso real.

---

## Resumen ejecutivo

### Lo que esta perfecto

- Contrato de plugin: `IMcpPlugin`, `IMcpPluginContext` y `definePlugin` estan muy bien disenados.
- Separacion core/plugins: el core no sabe de dominios concretos y los plugins aportan capacidades.
- Tool discovery: `overview` como entrada unica reduce llamadas y evita exploracion a ciegas.
- Estado compartido: `writeFileAtomic`, `withFileMutex` y `quarantineCorruptFile` son decisiones muy maduras.
- Testing: 63 archivos de test, 425 tests totales, typecheck estricto y CI.
- `proposals`: locks, cola, estado, reparacion, slices, nombres, continuidad y round-context son una base muy seria para swarms.

### Lo que esta muy bien

- `git` ya es async y distingue errores reales de "repo limpio".
- `search` ya es async, capado y de bajo token.
- `memory` tiene mutex, cuotas y ranking BM25-lite.
- `notification` reduce polling mediante watcher + mensajes.
- `rules` detecta frameworks y genera manifest con prioridad del proyecto.
- `quality` usa `spawn`, timeout y salida acotada.
- Scaffold genera hosts hermeticos y no mete modelo personalizado por defecto.

### Lo que esta regular o mal

- Algunos stores y tools siguen escribiendo JSON pretty-print, incluso en respuestas MCP.
- `docs` usa FS sincrono para catalogar/leer docs; no es fatal, pero no esta al nivel de `search`.
- `deps` es offline y correcto, pero demasiado superficial para decisiones serias.
- `rules` materializa todos los presets por defecto, aunque un workspace use uno o dos.
- `task-queue` tiene idempotencia de `subscribe` solo en memoria de proceso.
- Hay comentarios obsoletos, especialmente alrededor de defaults/fallbacks ya corregidos.
- Falta un sistema de metricas/tracing para saber realmente cuantos tokens/llamadas ahorra cada flujo.

### Lo que falta para ser 11/10

- Security plugin o integracion de auditoria de secretos/permisos/comandos.
- Observabilidad: metricas por tool, latencia, bytes/tokens aproximados, errores y tasa de retries.
- Replay/snapshots: reproducir una sesion de swarm desde estado guardado.
- Migraciones de estado: versionado formal de locks/queues/registry/memory.
- Release hardening: provenance, changelog automatizado, matrix Node/Bun y smoke de CLI instalada.
- Benchmarks: repos grandes, muchos agentes, locks concurrentes, payloads grandes.
- Docs operativas: "como correr esto en un proyecto real", "como reparar estado", "como configurar plugins".

---

## 1. Estado verificado

### Tests y typecheck

Comando ejecutado:

```bash
bun run validate
```

Resultado:

- TypeScript: limpio.
- Vitest: **63 archivos pasados**.
- Tests: **415 passed | 10 skipped | 425 total**.
- Duracion local aproximada: 4,73 s para Vitest.

Esto es una senal fuerte. No solo hay tests: cubren concurrencia, corrupcion de estado, locks, cola, output schemas, CLI, scaffold, plugins y e2e.

### Tamano y distribucion

El proyecto tiene unas **19.501 lineas TypeScript** bajo `packages/core/src` y `plugins/*/src`.

Archivos mas grandes:

| Archivo | Lineas | Opinion |
|---|---:|---|
| `plugins/proposals/src/lib/agents/persistent-task-queue.ts` | 827 | Logica critica, bien testeada, pero densa. |
| `packages/core/src/lib/scaffold/scaffold-host.ts` | 629 | Mucho template; aceptable, pero podria dividirse. |
| `plugins/proposals/src/lib/agents/task-queue-engine.ts` | 591 | Potente, pero mezcla validacion, acciones y detalles de I/O. |
| `plugins/proposals/src/lib/agents/agent-closure-report.ts` | 483 | Dominio complejo; merece docs internas. |
| `packages/core/src/lib/cli/assemble.ts` | 477 | Es el corazon de boot; esta razonablemente claro. |
| `plugins/proposals/src/lib/swarm/round-context-sources.ts` | 461 | Ya se separo de un monolito mayor, buena direccion. |

No es un problema fatal, pero el nucleo de `proposals` merece una segunda ronda de modularizacion por responsabilidad.

---

## 2. Lo que esta PERFECTO

### 2.1 Contrato de plugins

`packages/core/src/lib/plugins/plugin-contract.ts` es probablemente el mejor archivo del core. El contrato es pequeno, fuerte y claro:

- `register(ctx)` recibe todo lo que necesita.
- `ctx.workspace` evita que los plugins adivinen rutas.
- `optionsSchema.safeParse` permite validacion sin acoplarse demasiado a una version concreta de Zod.
- `tools/prompts/resources/knowledge/skills` son opcionales y componen bien.

La regla "no `process.cwd()` dentro de plugins" esta bien expresada y el codigo actual la respeta mucho mejor que versiones previas.

### 2.2 Escritura atomica y mutex

`writeFileAtomic` escribe en el mismo directorio y luego hace `rename`, evitando `EXDEV` y lecturas parciales. `withFileMutex` cubre el bug que `writeFileAtomic` no puede cubrir: lost updates en read-modify-write concurrente.

Esto es de nivel produccion para stores locales. En un sistema multiagente basado en ficheros, esta decision separa un juguete de una herramienta seria.

### 2.3 Cuarentena de corrupcion

`quarantineCorruptFile` y `CorruptFileError` son exactamente la semantica correcta: un JSON corrupto no se trata como estado vacio. Se preservan bytes, se informa y se evita que un agente sobrescriba un estado que podria contener trabajo real.

### 2.4 Registro determinista de tools

`planRegistrationOrder` es puro, determinista y falla rapido en duplicados o anchors inexistentes. Esto es crucial en MCP: si el servidor registra tools de manera ambigua, el agente aprende una topologia falsa.

### 2.5 Tool response uniforme

`toolJson`, `toolOk` y `toolError` empujan al proyecto hacia JSON compacto, `structuredContent` y envelopes consistentes. Es una decision excelente para modelos y clientes MCP modernos.

---

## 3. Lo que esta MUY BIEN

### 3.1 Core CLI y ensamblado

`assembleCliConfig` hace lo correcto:

- CLI > config file > defaults.
- Carga plugins con contexto por plugin.
- Cualifica tools por namespace.
- Expone `overview`, `knowledge`, `get_validation_matrix`, `status`, bootstrap y scaffold.
- Reutiliza el diagnostico de config en `doctor`, sin doble lectura.

Tambien es buena decision preparar el blueprint despues de arrancar el servidor, fuera del path critico de boot.

### 3.2 `overview` como cold-start

El `overview` es una de las mejores ideas del proyecto. Un agente no tiene que llamar tool por tool para descubrir capacidades. Ademas ya tiene:

- `compact:true`;
- filtro por `tag`;
- lista de knowledge ids;
- `recommendedNextAction`.

Esto reduce tokens y reduce errores de planificacion.

### 3.3 `proposals` como coordinador multiagente

El plugin `proposals` es el centro de gravedad del repo. Es complejo, pero tiene piezas muy buenas:

- locks con mutex;
- cola persistente;
- backpressure;
- reparacion de estado;
- registry de agentes;
- slices disjuntos;
- continuacion de propuestas;
- auto-work anti-loop;
- round-context con hashes;
- cierre/verificacion;
- nombres de agentes;
- chaos/concurrency tests.

No es perfecto por densidad, pero conceptualmente es muy fuerte.

### 3.4 `git` ya no bloquea el event loop

`plugins/git/src/lib/git.ts` usa `execFile` async, timeout y resultado `{ ok, output, reason }`. Ademas los tools llaman `checkRepo` antes de devolver status/log/diff.

Esto corrige dos problemas clasicos:

- no confundir "git no disponible" con "repo limpio";
- no bloquear el servidor MCP hasta 15 s por llamada.

### 3.5 `search` esta bien orientado a tokens

`searchWorkspace`:

- usa FS async;
- ignora directorios caros;
- capa tamano de fichero a 1 MiB;
- capa resultados;
- capa preview de linea;
- devuelve `{file,line,text}`;
- permite roots y case sensitivity.

Es justo el tipo de herramienta que evita que un agente lea medio repo.

### 3.6 `memory` ya tiene forma seria

`memory` tiene:

- store persistente;
- mutex para save/remove;
- cuotas de notas, titulo, body y tags;
- ranking BM25-lite;
- `list` paginado;
- corrupcion preservada.

Es mucho mejor que una memoria "append-only" sin control.

### 3.7 `notification` ataca el polling

El plugin `notification` mira el lock file y emite mensajes cuando un claim desaparece. Es una buena idea porque una de las mayores fuentes de desperdicio en swarms es "consulto otra vez si el lock sigue ocupado".

No elimina todos los bucles, pero baja bastante el riesgo de polling tonto.

---

## 4. Lo que esta BIEN

### 4.1 CI

`.github/workflows/ci.yml` tiene:

- typecheck;
- tests;
- `bun install --frozen-lockfile`;
- pack smoke por paquete;
- cancelacion de runs superseded.

Es una CI buena para el tamano actual. Para 11/10 falta matriz de runtimes, provenance y release smoke real.

### 4.2 TypeScript

`tsconfig.base.json` es estricto:

- `strict`;
- `noUncheckedIndexedAccess`;
- `exactOptionalPropertyTypes`;
- `verbatimModuleSyntax`;
- `isolatedModules`;
- `noImplicitReturns`.

Muy buena base. El repo esta escrito con suficiente disciplina para que estas flags no parezcan decorativas.

### 4.3 Scaffold

El scaffold ya no genera el modelo personalizado antiguo y ya separa `buildHostConfig(workspaceRoot)` de `startServer(process.cwd())`. Eso es correcto: el entrypoint puede leer el cwd; una libreria no.

El scaffold tambien genera agentes e instrucciones que apuntan a `overview`, lo cual refuerza la idea MCP-first.

### 4.4 `quality`

`quality` usa `spawn`, timeout y tail de salida. Es justo lo que debe hacer un runner de validacion para agentes: no bloquear, no vomitar logs enteros, distinguir timeout.

---

## 5. Lo REGULAR

### 5.1 Persistencia pretty-print y respuestas pretty-print

Todavia hay varios `JSON.stringify(..., null, '\t')` o `null, 2`, incluyendo algunas respuestas de tools:

- `scaffold-tool`;
- `round_context`;
- `sync_proposals`;
- `get_proposal_workflow`;
- stores de `proposals`;
- store de `memory`;
- manifest de `rules`.

Para ficheros humanos puede ser aceptable. Para respuestas MCP en caliente, no. El proyecto ya tiene `toolJson`; deberia usarse casi en todas partes.

Impacto: bajo-medio en una llamada aislada, medio en sesiones largas de swarms.

### 5.2 `docs` plugin usa FS sincrono

`plugins/docs/src/lib/engine.ts` usa `readdirSync`, `statSync`, `readFileSync`. Tiene caps y defaults razonables, asi que no es fatal. Pero queda por debajo del nivel de `search`, que ya migro a FS async.

En repos con muchos docs o filesystem lento, una llamada a `docs_list` puede bloquear el event loop.

### 5.3 `deps` es util pero superficial

El plugin `deps` detecta:

- manifest;
- lockfile;
- ranges demasiado sueltos;
- duplicados entre secciones.

Esta bien como healthcheck offline, pero no detecta:

- dependencias no usadas;
- paquetes obsoletos;
- vulnerabilidades;
- licencias;
- drift workspace/package;
- constraints por package manager.

Para 11/10 necesita un modo avanzado opcional.

### 5.4 `rules` materializa todos los presets

`ensureRulesCache` escribe todos los presets de `RULE_PRESETS`, no solo los detectados. Es robusto y simple, pero no es ideal:

- mete mas ruido en cache;
- puede confundir a humanos;
- hace mas I/O de la necesaria;
- aumenta la superficie de mantenimiento.

No rompe nada, pero no es elegante.

### 5.5 Algunas validaciones usan rutas como si fueran absolutas

En `task-queue-engine.ts`, la validacion de `waitFor.file` hace `existsSync(wf.file)`. Si el valor es workspace-relative, depende del cwd del proceso. Eso no corrompe estado, pero puede producir falsos negativos en hosts lanzados desde otro directorio.

El patron correcto seria resolver contra `workspaceRoot` o documentar/forzar que `waitFor.file` sea absoluto. Dado el contrato del proyecto, mejor inyectar resolver.

### 5.6 Idempotencia de `subscribe` solo en memoria

`deliveredDigests` en `task-queue-engine.ts` es un `Set` de proceso. El comentario lo reconoce: si reinicia el proceso, se pueden redeliver digests una vez.

No es grave, pero para swarms largos y servidores reiniciables, lo perfecto seria persistir esa idempotencia en un sidecar por observer task.

### 5.7 Comentarios obsoletos

Hay comentarios que ya no describen el estado real, por ejemplo el comentario de `ITaskQueuePaths.lockPath` habla de fallback cwd-relative, pero el flujo actual lo inyecta correctamente desde `proposals`.

Esto no rompe runtime, pero si rompe confianza al leer el codigo. En un framework de agentes, los comentarios son parte del contrato mental.

---

## 6. Lo MAL

No veo un "fatal" actual tipo corrupcion garantizada, cwd en engines criticos o tests rotos. Pero si hay problemas que yo corregiria antes de vender esto como 11/10.

### 6.1 Falta observabilidad real

El proyecto habla mucho de eficiencia de tokens, y en gran parte la consigue, pero no la mide:

- no hay metricas por tool;
- no hay bytes de respuesta;
- no hay latencia;
- no hay numero de retries;
- no hay conteo de lock conflicts;
- no hay "top tools by token cost";
- no hay trazas de decisiones de `auto_work`.

Sin observabilidad, "gasta menos tokens" es una conclusion razonable, pero no demostrable.

### 6.2 Seguridad aun es una capa externa inexistente en el repo

Hay runners, comandos, lectura de workspace y tools que orientan agentes. Falta una capa propia de seguridad:

- deteccion de secretos;
- allow/deny de comandos;
- threat model por plugin;
- auditoria de permisos por tool;
- sanitizacion de paths centralizada;
- reporte de riesgos de supply chain.

El proyecto no parece inseguro, pero tampoco esta blindado.

### 6.3 Versionado/migracion de estado insuficiente para produccion larga

Hay `version: 1` en stores como locks/queue, pero no hay un subsistema formal de migraciones.

Para un proyecto local vale. Para muchos usuarios y versiones publicadas, falta:

- migradores `v1 -> v2`;
- backups antes de migrar;
- comando `doctor --migrate --dry-run`;
- compat policy;
- tests de fixtures historicos.

### 6.4 `proposals` tiene demasiada densidad

El plugin esta muy bien, pero concentra mucha semantica:

- propuestas;
- slices;
- locks;
- queue;
- registry;
- round context;
- continuity;
- closure;
- zombie repair;
- orchestration;
- names.

Como sistema funciona; como producto mantenible por terceros, puede intimidar. Le falta una guia de arquitectura interna y quizas separar subdominios en paquetes internos o carpetas mas explicitas.

---

## 7. Lo FATAL

No he encontrado un problema fatal actual en el estado revisado.

Lo mas cercano a fatal en versiones anteriores (cwd en engines, locks no atomicos, git sync, memory sin mutex, search sync) parece estar corregido o mitigado. Hoy los riesgos reales son de madurez operativa, no de "esto rompe el proyecto".

---

## 8. Analisis por plugin

### 8.1 `proposals`

**Nota:** muy alto.

Es el plugin estrella. Tiene arquitectura ambiciosa y muchas defensas anti-caos. Lo mejor:

- `agent_lock` usa mutex y atomic write.
- `state_health` y `state_repair` existen.
- `auto_work` evita seleccionar propuestas `in_progress` con lock activo.
- `continue_proposal` soporta `auto`, `plan`, `claim`.
- `round_context` ya esta dividido en modulos.
- `sync_proposals` usa layout inyectado.
- Hay chaos tests y concurrent claim tests.

Critica:

- demasiados modulos grandes;
- algunas respuestas siguen pretty-print;
- idempotencia de subscribe no persiste;
- validaciones de paths pueden depender del cwd;
- documentacion de operacion avanzada insuficiente.

Opinion: **esta muy cerca de perfecto**, pero necesita hardening de producto.

### 8.2 `memory`

**Nota:** muy alto.

Muy buen balance entre simpleza y utilidad. El store esta acotado, protegido por mutex en writes y tiene ranking lexical. `list` paginado es una mejora importante.

Critica:

- `readStore` es sync;
- `writeStore` pretty-print;
- no hay redaccion de secretos;
- no hay TTL/archivado por antiguedad;
- no hay namespaces por agente/proyecto mas finos.

Opinion: excelente como memoria local offline. Para 11/10, anadir redaccion, TTL y export/import.

### 8.3 `rules`

**Nota:** bien/muy bien.

Es util porque da una respuesta al problema "que reglas sigo aqui". Detecta areas, frameworks y prioriza configuracion propia del proyecto.

Critica:

- materializa todos los presets;
- el payload de `get_rules` puede crecer bastante;
- no ejecuta checks, solo recomienda comandos;
- no hay integracion profunda con `quality`.

Opinion: buen plugin orientador. Para ser excelente, deberia tener `compact`, filtro por preset/area y handoff directo a `quality`.

### 8.4 `git`

**Nota:** muy bien.

Ahora si: async, read-only, con errores estructurados y caps. Gran herramienta para ahorrar tokens: `changed`, `diff --stat`, `log`.

Critica:

- no ofrece diff parcial capado por fichero;
- no hay branch/upstream health detallado;
- no detecta conflictos/rebase/merge state.

Opinion: solido y limpio. Le falta un par de endpoints de diagnostico avanzado.

### 8.5 `search`

**Nota:** muy bien.

Async, capado y determinista. Hace justo lo necesario sin construir indices.

Critica:

- solo substring, no regex;
- no ranking por nombre/proximidad;
- no paginacion/cursor;
- no respeta automaticamente `.gitignore`.

Opinion: muy buen baseline. Para 11/10, anadir `regex`, cursor y `.gitignore` opcional.

### 8.6 `quality`

**Nota:** bien/muy bien.

Runner async, timeout, tail. El plugin es simple y correcto.

Critica:

- no hay cache de resultados;
- no hay parseo estructurado de errores por framework;
- no hay integracion directa con `rules`/`proposals`;
- no hay perfiles rapidos/lentos mas alla de scopes config.

Opinion: buena base. Para agentes, parsear fallos en formato accionable subiria mucho su valor.

### 8.7 `docs`

**Nota:** regular-bien.

Util y de bajo concepto: lista docs y lee docs. Tiene caps, evita traversal y extrae titulos.

Critica:

- FS sincrono;
- no hay secciones/headings;
- no hay busqueda dentro de docs;
- no hay resumen/chunks;
- no hay cache/fingerprint.

Opinion: cumple, pero es de los plugins menos maduros.

### 8.8 `deps`

**Nota:** regular-bien.

Correcto como checker offline minimo. Buen punto: no depende de red.

Critica:

- no detecta vulnerabilidades;
- no detecta deps no usadas;
- no mira workspaces completos salvo manifest indicado;
- no sabe de licencias;
- no genera plan de actualizacion.

Opinion: util como smoke, insuficiente como auditor de dependencias.

### 8.9 `notification`

**Nota:** muy bien.

Conceptualmente importante: convierte polling de locks en evento. Usa `fs.watch` sobre directorio, con polling fallback y `unref`.

Critica:

- trata lock corrupto como vacio, lo que evita crashes pero puede perder senales;
- no hay dedupe persistente;
- usa logging messages, no una cola durable de eventos;
- solo cubre lock releases, no cambios de queue/proposals.

Opinion: gran mejora de tokens. Para 11/10, convertirlo en event bus durable ligero.

---

## 9. Eficiencia de tokens

### Lo que reduce tokens de verdad

| Mecanismo | Valor |
|---|---|
| `overview` como primera llamada | Evita exploracion tool-by-tool. |
| `overview compact:true` y `tag` | Reduce payload en servidores con muchos plugins. |
| `knowledge` lazy | Evita meter instrucciones largas en contexto si no se necesitan. |
| `search` con hits capados | Evita leer archivos enteros para localizar codigo. |
| `git_changed` y `git_diff --stat` | Orienta cambios con coste minimo. |
| `quality` tail | Evita logs gigantes. |
| `round_context` con hashes | Evita releer docs sin cambios. |
| `memory_recall` ranking + limit | Evita listar toda la memoria. |
| `notification` | Reduce polling de locks. |

### Donde todavia se gastan tokens de mas

| Fuente | Problema | Fix |
|---|---|---|
| `round_context` | Pretty JSON y digest completo | `toolJson` + `fields` |
| `sync_proposals` | Payload puede crecer | `compact:true`, `changedOnly:true` |
| `get_proposal_workflow` | Workflow completo | modo `summary` por defecto |
| `rules_get_rules` | Convenciones/presets completos | filtro por `area`, `compact:true` |
| `docs_read` | Lee hasta 256 KiB | headings/chunks |
| `scaffold` | Report pretty | compacto en tool, pretty solo en ficheros |

### Veredicto de tokens

El proyecto esta **muy bien planteado para gastar menos tokens**. La combinacion `overview + lazy knowledge + search/git/docs/memory + compact JSON` es exactamente lo que conviene a agentes.

Pero aun no es 11/10 porque falta medirlo y porque varias herramientas nuevas todavia devuelven payloads mas grandes de lo necesario.

Estimacion cualitativa:

- Cold start con `overview compact:true`: excelente.
- Trabajo normal con propuestas: bueno/muy bueno.
- Swarm multiagente largo: bueno, pero mejorable por pretty payloads, round-context y eventos no durables.

---

## 10. Bucles, bloqueos y concurrencia

### Lo que esta bien protegido

- Locks con `withFileMutex`.
- Writes atomicos en locks/queue/registry criticos.
- `agent_lock` devuelve `lock-conflict` con `nextAction` anti-retry.
- `auto_work` evita propuestas `in_progress` ya reclamadas.
- `state_health` detecta backpressure y orphans.
- `state_repair` permite dry-run y execute.
- `notification` evita polling repetitivo.
- `continuity-enforcer` bloquea relecturas/retries indebidos segun politica.

### Riesgos residuales

| Riesgo | Severidad | Comentario |
|---|---|---|
| `subscribe` redeliver tras restart | Baja-media | Idempotencia solo in-memory. |
| Watcher no durable | Media | Si el cliente no escucha, el evento se pierde. |
| Validacion `waitFor.file` cwd-dependent | Media | Puede bloquear en hosts con cwd distinto. |
| Corrupt lock tratado como empty en notification | Baja-media | Evita crash, pero oculta un problema. |
| Tools sync en docs/deps/rules | Baja-media | Bloquean event loop si FS lento. |

### Veredicto de bucles/bloqueos

No veo bucles inevitables ni deadlocks obvios en el estado actual. El diseno esta conscientemente hecho para que el agente no se quede repitiendo una accion bloqueada.

La parte que falta para perfeccion es pasar de "detecto y reparo" a "prevengo y observo":

- eventos durables;
- metricas de retry;
- bloqueo por proposal/slice mas explicito;
- persistencia de entrega de digests;
- reparacion automatica configurable.

---

## 11. Skills, herramientas y agentes que faltan

### Skills recomendadas

| Skill | Valor | Por que |
|---|---:|---|
| `mcp-core-operator` | ⭐⭐⭐⭐⭐ | Guia para arrancar, diagnosticar, reparar y configurar un server real. |
| `proposal-swarm-runner` | ⭐⭐⭐⭐⭐ | Instrucciones compactas para usar `proposals` sin caer en loops. |
| `mcp-plugin-author` | ⭐⭐⭐⭐½ | Como crear plugins externos usando `IMcpPlugin` y buenas practicas. |
| `state-repair-playbook` | ⭐⭐⭐⭐ | Cuando usar `state_health`, `state_repair`, `agent_lock gc`, etc. |
| `token-budget-playbook` | ⭐⭐⭐⭐ | Politicas para usar `overview compact`, `search`, `docs`, `memory` sin gastar de mas. |
| `security-review-playbook` | ⭐⭐⭐⭐ | Revisar commands, secrets, path traversal, permisos y supply chain. |

### Tools o plugins recomendados

| Tool/plugin | Valor | Comentario |
|---|---:|---|
| `metrics` | ⭐⭐⭐⭐⭐ | Latencia, bytes de respuesta, errores, retries, top tools. |
| `security` | ⭐⭐⭐⭐⭐ | Secret scan, command policy, dependency advisories opcionales. |
| `replay` | ⭐⭐⭐⭐½ | Reproducir decisiones de swarm desde snapshots. |
| `events` | ⭐⭐⭐⭐½ | Event bus durable para locks, queue, proposals. |
| `migrations` | ⭐⭐⭐⭐½ | Versionado y migracion de stores. |
| `bench` | ⭐⭐⭐⭐ | Benchmarks de repos grandes/concurrencia/payloads. |
| `docs_chunks` | ⭐⭐⭐½ | Leer docs por heading o chunk, no por fichero completo. |
| `deps_advanced` | ⭐⭐⭐½ | Licencias, outdated, unused, vuln opcional. |

### Agentes recomendados

| Agente | Valor | Funcion |
|---|---:|---|
| `mcp-core-operator` | ⭐⭐⭐⭐⭐ | Mantiene config, salud, releases y reparaciones. |
| `plugin-curator` | ⭐⭐⭐⭐½ | Revisa consistencia de plugins, schemas, output y docs. |
| `security-auditor` | ⭐⭐⭐⭐½ | Threat model y hardening de commands/paths/secrets. |
| `token-economist` | ⭐⭐⭐⭐ | Detecta payloads caros y propone compact modes. |
| `state-forensics` | ⭐⭐⭐⭐ | Analiza locks/queue/registry corruptos o bloqueados. |

---

## 12. Que haria para llevarlo a 11/10

### P0 - Pulido critico de excelencia

1. Cambiar todas las respuestas MCP pretty-print a `toolJson`.
2. Resolver `waitFor.file` contra workspace root o validar explicitamente que sea absoluto.
3. Persistir idempotencia de `subscribe`.
4. Limpiar comentarios obsoletos y contratos que mencionan fallbacks ya eliminados.
5. Migrar `docs` a FS async.

### P1 - Operabilidad

1. Plugin `metrics`: latencia, bytes, errores, retries, calls por tool.
2. Event bus durable para `notification`.
3. `doctor` extendido: state, plugins, schemas, config, stores, migrations.
4. Snapshots/replay de estado de `proposals`.
5. Docs operativas reales: setup, repair, swarm, release.

### P2 - Seguridad y producto

1. Plugin `security`: secrets, commands, path traversal, permissions.
2. Migraciones formales de stores.
3. Release workflow con changelog/provenance/matrix.
4. Benchmarks de repos grandes y concurrencia.
5. `deps` avanzado opcional con red.

### P3 - UX de agentes

1. Skills oficiales para operador, plugin author y swarm runner.
2. `rules` + `quality` integrados.
3. `docs_read` por headings/chunks.
4. `search` con regex/cursor/gitignore.
5. `memory` con TTL, redaccion de secretos y export/import.

---

## Tabla de calificaciones

| Dimension | Nota |
|---|---|
| Arquitectura general | ⭐⭐⭐⭐⭐ Perfecta |
| Contrato de plugins | ⭐⭐⭐⭐⭐ Perfecta |
| Seguridad concurrencia / I/O | ⭐⭐⭐⭐½ Muy bien |
| Eficiencia de tokens (LLM) | ⭐⭐⭐⭐½ Muy bien |
| Diseno libre de bucles/bloqueos | ⭐⭐⭐⭐½ Muy bien |
| TypeScript / tipado | ⭐⭐⭐⭐⭐ Perfecta |
| Testing | ⭐⭐⭐⭐⭐ Perfecta |
| CI / Release | ⭐⭐⭐⭐ Bien |
| Documentacion (README/docs) | ⭐⭐⭐⭐ Bien |
| Plugin `proposals` | ⭐⭐⭐⭐½ Muy bien |
| Plugin `memory` | ⭐⭐⭐⭐½ Muy bien |
| Plugin `rules` | ⭐⭐⭐⭐ Bien |
| Plugin `git` | ⭐⭐⭐⭐½ Muy bien |
| Plugin `search` | ⭐⭐⭐⭐½ Muy bien |
| Plugin `quality` | ⭐⭐⭐⭐ Bien |
| Plugin `docs` | ⭐⭐⭐½ Regular-Bien |
| Plugin `deps` | ⭐⭐⭐½ Regular-Bien |
| Plugin `notification` | ⭐⭐⭐⭐½ Muy bien |
| Securecoder / seguridad externa | ⭐⭐½ Flojo |
| Scaffold / Blueprint | ⭐⭐⭐⭐½ Muy bien |
| Observabilidad / metricas | ⭐⭐½ Flojo |
| Migraciones de estado | ⭐⭐⭐ Regular |
| Extensibilidad / futuro | ⭐⭐⭐⭐½ Muy bien |
| Preparacion para produccion amplia | ⭐⭐⭐⭐ Bien |

---

## Tabla de lo que anadiria y cuanto valor aporta

| Anadiria | Valor | Motivo |
|---|---|---|
| Plugin `metrics` | ⭐⭐⭐⭐⭐ Maximo | Convertiria la eficiencia de tokens y salud del server en datos medibles. |
| Plugin/skill de seguridad | ⭐⭐⭐⭐⭐ Maximo | Es la mayor ausencia para decir "11/10" con tranquilidad. |
| Event bus durable | ⭐⭐⭐⭐½ Muy alto | Reduciria polling y perdida de senales en swarms largos. |
| Persistencia de idempotencia `subscribe` | ⭐⭐⭐⭐½ Muy alto | Cierra un hueco real tras reinicios. |
| Migraciones formales de stores | ⭐⭐⭐⭐½ Muy alto | Necesario si se publica y evoluciona con usuarios reales. |
| Replay/snapshots de swarm | ⭐⭐⭐⭐½ Muy alto | Haria debug y auditoria de agentes muchisimo mas facil. |
| `docs` async + chunks/headings | ⭐⭐⭐⭐ Alto | Baja bloqueos y tokens en documentacion grande. |
| `rules` compact/area-first | ⭐⭐⭐⭐ Alto | Menos tokens y menos ruido para el agente. |
| `search` con regex/cursor/gitignore | ⭐⭐⭐½ Medio-alto | Mejora ergonomia, no es critico. |
| `deps` avanzado opcional | ⭐⭐⭐½ Medio-alto | Util, pero debe seguir offline por defecto. |
| Benchmarks de concurrencia/repos grandes | ⭐⭐⭐⭐ Alto | Demuestra rendimiento real y detecta regresiones. |
| Release hardening con provenance/changelog | ⭐⭐⭐⭐ Alto | Importante para confianza externa. |
| Redaccion de secretos en `memory` | ⭐⭐⭐⭐ Alto | Evita que la memoria persistente guarde credenciales por accidente. |
| Skill `mcp-core-operator` | ⭐⭐⭐⭐½ Muy alto | Ayudaria a usar todo esto correctamente sin releer el repo. |
| Skill `proposal-swarm-runner` | ⭐⭐⭐⭐½ Muy alto | Reduciria loops humanos/modelo en el flujo mas complejo. |

---

## Conclusión

`mcp-core` esta **muy bien construido**. Lo que mas me gusta es que no intenta resolver MCP con magia: lo resuelve con contratos pequenos, paths inyectados, tools descubribles, estado local bien protegido y respuestas estructuradas. Eso es exactamente lo que un framework para agentes necesita.

Lo que esta "fatal" hoy no es el codigo, sino la ambicion pendiente: si el objetivo es 11/10, ya no basta con que pase tests y coordine agentes; necesita observabilidad, seguridad, replay, migraciones, benchmarks y guias operativas. Esas capas harian que el proyecto dejase de ser "un framework muy bueno" y pasase a ser una plataforma MCP local realmente redonda.

Mi nota final: **9,1/10 ahora mismo**.  
Con P0+P1: **9,6-9,8/10**.  
Con seguridad, metricas, replay y migraciones: **10/10 real**.  
Con skills/agentes oficiales y experiencia de operador pulida: **11/10**.

---

## Estado actual

| Estado actual del proyecto | Valoracion |
|---|---|
| Madurez real hoy | ⭐⭐⭐⭐½ Muy alto |
| Preparado para uso interno serio | ⭐⭐⭐⭐⭐ Si |
| Preparado para publicar como plataforma impecable | ⭐⭐⭐⭐ Casi |
| Riesgo de bugs criticos inmediatos | ⭐⭐ Bajo |
| Riesgo de deuda operativa futura | ⭐⭐⭐ Medio |
| Capacidad de ahorrar tokens a agentes | ⭐⭐⭐⭐½ Muy alta |
| Capacidad de evitar bucles/bloqueos | ⭐⭐⭐⭐½ Muy alta |
| Falta para 10/10 | ⭐ Medio camino corto |
| Falta para 11/10 | ⭐⭐½ Capa de producto/operacion |

**Valoracion actual final:** ⭐⭐⭐⭐½ **9,1/10 - Proyecto muy fuerte, casi excelente.**  
La base tecnica ya esta en un nivel muy alto; lo que falta no es rehacer arquitectura, sino cerrar observabilidad, seguridad, migraciones, replay, docs operativas y pulido de payloads.
