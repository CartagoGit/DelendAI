# Resumen de la sesión de oficina — 2026-06-15, **08:55 → 20:10** (Claude Code)

> **Cronología de sesiones del 2026-06-15:**
> - **Sesión 1 — autónoma (madrugada → ~08:05)**: ejecuté la auditoría sin
>   supervisión mientras no estabas. Detalle en
>   [`RESUMEN-SESION-AUTONOMA-2026-06-15.md`](./RESUMEN-SESION-AUTONOMA-2026-06-15.md).
>   Cerró F1, F5, M2, M3, #10, R1, R6–R10, M6, tokens, rules-laravel (**283 tests**).
> - **Sesión 2 — oficina (08:55 → 20:10)** ← *este documento*. Llegué a la
>   oficina, retomé el trabajo a medias y vacié la cola accionable de la
>   auditoría + abrí Tier3.

Empecé con **Sonnet 4.6** (08:55–09:45) y a las ~14:00 me pediste revisar lo
hecho porque «el modelo era inferior»; el resto de la sesión (14:00–20:10) fue
con **Opus 4.8**. **Todo lo tocado queda verde**: mcp-vertex **350 tests**
(340 + 10 skip) + typecheck limpio.

## Decisión de fondo
Vaciar la cola que la sesión autónoma dejó pendiente, en orden FATAL → MUY MAL →
REGULAR → Tier3. Antes de seguir, **revisión crítica** del trabajo a medias del
modelo inferior (lo pediste explícitamente).

## 🔎 Dos hallazgos que cambiaron el plan
1. **M10 estaba commiteado pero incompleto** (lo dejó Sonnet): cero tests, el
   "error estructurado" no llegaba al usuario (los handlers no capturaban el
   throw) y la lógica de quarantine estaba duplicada con colisión de timestamp.
   **Remediado entero con tests.**
2. **La premisa "no romper Affairs" está OBSOLETA.** Verifiqué que Affairs
   (`/home/cartago/_proyectos/propios/affairs`) **no importa nada de mcp-vertex**
   (ni `@cartago-git`, ni alias de vitest, ni paths de tsconfig). Son proyectos
   independientes; mcp-vertex fue extraído pero Affairs conserva su copia. Sus ~14
   tests rojos son pre-existentes y ajenos. Corregí esa nota en la auditoría.

## ✅ Hecho (con tests) — orden cronológico

**Deuda de la auditoría (FATAL/MUY MAL/REGULAR)**
- **M10 — corrupto ≠ vacío** (09:19–09:45 base, remediado 14:00+): helper
  compartido `quarantineCorruptFile`/`Sync` + clase `CorruptFileError` en
  `@cartago-git/mcp-vertex/public` (sufijo `.corrupt-<ts>-<rand>` anti-colisión).
  Estado crítico (queue/registry/memory) preserva los bytes y la **capa de tool
  devuelve error estructurado nombrando el backup**; `closed-tasks-log`
  (diagnóstico) preserva + warning a stderr + sigue con `[]`. +24 tests.
- **R2** (09:01): `coreToolRegistrations()` vacío eliminado de
  `create-mcp-server.ts` y de `public/index.ts`.
- **R14** (14:26): internos `subagent-*` → `agent-*` (tipos, constantes,
  funciones, campos; 3 ficheros vía `git mv`). Preservado por compat de schema en
  disco: el filename `subagent-registry.json` y la terminología conceptual.
- **M7** (14:33): schema de lock único. El lector `persistent-task-queue` usaba
  un `.transform()` que aceptaba dos formatos; ahora usa solo el canónico del
  writer (`ownership`/`started_at`/`last_seen`). Consumidores y `zombie-reconcile`
  alineados.
- **M4 + M5** (14:53): agnosticismo. `IProposalTrack` pasa de union cerrado con
  vocabulario del host a `string`; `extractParallelismFromFrontmatter` acepta
  `knownTracks?` inyectable (typo-guard opt-in); `evaluateParallelism` con
  `auditLanes` configurable. Carpeta `paused/demos` ya no hardcoded:
  `syncProposalRegistry`/`scanLiveProposalEntries`/`collectRoundContextSnapshot`
  aceptan `extraFolders` que el plugin lee de `ctx.options['proposalFolders']`.
- **M8** (15:13): acceptance exec robusto. Reescrito sobre `node:child_process`
  con `detached:true`: `cwd` inyectable, tokenizer argv que respeta comillas +
  shell para pipes, y timeout que mata el **grupo de procesos**
  (`process.kill(-pid)`) — sin zombies. Pre-check de Bun eliminado
  (runtime-agnóstico).
- **M9** (15:19): scaffold de agentes coherente. El agente prometía tools que el
  host base no registra; ahora usa `<prefix>_overview` (entry canónico) y muestra
  el workflow de proposals como condicional a `--plugins=proposals`. **Cierra el
  grupo de agnosticismo M4·M5·M6·M9** (M6 ya estaba hecho).
- **R12** (15:24): IDs de tool por namespace. `assembleCliConfig` cualifica el id
  de cada tool de plugin a `<ns>_<id>` antes del registro, así dos plugins pueden
  tener una tool interna homónima.
- **R13** (15:27): wildcard `exports ./lib/*` cerrado en los 6 paquetes → la
  superficie publicada es `.`/`./public`; cambios bajo `src/lib` dejan de ser
  semver-breaking. Los tests siguen vía alias de vitest.

**Tier3 (evolución de plataforma)**
- **CI** (19:48): `.github/workflows/ci.yml` con jobs `validate` (typecheck +
  tests, Bun + frozen lockfile) y `pack-smoke` (`npm pack --dry-run` por paquete).
- **structuredContent** (19:50): MCP moderno. `toolJson`/`toolOk`/`toolError` +
  `json()` de agent-names + `runTaskQueueMcp` reflejan el payload-objeto en
  `structuredContent`.
- **Plugin `search`** (19:57): nuevo `@cartago-git/mcp-search`. Tool `search`
  grep-like de bajo token (`{file,line,text}` capado), agnóstico vía options,
  motor puro testeable, 8 tests, empaqueta limpio.

## ⏸️ Dejado a propósito (con motivo)
- **Plugin `notification`** (mata el polling de locks): el de mayor impacto, pero
  requiere infraestructura de push del transport MCP + decisiones de arquitectura
  → conviene validarlas contigo antes. **No empezado.**
- **Plugins `docs` y `deps/security`**: autocontenidos (como `search`); siguiente
  candidato natural de bajo riesgo.
- **Presets `minimal/standard/swarm`**: tiene una decisión de diseño (presets de
  plugins vs de agentes) que es tuya.
- **`outputSchema` Zod por tool**: `structuredContent` ya cubre lo práctico;
  declarar el schema de salida por tool es mecánico y de valor incremental menor.
- **Observabilidad** (`IStatusCollector`/`--verbose`), **skills versionadas**,
  **benchmarks de tokens**, **caos/multiplataforma**: nuevo alcance.
- **R3/R4/R11/R15** (doctor re-lee config, sync/async I/O, auto_work progreso,
  round-context 875 líneas): abiertos por diseño/menores, no bloqueantes.
- **npm publish**: lo ejecutas tú con tu cuenta (`docs/NPM_PUBLISH.md`). No publiqué.

## Estado al cerrar (20:10)
- **Cerrados: todos los FATAL (F1–F5), todos los MUY MAL (M1–M10) y los REGULAR
  accionables (R1·R2·R5–R10·R12·R13·R14).** Más CI, structuredContent y el plugin
  `search`.
- mcp-vertex: **typecheck limpio, 350 tests** (340 + 10 skip).
- Auditoría viva en `docs/proposals/audits/AUDITORIA-UNIFICADA-2026-06-15.md`
  (con todas las filas actualizadas a ✅ y la corrección de la premisa Affairs).
- **Siguiente recomendado**: plugin `docs` (autocontenido, bajo riesgo) o decidir
  el frente de `notification`/presets conmigo.
