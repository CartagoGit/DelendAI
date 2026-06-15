# Resumen de sesión — 2ª ronda de auditoría (2026-06-15, noche, Opus)

> Continuación tras la sesión de oficina. El usuario aportó **dos auditorías
> nuevas del estado actual** (Antigravity·Sonnet 4.6 = 8,4/10, Antigravity·Gemini
> 3.5 = 8,5/10) y pidió: consolidarlas en la propuesta viva y seguir hacia 11/10.

## Qué se hizo

1. **Consolidación** — Las 2 auditorías nuevas analizadas y volcadas a
   `audits/AUDITORIA-UNIFICADA-2026-06-15.md` **§0 (N1–N23)** como cola viva.
   La revisión de oficina (`RESUMEN-SESION-OFICINA`) y las 2 auditorías nuevas
   movidas a `done/`.

2. **Tanda P0/P1 — correctitud y concurrencia (N1–N10), TODO ✅ con tests:**
   - **N1** mutex en `memory` `saveNote`/`removeNote` (+ test de concurrencia).
   - **N2** mutex en `syncProposalRegistry` (sync concurrente ya no pierde propuestas).
   - **N3+N4** `git` async (`execFile`) + `IGitRunResult {ok,output,reason}` +
     `checkRepo` distingue *git-ausente* / *no-repo* / *limpio*.
   - **N5** `search` engine async (`fs/promises`, sin bloquear el event loop).
   - **N6** hermeticidad: borrado `resolve-workspace-path.ts`; `getLockPath` exige
     `lockPath` inyectado; eliminado `resolveDefaultDigestPath`. Cero `process.cwd()`
     en engines.
   - **N7** `scaffold-host`: `buildHostConfig(workspaceRoot)` hermético; el entry
     generado (única frontera) pasa el cwd.
   - **N8** `prepareServerBlueprintOnStart` async y tras `assembled.start()` (boot rápido).
   - **N9** `auto_work`/`continue_proposal` excluyen `in_progress` con lock ajeno;
     `kind:"all-claimed"` anti-bucle (+ 2 tests).
   - **N10** quotas `memory`: tag ≤ 50 chars + total `MAX_NOTES=1000`.

3. **Tanda P2 — tokens (N11–N13) ✅:**
   - **N11** respuestas de `agent_lock`/`task_queue` compactadas (sin `\t`); ficheros
     persistidos se dejan legibles a propósito.
   - **N12** `overview compact`/`tag` — ya existía.
   - **N13** `memory_list` paginado (`limit`/`offset` + `total`/`nextOffset`).

4. **P3 (2 ítems self-contained) ✅:**
   - **N15** `state_health` + `state_repair` (dry-run/execute) en `proposals`:
     diagnostica locks activos, backpressure de cola (waiterOrphans/threshold) y
     assignments huérfanas; repara reusando `gc`/`expireSweep`/`gcZombies`. +specs.
   - **N21** doctor: una sola lectura del config (`assembleCliConfig` devuelve
     `configDiagnostic`). (= R3)

**Estado:** mcp-core **356 tests** (346 + 10 skip), typecheck limpio, todo verde.
Nivel estimado por las auditorías tras esta tanda: **~9,5/10**.

## Pendiente para 11/10 (requiere decisión o es alcance grande)

| # | Qué | Por qué no se hizo aún |
|---|---|---|
| **N14** | Plugin `notification` (mata polling de locks/cola con `notifications/message`) | **Decisión de arquitectura** (push del transport MCP) — el de mayor impacto, conviene acordarlo. |
| **N16** | `outputSchema` Zod por tool (≈25 tools) | Mecánico pero superficie grande; `structuredContent` ya cubre lo práctico. |
| **N17** | `compact_status` (git+locks+queue+quality en 1 llamada) | **Cross-plugin**: necesita decidir quién lo posee (core no conoce a proposals/git). |
| **N18** | Presets de scaffold `minimal`/`standard`/`swarm` | **Decisión de diseño** (presets de plugins vs de agentes). |
| **N19** | Plugins `docs` y `deps/security` (autocontenidos como `search`) | Contrato sin especificar — definir qué exponen. |
| **N20** | Refactor `round-context.ts` (884 líneas → 3-4 módulos) | Refactor interno, bajo valor visible, algo de riesgo. |
| **N22** | Memoria semántica (FTS/SQLite) en `memory_recall` | Alcance grande + dependencia. |
| **N23** | Excelencia demostrada: tests de caos, observabilidad `IStatusCollector`, benchmarks de tokens, semver+publish automatizado, **SDK de tipos generados** | Multi-semana (estimación de las propias auditorías). |

**npm publish**: lo ejecuta el usuario (`docs/NPM_PUBLISH.md`).
