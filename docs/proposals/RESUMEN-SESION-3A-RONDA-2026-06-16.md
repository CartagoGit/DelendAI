# Resumen de sesión — 3ª ronda (2026-06-16, **08:27 → ~13:50**, oficina, Opus)

> Continúa la cola viva **§0 (N1–N23)** de
> `audits/AUDITORIA-UNIFICADA-2026-06-15.md`. Sesión anterior (2ª ronda, noche
> 06-15) en `done/RESUMEN-SESION-2A-RONDA-2026-06-15.md`.
>
> **Repo:** `/home/cartago/_proyectos/propios/mcp-core`.
> **Estado al cerrar: 391 tests (381 + 10 skip), typecheck limpio, TODO VERDE.**
> Árbol git limpio. Nivel estimado ~9,9/10. Nada a medias. **10 paquetes.**
>
> **Continuación (misma sesión, 09:49 → ~13:50):** además de N16/N17/N19-docs/
> N20-parcial de la mañana, se cerró mucho más:
> - **N16 endurecido y CORREGIDO**: una **red e2e estricta** (`outputschema.e2e.spec.ts`,
>   asserta no-isError + structuredContent por el protocolo) destapó 2 regresiones
>   que los unit tests ocultaban (`z.record` no vale como outputSchema → `z.object().catchall`;
>   tools con content manual sin structuredContent) y un bug real **`git_git_*`→`git_*`**
>   (doble-prefijo, como el `memory_memory_*` previo). Además schemas **precisos**
>   en state_health/proposal_board/get_proposal_workflow.
> - **N17** compact_status, **N18** presets de plugins (`--preset`), **N19** completo
>   (plugins `docs` + `deps`), **N23** `--verbose`.

## Qué se hizo (todo ✅ con tests, commiteado)

1. **Arranque**: archivé `RESUMEN-SESION-2A-RONDA` a `done/` y confirmé verde el
   trabajo en paralelo (366 → punto de partida).

2. **N16 — `outputSchema` por tool: COMPLETO (~32 tools).** El SDK MCP valida
   `structuredContent` contra el `outputSchema` **solo en éxito** (`isError:true`
   exento — confirmado en `node_modules/.bun/@modelcontextprotocol+sdk@1.29.0/
   .../server/mcp.js:193`), así que es seguro.
   - **core-meta**: `overview` (un schema cubre compact+full vía uniones; `corePaths`
     opcional), `knowledge` (permisivo: lista o entrada), `get_validation_matrix`.
   - **bootstrap** (analyze_project/create_server/plan_mcp_server) + **scaffold**:
     permisivo; sus helpers manuales (`json()`/return) ahora emiten `structuredContent`.
   - **plugins**: memory×4, search, git×4, quality×2, notification×1; **proposals×15**
     (preciso en `sync_proposals`/`plan`; permisivo `z.record(z.string(), z.unknown())`
     en los *action-multiplexed*: agent_names, task_queue, agent_lock, delegate,
     round_context, continue_proposal, auto_work, create_proposal, close_slice,
     get_proposal_workflow, state_health, state_repair).
   - **Red e2e real** `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts`:
     ensambla los 8 plugins + core (con `git init` real en el workspace temporal) y
     llama cada tool read-only (incl. acciones) por el **protocolo MCP** — un schema
     erróneo lanzaría `McpError`. Es también el doctor end-to-end de facto.

3. **N17 — `proposals_compact_status`.** Agrega SOLO el estado del propio plugin
   (locks activos + backpressure de cola queued/promoted/waiterOrphans/threshold +
   propuestas por estado) en un payload mínimo, con selector `fields`
   (["locks","queue","proposals"]). Reusa `loadLockSnapshot`+`reportBackpressure`+
   lectura tolerante del índice. **Decisión del usuario:** proposals lo posee (core
   no conoce a los demás plugins). `outputSchema` preciso + spec + e2e.

4. **N19 (parcial) — plugin `@cartago-git/mcp-docs` (9º paquete).** `docs_list`
   (cataloga el markdown del repo como {path,title}, título del 1er heading/
   frontmatter, low-token, count-capado) y `docs_read` (lee uno por ruta relativa;
   **rechaza traversal** fuera del workspace; capado a 256 KiB). Agnóstico:
   roots/extensiones vía `plugins.docs.options` (default `docs/` + `README.md`).
   Complementa a `search` (grep) con navegación curada. Wiring: tsconfig.base +
   vitest.shared + NPM_PUBLISH (9 paquetes). 7 tests + e2e; pack limpio.

## Pendiente para 11/10 (cola §0)

| # | Qué | Estado / por qué no se hizo |
|---|---|---|
| **N18** | Presets `minimal`/`standard`/`swarm` | ✅ **HECHO** — presets de **plugins** (`--preset`, aditivos, fusiona con `--plugins`). |
| **N19** | Plugins `docs` y `deps` | ✅ **HECHO** — `docs` (navegación markdown) + `deps` (inventario + salud offline, SIN red/CVE a propósito). |
| **N20** | Split `round-context.ts` (884 → módulos) (= R15) | 🟡 **parcial** — tipos extraídos (884→~760, barrel `export *`). Falta separar funciones (digest/snapshot/store; comparten helpers privados → fiddly). |
| **N22** | Memoria semántica (FTS/SQLite) en `memory_recall` | ⬜ Alcance grande + dependencia. **El mayor pendiente real.** |
| **N23** (resto) | Tests de caos/adversarial, `IStatusCollector`, skills versionadas, semver+publish auto, **SDK de tipos generados** desde `outputSchema` | 🟡 e2e real estricto ✅ + benchmarks ✅ + **`--verbose` ✅** + doble-prefijos arreglados ✅. Resto (caos/IStatusCollector/SDK/semver) ⬜. |
| **N16** (refinar) | `z.record` permisivos de los tools *action-multiplexed* → **uniones por-acción** | mejora futura; los read-only ya son precisos; alimenta el SDK de tipos de N23. |

## 🔖 Cómo continuar

**1. Validar verde (siempre):**
```bash
cd /home/cartago/_proyectos/propios/mcp-core
bun install
bun run validate     # typecheck + 391 tests (381 + 10 skip) → verde
# doctor e2e con los 8 plugins (lo cubre outputschema.e2e.spec.ts):
bun packages/core/src/cli.ts --plugins=proposals,rules,memory,git,quality,search,notification,docs --check
```

**2. Cola viva:** `docs/proposals/audits/AUDITORIA-UNIFICADA-2026-06-15.md` **§0
(N1–N23)** con ✅/🟡/⬜. Eso manda; lo de arriba en ese doc es historial.

**3. Premisa clave:** **Affairs ya NO consume mcp-core** (independientes). Ignora
cualquier nota antigua de "re-validar 1184".

**4. Siguiente recomendado:**
- **N20** (split `round-context.ts`) si quieres avance seguro sin decisión.
- **N18** (presets) o **N19-`deps`** si me das el contrato/decisión.
- Refinar N16 (uniones por-acción) habilita el **SDK de tipos** de N23.

**5. Artefactos nuevos de esta sesión:**
- `plugins/docs/**` (9º paquete).
- `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts` (red de validación de schemas).
- `plugins/proposals/src/lib/tools/compact-status.tool.ts` + spec.
- `outputSchema` declarado en ~32 tools (core + 8 plugins).

**npm publish**: lo ejecuta el usuario (`docs/NPM_PUBLISH.md`, ya con 9 paquetes).
