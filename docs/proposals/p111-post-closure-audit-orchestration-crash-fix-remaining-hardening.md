---
id: p111
status: in_progress
type: proposal
track: core+proposals
date: 2026-06-20
related:
  - p99 # audit plugin: this proposal records a new finding in its master audit doc
  - p110 # the master audit's §9 explicitly deferred this post-closure backlog to a future proposal
---

# p111 — Post-closure audit: orchestration crash fix + remaining hardening (M25/M28/M32/M45/M46)

## 0. Por qué existe esta propuesta

`docs/proposals/audits/16-06-2026- Auditoría Maestra (Unificada).md`
deja explícitamente como "trabajo de una propuesta futura" el cierre
de los hallazgos abiertos no bloqueantes que quedaron tras p99-p110.
Esta propuesta cierra los acotados, de bajo riesgo, que no requieren
una decisión del usuario (excluye M44) ni tocan acciones externas
(npm publish, merge a `main`).

También documenta dos hallazgos nuevos descubiertos en esta sesión,
verificados contra el código y ya corregidos:

- **M45 — `auto_work`/`continue_proposal` lanzaban un crash de
  validación MCP en vez de un estado idle limpio** cuando no había
  proposals actionable (el caso común tras cerrar p110). Causa: un
  helper `json()` local duplicado que omitía `structuredContent`
  pese a declarar `outputSchema`. Esto es, con alta probabilidad, la
  causa raíz de que agentes orquestadores "se bloqueen sin avanzar"
  — `auto_work` es la tool de "qué hago ahora" que cualquier
  orquestador llama primero.
- **M46 — `docsDir` del propio repo apuntaba a `docs/mcp-vertex`**
  (el default del framework), mientras que los 13 proposals reales
  (`p99`-`p110` + el audit maestro) siempre vivieron en
  `docs/proposals/`. El plugin `proposals` resolvía
  `<docsDir>/proposals` a un directorio casi vacío y desconectado
  (3 borradores abandonados de p104/p106/p107, versiones más viejas
  que las reales). Cualquier agente que usara `create_proposal`/
  `continue_proposal`/`auto_work` "correctamente" escribía en el
  sitio equivocado — exactamente el síntoma reportado ("el mcp no se
  está aplicando en nuestro proyecto").

## 1. Slices

- global_gate: type

### s1 — Documentar M45 y M46 en la auditoría maestra
- files: docs/proposals/audits/16-06-2026- Auditoría Maestra (Unificada).md
- gate: none
- acceptance:
  - Nueva entrada M45 (crash de structuredContent) y M46 (docsDir
    desalineado) bajo una nueva sección, con causa raíz, commits de
    fix y estado.
- status: pending

### s2 — M25: unificar walk() entre search y docs vía helper compartido en core
- files: packages/core/src/lib/shared/walk-allowed-files.ts
- files: packages/core/src/public/index.ts
- files: plugins/search/src/lib/engine.ts
- files: plugins/docs/src/lib/engine.ts
- gate: type
- acceptance:
  - Nuevo `walkAllowedFiles()` en core, exportado desde `public`.
  - `search` y `docs` delegan en él en vez de duplicar la lógica de
    recorrido (mismas exclusiones, mismo guard anti-symlink-cíclico).
  - `bun test plugins/search plugins/docs` verde, sin cambio de
    comportamiento observable.
- status: pending

### s3 — M28: exponer onContention:'fail' de withFileMutex en agent_lock
- files: plugins/proposals/src/lib/tools/agent-lock.tool.ts
- files: plugins/proposals/src/lib/locks/agent-lock-engine.ts
- files: plugins/proposals/tests/src/lib/agent-lock-contention.spec.ts
- gate: type
- acceptance:
  - `agent_lock` acepta `onContention:'fail'|'steal'` y lo reenvía a
    `withFileMutex`.
  - Test de contención: bajo `'fail'`, un claim concurrente contra un
    holder vivo se rechaza (no roba); bajo `'steal'` (default) el
    comportamiento histórico no cambia.
- status: pending

### s4 — M32: tests property-based para frontmatter-parser/redactSecrets + concurrencia de memory
- files: packages/core/tests/src/lib/shared/frontmatter-parser.property.spec.ts
- files: packages/core/tests/src/lib/shared/redact.property.spec.ts
- files: plugins/memory/tests/src/lib/store-concurrency.spec.ts
- gate: type
- acceptance:
  - Specs property-based cubren el round-trip de frontmatter y la
    idempotencia/no-falsos-negativos de `redactSecrets` sobre inputs
    generados.
  - Test de concurrencia de `memory`: N escritores paralelos bajo
    `withFileMutex` no pierden ninguna actualización.
- status: pending

## 2. No-objetivos

- No tocar M44 (migrar `.mcp.json` a `host-config.ts`) — decisión
  pendiente del usuario, explícitamente dejada así en la auditoría.
- No tocar p102 (`keepLegacy` por defecto) — diferida explícitamente
  por el usuario el 2026-06-18.
- No npm publish ni merge `develop→main` — lo hace el usuario.

## 3. Definition of done

`bun run validate` verde en cada slice. Conventional Commits por
slice. El registro `docs/proposals/index.json` (si existe) o el
`sync_proposals` posterior a un reinicio del servidor MCP refleja
`p111` con sus 4 slices.
