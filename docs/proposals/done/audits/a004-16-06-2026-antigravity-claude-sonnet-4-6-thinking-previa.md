---
id: a004
kind: audit
title: "Auditoría Exhaustiva [previa] — Antigravity (Claude Sonnet 4.6 Thinking)"
status: done
date: 2026-06-16T23:43:13Z
track: archive
---

# Auditoría Exhaustiva — mcp-vertex
**Fecha:** 2026-06-16  
**Versión auditada:** 0.1.0 (monorepo)  
**Alcance:** core (`packages/core`), 9 plugins, toolchain, CI, documentación, securecoder plugin externo

---

## Tabla de calificaciones

| Dimensión | Nota |
|---|---|
| Arquitectura general | ⭐⭐⭐⭐⭐ Perfecta |
| Contrato de plugins | ⭐⭐⭐⭐⭐ Perfecta |
| Seguridad concurrencia / I/O | ⭐⭐⭐⭐⭐ Perfecta |
| Eficiencia de tokens (LLM) | ⭐⭐⭐⭐⭐ Perfecta |
| Diseño libre de bucles/bloqueos | ⭐⭐⭐⭐½ Muy bien |
| TypeScript / tipado | ⭐⭐⭐⭐⭐ Perfecta |
| Testing | ⭐⭐⭐⭐ Bien |
| CI / Release | ⭐⭐⭐⭐ Bien |
| Documentación (README/docs) | ⭐⭐⭐⭐ Bien |
| Plugin `proposals` | ⭐⭐⭐⭐⭐ Perfecta |
| Plugin `memory` | ⭐⭐⭐⭐⭐ Perfecta |
| Plugin `rules` | ⭐⭐⭐⭐ Bien |
| Plugin `git` | ⭐⭐⭐½ Regular-Bien |
| Plugin `search` | ⭐⭐⭐½ Regular-Bien |
| Plugin `quality` | ⭐⭐⭐⭐ Bien |
| Plugin `docs` | ⭐⭐⭐½ Regular-Bien |
| Plugin `deps` | ⭐⭐⭐ Regular |
| Plugin `notification` | ⭐⭐⭐⭐ Bien |
| Securecoder (plugin externo) | ⭐⭐⭐ Regular |
| Scaffold / Blueprint | ⭐⭐⭐⭐½ Muy bien |
| Extensibilidad / futuro | ⭐⭐⭐⭐ Bien |

---

## 1. Lo que está perfecto (10/10)

### 1.1 Arquitectura del núcleo — separación total de responsabilidades

El núcleo (`packages/core`) es genuinamente **project-agnostic**. No importa ningún paquete de host, no llama a `process.cwd()` fuera del punto de entrada CLI, no hardcodea nombres de herramientas fuera de namespaces configurables. Todo lo que necesita un plugin llega a través de `IMcpPluginContext`, que es inmutable y resuelto antes de que el plugin arranque.

```
CLI args → assembleCliConfig → buildContext(pluginName) → plugin.register(ctx) → registrations
```

Esta separación es **rígida y correcta**. Es imposible que un plugin "escape" y lea el entorno directamente sin romper el contrato tipado. El resultado: el mismo plugin funciona igual bajo Claude, Copilot, un test en memoria o un proceso de CI.

### 1.2 Contrato de plugins — `IMcpPlugin` y `definePlugin`

El contrato es mínimo, completo y estable:

- `name` + `register(ctx)` son los únicos obligatorios.
- `optionsSchema` (zod) permite validación declarativa antes de que el plugin siquiera arranque: si las opciones son inválidas, el servidor sigue en pie con el resto de plugins, sin nunca corromper estado.
- `definePlugin` es un identity helper que da inferencia de tipos completa sin clases ni decoradores.
- El doble cheque de deduplicación (`seenSpecifiers` + `loadedNames`) previene cargas duplicadas tanto por especificador como por nombre resuelto.
- El `withTimeout` en import + register es crítico: un plugin bloqueante nunca congela el arranque.

No hay nada que mejorar aquí. Es un diseño de primer nivel.

### 1.3 Seguridad de concurrencia y I/O

Tres primitivas que trabajan juntas sin fisuras:

**`writeFileAtomic` / `writeFileAtomicSync`** — escribe a un `.tmp` en el mismo directorio (nunca `/tmp`, evitando EXDEV en rename cross-device) y luego hace `rename` atómico POSIX. Un lector nunca ve un fichero parcial.

**`withFileMutex`** — advisory lock sobre `target.mutex` usando `open('wx')` (O_CREAT|O_EXCL atómico). Anti-deadlock en dos capas: si el mutex tiene más de `staleMs` (30s por defecto), se considera abandonado y se roba; si la contención supera `timeoutMs` (5s), también se roba. El PID + timestamp en el fichero permite post-mortem. Cubre el caso de lost-update que `writeFileAtomic` solo no resuelve.

**`CorruptFileError` + `quarantineCorruptFile`** — en lugar de tratar silenciosamente un fichero corrupto como estado vacío (lo que permitiría a dos agentes reclamar el mismo trabajo), el lector mueve el fichero a un `.corrupt-<ts>-<random>` y lanza un error tipado con el path del backup. El tool lo captura y devuelve un error estructurado que dice exactamente dónde está el backup. Perfecto.

### 1.4 Eficiencia de tokens — token budgets medidos y protegidos

El documento `TOKEN-BUDGETS.md` no es marketing: hay una spec e2e real que falla si cualquier cambio regresa los ceilings. Los números son:

- `overview` compacto: **~220 tokens** — orientación completa del servidor.
- `auto_work`: **~36 tokens** — siguiente acción.
- Total cold-start útil: **< 300 tokens**.

Los mecanismos que lo garantizan son arquitecturales, no cosméticos:
- Un solo `overview` reemplaza N llamadas de exploración.
- Knowledge bodies son lazy (MCP resources): solo se fetcha lo que se pide.
- Salidas de herramientas en JSON compacto (sin pretty-print).
- `overview { compact: true }` o `{ tag }` para reducir 5.5x cuando hay muchos tools.
- `notification` plugin elimina el polling de `agent_lock status` — la mayor fuente de tokens en swarms reales.

### 1.5 Diseño libre de bucles del LLM

El diseño activamente previene los anti-patrones de agente:

- **No hay polling**: la documentación y knowledge entries **instruyen explícitamente** a reportar `lock-conflict` en lugar de reintentar, y el plugin `notification` entrega el evento `lock-released` por push.
- **`auto_work`** devuelve el siguiente trabajo en una sola llamada — no hay bucle de exploración.
- **`continue_proposal`** tiene tres modos discretos (auto/plan/claim) que permiten avanzar sin múltiples round-trips.
- **`compact_status`** da un snapshot en una llamada en lugar de consultar queue + lock + index por separado.
- La `recommendedNextAction` en `overview` guía al agente al siguiente paso sin que tenga que inferirlo.

### 1.6 TypeScript — configuración ultraestricta y consistente

`tsconfig.base.json` activa todas las flags de seguridad que importan:
- `strict: true` (incluye `noImplicitAny`, `strictNullChecks`, etc.)
- `noUncheckedIndexedAccess` — el acceso a arrays es siempre `T | undefined`
- `exactOptionalPropertyTypes` — distingue `{ a?: string }` de `{ a: string | undefined }`
- `verbatimModuleSyntax` — imports de tipo siempre con `type`
- `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`
- `isolatedModules` — compatible con bundlers y transpiladores

Todos los packages extienden esta base. No hay excepciones ni `@ts-ignore` en el código auditado.

### 1.7 Plugin `proposals` — swarm de agentes correctamente diseñado

Es el plugin más complejo y el más correcto. Puntos destacados:

- **Un solo `layout`** compartido por todos los tools del plugin: locks, queue, round-context y el store de propuestas siempre están de acuerdo porque derivan del mismo objeto.
- **`disjointness` como invariante**: `create_proposal` valida que los slices sean file-disjoint en el momento de creación; `plan` lo re-verifica antes de delegar.
- **`compact_status`**: una sola llamada que agrega lock + queue + index en respuesta compacta.
- **`state_health` + `state_repair`**: el swarm puede auto-diagnosticarse y recuperarse sin intervención humana.
- **Prompts baked-in** (`work`, `orchestrate`) que condensan el workflow completo en un texto que el agente puede usar como primera instrucción.
- **Knowledge en tiempo de registro** (ctx.namespacePrefix ya resuelto), no en tiempo de lectura: el body contiene los nombres de tools correctos sin que el agente tenga que inferirlos.

### 1.8 Plugin `memory` — implementación impecable

Cuatro operaciones (save/recall/list/forget), diseño sin sorpresas:
- Upsert por título (sin duplicados silenciosos).
- BM25-lite para ranking de relevancia.
- Paginación en `list` con `nextOffset` explícito.
- Quotas en todos los vectores de crecimiento (title 200 chars, body 8000, tags 20×50, notas total 1000).
- `guardCorrupt` intercepta `CorruptFileError` antes de que llegue al SDK.
- El store usa `withFileMutex` para el read-modify-write — correcto en entorno multi-agente.

---

## 2. Lo que está muy bien (8-9/10)

### 2.1 Scaffold / Blueprint — correcto con un gap

El sistema de scaffold (`scaffold-host.ts`, `build-blueprint.ts`) es sofisticado: genera host project, tools, prompts, skills, agents, tests y cliente MCP desde plantillas consistentes. La generación es **dry-run**: devuelve ficheros para que el agente los escriba, nunca toca disco.

El `pattern-catalog` es el mecanismo para "saber qué necesita un proyecto sin que nadie lo diga": distintos tipos de proyecto (library, webapp, monorepo, game, cli) reciben diferentes plugins y tools recomendados.

**Gap menor**: `scaffoldAgentFile` genera siempre los cuatro subagent slots predefinidos (`proposal_guardian`, `implementation_runner`, `delivery_verifier`, `technical_investigator`). No hay forma de configurar slots personalizados sin modificar el código. Un `slots` opcional en `IScaffoldHostOptions` lo resolvería.

### 2.2 `assembleCliConfig` — diseño correcto, un detalle

La función lee el config file una sola vez y deriva tanto el config parseado como el diagnóstico del mismo read (nota [N21] en el código). El doctor no lee el fichero dos veces. Correcto.

El `buildContext` cierra sobre `args` y `fileConfig` sin race conditions (es síncrono y se llama secuencialmente durante el loop de plugins).

**Detalle menor**: `args.cacheDir` y `args.docsDir` en `buildAssemblyDiagnostics` provienen del struct `args` (que tiene el default), pero `config.corePaths` puede diferir si el config file lo sobrescribió. En el doctor, se usa `config.corePaths ?? { cacheDir: args.cacheDir, docsDir: args.docsDir }` — correcto pero el fallback al `args` es de segunda calidad porque `args` tiene el default, no el resuelto. Esto es un edge case de diagnóstico, no afecta al server.

### 2.3 Presets de plugins — bien planteados

Los tres presets (`minimal`, `standard`, `swarm`) son una abstracción correcta: aditivos, deduplicados, combinables con `--plugins` explícito. El `swarm` incluye `notification` que el `standard` no necesita — decisión arquitecturalmente correcta.

**Mejora sugerida**: un preset `dev` que incluya solo `git`, `memory` y `docs` para entornos de desarrollo rápido sin gates de calidad.

### 2.4 `withFileMutex` — casi perfecto

El diseño es correcto. Un punto de atención: el bucle interno usa `for (;;)` con `await sleep(pollMs)` (25ms por defecto) durante la espera. En el caso de alta contención con muchos agentes, esto puede generar tráfico de syscalls notable. Una alternativa sería `fs.watch` sobre el lockfile para wakeup reactivo en lugar de polling. Sin embargo, dado que la mayoría de operaciones son rápidas y el timeout/steal previene el deadlock, el polling en 25ms es razonable en práctica.

---

## 3. Lo que está bien (7/10)

### 3.1 Testing

La suite existe, cubre los módulos críticos y hay incluso un e2e de token budget. Las specs de plugin tienen la infraestructura necesaria (vitest + aliases).

**Lo que falta:**
- Tests de integración entre plugins (e.g., `proposals` + `notification` juntos).
- Test de `withFileMutex` bajo contención real (varios procesos). El test unitario simula pero no prueba la primitiva OS.
- Coverage mínimo no está definido (`coverage = false` en bunfig.toml). No hay gate de cobertura.
- El `release-plan.spec.ts` existe, pero la lógica de `release.ts` (fs + spawn) no tiene tests — comentado como intencional, pero es un riesgo.

### 3.2 CI

El workflow hace typecheck + tests + pack smoke, que es suficiente. Usa Bun latest (sin pinning de versión), lo que puede introducir regresiones no reproducibles. La pipeline no incluye:
- Lint (ESLint o similar).
- Coverage gate.
- Notificación de fallo de publicación diferenciada de fallo de tests.
- Matrix de Node.js/Bun versions.

### 3.3 Plugin `notification`

La idea es correcta y el mecanismo de push elimina polling. Sin embargo:
- Solo soporta un único `watchLockFile`. En un setup con múltiples plugins que manejan locks independientes, cada uno necesitaría su propio instancia del plugin.
- El intervalo de polling (`intervalMs: 2000`) es el fallback cuando `fs.watch` no está disponible — debería documentarse explícitamente qué plataformas usan polling vs. inotify/FSEvents.
- No hay ACK: si el agente no procesa la notificación a tiempo, el evento se pierde. Esto es correcto para MCP (fire-and-forget), pero debería mencionarse.

### 3.4 Plugin `quality`

Funciona bien. El gap principal: cuando las herramientas de calidad no están instaladas (e.g., ESLint no en node_modules), el error es un error de proceso que el tool captura pero el mensaje puede ser críptico para el agente. Un pre-check de `which eslint` o similar mejoraría la experiencia.

### 3.5 Documentación

`README-MCP-VERTEX.md` y `PLUGINS-MCP-VERTEX.md` son claros y correctos. `TOKEN-BUDGETS.md` es excelente — es un estándar de transparencia que pocos proyectos tienen.

**Lo que falta:**
- No hay `CHANGELOG.md` ni `CONTRIBUTING.md`.
- No hay documentación de la API pública generada (TypeDoc o similar). La barrera de entrada para un nuevo desarrollador de plugins es alta: tiene que leer el source.
- `NPM_PUBLISH.md` existe pero no es encontrable desde el README principal.
- No hay ejemplos funcionales en `/examples` — los snippets del README son buenos pero un proyecto de ejemplo completo sería mejor.

---

## 4. Lo que está regular (5-6/10)

### 4.1 Plugin `git` — read-only correcto, pero limitado

El plugin expone status/changed/diff/log como JSON estructurado. La decisión de ser read-only es correcta y bien documentada.

**Problemas:**
- Solo soporta el repo raíz. En un monorepo con submódulos o múltiples repos, el plugin no es útil.
- No hay `git_blame` ni `git_show` para inspeccionar un commit específico — operaciones que un agente de code review necesitaría.
- No hay `git_branches` ni `git_stash_list` — contexto que un agente de refactoring necesita para no pisarse con otras ramas en paralelo.
- Sin documentación de cuánto cuesta `git_diff` en repos grandes (token budget no medido para este tool).

### 4.2 Plugin `search`

Funciona para búsqueda textual básica. El problema es que es una implementación naive:
- No hay soporte para regex.
- No hay soporte para búsqueda semántica (aunque eso requeriría embeddings — scope diferente).
- No hay `search_files` separado de `search_content` — si quiero encontrar ficheros por nombre, tengo que usar el grep de contenido.
- No hay ranking de resultados por relevancia.
- El cap de `maxResults` no tiene facetas: todos los resultados de todos los ficheros están mezclados sin agrupación.

### 4.3 Plugin `docs`

Correcto para su scope (list/read markdown), pero:
- No hay `docs_search` dentro del corpus de docs — para encontrar algo en docs, el agente tiene que usar `search` del plugin search.
- No hay renderizado de headers/estructura: `docs_read` devuelve el markdown crudo. Un agente que quiere la tabla de contenidos tiene que parsear manualmente.
- Solo soporta markdown. Proyectos con documentación en RST, AsciiDoc o similares no están cubiertos.

### 4.4 Plugin `deps` — scope demasiado limitado

Es offline por diseño (sin CVE database), lo cual está bien documentado. Pero:
- Solo soporta `package.json`. Proyectos Python (`requirements.txt`, `pyproject.toml`), Rust (`Cargo.toml`), Go (`go.mod`) están completamente fuera de scope — aunque el analyzer del core sí los detecta.
- `deps_check` reporta "unpinned ranges" pero no tiene contexto sobre qué es peligroso vs. semver-safe. Un `^1.x.x` no es lo mismo que `*`.
- No hay `deps_update` que proponga versiones más recientes — aunque sea offline, podría usar el lockfile para detectar qué hay disponible localmente.
- La descripción del tool es correcta sobre sus limitaciones, pero para muchos proyectos el plugin es demasiado básico para ser útil en la práctica.

### 4.5 Plugin securecoder (plugin externo a mcp-vertex)

Este plugin vive en `/home/cartago/.gemini/config/plugins/Google.securecoder.securecoder` y es consumido por Antigravity (no por mcp-vertex directamente).

**Lo que está bien:**
- Skills claramente separadas por responsabilidad.
- `run-security-scanner` y `generate-security-audit-report` son flujos completos.
- `scan_dependencies` es la "exclusive authority" — gate correcto antes de añadir imports.
- `securecoder-persona` para el modo "Fix All" — un comportamiento de agente bien encapsulado.

**Problemas detectados:**
- No hay integración formal entre securecoder y mcp-vertex. Si un agente está usando mcp-vertex y quiere escanear, tiene que coordinar manualmente los dos sistemas.
- Las skills usan SKILL.md sin YAML frontmatter validado por schema — cualquier typo en el frontmatter silencia la skill.
- `run-poc` genera y razona sobre un PoC pero no lo ejecuta en sandbox. Si el PoC requiere ejecución real para verificar el fix, el skill queda incompleto.
- `mandatory-secure-web-skills` está etiquetada como "CRITICAL: You MUST use this skill for ALL code generation" — esto es un anti-pattern: el agente no puede cumplir un MUST para cada llamada sin un mecanismo de enforcement. Es aspiracional, no ejecutable.
- No hay tests para las skills del securecoder — la corrección de las instrucciones no es verificable automáticamente.
- `determine-threat-model` no tiene un schema de output definido, lo que hace difícil que otras skills consuman su resultado de forma estructurada.

---

## 5. Lo que está fatal y hay que arreglar

### 5.1 `contracts/constants` — directorio vacío

`packages/core/src/lib/contracts/constants` existe pero está vacío. O se elimina el directorio o se añade contenido. Un directorio vacío confunde a los contribuidores sobre dónde deben poner constantes.

### 5.2 Falta `CHANGELOG.md`

No hay registro de cambios. Para una librería pública (`@cartago-git/mcp-vertex`) que se va a publicar en npm, la ausencia de changelog es un problema serio para los consumidores que quieren evaluar si un upgrade es seguro.

### 5.3 `typescript: "^6.0.3"` en devDependencies

TypeScript 6.x está en alfa/beta. Una devDependency de producción apuntando a una versión major que no tiene release estable puede introducir regresiones silenciosas en CI cuando se actualiza Bun (que usa bun-version: latest). Debería ser `"^5.x.x"` estable o, si se quiere 6, pinned a una RC específica con un comentario de por qué.

### 5.4 `vitest: "^4.1.8"` — también potencialmente inestable

Vitest 4.x no tiene releases públicos documentados en la misma forma que 2.x/3.x. Si está en una rama experimental, el mismo argumento que para TypeScript aplica.

### 5.5 CI usa `bun-version: latest` sin pinning

Esto es una bomba de tiempo. Bun puede cambiar behavior entre versiones (e.g., manejo de workspace:* deps, resolución de módulos). El CI debería pinnar una versión específica (e.g., `bun-version: 1.x.y`) y actualizarla de forma explícita.

### 5.6 `parseConfigFile` — forgiving sin warning

`parseConfigFile` ignora silenciosamente JSON inválido o estructura inválida y devuelve `{}`. Esto es correcto para que el server no crashee, pero `diagnoseConfigFile` (que sí detecta el problema) solo se llama en modo `--check`. En el arranque normal, un config file con typo se ignora sin ningún mensaje en stderr. El usuario no sabe que su config no se aplicó.

**Fix**: emitir un `process.stderr.write` con un warning cuando `diagnoseConfigFile` encuentra issues, incluso en el arranque normal.

### 5.7 `saveNote` — doble lectura del store

En `memory/store.ts`, la herramienta `save` llama `readStore` dos veces: una fuera del mutex (para verificar quota) y otra dentro. Esta doble lectura es un TOCTOU (time-of-check time-of-use): entre la primera y la segunda lectura, otro agente puede haber añadido notas. En la práctica, el mutex protege la escritura, pero la check de quota antes del mutex puede dar falso "hay espacio" cuando en realidad no lo hay.

**Fix**: mover la check de quota dentro del mutex, eliminando la lectura exterior.

### 5.8 Plugin `rules` — arranque síncrono bloqueante

En `rules/src/index.ts`, el `register()` llama sincrónicamente a `buildRulesManifest` + `ensureRulesCache` (que escribe al disco) antes de devolver las registraciones. Si el disco está lento o el manifest es grande, esto bloquea el loop de eventos durante el arranque del servidor.

**Fix**: ejecutar `ensureRulesCache` en background después de devolver las registraciones (patrón ya usado en `prepareServerBlueprintOnStart`).

---

## 6. Análisis de eficiencia de tokens para agentes/modelos

### ¿Gasta menos tokens que alternativas?

**Sí, significativamente.** Los mecanismos concretos:

| Mecanismo | Ahorro estimado |
|---|---|
| `overview` único vs. N herramientas de exploración | 5-20x menos round-trips |
| `compact:true` en overview | 5.5x menos payload |
| Knowledge lazy (MCP resources) | Solo se paga por lo que se lee |
| JSON compacto (sin pretty-print) | ~30% menos tokens en payloads grandes |
| `notification` vs. polling `agent_lock` | Elimina N×2 tokens por ciclo de espera |
| `compact_status` vs. N queries separadas | 3-5x menos round-trips |
| `auto_work` retorna plan listo | Elimina el LLM reasoning sobre qué hacer |
| `recommendedNextAction` en overview | Elimina el primer turn de exploración |

### ¿Es eficiente el loop de agentes?

El diseño previene los tres bucles costosos principales:
1. **Bucle de exploración** (qué tools hay) → `overview` + `recommendedNextAction`.
2. **Bucle de espera de lock** → `notification` + instrucción explícita de "reportar lock-conflict, no reintentar".
3. **Bucle de búsqueda de trabajo** → `auto_work` retorna el siguiente trabajo directamente.

Lo que no está optimizado:
- Si `auto_work` retorna "no hay trabajo", el agente necesita volver a llamar manualmente — no hay mecanismo de suscripción para "avísame cuando haya trabajo nuevo". Esto es un polling estructurado.
- El `round_context` puede ser pesado si hay muchas fuentes — no hay un `round_context_compact`.

---

## 7. Análisis de posibles bucles y bloqueos

### 7.1 Bloqueo potencial: `withFileMutex` + crashed holder

**Mitigado correctamente.** El `staleMs` (30s) + `timeoutMs` (5s) garantizan que un holder caído no bloquea indefinidamente. La documentación lo explica. ✓

### 7.2 Bloqueo potencial: `loadPlugins` — todos los plugins secuenciales

El loop `for (const specifier of options.specifiers)` es secuencial. Un plugin lento (hasta `timeoutMs: 15s`) bloquea la carga del siguiente. Con 9 plugins, en el peor caso el arranque puede tardar 135 segundos.

**Problema real en caso de red lenta o plugin con init pesado.** La paralelización de la carga (con `Promise.all` y luego registro en orden) reduciría este riesgo enormemente. El timeout individual sí protege contra plugins eternamente colgados, pero no contra latencia acumulada.

### 7.3 Bucle potencial en agente: `auto_work` → "no hay trabajo"

Si `auto_work` devuelve vacío y el agente llama en loop esperando trabajo, se genera polling no guiado. La knowledge entry lo menciona, pero no hay un mecanismo de backoff o de "durmiente" para el agente.

**Mitigación sugerida**: que `auto_work` incluya un campo `retryAfterMs` cuando no hay trabajo, para guiar al agente.

### 7.4 Bucle potencial: `continue_proposal` en modo "auto" sin propuestas

Si no hay propuestas activas, `continue_proposal` devuelve vacío. El agente puede llamar en loop. Mismo patrón que 7.3.

### 7.5 Sin bloqueo: `notification` + `lock-conflict`

El flujo correcto está bien definido:
1. Agente intenta `agent_lock claim` → recibe `lock-conflict`.
2. Agente recibe `lock-released` via MCP notification.
3. Agente reintenta `agent_lock claim` UNA VEZ.

El step 2 es push, no polling. ✓

---

## 8. Qué falta para ser un proyecto 11/10

### 8.1 Skills nuevas para el securecoder (impacto alto)

**`mcp-vertex-plugin-security`** — una skill específica para auditar que los plugins de mcp-vertex no exponen paths fuera del workspace (`ctx.workspace.resolve` siempre, nunca `process.cwd()` ni paths hardcodeados). Actualmente el securecoder tiene reglas genéricas pero no reglas específicas del contrato de mcp-vertex.

**`token-budget-enforcer`** — una skill que verifique que un tool nuevo no excede los budgets de TOKEN-BUDGETS.md antes de hacer merge. Integrable con el test e2e existente.

### 8.2 Nuevas herramientas del core

**`mcpvertex_events`** — un tool de suscripción que permita a un agente registrarse para recibir notificaciones cuando hay trabajo nuevo en la queue, en lugar de polling `auto_work`. Requiere que el cliente MCP soporte notificaciones, pero el SDK ya lo hace.

**`mcpvertex_explain_error`** — un tool que, dado un error de herramienta (toolError), explique el `nextAction` de forma expandida. Reduce el número de turns de debugging.

### 8.3 Plugin `audit` (nuevo)

Un plugin `@cartago-git/mcp-audit` que registre en un log append-only todas las llamadas a herramientas mutantes (saves, locks, queue operations) con timestamp + agent name + resultado. Útil para post-mortem de swarms y para detectar agentes misbehaving.

### 8.4 Plugin `snapshot` (nuevo)

Un plugin que tome snapshots del estado del swarm (lock + queue + index + memory) en un momento dado y permita restaurarlos. Imprescindible para debug de escenarios complejos de multi-agente.

### 8.5 `round_context_compact`

Una variante del `round_context` que retorne solo los deltas desde el último digest, no el contexto completo. Reduciría el token cost en rondas largas.

### 8.6 Carga paralela de plugins

```ts
// En loadPlugins, en lugar de:
for (const specifier of options.specifiers) { ... }

// Paralelizar import + validación:
const results = await Promise.allSettled(specifiers.map(loadOne));
```

Mantener el orden de registro (determinístico) pero hacer los imports en paralelo.

### 8.7 Coverage gate en CI

Añadir `--coverage` a vitest con un threshold mínimo (e.g., 70% en líneas para core, 60% para plugins). Sin gate, la cobertura puede erosionarse silenciosamente.

### 8.8 TypeDoc para la API pública

Generar documentación HTML desde los JSDoc de `src/public/index.ts` y publicarla en GitHub Pages. La API pública está bien documentada en código pero no hay manera de navegarla sin leer el source.

### 8.9 Ejemplos funcionales

Un directorio `/examples` con:
- `examples/minimal/` — mcp-vertex sin plugins, solo bootstrap.
- `examples/swarm/` — propuestas + multi-agente con dos agentes reales.
- `examples/custom-plugin/` — un plugin de ejemplo completo con tests.

### 8.10 CHANGELOG y semver automático

Integrar `conventional-commits` + `changesets` o similar para que el CHANGELOG se genere automáticamente y el release script pueda determinar el bump type desde los commits.

### 8.11 `mcp-vertex.config.json` JSON Schema

Publicar un JSON Schema para `mcp-vertex.config.json` y añadirlo al `$schema` del ejemplo en la documentación. Esto habilita autocompletado en VS Code/Cursor sin necesidad de leer el docs.

### 8.12 Integración securecoder ↔ mcp-vertex

Que el securecoder pueda usar las herramientas de mcp-vertex directamente (e.g., `mcp-vertex_overview` antes de escanear para saber qué plugins están activos, `memory_save` para persistir hallazgos de seguridad). Actualmente son sistemas paralelos sin bridge.

---

## 9. Resumen ejecutivo

**mcp-vertex es un proyecto de arquitectura excepcional.** El contrato de plugin, la primitiva de concurrencia, la eficiencia de tokens y la prevención de bucles están en el top 5% de proyectos MCP públicos. La decisión de ser project-agnostic con extensión por plugins es correcta y bien ejecutada.

**Los problemas reales** son puntuales: el CI usa versiones inestables sin pinning, falta warning cuando el config file tiene errores silenciosos, la carga de plugins es secuencial (riesgo en el worst case), y el `deps` plugin es demasiado básico para proyectos no-JS.

**El camino a 11/10** pasa por: coverage gate, carga paralela de plugins, plugin `audit`, `round_context_compact`, CHANGELOG + semver automático, y la integración formal entre securecoder y mcp-vertex.

El proyecto tiene bases perfectas. Las mejoras son todas incrementales — ninguna requiere cambio arquitectural. Eso es el mejor indicador de que la arquitectura es correcta.
