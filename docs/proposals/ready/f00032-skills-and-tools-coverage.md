---
id: f00032
status: ready
type: proposal
track: plugins+skills+core
date: 2026-06-21
kind: feat
title: Skills coverage + write-side tools (closes the audit gaps f00028/r00001 do not)
---

# f00032 — Skills coverage + write-side tools (closes the audit gaps `f00028`/`r00001` do not)

## Goal

Cerrar los **dos anillos de cobertura** que el repo todavía tiene después
de las propuestas puntuales `f00028` (plugin depth) y `r00001` (catchall
hardening):

1. **Skills (`/skills/`)** — hoy solo hay 2 globales (`failure-modes`,
   `plugin-authoring`). El plugin `proposals` expone 26 tools y los
   workflows cross-cutting (release, token budgets, multi-agent
   coordination, audit runner) **no tienen playbook**. Un agente no
   tripulado se atasca en `auto_work` ↔ `agent_lock` ↔ `lock-released`
   ↔ `commit-and-push` la primera vez que entra al swarm.
2. **Write-side tools (`git_commit`, `git_push`, `proposals_edit`,
   `proposals_add_slice`, `package_install`, `package_run_script`,
   `quality_run_all`, `fs_read`/`fs_write`)** — el gap más caro del
   repo. Cada sesión termina shelling-out a `git commit`, `bun add`,
   `bun run test` y `cat > file.ts` desde el host. `auto_work` ya
   tiene `maybePersistAfterSlice` (tested) pero **no está expuesto
   como tool**; el engine existe, el surface no.

Esta propuesta es **explícitamente complementaria** a `f00028` y `r00001`:

- `f00028` cubre `search` (rg + context), `memory` (export/import),
  `docs` (docs_search) → **read-side depth en plugins específicos**.
- `r00001` cubre catchalls residuales en outputSchema → **shape
  hardening en plugins existentes**.
- **`f00032` cubre los dos anillos de cobertura que faltan**: (a) la
  guía SKILL.md que un agente necesita para usar el swarm sin
  atascarse, y (b) los 8 tools de write-side que cierran el bucle
  "read en MCP, write en shell" que hoy se rompe 5 veces por sesión.

## Why

- **Evidencia de atasco sin skills**: el plugin `proposals` tiene 26
  tools y `mcp-vertex.config.json` (preset por defecto) solo carga 6
  plugins. Cualquier agente que llega con `--preset=swarm` ve un
  surface de 57 tools y **ningún playbook** que le diga "empieza por
  `overview(compact:true)` → `auto_work` → `continue_proposal mode:plan`
  → `agent_lock claim` → `close_slice`". El `multi-agent-loop`
  knowledge cubre el qué, no el cómo.
- **Evidencia de write-side gap**: `auto_work` ya emite el plan
  `["git add", "git commit -m '...'", "git push --force-with-lease"]`
  en su `OrderedPlan` (ver `plugins/proposals/src/lib/agents/auto-work-persist.ts`)
  pero la ejecución se delega al host shell. El código de commit + push
  existe (probado), solo falta exponerlo. Misma historia con
  `package_install` (lo que hoy es `bun add` shell) y `fs_write` (lo
  que hoy es `cat > file` shell).
- **Coste de oportunidad**: 1 SKILL.md bien escrito cuesta ~30 min
  y elimina 5–10 min de confusión por sesión swarm. ROI positivo a
  partir de la 2ª sesión.
- **Riesgo bajo**: cada slice es ≤ 1 día, opcional (los plugins ya
  funcionan sin las nuevas skills), con tests nuevos por slice y
  `bun run validate` verde como gate.

## Non-goals

- **Reemplazar el shell** — los tools nuevos exponen primitivas, no
  orquestan flujos. `git_commit` toma un mensaje, no compone el
  mensaje. La composición sigue siendo del agente.
- **Sync I/O en hot paths** — eso es `l00008` s1–s2 (ya en ready). Esta
  propuesta usa solo `withFileMutex` + `writeFileAtomic` para todo
  nuevo.
- **Token-budget enforcement a nivel server** — eso es `f00027`
  (ya en ready). Esta propuesta no introduce caps nuevos.
- **Versionado de skills/prompts** — eso es `f00029` (ya en ready).
  Esta propuesta añade SKILL.md estáticos, no un plugin de versionado.
- **Migrar el git plugin de read-only a write-side completo** — solo
  exponemos `git_commit` + `git_push` (las primitivas que `auto_work`
  ya usa); `git_merge`/`git_rebase`/`git_reset` siguen siendo shell.

## Slices

### S1 — Skill `mcp-vertex-proposals-workflow`
- **Files**: `skills/mcp-vertex-proposals-workflow/SKILL.md` (nuevo),
  `skills/mcp-vertex-proposals-workflow/manifest.json` (nuevo, con
  `appliesTo: ['@mcp-vertex/proposals']` y `priority: 'high'` para que
  el host pueda resolverlo sin grep).
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - "El SKILL.md abre con el árbol de decisión
    `overview(compact:true) → auto_work → continue_proposal mode:plan →
    agent_lock claim → close_slice` en ≤ 30 líneas."
  - "Documenta los 3 modos de `auto_work`
    (`none` / `commit` / `commit-and-push`) y cuándo cada uno es
    correcto (default = `none` en CI, `commit` en local single-agent,
    `commit-and-push` solo si el agent_worktree es disposable)."
  - "Documenta la regla 'no `agent_lock status` en loop, esperar
    `lock-released` por `await_lock` o por `notifications/message` push'."
  - "Lista explícita de los 4 'never do' del swarm: (1) poll `agent_lock
    status`; (2) `git push` directo sin `agent_worktree`; (3) editar
    `docs/proposals/index.json` a mano; (4) `sync_proposals` antes de
    cerrar el último slice."
  - "1 caso de smoke: importarlo desde `mcp-vertex_knowledge` no
    devuelve 404."

S1 landed using the current repo-wide skill manifest contract from
`f00029`: `skills/manifest.json` is the single versioned index, so no
per-skill `manifest.json` was added. The new skill intentionally aliases
the existing `proposal-swarm-runner` playbook with a shorter compact
entrypoint matching the proposal name.

### S2 — Skill `mcp-vertex-multi-agent-coordination`
- **Files**: `skills/mcp-vertex-multi-agent-coordination/SKILL.md` (nuevo).
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "Explica la diferencia entre `agent_lock` (write-ownership en
    disco) y `agent_worktree` (branch + worktree aislado) y cuándo
    se usan juntos vs por separado."
  - "Documenta el patrón 'wait-for-notification, don't poll' con
    `await_lock` o `notifications/message` (event: `lock-released`)."
  - "3 ejemplos de sesiones reales (resumidos, no verbatim) con
    2–3 agentes paralelos coordinándose sobre slices disjuntos."
  - "Referencia `round_context` como cache de digests: 'no re-leer
    docs cuyo digest no haya cambiado'."

### S3 — Skill `mcp-vertex-conventional-commits-and-release`
- **Files**: `skills/mcp-vertex-conventional-commits-and-release/SKILL.md`
  (nuevo).
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "Tabla `commit type → semver bump`: `fix:` → patch, `feat:` →
    minor, `feat!:` / `BREAKING CHANGE:` → major, cualquier otro
    tipo → patch (default de `derive-version`)."
  - "Documenta `derive-version` como single source of truth
    (`scripts/derive-version.ts`): nunca bumpear `package.json` a
    mano, siempre `bun run release`."
  - "Diagrama de flujo: dry-run → `--write` → tag → publish →
    matrix `publishOrder` (12 paquetes en orden fijo)."
  - "Riesgos: `fix:` mal clasificado como `feat:` (minor indebido),
    `chore:` rompiendo Conventional Commits (default patch pero CI
    puede fallar el lint)."

### S4 — Skill `mcp-vertex-token-budget-discipline`
- **Files**: `skills/mcp-vertex-token-budget-discipline/SKILL.md`
  (nuevo).
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "Tabla medida de presupuestos actuales (`overview compact ≈318
    tok`, `auto_work ≈257`, `round_context ≈80`; números exactos
    extraídos de `docs/TOKEN-BUDGETS.md`)."
  - "Lista de tools compact-nativas vs verbosas; regla 'compact
    first, then drill'."
  - "Lista de tools a **no** usar en el main thread (delegar al
    `mcp-vertex-orchestrator` subagent): `proposal_board` verbose,
    `state_health` full, `audit_consolidate` sin scope, `search`
    con `maxResults > 50`."
  - "Cómo el e2e `token-budget.spec.ts` falla el build si se rebasa;
    el SKILL.md referencia el test por nombre."

### S5 — Skill `mcp-vertex-status-marker-and-closure`
- **Files**: `skills/mcp-vertex-status-marker-and-closure/SKILL.md`
  (nuevo).
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "Lista los 8 estados canónicos con razón obligatoria vs
    opcional: `HECHO` (opcional), `CAP` (obligatoria), `RE-PIVOT`
    (obligatoria), `CHECKPOINT-REQUIRED` (obligatoria),
    `REPAIR-NEEDED` (obligatoria), `BLOQUEADO` (obligatoria),
    `SIN PROPUESTAS LIBRES` (opcional), `SIN PROPUESTA DE NINGUN
    TIPO` (opcional)."
  - "Reglas de formato: separador ` — ` (em-spaced), ≤120 chars,
    helper `formatCloseMarker` para generarlos; uso de
    `status_marker_close {state, reason}` para generarlos sin
    memorizar el formato."
  - "Patrón de auditoría: el último 20% de cada respuesta del agente
    debe terminar con un close marker válido; `status_marker_validate`
    lo verifica en una sola llamada."

### S6 — Skill `mcp-vertex-audit-runner` (plugin `audit`)
- **Files**: `skills/mcp-vertex-audit-runner/SKILL.md` (nuevo).
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "Workflow: `audit_plan { scope }` → copiar brief canónico →
    pegar en una sesión de modelo fresca → guardar el `.md` con
    nombre `{numAuditoria}-{DD}-{MM}-{YYYY}-{controladorModelo}-{modelo}-{queSeHaAuditado}.md`
    (regla AGENTS.md) → `audit_consolidate` para deduplicar por
    título+archivo."
  - "Rúbrica de 5 bandas (0–4) y 9 dimensiones; el SKILL.md las
    lista para que el agente no invente su propia rúbrica."
  - "Lifecycle: si la auditoría tiene slices/tareas internas → crear
    proposal en `ready/` con `status: ready`; si no → crear en
    `done/audits/` con `status: done` y referenciar las propuestas
    derivadas."
  - "Nota sobre carga: `audit` no está en el preset por defecto;
    activar con `--preset=swarm` o `--plugins=audit`."

### S7 — Skill `mcp-vertex-quality-and-rules-gates`
- **Files**: `skills/mcp-vertex-quality-and-rules-gates/SKILL.md`
  (nuevo).
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "Precedence de scopes (de mayor a menor):
    `options.scopes > validationMatrix.scopes > package.json scripts`."
  - "Trust boundary: los `commands` vienen del host, no del agente;
    `commandPolicy` allow/deny con `deny` gana siempre."
  - "Enforcement modes: `strict` (falla el gate), `mixed` (warning
    + aplica), `none` (no aplica), `proposal` (genera una proposal
    con el plan, no aplica)."
  - "Cuándo `apply_rules` debe crear proposal vs aplicar: si
    `mode: 'proposal'`, siempre proposal; si `mode: 'strict'`, aplica
    in-place; si el target tiene slices en curso, proposal (no
    pisar)."

### S8 — Skill `mcp-vertex-legacy-proposal-migration`
- **Files**: `skills/mcp-vertex-legacy-proposal-migration/SKILL.md`
  (nuevo).
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "Trío de scripts en orden estricto:
    `bun run scripts/migrate-legacy-proposals.ts --apply` →
    `bun run scripts/rewrite-proposal-refs.ts --apply` →
    `bun run scripts/normalize-legacy-proposals.ts --apply` →
    `proposals_sync_proposals` (tool MCP, no script)."
  - "Mapeo de 8-estados legacy → 7-estados nuevo:
    `deferred` → `paused + flag`,
    `pending` → `blocked + self-block`,
    `done` → `done`, etc. (tabla completa en el SKILL.md)."
  - "Por qué `l` (legacy) queda en warning permanente, no error:
    el linter `lint-proposals.ts` lo permite como sufijo para
    propuestas migradas que aún conservan la numeración original."

### S9 — Tool `git_commit` + `git_push` (write-side git)
- **Files**: `plugins/git/src/lib/write-tools.ts` (nuevo), exporta
  `git_commit { message, files?, amend? }` y `git_push
  { remote?, branch?, force?: 'with-lease'|'true'|'false' }`. Reusa
  el motor de `plugins/proposals/src/lib/agents/auto-work-persist.ts`
  (extraer a un helper `commitAndPush` compartido en
  `packages/core/src/lib/shared/git-write.ts`). Registro en
  `plugins/git/src/public/index.ts` con `effects: ['write']` y
  `outputSchema` explícito (no catchall, alineado con `r00001`).
- **Status**: pending
- **Gate**: `bun run validate`
- **Tests**: `plugins/git/tests/src/lib/write-tools.spec.ts` (nuevo)
  con 6 casos: commit simple, commit con `files:` selectivo, commit
  `--amend`, push normal, push `--force-with-lease`, push a branch
  protegida (rechazado).
- **Acceptance**:
  - "El helper compartido `git-write.ts` es importable por
    `auto-work-persist.ts` sin breaking change (la propuesta `f00022`
    ya lo necesita)."
  - "`git_commit` rechaza mensajes vacíos, mensajes que no empiezan
    por Conventional Commit prefix, y `--amend` cuando el último
    commit no es del agente (protección contra pisar trabajo
    paralelo)."
  - "`bun run validate` verde; el test e2e `git-write.spec.ts` corre
    contra un repo temporal sin tocar `.git/index` del workspace."

### S10 — Tool `proposals_edit` + `proposals_add_slice` (mutate proposal body)
- **Files**: `plugins/proposals/src/lib/tools/mutate-tools.ts` (nuevo).
  `proposals_edit { id, field: 'goal'|'why'|'nonGoals'|'acceptance'|'risk', value: string|string[] }`
  (edita una sección del body preservando frontmatter, slices y
  formato). `proposals_add_slice { id, slice: { sliceId, files,
  acceptanceCriteria, gate?, dependsOn? } }` (inserta una slice en
  la sección `## Slices` respetando el patrón de la propuesta
  existente, valida disjointness con `proposals_plan` antes de
  insertar). Ambos con `outputSchema` explícito.
- **Status**: pending
- **Gate**: `bun run validate`
- **Tests**: `plugins/proposals/tests/src/lib/tools/mutate-tools.spec.ts`
  con 8 casos: edit goal (preserva slices), edit acceptance (array),
  add slice (disjoint pass), add slice (overlap → rechazado), add
  slice (dependsOn inválido → rechazado), add slice (id duplicado →
  rechazado), edit field desconocido → rechazado, edit id
  inexistente → rechazado.
- **Acceptance**:
  - "Tras `proposals_edit` o `proposals_add_slice`, el archivo `.md`
    es parseable por el loader de `proposals_*` (golden test con
    `docs/proposals/ready/f00028-plugins-depth-extension.md`)."
  - "`proposals_sync_proposals` re-indexa sin warnings."
  - "`bun run validate` verde."

### S11 — Tool `package_install` + `package_run_script` (deps side)
- **Files**: `plugins/deps/src/lib/write-tools.ts` (nuevo). `package_install
  { name, range?, section?: 'dependencies'|'devDependencies'|'peerDependencies',
  ecosystem?: 'npm'|'bun' }` (envuelve `bun add` con
  `withFileMutex` sobre el `package.json` blanco y `bun.lock`).
  `package_run_script { script, args?, cwd? }` (envuelve `bun run
  <script>` con captura de stdout/stderr y exit code; reusa
  `runCommand` de `@mcp-vertex/core` si existe, si no, crea
  `packages/core/src/lib/shared/run-command.ts` con
  `withFileMutex` para los archivos de lock que el script pueda
  tocar). `effects: ['write','spawn','network']` (opt-in, requiere
  flag en `mcp-vertex.config.json`).
- **Status**: pending
- **Gate**: `bun run validate`
- **Tests**: `plugins/deps/tests/src/lib/write-tools.spec.ts` con
  6 casos: install simple, install con `devDependencies`, install
  con range inválido → rechazado, run script existente, run script
  con exit code ≠ 0 → reportado en output (no thrown), run script
  no existente → rechazado.
- **Acceptance**:
  - "Los nuevos tools están **detrás de un flag** (`plugins.deps.options.allowWrite: true`)
    porque rompen la regla 'agnostic core' si se activan por defecto
    (mutan `package.json` y `bun.lock`)."
  - "`bun run validate` verde; los tests no tocan la red (usan un
    `package.json` fixture y `bun install --offline`)."

### S12 — Tool `quality_run_all` (gate aggregator) + `fs_read`/`fs_write`
- **Files**: `plugins/quality/src/lib/run-all.ts` (nuevo). `run_quality
  scope: 'all'` ya existe parcialmente; este slice lo formaliza: itera
  sobre `get_quality_scopes`, agrega resultados en un único payload
  `{scope, ok, duration, errors[]}`, y devuelve un `summary.ok` global.
  `fs_read { path, range?: [number, number] }` y `fs_write { path,
  content, createDirs?: boolean, atomic?: boolean }` en un nuevo
  módulo `plugins/core/src/lib/shared/fs-tools.ts` (vive en core
  porque es la primitiva que faltaba para que cualquier plugin lea
  o escriba un archivo del workspace sin shell). `effects: ['read']`
  para `fs_read`, `['write']` para `fs_write`. Path validation vía
  `resolveWorkspaceContained` (regla AGENTS.md #5).
- **Status**: pending
- **Gate**: `bun run validate`
- **Tests**: `plugins/quality/tests/src/lib/run-all.spec.ts` (4
  casos: 3 scopes pasan, 1 falla, scope desconocido, scope con
  dependencies circulares). `packages/core/tests/src/lib/shared/fs-tools.spec.ts`
  (6 casos: read simple, read con range, write simple, write con
  `createDirs: true`, write con `atomic: true` confirma
  `writeFileAtomic` + `withFileMutex`, path escape `../` rechazado).
- **Acceptance**:
  - "`run_quality scope: 'all'` ejecuta todos los scopes
    configurados y devuelve un único report; el gate `lint` global
    pasa."
  - "`fs_read` y `fs_write` son importables por `packages/core` y
    por cualquier plugin (re-export desde `packages/core/src/public/index.ts`);"
  - "El e2e `outputschema.spec.ts` (cubierto por `r00001` s4) sigue
    verde — los nuevos tools no introducen catchalls."
  - "`bun run validate` verde."

### S13 — Hygiene: `@mcp-vertex/client` README + `.vsix` no commitido
- **Files**: `packages/client/README.md` (nuevo, ≤ 80 líneas: qué
  es, cómo se usa desde un host externo, ejemplo de 10 líneas,
  link a `packages/client/src/public/index.ts`). `extensions/vscode/.gitignore`
  (modificado: añadir `*.vsix` y `dist/` si no está).
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "`packages/client/README.md` existe y se renderiza en
    `apps/web/src/pages/.../packages-client` (regenerable con
    `bun run site`)."
  - "`git ls-files extensions/vscode/ | grep -c '\\.vsix$'` devuelve `0`."
  - "`bun run validate` verde."

### S14 — Audit close + index sync
- **Files**: `docs/proposals/index.json` (regenerado vía
  `proposals_sync_proposals`).
- **Status**: pending
- **Gate**: `bun run lint:proposals`
- **Acceptance**:
  - "La propuesta aparece en `index.json` con `status: 'ready'`."
  - "Cross-link a `f00028`, `r00001`, `f00029`, `f00027`, `l00008`, `f00022` en
    la sección 'Linked references' del frontmatter."

## Acceptance (global)

- [ ] 8 SKILL.md nuevos en `/skills/` siguiendo el patrón de
      `mcp-vertex-failure-modes/SKILL.md` (frontmatter `appliesTo`,
      árbol de decisión al inicio, sección "never do", ejemplo
      de smoke).
- [ ] 5 tools nuevos (`git_commit`, `git_push`, `proposals_edit`,
      `proposals_add_slice`, `package_install`, `package_run_script`,
      `quality_run_all` aggregator, `fs_read`, `fs_write`) — 9
      total; todos con `outputSchema` explícito, tests
      `*.spec.ts`, `effects: [...]` declarados.
- [ ] `bun run validate` verde tras cerrar todas las slices.
- [ ] `bun run site:strict` no marca ningún tool nuevo como
      "undocumented" (cada nuevo tool tiene entrada en
      `apps/web/src/i18n/ui.ts` para **todos** los idiomas —
      regla AGENTS.md #9).
- [ ] `proposals_sync_proposals` no devuelve warnings.
- [ ] `git ls-files extensions/vscode/ | grep '\\.vsix$'` devuelve vacío.
- [ ] `packages/client/README.md` existe.

## risks and mitigations

- **R1 — `git_commit` + `git_push` rompen la postura read-only del
  plugin `git`**: documentado en el slice s9; el helper vive en
  `packages/core/src/lib/shared/git-write.ts` (shared, no en el
  plugin `git`), y el plugin `git` lo importa solo si
  `options.allowWrite: true` está en `mcp-vertex.config.json`. Por
  defecto, sigue siendo read-only (compatible con el preset
  minimal).
- **R2 — `package_install` rompe la regla 'agnostic core'**: vive
  en el plugin `deps` (no en core), detrás de un flag
  `allowWrite`, y `effects: ['write','spawn','network']` es
  explícito (regla AGENTS.md #1). El host decide si lo activa.
- **R3 — Skills y SKILL.md pueden quedar stale**: la propuesta
  `f00029` cubre el versionado de skills; este slice (s1–s8) crea
  los SKILL.md **estáticos**. `f00029` los migrará a versionados
  cuando se cierre. No hay bloqueador.
- **R4 — `proposals_edit` puede romper el formato `.md`**: el
  test golden con `f00028` (s10) detecta regresiones de parseo;
  `proposals_sync_proposals` post-edit re-indexa y el linter
  `lint-proposals.ts` falla el build si el frontmatter queda
  malformado.
- **R5 — Carga cognitiva de 8 skills nuevas**: la decisión de
  'cuál leer primero' está en el frontmatter `priority`; el
  skill `mcp-vertex-proposals-workflow` (s1) es el primero que
  lee cualquier agente swarm, y desde ahí el SKILL.md apunta
  al resto por nombre. No hay skill "raíz" que crezca
  indefinidamente.

## notes

- `f00028-plugins-depth-extension.md` (search/memory/docs depth) — **complementaria**, no solapada.
- `r00001-harden-catchall-output-schemas.md` (outputSchema shape) — **complementaria**, esta propuesta aplica el patrón a tools nuevos.
- `l00008-plugins-project-state-sync-...` (drift residual) — **complementaria**, esta propuesta usa las primitivas que l00008 s1–s2 estabiliza.
- `f00029-versioned-skills-prompts-and-web-fetch-plugin.md` — los SKILL.md de s1–s8 son estáticos; `f00029` los versiona después.
- `f00027-metrics-longitudinal-regression-gate.md` — los budgets medidos que el skill s4 cita vienen de `docs/TOKEN-BUDGETS.md` (sostenido por f00027).
- `f00022-ide-extension-multi-ide-brand-dashboard.md` — la IDE extension de `extensions/vscode/` consume los nuevos tools; `f00022` se beneficia de `fs_read`/`fs_write` (s12) y de `git_commit` (s9).
- AGENTS.md reglas 1, 3, 5, 8, 9 (agnostic core, async I/O, path
  containment, outputSchema, i18n).
