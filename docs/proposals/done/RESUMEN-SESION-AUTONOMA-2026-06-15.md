# Resumen de la sesión autónoma — 2026-06-15, **madrugada → ~08:05** (Claude Code, Opus 4.8)

> **Sesión 1 de 2 del día.** Esta fue la sesión autónoma (sin supervisión,
> mientras no estabas; parada ~08:05 al irte al trabajo). La continuación desde
> la oficina (08:55 → 20:10) está en
> [`RESUMEN-SESION-OFICINA-2026-06-15.md`](./RESUMEN-SESION-OFICINA-2026-06-15.md).

Me diste la batuta para ejecutar la **auditoría unificada** sin parar y tomar
decisiones por ti. Esto es lo que hice, por qué, y lo que dejé pendiente (con el
motivo). **Todo lo tocado queda verde**: mcp-vertex **283 tests** + typecheck
limpio; **Affairs 1184 tests** + typecheck intactos (re-validado tras cada cambio
que tocaba engines que Affairs consume); doctor con 5 plugins `ok:true` +
`assembles:true` (33 tools / 4 prompts / 6 resources).

## Decisión de fondo
Cumplir la **auditoría** (subsume nuestras tareas sueltas) en orden P0→P3,
priorizando **fiabilidad del estado** sobre features nuevas. Regla que me impuse:
**no romper Affairs** (está verde y es tu proyecto real); por eso evité cambios de
firma en engines que Affairs consume cuando el riesgo era alto, y re-validé Affairs
tras cada cambio compartido.

## ✅ Hecho (con tests)

**P0 — fiabilidad del estado**
- **F1+M1 (FATAL, las 4 auditorías): escrituras atómicas**. Nuevo util en core
  `writeFileAtomic`/`writeFileAtomicSync` (temp **en el mismo directorio** + rename,
  sin bug `EXDEV`). Aplicado a: agent-lock, sync-proposal-registry (índice),
  persistent-task-queue, promote-on-release y memory. → no más JSON corrupto por
  escrituras concurrentes ni `EXDEV` entre filesystems.
- **F5 (FATAL Codex): `task_queue report` leía el lock equivocado**. `ITaskQueuePaths`
  ahora acepta `lockPath` inyectado (el plugin lo pasa absoluto; Affairs cae al
  default → sin regresión).

**P1 — operativa**
- **M2 (Codex): doctor real + dedup**. El loader dedup por specifier y por nombre
  de plugin; `runDoctor` ahora **ensambla el server real** (sin stdio) y reporta
  `assembles`/`assemblyError` → se acabó el falso positivo de `--plugins=memory,memory`.
- **M3: timeout de import/register** de plugins (default 15s) → un plugin colgado ya
  no bloquea el boot indefinidamente.

**P2 — flujo de propuestas + calidad + agnosticismo**
- **#10: autoría de propuestas en slices** (lo que pedías para multi-agente). Nuevas
  tools en `proposals`: **`create_proposal`** (genera el `.md` con frontmatter +
  `## Slices` disjuntas, **valida solapes**, escribe atómico y re-sincroniza),
  **`close_slice`** (marca `status: done` + libera el lock, atómico), **`proposal_board`**
  (vista orquestador: propuestas × slices × claims). + knowledge **`multi-agent-loop`**
  y prompt **`orchestrate`**.
- **R1: `joinRel` centralizado** en `@cartago-git/mcp-vertex/public` (eliminadas 5 copias).
- **M6: modelo hardcoded** `MiniMax-M3` → `<your-model>` en el scaffold.
- **R8: `quality` async** (spawn en vez de `execSync`, salida acotada en streaming,
  código de timeout 124) → no congela el server.
- **R9: `git` endurecido** (detección de no-repo → `{ok:false,reason}`, timeout 15s,
  `git_log.limit` clamp 1..100, maxBuffer).
- **R10: `memory` con quotas** (título ≤200, body ≤8000, tags ≤20, recall limit 1..50)
  + escritura atómica.
- **R6: `rules` manifest se regenera por fingerprint** (cambios de mode/overrides/
  presets lo regeneran; edición humana con mismo fingerprint se respeta).
- **R7: `check_rules` añade `typecheckCommand`** además del de lint.

**P3 — tokens + agnosticismo de linter**
- **Tokens: `overview` gana `compact:true` y `tag`** → payload mínimo cuando hay
  muchas tools.
- **rules avanzado: preset `laravel` (linter `pint`, no eslint)** + detección por
  `composer.json/artisan` → demuestra que el sistema de reglas es agnóstico del
  linter, no solo eslint. `check_rules`/`apply_rules` emiten el comando correcto por
  linter (`pint` vs `eslint`). La detección **por carpeta** ya existía
  (apps/libs/packages/projects + raíz).

## ⏸️ Dejado a propósito (con motivo) — recomiendo una tanda dedicada

Estos los **no** hice para no arriesgar Affairs de madrugada o por ser subsistemas
grandes que la propia auditoría sitúa en la frontera del 11/10:

- **F2 (erradicar `process.cwd()` por completo)**: quedan como *fallbacks*
  (`syncProposalRegistry(root=process.cwd())`, `resolveWorkspacePath`,
  `delivery-verifier.defaultVerifyPaths`). En la práctica los tools/plugin inyectan
  las rutas, así que el fallback casi no se ejerce; pero cambiar sus firmas a
  *required* toca engines que **Affairs consume** → requiere re-validar Affairs con
  cuidado. **Decisión: pase dedicado.**
- **F3 (que `--cacheDir`/`--docsDir` reubiquen TODO el store de proposals)**: los
  engines (sync/round-context) hornean `DEFAULT_PATH_LAYOUT`. Hacerlo a medias crea
  la incoherencia que la auditoría advierte; hacerlo bien = inyectar el layout en los
  engines + re-test Affairs. **Decisión: el plugin sigue coherente en `.cache`/`docs`;
  pase dedicado.** (Hoy `--cacheDir`/`--docsDir` sí afectan core y otros plugins.)
- **F4 (mutex interproceso real / CAS / WAL)**: las **escrituras atómicas (F1) ya
  eliminan la corrupción**, que era el riesgo principal. El *lost-update* entre dos
  procesos a la vez necesita un subsistema transaccional con lock interproceso +
  fault-injection tests (la auditoría lo pone en el tramo 10→11). **Decisión: dejado
  como subsistema dedicado.**
- **M4/M5/M7/M8/M10** (tracks/carpetas configurables, unificar schema de lock,
  hardening de acceptance exec con process-groups, corrupto≠vacío) y **R2/R5/R12/R13/
  R14** (quitar `coreToolRegistrations`, check de deps eslint, IDs por namespace,
  semver de `/lib/*`, renombrar `subagent-*`): mezcla de acoplamiento a engines que
  Affairs usa y de cambios cosméticos con riesgo. **Decisión: pase dedicado**; varios
  requieren re-validar Affairs.
- **Tier 3 / plataforma**: `structuredContent`/`outputSchema`, plugins nuevos
  (`notification` para matar el polling de locks, `search`, `docs`, `deps`),
  observabilidad/CI/benchmarks. **Nuevo alcance, no urgente.**
- **Publicación npm**: la haces tú (auth). No publiqué nada.

## Dudas que resolví por ti (dímelo si cambias algo)
1. **No toqué Affairs salvo para que siga verde**: los cambios de engines compartidos
   (atomic, joinRel, lockPath opcional) son compatibles hacia atrás; re-validé 1184
   tests tras cada uno.
2. **`proposals` sigue en `.cache`/`docs`** (no per-plugin subdir) para que todas sus
   tools y engines concuerden; preferí coherencia a honrar `--cacheDir` a medias.
3. **El preset Laravel** lo añadí como demostración de agnosticismo de linter (pint);
   si no lo quieres, se quita en 1 línea del registro de presets.
4. **No fragmenté `proposals` en sub-capacidades** (store/locks/queue/swarm) que sugería
   Codex: es un refactor grande con riesgo; lo dejé anotado.

## Estado
- Auditoría unificada viva en `docs/proposals/audits/AUDITORIA-UNIFICADA-2026-06-15.md`
  (las 4 originales + este resumen, en `done/`).
- mcp-vertex: typecheck limpio, 283 tests. Affairs: typecheck limpio, 1184 tests.
- Siguiente recomendado cuando me digas: **F2+F3+F5-completo en un pase con re-test de
  Affairs**, luego F4 (transaccional) como subsistema, luego plugins nuevos.
