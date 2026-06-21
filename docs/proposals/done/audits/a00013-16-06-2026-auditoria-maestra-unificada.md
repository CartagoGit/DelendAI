---
id: a00013
kind: audit
title: "Auditoría Maestra (Unificada) — 16-06-2026"
status: done
date: 2026-06-21T01:23:10Z
track: archive
---

# 16-06-2026 · Auditoría Maestra (Unificada) — `@mcp-vertex/core`

> **Estado: CERRADA como referencia histórica (2026-06-21).** Esta auditoría
> consolidó **8 auditorías independientes** del estado del monorepo en una
> sola hoja de ruta hacia el "magistral" (11/10). Todos los hallazgos 🔴/🟠
> de abajo fueron **re-verificados contra el código** en esta sesión: se
> cita la línea exacta.
>
> **Superseded by [f00001 — Done folder mirrors kinds](../in-progress/f00001-done-folder-mirrors-kinds-audits-feats-fixes-sub-folders-inside-done.md)**
> (cuando aterrice): la Maestra ya no es "el documento único y vigente" —
> los hallazgos abiertos migraron a propuestas cerradas en `done/feats/` y
> `done/fixes/`, y la organización de las propias auditorías pasó a
> `done/audits/`. Esta página queda como **snapshot histórico del estado al
> 16-06-2026**, útil como referencia para entender el "antes" del refactor.
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

Los 8 revisores coinciden: `mcp-vertex` es **ingeniería orientada a agentes de
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
Node, `npx @mcp-vertex/core` no ejecuta `.ts` y falla; solo `bunx` arranca.
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

**Skills/prompts versionados:** `mcp-vertex-operator`, `proposal-swarm-runner`,
`mcp-plugin-author`, `state-repair-playbook`, `token-budget-playbook`,
`concurrency-patterns`, `recovery-playbook`; prompt `finish` (cerrar ronda).
**Agentes:** NO añadir más por defecto (consenso) — 5 roles es el límite saludable.

---

## 7. Plan priorizado hacia el "magistral"

**P0 — Correctitud, genericidad y adopción (2–4 días) ✅ DONE (2026-06-17)**
- [x] **M1** Token de propiedad (`pid\nts\nUUID`) en `withFileMutex` + borrado condicional + heartbeat de `mtime`; test de robo concurrente (`with-file-mutex.spec.ts`).
- [x] **M2** `agentSlot` → `z.string().min(1)` en los 2 schemas (task-queue-engine + persistent-task-queue); 5 roles canónicos quedan como `DEFAULT_AGENT_SLOTS` (default, no enum); test de slot no-canónico.
- [x] **M3** Runtime: **build a `dist/`** (`bun build` ESM + `tsc --emitDeclarationOnly`) en los 10 paquetes; manifests con `exports` condicional (`types`+`import`) + `bin` a `dist/cli.js` (shebang node). Corre bajo Node/npm/pnpm/yarn, Deno y bun. `scripts/build.ts`; release y CI compilan antes de publicar; smoke `node dist/cli.js` en CI.
- [x] **M4** `plugins/docs` engine → `fs/promises` (sin I/O síncrono); callers/specs a `await`.
- [x] **M8** `round_context` (vía `toolJson`), `sync_proposals` y `get_proposal_workflow` sin pretty-print (conservan `structuredContent`). *Pending (minor):* ampliar el guard de budget a `--preset=swarm`.

**P1 — Robustez operativa (3–5 días)**
- [x] **M5** Erradicado (ver §"Closed on 17-06"): `proposals` migrado a `fs/promises`.
- [x] **M6** `deliveredDigests` persistido en `.subscribe-delivered.json` bajo `withFileMutex` (test `task-queue-subscribe-idempotency.spec.ts`). *Nota H11:* el test modela el reinicio (motor sin estado en memoria entre llamadas) — no hay e2e que mate y relance el proceso real; valor marginal bajo dado que el motor es la fuente de verdad y ya está cubierto.
- [x] **M7** `waitFor.file`/`lockPath` resueltos contra el root inyectado.
- [x] **M15** Blueprint sin drift de `cacheDir` (ver CHANGELOG "Fixed").
- [x] Release/CI: `release.yml` por tag `v*` con `provenance`, `CHANGELOG`, pinning de TS/vitest/Bun, coverage gate. **Provenance cerrado 21-06 por [`f00033`](../ready/f00033-release-provenance-via-npm-publish.md): `release.yml` ahora publica con `--tool=npm --provenance`; no hizo falta el rewrite script de `workspace:*` (premisa descartada — ver nota de implementación en f00033, `workspace:*` solo vive en `devDependencies`, que `npm publish` no instala).**

**P2 — Calidad de producto (1 semana)**
- [x] **M9** `.github/workflows/ci.yml` tiene job `lint` (`bun run lint` → `biome ci`), bloqueante.
- [x] **M10** Verificado 18-06: los 9 plugins satélite tienen tests reales (deps 7 casos, docs 10, git 6, memory 26, notification 8, quality 15, rules 11, search 18 tras M11). Ninguno trivial/vacío.
- [x] **M11** Verificado 21-06, cerrado:
  - ✅ `search`: regex + glob ya existían; **`.gitignore` de la raíz añadido hoy** (`isGitignored`/`parseGitignore`, negación `!`, anclaje `/`, `respectGitignore:false` para optar fuera) — `search-gitignore.spec.ts`, 5 casos.
  - ✅ `memory`: TTL (`expiresAt`) + `redactSecrets` ya existían (`redact-ttl.spec.ts`).
  - ✅ `docs`: paginación (`limit`/`offset`) ya existía (`docs-pagination.spec.ts`).
  - ✅ `rules`: `check_rules` acepta `compact:true` y emite `findings[]`
    explícitos para `missing-eslint-deps` conservando `missingEslintDeps` por
    compatibilidad. Cubierto por `plugins/rules/tests/src/lib/plugin.spec.ts`.
  - ✅ `deps`: **decidido y cerrado (21-06, sesión §11):** `deps_outdated` añadido,
    opt-in vía `plugins.deps.options.allowNetwork: true`, `effects: ['network']`
    declarado en la tool. Resuelve el baseline `x.y.z` del range (ignora
    `*`/`latest`/`workspace:`/`npm:`/`file:`/`link:`/git urls — `wanted: null`,
    no error) y compara contra `dist-tags.latest` del registro de npm
    (`GET registry.npmjs.org/<pkg>/latest`, fetcher inyectable). Capado a 50
    paquetes/llamada (`truncated`). `deps_list`/`deps_check` siguen offline sin
    cambios — es la única excepción declarada.
    ([engine.ts](../../../plugins/deps/src/lib/engine.ts),
    [tools.ts](../../../plugins/deps/src/lib/tools.ts)). 7 tests nuevos con
    fetcher inyectado (sin red real en la suite).
- [x] Freno duro anti-idle en `auto_work` + `quality_cancel`: confirmados hechos (§7, "Closed on 17-06"). *Pending (real):* guarda anti-symlink en walks; documentar frontera de confianza de `quality`.

**P3 — Plataforma de referencia**
- [x] **M12** Plugin `metrics`: `packages/core/src/lib/metrics/metrics-tool.ts`, tool `<prefix>_metrics`, `persist:true` con snapshots en `<cacheDir>/metrics/`.
- [x] **M13** Plugin `security` + bridge securecoder — **diferido indefinidamente** (decisión B de [`c00002`](../ready/c00002-decide-and-close-m13-security-plugin.md), 2026-06-21): los primitivos del core (`redact.ts` para secret redaction, `contain-path.ts` para path containment) más el allow/deny de comandos ya en `quality` cubren la superficie mínima viable. Empaquetarlo como plugin independiente no aporta valor mientras no haya un segundo consumer que necesite intercambiarlo; el bridge `securecoder` sigue fuera de alcance (spec propia, no definida). Reabrir si surge esa necesidad.
- [x] **M14** Cerrado (2026-06-21): `agent-registry-store` normaliza el registry
  mediante `runMigrations`/`IVersioned` del core, conserva el formato actual
  `version: 1`, y rechaza versiones futuras no soportadas en vez de aceptarlas
  silenciosamente. Cubierto por
  `plugins/proposals/tests/src/lib/shared/agent-registry-store.spec.ts`.
- [x] Skills/prompts versionados (operator, swarm-runner, plugin-author…); plugin `web`/`fetch`; mapa interno / split de `proposals/swarm`; TypeDoc de `public/`; `/examples`; JSON Schema de config. *(TypeDoc, `/examples` y JSON Schema ya DONE según §7)*
  ✅ `skills/manifest.json` (version-pinning contract: `version` + `minCoreVersion`
  por skill) + `tools/scripts/lint/check-skills.script.ts` (CI gate) + 5 skills nuevas
  (`mcp-vertex-operator`, `proposal-swarm-runner`, `state-repair-playbook`,
  `token-budget-playbook`, `concurrency-patterns`) + `loadSkills`/`ISkillBundle` en
  `packages/core/src/public/index.ts` (consumer helper) + plugin opt-in
  `@mcp-vertex/web-fetch` (`web_fetch`, allow-list con wildcard `*.suffix`,
  redirects re-validados hop-a-hop, cap de 50 KiB, `effects:['network']`, fuera de
  todo preset). 23 tests nuevos. *(Cierra `f00029`. Nota: el paquete npm es
  `@mcp-vertex/web-fetch` — `@mcp-vertex/web` ya era el nombre del workspace
  `apps/web`.)*
- [ ] **npm publish** (lo ejecuta el usuario, `docs/NPM_PUBLISH.md`).
  **Pausado en [`paused/c00001-pause-npm-publish.md`](../paused/c00001-pause-npm-publish.md)** —
  bloqueado por `NPM_TOKEN` + org `@cartago-git` + merge `develop→main`. El repo
  está listo (build, semver, smoke-cli/pack, workflow release.yml); solo falta
  la parte operativa del usuario.

> **Estimación combinada de los revisores:** P0 → ~9,5; +P1 (robustez/release) →
> ~9,7-9,8; +P2 (lint + cobertura + plugins best-in-class) → ~10,0; +P3
> (observabilidad/seguridad/migraciones/replay + skills oficiales) → **11/10**.

> **✅ Estado de ejecución (2026-06-17):** P0 completo; **P1/P2/P3 prácticamente
> cerrados** — M5, M7, M9, M10, M11, **M12 (metrics), M13 (allow/deny de comandos en
> quality — NO el bridge securecoder, descartado por indefinido), M14 (migraciones
> de estado), M15/H5 (blueprint sin drift)** hechos con tests, más toda la serie
> H1–H10 de la 4ª auditoría (Copilot·MiniMax) y el workstream **W1/W2** (auto-release
> en push a `main` + sitio GitHub Pages). Detalle en `../n00001-SESION-2026-06-17.md`.
> **Backlog abierto:** **W3 — sitio web profesional** (i18n, marquesinas duales,
> benchmarks, responsive; spec en el n00001) y nice-to-haves de plataforma (TypeDoc,
> `/examples`, JSON Schema de config, skills/prompts versionados, `quality_cancel`,
> freno anti-idle, H11 e2e). **npm publish + deploy: pendientes de `NPM_TOKEN` y
> merge `develop→main` (los hace el usuario).** 471 tests verdes.

### 🆕 Auditoría de estado actual (17-06, Opus) — cola viva tras todo lo cerrado

> Revisión independiente del estado ACTUAL (en `done/17-06-2026- Claude Code (Opus
> 4.8) [estado-actual].md`). Veredicto **9,6/10**. Higiene verificada: **0
> `@ts-ignore`, 0 `any` real en `src`, `console.*` limpio, los `TODO` son plantillas
> del scaffold**. Hallazgos abiertos (todos no-bloqueantes, ninguno rearquitectura):

- **✅ A1 (P1) · I/O síncrono residual FUERA de `proposals/lib`** — DONE (17-06).
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
- **🟡 A2 (P2) · Onboarding/plataforma** — *quick wins DONE (17-06):* **JSON Schema
  de `mcp-vertex.config.json`** (generado del Zod, drift-guard, publicado, `$schema` en
  el config del repo), **`quality_cancel`** (aborta runs por PID/todos con kill de
  grupo) y **freno duro anti-idle en `auto_work`** (`stop:true` tras 3 idles
  consecutivos, reset al haber trabajo). **`/examples` DONE** —
  `examples/custom-plugin` (plugin de ejemplo **auto-testeado**: el contrato completo
  en un fichero) + `examples/minimal` y `examples/swarm` (READMEs). **TypeDoc DONE**
  — API navegable de `public/` (`typedoc` → `apps/web/public/api`, desplegada en la
  web bajo `/api`, enlazada en el nav). *Pending:* skills/prompts versionados.
- **✅ A3 (P3) · W3 sitio web profesional** — **FOUNDATION DONE (17-06)** with
  **Astro** (estático, GitHub Pages): `apps/web` es ahora una app Astro real con
  Layout + Hero + **marquesinas duales** (sentidos opuestos, hover-pausa, zoom +
  nombre al pasar sobre cada icono), **i18n en/es**, sección de tools desde
  `capabilities.json` (registro vivo), benchmarks y SCSS responsive. Build estático
  con `base=/mcp-vertex`, 2 páginas, lint/build verdes; `pages.yml` despliega
  `apps/web/dist`. *Pending (iterative):* contenido más rico, logos SVG reales en
  las marquesinas, más idiomas.
- **✅ A4 (nit) · DX** — CLOSED: al pasar `apps/web` a app Astro con su propio
  tsconfig, se quitó `apps/*/src` del tsconfig raíz, así que el typecheck del repo
  ya no se acopla al SDK del generador del sitio.

#### ✅ Closed on 17-06 (tras la auditoría de estado)
- **Infra/release:** warnings de los 4 workflows saneados (inyección `${{ }}`→`env`,
  `gh secret list` roto eliminado, `configure-pages`); **auto-versionado por
  Conventional Commits** (`scripts/derive-version.ts`, tag-driven, el usuario no
  hace nada) con tests.
- **`apps/` + dogfooding:** carpeta `apps/` (workspace) con `apps/web` (genera
  `index.html` + **`capabilities.json`** de la lista viva → cada release sabe qué
  trae); `.mcp.json` + `mcp-vertex.config.json` → el repo usa **mcp-vertex como su
  propio servidor MCP** (preset swarm). **480 tests verdes.**

#### Orden de ejecución priorizado (decidido 17-06)
1. ✅ **A1 — barrido async** (`memory/store`, `deps/engine`, `core/scaffold` apply):
   DONE 17-06. `core/bootstrap` queda como carve-out razonado (pure-fn one-shot).
2. ✅ **W3 — sitio web profesional con Astro** — FOUNDATION DONE 17-06 (app Astro
   real en `apps/web`: hero, marquesinas duales, i18n en/es, tools del registro vivo,
   benchmarks, responsive; build estático para Pages). *Pending (iterative):* más
   contenido/idiomas + logos SVG reales.
3. ✅ **A2 quick wins** (DONE 17-06): JSON Schema del config, `quality_cancel`,
   freno duro anti-idle en `auto_work`.
4. **A2 onboarding:** ✅ `/examples` (custom-plugin tested + minimal/swarm) **y
   TypeDoc** (API de `public/` en la web bajo `/api`) DONE; *only pending:*
   skills/prompts versionados.
5. ✅ **A4** (nit): CLOSED — `apps/web` (Astro) tiene su propio tsconfig; el
   typecheck raíz ya no se acopla al SDK del generador.
6. **Deploy** (lo hace el usuario): `NPM_TOKEN`, Pages = Actions, merge `develop→main`.

> **Camino:** A1 → ~9,8; +A2 → ~10,0; +A3 + publish → **11/10**.

---

## 7-bis. W3 — Requisitos vivos de la web (anotaciones del usuario)

> **Regla:** toda anotación del usuario sobre la web se registra AQUÍ para que se
> cumpla. Estado: ✅ done · 🟡 partial · ⬜ pending. (18-06-2026)

**Marquesinas (logos):**
- ✅ Logos de marca reales (simple-icons), icono centrado, monocromo visible.
- ✅ Centradas en la **zona de contenido** (no a todo el ancho de pantalla).
- ✅ **Loop continuo y sin saltos**: cuando sale el último, entra el primero
  (técnica de dos sets idénticos + `translateX(-50%)`); **siempre llena**.
- ✅ Fade (máscara) en los **bordes de su zona**; aparecen/desaparecen ahí.
- ✅ Al hacer hover el icono escala **sin salirse** de la marquesina
  (`overflow-x:clip; overflow-y:visible`) y muestra el nombre (tooltip), sin reflujo.
- ✅ Suficientes elementos para llenar; ⬜ revisar densidad/velocidad por breakpoint.
- ✅ **Banda central más legible** (max-width 56rem, chips más grandes/contrastados,
  fade más amplio).
- ✅ **Tooltip del hover ya no se corta.** Bug real: `overflow-x:clip` fuerza a
  `overflow-y` a computar `auto`, así que el tooltip (que salía hacia arriba) se
  recortaba. Fix: `overflow:clip` en ambos ejes + el tooltip va **hacia abajo** dentro
  de un `padding-bottom` reservado → visible sin provocar scroll horizontal de página.
- 🟡 Verificar densidad/velocidad y el conjunto en vivo por breakpoint.

**Configuración (persistida en `localStorage`):**
- ✅ Botón de engranaje → **modal**; **5 temas** (dark/light/midnight/solarized/nord);
  panel de **idiomas con banderas**; toggle de **animación**. ⬜ más opciones de config.

**Idiomas:**
- ✅ en, es, **zh, hi, ar (RTL), pt, fr, ja, de, it, vi, th** — **12 idiomas** con
  traducción completa (incl. plugins por idioma). `astro.config` locales + páginas por
  locale + `dir="rtl"` para árabe en `Base.astro`.
- ✅ **Banderas reales (SVG en `public/flags/`), NO emojis** — los emoji de bandera
  no se renderizan en Windows (salían las letras "GB/ES/CN"); ahora `<img>` por idioma.
- 🔴 **REGLA DE MANTENIMIENTO:** cada vez que se cree/renombre una tool **o** se
  actualice la web, hay que **añadir/actualizar TODAS las traducciones**.
  ✅ **Implementada como gate:** `apps/web/scripts/check-i18n.ts` falla el build si
  algún idioma no cubre todas las claves de `en` (o tiene claves obsoletas). Corre en
  `build` y `build:strict`.
- ⬜ Ampliables más adelante: ru, ko, id, bn, … (el gate los obligará a estar completos).

**Contenido / textos:**
- ✅ Sección **Plugins como último campo** (los 10 paquetes + versión + descripción por idioma).
- 🟡 Textos en general **más comprensivos**; ✅ explicación de plugins por idioma.
- ✅ **Benchmarks con gráficas** — `gen-capabilities` **mide en vivo** (sobre el
  protocolo, config `proposals+memory` de TOKEN-BUDGETS.md) `overview` full/compact y
  `auto_work`, y la web pinta barras reales (full 1339 / compact 236 / auto_work 32 tok →
  arranque 268 < 300). Incluye una barra **baseline ilustrativa** *claramente etiquetada*
  como estimación (no se inventan cifras de terceros). Honesto y a prueba de drift.
- ✅ **Logotipo + favicon** — marca hexagonal "core + nodos de plugin" (`public/logo.svg`),
  en nav, hero y favicon SVG; legible a 16px.

**i18n — página por idioma (decisión, 18-06):**
- ℹ️ El sitio es **estático** (GitHub Pages, sin servidor) → no se puede "pasar el idioma
  como argumento" en tiempo de petición. La fuente **no está duplicada**: un único
  `Home.astro`/`PluginPage.astro` recibe `lang` como prop; lo multiplicado es solo el HTML
  generado (1 por idioma), lo correcto para estático: URLs reales por idioma (SEO/hreflang),
  sin flash de idioma, sin requerir JS. Alternativa = SPA con cambio de idioma por JS
  (menos ficheros pero peor SEO/UX). **Se mantiene el pre-render por idioma** salvo que el
  usuario prefiera la vía SPA. ⬜ Si se quiere reducir artefactos: evaluar `hreflang` tags
  + sitemap en vez de cambiar el modelo.

**Responsive:**
- 🔴 **TODO** debe ser responsive (ordenador/tablet/móvil) — invariante permanente
  a verificar en cada componente nuevo.

**Publicación / naming:**
- 🔵 **M36 · Rename del proyecto a `@mcp-vertex`** (org npm `mcp-vertex` creada, 18-06;
  reemplaza a `@mcp-vertex/*` y a los descartados `@mcp-server`/`@mcp-vertex`): core →
  `@mcp-vertex/core`, plugins → `@mcp-vertex/proposals`, `@mcp-vertex/git`, …;
  `@mcp-vertex/web` → `@mcp-vertex/web`. Toca todos los `package.json`, imports,
  `tsconfig` paths, alias de vitest, `build.ts`, generadores, scaffold, examples, docs y la
  web. ⚠️ Si el repo de GitHub se renombra a `mcp-vertex`, hay que actualizar también
  URLs del repo y `PAGES_BASE`.

**Limpieza de comentarios:**
- 🔵 **M37 · Comentarios sobre el CÓDIGO, no sobre el proceso** — eliminar de los
  comentarios las referencias a IDs de tareas internas (`[M5]`, `(M12)`, `[N16]`, `(H2)`,
  `(A2)`, `[R12]`, `[N3/N4]`, …) y a "el agente / trabajo del agente": un comentario debe
  explicar qué hace el código y por qué, no de qué propuesta interna salió.

**Bugs de la web reportados (18-06, 2ª tanda) — M38** (re-verificado 21-06, ver §11):
- ✅ La **página de la API** (`/api/`, TypeDoc) — funciona, assets relativos.
- ✅ **Banderas** de idioma — se ven, rutas correctas.
- ✅ La **descripción de cada herramienta sale solo en inglés** — cerrado
  21-06: las 68 tools tienen entrada en el catálogo (12 idiomas cada una),
  `check-i18n.ts` lo exige. Antes solo 5/68 estaban traducidas.
- ✅ Algunas descripciones **se salían de su recuadro** (overflow) — contenidas
  con `overflow-wrap`/`text-overflow:ellipsis`.
- 🟡 Preferencia: **cada sección = una página individual** (no todo en un único home).
- 🟡 **Benchmarks más extensos** y **comparando con otras utilidades similares**.

**M39 · Instalación universal + título (18-06, 3ª tanda):**
- 🔵 **Título de la web**: dejar clarísimo que el proyecto es **`@mcp-vertex`**.
- 🔵 **Matriz de instalación**: por gestor de paquetes (**npm/yarn/pnpm/deno/bun**) y por
  IDE/agente. Nota pequeña en la pestaña de **bun**: "desarrollado con bun".
- 🔵 **Config MCP por IDE** (el `mcp.json` no va en el mismo sitio en todos): VS Code/Copilot
  `.vscode/mcp.json` (clave `servers`, `type:stdio`); Cursor `.cursor/mcp.json` / `~/.cursor/
  mcp.json` (`mcpServers`); Windsurf `~/.codeium/windsurf/mcp_config.json` (`mcpServers`);
  Claude Desktop `claude_desktop_config.json` (`mcpServers`); Claude Code `.mcp.json` o
  `claude mcp add`; Antigravity `~/.gemini/config/mcp_config.json` (`mcpServers`); Zed
  `settings.json` (`context_servers`).
- ✅ **Instalador universal `mcp-vertex init`** (un comando para cualquier IDE):
  `npx @mcp-vertex/core init` (o bunx/pnpm/yarn/deno) **detecta** los IDEs presentes y
  **FUSIONA** la entrada `mcp-vertex` en su config con el formato correcto, **sin tocar ni
  borrar** los demás servidores del usuario. Idempotente (`unchanged` si ya está). `--ide=`,
  `--via=`, `--preset=`, `--all`. Merge puro y testeado (10 tests). Web: bloque de un comando
  prominente por gestor.
- ✅ **Dogfooding real en este repo**: el `.mcp.json` (Claude Code) funciona, pero faltaba
  `.vscode/mcp.json` para VS Code/Copilot → **añadido** (`servers`+`type:stdio`, corre el
  CLI de src con bun sobre `${workspaceFolder}`).

---

## 7-ter. Tercera ronda agnóstica (18-06) — hallazgos asimilados

> **Tres auditorías independientes y agnósticas del 18-06** (Codex·GPT-5 → 8,4;
> Agnóstica·GPT-5.4 → "Muy bien"; Agnóstica estado-actual → 8,8). No consultaron
> las previas; convergen en lo mismo: **el core es excelente; la grieta al 11/10 es
> plataforma + producto público + dogfooding, no arquitectura.** Lo correcto y
> verificado se asimila aquí. Estado: ✅ done · 🟡 partial · ⬜ pending.

**P0 — correctitud / regresión (closed in this session):**
- ✅ **M21 · `validate` estaba ROJO por lint** — los 12 SVG de banderas
  (`apps/web/public/flags/*.svg`) disparaban `biome lint/a11y/noSvgWithoutTitle`.
  **Fix:** Biome excluye `**/public` (assets estáticos no se lintan). `validate` verde
  (typecheck + lint + 476 tests). *Lo cazó Codex; era regresión de esta misma sesión.*

**P1 — seguridad de rutas (read-only plugins):**
- ✅ **M22 · Containment de rutas.** Helper único en core
  `resolveWorkspaceContained(rootAbs, child) → {ok, abs, rel, reason}`
  ([contain-path.ts](../../../packages/core/src/lib/shared/contain-path.ts), exportado
  en `public`), aplicado en `search` (roots), `docs` (`docs_list` **y** `docs_read`,
  unificando el `within`) y `deps` (`manifest`). Rechaza `..` que escapa y rutas
  absolutas (contrato = relativo al workspace). 9 tests de traversal. *(Containment es
  léxico; symlinks fuera del sandbox quedan como follow-up del host.)*

**P1 — hermeticidad de secretos:**
- ✅ **M23 · `redactSecrets` centralizado en core.**
  ([redact.ts](../../../packages/core/src/lib/shared/redact.ts), exportado en `public`);
  `memory` lo reexporta (shim, sin romper su superficie) y `proposals` lo aplica al
  **crear una proposal** (`create_proposal` scrubea el body antes de `writeFileAtomic` y
  reporta `redactedSecrets`). Test de integración añadido. *(El `close_slice` no toca
  texto nuevo, no redacta.)*

**P2 — contratos / outputSchema:**
- ✅ **M24 · Guard "toda tool declara `outputSchema`".** Nuevo test e2e lista TODAS las
  tools registradas y falla si alguna no declara `outputSchema` — caza la regresión en
  el acto. Detectó las 3 tools de `rules` (`get_rules`/`check_rules`/`apply_rules`) sin
  schema (justo lo que señalaba Codex): añadidos schemas precisos, `rules` enrutado en
  el generador de tipos (`PACKAGE_ROUTES`) y reexportado en su `public`. 487 tests verde.
  ⬜ Resta *cerrar* los `catchall` permisivos de `bootstrap`/`scaffold`/proposals
  multiplexadas (excepción documentada, no bloqueante).
  **Plan: [`ready/r00001-harden-catchall-output-schemas.md`](../ready/r00001-harden-catchall-output-schemas.md) — unión discriminada con `ok: z.literal(true|false)` como discriminador; si falla la serialización JSON Schema, se cae a "split en N tools".**

**P2 — dedupe / calidad interna:**
- 🟡 **M25 · Teardown de procesos compartido** — extraído `killProcessGroup(pid, signal?)`
  a `core/lib/commands/process-group.ts` (la pieza idéntica, sutil y **crítica**: matar el
  grupo de procesos `-pid` con fallback al líder), reusado por `quality` y
  `proposal-acceptance`. *Decisión:* NO se unifican los runners completos porque difieren por
  diseño (git = `execFile` read-only; quality = shell + registro de cancelación + salida
  combinada; acceptance = argv + streams separados + `expect`) — un runner único sería una
  abstracción con fugas. ✅ `core/walkAllowedFiles` unifica el `walk()` de
  `search`/`docs` — cerrado (ver §11, sesión 21-06).

**Plataforma / producto (la grieta principal, consenso 3/3):**
- ✅ **M26 · Dogfooding del propio repo** — añadidos `AGENTS.md` (guía canónica:
  comandos, invariantes, convenciones), `.github/copilot-instructions.md`,
  `.github/agents/mcp-vertex.agent.md`, `.claude/agents/mcp-vertex-orchestrator.md` y
  `skills/` (`mcp-vertex-plugin-authoring`, `mcp-vertex-failure-modes`). El repo ya se
  aplica su propio patrón. *(Cierra el viejo pendiente "skills/prompts versionados".)*
  ⬜ Ampliable: skill de release/budgets, más agentes (contract_guardian, etc.).
- ✅ **M27 · Web profunda** —
  ✅ **Páginas de detalle por plugin** (`/plugins/<slug>` + `/<lang>/plugins/<slug>`,
  132 páginas: 12 idiomas × 11 paquetes): cada una lista sus tools reales (desde el
  registro vivo), descripción traducida, snippet de instalación y enlace de vuelta; la
  sección Plugins del home enlaza a cada una. ✅ logo/favicon + benchmarks con gráficas.
  ✅ **Páginas por tool** (`/tools/<plugin>/<tool>` + `/<lang>/tools/<plugin>/<tool>`,
  una por cada tool real × 12 idiomas, enlazadas desde `/tools` y desde la pestaña
  "tools" de cada plugin) con argumentos, efectos y un ejemplo de llamada genérico.
  ✅ **Pagefind** ya estaba cableado (`Search.astro` + `index:search` en
  `package.json`) — verificado, sin trabajo adicional. ✅ **"First 5 minutes"**
  (`/first-5-minutes`, 3 perfiles: Bun/Node, VS Code/Copilot, Claude Code, 12
  idiomas). ✅ **Troubleshooting** (`/troubleshooting` + `/troubleshooting/<slug>`,
  6 casos canónicos reales en `docs/troubleshooting/*.md`, cosechados por
  `gen-capabilities.ts` → `discoverTroubleshootingCases`, mismo patrón que
  `discoverTutorials`). ⬜ Queda fuera de alcance de f00030 (no bloqueante):
  `docs/ARCHITECTURE.md`+Mermaid, changelog navegable.
  **Cerrado por [`done/feats/f00030-web-deep-pages-and-search.md`](../done/feats/f00030-web-deep-pages-and-search.md).**
- 🟡 **M28 · Endurecer `proposals` bajo contención** —
  ✅ `await_lock` en `notification` (`<prefix>_await_lock { taskId, timeoutMs? }`
  bloquea hasta que el lock se libera o expira, vía el mismo watch del notifier +
  fallback de polling + abort en server-close; 4 tests). Cierra el bucle
  "wait, don't poll" que el knowledge ya prometía.
  ✅ **Circuit-breaker de contención** en `withFileMutex`: opción `onContention:
  'steal' | 'fail'` (default `steal` = comportamiento histórico, **sin cambios**). En
  `fail`, si un holder **vivo** retiene el lock pasado `timeoutMs`, lanza
  `LockContentionError` (code `lock-contention-budget-exceeded`) en vez de robarlo, para
  que el caller haga back-off (p. ej. `await_lock`) — un lock **abandonado** se sigue
  reclamando siempre. Additivo, 2 tests (fail no roba/ no ejecuta; steal sí reclama).
  ✅ `agent_lock` ya expone `onContention: 'steal'|'fail'` con test dedicado —
  cerrado (ver §11, sesión 21-06).

**Observabilidad / release / tests (P2-P3):**
- ✅ **M29 · Métricas persistentes** —
  ✅ `metrics { persist: true }` vuelca un snapshot con timestamp a
  `<cacheDir>/metrics/<ISO>.json` (escritura atómica) y devuelve `persistedTo` +
  número de snapshots; el dir se inyecta desde `assemble` (`corePaths.cacheDir`). 3 tests.
  ✅ Gate de regresión longitudinal: job `metrics-gate` en CI compara un snapshot
  candidato fresco contra el snapshot adjunto al último release (`tools/scripts/metrics/get-baseline.script.ts`),
  calcula el delta por tool en bytes/call y ms/call (`tools/scripts/metrics/diff-snapshots.script.ts`)
  y falla el build si algún tool regresa más de +20% (configurable vía
  `METRICS_TOKEN_DELTA_PCT`/`METRICS_LATENCY_DELTA_PCT`/`METRICS_BYTES_DELTA_PCT`). 18 tests
  nuevos. *(Cierra `f00027`.)*
- 🟡 **M30 · Smoke funcional en CI** —
  ✅ `scripts/smoke-cli.ts` conecta un cliente MCP al **CLI compilado por stdio bajo
  `node`**, lista tools y llama `mcp-vertex_overview` (prueba que el artefacto publicado
  *sirve el protocolo*, no solo que el bin arranca). Cableado en `ci.yml` (job pack-smoke)
  y como `bun run smoke`.
  ✅ **e2e de instalación desde tarball** (`scripts/smoke-pack.ts`, `bun run smoke:pack`):
  `npm pack` de core+proposals+memory → install en proyecto limpio → maneja el CLI
  **instalado** por stdio bajo node y verifica que `proposals_*`/`memory_*` resuelven
  (el peer `@mcp-vertex/core ^0.1.0` lo satisface el tarball del core). Cableado en
  CI. **M30 completo.** Verificado local: 29 tools servidas desde la instalación.
### 🆕 Sesión 21-06 (cierre de cola viva, 2ª pasada) — `c00001`-`f00028` abiertas

> 7 propuestas creadas en `ready/` para cubrir los `[ ]` aún abiertos del
> master audit, después de que la sesión 21-06 (re-verificación §11)
> cerrara 7 de los 8 hallazgos re-abiertos sin actualizar el documento.
> Cada propuesta está vinculada a su línea de checkbox arriba y tiene
> `status: ready` para que el swarm la pueda tomar vía `proposals_auto_work`
> o `proposals_continue_proposal`:

| ID | Cierra | Título | Slices |
|---|---|---|---|
| [`c00002`](../ready/c00002-decide-and-close-m13-security-plugin.md) | línea 293 (M13) — **cerrado** (decisión B, 2026-06-21) | Decide & close M13 (security plugin) | 0 — diferido indefinidamente, sin código |
| [`f00033`](../ready/f00033-release-provenance-via-npm-publish.md) | línea 265 — **cerrado** (2026-06-21) | Release provenance: `npm publish --provenance` | 0 — rewrite script resultó innecesario, solo flag + workflow wire |
| [`f00029`](../ready/f00029-versioned-skills-prompts-and-web-fetch-plugin.md) | línea 281 | Skills versionadas + plugin `web`/`fetch` | 5 (manifest, 5 skills, plugin, consumer helper, close) |
| [`r00001`](../ready/r00001-harden-catchall-output-schemas.md) | línea 518 (M24 follow-up) | Harden remaining `catchall` schemas | 5 (golden baseline, bootstrap, scaffold, proposals, exception audit) |
| [`f00030`](../ready/f00030-web-deep-pages-and-search.md) | línea 543 (M27 follow-up) | Web deep pages + pagefind + first-5-min + troubleshooting | 5 (per-tool, pagefind, quickstart, troubleshooting, nav+close) |
| [`f00027`](../ready/f00027-metrics-longitudinal-regression-gate.md) | línea 565 (M29 follow-up) | Metrics longitudinal regression gate | 4 (baseline, diff, CI, close) |
| [`f00028`](../done/feats/f00028-plugins-depth-extension.md) | línea 598 (M33 follow-up) — **cerrado** (2026-06-21) | Plugin depth: search rg+context, memory export/import, docs `docs_search` | 4 (search, memory, docs, close) |

> **Quedan 2 ítems NO propuestos a propósito** (decididos en su día como
> "no implementar"):
> - **M11 `rules` follow-up "emitir comandos `eslint` sin avisar si falta"**
>   (sesión 18-06: aceptado como caveat documentado del plugin `rules`).
> - **M40 plugin `@mcp-vertex/audit` multi-modelo** (l99): el diseño está
>   en `done/l99` y la decisión del usuario es la que manda; no se
>   reabre como workstream de la auditoría.
>
> **Cierre total del master audit:** las 7 `[ ]` restantes (líneas 248,
> 275, 281, 518, 543, 565, 598) tienen propuesta `ready/` enlazada. Cuando
> las 7 pasen a `done`, el documento entero puede pasar a
> `audits/done/` (manteniendo la cadena de auditorías anteriores).- 🟡 **M31 · `effects` por tool** — `IToolEffect = 'write'|'spawn'|'network'|'destructive'`
  añadido al contrato (`IToolRegistration.effects`, opcional ⇒ read-only por defecto) y
  **expuesto en `overview`** por tool. Clasificadas las 17 tools no-read: `write` (proposals
  authoring/lock/queue/sync/round/names/state_repair/delegate, memory_save, scaffold,
  metrics-persist), `write+destructive` (memory_forget), `spawn` (quality run/cancel); el
  resto read-only sin `effects`. Test e2e que verifica que `overview` declara los efectos.
  ✅ **Surfaceado en la web**: `gen-capabilities` fusiona los `effects` del `overview` en
  `capabilities.json` y las páginas por plugin muestran **badges** por tool
  (write/spawn/destructive/read-only). **M31 completo.**
- ✅ **M32 · Cobertura desigual** — cerrado (ver §11, sesión 21-06):
  property-based tests para `frontmatter-parser`/`redactSecrets` y test de
  concurrencia dedicado para `memory` ya existían, verificados contra código.
- ✅ **M33 · Profundidad de plugins (mejoras opcionales)** — completo (cierre 2026-06-21):
  - ✅ `git`: `git_blame` (autoría por línea, rango opcional), `git_show`
    (metadata + `--stat`, sin el patch completo) y `git_worktree` (listado
    read-only; crear/borrar sigue siendo trabajo de `proposals_agent_worktree`,
    sin duplicar el path de escritura). 12 tests nuevos.
  - ✅ `deps`: `deps_polyglot` — lee pyproject.toml (PEP 621 + Poetry),
    Cargo.toml y go.mod si existen, con parsers propios de subconjunto
    documentado (mismo enfoque que `frontmatter-parser.ts`, sin añadir una
    dependencia de TOML genérica). 10 tests nuevos. Sigue offline.
  - ✅ `search` (`rg` opcional vía `preferRg`, `context:N` 0-10), `memory`
    (`memory_export`/`memory_import` con `format`/`mode`/`conflict`), `docs`
    (`docs_search` con scoring `titleHits*3 + bodyHits` y snippets) — cerrado:
    [`done/feats/f00028-plugins-depth-extension.md`](../done/feats/f00028-plugins-depth-extension.md).
    49 tests nuevos (25 search, 12 memory export/import, 6 docs_search, 6
    registros de plugin actualizados).
- ✅ **M34 · OSS hygiene** —
  `docs/ARCHITECTURE.md` (capas, contratos, flujo, invariantes + Mermaid),
  `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`, y **CHANGELOG enlazado** (Keep a
  Changelog: highlights de la sesión + footer de comparadores). Todo enlazado desde el
  README. *`register()` siempre-async: deferido a propósito* — forzar `Promise` en el
  tipo público del plugin rompería los plugins síncronos por una ganancia cosmética; se
  mantiene `sync | async` (retrocompat > estética).

**Nuevas peticiones del usuario (18-06):**
- ✅ **M35 · Ciclo de revisión por pares en `proposals`** — tool `proposal_review`
  (`submit`/`approve`/`request_changes`/`status`) + máquina de estados pura
  ([proposal-review.ts](../../../plugins/proposals/src/lib/swarm/proposal-review.ts)):
  el implementador hace `submit` (queda **in_review**, NO done); un **agente distinto**
  `approve` (→ `- status: done` + libera lock) o `request_changes` con objeción (→
  `changes_requested`, reworkable + libera lock); el fixer re-`submit` y **otro** revisa el
  fix; bucle hasta que un revisor no objeta. Estado en el doc (sin sidecar; líneas
  `review-state/implementer/reviewer/log`), historial de rondas, y **revisor ≠
  implementador** forzado. 8 tests (máquina pura + e2e del bucle por el doc); knowledge y
  README actualizados.
- ℹ️ **i18n página-por-idioma** — ver §7-bis (decisión: se mantiene el pre-render estático;
  la fuente ya es DRY con `lang` como prop).

- 🔵 **M40 · Plugin de auditoría multi-modelo `@mcp-vertex/audit`** (IDEA del usuario, a
  decidir) — auditar con varios modelos de distintas empresas en el formato del repo.
  Diseño escrito en [l99](../l99-feat-multi-model-audit-plugin.md): A) "audit kit" sin
  claves (brief canónico + **consolidación automática** de las auditorías que produce cada
  IDE/modelo) ⭐; B) fan-out por API (OpenRouter = 1 clave, multi-empresa, opt-in con
  `effects:['network']`); C) roster declarado. Realidad: un server MCP no puede saber el
  modelo del host por sí solo; el descubrimiento solo existe por claves API o declarado.

> **Lectura:** ninguna de las 3 encontró nada FATAL en el código. La única "rojo de
> verdad" era el `validate` por SVG (ya cerrado). Lo demás es endurecimiento y
> acabado de plataforma. Camino corto al ~9,5: M22 + M23 + M24 + M26 + M27.

---

## 8. Scoreboard de las 11 auditorías

| Ronda | Revisor | Nota | FATAL señalados |
|---|---|---|---|
| 3ª | Agnóstica · estado-actual | 8,8 | ninguno (skills/agentes propios "grave") |
| 3ª | Agnóstica · Codex GPT-5 | 8,4 | ninguno (`validate` rojo por SVG) |
| 3ª | Agnóstica · GPT-5.4 | "Muy bien" | ninguno |
| 2ª | Codex · GPT-5 | 9,1 | ninguno |
| 2ª | Claude Code · Opus 4.8 | 9,0 | ninguno (TOCTOU mutex como "residual") |
| 2ª | Antigravity · Gemini 3.5 Flash | 8,9 | mutex race, docs sync |
| 2ª | Antigravity · Sonnet 4.6 | 8,5 | `AGENT_SLOTS` enum, docs sync |
| 1ª | Gemini (exhaustiva) | 9,3 | ninguno (bun-only como "muy mal") |
| 1ª | Gemini (unificada) | 8,9 | mutex race, docs sync |
| 1ª | Sonnet (por dimensiones) | 8,5 | — |
| 1ª | Síntesis multi-modelo 15-06 | ~7,3→8,5 | (P0/P1 ya cerrados) |

**Consenso: 8,4 – 9,3 / 10.** Las P0 de las rondas 1ª-2ª (M1 mutex, M2 slots,
M3 runtime, M4 docs, M8 pretty-print) están cerradas. La 3ª ronda agnóstica
(que no consultó las previas) baja un poco la nota porque mira la **plataforma y el
producto público**, no solo el core: su único "rojo" real (`validate` por SVG) ya
está cerrado en esta sesión (M21). El resto (M22-M34) es endurecimiento + dogfooding
+ web. **Los 11 revisores coinciden: arquitectura de referencia, sin rediseño en el
camino al 11/10 — solo acabados de plataforma.**

— Auditoría maestra unificada, 16-06-2026. Hallazgos 🔴/🟠 re-verificados contra el código.

---

## 9. Sesión 18-06 (tarde) — rename `mcp-project` + `agent_worktree` + auto-hospedaje

- **✅ M41 · Prefijo de tools `mcpcore_` → `mcpvertex_` → `mcp-vertex_`** — el usuario
  señaló que tras el rebrand a `@mcp-vertex` el prefijo técnico debía seguirlo (override
  consciente de la decisión previa de mantenerlo, que era nuestra, no del usuario).
  Renombrado en tools, tipos públicos `IMcpCore*`→`IMcpVertex*`→`IMcpVertex*` y SDK de
  tipos generado. La convención final adoptada es **`mcp-vertex_` (kebab + underscore)**
  para todos los identificadores lógicos (tools, knowledge ids, prefijos) y nombres de
  archivo de skills/agents. Archivos de config (`mcp-vertex.config.json`, schema)
  mantienen kebab-case porque matchean el paquete npm `@mcp-vertex/core`. Breaking
  change. 525/525 → 537/537 tests, build, smoke y smoke:pack verdes.
- **✅ M42 · El artefacto del bootstrap pasa de "mcp-server" a "mcp-project"** —
  `create_server`/`plan_mcp_server` → `create_project`/`plan_mcp_project`;
  `serverPackageName`→`projectPackageName`; rutas generadas `libs/mcp-server/*` →
  `libs/mcp-project/*`; flags `--mcp-server-create/-tests` →
  `--mcp-project-create/-tests`. No toca `createMcpProject` (función real de protocolo)
  ni la detección de servidores de terceros. 525/525 tests verdes.
- **✅ M43 · `agent_worktree` (proposals)** — nueva tool (`create`/`list`/`remove`)
  que aísla a cada agente concurrente en su propio `git worktree` + rama
  `agent/<nombre>`, motivada por una colisión real detectada en esta misma sesión
  (dos agentes/sesiones distintas comiteando sobre el mismo `.git/index` se
  intercalaron commits). 11 tests nuevos (engine con runner inyectado, sin git real).
  *Pendiente de adopción:* es una herramienta disponible, no un mecanismo forzado —
  cada agente debe llamarla al empezar sesión si comparte repo con otro.
- **🟡 M44 · Auto-hospedaje: ¿debe mcp-vertex generarse su propio `mcp-project`?** —
  el usuario preguntó si, ya que este repo se auto-sirve vía `.mcp.json`
  (`--preset=swarm`), debería también pasar por su propio bootstrap. Verificado
  ejecutando `analyzeProject`+`recommendServerPlan` contra este mismo repo: el
  análisis detecta correctamente `hasMcpProject:true` y devuelve la nota
  *"this project already has an MCP server: prefer adding the recommended tools to
  it over scaffolding a new one"* — es decir, el propio bootstrap desaconseja
  duplicar un host aquí. Lo que sí falta para "trabajar perfectamente sobre sí
  mismo": este repo lanza su servidor por **CLI + preset** (`.mcp.json`), no por un
  `host-config.ts` con `extraTools`, así que no tiene forma de añadirse tools
  *propias* (p. ej. un escáner de referencias `mcp-core` obsoletas — lo que hice a
  mano por grep varias veces esta sesión). **Decisión pendiente del usuario:**
  ¿migrar `.mcp.json` de este repo a un `host-config.ts` propio con 1-2 `extraTools`
  específicas (ej. `rename_audit`), o queda como está (CLI+preset, sin tools propias)?
  No implementado — análogo a l99, dejado para decidir.
  **✅ Decidido y cerrado (21-06, sesión §11):** migrar. `scripts/host-server.ts`
  reutiliza `parseCliArgs`+`assembleCliConfig` (mismo `--preset=swarm` de
  siempre) y añade `mcp-vertex_rename_audit` como `extraTools` —
  ([scripts/host/rename-audit-engine.ts](../../../scripts/host/rename-audit-engine.ts),
  [scripts/host/rename-audit-tool.ts](../../../scripts/host/rename-audit-tool.ts)).
  `.mcp.json` y `.vscode/mcp.json` apuntan ahora a ese script. Verificado con un
  cliente MCP real por stdio: 62 tools, `rename_audit` presente y funcionando
  (detecta sus propias menciones literales de los patrones retirados como único
  resultado — el resto del código está limpio).

---

## 10. Sesión 20-06 — l111: crash de orquestación + docsDir desalineado

> Dos hallazgos nuevos, verificados contra el código, encontrados al investigar
> el reporte del usuario de que "el mcp no se está aplicando" y que un agente
> orquestador "se bloquea sin avanzar". Ambos cerrados en esta sesión.

- **🔴 M45 · `auto_work`/`continue_proposal` lanzaban un crash de validación MCP
  en el caso idle** —
  [auto-work.tool.ts:44-48](../../../plugins/proposals/src/lib/tools/auto-work.tool.ts)
  y
  [continue-proposal.tool.ts:35-39](../../../plugins/proposals/src/lib/tools/continue-proposal.tool.ts)
  declaraban `outputSchema: z.object({}).catchall(z.unknown())` pero construían
  la respuesta con un `json()` local duplicado que **solo devolvía `content`
  (texto)**, nunca `structuredContent` — a diferencia del resto del plugin, que
  usa el helper compartido `toolJson` de `packages/core/src/lib/shared/
  tool-response.ts` (que sí deriva `structuredContent` para payloads objeto).
  El SDK de MCP exige `structuredContent` cuando hay `outputSchema` declarado;
  sin él, la llamada lanza `"Output validation error"` en vez de devolver el
  estado idle/no-proposal. Como `auto_work` es la tool de "qué hago ahora" que
  cualquier orquestador llama primero, y el caso idle es el **común** tras
  cerrar l110 (0 proposals actionable), esto explica con alta probabilidad los
  reportes de agentes que "se bloquean sin avanzar": no es un bucle ni un
  deadlock, es un crash de protocolo en el camino feliz del idle.
  **Fix:** ambos archivos delegan ahora en `toolJson` (`const json = toolJson;`)
  en vez de duplicar un helper roto. Specs (`continue-proposal.spec.ts`,
  `auto-work.spec.ts`) endurecidas: su helper `parse()` ahora exige
  `result.structuredContent` igual al texto parseado, así que una regresión a
  texto-solo rompe la suite en vez de solo manifestarse en runtime.
  Commits: `fc27bd0` (fix arrastrado por un `git add -A` de otro agente),
  `3fa706a` (test hardening).

- **🔴 M46 · `docsDir` del propio repo apuntaba a `docs/mcp-vertex`, desconectado
  de los 13 proposals reales en `docs/proposals/`** —
  `mcp-vertex.config.json` tenía `"docsDir": "docs/mcp-vertex"` (el default del
  framework, `DEFAULT_CORE_PATHS.docsDir` en
  [core-paths.interface.ts](../../../packages/core/src/lib/contracts/interfaces/core-paths.interface.ts)).
  El plugin `proposals` resuelve su directorio como `<docsDir>/proposals`
  ([index.ts:103](../../../plugins/proposals/src/index.ts#L103)), así que
  `create_proposal`/`continue_proposal`/`auto_work`/`proposal_board` operaban
  sobre `docs/mcp-vertex/proposals/` — un directorio casi vacío que solo
  contenía **3 borradores abandonados** de l104/l106/l107 (versiones más
  viejas y menos completas que las reales, confirmado por diff: la versión de
  `docs/proposals/` de cada uno está `status: done` con narrativa final; la de
  `docs/mcp-vertex/proposals/` seguía en `status: pending`/borrador). Todo el
  trabajo real de proposals (`l99`-`l110`, la auditoría maestra) siempre vivió
  en `docs/proposals/`, fuera del alcance de las tools. Cualquier agente que
  usara las tools de proposals "correctamente" escribía en el sitio
  equivocado — el síntoma reportado por el usuario, literal: el MCP no se
  estaba aplicando al proyecto real.
  **Fix:** `docsDir` → `"docs"` en `mcp-vertex.config.json` (así
  `<docsDir>/proposals` resuelve a `docs/proposals`, el real). Verificado que
  nada más depende de `docs/mcp-vertex/` (estaba vacío salvo `proposals/`);
  directorio eliminado. *Pendiente:* esto requiere reiniciar el proceso del
  servidor MCP para que el nuevo `docsDir` se cargue — el servidor en curso
  cachea las rutas resueltas al arrancar.
  ⬜ **Follow-up de framework (no implementado, fuera de alcance de esta
  sesión):** `syncProposalRegistry` (`plugins/proposals/src/lib/proposals/
  sync-proposal-registry.ts`) escanea el `proposalsDir` resuelto y escribe un
  índice válido aunque encuentre 0 entradas — no hay señal de "esto huele a
  `docsDir` mal configurado". El mismo bug (un `docsDir` apuntando a un
  directorio vacío) se reproduciría sin diagnóstico en cualquier otro repo.
  Una mejora de framework razonable sería que `sync_proposals` reporte un
  aviso (no un error duro — un proyecto nuevo legítimamente tiene 0
  proposals) cuando el recuento cae a 0 tras tener entradas previas, o
  cuando el `proposalsDir` resuelto no contiene ningún `.md` con frontmatter
  `type: proposal`. Se deja para una propuesta dedicada al framework, no a
  este repo.

- **🟢 M47 · `agent_names.tool.ts` seguía duplicando el patrón `json()` local
  que causó M45** — no crasheaba (sí seteaba `structuredContent`), pero era
  la última instancia de la clase de anti-patrón identificada en M45.
  **Fix:** migrado a delegar en `toolJson` (preservando el parámetro
  `isError`). Spec `agent-names.spec.ts` endurecido con la misma aserción de
  `structuredContent` que las otras dos. `bun test plugins/proposals` 326/326
  verde.

---

## 11. Sesión 21-06 — cierre de cola viva: re-verificación exhaustiva contra código

> El documento llevaba ítems marcados ⬜/🟡 desde el 17–20/06 que habían sido
> cerrados por sesiones posteriores sin actualizar este registro. Esta sesión
> re-verificó **cada hallazgo abierto** línea por línea contra el código actual
> (no contra lo que decía el documento) antes de tocar nada. Resultado: la
> mayoría ya estaba resuelta; solo M37 seguía genuinamente pendiente.

- **✅ M25 · Dedupe walk() search/docs** — ya estaba unificado: ambos motores
  delegan en `walkAllowedFiles`
  ([walk-allowed-files.ts](../../../packages/core/src/lib/shared/walk-allowed-files.ts)),
  especializando solo `shouldSkipDir`/`visitFile`. Cerrado sin cambios de código.
- **✅ M28 · `agent_lock` con modo `fail` cableado** — el schema de
  [agent-lock.tool.ts:50](../../../plugins/proposals/src/lib/tools/agent-lock.tool.ts#L50)
  ya expone `onContention: z.enum(['steal','fail']).optional()`, con test
  dedicado en `agent-lock-contention.spec.ts`. Cerrado sin cambios de código.
- **✅ M32 · Cobertura property-based** — confirmados ya existentes:
  `redact.property.spec.ts` (PRNG determinista, 9 patrones de secreto × 50
  trials) y `frontmatter-parser.property.spec.ts` (round-trip de escalares,
  arrays bloque/inline) en core/proposals; `store-concurrency.spec.ts` en
  `memory` (32 escritores paralelos bajo `withFileMutex`). Cerrado sin cambios.
- **✅ M36 · Rename `@mcp-vertex` sin residuos** — verificado: cero ocurrencias
  de `@mcp-server`, `mcp-core`, `mcpcore_`, `mcpvertex_` (sin guion) en código
  fuente. Cerrado sin cambios.
- **✅ M37 · Comentarios con IDs de auditoría en vez de explicar el código** —
  **genuinamente pendiente, ahora cerrado.** ~50 comentarios en 38 archivos
  (`packages/core`, 6 plugins, `apps/web`, `scripts`) llevaban sufijos
  `(M12)`, `[N21]`, `[R12]`, `(A2)`, `[N3/N4]`, incluyendo dos visibles en la
  **UI pública** (`guide.astro` en/es: "Trust boundary (M13):"). Reescritos
  para explicar el qué/por qué sin el código de hallazgo (p. ej. `(M28):` →
  `:`, `[N9]:` → `:`). *Decisión de alcance:* las referencias a **propuestas de
  diseño** (`f00016 §4.2`, `l107 §3.2`, `l109 s3`, …) se mantienen — son citas a
  un spec real y estable que documenta el porqué de una decisión, no
  bookkeeping transitorio de esta auditoría; la regla original apunta
  explícitamente a los códigos de hallazgo de auditoría, no a citas de spec.
  Verificado `bun run validate` verde tras el cambio (912 tests).
- **✅ M38 · Bugs de la web (18-06, 2ª tanda) — re-verificados contra el sitio
  construido (`apps/web/dist`, no contra el código a ojo):**
  - ✅ **Página `/api/` (TypeDoc)** funciona: TypeDoc emite assets con rutas
    relativas (`assets/style.css`, no `/assets/...`), así que es indiferente
    al `base=/mcp-vertex`; el nav enlaza `/mcp-vertex/api/` y el `index.html`
    generado existe con sus assets.
  - ✅ **Banderas de idioma** se ven: los 12 códigos de `languages` en
    `i18n/shared.ts` resuelven a ficheros reales en `public/flags/*.svg`
    (verificado 1:1) y el HTML construido referencia
    `/mcp-vertex/flags/<code>.svg` con el base correcto.
  - ✅ **Descripción de herramienta solo en inglés** — cerrado 21-06. Catálogo
    opt-in (`apps/web/src/i18n/tools/`) con fallback a inglés, gateado por
    `check-i18n.ts`. Las 68 tools tienen ya su entrada en los 12 idiomas
    (antes solo 5/68); verificado en el HTML construido.
  - ✅ **Overflow de descripciones** — `_tool.scss` (`overflow-wrap: anywhere`)
    y `_plugin-card.scss` (`overflow:hidden` + `text-overflow:ellipsis`) ya
    contienen el contenido dentro de su caja.
- **🟢 release.yml — re-verificado:** pinning de bun exacto (`1.3.14`),
  TypeScript/Vitest exactos en `package.json` (sin rango), y coverage gate real
  (`vitest` thresholds `statements:72/branches:55/functions:75/lines:73` vía
  `bun run test:coverage` en CI) — esos tres ya estaban bien. `CHANGELOG.md`
  existe y se mantiene a mano (Keep a Changelog), no autogenerado por release;
  aceptado por diseño (M34). **Provenance implementado 21-06 (`f00033`):**
  `bun publish` (1.3.x) no soporta `--provenance`, así que el paso final de
  publish ahora usa `npm publish --provenance` (vía `scripts/release.ts
  --tool=npm --provenance`). El permiso `id-token: write` del workflow ya
  no es YAML muerto. El rewrite de `workspace:*` que se temía perder al
  dejar `bun publish` resultó innecesario: `workspace:*` solo aparece en
  `devDependencies` en los 10 paquetes (verificado por grep), que `npm
  publish` ni instala ni valida; `peerDependencies` ya se reescribe a un
  rango `^X.Y.Z` resuelto por `applyPlan()` con `--write`, independientemente
  de la herramienta de publish usada después.

**Verificado en esta sesión:** `bun run validate` (typecheck + lint + lint:scss
+ test, 912/912), `bun run lint:proposals` (0 fatal), `bun run site:strict`
(338 páginas) — los tres en verde después de los cambios de M37.

> **Lectura:** de los 8 hallazgos re-abiertos para verificación, 7 ya estaban
> cerrados por trabajo de sesiones posteriores que no actualizó este
> documento (M25, M28, M32, M36, y 3 de los 4 sub-bugs de M38); solo M37 era
> trabajo real pendiente, ahora cerrado. Los ítems explícitamente
> deprioritizados con razón documentada (M11 `rules`/`deps_outdated`, M14
> adopción de migraciones, M29 gate longitudinal, M44 decisión de usuario, M40
> idea de plugin) se confirmaron sin cambios — la razón documentada en su
> momento sigue siendo válida, no son regresiones.
