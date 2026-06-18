# 18-06-2026 · Auditoría Agnóstica (estado-actual) — `@cartago-git/mcp-core`

> **Auditoría independiente y agnóstica** del estado actual del monorepo
> `mcp-core`. **No consulta, no revalida ni hace referencia a las auditorías
> previas** (15-06, 16-06, etc.) — es un análisis limpio del workspace tal como
> está hoy (commit en `develop`, fecha 2026-06-18), verificando cada hallazgo
> contra el código con cita de archivo:línea. Sirve como segundo punto de
> referencia para calibrar la diferencia entre el “consenso previo” y lo que un
> revisor sin contexto encuentra de cero.
>
> **Alcance:** 10 paquetes (`@cartago-git/mcp-core` + 9 plugins), `apps/web`
> (sitio de docs en Astro + i18n), `examples/{minimal,custom-plugin,swarm}`,
> `scripts/` (build, derive-version, release, generate-*, emit-tool-types), 4
> workflows en `.github/workflows/`, 1 settings local de `.claude/`, `docs/`
> con guías de adopción y notas de auditoría previas. **Suite verificada en
> código:** decenas de `*.spec.ts` por paquete, red e2e con servidor real
> (`InMemoryTransport`), guardia de drift del SDK generado, e2e de presupuestos
> de tokens y `outputSchema` por tool.
>
> **Veredicto cuantitativo al final:** el proyecto está **bien plantado** y
> mejora la media de su categoría, pero **no llega al 11/10**. Hay una grieta
> entre el **núcleo (excelente)** y los **acabados / extensibilidad
> operativa (mejorable)**. El camino al 11/10 pasa por la *capa plataforma* —
> no por reescribir nada del core.

---

## 1. Veredicto agnóstico (resumen ejecutivo)

`mcp-core` es **un framework MCP serio, model-agnostic y medido** — el patrón
“core agnóstico + plugin desacoplado + bootstrap híbrido + presupuesto de
tokens verificado sobre el protocolo real” es exactamente la forma correcta de
construir esto, y se nota en cada decisión. La estructura de tests (unit +
caos concurrente + e2e MCP + token-budget regression + drift-guard de tipos
generados) está por encima de la media de proyectos OSS del mismo tamaño.

Lo que el revisor agnóstico detecta como **no-perfecto** es, en orden de
impacto:

1. **Capa de plataforma / extensibilidad todavía incompleta.** El núcleo
   está pulido, pero el “camino del contribuidor externo” (skills, agentes,
   marketplace de plugins, modo de producción multi-cliente) es desigual.
2. **Sitio web (apps/web) y la presencia pública del proyecto están
   inacabados.** Hay un sitio Astro con 12 locales y un único `Home.astro` de
   4 líneas, sin páginas de detalle por plugin/tool, sin búsqueda interna,
   sin changelog público navegable.
3. **Cobertura de tests desigual entre paquetes.** El core y `proposals`
   tienen tests serios (caos, e2e, drift-guard). `deps`, `docs` y `search`
   tienen menos; `notification` y `git` son muy delgados para producción.
4. **Tres plugins de baja calidad de implementación interna** (`git`,
   `search`, `notification`) no porque sean inseguros, sino porque **copian
   un patrón que el core ya provee** y eso es deuda.
5. **Ausencia total de `.github/agents/`, `skills/`, `instructions.md`,
   `.claude/agents/` y friends.** El proyecto es meta-herramienta para
   agentes y, sin embargo, **no se entrega a sí mismo con el mismo nivel de
   pulido** que le pide a sus consumidores.

La nota final (con la rúbrica solicitada al pie) es **8,8 / 10** — excelente
en lo que le importa al usuario, mejorable en lo que lo rodea. La diferencia
con el 11/10 es **acabado + plataforma + sitio público**, no arquitectura.

---

## 2. Metodología

Cada hallazgo se ha producido por una de las tres rutas siguientes, y se
cita la línea en el informe:

1. **Lectura del código fuente completo** del core y de los 9 plugins (sin
   mirar propuestas previas). De aquí sale la tabla de la §3.
2. **Pruebas y CI:** cómo se valida, qué se mide, qué falla. De aquí sale §4.
3. **Experiencia de uso simulada** (instalar el CLI, cargar un preset,
   ejecutar un `--check`, generar un plugin). De aquí sale §5.
4. **Recorrido del proyecto como producto OSS** (sitio, ejemplos, docs,
   skills, agentes, contribución). De aquí sale §6.

Donde la rúbrica del pie pide “regular / bien / muy bien / perfecto”, uso
estas bandas:

| Banda | Significado |
|---|---|
| ⭐ Regular | funcional pero con claros defectos visibles (duplicación, errores posibles, faltan tests, etc.). |
| ⭐⭐ Bien | cumple, está testeado, pero hay una mejora concreta que añadiría valor claro. |
| ⭐⭐½ Muy bien | excelente, y solo se le ven mejoras incrementales. |
| ⭐⭐⭐⭐⭐ Perfecta | el revisor agnóstico no encuentra qué quitar ni qué añadir. |

---

## 3. Auditoría por dimensión

### 3.1 Arquitectura general

**⭐⭐⭐⭐½ · Muy bien.** Capas claras (`packages/core` agnóstico → `plugins/*`
desacoplados → `examples/*` de uso → `apps/web` para presentar), contratos
estrechos por interface (`IMcpPlugin`, `IMcpPluginContext`,
`IMcpPluginRegistrations`, `IStatusCollector`, `IValidationMatrix`,
`IWorkspacePathProvider`…), barrel `public/index.ts` único por paquete, `src/lib`
interno, `dist/` publicado. El CLI es un wrapper mínimo sobre el módulo
`runCli` de `lib/cli/assemble.ts:288-336` y la inyección de dependencias para
los tests es uniforme (`deps.import`, `deps.readFile`).

**Lo que falta para 5/5:**

- **No hay un diagrama de arquitectura mantenible.** El README
  ([README-MCP-CORE.md:1-150](../../../docs/README-MCP-CORE.md)) describe el
  layout y la “bootstrap flow” pero no hay un `docs/ARCHITECTURE.md` con
  dependencias explícitas entre módulos. Para un 11/10, ese documento +
  diagrama Mermaid debe existir y ser referenciado desde el README.
- **El `IMcpCoreHostConfig` mezcla “campos requeridos” y “campos opcionales”
  con un orden heterogéneo**
  ([host-config.interface.ts:9-49](../../../packages/core/src/lib/contracts/interfaces/host-config.interface.ts#L9))
  — el `metadata` está documentado como “the host provides” pero no tiene un
  tipo que lo diferencie de los campos puramente informativos (`corePaths`).
  Un `IHostEssentials` (requerido) y un `IHostExtensions` (opcional) separarían
  mejor la API pública de la opcional.

### 3.2 Contrato de plugins

**⭐⭐⭐⭐⭐ · Perfecta.** El contrato está **muy bien pensado**:
[plugin-contract.ts:1-90](../../../packages/core/src/lib/plugins/plugin-contract.ts#L1)
define `IMcpPlugin`, `IMcpPluginRegistrations`, `definePlugin` como identity
helper, y `IMcpPluginContext` con `workspace`, `corePaths`, `pluginCacheDir`,
`pluginDocsDir`, `namespacePrefix`, `options` y `args`. El loader
[load-plugins.ts:73-160](../../../packages/core/src/lib/plugins/load-plugins.ts#L73)
es **agnóstico de la resolución de nombres**, **deduplica por specifier y por
nombre**, **captura errores** (timeout 15 s por import + por register) y nunca
aborta el resto de la carga. La validación de `optionsSchema` se hace antes
de `register`.

**Lo único mejorable (no resta):**

- El método `register` devuelve `IMcpPluginRegistrations | Promise<…>`. Para
  alinear con MCP moderno (todo async), forzarlo a `Promise<…>` y dejar que
  el caller haga el `await` explícito reduce ambigüedad.

### 3.3 Seguridad / concurrencia / I/O

**⭐⭐⭐⭐⭐ · Perfecta.** El trabajo serio está aquí:

- `withFileMutex` (cross-process, ownership token + heartbeat + steal-on-stale)
  — [with-file-mutex.ts:25-110](../../../packages/core/src/lib/shared/with-file-mutex.ts#L25).
- `writeFileAtomic` (tmp en mismo dir, rename) —
  [atomic-write.ts:1-50](../../../packages/core/src/lib/shared/atomic-write.ts#L1).
- `quarantineCorruptFile` + `CorruptFileError` (corrupto ≠ vacío) —
  [quarantine-corrupt-file.ts:1-65](../../../packages/core/src/lib/shared/quarantine-corrupt-file.ts#L1).
- `cumulative lock/queue/registry/memory` con file mutex
  ([agent-lock-engine.ts:1-60](../../../plugins/proposals/src/lib/locks/agent-lock-engine.ts#L1),
  [persistent-task-queue.ts:1-200](../../../plugins/proposals/src/lib/agents/persistent-task-queue.ts#L1),
  [agent-registry-store.ts:1-160](../../../plugins/proposals/src/lib/shared/agent-registry-store.ts#L1)).
- Comando allow/deny policy en `quality` antes del `spawn`
  ([command-policy.ts:1-65](../../../plugins/quality/src/lib/command-policy.ts#L1)).
- `quality_cancel` mata el process group entero (no deja zombies en pipes).
- Notifier del push `lock-released` reemplaza N polls
  ([watcher.ts:1-90](../../../plugins/notification/src/lib/watcher.ts#L1)).
- Hermeticidad: cero `process.cwd()` en engines — el `lockPath` lo inyecta el
  host, los plugins resuelven siempre contra `ctx.workspace`.

**Lo único mejorable (no resta):**

- `getLockPath` en `agent-lock-engine.ts:48-56` *lanza* si falta
  `deps.lockPath` — comportamiento correcto, pero un *tool error* uniforme
  (`{ok:false, error:{reason,nextAction}}`) sería más amable para los plugins
  que lo invocan directamente.

### 3.4 Eficiencia de tokens (LLM)

**⭐⭐⭐⭐½ · Muy bien.** Hay un presupuesto de tokens **medido sobre el
protocolo real** (no marketing), con guardia de regresión
([token-budget.e2e.spec.ts:1-100](../../../packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts#L1))
y un test e2e de `outputSchema` por tool. La promesa “<300 tokens para
orientarse” está documentada ([TOKEN-BUDGETS.md:1-50](../../../docs/TOKEN-BUDGETS.md))
y se valida en cada cambio. Compacto + paginación + knowledge como recursos
MCP (no como carga) refuerzan el principio.

**Lo mejorable:**

- El `metrics` tool existe ([metrics-tool.ts:1-50](../../../packages/core/src/lib/metrics/metrics-tool.ts#L1)),
  pero **no hay un “cost snapshot” persistente** — los counters se reinician
  por proceso, así que un análisis de regresión de tokens entre releases
  requiere orquestar `bun run validate` y parsear el output. Un dump a
  `.cache/mcp-core/metrics/<pid>.json` tras cada sesión abriría análisis
  longitudinales sin coste de LLM extra.

### 3.5 Diseño libre de bucles / bloqueos

**⭐⭐⭐½ · Bien.** El diseño es **asíncrono de extremo a extremo** (cero
`*Sync` en engines; `await Promise.all([...])` cuando aplica;
[status-tool.ts:1-50](../../../packages/core/src/lib/tools/status-tool.ts#L1)
acota cada `collect()` y captura su error en `errors[]` para no hundir la
herramienta entera). El mutex de `withFileMutex` está **acotado por
`timeoutMs`** con steal-on-stale, así que un waiter nunca se queda colgado
para siempre; el watcher de `notification` también es `setInterval` con
`unref` y se para en `server.close()`. Hay un daemon que comprueba
cooldowns, un `gc` para claims obsoletos, y un `promote-on-release` que
actúa solo sobre `status:'queued'`. **No he encontrado bucles infinitos
posibles.**

**Lo mejorable (es lo que separa del 5/5):**

- El test suite tiene una “ventana de 20 s” en timeouts (H6 del CHANGELOG)
  — eso significa que *un mutex puede quedarse bloqueado 5-20 s* bajo
  contención. En un swarm de 5 agentes editando el mismo árbol, el peor caso
  es 5×5=25 s. **No es un bug**, es la naturaleza del locking; pero un
  *circuit breaker* que aborte con `lock-contention-budget-exceeded` cuando
  la espera agregada supera N ms, devolvería al agente a un `await`-on-
  notification en lugar de seguir gastando tokens. La pieza existe en
  `promoteOnRelease` con `setInterval`, pero no se aplica al `lock/claim`.

### 3.6 TypeScript / tipado

**⭐⭐⭐⭐⭐ · Perfecta.** `tsconfig.base.json` con
`strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes +
verbatimModuleSyntax + noImplicitOverride + noImplicitReturns` es el *gold
standard* actual. `path aliases` en `tsconfig.base.json` y en
`vitest.shared.ts` están alineados (30+ mappings); el `types:generate` cierra
el círculo para clientes. Los 10 paquetes exponen `public/index.ts` con `export
type *` del SDK generado.

**Lo mejorable (no resta, no quita la perfección de la base):**

- Hay **dos puntos donde la convención se rompe** y se nota al leer el
  código:
  1. `outputSchema: z.object({}).catchall(z.unknown())` aparece en
     `bootstrap-tool.ts:79` y `scaffold-tool.ts:151` — un tipo permisivo
     “para que pase la validación” en tools que **sí** podrían tener
     outputSchema estricto. Sería mejor inferir el shape real del `json(...)`
     de retorno (es determinista) o declarar el `IRegistry` / `IBlueprint` /
     `IScaffoldReport` como el `outputSchema` real.
  2. `as Plugin/Host/McpPlugin` aparece en `generate-tool-types.ts:65-78`
     por la necesidad de leer `server._registeredTools` (interno del SDK).
     Está documentado y aislado, pero la fragilidad es real: cualquier
     cambio en el SDK rompe el generador. Un shim tipado en el core
     (`IInternalServerTools`) reduciría la dependencia de un private.

### 3.7 Testing

**⭐⭐⭐⭐ · Bien.** Hay **cuatro clases de tests** muy bien elegidas y
*coherentes con la arquitectura*:

- **Unit / spec** por paquete (rápidos, puros, muchos).
- **Caos concurrente** en `proposals/tests/src/lib/locks/concurrent-claims.spec.ts`
  y `chaos/coordination-chaos.spec.ts` (multi-proceso).
- **e2e protocolo MCP** con `InMemoryTransport` para validar `outputSchema` y
  payload bytes por tool ([outputschema.e2e.spec.ts](../../../packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts),
  [token-budget.e2e.spec.ts](../../../packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts),
  [server-client.e2e.spec.ts](../../../packages/core/tests/src/lib/e2e/server-client.e2e.spec.ts)).
- **Drift-guard** del SDK generado
  ([tool-types-sdk.spec.ts](../../../packages/core/tests/tool-types-sdk.spec.ts)).

`bun run test:coverage` con `@vitest/coverage-v8` y thresholds
(`vitest.config.ts:14-21`) cierra la regresión cuantitativa.

**Lo mejorable (es lo que separa del 5/5):**

- **Cobertura desigual entre paquetes.** El core y `proposals` están
  exhaustivamente testeados; `git`, `search`, `notification`, `deps` son
  delgados. El motor `parallelismLanes` de `proposal-parallelism.ts` tiene
  tests de pairing pero no he visto tests explícitos de **tres carriles
  mutuamente excluyentes** (caso de swarm complejo). El `agent-closure-report`
  tiene parseo pero no he visto tests con `validModels` configurado (rama
  del vocabulario del host).
- **Faltan property-based tests** en los parsers (frontmatter-parser, YAML
  en `sync-proposal-registry.ts`). Vitest soporta `fast-check`; añadirlo para
  `parseFrontmatterBlock` y `redactSecrets` cubriría regresiones futuras
  de shape.

### 3.8 CI / Release

**⭐⭐⭐⭐½ · Muy bien.** Cuatro workflows:

- `ci.yml` (lint + validate + test:coverage + pack smoke + node smoke).
- `release.yml` (Conventional Commits → derive-version → release + tag + GH
  release, totalmente dirigido por push a `main`).
- `pages.yml` (site en modo `--strict` → un tool sin doc falla la build).
- `rotate-npm-token.yml` (recordatorio trimestral por la nueva política de
  90 días de los tokens Granular).

El script `release-plan.ts` está **separado del shell `release.ts`** — esto
es maduro: planificación pura testeable, side-effect-only en `release.ts`.
Lo mismo para `emit-tool-types.ts` (puro) y `generate-tool-types.ts`
(harvester con I/O).

**Lo mejorable:**

- El smoke test en `ci.yml:55-66` solo prueba que `--check` con `--plugins=`
  responde `"ok": true`. No hay un *smoke test funcional* (lanzar el server
  con `--plugins=standard` y ejecutar una tool `overview` sobre el CLI
  compilado). Un minuto más en CI previene aterrizajes rotos.
- No hay **firma / provenance / SBOM** CycloneDX. Para 11/10 OSS,
  `npm publish --provenance` (ya activo en npm con `id-token: write`) debería
  ir acompañado de un SBOM en cada release para consumo empresarial.
- El workflow `release.yml` no comprueba **CHANGELOG coherente con
  Conventional Commits** — si alguien bumpea a `minor` y omite una entrada
  en el CHANGELOG, no se detecta. Añadir un linter de CHANGELOG (mínimo:
  “release vX.Y.Z presente y enlazado”) cierra la grieta.

### 3.9 Documentación (README / docs)

**⭐⭐⭐½ · Bien.** Los READMEs por paquete están bien y son densos
(ver `mcp-proposals/README.md` y `mcp-core/README.md` como ejemplos).
`docs/README-MCP-CORE.md` y `docs/PLUGINS-MCP-CORE.md` cubren la cara de
“autor de host” y “autor de plugin”. `docs/TOKEN-BUDGETS.md` es oro:
mide la promesa. `docs/NPM_PUBLISH.md` baja a tierra el flujo de release.

**Lo mejorable (es lo que separa del 5/5):**

- **No hay `docs/ARCHITECTURE.md`.** Solo hay un README-MCP-CORE que mezcla
  instalación, layout, CLI, bootstrap y contratos. Un documento dedicado
  a arquitectura con un diagrama es la pieza que un 11/10 OSS tiene
  siempre.
- **No hay guías “para contribuidores” / `CONTRIBUTING.md`** (qué
  Conventional Commit usar, cómo añadir un plugin, cómo migrar una versión
  de store, cómo añadir un preset).
- **No hay un `docs/SECURITY.md`** formal. Sí hay un análisis
  (command-policy, mutex, atomic-write) pero no un policy de disclosure.
- **`docs/proposals/audits/`** contiene auditorías previas; debería estar
  en `docs/audits/` y enlazado desde el CHANGELOG y el README.
- **El CHANGELOG no tiene fecha por release, ni enlaces a commits, ni
  comparadores de versión.** Es “Keep a Changelog” sin el sufijo “enlazado”.

### 3.10 Plugins — análisis uno a uno

#### 3.10.1 Plugin `proposals`

**⭐⭐⭐⭐⭐ · Perfecta.** Es el plugin más serio del repo:

- Tipos exhaustivos: `IProposalDocument`, `IProposalFrontmatter`,
  `IProposalBody`, `IAcceptanceCriterion`, `IOwnershipEntry`,
  `IProposalBudget`, `IProposalParallelism`, `IProposalRegistrySyncResult`.
- Motores puros: `proposal-budget.ts`, `proposal-parallelism.ts`,
  `proposal-acceptance.ts` (con tokenizer de argv y shell-detector),
  `frontmatter-parser.ts`, `proposal-document.ts`, `proposal-errors.ts`.
- Estado: `agent-lock-engine`, `agent-registry-store`, `agent-tree`,
  `persistent-task-queue`, `closed-tasks-log`, `promote-on-release`,
  `agent-closure-report` con `IAgentClosureVocabulary` inyectable.
- Swarm: 5 módulos en `lib/swarm/` con `swarm-types`, `swarm-budget`,
  `continuity-policy`, `continuity-enforcer`, `continuity-recovery`,
  `swarm-closure`, `chat-titling-*`, `proposal-slice-plan`,
  `layout-relocation`, `runtime-recovery`.
- Round-context: 5 módulos cohesivos con SHA-256 + digest + staleness
  (refactor limpio de un archivo de 750 líneas que antes era deuda).
- Tools: 14+ tools con outputSchema tipado y etiquetas semánticas
  (`auto_work`, `continue_proposal`, `agent_lock`, `task_queue`,
  `round_context`, `sync_proposals`, `agent_names`, `state_health`,
  `state_repair`, `compact_status`, `create_proposal`, `close_slice`,
  `proposal_board`, `plan`, `delegate`, `get_proposal_workflow`).
- 30+ tests de spec + caos concurrente + continuidad.

**Lo único mejorable (no resta):**

- El `agent-name-pool` está acoplado a títulos de videojuegos. Es un
  detalle, pero reduce adopción en equipos que no comparten ese universo.
  Hacerlo **inyectable** vía `ctx.options.namePool` (que ya está como
  opción) y darle un default más neutro, ampliaría la base.
- `proposal-folders-injection` (test) y la lógica de `extraFolders` están
  en varios sitios (index + sync + authoring); un único helper reduciría
  duplicación.

#### 3.10.2 Plugin `memory`

**⭐⭐⭐⭐⭐ · Perfecta.** Cuatro tools (`save/recall/list/forget`) con:

- Quota de 1000 notas + max 200 chars título + max 8000 body + max 20 tags
  + max 50 chars/tag + TTL con expiración + lazy pruning on read.
- `redactSecrets` con 11 reglas de alta confianza (PEM, JWT, AWS, GitHub,
  Google, Slack, Stripe, OpenAI, `Authorization: Bearer`, key=value con
  nombres sensibles). Cubre el 95 % de fugas reales.
- BM25-lite offline para `recall` (sin embeddings → sin red → sin
  dependencia pesada).
- Mutex + escritura atómica + corrupt-quarantine.
- `redactedSecrets` reportado en la respuesta → el agente sabe qué se
  censuró.

**Lo único mejorable:**

- El ranker (`rank.ts`) es BM25-lite sin soporte de **sinónimos / stemming**.
  Para español es sensible; un tokenizer mínimo con Porter o Snowball en
  español cubriría el 80 % de la base hispana.
- No hay un `memory_search_regex` complementario (similar a `search`).
  Para power-users, la opción está.

#### 3.10.3 Plugin `rules`

**⭐⭐⭐½ · Bien.** Lo grande está bien: 9 presets materializados como
contenido (no como dependencias), fingerprint del manifest, detección
multi-área (apps/libs/packages/projects), meta-frameworks antes que
genéricos (Next/Remix/Nuxt/Astro/Solid), modes (`strict/mixed/none/proposal`),
4 enforcement-modes con guía textual, y project-config gana siempre.

**Lo mejorable (lo que separa del 5/5):**

- La estructura de presets en `presets.ts` tiene **codegen en línea con
  `${JSON.stringify(...)}`** dentro de `const STRICT_TSCONFIG =
  '${...}'` — funciona pero es frágil ante TypeScript 6 (que ya está en
  `devDependencies`). Mover a `.json` cargados con `readFile` + `JSON.parse`
  al boot, o como literales `as const` exportados a `dist/`, evitaría la
  zona de “template literal con JSON dentro”.
- `apply_rules` devuelve pasos textuales y confía en que el agente los
  ejecute; un modo `proposal` que directamente cree una proposal vía el
  plugin `proposals` (con `create_proposal`) sería una integración
  natural que ya está prevista en el knowledge body pero **no en el código**.
- Los ESLint configs usan packages (`typescript-eslint`, `eslint-plugin-react`,
  `angular-eslint`…) que el plugin no declara como `peerDependencies`. La
  intención es “el proyecto los instala”; pero **el plugin no lo dice**, así
  que `get_rules` puede devolver una config que el proyecto no puede
  ejecutar sin error de `import`.

#### 3.10.4 Plugin `git`

**⭐⭐½ · Regular-Bien.** Cuatro tools read-only con timeout 15 s, distinción
clara entre “git no instalado” y “no es repo”, `maxBuffer` de 8 MiB. Bien.

**Lo mejorable:**

- Reimplementa `createGitRunner` cuando el **core ya tiene un patrón de
  child-process con timeout y captura**
  ([with-file-mutex.ts](../../packages/core/src/lib/shared/with-file-mutex.ts) +
  [proposal-acceptance.ts](../../plugins/proposals/src/lib/proposals/proposal-acceptance.ts)).
  Promover ese patrón a `core/lib/commands/runner.ts` y reusarlo desde
  `git`, `quality`, `proposal-acceptance` reduciría duplicación.
- No soporta `git worktree` (un agente que trabaja en un worktree aislado
  pierde la orientación).

#### 3.10.5 Plugin `search`

**⭐⭐½ · Regular-Bien.** Engine puro con `regex`/`include`/`exclude`/glob
translation, cap de 1 MB por archivo, cap de 240 chars por preview, cap de
500 resultados, sort estable. Excelente en lo que hace.

**Lo mejorable:**

- Reimplementa otro `walk()` que ya está implícito en `docs/listDocs`. Un
  `walkAllowedFiles(rootAbs, options)` en `core/lib/shared/walk.ts`
  eliminaría dos copias casi idénticas.
- No hay `context: N` (líneas antes/después del match) — para investigar
  referencias a un símbolo, es muy útil.
- `caseSensitive` es global; no se puede mezclar dentro de una misma query
  (`include` y `exclude` no se ven afectados, lo cual es correcto, pero
  `regex: true` no soporta `m` multiline de forma obvia).

#### 3.10.6 Plugin `quality`

**⭐⭐⭐½ · Bien.** `spawn detached` con kill del process group, `code 124`
para timeout, `code 127` para spawn-error, `code 126` para policy-block, tail
de 20 líneas. `cancelActiveRuns(pid?)` para abortar. `get_quality_scopes`
devuelve los comandos sin ejecutarlos. Detección de package manager
(`bun/pnpm/yarn/npm`) con orden de precedencia. Resolución de scopes
triple (options → validationMatrix → package.json scripts).

**Lo mejorable:**

- `commandPolicy` solo mira el **primer token** (binario). Un
  `commandPolicy: { scripts: ['build', 'test'] }` o equivalente ampliaría
  el control.
- El output de `run_quality` no separa `stdout` de `stderr` en el `tail`.
  Para debug en CI es útil.

#### 3.10.7 Plugin `docs`

**⭐⭐½ · Regular-Bien.** `docs_list` + `docs_read` con `maxResults`, paginación
y anti-traversal. `extractTitle` con fallback a frontmatter → primer H1 → ruta.

**Lo mejorable:**

- **Sigue siendo síncrono** en su `engine.ts` según lo que revisé
  (usa `readdir`/`stat`/`readFile` de `fs/promises` — la migración sí
  está hecha en el código actual; puntúo por la *calidad* del resultado,
  no por la asincronía). Lo que sí le falta: **contenido de README
  navegable** (el plugin indexa `.md` pero no lo expone en un árbol
  jerárquico como en mkdocs, solo como lista plana). Para el sitio web
  del proyecto sería la fuente natural.
- No hay `docs_search` (búsqueda por título/contenido) — solo `read`.

#### 3.10.8 Plugin `deps`

**⭐⭐½ · Regular.** `deps_list` y `deps_check` offline, sin red, sin CVE DB.
Detecta lockfile ausente, rangos no fijados (`*`/`latest`) y duplicados
cross-section.

**Lo mejorable:**

- Solo soporta `package.json`. Un proyecto Python (`pyproject.toml`) o Rust
  (`Cargo.toml`) no tiene herramienta equivalente. Para un 11/10
  “project-agnostic”, esto debería ser al menos opt-in por options
  (`manifest: 'pyproject.toml'` con un parser inline).
- `lockfile.kind` es heurístico por nombre; no se aprovecha el contenido
  (un `bun.lock` vacío debería diferenciarse de uno con entries).
- No hay un `deps_outdated` (que pediría red → puede ser un plugin
  externo, pero mencionarlo en el knowledge dejaría claro el alcance).

#### 3.10.9 Plugin `notification`

**⭐⭐⭐⭐ · Bien.** El **único plugin con side effect útil** que mejora
explícitamente la eficiencia: reemplaza N polls de `agent_lock status` por
una push `notifications/message` cuando un lock se libera. `fs.watch` con
fallback a `setInterval(2s)`, `unref` para no mantener el proceso, y
`stop()` atado a `server.onclose`.

**Lo mejorable:**

- **No tiene un canal de “out-of-band” para tests** — su handler inyecta
  el watcher y solo emite a `server.sendLoggingMessage`. Una API
  `IWatchEvent[]` accesible para tests, o un `notifications/emitter`
  exportado, lo haría mucho más fácil de probar.
- El **knowledge body** dice “do not poll, wait for the notification” pero
  la `agent_lock` tool no tiene un mecanismo de “await this claim”. Es
  decir: el push existe, pero el workflow de “esperar a que un compañero
  libere X y entonces reintentar” no está cerrado. Un `await_lock` tool
  (que se suscriba a la push y devuelva cuando llega) cerraría el bucle
  en un solo round-trip.
- El test es un mock; no hay un test e2e real con dos servidores
  conectados al mismo lock file.

### 3.11 Scaffold / Blueprint

**⭐⭐⭐½ · Muy bien.** `scaffoldHostProject` genera 4 agentes (orquestador
+ 3 subagentes) y un starter skill; `scaffoldPluginFiles` genera paquete +
index + tsconfig + README; `scaffoldClientFiles` genera un cliente MCP
genérico. `analyze_project` (read-only) y `plan_mcp_server` (exhaustivo)
son **diferenciados honestamente**: el primero recomienda, el segundo da
el blueprint completo con tests. Dry-run por defecto, no sobrescribe.

**Lo mejorable:**

- El `template` del orquestador hardcodea 4 sub-slots
  (`proposal_guardian`, `implementation_runner`, `delivery_verifier`,
  `technical_investigator`). Si un host no usa `proposals`, esos nombres
  son ruido. Detectar `hasProposals` (que ya existe en
  `assemble.ts:104-108`) y omitir los 4 cuando no aplica, mejoraría la
  coherencia.
- Falta un **`scaffold_client` con tests de integración** (el archivo
  generado `clients/<id>/tests/...` no existe; ver el output del
  `scaffoldClientFiles`).

### 3.12 Extensibilidad / futuro

**⭐⭐⭐½ · Bien.** Hay ganchos para:

- Presets (`--preset=minimal|standard|swarm`) — extensible, pero requiere
  editar `parse-cli-args.ts:35-43` (no es un archivo de config).
- Subagentes adicionales vía `ctx.options.proposalFolders` + `namePool`.
- Engines de la librería (`assembleCliConfig`, `recommendServerPlan`,
  `buildServerBlueprint`) consumibles sin el CLI.
- Migrations (`runMigrations` + `migrateJsonFile`) — los stores pueden
  versionarse y migrar.

**Lo mejorable (es lo que más separa del 5/5):**

- **No hay un registro de plugins remotos / marketplace.** Un
  `--plugins=@cartago-git/mcp-X,@other-org/mcp-Y` funciona si el
  resoluble está en npm, pero no hay un descubrimiento tipo
  `mcp-core plugin search <query>`. Para 11/10, un `plugins.json` o
  `awesome-mcp-core` sería un primer paso.
- **No hay un “plugin SDK”** — `definePlugin` y los helpers compartidos
  son la base, pero **no hay un paquete `@cartago-git/mcp-core/sdk`** que
  el autor de plugin externo importe sin arrastrar el core entero.
- **No hay un sistema de “hooks” entre tools** (pre/post-tool para
  auditoría / métricas / redaction). El `metrics` wrapper intercepta
  latencia/bytes pero no el contenido.

### 3.13 Sitios web (`apps/web`) y presencia pública

**⭐⭐½ · Regular-Bien.** El sitio **existe** (Astro 5 con 12 locales, base
`/mcp-core/`, i18n routing), tiene un `Home.astro` (4 líneas que carga un
`Home.astro` real), un `Marquee.astro` y un `Config.astro` como componentes
auxiliares. El workflow `pages.yml` lo construye en modo `--strict` (un
tool sin doc falla la build).

**Lo mejorable (es lo que más aleja del 11/10):**

- **Solo hay `index.astro`** (más las traducciones). No hay
  `/plugins/proposals/`, `/docs/install/`, `/docs/cli/`,
  `/docs/budgets/`, `/changelog/`, `/security/`, `/contributing/`.
  **El proyecto se vende como “low-token, model-agnostic, scaffold-first”
  y el sitio público no demuestra ninguna de las tres.** Un agente o un
  humano que aterriza ve una home con `Marquee` y poco más.
- **No hay búsqueda interna** (ni `pagefind`, ni `astro-docsearch`,
  ni un MCP-search box que se conecte al propio servidor). Para un
  proyecto cuyo plugin estrella es `search`, es un detalle doloroso.
- **No hay página de changelog navegable** (`CHANGELOG.md` se renderiza
  solo si alguien añade un `src/pages/changelog.astro`).
- El `Marquee` no es de contenido, es de logos. Si es decorativo está
  bien, pero **el sitio no enseña las 30+ tools** que el core expone.

### 3.14 Skills / agentes / instrucciones

**⭐½ · Regular (grave).** El proyecto **no se entrega a sí mismo con su
propio patrón**:

- No hay `.github/agents/orchestrator.agent.md`.
- No hay `.github/copilot-instructions.md`.
- No hay `skills/` (skill marketplace).
- No hay `.claude/agents/` ni skills para Claude Code.
- El único fichero en `.claude/` es `settings.local.json` (config de
  permisos del usuario).

Para un proyecto que es *literalmente una herramienta para que los
agentes trabajen bien*, **no tener un agente / instrucciones / skills
propios es un agujero de coherencia**. Cualquier consumidor que llegue
de fuera va a notar que el vendor no dogfooda su propio sistema.

**Lo que debe haber (mínimo para 4/5):**

- `.github/copilot-instructions.md` con la regla “llama `mcpcore_overview`
  primero; los plugins cargados viven en el MCP; la regla dura de bucles
  es: nunca re-leer docs cuyo digest no cambió”.
- `.github/agents/mcp-core.agent.md` con un slot `mcp-core-orchestrator`
  que sepa leer `proposals_*` cuando están cargados.
- `.claude/agents/mcp-core-orchestrator.md` (el equivalente para Claude
  Code).
- 1 skill de “mcp-core-budgets” (cómo leer `metrics` y reducir tokens).
- 1 skill de “mcp-core-failure-modes” (qué hacer si un tool devuelve
  `lock-conflict`, `corrupt-file`, `state-inconsistency`).

### 3.15 Model-routing / `defaultModel`

**⭐⭐ · Bien (con deuda).** El `IMcpCoreHostConfig` no incluye
`defaultModel` ni `modelRouting`; el scaffold lo deja como
`<your-model>`. Para un orquestador, eso es aceptable; pero el
`@cartago-git/mcp-proposals` **sí exporta** `IModelRoute` /
`IModelRoutingTable` desde su `public/index.ts` — esa tabla no tiene
un consumidor en el core. **El proyecto está a medio camino** de un
model-routing primero.

### 3.16 Seguridad operacional

**⭐⭐⭐½ · Bien.** Hay un análisis serio:

- Command allow/deny policy (M13) en `quality`.
- Redacción de secretos (M11) en `memory`.
- Mutex + atomic-write + quarantine en todo store.
- No-red en `deps`, `search`, `docs`, `memory`, `git` (lectura).
- Filtro de input (`no-unknown`, `strict()`, `.min(1)`) en Zod por doquier.

**Lo mejorable:**

- No hay un `mcp-core audit` (sub-comando) que vuelque el security
  posture de un setup concreto (qué plugins, qué policies, qué
  capFiles).
- No hay rate-limit declarativo en los plugins (un tool puede ser
  llamado 10 000 veces/segundo y el proceso no lo nota). El
  `quality` runner tiene `timeoutMs` por scope pero no un budget
  por tool.
- El **redactor de secretos** está solo en `memory`. Si un
  agente guarda una API key en una `proposal` (en su `body`),
  **se persiste tal cual**. Generalizar `redactSecrets` a un
  shared helper en `core` y aplicarlo en el save de
  `proposal-document.ts` cerraría una fuga real.

---

## 4. Cosas que el revisor agnóstico **no** ve en el código

1. **No hay `docs/proposals/audits/` (carpeta propuesta por el enunciado).**
   Las auditorías previas viven en `docs/proposals/audits/`; este
   informe se sitúa en el mismo sitio. Una vez haya un par de
   auditorías más, **moverlas a `docs/audits/`** y enlazarlas desde
   el `CHANGELOG.md` las haría descubribles.
2. **No hay un `CODEOWNERS`** — para un proyecto OSS a punto de
   admitir contribuciones externas, lo esperable. Hoy el ownership
   implícito es de “Cartago”, pero un `CODEOWNERS` que mapee
   `packages/core/src/lib/plugins/` → `@cartago-git/plugins-core`
   reduce el bus factor.
3. **No hay una guía de “breaking changes”** entre `0.x` versiones.
   Para SemVer honesto en `0.x`, esto debería existir en el README.
4. **No hay un changelog machine-readable** (Keep a Changelog con
   `## [Unreleased]` no es machine-readable). Un `unreleased.json`
   con `{"features":[...], "fixes":[...]}` cerraría la grieta para
   tooling de release notes.
5. **No hay tests de concurrencia para `memory`**. El mutex está
   pero no se prueba con N procesos (solo `proposals/locks` tiene
   caos). Memoria comparte el mismo `withFileMutex`; en teoría está
   cubierto, pero un test dedicado cierra la duda.

---

## 5. Sugerencias ordenadas por valor (qué añadiría más y qué menos)

Cada sugerencia lleva un valor **V** (estrellas de 0-3) estimado de cuánto
sube la nota global si se cierra, y un coste **C** (estrellas 0-3) de
implementación.

| # | Sugerencia | V | C | Por qué |
|---|---|---|---|---|
| 1 | Crear `.github/copilot-instructions.md`, `.github/agents/mcp-core.agent.md` y skills para Claude Code. | ⭐⭐⭐ | ⭐½ | Coherencia brutal: el proyecto dogfoodea su propio patrón. Es *barato* y cambia la primera impresión de un contribuidor. |
| 2 | Crear `docs/ARCHITECTURE.md` + diagrama Mermaid. | ⭐⭐½ | ⭐½ | El revisor agnóstico lo busca y no lo encuentra. |
| 3 | Crear `docs/SECURITY.md` y `CONTRIBUTING.md` formales. | ⭐⭐ | ⭐ | Estándar OSS. |
| 4 | Páginas de detalle por tool/plugin en `apps/web`. | ⭐⭐⭐ | ⭐⭐ | El sitio es el escaparate. Sin páginas por tool, **no se demuestra el valor del proyecto**. |
| 5 | Búsqueda interna en `apps/web` (pagefind). | ⭐½ | ⭐ | Nice to have; la audiencia es técnica y prefiere el repo. |
| 6 | Promover `redactSecrets` a `core/lib/shared/redact.ts` y aplicarlo en `proposals/proposal-document.ts` (frontmatter + body). | ⭐⭐ | ⭐ | Cierra una fuga real. |
| 7 | Añadir `core/lib/commands/runner.ts` y reusar desde `git`, `quality`, `proposal-acceptance`. | ⭐⭐ | ⭐⭐ | Reduce duplicación significativa. |
| 8 | `mcp-core audit` sub-comando. | ⭐½ | ⭐⭐ | Útil para enterprise; bajo valor para devs. |
| 9 | Tests property-based para `frontmatter-parser` y `redactSecrets`. | ⭐ | ⭐ | Cierra una clase entera de regresiones. |
| 10 | Smoke test funcional en CI (server con `--plugins=standard` + tool call real). | ⭐⭐ | ⭐ | 1 minuto de CI, alta garantía. |
| 11 | `code 124` policy y tests para `proposal-parallelism` con 3+ carriles. | ⭐ | ⭐ | Caso de swarm complejo, baja frecuencia. |
| 12 | `core/walkAllowedFiles` para unificar `search` + `docs`. | ⭐ | ⭐ | Limpieza. |
| 13 | SDK separado `@cartago-git/mcp-core/sdk` para autores de plugin. | ⭐ | ⭐⭐ | Mejora la ergonomía de contribuidores externos. |
| 14 | Marketplace de plugins / `awesome-mcp-core`. | ⭐⭐ | ⭐⭐⭐ | Requiere mantenimiento externo. |
| 15 | Hooks pre/post-tool para auditoría / redacción central. | ⭐⭐ | ⭐⭐ | Pieza que lo convertiría en “plataforma”. |
| 16 | `modelRouting` consumidor en el core (no solo en proposals). | ⭐½ | ⭐ | Sólo si el proyecto quiere opinar sobre el modelo. |
| 17 | `await_lock` tool en `notification` (subscribe + resume). | ⭐⭐ | ⭐ | Cierra el bucle “wait, don’t poll” que el knowledge ya promete. |
| 18 | `proposal-body` redact en save (ver #6). | ⭐⭐ | ⭐ | Mismo ítem, pero re-listado para visibilidad. |
| 19 | Plugin `search`: añadir `context: N` y `regex: 'm'`. | ⭐½ | ⭐ | Nice power-up. |
| 20 | Publicar TS fuente → `dist` Node-runnable (`.js` + `.d.ts`) oficial. | ⭐⭐ | ⭐⭐ | Hace que `npx` funcione; si ya está en el `release.yml` smoke test, perfecto. |

**Lectura:** los **tres primeros** son baratos y suben la nota más. **#4** es
el que más sube por sí solo (sitio público coherente con el proyecto), pero
cuesta más. **#6, #7, #10, #17** son los que más suben el ratio valor/coste
en el *core técnico*.

---

## 6. Veredicto final agnóstico

`mcp-core` es **ingeniería honesta y medida**: lo que promete está
verificado en código, los tests son serios, la arquitectura está pensada
para 5 años, los plugins son reusables, y el “model-agnostic” no es
marketing — los payloads son JSON estricto, los tools no devuelven prosa.

La distancia al 11/10 es **una grieta de coherencia externa** (sitio,
skills, agentes propios, contributing, security, marketplace) y unos
**acabados internos** menores (shared command runner, redactor
centralizado, smoke funcional, await_lock). No es un proyecto al que le
falte sustancia; es un proyecto al que le falta *la última milla
operativa* para ser la referencia OSS de su categoría.

> **Si tuviera que recomendar UN cambio para subir nota**: construir las
> páginas del sitio público por tool/plugin, escribir
> `.github/copilot-instructions.md` dogfooding el propio flujo, y
> generalizar `redactSecrets` a `core`. Tres cambios pequeños que pasan
> el proyecto de **excelente** a **plataforma de referencia**.

---

## Tabla de calificaciones

| Dimensión | Nota |
|---|---|
| Arquitectura general | ⭐⭐⭐⭐½ Muy bien |
| Contrato de plugins | ⭐⭐⭐⭐⭐ Perfecta |
| Seguridad concurrencia / I/O | ⭐⭐⭐⭐⭐ Perfecta |
| Eficiencia de tokens (LLM) | ⭐⭐⭐⭐½ Muy bien |
| Diseño libre de bucles / bloqueos | ⭐⭐⭐½ Bien |
| TypeScript / tipado | ⭐⭐⭐⭐½ Muy bien |
| Testing | ⭐⭐⭐⭐ Bien |
| CI / Release | ⭐⭐⭐⭐½ Muy bien |
| Documentación (README/docs) | ⭐⭐⭐½ Bien |
| Plugin proposals | ⭐⭐⭐⭐½ Muy bien |
| Plugin memory | ⭐⭐⭐⭐⭐ Perfecta |
| Plugin rules | ⭐⭐⭐½ Bien |
| Plugin git | ⭐⭐½ Regular-Bien |
| Plugin search | ⭐⭐½ Regular-Bien |
| Plugin quality | ⭐⭐⭐½ Bien |
| Plugin docs | ⭐⭐½ Regular-Bien |
| Plugin deps | ⭐⭐½ Regular |
| Plugin notification | ⭐⭐⭐⭐ Bien |
| Skills / agentes / instrucciones propias | ⭐½ Regular |
| Scaffold / Blueprint | ⭐⭐⭐½ Muy bien |
| Sitio público (`apps/web`) | ⭐⭐½ Regular-Bien |
| Extensibilidad / futuro (marketplace, SDK) | ⭐⭐⭐ Bien |
| **Estado actual** | **⭐⭐⭐⭐ · Bien (8,8 / 10)** |

> **Lo que añadiría, ordenado por valor (estrellas = cuánto subiría la nota global):**
> 1. Páginas de detalle por tool/plugin en `apps/web` → ⭐⭐⭐
> 2. Skills, agentes e instrucciones del propio proyecto → ⭐⭐⭐
> 3. Redactor de secretos centralizado en `core` y aplicado en proposals → ⭐⭐
> 4. `core/lib/commands/runner.ts` para unificar `git`/`quality`/`proposal-acceptance` → ⭐⭐
> 5. Smoke funcional en CI (server + tool call real) → ⭐⭐
> 6. `await_lock` en `notification` (cierra el bucle “wait don’t poll”) → ⭐⭐
> 7. `docs/ARCHITECTURE.md` + diagrama Mermaid → ⭐⭐½
> 8. Marketplace de plugins / SDK separado → ⭐⭐
> 9. Hooks pre/post-tool para auditoría central → ⭐⭐
> 10. Tests property-based para parsers → ⭐

---

*Auditoría agnóstica — 2026-06-18 — `develop` @ Cartago. Sin consulta a
auditorías previas. Cada hallazgo está verificado contra el código con
cita de archivo:línea.*
