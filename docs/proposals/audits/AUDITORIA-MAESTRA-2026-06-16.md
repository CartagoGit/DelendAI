# Auditoría maestra de `@cartago-git/mcp-core` — 2026-06-16

> **Documento único y vigente.** Unifica las cuatro auditorías que existían en
> `docs/proposals/audits/` (síntesis del 15-06, exhaustiva del 16-06, unificada
> Gemini del 16-06 y la detallada Opus del 16-06) en un solo plan de continuación.
> Sustituye y deja obsoletos a:
> - `AUDITORIA-UNIFICADA-2026-06-15.md` (síntesis de 4 revisores + historial F/M/R/N)
> - `AUDITORIA-EXHAUSTIVA-2026-06-16.md` (revisión independiente, 9,3/10)
> - `AUDITORIA-UNIFICADA-2026-06-16.md` (Gemini 3.5 Flash, 8,9/10)
> - `AUDIT-mcp-core-2026-06-16.md` (revisión detallada por dimensión)
>
> **Estado verificado de la suite:** 415 pasados + 10 skip = **425 tests**, 63
> ficheros, `bun run validate` exit 0. ~19,2k LOC fuente / ~8,7k test (ratio ≈ 0,45).
> **Nota de consenso actual: ~9,0–9,3 / 10.** Arquitectura excepcional; el techo lo
> marcan un puñado de defectos de acabado, todos acotados y sin rediseño.
>
> **Los hallazgos P0 de abajo están re-verificados contra el código en esta sesión**
> (no heredados de las auditorías): la línea exacta se cita en cada uno.

---

## 1. Veredicto

`mcp-core` es **ingeniería orientada a agentes de calidad poco habitual**: núcleo
*project-agnostic* y hermético, plugins que reciben todo resuelto por contexto
(`IMcpPluginContext`), escritura atómica + mutex inter-proceso, cuarentena de
ficheros corruptos (corrupto ≠ vacío), **presupuesto de tokens medido con guarda de
regresión** sobre el servidor MCP real, y un **SDK de tipos generado desde los
`outputSchema` con drift-guard**. No hay deuda estructural ni "magia": casi todo es
función pura con dependencias inyectables y test.

La gran fiabilización P0/P1 ya está hecha (ver §2). Lo que separa hoy del 11/10 **no
es diseño, es acabado**: que arranque en el runtime que usa la mayoría de clientes,
cerrar una carrera latente del mutex, eliminar las dos últimas fugas (tokens e I/O
síncrono) y reducir superficie de herramientas. Ninguna es difícil.

---

## 2. Lo ya cerrado (historial — no re-abrir)

Trabajo completado y verde en sesiones previas (detalle en
`AUDITORIA-UNIFICADA-2026-06-15.md`, que este documento archiva):

- **P0/P1 de fiabilidad del estado (F1–F5, M1–M10, N1–N10):** escrituras atómicas
  (temp en mismo dir, anti-EXDEV) + `withFileMutex` en lock/queue/registry/memory;
  erradicado `process.cwd()` fuera del CLI; `proposals` deriva el layout de `ctx`;
  schema de lock único canónico; corrupto ≠ vacío con `quarantineCorruptFile`;
  `git`/`search` migrados a async + errores estructurados; quotas de `memory`;
  exclusión de `in_progress` ajeno en `auto_work` (anti-bucle).
- **Agnosticismo (M4–M6, M9):** tracks como `string`, carpetas inyectables, modelo
  no hardcoded, scaffolds que solo prometen tools existentes.
- **Plataforma (N14–N23):** plugin `notification` (push de `lock-released`, mata el
  polling), `state_health`/`state_repair`, `compact_status`, presets de plugins
  `minimal/standard/swarm`, plugins `docs` y `deps`, refactor de `round-context` en
  5 módulos, `outputSchema` en ~32 tools + red e2e estricta, ranking BM25-lite en
  `memory_recall`, observabilidad `IStatusCollector` + `--verbose`, tests de caos
  concurrente, semver + `bun run release`, y el **SDK de tipos generados**.

> Consecuencia: la cola viva (§3) son **solo** los hallazgos que las dos auditorías
> independientes del 16-06 encontraron sobre el estado actual, re-verificados aquí.

---

## 3. Cola viva — hallazgos abiertos (verificados en código)

Severidad: 🔴 corregir antes de publicar/presumir de universal · 🟡 fricción/deuda.

### 🔴 L1 — Carrera de liberación del mutex (`withFileMutex`)
**El hallazgo más importante; 2 de 4 auditorías lo señalan, una como FATAL.**
[with-file-mutex.ts:85](../../../packages/core/src/lib/shared/with-file-mutex.ts#L85)
hace `if (acquired) await rm(lockPath, { force: true })` **incondicionalmente** en
el `finally`. El sidecar guarda solo `${pid}\n${ts}`
([:54](../../../packages/core/src/lib/shared/with-file-mutex.ts#L54)), sin token de
sesión. Secuencia rota: A adquiere → `fn()` de A se alarga > `timeoutMs` (5 s) → B
roba el lock ([:75](../../../packages/core/src/lib/shared/with-file-mutex.ts#L75)) y
crea el suyo → A termina y su `finally` **borra el lock de B** → C entra y corre en
paralelo con B → *lost-update* justo donde el mutex existe para evitarlo.
Para secciones críticas reales (read-modify-write de un JSON sub-ms) no se dispara,
pero es una garantía rota *por diseño* en cuanto `fn()` toque disco lento, FS de red
o payload grande.
**Fix (barato, 1 función):** escribir un token único en la adquisición y, en el
`finally`, **solo borrar si el token del fichero coincide con el mío**; opcionalmente
heartbeat del `mtime` mientras `fn()` corre y robar solo por `staleMs`, no por
`timeoutMs`.
```ts
// adquisición:
const token = randomUUID();
await handle.writeFile(`${process.pid}\n${Date.now()}\n${token}`);
// finally:
if (acquired) {
  try {
    const [, , stored] = (await readFile(lockPath, 'utf8')).trim().split('\n');
    if (stored === token) await rm(lockPath, { force: true });
  } catch { /* ya no existe: nada que hacer */ }
}
```

### 🔴 L2 — Se publica TypeScript fuente; el CLI es de facto *bun-only*
**El de mayor ROI para adopción real.**
[packages/core/package.json](../../../packages/core/package.json) declara
`"main": "./src/index.ts"`, `"exports": "./src/index.ts"` y
`"bin": { "mcp-core": "./src/cli.ts" }`, y **no hay script `build`** ni emisión de
`.js`/`.d.ts`. Un host que lance `npx @cartago-git/mcp-core` bajo Node **no puede
ejecutar `.ts`** y falla; solo `bunx` funciona. Claude Desktop, Cursor y VS Code
lanzan `npx`/`node` mayoritariamente → choca de frente con el titular "funciona
igual bajo cualquier host". Hoy está a medio camino: te lo crees universal, no
arranca en el runtime mayoritario.
**Fix:** (a) `tsup`/`bun build` a `dist/` con `exports` condicional y `bin` a `.js` +
`.d.ts`; **o** (b) documentar "requiere bun" como contrato de primera línea. Decidir
explícitamente — la opción (a) desbloquea el mercado.

### 🔴 L3 — `round_context` imprime con tabuladores (viola el propio principio de tokens)
[round-context.tool.ts:150](../../../plugins/proposals/src/lib/tools/round-context.tool.ts#L150)
devuelve `JSON.stringify(out, null, '\t')`. `TOKEN-BUDGETS.md` dice literalmente
"compact JSON … no pretty-print", y el digest de ronda es de los payloads más
grandes (locks + agentes + portfolio + hashes + resumeHint) → ~25-40% de tokens en
whitespace. **No está cubierto por el guard de presupuesto** (mide solo `overview` y
`auto_work`). La compactación de N11 cubrió `agent_lock`/`task_queue` pero **dejó
fuera `round_context`.**
**Fix (1 línea):** `toolJson(out)` / `JSON.stringify(out)` + ampliar el guard de
budget a `--preset=swarm` con techo por-preset.

### 🔴 L4 — `plugins/docs` con I/O síncrono bloquea el event loop
[docs/src/lib/engine.ts:1](../../../plugins/docs/src/lib/engine.ts#L1) importa y usa
`readdirSync`/`statSync`/`readFileSync` para recorrer e indexar el corpus. `search`
ya se migró a `fs/promises` (N5) pero **docs no**: en workspaces grandes o FS de red
congela el hilo principal y provoca timeouts falsos en peticiones concurrentes
(estado de locks, health).
**Fix:** migrar el motor a `fs/promises` (paralelo de N5).

### 🟡 L5 — `proposals` expone ~16 herramientas; superficie y solapamiento altos
Conteo real: core 10, **proposals 16**, resto 1–4 → **~45 tools con todo cargado**.
Varias de coordinación se solapan para el modelo que tiene que *elegir*: `auto_work`,
`continue_proposal`, `compact_status`, `task_queue`, `round_context`,
`proposal_board`, `state_health`. Los presets mitigan a nivel de *plugin* pero no
dentro de `proposals` (o cargas las 16 o ninguna).
**Fix:** eje de "perfil de herramientas" dentro del plugin (core vs swarm) o fusionar
`compact_status`+`state_health` en un `status { fields }`.

### 🟡 L6 — `release.ts` no es transaccional ni tiene rollback
[scripts/release.ts](../../../scripts/release.ts) publica en bucle `PUBLISH_ORDER`;
si el 6º paquete falla (registry/2FA/red), los 5 anteriores ya están publicados y
`npm publish` es irreversible. Falta staging `--tag next`, verificación post-publish,
`CHANGELOG` por paquete y job de release en CI (hoy la publicación es 100% manual).
Asimétrico: el *plan* de versión está testado, la *ejecución* no.

### 🟡 L7 — `parseQueue` valida `waitFor` con `existsSync(wf.file)` sobre la ruta cruda
[persistent-task-queue.ts:336-345](../../../plugins/proposals/src/lib/agents/persistent-task-queue.ts#L336-L345)
trata `wf.file` como ruta directamente usable. Si el enqueue guardó rutas relativas
y `parseQueue` corre con otro `cwd`, da falsos `WAIT_FOR_FILE_MISSING` que **abortan
el parseo de toda la cola**. Es el único acoplamiento implícito a `cwd` que queda.
**Fix:** resolver `wf.file` contra el root inyectado, como el resto del código.

### 🟡 L8 — `.claude/settings.local.json` versionado con `bypassPermissions`
Confirmado: el fichero está *tracked* en git con `defaultMode: bypassPermissions` y
`Bash` sin patrón. Mala semilla para quien clone y para sesiones automáticas.
**Fix:** sacarlo del control de versiones (`.gitignore`) o dejar un `settings.json`
mínimo de proyecto sin bypass.

### 🟡 L9 — `outputSchema` permisivo en tools action-multiplexed
`task_queue`/`agent_lock` declaran `z.object({}).catchall(z.unknown())` porque el SDK
exige un `ZodObject` plano y rechaza `z.union` por acción → el cliente pierde
type-safety por acción. **Limitación del SDK**, documentada; mitigable solo
registrando una tool por acción (rompería la superficie compacta). Aceptable hoy;
revisar cuando el SDK admita uniones.

### 🟡 L10 — Higiene de dependencias y CI
`typescript: ^6.0.3` y `vitest: ^4.1.8` apuntan a majors sin release estable
documentado, y el CI usa `bun-version: latest` sin pinning → regresiones no
reproducibles. Además **no hay coverage gate** (`coverage = false`). Faltan
`CHANGELOG.md` y `CONTRIBUTING.md`.
**Fix:** pinnar TS/vitest a estable (o RC con comentario), pinnar la versión de Bun
en CI, añadir `--coverage` con umbral (≈70% core / 60% plugins).

---

## 4. Eficiencia de tokens (consolidado)

**Muy buena, con una única fuga real:** cold-start <300 tok (`overview compact`
~220, `auto_work` ~36), knowledge perezoso vía MCP resources, caps en `search`,
paginación en `memory`, `git diff --stat`, push en vez de polling — **todo medido y
con guard**. La fuga es **L3** (`round_context` pretty-print, no cubierto por el
guard). Riesgo secundario: el `overview` *full* crece linealmente con las ~45 tools
(L5); el `compact` lo aguanta pero conviene techo de budget por-preset.

## 5. Bucles y bloqueos (consolidado)

**No hay deadlock ni bucle infinito alcanzable.** Mitigados: `lock-conflict` devuelve
acción alternativa (no polling), `all-claimed`/`idle` cortan el reintento por
contrato, TTL + `expireSweep` + backpressure + zombie-reconcile evitan crecimiento
ilimitado, `fs.watch` + fallback evita espera activa, kill por process-group en
acceptance. **Riesgos abiertos:** la carrera del mutex (L1, *correctitud* bajo
secciones largas, no bloqueo) y el congelado del event loop por I/O síncrono en docs
(L4). Residual de comportamiento: un modelo que ignore `nextAction` puede re-llamar
`auto_work` en `idle`; mitigado con estado explícito, sin freno duro (un contador de
idles consecutivos con `stop: true` sería barato).

---

## 6. Capacidades candidatas (no urgentes, ordenadas por impacto)

**Tools/skills nuevas:**
- **`why_blocked` / `explain`** — dado un `task_id` bloqueado, devolver la cadena de
  bloqueo (tarea/agente/fichero) en un payload, hoy repartida entre 3 tools.
- **`cancel_operation` / `quality_cancel`** — matar una ejecución de calidad/acceptance
  larga por id en vez de esperar al timeout.
- **`apply` / `--write` opcional en `scaffold`** — hoy todo es dry-run; un `--write`
  con guard ahorra un round-trip enorme de generación→reescritura.
- **Skills versionadas** `concurrency-patterns.md` (qué hacer ante `lock-conflict`,
  sin reintentos que saturen disco) y `recovery-playbook.md` (resolver
  `CorruptFileError` de forma autónoma).
- **`.claude/agents/*` del swarm** (los slots ya existen en `AGENT_SLOTS`) +
  slash-skill `swarm`/`auto-work` que envuelva el bucle claim→slice→validate→sync→
  release y pare en `idle`. Convierte "tengo un MCP de swarm" en "tengo un swarm que
  arranca de un comando".

**Plugins nuevos:** **`web`/`fetch` agnóstico con allow-list de dominios** (el hueco
más obvio para tareas que hoy exigen salir del servidor). NO añadir más agentes por
defecto (5 roles es el límite saludable).

**Plataforma:** TypeDoc de `src/public/`, directorio `/examples` (minimal/swarm/
custom-plugin), JSON Schema publicado para `mcp-core.config.json` (autocompletado en
editores), carga **paralela** de plugins (`Promise.allSettled` para los imports,
registro en orden determinista) para acotar el worst-case de boot.

---

## 7. Plan priorizado de continuación

**P0 — Correctitud y adopción (1–2 días) · cerrar antes de publicar**
- [ ] **L1** Token único de sesión en `withFileMutex` + borrado condicional (+ test de
      robo concurrente que falle hoy).
- [ ] **L2** Decidir runtime: `build → dist/` (`.js`+`.d.ts`, `bin` a `.js`) **o**
      contrato "requiere bun" documentado en README/instrucciones de cliente.
- [ ] **L3** `round_context` → JSON compacto + ampliar el guard de budget a
      `--preset=swarm` con techo por-preset.
- [ ] **L4** `plugins/docs` engine → `fs/promises` (erradicar I/O síncrono).

**P1 — Robustez operativa (2–3 días)**
- [ ] **L7** Resolver `wf.file` contra el root inyectado en `parseQueue`.
- [ ] **L8** Sacar `.claude/settings.local.json` de git (o sin bypass).
- [ ] **L6** `release.ts`: staging `--tag next`, verificación post-publish, `CHANGELOG`
      por paquete y job de release en CI (con `provenance`).
- [ ] **L10** Pinnar TS/vitest a estable y Bun en CI; coverage gate; `CHANGELOG.md` +
      `CONTRIBUTING.md`.

**P2 — Calidad de producto / agente (3–5 días)**
- [ ] **L5** Perfil de herramientas en `proposals` (core vs swarm) o fusionar
      `compact_status`+`state_health` en `status { fields }`.
- [ ] Freno duro anti-idle en `auto_work` (`stop: true` tras N idles).
- [ ] `why_blocked` y `cancel_operation`; `--write` opcional en scaffold.

**P3 — Plataforma de referencia**
- [ ] `.claude/agents/*` (slots del swarm) + slash-skills `swarm`/`auto-work`.
- [ ] Skills versionadas (`concurrency-patterns`, `recovery-playbook`).
- [ ] Plugin `web`/`fetch` con allow-list.
- [ ] TypeDoc + `/examples` + JSON Schema de config + carga paralela de plugins.
- [ ] **npm publish** (lo ejecuta el usuario con su cuenta, `docs/NPM_PUBLISH.md`).

> Estimación heredada: cerrando **P0** se pasa de "excelente prototipo bun-first" a
> "referencia publicable y universal" (~9,8); con P1 robustez operativa real (~10,3);
> P2+P3 → plataforma de referencia (**11/10**). L9 queda bloqueado por el SDK.

---

## 8. Conclusión

mcp-core está muy por encima de la media: hermético, medido, testeado, con decisiones
(lost-update vs torn-write, cuarentena de corrupción, budget con guard, drift de
tipos) que la mayoría descubre tarde y a base de incidentes. Lo que falta para el
11/10 **no es deuda estructural sino acabado**: cerrar la carrera del mutex (L1), que
arranque en el runtime mayoritario (L2), tapar la última fuga de tokens (L3) y el
último I/O síncrono (L4). Cuatro arreglos acotados desbloquean la categoría. El resto
es disciplina incremental sobre una arquitectura que ya es correcta.

— Auditoría maestra, 2026-06-16. Hallazgos P0 re-verificados contra el código.
