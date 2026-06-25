---
id: a00011
kind: audit
title: "Auditoría exhaustiva [previa-exhaustiva] — Antigravity (Gemini 3.5 Flash)"
status: done
date: 2026-06-16T23:43:13Z
track: archive
---

# Auditoría exhaustiva de `@cartago-git/mcp-vertex` — 2026-06-16

> Revisión independiente del workspace completo (core + 9 plugins + tooling +
> CI + release). No toma como entrada ninguna auditoría previa: parte del código
> real, ejecuta la suite y mide. Estado verificado en esta sesión: **415 pasados,
> 10 skipped (425), 63 ficheros de test, `bun run validate` exit 0**, ~19,2k LOC
> de fuente y ~8,7k LOC de test (ratio test/fuente ≈ 0,45).
>
> Escala usada (la que pidió el encargo): **FATAL → MUY MAL → REGULAR → COMO
> DEBE ESTAR → BIEN → MUY BIEN → PERFECTO**.

---

## 1. Veredicto

Es un proyecto **excelente, de calidad poco habitual** para un monorepo de esta
edad (días). La arquitectura es coherente de punta a punta: núcleo agnóstico y
hermético, plugins que reciben todo resuelto por contexto, escritura atómica con
mutex de proceso cruzado, cuarentena de ficheros corruptos, presupuesto de tokens
medido **con guarda de regresión**, y un SDK de tipos generado con guarda de
drift. No hay deuda evidente ni "magia": casi todo es función pura con deps
inyectables y test.

**Nota global: 9,3/10.** No llega al 11/10 que se persigue por un puñado de cosas
concretas y arreglables —ninguna es un agujero de diseño—: el modelo de
publicación (se publica TypeScript crudo, runtime bun-only de facto), un punto de
tokens que contradice el propio principio del repo (`round_context` imprime con
indentación), la superficie de 16 herramientas del plugin `proposals` y un riesgo
de exclusión mutua latente en el mutex. Detalle abajo.

---

## 2. Hallazgos por severidad

### 🔴 FATAL — bloqueantes reales

**Ninguno.** Es importante decirlo sin adornos: no he encontrado corrupción de
estado, deadlock real, pérdida de datos garantizada ni fallo de seguridad. La
suite pasa, el mutex es correcto para los tamaños de sección crítica reales, y los
caminos de error (JSON roto, lock ausente, índice torcido) degradan a vacío en vez
de tirar el servidor. Lo que sigue son riesgos y fricciones, no bloqueos.

### 🟠 MUY MAL — corregir antes de presumir de "universal"

1. **Se publica TypeScript fuente; el CLI es de facto bun-only.**
   `packages/core/package.json` declara `"main": "./src/index.ts"`,
   `"exports": "./src/index.ts"` y `"bin": { "mcp-vertex": "./src/cli.ts" }`. No hay
   `build` ni emisión de `.js`/`.d.ts`. Consecuencia: un host MCP que arranque el
   servidor con `npx @cartago-git/mcp-vertex` bajo Node **no puede ejecutar `.ts`** y
   falla; solo `bunx` funciona. El README solo muestra `bunx`, así que es una
   decisión consciente, pero choca de frente con el titular "funciona igual bajo
   cualquier agente/modelo/host". La mayoría de clientes MCP del mercado (Claude
   Desktop, Cursor, VS Code) lanzan `npx`/`node`, no `bunx`. **Esto limita la
   adopción real más que cualquier otra cosa del repo.** Opciones: (a) `tsup`/`bun
   build` a `dist/` con `exports` condicional y `bin` a `.js`; (b) documentar
   explícitamente "requiere bun" como contrato. Hoy está a medio camino: te lo
   crees universal pero no arranca en el runtime mayoritario.

2. **`round_context` imprime con tabuladores — viola el principio de tokens del
   propio repo.** [round-context.tool.ts:150](../../../plugins/proposals/src/lib/tools/round-context.tool.ts#L150)
   devuelve `JSON.stringify(out, null, '\t')`. `TOKEN-BUDGETS.md` dice literalmente
   "Tool responses are compact JSON … no pretty-print". El digest de ronda es de
   los payloads más grandes (locks + agentes + portfolio + hashes + resumeHint) y
   es justo el que se imprime bonito → desperdicia ~25-40% de tokens en
   whitespace. Y **no está cubierto por el guard de presupuesto** (este solo mide
   `overview` y `auto_work` con `--plugins=proposals,memory`). Cambiar a
   `toolJson(out)` / `JSON.stringify(out)` es una línea. (El mismo patrón
   pretty-print aparece en el reporte del `doctor` —ahí es aceptable porque es
   salida humana a stdout, no payload de tool.)

### 🟡 REGULAR — fricción / deuda menor

3. **`proposals` expone 16 herramientas; superficie y solapamiento altos.**
   Conteo real de `registerTool`: core 10, **proposals 16**, git 4, memory 4,
   rules 3, deps/docs/quality 2, notification/search 1 → **~45 tools con todo
   cargado**. Varias de coordinación se solapan conceptualmente para el modelo que
   tiene que *elegir*: `auto_work`, `continue_proposal`, `compact_status`,
   `task_queue`, `round_context`, `proposal_board`, `state_health`. Están bien
   diseñadas individualmente (cada una con su `tags` y `summary` corto), pero la
   carga cognitiva de selección no es gratis en tokens ni en aciertos del modelo.
   Los presets `--preset=minimal|standard|swarm` mitigan a nivel de *carga de
   plugin* pero no dentro de `proposals`: o cargas las 16 o ninguna. Valdría un
   eje de "perfil de herramientas" dentro del plugin (p.ej. `proposals` core vs
   `proposals` swarm) o fusionar `compact_status`+`state_health` en un único
   `status` con `fields`.

4. **Exclusión mutua latente en `withFileMutex`.**
   [with-file-mutex.ts:73-77](../../../packages/core/src/lib/shared/with-file-mutex.ts#L73-L77):
   si la contención supera `timeoutMs` (5 s) el waiter **roba el lock y entra**,
   aunque el holder original siga ejecutando `fn()`. Para las secciones críticas
   reales (read-modify-write de un JSON pequeño, sub-ms) es seguro. Pero es una
   garantía rota *por diseño*: cualquier `fn()` futuro que tarde >5 s (disco lento,
   FS de red, payload grande) permite dos secciones críticas simultáneas →
   lost-update, justo lo que el mutex existe para evitar. Mitigación barata:
   refrescar el `mtime` del sidecar mientras `fn()` corre (heartbeat) y solo robar
   por `staleMs`, no por `timeoutMs`; o subir `timeoutMs` y documentar el techo de
   duración de sección crítica.

5. **`release.ts` no es transaccional y no tiene rollback.**
   [release.ts:139-145](../../../scripts/release.ts#L139-L145) publica en bucle
   `PUBLISH_ORDER`; si el 6º paquete falla (registry, 2FA, red), los 5 primeros ya
   están publicados y no hay `--dry-run` de publicación real ni `npm publish
   --tag next` de staging. `npm`/`bun publish` son irreversibles (no se puede
   re-publicar la misma versión). Falta también `CHANGELOG`/notas y no hay job de
   release en CI (la publicación es 100% manual desde una máquina). Para un repo
   que automatiza el *plan* de versión esto es asimétrico: el plan está testado
   (`release-plan.ts`), la ejecución no.

6. **`parseQueue` valida `waitFor` con `existsSync(wf.file)` sobre la ruta tal
   cual.** [persistent-task-queue.ts:336-345](../../../plugins/proposals/src/lib/agents/persistent-task-queue.ts#L336-L345)
   trata `wf.file` como ruta utilizable directamente por `existsSync`. Si el
   enqueue guarda rutas relativas al workspace y el `parseQueue` corre con otro
   `cwd`, el chequeo da falsos `WAIT_FOR_FILE_MISSING` (que *aborta* el parseo de
   toda la cola). Es un acoplamiento implícito a `cwd` en un código que en todo lo
   demás es escrupulosamente hermético. Conviene resolver `wf.file` contra el root
   inyectado, como hace el resto.

7. **`.claude/settings.local.json` con `bypassPermissions` + `Bash` abierto está
   commiteado.** Es config local de desarrollo, pero `defaultMode:
   bypassPermissions` y `Bash` sin patrón en un fichero versionado es una mala
   semilla para quien clone (y para cualquier sesión automática). Debería estar en
   `.gitignore` o ser un `settings.json` mínimo de proyecto sin bypass.

### 🟢 COMO DEBE ESTAR

- Envelope uniforme `{ ok, error: { reason, nextAction } }`, `tags` y `summary`
  cortos en cada tool, `outputSchema` Zod en las que devuelven structured content.
- `doctor`/`--check` que **ensambla el servidor real** (no solo valida config) para
  cazar colisiones de id antes de arrancar stdio. [assemble.ts:284-326](../../../packages/core/src/lib/cli/assemble.ts#L284-L326)
- Precedencia de roots clara y testeable (CLI > config > default), contexto por
  plugin con `pluginCacheDir`/`pluginDocsDir` aislados.
- Plugin malo se reporta a stderr y se salta; el resto carga (degradación
  parcial). CI con `concurrency` cancel-in-progress y `pack-smoke` (`npm pack
  --dry-run`) que valida la superficie `exports`/`files` de cada paquete.

### 🔵 BIEN

- **Cuarentena de corrupción**: JSON roto se preserva (`*.corrupt-*`) antes de
  seguir con estado vacío, en cola y en closed-tasks (visto en la salida de test).
  Distingue "corrupto" de "vacío" — detalle que casi nadie hace.
- **Escritura atómica con tmp en el mismo directorio** (evita `EXDEV` en rename
  cross-FS), comentada y aplicada de forma consistente.
- **Notificación push real**: `createReleaseWatcher` con `fs.watch` sobre el
  *directorio* (porque el rename atómico cambia el inode) + fallback de polling y
  `timer.unref()` para no mantener vivo el proceso. Sustituye N agentes haciendo
  `agent_lock status` — el sumidero de tokens dominante en swarm real.
- **Anti-bucle explícito en `auto_work`**: el estado `all-claimed`/`idle` devuelve
  `nextAction` verbatim para que el modelo **pare** en vez de re-llamar.
  [auto-work.tool.ts:41-52](../../../plugins/proposals/src/lib/tools/auto-work.tool.ts#L41-L52)

### 🟣 MUY BIEN

- **`agent-lock-engine` corre el read→mutate→write completo bajo `withFileMutex`**
  (no solo la escritura): entiende la diferencia entre torn-write y lost-update y
  la resuelve. El `lock-conflict` devuelve `nextAction` que prohíbe el reintento y
  propone alternativas (rutar otra slice, encolar, pedir reclaim) — esto es
  prevención de bucle a nivel de protocolo, no de prompt.
- **Hermético de verdad**: el engine de lock *exige* `lockPath` inyectado y lanza
  si falta, sin fallback a `process.cwd()`. El core "nunca llama `process.cwd()`
  fuera del CLI entry" y se cumple.
- **TTL + expireSweep + backpressure con umbrales** (green/amber/red por longitud,
  edad y waiterOrphans) en la cola: el sistema tiene presión y caducidad, no crece
  sin límite.

### 🌟 PERFECTO (o lo más cerca que vi)

- **Presupuesto de tokens medido y con guarda de regresión** sobre el servidor MCP
  real (no estimado): `overview` full/compact/`auto_work` con techos en bytes y el
  invariante `compact < full × 0,7`. Cold-start completo <300 tokens. Esto es
  exactamente lo que diferencia "decimos que es low-token" de "lo demostramos y el
  CI lo rompe si regresa".
- **SDK de tipos generado desde los `outputSchema` con guard de drift** en la
  suite: los tipos no se editan a mano y un test falla si se quedan rancios.

---

## 3. Eficiencia de tokens (consolidado)

**Muy buena, con una fuga concreta.** El diseño es de los más cuidados que he
visto en este aspecto: cold-start barato (`overview compact` ~220 tok),
`auto_work` ~36 tok, conocimiento perezoso vía MCP resources, caps en
`search` (50 hits, 240 chars/línea, 1 MB/fichero), paginación en `memory`,
`git diff --stat` en vez de diff completo, y push de notificaciones en vez de
polling. Todo medido.

Fugas/ajustes:
- **`round_context` pretty-print** (§2.2) — la única violación directa del
  principio, y no guardada por el budget. Arréglalo y amplía el guard para cubrir
  el `--preset=swarm` completo (hoy mide solo `proposals,memory`).
- **45 tools en el snapshot de overview con todo cargado** (§2.3) — el `compact`
  lo aguanta, pero el `overview` full crecerá linealmente; conviene un techo de
  budget por-preset, no solo el de `proposals,memory`.

---

## 4. Bucles y bloqueos (consolidado)

**No hay deadlock ni bucle infinito alcanzable** en los caminos que revisé:

- Mutex con robo por antigüedad/timeout → un peer colgado nunca bloquea al swarm
  (a cambio del riesgo de §2.4, que es de *correctitud* bajo secciones largas, no
  de bloqueo).
- `lock-conflict` y `all-claimed`/`idle` cortan el reintento por contrato.
- TTL + `expireSweep` + backpressure evitan crecimiento ilimitado de cola.
- `fs.watch` + polling fallback evita la espera activa sobre el lock.

Riesgo residual (no de código, de comportamiento): un modelo que **ignore**
`nextAction` puede re-llamar `auto_work` en `idle` en bucle. Está mitigado con el
estado explícito, pero no hay un freno duro (p.ej. un contador de "idle
consecutivos" que devuelva un `stop: true` más enfático). Barato de añadir.

---

## 5. Skills, herramientas y agentes — ¿falta algo?

**El repo no envía ninguna skill ni definición de agente para sí mismo.** El
`scaffold` del core *sabe* generar tools/prompts/skills/agents/plugins, y hay dos
MCP *prompts* (`work`, `orchestrate`) bien escritos — pero el propio mcp-vertex no
trae un `.claude/` con agentes ni slash-skills que envuelvan su flujo estrella.

Recomendaciones (en orden de impacto):

1. **Enviar agentes/sub-agentes de Claude Code para el swarm.** El producto es
   coordinación multi-agente; lo natural es un `agents/orchestrator.md`,
   `implementation-runner.md`, `delivery-verifier.md` (los slots ya existen en
   `AGENT_SLOTS`) que mapeen 1:1 a los roles de la cola. Hoy el usuario tiene que
   cablearlos a mano. Esto convertiría "tengo un MCP de swarm" en "tengo un swarm
   que arranca de un comando".
2. **Slash-skill `swarm` / `auto-work`** que haga el bucle claim→slice→validate→
   sync→release y pare en `idle`. El prompt `work` ya describe el bucle; falta el
   envoltorio ejecutable.
3. **Herramienta `explain`/`why_blocked`** que, dado un `task_id` bloqueado,
   devuelva la cadena de bloqueo (qué tarea/agente/fichero) en un payload — hoy esa
   info está repartida entre `agent_lock status`, `task_queue` y `compact_status`.
4. **`apply` opcional en `scaffold`/`create_server`**: hoy todo es dry-run y "el
   agente escribe los ficheros". Correcto por defecto, pero un `--write` con guard
   ahorraría un round-trip enorme de generación→reescritura por el modelo.

No creo que falten *plugins*: el set (proposals, rules, memory, git, quality,
search, notification, docs, deps) cubre orientación, ejecución y coordinación con
poco solapamiento. Si acaso, **un plugin `web`/`fetch` agnóstico** (con allow-list
de dominios) sería el hueco más obvio para tareas que hoy requieren salir del
servidor.

---

## 6. Plan priorizado para 11/10

**P0 — desbloquear adopción (1-2 días)**
- [ ] Decidir runtime: build a `dist/` (`.js` + `.d.ts`, `exports` condicional,
      `bin` a `.js`) **o** documentar "requiere bun" como contrato de primera
      línea en README e instrucciones de cliente. (§2.1)
- [ ] `round_context` → JSON compacto; ampliar el guard de budget a `--preset=swarm`
      con techo por-preset. (§2.2, §3)

**P1 — robustez operativa (2-3 días)**
- [ ] Heartbeat en `withFileMutex` (refrescar `mtime` durante `fn()`; robar solo
      por `staleMs`) + documentar techo de sección crítica. (§2.4)
- [ ] `release.ts`: `--tag next` de staging, verificación post-publish y
      `CHANGELOG` por paquete; job de release en CI con `provenance`. (§2.5)
- [ ] Resolver `wf.file` contra el root inyectado en `parseQueue`. (§2.6)
- [ ] Sacar `.claude/settings.local.json` del control de versiones (o sin bypass).
      (§2.7)

**P2 — calidad de producto / agente (3-5 días)**
- [ ] Perfil de herramientas dentro de `proposals` (core vs swarm) o fusionar
      `compact_status`+`state_health` en `status { fields }`. (§2.3)
- [ ] Freno duro anti-idle en `auto_work` (`stop: true` tras N idles). (§4)
- [ ] `why_blocked` y `apply` opcional en scaffold. (§5)

**P3 — plataforma de referencia**
- [ ] Enviar `.claude/agents/*` (slots del swarm) y slash-skills `swarm`/`auto-work`.
      (§5)
- [ ] Plugin `web`/`fetch` con allow-list de dominios. (§5)

---

## 7. Conclusión

mcp-vertex está **muy por encima de la media**: hermético, medido, testeado y con
decisiones de diseño que la mayoría de proyectos descubren tarde y a base de
incidentes (lost-update vs torn-write, cuarentena de corrupción, budget con guard,
drift de tipos). Lo que le separa del 11/10 no es deuda estructural sino acabado:
**que arranque en el runtime que usa la mayoría de clientes** (el punto de mayor
ROI con diferencia), cerrar la única fuga de tokens que contradice su propio
manifiesto, endurecer el mutex para secciones largas y reducir la superficie de
herramientas de `proposals`. Ninguna es difícil; todas son acotadas. Cerrando P0+P1
el proyecto pasa de "excelente prototipo bun-first" a "referencia publicable y
universal".

— Auditoría independiente, 2026-06-16.
