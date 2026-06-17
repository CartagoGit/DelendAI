# Resumen de sesión — 2026-06-17 (casa → oficina, Opus)

> **Repo:** `/home/cartago/_projects/mcp-core` · rama **`main`** ·
> **`HEAD == origin/main` (todo commiteado y PUSHEADO)** salvo 1 fichero suelto
> (ver "Estado git" abajo). Hay un **auto-commit+push** corriendo, así que en la
> oficina basta con **`git pull`** y `bun install` para continuar exactamente aquí.
>
> **Estado al cerrar: 428 tests (418 + 10 skip), typecheck limpio, TODO VERDE.**
> Validar: `bun run validate`. Build publicable: `bun run build` +
> `node packages/core/dist/cli.js --check`.
>
> **Doc maestro vigente:** `docs/proposals/audits/16-06-2026- Auditoría Maestra (Unificada).md`
> (unifica las 8 auditorías; hallazgos **M1–M15**). Esta sesión ejecutó **todo P0**
> y **parte de P1**. Nivel estimado tras P0: ~9,5/10.

---

## ✅ Hecho esta sesión (con tests, commiteado+pusheado)

### P0 — completo (M1, M2, M3, M4, M8)

- **M1 · Carrera de robo del mutex** — [`packages/core/src/lib/shared/with-file-mutex.ts`](../../packages/core/src/lib/shared/with-file-mutex.ts).
  Token de propiedad `pid\nts\nUUID` (`randomUUID`); el `finally` **solo borra el
  lock si el token sigue siendo el nuestro** (relee y compara) → no desprotege a un
  ladrón legítimo. + **heartbeat** que refresca el `mtime` mientras corre `fn()`
  (un holder vivo no se declara stale). Test de robo concurrente en
  `with-file-mutex.spec.ts` (fallaba con el código viejo).

- **M2 · `agentSlot` agnóstico** — `z.enum(AGENT_SLOTS)` → `z.string().min(1)` en
  los 2 schemas ([`task-queue-engine.ts`](../../plugins/proposals/src/lib/agents/task-queue-engine.ts)
  + [`persistent-task-queue.ts`](../../plugins/proposals/src/lib/agents/persistent-task-queue.ts)).
  Los 5 roles canónicos quedan como `DEFAULT_AGENT_SLOTS` (default documentado, no
  restricción). Test de slot no-canónico en `persistent-task-queue.spec.ts`.

- **M3 · Runtime publicable (build a `dist/`)** — *el cambio grande*.
  - `scripts/build.ts` (nuevo): por paquete hace `bun build` (ESM, `--target node`,
    `--packages external`, `--root src`) para el `.js` **node-runnable** +
    `tsc --emitDeclarationOnly` para el `.d.ts`. En la emisión de tipos los
    `@cartago-git/*` se mapean al **`dist/*.d.ts`** de core (build en orden: core
    primero) para no arrastrar fuente cruzada.
  - 10 `package.json` parcheados: `exports` condicional (`types`+`import`),
    `main`/`module`/`types`/`files`→`dist`, `bin`→`./dist/cli.js`; `scripts.build`.
  - `cli.ts` shebang → `#!/usr/bin/env node`.
  - `package.json` raíz: `"build": "bun scripts/build.ts"`.
  - `release.ts` compila (`bun run build`) **antes de publicar**; `ci.yml` añade
    "Build dist" + smoke `node packages/core/dist/cli.js --check` antes del pack.
  - **`dist/` está en `.gitignore`** — se genera solo al publicar/CI, no se commitea.
  - Decisión (a petición del usuario): se descartó "Node-TS nativo" (imports sin
    extensión + suelo Node ≥22.18 + solo borra tipos). El `.js` bundleado corre en
    **Node 18/20/22/23, Deno, bun** y con cualquier gestor. Probado con `node` real.

- **M4 · `plugins/docs` async** — [`docs/src/lib/engine.ts`](../../plugins/docs/src/lib/engine.ts)
  de `fs` síncrono → `fs/promises`. Callers/specs a `await`.

- **M8 · Sin pretty-print en tools calientes** — `round_context` (vía `toolJson`),
  `sync_proposals`, `get_proposal_workflow` (conservan `structuredContent`). Los
  ficheros persistidos se dejan legibles a propósito (decisión N11).
  *Pendiente menor:* ampliar el guard de budget a `--preset=swarm`.

### P1 — parcial (M5 ✅, M7 ✅)

- **M7 · Hermeticidad de rutas** — `ITaskQueuePaths` ahora exige `lockPath` y añade
  `workspaceRoot`; el `report` ya no cae al fallback cwd-relativo. `waitFor.file` se
  resuelve contra el `workspaceRoot` inyectado (no el cwd) en el `superRefine` del
  enqueue **y** en `parseQueue` (param `workspaceRoot?` opcional). Hilado por:
  `index.ts` (paths del task_queue + `stateOptions` + `agentNamesOptions`),
  `IStateToolOptions`, `IAgentNamesToolOptions`, `IVerifyPaths`/`defaultVerifyPaths`
  (delivery-verifier ya pasa `lockPath`+`workspaceRoot` reales). Test M7 en
  `persistent-task-queue.spec.ts` (relativo + root vs sin root).

- **M5 · Cero I/O síncrono en rutas calientes de `proposals`**:
  - enqueue `superRefine`: precómputo **async** (closedTasks vía `readClosedTasks`,
    existencia de `waitFor` vía `stat`) ANTES del `parse`; el refine quedó puro.
  - `parseQueue`: `readFileSync`→`readFile`, `existsSync(wf.file)`→`stat`.
  - `zombie-reconcile.ts` (`loadLockSnapshotLocal`) y `promote-on-release.ts`
    (`loadOrEmptyQueue`): `existsSync`/`readFileSync` → `readFile` async; callers
    (`gcZombies`, `promoteOnRelease`) con `await`.
  - `task-queue-engine.ts`: `ensureQueueFile` usa `stat`; eliminado el `existsSync`
    redundante de `loadOrEmptyQueue` (el catch ENOENT ya cubre).

---

## ⏭️ Punto de continuación (en orden) — empezar por M6

### 1. M6 — Persistir `deliveredDigests` (idempotencia cross-session)
**Dónde:** [`task-queue-engine.ts:303`](../../plugins/proposals/src/lib/agents/task-queue-engine.ts)
`const deliveredDigests = new Set<string>();` (in-memory). Al reiniciar el server,
el primer `subscribe` re-entrega todos los digests → trabajo duplicado.
**Plan:** persistir en un sidecar `.subscribe-delivered.json` junto a la queue, bajo
`withFileMutex`, keyed por `deliveredKey(taskId, observedTaskId)`. La acción
`subscribe` (≈líneas 478-512) lee/añade al set; cambiar a leer el sidecar + escribir
atómico bajo mutex. Mantener `__resetDeliveredDigestsForTesting` o sustituirlo por
borrar el sidecar. Añadir test de "reinicio no re-entrega".
**Nota:** `ITaskQueuePaths` ya tiene `queuePath`; derivar el sidecar de ahí. No hace
falta nueva inyección de rutas.

### 2. Release/CI hardening (P1 robustez)
- `CHANGELOG.md` (por paquete o raíz; el release ya hace bump lockstep).
- Pinnar versiones inestables: `typescript: ^6.0.3` y `vitest: ^4.1.8` → estable (o
  RC con comentario); `ci.yml` `bun-version: latest` → versión fija.
- Coverage gate en CI (`vitest --coverage` con umbral; hoy `coverage=false`).

### 3. P2 (calidad de producto) — del doc maestro
- **M9** Biome + job CI `lint` (el repo no tiene linter — incoherente con `rules`).
- **M10** Cobertura pareja en los plugins satélite (hoy `proposals` acapara 34/63).
- **M11** Plugins best-in-class: `search` regex/glob; `memory` TTL+redacción de
  secretos; `rules` detección+`compact`; `docs` paginación; `deps_outdated`.

### 4. P3 (plataforma) — del doc maestro
- **M12** plugin `metrics` · **M13** `security` + bridge securecoder · **M14**
  migraciones de estado · **M15** blueprint sin drift de `cacheDir`.
- Freno duro anti-idle en `auto_work`; `quality_cancel`; skills versionadas; TypeDoc;
  `/examples`; JSON Schema de config. **npm publish = lo ÚLTIMO (lo hace el usuario).**

---

## Estado git (importante para la oficina)
- **Commiteado + pusheado a `origin/main`** todo lo de arriba salvo posiblemente el
  ÚLTIMO fichero suelto: `plugins/proposals/tests/.../persistent-task-queue.spec.ts`
  (el test de M7) — el auto-commit debería recogerlo (y este propio resumen).
- En la oficina: `git pull` → `bun install` → `bun run validate` (esperar **428
  verde**). Si el test de M7 no llegó, está descrito arriba (trivial de rehacer).
- **No** commitear `dist/` (gitignored; se genera con `bun run build`).

— Cierre de sesión 2026-06-17 (casa). Continúa por **M6**.
