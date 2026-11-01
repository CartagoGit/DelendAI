---
id: f00181
title: "Plugin `commit-policy` — autoridad de commit para LLMs en el nombre del humano"
kind: feat
status: done
type: proposal
track: plugins
date: 2026-08-25
shipped-in:
    - 6e72ac3e # chore(commit-policy): scaffold + WIP stub (f00181 deferred)
    - 9daf8e9f # feat(commit-policy): full plugin — resolver, drivers, triggers, tools, public surface
    - b51125bc # fix(commit-policy): schema defaults + restructure specs under tests/src/lib + green tests
    - 1f9fe60e # feat(commit-policy): wire into vertex preset + READMEs (en/es) + project dogfood config
    - aedf9ecb # fix(commit-policy): drop unused preset memberships (only vertex)
---

# f00181 — Plugin `commit-policy` — autoridad de commit para LLMs en el nombre del humano

## Goal

Crear `plugins/commit-policy` como plugin nuevo que envuelve las primitivas de `plugins/git` y aporta tres políticas configurables: (1) **identidad** del committer (modo `explicit | agent | repo | global | env | auto`), (2) **cadencia / disparadores** (`slice | threshold | interval | manual`), y (3) **audit trail** (`none | co-authored-by | body-metadata`). Exponer herramientas `commit_policy_status`, `commit_policy_commit`, `commit_policy_push`, `commit_policy_run` y un hook al ciclo de vida de `plugins/proposals` para commitear automáticamente al cerrar un slice. Soporta dogfooding (un commit del humano por cada slice listo).

## why

Hoy `plugins/git` solo ofrece primitivas: `git_commit` exige Conventional Commits y usa el `user.name`/`user.email` configurado en el repo. No hay capa de política que decida **cuándo**, **cómo de seguido**, ni **en nombre de quién** se commitea — algo crítico en dogfooding donde un agente puede firmar accidentalmente con su identidad de host. La política de identidad configurable resuelve ese riesgo y abre la puerta a flujos como: commit por slice listo, commits atómicos sin contaminar el author, push policy que proteja `main`.

## non-goals

- No sustituye `plugins/git` — solo lo envuelve. Las primitivas `git_commit`/`git_push` siguen siendo la fuente de verdad.
- No implementa firmas GPG / SSH signing. Queda fuera del MVP (puede añadirse como modo extra de `audit` en una propuesta futura).
- No añade un monitor continuo de procesos (no es un watcher daemon) — los disparadores por `interval` se modelan como timers en proceso activados al boot.
- No toca `apps/web` ni la extensión de VS Code en este slice.

## Slices

- global_gate: type

### S1 — Scaffold del plugin + contrato `ICommitPolicyOptions`
- **Status**: pending
- **Files**: `plugins/commit-policy/package.json`, `plugins/commit-policy/plugin.manifest.ts`, `plugins/commit-policy/tsconfig.json`, `plugins/commit-policy/src/lib/contracts/options.ts`
- **Gate**: type
- acceptance:
  - "El paquete `@mcp-vertex/commit-policy` está declarado en el workspace y `bun install` lo reconoce"
  - "`plugin.manifest.ts` usa `definePluginManifest` con tokenBudget, toolPermissions y presets correctos"
  - "`ICommitPolicyOptions` está tipado con discriminated unions para `identity`, `cadence`, `audit`, `push`, `triggers`"
  - "`bun run type` verde (incluso sin tools registradas aún)"

### S2 — Resolvedor de identidad + tool file `commit_policy_status`
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/identity/resolver.ts`, `plugins/commit-policy/src/lib/identity/resolver.spec.ts`, `plugins/commit-policy/src/lib/tools/status-tool.ts`, `plugins/commit-policy/src/lib/tools/status-tool.spec.ts`
- **Gate**: type
- acceptance:
  - "`resolveAuthor(mode, ctx)` resuelve en cada modo (`explicit | agent | repo | global | env | auto`) con prioridad determinista"
  - "`commit_policy_status` devuelve identidad efectiva, modo configurado, disparadores activos y push policy en JSON estructurado"
  - "≥ 8 unit tests cubriendo todos los modos y el fallback `auto`"
  - "`bun run type` y vitest verdes en el paquete"

### S3 — `commit_policy_commit` — override de identidad + trailer de audit configurable
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/commit-driver.ts`, `plugins/commit-policy/src/lib/services/commit-driver.spec.ts`, `plugins/commit-policy/src/lib/audit/trailer.ts`, `plugins/commit-policy/src/lib/audit/trailer.spec.ts`, `plugins/commit-policy/src/lib/tools/commit-tool.ts`
- **Gate**: type
- acceptance:
  - "`commit-policy_commit(message, files, opts)` aplica `--author=<owner>` cuando `identity.mode` lo requiere y rechaza con error tipado si la identidad resuelta es vacía"
  - "`audit.trailer` ∈ {`none`, `co-authored-by`, `body-metadata`} se aplica correctamente, con `agentFormat` configurable (default `${host}/${model}`)"
  - "Delega a la primitiva `commitAndPush` de `@mcp-vertex/core/public` (no duplica lógica de stage/commit)"
  - "≥ 6 unit tests, incluyendo rechazo por identidad vacía y los tres modos de audit"

### S4 — `commit_policy_push` — push policy con ramas protegidas y `force: with-lease` por defecto
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/commit-policy/src/lib/services/push-driver.spec.ts`, `plugins/commit-policy/src/lib/tools/push-tool.ts`, `plugins/commit-policy/src/lib/tools/push-tool.spec.ts`
- **Gate**: type
- acceptance:
  - "`push-driver` rechaza push a `protectedBranches` (default `main`, `master`) con motivo específico"
  - "`force` por defecto a `with-lease`; `never` deshabilita `--force`; `allow` permite `--force`"
  - "Si `push.auto === false`, el push se omite incluso si la tool se llama — solo se ejecuta vía `commit_policy_run` con `trigger=manual`"
  - "≥ 5 unit tests (rechazo por rama protegida, force policy, auto vs manual, hook forzado)"

### S5 — Disparadores: slice / threshold / interval / manual + hook en `proposals_close_slice`
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/triggers/slice-listener.ts`, `plugins/commit-policy/src/lib/triggers/threshold-tracker.ts`, `plugins/commit-policy/src/lib/triggers/interval-timer.ts`, `plugins/commit-policy/src/lib/triggers/manual-trigger.ts`, `plugins/commit-policy/src/lib/triggers/triggers.spec.ts`, `plugins/commit-policy/src/lib/tools/run-tool.ts`
- **Gate**: type
- acceptance:
  - "`slice-listener` se conecta al bus de eventos de `plugins/proposals` y dispara `commit_policy_commit` solo cuando el slice cierra con status `done` o `merged`"
  - "`threshold-tracker` cuenta archivos modificados en la sesión y dispara al alcanzar `cadence.threshold`"
  - "`interval-timer` arma un `setInterval` (en proceso) que dispara cada `intervalMinutes` si hay cambios sin commitear"
  - "`commit_policy_run` ejecuta el disparador manual seleccionado (`slice` | `threshold` | `interval` | `manual`)"
  - "Configuración `cadence.triggers: []` desactiva todos los disparadores automáticos (solo manual)"
  - "≥ 6 unit tests cubriendo cada modo y la prioridad con `manual` siempre disponible"

### S6 — Entry point, i18n (10 idiomas), READMEs, e2e dogfood y gates de validate
- **Status**: pending
- **Files**: `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/src/lib/contracts/i18n-types.ts`, `plugins/commit-policy/README.md`, `plugins/commit-policy/README.es.md`, `plugins/commit-policy/vitest.config.ts`, `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`
- **Gate**: e2e
- acceptance:
  - "`src/index.ts` define el plugin con `definePlugin`, valida opciones con zod y registra las 4 tools via `register(ctx)`"
  - "Claves i18n para los mensajes de error y los outputs visibles en 10 idiomas (`en | es | fr | de | ja | zh | pt | it | ar | hi`) — verificada por la misma pipeline que `extensions/vscode`"
  - "README raíz en inglés + README.es.md en español, con ejemplo dogfood de una sesión real y otro modo para una sesión multi-agente"
  - "`tests/src/e2e/dogfood.spec.ts` simula un ciclo `proposal_slice_close → policy_commit` y valida que el commit resultante tiene `author.name === owner.name` y un trailer `Co-authored-by: <host>/<model>` si está configurado"
  - "Harness de verificación lista el plugin, ejecuta el ciclo `outputSchema.safeParse({})` y reporta `ok / need-input / failed` para las 4 tools"
  - "`bun run validate` verde: typecheck, lint, vitest, no-internal-core-imports, cli-coverage, i18n"

## acceptance

- El paquete `@mcp-vertex/commit-policy` está declarado en el workspace y `bun install` lo reconoce
- `plugin.manifest.ts` usa `definePluginManifest` con tokenBudget, toolPermissions y presets correctos
- `ICommitPolicyOptions` está tipado con discriminated unions para `identity`, `cadence`, `audit`, `push`, `triggers`
- `bun run type` verde (incluso sin tools registradas aún)
- `resolveAuthor(mode, ctx)` resuelve en cada modo (`explicit | agent | repo | global | env | auto`) con prioridad determinista
- `commit_policy_status` devuelve identidad efectiva, modo configurado, disparadores activos y push policy en JSON estructurado
- ≥ 8 unit tests cubriendo todos los modos y el fallback `auto`
- `bun run type` y vitest verdes en el paquete
- `commit-policy_commit(message, files, opts)` aplica `--author=<owner>` cuando `identity.mode` lo requiere y rechaza con error tipado si la identidad resuelta es vacía
- `audit.trailer` ∈ {`none`, `co-authored-by`, `body-metadata`} se aplica correctamente, con `agentFormat` configurable (default `${host}/${model}`)
- Delega a la primitiva `commitAndPush` de `@mcp-vertex/core/public` (no duplica lógica de stage/commit)
- ≥ 6 unit tests, incluyendo rechazo por identidad vacía y los tres modos de audit
- `push-driver` rechaza push a `protectedBranches` (default `main`, `master`) con motivo específico
- `force` por defecto a `with-lease`; `never` deshabilita `--force`; `allow` permite `--force`
- Si `push.auto === false`, el push se omite incluso si la tool se llama — solo se ejecuta vía `commit_policy_run` con `trigger=manual`
- ≥ 5 unit tests (rechazo por rama protegida, force policy, auto vs manual, hook forzado)
- `slice-listener` se conecta al bus de eventos de `plugins/proposals` y dispara `commit_policy_commit` solo cuando el slice cierra con status `done` o `merged`
- `threshold-tracker` cuenta archivos modificados en la sesión y dispara al alcanzar `cadence.threshold`
- `interval-timer` arma un `setInterval` (en proceso) que dispara cada `intervalMinutes` si hay cambios sin commitear
- `commit_policy_run` ejecuta el disparador manual seleccionado (`slice` | `threshold` | `interval` | `manual`)
- Configuración `cadence.triggers: []` desactiva todos los disparadores automáticos (solo manual)
- ≥ 6 unit tests cubriendo cada modo y la prioridad con `manual` siempre disponible
- `src/index.ts` define el plugin con `definePlugin`, valida opciones con zod y registra las 4 tools via `register(ctx)`
- Claves i18n para los mensajes de error y los outputs visibles en 10 idiomas (`en | es | fr | de | ja | zh | pt | it | ar | hi`) — verificada por la misma pipeline que `extensions/vscode`
- README raíz en inglés + README.es.md en español, con ejemplo dogfood de una sesión real y otro modo para una sesión multi-agente
- `tests/src/e2e/dogfood.spec.ts` simula un ciclo `proposal_slice_close → policy_commit` y valida que el commit resultante tiene `author.name === owner.name` y un trailer `Co-authored-by: <host>/<model>` si está configurado
- Harness de verificación lista el plugin, ejecuta el ciclo `outputSchema.safeParse({})` y reporta `ok / need-input / failed` para las 4 tools
- `bun run validate` verde: typecheck, lint, vitest, no-internal-core-imports, cli-coverage, i18n
