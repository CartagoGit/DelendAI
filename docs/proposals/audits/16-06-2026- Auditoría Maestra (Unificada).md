# 16-06-2026 · Auditoría Maestra (Unificada) — `@cartago-git/mcp-core`

> **Documento único y vigente.** Consolida **8 auditorías independientes** del
> estado actual del monorepo en una sola hoja de ruta hacia el "magistral" (11/10).
> Todos los hallazgos 🔴/🟠 de abajo están **re-verificados contra el código** en
> esta sesión: se cita la línea exacta.
>
> **Las 8 auditorías unificadas** (archivadas en `docs/proposals/done/`):
> - **1ª ronda (previas, ex `AUDITORIA-*`):** síntesis multi-modelo 15-06; Sonnet
>   (por dimensiones); Gemini (exhaustiva, escala FATAL→PERFECTO); Gemini (unificada).
> - **2ª ronda (16-06, una por modelo):** **Antigravity·Sonnet 4.6** (8,5),
>   **Antigravity·Gemini 3.5 Flash** (8,9), **Claude Code·Opus 4.8** (9,0),
>   **Codex·GPT-5** (9,1).
>
> **Estado verificado de la suite:** 415 pasados + 10 skip = **425 tests**, 63
> ficheros, `bun run validate` exit 0, typecheck limpio. ~19,5k LOC fuente.
> **Nota de consenso: 8,9 – 9,1 / 10.** Arquitectura de referencia; el techo lo
> marcan acabados acotados, no rediseño.

---

## 1. Veredicto unificado

Los 8 revisores coinciden: `mcp-core` es **ingeniería orientada a agentes de
calidad poco habitual**. Núcleo *project-agnostic* y hermético, plugins que reciben
todo resuelto por `IMcpPluginContext`, escritura atómica + mutex inter-proceso,
cuarentena de ficheros corruptos (corrupto ≠ vacío), **presupuesto de tokens medido
con guarda de regresión** sobre el servidor MCP real, **SDK de tipos generado desde
los `outputSchema` con drift-guard**, tests de caos concurrente y CI con pack-smoke.

La gran fiabilización P0/P1 de rondas previas está hecha (§2). El consenso de la 2ª
ronda es nítido y lo resume Opus: **"ya no quedan agujeros, quedan acabados"**. Lo
que separa del 11/10 son: una **garantía de mutex formalmente correcta bajo robo
concurrente**, **genericidad real** (un `enum` de roles del host aún bloquea la
adopción externa de `proposals`), **erradicar el I/O síncrono residual**, una
**puerta de lint** y **cobertura de tests pareja**, y subir de "framework excelente"
a "plataforma operable" (observabilidad, seguridad, migraciones de estado).

---

## 2. Lo ya cerrado (historial — no re-abrir)

Confirmado por la 2ª ronda como **resuelto** respecto a auditorías de días atrás:

- **Fiabilidad del estado:** escritura atómica (temp en mismo dir, anti-EXDEV) +
  `withFileMutex` en lock/queue/registry/memory; `process.cwd()` erradicado de los
  engines (`getLockPath` lanza si falta `lockPath`); `proposals` deriva el layout de
  `ctx` (`buildSwarmPaths`); schema de lock único canónico; **corrupto ≠ vacío**
  (`quarantineCorruptFile` + `CorruptFileError`).
- **Genericidad parcial:** `IProposalTrack` es `string` con `knownTracks` opt-in;
  carpetas inyectables (`extraFolders`); modelo no hardcoded en scaffold.
- **Async + estructurado:** `git` y `search` migrados a `fs/promises` + errores
  `{ok,reason}`; `quality` con `spawn`/timeout/tail; memoria con mutex + quotas +
  ranking BM25-lite + `list` paginado.
- **Plataforma:** plugin `notification` (push de `lock-released`), `state_health` +
  `state_repair`, `compact_status`, presets de plugins `minimal/standard/swarm`,
  plugins `docs` y `deps`, refactor de `round-context` en 5 módulos, `outputSchema`
  en ~32 tools + red e2e estricta, `--verbose`, `IStatusCollector` integrado,
  semver + `bun run release`, **SDK de tipos generados**.

---

## 3. Cola viva — hallazgos abiertos (verificados en código)

Notación: **(n/8)** = cuántas de las 8 auditorías lo señalan. Severidad consensuada.

### 🔴 P0 — Correctitud, concurrencia y genericidad

**M1 · Carrera de robo del mutex (TOCTOU + borrado incondicional)** — (4/8)
[with-file-mutex.ts:85](../../../packages/core/src/lib/shared/with-file-mutex.ts#L85)
hace `if (acquired) await rm(lockPath)` **incondicional** en el `finally`; el sidecar
guarda solo `${pid}\n${ts}` ([:54](../../../packages/core/src/lib/shared/with-file-mutex.ts#L54)),
sin token de propiedad. Si `fn()` de A supera `timeoutMs` (5 s), B roba el lock
([:75](../../../packages/core/src/lib/shared/with-file-mutex.ts#L75)) y crea el suyo;
al terminar, el `finally` de A **borra el lock de B** → C entra en paralelo →
*lost-update*. Gemini lo marca FATAL, Opus lo cataloga como TOCTOU residual, las
previas igual. Para secciones críticas sub-ms no se dispara; bajo disco lento/FS de
red/payload grande, sí.
**Fix (1 función):** escribir `pid\nts\nUUID`; en el `finally`, releer y **borrar
solo si el token coincide**; opcional heartbeat del `mtime` y robar solo por
`staleMs`.

**M2 · `AGENT_SLOTS` es un `enum` cerrado con vocabulario del host** — (1/8, Sonnet, **FATAL**)
[task-queue-engine.ts:74](../../../plugins/proposals/src/lib/agents/task-queue-engine.ts#L74):
`const IAgentSlotSchema = z.enum(AGENT_SLOTS)` con `['orchestrator',
'proposal_guardian', 'implementation_runner', 'delivery_verifier',
'technical_investigator']`. Cualquier proyecto externo que use `proposals` **debe**
usar exactamente estos slots o el `enqueue` es rechazado por Zod. Es el último
rompe-genericidad real ("project-agnostic") del repo. Solo Sonnet lo aísla, pero es
verificado y de alto impacto en adopción.
**Fix:** `z.string().min(1)` o set de slots inyectable por opciones del plugin.

**M3 · Se publica TypeScript fuente; el CLI es de facto *bun-only*** — (1/8, Gemini-exhaustiva previa)
[packages/core/package.json](../../../packages/core/package.json): `"main"`,
`"exports"` → `./src/*.ts` y `"bin": "./src/cli.ts"`, **sin script `build`**. Bajo
Node, `npx @cartago-git/mcp-core` no ejecuta `.ts` y falla; solo `bunx` arranca.
Las 4 auditorías nuevas corrieron con bun y no lo notaron, pero limita la adopción
en Claude Desktop/Cursor/VS Code (lanzan `npx`/`node`).
**Fix:** `build` a `dist/` (`.js`+`.d.ts`, `exports` condicional, `bin` a `.js`)
**o** documentar "requiere bun" como contrato de primera línea.

### 🟠 P1 — I/O síncrono que bloquea el event loop

**M4 · `plugins/docs` con I/O síncrono** — (3/8: Sonnet **FATAL**, Gemini **FATAL**, Codex)
[docs/src/lib/engine.ts:1](../../../plugins/docs/src/lib/engine.ts#L1) usa
`readdirSync`/`statSync`/`readFileSync` en handlers async. `search` ya es async;
`docs` no. En árboles grandes o FS de red congela el servidor MCP entero.
**Fix:** migrar el engine a `fs/promises` (paralelo de lo hecho en `search`).

**M5 · I/O síncrono residual en rutas calientes de `proposals`** — (2/8: Sonnet, Codex)
`readFileSync` dentro del `superRefine` de Zod del `enqueue`
([task-queue-engine.ts:363](../../../plugins/proposals/src/lib/agents/task-queue-engine.ts#L363)),
y en [zombie-reconcile.ts:51](../../../plugins/proposals/src/lib/agents/zombie-reconcile.ts#L51)
/ [promote-on-release.ts:119](../../../plugins/proposals/src/lib/agents/promote-on-release.ts#L119).
Menos crítico que `docs` (esporádico) pero inconsistente.
**Fix:** prefetch async antes del parse; `fs/promises` en reconcile/promote. (`deps`
y la inicialización de `rules` también leen sync — baja prioridad.)

### 🟠 P1 — Robustez de estado y hermeticidad

**M6 · `deliveredDigests` solo en memoria** — (2/8: Sonnet, Codex)
[task-queue-engine.ts:307](../../../plugins/proposals/src/lib/agents/task-queue-engine.ts#L307):
`new Set<string>()`. Tras reinicio del server (habitual con `--watch`) el primer
`subscribe` re-entrega todos los digests → trabajo duplicado en el swarm.
**Fix:** persistir en sidecar `.subscribe-delivered.json` bajo el mismo `withFileMutex`.

**M7 · `waitFor.file` validado con `existsSync` sobre ruta cruda** — (2/8: Codex, + previa)
[persistent-task-queue.ts:336-345](../../../plugins/proposals/src/lib/agents/persistent-task-queue.ts#L336-L345):
si la ruta es workspace-relativa y `parseQueue` corre con otro `cwd`, da falsos
`WAIT_FOR_FILE_MISSING` que **abortan el parseo de toda la cola**. Relacionado: el
fallback suave de `lockPath` en la acción `report` ([task-queue-engine.ts:131](../../../plugins/proposals/src/lib/agents/task-queue-engine.ts#L131))
viola la regla "el workspace siempre se inyecta".
**Fix:** resolver ambos contra el root inyectado; hacer `lockPath` requerido en `report`.

### 🟠 P1 — Tokens

**M8 · Pretty-print residual en respuestas MCP** — (2/8: Codex, + Gemini-exhaustiva previa)
[round-context.tool.ts:150](../../../plugins/proposals/src/lib/tools/round-context.tool.ts#L150)
usa `JSON.stringify(out, null, '\t')`, contra el propio `TOKEN-BUDGETS.md`. Codex
lista además `sync_proposals`, `get_proposal_workflow`, `scaffold` y stores con
pretty-print en caliente. El digest de ronda es de los payloads mayores y **no está
cubierto por el guard de presupuesto** (mide solo `overview`/`auto_work`).
**Fix:** `toolJson(out)` en todas las tools calientes; ampliar el guard a `--preset=swarm`.

### 🟡 P2 — Calidad de producto (auto-coherencia del repo)

**M9 · Sin puerta de lint/formato en el repo** — (1/8: Opus, *mayor valor/esfuerzo*)
Verificado: **no hay ESLint ni Biome** (la única mención `eslint` es de
`plugins/rules`, que lo recomienda a *terceros*). Un repo cuyo producto es enseñar
calidad (`rules`) sin auto-aplicarse un linter es la incoherencia más visible.
**Fix:** Biome (rápido, cero-config, 1 dep) + job CI `lint`.

**M10 · Cobertura de tests muy desigual** — (2/8: Opus, Codex)
`proposals` acapara 34 de 63 ficheros; los plugins satélite tienen ~1 spec cada uno
pese a tener engines puros fáciles de testear.
**Fix:** suite real por plugin satélite.

**M11 · Plugins satélite por debajo de "best-in-class"** — (4/8, consenso)
- `search`: **solo `includes()`** ([engine.ts:106](../../../plugins/search/src/lib/engine.ts#L106)),
  sin regex/glob/cursor/`.gitignore`. El techo más bajo del repo (señalado por los 4).
- `deps`: solo `package.json`; sin polyglot (Python/Rust/Go), outdated, unused,
  licencias ni vuln (offline por diseño).
- `memory`: falta `createdAt`/TTL/archivado y **redacción de secretos**.
- `rules`: detección de frameworks incompleta (sin Next/Nuxt/Astro/Remix/Solid);
  materializa **todos** los presets; emite comandos `eslint` sin avisar si falta.
- `docs`: sin paginación (`limit`/`offset`) → invisibles los docs > `maxResults`.

### 🟡 P3 — Plataforma operable (de "framework" a "plataforma")

**M12 · Observabilidad / métricas** — (2/8: Codex, Sonnet) — sin métricas por tool
(latencia, bytes, errores, retries, lock-conflicts). "Gasta menos tokens" es
razonable pero **no demostrable** sin medirlo. Plugin `metrics`.

**M13 · Capa de seguridad propia** — (3/8: Codex, Sonnet, Gemini) — sin secret-scan,
command allow/deny, threat-model por plugin ni sanitización central de paths. Plugin
`security` y/o bridge con el `securecoder` externo (hoy aislado).

**M14 · Versionado/migración de estado** — (1/8: Codex) — hay `version: 1` en stores
pero sin migradores `v1→v2`, backup pre-migración ni `doctor --migrate --dry-run`.

**M15 · `prepareServerBlueprintOnStart` recalcula `cacheDir` e ignora el del config** — (1/8: Opus)
[assemble.ts:336-358](../../../packages/core/src/lib/cli/assemble.ts#L336-L358) →
drift de bajo impacto: derivar de `assembleCliConfig`.

**Menores verificados:** `outputSchema` permisivo `z.object().catchall` en tools
action-multiplexed (limitado por el SDK MCP, no por el repo); `.claude/settings.local.json`
versionado con `bypassPermissions`; directorio `contracts/constants/` vacío;
comentarios obsoletos (p. ej. el fallback cwd de `ITaskQueuePaths.lockPath`);
sin guarda anti-symlink-cíclico en los walks de `search`/`docs`; frontera de
confianza de `quality` (shell arbitrario desde el config) no documentada.

---

## 4. Eficiencia de tokens (consolidado)

**Muy buena y medida** (consenso 8/8): cold-start <300 tok (`overview compact` ~220,
`auto_work` ~36), knowledge lazy vía MCP resources, caps en `search`, paginación en
`memory`, `git diff --stat`, push en vez de polling — todo con guard de regresión.
**Fugas abiertas:** M8 (pretty-print en `round_context` y otras tools, no cubierto
por el guard) y el crecimiento lineal del `overview` *full* con las ~45 tools (M11):
conviene techo de budget por-preset y modo de **carga de tools por perfil/rol**.

## 5. Bucles y bloqueos (consolidado)

**Sin deadlock ni bucle infinito alcanzable** (consenso 8/8). Mitigados:
`lock-conflict` con `nextAction` anti-retry, `auto_work` `idle`/`all-claimed`,
TTL + `expireSweep` + backpressure + zombie-reconcile, `notification` push,
`continuity-enforcer` (corta re-lecturas), kill por process-group en acceptance.
**Asteriscos finos abiertos:** M1 (correctitud bajo robo concurrente, no bloqueo),
I/O síncrono que congela el event loop (M4/M5), y la ausencia de **freno duro**
anti-idle en `auto_work` (hoy es guidance, no enforcement: un contador de no-progreso
que escale a error tras N `idle` lo cerraría).

---

## 6. Capacidades candidatas (tools / skills / agentes / plugins)

**Tools** (alto valor): `search` con **regex/glob** (4/8); **freno de no-progreso**
en `auto_work`; `proposals` **abort/handoff** (ceder slices limpiamente al morir);
`deps_outdated` (red opcional); `swarm_timeline`/`replay` (depurar rondas);
`quality_cancel` (matar build/lint por PID). *Nota:* `state_health`/`state_repair`
ya existen — la sugerencia de "health_check/repair" está cubierta.

**Plugins nuevos:** `metrics` (⭐⭐⭐⭐⭐ Codex), `security` (⭐⭐⭐⭐⭐), `events`
(bus durable), `migrations`, `bench`, y un `web`/`fetch` agnóstico con allow-list.

**Skills/prompts versionados:** `mcp-core-operator`, `proposal-swarm-runner`,
`mcp-plugin-author`, `state-repair-playbook`, `token-budget-playbook`,
`concurrency-patterns`, `recovery-playbook`; prompt `finish` (cerrar ronda).
**Agentes:** NO añadir más por defecto (consenso) — 5 roles es el límite saludable.

---

## 7. Plan priorizado hacia el "magistral"

**P0 — Correctitud, genericidad y adopción (2–4 días) ✅ HECHO (2026-06-17)**
- [x] **M1** Token de propiedad (`pid\nts\nUUID`) en `withFileMutex` + borrado condicional + heartbeat de `mtime`; test de robo concurrente (`with-file-mutex.spec.ts`).
- [x] **M2** `agentSlot` → `z.string().min(1)` en los 2 schemas (task-queue-engine + persistent-task-queue); 5 roles canónicos quedan como `DEFAULT_AGENT_SLOTS` (default, no enum); test de slot no-canónico.
- [x] **M3** Runtime: **build a `dist/`** (`bun build` ESM + `tsc --emitDeclarationOnly`) en los 10 paquetes; manifests con `exports` condicional (`types`+`import`) + `bin` a `dist/cli.js` (shebang node). Corre bajo Node/npm/pnpm/yarn, Deno y bun. `scripts/build.ts`; release y CI compilan antes de publicar; smoke `node dist/cli.js` en CI.
- [x] **M4** `plugins/docs` engine → `fs/promises` (sin I/O síncrono); callers/specs a `await`.
- [x] **M8** `round_context` (vía `toolJson`), `sync_proposals` y `get_proposal_workflow` sin pretty-print (conservan `structuredContent`). *Pendiente menor:* ampliar el guard de budget a `--preset=swarm`.

**P1 — Robustez operativa (3–5 días)**
- [ ] **M5** Erradicar I/O síncrono residual (enqueue refine, zombie-reconcile, promote).
- [ ] **M6** Persistir `deliveredDigests` (idempotencia cross-session).
- [ ] **M7** Resolver `waitFor.file` y `lockPath` (report) contra el root inyectado.
- [ ] **M15** Blueprint sin drift de `cacheDir`; limpiar comentarios obsoletos; sacar `settings.local.json` de git.
- [ ] Release/CI: `release.yml` por tag `v*` con `provenance`, `CHANGELOG`, pinning de TS/vitest/Bun, coverage gate.

**P2 — Calidad de producto (1 semana)**
- [ ] **M9** Biome + job CI `lint`. *(mayor valor/esfuerzo)*
- [ ] **M10** Suite real en los 6 plugins satélite.
- [ ] **M11** `search` regex/glob/`.gitignore`; `memory` TTL+redacción de secretos; `rules` detección+`compact`+finding `eslint-not-installed`; `docs` paginación; `deps_outdated`.
- [ ] Freno duro anti-idle en `auto_work`; `quality_cancel`; guarda anti-symlink en walks; documentar frontera de confianza de `quality`.

**P3 — Plataforma de referencia**
- [ ] **M12** Plugin `metrics` (observabilidad). **M13** Plugin `security` + bridge securecoder. **M14** Migraciones de estado. `events` durable; `replay`/snapshots; `bench`.
- [ ] Skills/prompts versionados (operator, swarm-runner, plugin-author…); plugin `web`/`fetch`; mapa interno / split de `proposals/swarm`; TypeDoc de `public/`; `/examples`; JSON Schema de config.
- [ ] **npm publish** (lo ejecuta el usuario, `docs/NPM_PUBLISH.md`).

> **Estimación combinada de los revisores:** P0 → ~9,5; +P1 (robustez/release) →
> ~9,7-9,8; +P2 (lint + cobertura + plugins best-in-class) → ~10,0; +P3
> (observabilidad/seguridad/migraciones/replay + skills oficiales) → **11/10**.

> **✅ Estado de ejecución (2026-06-17):** P0 completo; **P1/P2/P3 prácticamente
> cerrados** — M5, M7, M9, M10, M11, **M12 (metrics), M13 (allow/deny de comandos en
> quality — NO el bridge securecoder, descartado por indefinido), M14 (migraciones
> de estado), M15/H5 (blueprint sin drift)** hechos con tests, más toda la serie
> H1–H10 de la 4ª auditoría (Copilot·MiniMax) y el workstream **W1/W2** (auto-release
> en push a `main` + sitio GitHub Pages). Detalle en `../RESUMEN-SESION-2026-06-17.md`.
> **Backlog abierto:** **W3 — sitio web profesional** (i18n, marquesinas duales,
> benchmarks, responsive; spec en el RESUMEN) y nice-to-haves de plataforma (TypeDoc,
> `/examples`, JSON Schema de config, skills/prompts versionados, `quality_cancel`,
> freno anti-idle, H11 e2e). **npm publish + deploy: pendientes de `NPM_TOKEN` y
> merge `develop→main` (los hace el usuario).** 471 tests verdes.

### 🆕 Auditoría de estado actual (17-06, Opus) — cola viva tras todo lo cerrado

> Revisión independiente del estado ACTUAL (en `done/17-06-2026- Claude Code (Opus
> 4.8) [estado-actual].md`). Veredicto **9,6/10**. Higiene verificada: **0
> `@ts-ignore`, 0 `any` real en `src`, `console.*` limpio, los `TODO` son plantillas
> del scaffold**. Hallazgos abiertos (todos no-bloqueantes, ninguno rearquitectura):

- **✅ A1 (P1) · I/O síncrono residual FUERA de `proposals/lib`** — HECHO (17-06).
  Migrados a async: **`plugins/memory/src/lib/store.ts`** (era 100% síncrono dentro
  del mutex → ahora `readFile`/`writeFileAtomic`; el más importante, hot path),
  **`plugins/deps/src/lib/engine.ts`** (manifest + lockfiles) y **`core/scaffold-tool.ts`**
  (el write-loop del aplicado `--write` → `mkdir`/`writeFile`/`stat`). *Carve-out
  aceptado:* `core/bootstrap` (`createWorkspaceFileReader` + `analyzeProject`) se
  deja síncrono — es una **función pura sobre un reader inyectado**, one-shot y
  acotada a un set fijo de ficheros conocidos (lockfiles/configs), misma categoría
  que las lecturas de **boot** de `assemble.ts`; volverla async ripplearía por todo
  el analizador con mal cost/benefit. Invariante "ningún handler de tool en bucle/
  hot-path bloquea el event loop": **cumplido**.
- **🟡 A2 (P2) · Onboarding/plataforma** — *quick wins HECHOS (17-06):* **JSON Schema
  de `mcp-core.config.json`** (generado del Zod, drift-guard, publicado, `$schema` en
  el config del repo), **`quality_cancel`** (aborta runs por PID/todos con kill de
  grupo) y **freno duro anti-idle en `auto_work`** (`stop:true` tras 3 idles
  consecutivos, reset al haber trabajo). **`/examples` HECHO** —
  `examples/custom-plugin` (plugin de ejemplo **auto-testeado**: el contrato completo
  en un fichero) + `examples/minimal` y `examples/swarm` (READMEs). *Pendiente:*
  TypeDoc de `public/`, skills/prompts versionados.
- **🟡 A3 (P3) · W3 sitio web profesional** sin empezar (solo el `build-site.ts`
  mínimo). Spec en el RESUMEN.
- **🔵 A4 (nit) · DX:** el typecheck raíz incluye el generador del sitio
  (`apps/web/src/build-site.ts`), que importa el SDK → un `pull` sin `bun install`
  deja el typecheck rojo (en CI no, por `--frozen-lockfile`). Desacoplar o typecheck
  propio para `apps/`.

#### ✅ Cerrado el 17-06 (tras la auditoría de estado)
- **Infra/release:** warnings de los 4 workflows saneados (inyección `${{ }}`→`env`,
  `gh secret list` roto eliminado, `configure-pages`); **auto-versionado por
  Conventional Commits** (`scripts/derive-version.ts`, tag-driven, el usuario no
  hace nada) con tests.
- **`apps/` + dogfooding:** carpeta `apps/` (workspace) con `apps/web` (genera
  `index.html` + **`capabilities.json`** de la lista viva → cada release sabe qué
  trae); `.mcp.json` + `mcp-core.config.json` → el repo usa **mcp-core como su
  propio servidor MCP** (preset swarm). **480 tests verdes.**

#### Orden de ejecución priorizado (decidido 17-06)
1. ✅ **A1 — barrido async** (`memory/store`, `deps/engine`, `core/scaffold` apply):
   HECHO 17-06. `core/bootstrap` queda como carve-out razonado (pure-fn one-shot).
2. **W3 — sitio web profesional con Astro** (decisión 17-06: estático para GitHub
   Pages, componentes SCSS+TS+HTML, i18n, marquesinas duales, benchmarks, responsive;
   consume `capabilities.json`). Sustituye el generador mínimo de `apps/web`. *El
   trozo grande y de cara al usuario — segundo.*
3. ✅ **A2 quick wins** (HECHO 17-06): JSON Schema del config, `quality_cancel`,
   freno duro anti-idle en `auto_work`.
4. **A2 onboarding:** ✅ `/examples` (custom-plugin tested + minimal/swarm) HECHO;
   *pendiente:* TypeDoc de `public/`, skills/prompts versionados.
5. **A4** (nit): desacoplar el typecheck de `apps/` del SDK.
6. **Deploy** (lo hace el usuario): `NPM_TOKEN`, Pages = Actions, merge `develop→main`.

> **Camino:** A1 → ~9,8; +A2 → ~10,0; +A3 + publish → **11/10**.

---

## 8. Scoreboard de las 8 auditorías

| Ronda | Revisor | Nota | FATAL señalados |
|---|---|---|---|
| 2ª | Codex · GPT-5 | 9,1 | ninguno |
| 2ª | Claude Code · Opus 4.8 | 9,0 | ninguno (TOCTOU mutex como "residual") |
| 2ª | Antigravity · Gemini 3.5 Flash | 8,9 | mutex race, docs sync |
| 2ª | Antigravity · Sonnet 4.6 | 8,5 | `AGENT_SLOTS` enum, docs sync |
| 1ª | Gemini (exhaustiva) | 9,3 | ninguno (bun-only como "muy mal") |
| 1ª | Gemini (unificada) | 8,9 | mutex race, docs sync |
| 1ª | Sonnet (por dimensiones) | 8,5 | — |
| 1ª | Síntesis multi-modelo 15-06 | ~7,3→8,5 | (P0/P1 ya cerrados) |

**Consenso: 8,9 – 9,1 / 10.** Cuatro fixes P0 (M1 mutex, M2 slots, M3 runtime,
M4 docs) + el cierre del pretty-print (M8) desbloquean la categoría. Lo demás es
disciplina incremental sobre una arquitectura que los 8 coinciden en calificar de
referencia. **No hay rediseño en el camino al 11/10 — solo acabados.**

— Auditoría maestra unificada, 16-06-2026. Hallazgos 🔴/🟠 re-verificados contra el código.
