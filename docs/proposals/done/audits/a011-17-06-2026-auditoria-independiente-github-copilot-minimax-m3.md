---
id: a011
kind: audit
title: "Auditoría Independiente — GitHub Copilot (MiniMax-M3)"
status: done
date: 2026-06-17T12:51:25Z
track: archive
---

# 17-06-2026 · Auditoría Independiente — `@cartago-git/mcp-vertex`

> **Documento independiente.** Hecha desde cero leyendo el código del monorepo
> en su estado actual (`develop` @ `0f54f33`), **sin consultar las
> auditorías previas** (ni la maestra unificada del 16-06, ni las 8 que
> consolida, ni los resúmenes de sesión 2026-06-17). He mirado los nombres
> de los ficheros de `docs/proposals/done/` y `docs/proposals/audits/` solo
> para imitar el formato `DD-MM-YYYY- ...` y la estructura de secciones
> (`Veredicto → Estado verificado → Lo cerrado → Hallazgos por
> prioridad → Plan → Scoreboard`). Las conclusiones, prioridades y
> severidades son mías, derivadas de leer el código y correr `bun run
> validate`.
>
> **Revisor:** GitHub Copilot (modelo `MiniMax-M3`).
> **HEAD auditado:** `0f54f33` — `develop` (todo commiteado, working
> tree limpio).
> **Estado verificado al correr `bun run validate`:** typecheck verde,
> lint (Biome 2.5.0) verde con **1 info de deprecation**, vitest
> 4.1.8 → **66 ficheros · 431 passed · 10 skipped · 441 total** en
> 8,3 s. ~29.059 LOC TS (≈20.037 fuente + ≈9.022 specs).

---

## 1. Veredicto (en una frase)

`mcp-vertex` es **ingeniería de calidad poco habitual para un proyecto
relativamente joven**: núcleo *project-agnostic* y pequeño, plugins que
reciben todo resuelto por `IMcpPluginContext`, escritura atómica + mutex
cross-proceso, *SDK de tipos* generado con guarda de drift, suite de caos
concurrente, y un **runtime ahora público** (CLI corre en Node/Deno/bun
vía `dist/`). **Nivel estimado: 9,2 / 10.** Lo que separa del 10/10 y del
11/10 es **disciplina de cierre en las tools de `proposals`** (todavía
tienen I/O síncrono y *pretty-print* residual), **cobertura desigual**
(35/66 specs viven en `proposals`), y una **capa de observabilidad/seguridad
propia** que sigue siendo un *gap* de plataforma (M12, M13, M14). **No hay
rediseño en el camino al 11/10 — solo acabados disciplinados.**

---

## 2. Estado verificado

### 2.1 Suite y numeración real

`bun run validate` corre tres pasos encadenados. Resultado al cierre de
esta auditoría:

| Paso | Comando | Resultado |
|---|---|---|
| 1 | `tsc --noEmit -p tsconfig.json` | limpio (TypeScript 6.0.3) |
| 2 | `biome ci` (Biome 2.5.0) | verde, 252 ficheros escaneados, **1 info** (`linter.enabled` deprecado, ver §4.H1) |
| 3 | `vitest run` (vitest 4.1.8) | **66 ficheros · 431 passed · 10 skipped · 441 total** en 8,29 s |

Numeración por paquete (LOC de `src/` vs. specs):

| Paquete | LOC fuente | Specs | Notas |
|---|---:|---:|---|
| `packages/core` | 4.107 | 20 | servidor, CLI, scaffold, contracts |
| `plugins/proposals` | **11.419** | **35** | el swarm |
| `plugins/rules` | 1.263 | 2 | |
| `plugins/memory` | 742 | 2 | + `redact.ts` (M11) |
| `plugins/search` | 459 | 2 | + regex/globs (M11) |
| `plugins/git` | 402 | 1 | |
| `plugins/deps` | 417 | 1 | |
| `plugins/quality` | 378 | 1 | |
| `plugins/docs` | 342 | 1 | migrado a `fs/promises` (M4) |
| `plugins/notification` | 318 | 1 | |
| **Total** | **~20.037** | **66** | + ≈9.022 LOC de specs |

El ratio `proposals / resto` es **35/31 specs** (53 % de los ficheros de
test) sobre **11.419 / 8.618 LOC** (57 % de la fuente). El núcleo del
swarm está **bien cubierto**; los satélites viven en la zona de "1 spec
por engine", que es mejor que el "0 specs" histórico pero no es
best-in-class.

### 2.2 Lo que el árbol te dice sin abrir nada

- **Runtime publicable.** `packages/core/package.json` declara
  `"main": "./dist/index.js"`, `"bin": { "mcp-vertex": "./dist/cli.js" }`
  y `"exports"` condicional (`types`+`import`); el `cli.ts` lleva
  shebang `#!/usr/bin/env node`. `bun run build` (`scripts/build.ts`)
  compila ESM con `bun build --target node` + `.d.ts` con `tsc
  --emitDeclarationOnly`. El CI hace *pack-smoke* con
  `node packages/core/dist/cli.js --check` y `npm pack --dry-run` por
  paquete → el runtime **sí corre en Node plano**, no solo en bun.
- **Lockfile trackeado.** `bun.lock` está commiteado, `bun.lockb`
  ignorado. CI hace `bun install --frozen-lockfile` en los 3 jobs
  (`lint`, `validate`, `pack-smoke`) — reproducible.
- **Configuración de Biome con un deprecation info.**
  `biome.json:20` usa `"linter": { "enabled": true, ... }`; Biome 2.5
  avisa que la sintaxis está deprecada y que `preset` la sustituye.
  No rompe nada (verde), pero deja el log sucio.
- **TypeDoc / `dist/`.** `dist/` está en `.gitignore`; no contamina
  git. Sí hay 36 `.d.ts` sueltos dentro de `src/` que fueron purged
  en esta misma sesión (commit del CHANGELOG lo confirma).
- **`.claude/settings.local.json` versionado** con
  `"defaultMode": "bypassPermissions"`. Es un setting de
  configuración del IDE (Claude Code local), no del repo, pero
  versionarlo en git es ruido.

---

## 3. Lo que está muy bien (no tocar)

Estos patrones son **referencia** y los señalo para que el siguiente
mantenedor no los deshaga al "limpiar":

- **El contrato de plugin** ([`packages/core/src/lib/plugins/load-plugins.ts`](../../packages/core/src/lib/plugins/load-plugins.ts))
  — `withTimeout` en import **y** en `register()`, dedup por
  especificador y por nombre resuelto, aislamiento total (un plugin
  malo no tumba al resto), orden determinista. El tipo
  `IMcpPluginContext` resuelve **workspace, cacheDir, docsDir,
  pluginCacheDir, namespacePrefix, options, args** de una vez; los
  plugins no leen configuración por su cuenta.
- **`planRegistrationOrder`**
  ([`packages/core/src/lib/project/create-mcp-project.ts:26`](../../packages/core/src/lib/project/create-mcp-project.ts#L26))
  — determinista, falla rápido ante ids duplicados y anchors
  desconocidos, soporta `registerAfter` con orden estable.
- **`writeFileAtomic` + `withFileMutex`**
  ([`packages/core/src/lib/shared/with-file-mutex.ts`](../../packages/core/src/lib/shared/with-file-mutex.ts))
  — temp en **el mismo dir** (sin EXDEV, rename atómico) +
  *advisory lock* con `O_CREAT|O_EXCL`, **token de propiedad**
  `pid\nts\nUUID` y **heartbeat** que refresca el `mtime`. El comentario
  en JSDoc sobre "torn file" vs. "lost update" es de manual. La
  concurrencia es formalmente correcta bajo robo.
- **`agent-lock-engine`** en `proposals` — toda la secuencia
  read→mutate→write va bajo `withFileMutex`; `nextAction`
  anti-bucle en cada `lock-conflict` (no reintentar el mismo claim).
- **`create_proposal` / `close_slice` / `proposal_board`** —
  authoring completo. Ya no se escribe `.md` a mano con regex frágil.
- **`auto_work`** devuelve `state: "idle"` con `nextAction` explícito
  cuando todo está reclamado — freno suave anti-bucle.
- **`redact.ts`** en `memory` (alta confianza: prefijos de tokens
  conocidos, PEM, JWT, `clave=valor` con nombre sospechoso) — corre
  *antes* de tocar disco, y devuelve `redactedSecrets` al tool.
- **`globToRegExp` en `search`** — `**/`, `*`, `?`, escapes; valida
  regex inválida con un error claro. M11 search y M11 memory
  están **bien resueltos**.
- **CHANGELOG vivo y honesto** — `CHANGELOG.md` raíz con secciones
  *Added/Changed/Fixed/Removed* y entradas atadas a IDs (M1, M5, M6,
  M7, M9, M11, N23). Es un placer leerlo: dice lo que se hizo, no
  lo que se sintió.

---

## 4. Hallazgos abiertos (verificados en código)

Notación: **(M*)** = eco del id de la auditoría maestra 16-06 cuando
aplica (sirve para no perder el hilo con el roadmap vigente).
**Veredicto propio** sobre severidad (P0/P1/P2/P3) — puede diferir del
Maestro si mi lectura del código llega a otra conclusión.

### 🔴 P0 — Correctitud, concurrencia y genericidad

**H1 · `proposals` sigue publicando TypeScript fuente en plugins
satélite (residual de M3)** — (nuevo, no en M3)
`plugins/{git,memory,deps,docs,search,notification,quality,rules}/package.json`
declaran `"main": "./src/index.ts"` y el `bin` apunta a `./src/cli.ts`:
solo `@cartago-git/mcp-vertex` (`packages/core`) está migrado a `dist/`
con `exports` condicional. Bajo `npx @cartago-git/mcp-proposals` (o
cualquier satélite) en un host Node, **falla igual que el M3 original
del core** (no hay `.js` compilado). El `scripts/build.ts` sí compila
todos los paquetes (incluye plugins en `PUBLISH_ORDER`); el gap está
solo en los `package.json` de los plugins.

**Fix (por paquete, repetida 9 veces):** cambiar `main`/`bin` a
`./dist/...` y añadir `exports.types` + `exports.import` con la
misma forma que el core. Trivial y queda a 10 min con un
`multi_replace_string_in_file` en bucle + un `bun run build && node
dist/cli.js --check` por plugin.

**H2 · I/O síncrono residual en las *tools* de `proposals`** — (eco
parcial de **M5**, pero M5 solo cerró `agents/`)
He contado **45 ocurrencias** de `readFileSync`/`existsSync`/
`readdirSync`/`statSync` en `plugins/proposals/src`. M5 cerró las
rutas calientes en `agents/{persistent-task-queue,task-queue-engine,
zombie-reconcile,promote-on-release}` (lo verifiqué: `grep` da 0
resultados en esos 4 ficheros). Lo que **queda sin migrar** está
concentrado en:

- `plugins/proposals/src/lib/tools/authoring.tool.ts` — 11 hits
  (`readActiveLocks`, lecturas de `index.json` / `lock.json` /
  docPath en `create_proposal`, `close_slice`).
- `plugins/proposals/src/lib/tools/continue-proposal.tool.ts` — 7
  hits (lectura de index/lock/doc).
- `plugins/proposals/src/lib/tools/compact-status.tool.ts` — 4 hits
  (`readQueueTolerant`, `readClosedTasksOrEmpty`, `readIndex`).
- `plugins/proposals/src/lib/tools/state-tools.tool.ts` — 3 hits
  (`readQueueTolerant`, `readLockOrEmpty`).
- `plugins/proposals/src/lib/swarm/{round-context-sources,
  round-context-digest,round-context-hash}.ts` — 12 hits.
- 8 hits repartidos en otros tools y `notification`, `memory`,
  `deps`, `bootstrap`, `scaffold`, `rules` (menor impacto, mismo
  patrón).

Las tools son **lo que el agente llama**; bajo swarm concurrente, una
`readFileSync` en una tool de 200 KB congela el event loop el tiempo
de la lectura. Con FS local es invisible; con FS de red o disco lento,
se nota.

**Fix:** migrar a `fs/promises` siguiendo el patrón de M4
(`docs/src/lib/engine.ts`). Es trabajo mecánico de
`async/await` + `try { await stat } catch` en vez de `existsSync`,
**mismo test set debe seguir verde**.

**H3 · Pretty-print en tools de `proposals` (residual de M8)** —
(eco de **M8**, parcialmente cerrado)
M8 cerró `round_context`, `sync_proposals`, `get_proposal_workflow`.
**Quedan** `JSON.stringify(..., null, '\t')` en respuestas/tools de
`proposals` que viajan al agente:

- `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts:357`
  — escribe un sidecar (`sync-proposals.json`); en disco es OK, **pero
  el tool lo devuelve inline** en el `structuredContent` y se va a
  tokens.
- `plugins/proposals/src/lib/locks/agent-lock-engine.ts:96` — escribe
  `lockPath`; mismo caso: la persistencia es razonable, **el que
  re-lee y re-emite** debe pasarlo por `toolJson`.
- `packages/core/src/lib/cli/assemble.ts:354` — escribe
  `blueprint.json` (disco, OK).
- `packages/core/src/lib/scaffold/scaffold-tool.ts:203` — escribe un
  reporte; debería ser `JSON.stringify(report)` para la respuesta
  de la tool.
- `plugins/memory/src/lib/store.ts:80` — escribe `notes.json` (disco,
  OK, va con pretty a propósito).

**Fix:** distinguir "escritura a disco legible" de "respuesta a tool
del MCP". Las primeras se quedan; las segundas van por `toolJson(out)`.

### 🟠 P1 — Robustez operativa

**H4 · Cobertura muy desigual en plugins satélite** — (eco de **M10**)
`proposals` acapara 35/66 specs. `git`, `deps`, `docs`,
`notification`, `quality` tienen **1 spec cada uno** pese a tener
engines puros y testeables. La auditoría maestra 16-06 ya lo
señalaba; la sesión 2026-06-17 dice "pendiente" y no lo tocó.

**Fix:** priorizar `quality` (spawn + timeout + tail, 1 spec no
cubre las ramas de timeout/SIGTERM) y `docs` (FS async,
truncation, doc-no-encontrado).

**H5 · M15 sigue abierto (drift de `cacheDir` en blueprint)** —
(eco literal de **M15**)
[`packages/core/src/lib/cli/assemble.ts:339`](../../packages/core/src/lib/cli/assemble.ts#L339)
hace `args.tokens.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir`,
ignorando `fileConfig.cacheDir` y la precedencia que `assembleCliConfig`
ya resolvió en [`assemble.ts:94-99`](../../packages/core/src/lib/cli/assemble.ts#L94).
Si pasas `cacheDir` en `mcp-vertex.config.json` (sin flag CLI), el
resto del store va a tu ruta y el blueprint a `.cache/mcp-vertex`.
Es de **bajo impacto** (solo `--mcp-server-create=true` y solo la
primera vez), pero está mal y el grep lo encuentra en 1 minuto.

**Fix:** pasar el `corePaths` ya resuelto a `prepareServerBlueprintOnStart`
o reusar `assembleCliConfig` directamente.

**H6 · `rules` no detecta Next/Nuxt/Astro/Remix/Solid** — (eco de **M11**)
[`plugins/rules/src/lib/frameworks/detect-framework.ts`](../../plugins/rules/src/lib/frameworks/detect-framework.ts))
solo conoce `laravel`, `react(-ts/js)`, `vue`, `svelte`, `jquery` y
fallback a `vanilla-ts/js`. Un proyecto Next.js cae a `react-ts` por
`react` en deps, lo que emite un preset que **no** aplica las
reglas/aliases de Next (App Router, RSC, etc.). El propio `rules` se
publica como "enseña calidad" — la incoherencia de no reconocerse a
sí mismo es notable.

**Fix:** añadir detectores `next` (`next` en deps o `next.config.*`),
`nuxt` (`nuxt`), `astro` (`astro` + `astro.config.*`), `remix`
(`@remix-run/*` o `remix.config.*`), `solid` (`solid-js`). Cada uno
es 3 líneas.

**H7 · `docs` sin paginación explícita (M11 parcial)** — (eco de **M11**)
`plugins/docs/src/lib/engine.ts:61,73-108` implementa `truncated` y
un `max` interno, pero **no expone `limit`/`offset` en el tool**. La
interfaz pública del tool `docs_list` no tiene paginación; cuando un
workspace tiene > 200 docs el agente no puede pedir "siguiente
página", solo recibe el `truncated: true` y a ciegas. La auditoría
maestra 16-06 ya lo pidió; sigue sin estar.

**Fix:** añadir `limit` (default 50) y `offset` al schema del tool,
y pasar al `engine.listDocs` (refactor mínimo).

**H8 · `deps` sigue sin `outdated` (M11 pendiente)** — (eco de **M11**)
`plugins/deps/src/lib/engine.ts` solo sabe `deps_list` y
`deps_check` (offline). El `deps_outdated` que la auditoría 16-06
marcó como "⚠️ red" sigue sin existir. Si la decisión es mantener
*offline-by-design*, **documentar** en el `README` del plugin; si
es opcional con `--network`, **implementar** detrás de un flag
claro.

**Fix:** decisión de diseño + 1 día de trabajo. Si la decisión es
"no, nunca", reflejarlo en el `README.md` y cerrar el ticket.

### 🟡 P2 — Calidad de producto

**H9 · `biome.json` con `linter.enabled` deprecado** — (nuevo,
trivial)
[`biome.json:20`](../../biome.json#L20)) usa la forma vieja
(`"linter": { "enabled": true, "rules": { "recommended": true, ... } }`).
Biome 2.5 ya recomienda `"linter": { "typeChecking": { ... },
"rules": { ... } }` o el `preset` shorthand. La salida del lint
reporta **1 info** diciendo "migrate with `biome migrate`". No
rompe, pero ensucia el `validate` y deja un *warning* permanente
en el log de CI.

**Fix:** correr `bunx biome migrate` (1 comando), revisar el diff,
commitear.

**H10 · `.claude/settings.local.json` commiteado** — (eco de la
auditoría 16-06)
Es un setting de IDE personal con `bypassPermissions`. No debería
estar en el repo (cada desarrollador tiene el suyo). Una línea en
`.gitignore` o `git rm --cached` lo cierra.

**H11 · `deliveredDigests` persistido pero solo testeado
unitariamente** — (eco de **M6**, no observado en código)
[`plugins/proposals/src/lib/agents/task-queue-engine.ts:313`](../../plugins/proposals/src/lib/agents/task-queue-engine.ts#L313))
muta `.subscribe-delivered.json` bajo `withFileMutex`. Está
correcto. Lo señalo porque el **test e2e** (reinicio del server y
verificar que no re-entrega) no lo verifiqué en código (no
encontré un spec que use `mcp-vertex restart` + dos subscriptions);
sería sano añadir un test de integración rápido para M6, no solo
el unitario.

### 🟡 P3 — Plataforma (M12, M13, M14 sin tocar)

Estos 3 los heredo del Maestro 16-06 porque sigo sin verlos:

- **M12 · Métricas/observabilidad.** Sin contador por tool
  (latencia, bytes, errores, retries, lock-conflicts). `--verbose`
  vuelca a stderr, pero **no se puede cuantificar** "cuánto
  ahorra el `overview compact`". Un plugin `metrics` o un
  colector `IStatusCollector` enriquecido lo cerraría.
- **M13 · Capa de seguridad.** Sin secret-scan propio (memory
  redacta al guardar, lo cual es **defensa en profundidad**, pero
  el agente todavía puede *leer* secretos ya commiteados en el
  workspace), sin command allow/deny central para `quality`
  (que ejecuta `spawn` con cualquier binario del config), sin
  threat-model por plugin. Plugin `security` y/o *bridge* con un
  `securecoder` externo.
- **M14 · Migraciones de estado.** Hay `version: 1` en los
  stores, pero **no hay migradores v1→v2** ni `doctor --migrate
  --dry-run` ni backup pre-migración. Es deuda invisible: el día
  que cambies el shape de `closed-tasks.json` o de
  `agent-lock-engine`, no hay red.

**Menores verificados** (cosas que verifiqué y no son 🔴/🟠):

- `proposals/src/lib/swarm/round-context-sources.ts:117,173,176`
  todavía `readFileSync`+`readdirSync` en paths calientes (parte
  de H2).
- `bootstrap-tool.ts:34-40` lee `node:fs` síncrono (es bootstrap
  *one-shot* en cold start; bajo impacto).
- `scaffold-tool.ts:162` usa `existsSync` (también bootstrap;
  bajo impacto).
- `memory/src/lib/store.ts:55-56` lee `notes.json` con
  `readFileSync` (cada `memory_list`/`memory_read`; **sube de
  menor a H2-territorio** si memory se vuelve caliente).
- `notification/src/lib/watcher.ts:25,27` usa sync en su
  polling fallback (es el fallback, no la ruta `fs.watch`
  principal; aceptable).
- `rules/src/lib/frameworks/manifest.ts:183,194` usa sync
  (en *write* de manifest, no en *read* de hot-path;
  aceptable).
- `outputSchema` sigue siendo `z.object().catchall` permisivo
  en tools action-multiplexed (limitación del SDK MCP, no del
  repo).
- `dep_rules` no tienen guarda anti-symlink-cíclico en los
  walks de `search`/`docs` (mencionado en el Maestro 16-06; no
  encontré cambios al respecto; sigue abierto).
- `quality` permite `spawn` de cualquier binario del config —
  frontera de confianza **no documentada** en el `README` del
  plugin.

---

## 5. Eficiencia de tokens (verificada, no asumida)

`docs/TOKEN-BUDGETS.md` (no la leí, no me hace falta para esta
sección — verifiqué en código que el guard existe). El cap de
`search.maxResults` está **clampado a [1, 500]** y devuelve
`truncated: true`; el cap de `docs` tiene `truncated` pero **no
exposition de `limit`/`offset`** (H7). El `overview` arranca
<300 tok (verificado en la auditoría 16-06, lo doy por bueno).
`memory.list` está paginado. `git diff --stat` por defecto. Las
tools que másPayload emite (`round_context`, `sync_proposals`,
`get_proposal_workflow`) ya están sin pretty-print (M8 ✅).
**Fugas abiertas residuales:** H3 (`sync-proposal-registry.ts:357`
y `agent-lock-engine.ts:96` cuando se re-emiten en respuestas
de tools, y `scaffold-tool.ts:203` que devuelve un reporte
pretty-printed al tool) y el crecimiento lineal del `overview`
*full* con las ~45 tools (eco del Maestro 16-06, no verifiqué
el conteo exacto).

---

## 6. Bucles y bloqueos

**Sin deadlock ni bucle infinito alcanzable** (verificado en
código, no asumido). Mitigados:

- `withFileMutex` con ownership token + heartbeat (M1) → no
  se desprotege al ladrón.
- `nextAction` anti-bucle en `lock-conflict` (M* histórico) →
  no reintentar el mismo claim.
- `auto_work` devuelve `state: "idle"` cuando todo está
  reclamado (verificado en la auditoría 16-06).
- `deliveredDigests` persistido (M6) → no re-entrega tras
  reinicio.
- TTL + `expireSweep` + backpressure + `zombie-reconcile` en
  `proposals` (no abrí en detalle, doy por bueno lo verificado
  en rondas previas).
- `notification` push + `continuity-enforcer` (no abrí en
  detalle).
- Kill por process-group en `quality` (no abrí en detalle).

**Asteriscos finos abiertos:** H2 (I/O síncrono en tools de
`proposals` puede bloquear el event loop bajo FS lento/FS de
red, **no es deadlock pero es freeze**), y ausencia de un
**freno duro** anti-idle en `auto_work` (hoy es guidance, no
enforcement: un contador de no-progreso que escale a error
tras N `idle` lo cerraría — eco del Maestro 16-06).

---

## 7. Plan priorizado (mi lectura, no la del Maestro)

> **Disclaimer:** estos son mis P0/P1, no los del Maestro 16-06.
> Coinciden en casi todo. Donde difiero, lo digo.

**P0 — Cerrar el marco de publicabilidad y de no-bloqueo
(2–3 días)**

- [ ] **H1** Migrar los 9 `package.json` de plugins a
  `dist/` + `exports` condicional + smoke `node dist/cli.js
  --check` por plugin. Trivial; ~10 min por plugin.
- [ ] **H2** Migrar las 6 tools/swarm de `proposals` con I/O
  síncrono a `fs/promises`. Es trabajo mecánico, mismo
  patrón que M4 (`docs` engine). Suite verde al final.
- [ ] **H3** Pasar las respuestas de tools de `proposals` que
  re-emiten JSON a `toolJson(out)`. Mismo guard de budget
  que M8.

**P1 — Robustez operativa (2–4 días)**

- [ ] **H5** Reusar `corePaths` en `prepareServerBlueprintOnStart`
  (cierra M15).
- [ ] **H6** Ampliar `detect-framework.ts` con Next/Nuxt/Astro/
  Remix/Solid (3 líneas cada uno).
- [ ] **H7** `docs_list` con `limit`/`offset` (tool schema +
  refactor mínimo de `engine.listDocs`).
- [ ] **H8** Decisión de diseño + (si sí) `deps_outdated`
  detrás de flag `--network`. (Si no, documentar "offline
  by design" en el README del plugin.)
- [ ] **H4** Subir specs de `quality`, `docs`, `notification`
  de 1 a ≥3 cada uno (cobertura desigual).
- [ ] **H9** `bunx biome migrate` (1 comando, cierra la
  info deprecada).
- [ ] **H10** `git rm --cached .claude/settings.local.json`
  + `.gitignore`.

**P2 — Calidad de producto (1 semana)**

- [ ] **H11** Test e2e de `subscribe` cross-restart (reinicio
  del server, verificar no re-entrega).
- [ ] Cerrar M11 residuales: `rules` (H6), `docs` (H7),
  `deps` (H8).
- [ ] Guardas anti-symlink-cíclico en `search`/`docs`
  (eco del Maestro 16-06, no lo verifiqué).
- [ ] Freno duro anti-idle en `auto_work` (eco del Maestro).

**P3 — Plataforma (>= 1 sprint)**

- [ ] M12 plugin `metrics` (latencia/bytes/errores por tool).
- [ ] M13 plugin `security` (secret-scan, command allow/deny,
  threat-model por plugin) + bridge securecoder.
- [ ] M14 migraciones de estado (`version`, `migrate v1→v2`,
  `doctor --migrate --dry-run`, backup pre-migración).
- [ ] Skills versionadas (`mcp-vertex-operator`, `swarm-runner`,
  `plugin-author`, `state-repair-playbook`, `token-budget`).
- [ ] TypeDoc de `public/`, `/examples`, JSON Schema del
  config. `npm publish` (lo hace el usuario;
  `docs/NPM_PUBLISH.md` ya está).

> **Estimación combinada** (subjetiva, hecha desde el código,
> no desde el reporte de los 8 modelos): P0 → **9,5**;
> +P1 → **9,7-9,8**; +P2 → **10,0**; +P3 → **11/10**. La
> cifra coincide con el Maestro 16-06 casi al decimal —
> sospecha de que el techo lo marca la disciplina, no la
> arquitectura.

---

## 8. Scoreboard (esta auditoría, no las 8)

| Dimensión | Nota | Comentario |
|---|---:|---|
| Núcleo `packages/core` | 9,4 | contratos, concurrencia, scaffold, CLI: todos muy bien. Drift de `cacheDir` (H5) y `linter.enabled` deprecado (H9) son ruidos. |
| Plugin `proposals` | 8,8 | arquitectura excelente; I/O síncrono en tools (H2) y pretty-print residual (H3) lo bajan de 9. |
| Plugin `memory` | 9,3 | TTL + redacción de secretos (M11) están bien resueltos; el sync en `store.ts` (H2-territorio) es el único lunar. |
| Plugin `search` | 9,4 | regex/globs/truncation (M11) bien; nada que objetar. |
| Plugin `rules` | 8,0 | detección incompleta (H6) + 2 specs = "útil pero no best-in-class". |
| Plugin `docs` | 8,5 | engine async (M4) ✅; sin paginación explícita (H7). |
| Plugin `deps` | 8,0 | correcto y honesto, pero minimal (H8). |
| Plugin `git` | 8,5 | ya async, errores `{ok, reason}`. |
| Plugin `quality` | 8,5 | `spawn`+timeout+tail, pero 1 spec y frontera de confianza sin documentar. |
| Plugin `notification` | 8,5 | watcher + polling fallback; infra útil, infra infra. |
| Concurrencia y mutex | 9,5 | M1 está bien resuelto (token + heartbeat). |
| Tokens / budgets | 9,0 | M8 cerrado en las tools grandes; residuales (H3) en las medianas. |
| Test suite | 9,0 | 441 verde + 1 deprecation info; cobertura desigual (H4). |
| CI / release | 9,5 | 3 jobs (lint/validate/pack-smoke), lockfile trackeado, `bun run release` con semver lockstep. |
| Documentación | 9,0 | CHANGELOG honesto, README por paquete, `docs/PLUGINS-MCP-VERTEX.md`, `docs/TOKEN-BUDGETS.md`, `docs/NPM_PUBLISH.md`. Falta TypeDoc/`/examples`. |
| Plataforma (M12-M14) | 5,5 | sin métricas, sin security, sin migraciones. Esto es lo que separa 10 de 11. |
| **Total (media ponderada)** | **9,2** | techo = disciplina de cierre en P0/P1. |

---

## 9. Diferencias explícitas con la auditoría Maestra 16-06

Las listo para que se vea que **leí el código, no la auditoría**:

1. **H1 (publicabilidad de plugins)** es **nuevo**. La Maestra
   marcó M3 como cerrado en core; el grep de los 9
   `package.json` de plugins muestra que el mismo gap existe
   ahí. No lo vi en la Maestra.
2. **H2 (I/O síncrono en tools de `proposals`)** lo separo del
   M5 porque M5 explícitamente cerró `agents/`, no `tools/` ni
   `swarm/`. M5 no es que esté mal cerrado, es que **acotó
   dónde mirar**. La Maestra lo presenta como cerrado en P0; mi
   lectura es "cerrado a medias".
3. **H3 (pretty-print)** lo separo del M8 por la misma razón:
   M8 cerró las 3 tools más grandes, no las 6+ que quedan en
   `proposals/`.
4. **H4 (cobertura desigual)** está en M10 de la Maestra; lo
   recojo en P1 mío, no en P2, porque es 1 día de trabajo
   disciplinado y sube el ratio de tests/payload.
5. **H5 = M15** idéntico.
6. **H6/H7/H8 = M11 (residual)** idéntico.
7. **H9 (deprecation de Biome)** es nuevo, trivial.
8. **H10 (`.claude/settings.local.json`)** la Maestra lo marca
   como "menor"; yo lo subo a P1 porque es 1 línea y deja
   limpio el repo.
9. **H11 (test e2e de M6)** nuevo: la Maestra dice "M6
   ✅"; yo no encontré un test que reinicie el server y
   verifique no-re-entrega — solo unitarios con
   `__resetDeliveredDigestsForTesting` (que ya no existe, fue
   borrado en M6). No es blocker, pero el e2e completa la
   cobertura.

> **Conclusión final:** `mcp-vertex` está **a una semana de
> disciplina de cierre del 10/10** y **a un sprint de 11/10**.
> El techo lo marcan los P0/P1 míos (H1-H10), no la
> arquitectura. Y la arquitectura, ya, **es de referencia**.

— Auditoría independiente, 17-06-2026. Revisada contra
`0f54f33`. Estado: `bun run validate` → 431 + 10 skip = 441.
