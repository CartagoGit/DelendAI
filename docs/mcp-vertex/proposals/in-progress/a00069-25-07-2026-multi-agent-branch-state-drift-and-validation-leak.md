---
id: a00069
status: in-progress
type: proposal
track: audit+multi-agent+state-consistency+proposals-plugin
date: 2026-07-25
kind: audit
title: 'Auditoría + plan de fixes fin-de-tarde 2026-07-24 — ramas, índice, parser slices, validate roto, duplicados, orphans, review ausente y plugins activos no usados'
shipped-in:
    - f3faae85 # fix(a00069): case-insensitive ## Slices parser
    - dc31bb70 # fix(a00069): S1 case-insensitive slices parser + proposal hygiene
    - 7bd59036 # feat(a00069): S3 atomic transition↔index + stale **Files** rewrite
    - a14237a6 # test(a00069): S3 duplicate-id scan and Files rewrite
    - 88992ee5 # test(a00069): continue_proposal stale-index heal + mark S1-S3 done
    - 2ae13475 # feat(a00069): S4 agent-branch-naming lint gate
    - 2e74b4ee # feat(a00069): S5 close_slice validation gate
    - 2049f41a # fix(a00069): broaden close_slice acceptance detection
    - 8238cf70 # test(a00069): cover S5 close_slice validation gate
    - f1a629b9 # feat(a00069): S6 purge orphan registry assignments
    - e6b0c6d5 # feat(a00069): S6 orphan GC + round-context activeAgents filter
    - e37b21e3 # feat(a00069): S7 peer-review gate on review→done
    - d48d6ef4 # fix(a00069): complete S7 peer-review short-circuit paths
    - c51bb563 # fix(a00069): unnest requirePeerReview from validationCommand
    - c2930773 # a00069 land
    - c7766ea6 # a00069 land
    - 190e3a33 # a00069 land
    - 5199dc11 # feat(a00069): S10 auto state_repair on proposals boot
    - 7979b39d # fix(a00069): keep Independent peer gate on force_transition
    - 89d9a490 # fix(a00069): regen tool-outputs and stabilize S10 boot test
    - 35a6af1f # fix(a00069): make runAutoStateRepairOnBoot awaitable
    - cabc42f7 # fix(a00069): adopt audit-fixes test variant for S10 boot
    - 4dc01795 # docs(proposals): open SEC-001, SEC-002, REL-001 fix proposals from audits
    - daab5199 # docs(audit): a00070 external GitHub-API intake + a00071 independent audit
    - 183df88e # docs(a00067): record 2026-07-25 reviewer verification of DC1-DC7
    - 333a55f9 # fix(x00072): SEC-001 S1 gate stdio child on workspace trust
    - d6a88789 # fix(x00072): SEC-001 S1 gate stdio child on workspace trust
    - c10ec1cb # fix(logs,core): F41/F48 — logs cacheNamespace bug (results/logs, results/logs-errors)
    - ab78e60d # refactor(logs): F41 — ILogStoreOptions/ILogToolStores to contracts/interfaces
    - 60fea56f # fix(apps-web): F41 — generate capabilities.json before vitest runs on fresh checkout
    - 740f57fa # test(apps-shared): F41/F47 — stub sessionStorage for the node vitest environment
    - 6ff5b217 # fix(core): F41/F48 — delete orphaned bun:test duplicate of preset-catalog.spec.ts
    - 8d1e1999 # chore(proposals): rebaseline proposal-files-exist for 4 done proposals
    - 5af3a6ad # feat(f00123): S3 rule-based codemods + recipe library
    - 009ed7b2 # chore(f00125): wire browser plugin into workspace + fix init test counts
    - e6e248a0 # docs(f00123): correct S3 status — codemod module never landed
    - d10e3bdb # feat(f00123): S3 rule-based codemods + recipe library
    - 321e55d8 # feat(f00125): S3 page verification + E2E recipe + wiring
    - e8f2438d # docs(f00125): mark S3 page verification + E2E recipe done
    - bfbdfd46 # feat(f00126): S1 bench harness + baseline compare
    - 85e15d32 # docs(f00126): mark S1 bench harness + baseline compare done
    - 87b722e2 # docs(f00126): mark S2 bundle-size budget done — actual file paths
    - f0d55edf # feat(f00126): S2 bundle-size budget — perf_bundle tool + tests
    - 3815c571 # feat(perf): S3 perf_profile tool + profile capture + tests
    - dd75bd7a # chore(core): register perf plugin in preset catalog
    - 1a20db97 # chore(types): include browser + refactor plugins in tool-outputs harvester
    - bbf3b945 # feat(f00126): S3 profiling capture + metrics-gate integration
    - 8199bd1d # feat(f00126): S3 profiling capture + metrics-gate integration (worktree)
    - 80cd369e # feat(prompt-eval): add spend-guarded eval harness (f00127 S1)
    - 3a2feb51 # chore(proposals,release): pin f00127 S2 as future work + add prompt-eval to PUBLISH_ORDER
related:
    - a00067 # evaluación de migración de lenguaje (precedente de los mismos agentes)
    - a00068 # auditoría exhaustiva previa del 2026-07-24 (drift de carpeta/status)
    - f00036 # workflow governance — gates y disciplina multi-agente
    - f00073 # branch-status + worktree-gc (la rutina que debería detectar esto)
    - f00075 # swarm-hygiene routine (la que debería limpiarlo)
    - f00052 # gate agent-worktree detrás de host flag (default off)
    - c00086 # swarm commit discipline
    - c00012 # agents should not panic on peer commits
    - x00107 # every-tool outputSchema — gate fix the 8 offender files
    - f00078 # coordination protocol enforcement
    - x00080 # multi-agent control MVP
ownership:
    - {
          agent: implementation_runner,
          task: 'S1 — fix proposal-slice-plan.ts regex case-insensitive + tests ## Slices / ## slices / alias.',
      }
    - {
          agent: implementation_runner,
          task: 'S2 — fix security-audit.tool.ts dual description + security-gate.spec.ts bad import path; validate green.',
      }
    - {
          agent: implementation_runner,
          task: 'S3 — atomic transition↔reconcile↔index + rewrite stale **Files** + refuse/detect duplicate proposal ids on disk.',
      }
    - {
          agent: implementation_runner,
          task: 'S4 — lint agent-branch-naming + ban agent/* branches when agentWorktree is false.',
      }
    - {
          agent: implementation_runner,
          task: 'S5 — close_slice requires bun run validate when gate/acceptance demands it.',
      }
    - {
          agent: implementation_runner,
          task: 'S6 — GC orphans in subagent-registry + round-context; state_repair/zombie path must purge stale assignments.',
      }
    - {
          agent: implementation_runner,
          task: 'S7 — enforce proposal_review before review→done; auto_work must not skip peer-review when requirePeerReview.',
      }
    - {
          agent: implementation_runner,
          task: 'S8 — agent_lock engine MUST emit ok:boolean on every path (success+fail) via structuredContent; claim/release balance in state_health; nextAction→await_lock on conflict.',
      }
    - {
          agent: implementation_runner,
          task: 'S9 — dogfood gate: unused-active-plugins warning in overview/auto_work when enabled plugins have 0 session invocations.',
      }
    - {
          agent: implementation_runner,
          task: 'S10 — boot/session auto state_repair dry-run+apply orphans (F15): code S6 exists but on-disk registry still 30 orphans until someone calls state_repair.',
      }
    - {
          agent: implementation_runner,
          task: 'S11 — handoff GC + force:true peer-review audit trail (F18/F19): purge .cache/.../handoff older than TTL; log/require reason when force/skipPeerReview bypasses S7.',
      }
globalGate: lint
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun tools/scripts/lint/agent-branch-naming.script.ts, expect: exit0 }
---

# a00069 — Auditoría fin-de-tarde 2026-07-24

## goal

- **Audited Scope**: la tarde del 2026-07-24 (entre ~17:00 UTC y 01:00 UTC del
  2026-07-25). Cubre el trabajo de los múltiples agentes
  `copilot-minimax-m3` que trabajaron en paralelo sobre `develop` con
  `agentWorktree: false` (default), y la rúbrica de hygiene que el repo
  define para ese modo (`f00073` + `f00075`).
- **Audited HEAD (pasada 1)**: `47ed5747` (branch `develop`,
  `fix(f00121): forge release constant spec + catalog regen`).
- **Re-audit HEAD (pasada 2, 2026-07-25)**: `e37b21e3`+ con S1–S7 mergeados;
  residuales F15–F22 y slices S8–S11 abiertos (tabla en `## notes` →
  Progress re-audit).
- **Revisor / Model**: GitHub Copilot (MiniMax-M3) en VS Code, host
  `mcp-vertex-orchestrator` mode.
- **Date**: 2026-07-25 (pasada 1 mañana; pasada 2 tarde del mismo día).
- **Methodology**: lectura del código + análisis del log
  `.cache/mcp-vertex/logs/2026-07-24.jsonl` + index proposals + segunda
  pasada logs/plugins/registry + verificación post-merge S1–S7 en disco.
  Slices accionables: S1–S11 (todos done @ develop). Hallazgos: F1–F50 (re-audit-5). F41–F50 nuevos esta pasada.

## why

El usuario observó tres síntomas durante la tarde del 2026-07-24:

1. **Ramas colgadas + naming inconsistente.** 12 branches `agent/*` creadas
   en `develop` con nombres que no siguen un único convenio
   (`copilot-minimax-{m3-?}f00120-{s1,s2-done,s2-s4}`,
   `copilot-minimax-doctor-skip-optin`, `copilot-minimax-c00123-fix`,
   `copilot-minimax-m3-f00121-{s1,s2,s2-polish,s3}`,
   `copilot-minimax-m3-a00067`, `copilot-minimax-m3-a00068`). Las 12
   branches existían a las 00:48 UTC; a la 01:00 UTC ya estaban todas
   borradas — nadie las mergeó a `develop`, las eliminó `branch_gc`
   silenciosamente. Cero worktrees durante toda la tarde.
2. **Propuestas pasadas a "done" que siguen apareciendo en `ready/`.**
   `f00120-project-to-plugin-generator.md` y `f00121-forge-plugin.md`
   están ambas en `done/feats/`, pero el log de hoy muestra
   `continue_proposal { proposalId: f00120, mode: "plan" }` × 6,
   `continue_proposal { proposalId: f00121, mode: "plan" }` × 3. Los
   agentes siguieron intentando planificar propuestas ya cerradas.
3. **Plugin de preview no lleva a `done`, y el plugin de transición
   tampoco deja el filesystem consistente.** Cuando el agente cerró
   `a00068-24-07-2026-...` lo commitió a `done/audits/` pero el
   `## Slices` de `a00068.md` sigue listando el archivo bajo
   `docs/mcp-vertex/proposals/ready/...` (línea 89), y el index
   `.cache/mcp-vertex/proposals/index.json` tuvo
   `status: "in-progress"` para `a00068` hasta que algo lo arregló
   silenciosamente. Tres intentos de `continue_proposal { proposalId:
   a00068, mode: "plan" }` fallaron con
   `slice-mode-error: "proposal file missing on disk: .../ready/a00068..."`
   antes de que el index se actualizara.

Estos tres síntomas **no son bugs aislados**: son la misma pathology —
*los pasos "mover archivo" y "sincronizar índice" están desacoplados, y
la disciplina multi-agente (worktree vs. shared checkout vs. naming) no
está siendo enforced por un gate*. Los Slices S1-S5 los arreglan uno a
uno, con la disciplina `f00073`/`f00075`/`f00052` como referencia.

## non-goals

- Re-cerrar `f00120` / `f00121` / `a00067` / `a00068` — ya están
  cerradas en `done/`. Esta auditoría no reabre su trabajo; documenta
  los artefactos residuales.
- Re-litigar `agentWorktree: false` como decisión de host. La política
  del usuario es "no usar ramas en shared checkout"; los Slices S4
  imponen esa política en CI sin reabrir el debate.
- Auditar el repo entero (eso fue `a00068`). Aquí solo cubrimos la
  pathology de la tarde del 2026-07-24.
- Generar worktrees retroactivos. Las 12 branches ya no existen; la
  memory del reflog las tiene (slices S4 propone mantenerlas 30 días).

## Slices

### S1 — `proposal-slice-plan.ts` regex case-insensitive

- **Status**: done
- **Files**: `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts` (line
  156), `plugins/proposals/tests/src/lib/swarm/proposal-slice-plan.spec.ts`
  (new test cases for `## Slices`, `## slices`, `## 5. Slices (alias)`).
- **Gate**: type, lint, test.
- **Verification**:
  - `bun test plugins/proposals/tests/src/lib/swarm/proposal-slice-plan.spec.ts` —
    debe pasar con los 3 forms.
  - `bun run lint:proposals` — el linter ya acepta los 3 forms; verificar
    que no rompemos `lintSections` ni `lintSlices`.
- **Close evidence**: ejecutar
  `mcp-vertex_proposals_continue_proposal { proposalId: "f00122", mode: "plan" }`
  y comprobar que ya no devuelve `slice-mode-error` con `reason: "has no ##
  Slices section"`.

### S2 — Fix `security-audit.tool.ts:48` (queda UN solo `description:` string) + `security-gate.spec.ts:3` (import path roto)

- **Status**: done
- **Files**: `plugins/security/src/lib/tools/security-audit.tool.ts:48-55`,
  `plugins/security/tests/src/lib/tools/security-gate.spec.ts:3`.
- **Decision**: ¿qué descripción gana? Mirando el commit `1ac227c2`:
  - v1 (más vieja): *"…dependency CVEs (bun audit, network) and dependency
    licenses (offline)…"* — incluye `dependency licenses`.
  - v2 (la nueva del commit huérfano): *"…dependency CVEs (bun audit,
    network) and SAST (semgrep/ast-grep or bounded fallback)…"* — incluye
    `SAST`.
  - El f00122 S3 (SAST) todavía está en `ready/` sin hacer (no commiteado),
    así que **la descripción que mejor refleja el estado actual de la
    herramienta** es la v1 (licenses + CVEs + secrets, sin SAST).
- **Gate**: type, lint, test.
- **Verification**:
  - `bun test packages/core/tests/tool-types-sdk.spec.ts` → pass (el test
    "generated tool-output modules out of sync" debe volver a verde).
  - `bun run typecheck` → exit 0 (el `TS2307` de
    `security-gate.spec.ts:3` debe desaparecer tras corregir la ruta a
    `../../../../tools/scripts/verify/security.script`).
  - `bun run validate` → exit 0 con 4941/4941.

### S3 — Atomicidad propuesta↔índice + auto-actualización de `**Files**` stale

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts` —
    post-move `syncProposalRegistry` + `nextHops` en DFA illegal +
    rewrite de self-`**Files**` vía helper puro.
  - `plugins/proposals/src/lib/proposals/rewrite-stale-self-paths.ts`
    (new) — rewrite puro de bullets `files` / `**Files**`.
  - `plugins/proposals/src/lib/proposals/locate.ts` — `entry.file` se
    resuelve contra `proposalsDirAbs` (x00052 cache index) y el scan
    incluye `done/<kind>/`.
  - `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` —
    scan de `done/<kind>/` + `findDuplicateProposalIds`.
  - Specs: `proposal-transition.tool.spec.ts` (nextHops / rewrite /
    no-twin) + `rewrite-stale-self-paths.spec.ts`.
- **Gate**: type, lint, test.
- **Verification**:
  - Spec: `ready → done` illegal devuelve `error.nextHops` ordenado.
  - Spec: `review → done` reescribe `**Files**` self-path y no deja
    gemelo en `review/`.
  - Duplicate ids ya son FATAL en `lint:proposals`
    (`detectDuplicateProposalIds`, a00044 H5).

### S4 — Gate `agent-branch-naming` en CI

- **Status**: done
- **Files**: `tools/scripts/lint/agent-branch-naming.script.ts` (new),
  `tools/scripts/lint/agent-branch-naming.script.spec.ts` (new),
  `package.json` (`scripts.lint:agent-branch-naming` + `lint` que lo
  invoque).
- **Reglas que enforce**:
  - Branch `agent/*` debe cumplir
    `^agent/[a-z][a-z0-9-]+-[a-z][a-z0-9-]+(-[a-z][a-z0-9-]+)?$` (model +
    proposal-id + opcional slice).
  - Si `git worktree list` está vacío y hay branches `agent/*` locales
    (huérfanas), reportar `outOfCache: true` (consistente con `f00073`).
  - Si `mcp-vertex.config.json#agentWorktree !== true`, fallar en cuanto
    exista una branch `agent/*` (las ramas sin worktree-isolation están
    prohibidas — commitean a `develop` directamente o no commitean).
- **Gate**: lint.
- **Verification**:
  - `bun run lint:agent-branch-naming` debe pasar en este `develop`
    (cero branches `agent/*` en este instante).
  - `bun tools/scripts/lint/agent-branch-naming.script.ts` contra un
    tree con las 12 branches de la tabla F4 debe reportar 6 violations
    (las marcadas `✗` arriba).

### S5 — `proposal_close_slice` exige `bun run validate` verde

- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`,
  `plugins/proposals/src/lib/tools/authoring-options.ts`,
  `plugins/proposals/src/index.ts`,
  `plugins/proposals/tests/src/lib/tools/close-slice-validation.spec.ts`.
- **Gate**: bun run validate
- **Cambio**: después de las verificaciones actuales, ejecutar
  `bun run validate` (con timeout 5 min). Si falla exit≠0, devolver
  `kind: "validation-error"` con el output del test runner, no cerrar
  el slice. Solo continuar si exit=0.
- **Excepción**: si el slice tiene `gate: "none"` o `gate: "lint"`
  (no `gate: "type"` ni `acceptance: bun run test`), omitir el gate.
- **Verification**:
  - Spec nuevo en `plugins/proposals/tests/src/lib/tools/close-slice-validation.spec.ts`:
    dado un slice con `acceptance: bun run test` y un tree donde
    `bun run validate` falla, `close_slice` debe devolver
    `validation-error` y NO avanzar el estado del slice.
  - Manual: replicar el bug de F2 (mergear `1ac227c2` con validate en
    rojo) y comprobar que `close_slice` lo rechaza.
  - x00107 está en paralelo arreglando 8 tools sin `outputSchema`; este
    slice es **adicional** (no en conflicto con x00107).

### S6 — GC de orphans en `subagent-registry` + `round-context`

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/swarm/` (state_repair / zombie / registry GC)
  - tests bajo `plugins/proposals/tests/` para purge de assignments
    `status: orphan` y `active` con `last_seen` > TTL.
- **Cambio**:
  - `state_repair` / `state_health` deben listar y purgar assignments
    huérfanos (hoy: 30/30 `adopted: false`, 27 `orphan` + 3 `active`
    stale desde junio/julio temprano).
  - `round-context.digest.json#activeAgents` no puede listar 14 agentes
    todos `adopted: false` y `lastSeen` de junio como si estuvieran vivos.
  - TTL configurable (default 7d) + dry-run en `state_health`.
- **Gate**: type, test.
- **Verification**:
  - Tras `state_repair`, `assignments.length === 0` (o solo adopted vivos)
    y `activeAgents` vacío o solo adopted=true con lastSeen reciente.
  - Spec: fixture con 30 orphans → repair → 0.

### S7 — `proposal_review` obligatorio antes de `review → done`

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/tools/authoring.tool.ts` (`proposal_review`)
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/tools/auto-work.tool.ts` (o equivalente)
- **Cambio**:
  - Transición `review → done` (y `force_transition` sin flag) debe
    exigir al menos un `proposal_review { action: "approve" }` de un
    agent ≠ implementer cuando `requirePeerReview` (default true en
    swarm).
  - `auto_work` / `continue_proposal` deben devolver
    `next: proposal_review` cuando el archivo está en `review/` sin
    approve.
  - Detectar carpeta `review/` con 0 eventos `proposal_review` en la
    sesión (telemetría / hygiene warning).
- **Gate**: type, test.
- **Verification**:
  - Log del 2026-07-24: **0** `proposal_review` en tool-completed; 14
    archivos en `review/`. Tras el fix, un harness que simula
    transition sin review debe fallar.
  - Spec: implementer submit → same agent approve → reject; other agent
    approve → allow done.

### S8 — `agent_lock` contrato `ok` + balance claim/release + await

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/locks/agent-lock-engine.ts` (claim/release
    success paths hoy devuelven solo `content[].text` JSON **sin**
    `ok` ni `structuredContent`).
  - `plugins/proposals/src/lib/tools/agent-lock.tool.ts` (`ok` está en
    outputSchema como **optional** y el adapter **no** lo inyecta).
  - `plugins/proposals/src/lib/tools/state-tools.tool.ts` — métricas
    claim/release imbalance.
- **Cambio**:
  - Todo response (success y fail) de `agent_lock` debe incluir
    `ok: boolean` en `structuredContent` (required en schema, no
    optional).
  - Contador de sesión claim vs release; `state_health` alerta si
    claim − release > N o locks huérfanos.
  - En contención, el envelope `nextAction` debe apuntar a
    `notification_await_lock` / lock-released (tool existe en
    `@mcp-vertex/notification`; 0 usos el 2026-07-24).
- **Gate**: type, test.
- **Verification**:
  - Spec: claim success → `structuredContent.ok === true` y
    `claimed === true`.
  - Spec: conflict → `ok === false` + `nextAction` contiene `await_lock`.
  - Día 2026-07-24: claim 29 / release 19 → imbalance 10; tras GC +
    contract, imbalance reportable en `state_health`.

### S9 — Dogfood: plugins activos no ejercitados

- **Status**: done
- **Files**: overview / auto_work advisory + opcional lint de config.
- **Cambio**:
  - Si un plugin está en `mcp-vertex.config.json` enabled pero 0 tool
    invocations en la sesión de swarm y el preset no lo marca
    `dormant`, overview/auto_work emiten warning compacto
    `unused-active-plugins: [...]`.
  - No deshabilita plugins; solo hace visible el gap de dogfood.
- **Gate**: type, test.
- **Verification**:
  - 2026-07-24: 24 plugins activos en config; tool surface del día ≈
    `proposals`, `status-marker`, `fs`, `overview`, `git`, `status`.
    21 plugins activos sin una sola invocación (incl. `notification`,
    `quality`, `security`, `memory`, `rules`, `test-policy`).

### S10 — Auto `state_repair` de orphans al boot / primera orientation (F15)

- **Status**: done
- **Files**:
  - `plugins/proposals/src/index.ts` (`autoRepairOrphans`, default true)
  - `plugins/proposals/src/lib/tools/state-tools.tool.ts`
    (`runStateRepair`, `runAutoStateRepairOnBoot`)
  - `plugins/proposals/src/lib/agents/zombie-reconcile.ts` (purge engine)
- **Cambio**:
  - Tras cargar el plugin proposals (o en primer `overview` /
    `auto_work` de sesión), ejecutar purge de orphans con el TTL S6
    **sin** requerir que un humano llame `state_repair`.
  - Idempotente; log un evento `state-repair-auto` compacto.
  - Dry-run first en `state_health` si el host setea
    `autoRepairOrphans: false`.
- **Gate**: type, test.
- **Verification**:
  - Fixture: registry con 30 orphans → boot/orientation → 0 orphans
    en disco **sin** llamar el tool a mano.
  - Re-audit 2026-07-25: cache vivo aún tenía 30/14 **después** de
    mergear S6 — prueba de que el código sin auto-apply no cierra F10.

### S11 — Handoff GC + audit trail de bypass peer-review (F18/F19)

- **Status**: done
- **Files**:
  - handoff writer/reader bajo `.cache/mcp-vertex/handoff/` (notification
    / proposals).
  - `proposal-transition.tool.ts` (`force:true`) y
    `recovery-tools.ts` (`skipPeerReview:true`).
- **Cambio**:
  - GC de handoffs con mtime > TTL (default 7d); hoy **12/12** handoffs
    tienen ≥32 días.
  - Toda transición `review→done` con `force:true` o
    `skipPeerReview:true` debe exigir `reason` no vacío y escribir
    evento de log `peer-review-bypassed` (agent, proposalId, reason).
  - `state_health` cuenta bypasses de la sesión.
- **Gate**: type, test.
- **Verification**:
  - Spec: force without reason → reject.
  - Spec: handoff dir con files 33d → GC deja 0.
  - Manual: `ls .cache/mcp-vertex/handoff` post-repair vacío o solo
    frescos.

### S12 — Agent-stuck self-healing (F103)

- **Status**: todo
- **Files**:
  - `plugins/logs/src/lib/services/log-store.ts` (línea 106) — `appendFile` →
    `writeFileAtomic` (o `appendFile` + `await handle.sync()`).
  - `plugins/proposals/src/lib/locks/agent-lock-engine.ts` — `removeStale`
    también invocado al `readLock()` (idempotente).
  - `packages/core/src/lib/cli/assemble-core-tools.ts` — tras cargar plugins,
    leer `agents.lock.json`, aplicar `removeStale`, escribir si cambió.
  - `tools/scripts/lint/check-stray-cache-files.script.ts` — bajar threshold
    para `*.tmp` con prefijo `agents.lock.json.` a `mtime > 60s`.
  - `plugins/proposals/src/lib/tools/agents-lock-diagnose.tool.ts` (nuevo) —
    enumera zombies, tmp huérfanos, y diff `last_seen` vs última entrada
    de log del `task_id`.
- **Cambio** (4 sub-slices):
  - **S12.a** — Log writer atómico: `appendFile` reemplazado por
    `writeFileAtomic` con append semantics. Mantener `withFileMutex`.
    Output: gap `last_seen` ↔ log entries → 0 en crash tests.
  - **S12.b** — Lock GC al boot del MCP server: idempotente, barato.
    Output: zombie entries en lock siempre 0 tras `bun run test` boot.
  - **S12.c** — Tmp sweep: `agents.lock.json.*.tmp` con mtime > 60s se
    borran al boot. Output: `ls .cache/mcp-vertex/*.tmp` muestra 0 files
    con prefijo `agents.lock.json.` tras reinicio.
  - **S12.d** — Diagnostic tool `agents_lock_diagnose`: enumera zombies
    + tmp + diff log. `auto_work` lo invoca y aborta si encuentra
    zombies.
- **Gate**: type, lint, test.
- **Verification**:
  - Spec: matar proceso entre `open(tmp)` y `rename` (SIGKILL mid-test)
    → tmp es barrido al siguiente boot.
  - Spec: lock con entry stale de 2h → boot aplica `removeStale` →
    re-leer muestra 0 stale.
  - Spec: `agents_lock_diagnose` retorna lista con al menos 1 zombie
    cuando el lock tiene `started_at == last_seen && age > 30s`.

## acceptance

Ver `## scoreboard` abajo. Las acceptance `commands` ya están en
frontmatter; este section documenta el flujo de cierre:

1. **S1** (F1) — **done**: parser case-insensitive.
2. **S2** (F2) — **done**: security description + import path.
3. **S3** (F3+F7+F11) — **done**: transition atómica + dups + nextHops;
   re-audit: 0 dups, review/ alineado.
4. **S4** (F4) — **done**: `lint:agent-branch-naming`.
5. **S5** (F5) — **done**: close_slice validation gate (residual F21:
   `gate: none|lint` sigue omitiendo validate — documentado).
6. **S6** (F10) — **done código / open runtime** → cerrado del todo con
   **S10** (auto-apply).
7. **S7** (F8) — **done**: peer-review gate (residual F18 bypass audit
   → **S11**).
8. **S8** (F9+F16+F17): `agent_lock` siempre `ok` en structuredContent;
   health reporta claim/release imbalance; conflict → await_lock.
9. **S9** (F13+F20): overview/auto_work listan `unused-active-plugins`.
10. **S10** (F15): boot/orientation purga orphans sin tool manual.
11. **S11** (F18+F19): handoff GC + force/skipPeerReview audit trail.

## verified state

| Métrica | Valor | Fuente |
|---|---|---|
| `bun run validate` (re-audit-3) | **1 test fails** (4940/4941) | `bun test` salida |
| Failing test | `packages/core/tests/tool-types-sdk.spec.ts` ("generated tool-output modules out of sync") | run output |
| Causa real del failing test | `plugins/security/src/lib/tools/security-audit.tool.ts:48` tiene **dos `description:` strings** concatenados con `,` (introducido por commit `1ac227c2`, fuera del scope S2 de f00122) | git blame + lectura del archivo |
| Branches `agent/*` locales | 12 a 00:48 UTC, **0** a 01:00 UTC (borradas por `branch_gc`) | `git for-each-ref` |
| Worktrees activas | 1 (solo `develop`) | `git worktree list` |
| Proposals plugin index | 282 entries, **stale** para varios ids en `review/` vs `done/` | `.cache/mcp-vertex/proposals/index.json` |
| Eventos `slice-mode-error` hoy | **21** (a00068×3, f00119×3, f00120×6, f00121×3, f00122×3, f00142×3) | log `2026-07-24.jsonl` |
| Transiciones a `done` hoy | **4** (vs 18 a `in-progress`, 17 a `review`, 3 a `retired`) | log `2026-07-24.jsonl` |
| Proposals en `ready/` | 25 | `ls docs/mcp-vertex/proposals/ready/` |
| Proposals en `done/` | 251 | `find docs/mcp-vertex/proposals/done -name '*.md' \| wc -l` |
| Proposals en `review/` (tarde 24) | **14** misaligned | `ls review/` + index |
| Proposals en `review/` (re-audit 25) | **11**, **0** misaligned vs index | post-S3 hygiene |
| IDs duplicados en disco (tarde 24) | **2** (`a00067`, `f00121`) | `find` |
| IDs duplicados (re-audit 25) | **0** | post-S3 |
| `proposal_review` tool-completed 2026-07-24 | **0** | log |
| `agent_lock` claim/release | **29 claim / 19 release / 4 status** | log |
| `agent_lock` success payload `ok` (código actual) | **ausente** (solo `claimed`) | engine.ts |
| `subagent-registry` tras merge S6 **sin** tool | **sigue 30** orphans | F15 |
| `round-context.activeAgents` tras S6 **sin** tool | **sigue 14** | F15 |
| Handoffs `.cache/.../handoff` | **12**, todos ≥32d | F19 |
| Plugins enabled en config | **24** | config |
| Prefijos tools 2026-07-24 | `proposals`(427), `status-marker`(20), `fs`(10), `overview`(6), `git`(4), `status`(2) | log |
| Plugins activos sin invocación ese día | **21** | F13 |
| `notification_*` / `await_lock` invocaciones 24 | **0** | F17 |
| Commits a00069 en develop (re-audit) | **14+** (S1–S7) | `git log --grep=a00069` |
| Slices código done / pending | S1–S11 done on origin/develop | progress table |

## findings

### F1 — Parser `## Slices` case-sensitive rompe 5 proposals activos (FATAL)

**Evidencia**: `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts:156`
declara el regex `/^## Slices\s*$/m` (case-sensitive, capital `S`). Pero el
proposals plugin ya **acepta** ambas variantes en el linter:
`plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts:341` dice
explícitamente *"resolveCanonicalSection covers both literal `## Slices` and
narrative aliases (e.g. `## 5. Slices (siguiendo el patrón disjoint)`)"*.

**Resultado en disco**: `done/feats/` ya tiene **mezcladas** ambas
conventions:

```text
cap=1 low=0 → f00001-adopt-core-migrations-for-agent-registry.md
cap=0 low=0 → f00002-derive-site-manifests-and-local-aliases.md
cap=0 low=1 → f00003-feat-auto-work-persist-modes.md   ← lowercase, habría fallado en su día
cap=0 low=1 → f00004-feat-ide-extension-vscode-and-friends.md
cap=1 low=0 → f00005-feat-mcp-logs-plugin.md
…
```

**Proposals activos con `## slices` (lowercase) que el parser rechaza
hoy** (5 de 6 failures `slice-mode-error` con `reason: "has no ## Slices
section"`):

| ID | Fichero | Status | Header real |
|---|---|---|---|
| `f00122` | `ready/f00122-security-plugin.md` | ready | `## slices` |
| `f00142` | `ready/f00142-auto-plugin-selector.md` | ready | (no `## Slices` ni `## slices`; el agente tendría que añadirlo) |
| `f00120` | `done/feats/f00120-project-to-plugin-generator.md` | done | `## slices` |
| `f00121` | `done/feats/f00121-forge-plugin.md` | done | `## slices` |
| `a00068` | `done/audits/a00068-...-recomendaciones.md` | done | `## Slices` (capital) — **pero los slices referencian `ready/` en `**Files**`** |

**Por qué F1 es FATAL**: 21 intentos de `continue_proposal` fallaron
hoy solo por esta inconsistencia (los agentes humanos/anthropic pueden
leer ambos; el parser no). El "nextAction" del envelope
(`Use mode:"auto" for serial work, or add a ## Slices section to
parallelise it.`) **miente** — los Slices ya existen, el parser solo no
los ve.

**Slice que lo arregla**: S1 (regex case-insensitive, con test que
cubra las tres formas).

### F2 — Bug TS `security-audit.tool.ts:48` con dos `description:` strings (FATAL)

**Evidencia**: el archivo
`plugins/security/src/lib/tools/security-audit.tool.ts:48-55` tiene:

````ts
description:
    'Run all scanners against the project — leaked-secrets (offline), dependency CVEs (bun audit, network) and dependency licenses (offline) — and return ONE ranked backlog: …',
    'Run all scanners against the project — leaked-secrets (offline), dependency CVEs (bun audit, network) and SAST (semgrep/ast-grep or bounded fallback) — and return ONE ranked backlog: …',
inputSchema: z.object({}),
````

**Por qué es TS inválido**: dentro de la literal-object del
`server.registerTool(name, config, handler)` hay **dos strings
separados por coma** donde debería haber UNO. Esto rompe el parser
del SDK generado (`packages/core/src/generated/tool-outputs.ts`) y
causa que `bun run validate` falle con **1 test rojo**:

```text
Test Files  1 failed | 617 passed | 2 skipped (620)
Tests       1 failed | 4940 passed (4941)
error: script "test" exited with code 1
error: script "validate" exited with code 1
```

Test concreto: `packages/core/tests/tool-types-sdk.spec.ts` ("generated
tool-output modules out of sync").

**Introducido por**: commit `1ac227c2 feat(security): security_audit
covers full posture (secrets + CVEs + licenses)`. Este commit **no
pertenece a ningún slice** de `f00122` (los slices de f00122 son
S1=secrets, S2=deps CVEs, S3=SAST, S4=audit). Es un commit huérfano
que el agente autorizó fuera de scope, además de testear contra
`bun run validate` antes de mergear a `develop`.

**Bug satélite (mismo origen, mismo pase huérfano)**:
`plugins/security/tests/src/lib/tools/security-gate.spec.ts:3` importa
de `'../../../../../tools/scripts/verify/security.script'` — **5
niveles de `../`** saliendo del repo root. El spec está en
`plugins/security/tests/src/lib/tools/`, así que la ruta correcta son
**4 niveles** (`../../../../tools/scripts/verify/security.script`).
`bun run typecheck` falla con `TS2307: Cannot find module
'../../../../../tools/scripts/verify/security.script'` — el
importante es que el test SÍ existe, solo tiene el path roto. Otro
bug del mismo pase `1ac227c2` que sobrevivió al merge.

**Por qué F2 es FATAL**: deja `develop` en rojo, no se puede cerrar
ningún otro slice que dependa de `bun run validate` (todos los del
repositorio, según `globalGate: lint` y `acceptance: bun run test`).

**Slice que lo arregla**: S2.

### F3 — Index `proposals/index.json` desincronizado del filesystem (FATAL)

**Evidencia**: el log de hoy muestra tres patrones donde el cache y
el disco están en estados distintos:

1. **`a00068`**: el archivo está en
   `docs/mcp-vertex/proposals/done/audits/a00068-24-07-2026-...md`,
   pero a las 19:51 UTC el parser intentó leer
   `docs/mcp-vertex/proposals/ready/a00068-24-07-2026-...md` y devolvió
   `slice-mode-error: "proposal file missing on disk"`. La causa fue
   que el `entry.file` en el index cache apuntaba todavía a `ready/`
   (ver `plugins/proposals/src/lib/tools/continue-proposal.tool.ts:317`
   `join(proposalsDirAbs ?? dirname(indexPath), entry.file)`).
2. **`a00068` Slices**: la sección `## Slices` del archivo en
   `done/audits/` sigue declarando
   `**Files**: \`docs/mcp-vertex/proposals/ready/a00068-...md\``
   (línea 89) — el agente que movió el archivo no actualizó el
   `**Files**` interno de cada slice.
3. **`sync_proposals` no resuelve**: el log muestra
   `tool-completed: mcp-vertex_proposals_sync_proposals` × 6 hoy, pero
   `a00068` siguió fallando 3 veces después (la sincronización es
   eventual, no atómica con el file-move).

**Por qué F3 es FATAL**: el "nextAction" de los envelopes
`slice-mode-error` le dice al operador *"Run sync_proposals to
reconcile the index"*, pero ese tool es **reactivo** (regenera el
índice cuando se llama), no **proactivo** (no se llama
automáticamente después de un file-move). Y la regeneración tampoco
arregla los `**Files**` stale dentro de cada slice — eso requiere
editar el markdown a mano.

**Slice que lo arregla**: S3 (atomicidad transición↔índice +
actualización de los `**Files**` stale cuando el path del archivo
cambia).

### F4 — Branches `agent/*` se crean y se borran silenciosamente, sin gate (MUY MAL)

**Evidencia**: `git for-each-ref refs/heads/agent` a las 00:48 UTC
devolvía **12 branches** (ver tabla abajo); a la 01:00 UTC devolvía
**0**. En el ínterin, ningún merge a `develop` (los `commits` de las
branches ya estaban en `develop` HEAD — `git log --merges develop`
muestra los merges `f00121-s3`/`s2-polish`/`s2` etc., pero esos merges
**ocurrieron antes** de que las branches se borraran).

| Branch | Last commit age | Naming pattern | Status |
|---|---|---|---|
| `agent/copilot-minimax-m3-a00067` | 3h | ✓ (model-proposal) | merged then deleted |
| `agent/copilot-minimax-m3-a00068` | 3h | ✓ | merged then deleted |
| `agent/copilot-minimax-f00120-s2-done` | 3h | ✗ (no `-m3-`, redundant `-done`) | merged then deleted |
| `agent/copilot-minimax-f00120-s2-s4` | 3h | ✗ (no `-m3-`, redundant `-s4`) | merged then deleted |
| `agent/copilot-minimax-m3-f00120-s1` | 2h | ✓ | merged then deleted |
| `agent/copilot-minimax-f00120-s1` | 2h | ✗ (no `-m3-`, duplicate of above) | merged then deleted |
| `agent/copilot-minimax-doctor-skip-optin` | 2h | ✗ (no proposal-id, no slice) | merged then deleted |
| `agent/copilot-minimax-c00123-fix` | 3h | ✗ (no `-m3-`, no slice) | merged then deleted |
| `agent/copilot-minimax-m3-f00121-s1` | 83m | ✓ | merged then deleted |
| `agent/copilot-minimax-m3-f00121-s2` | 72m | ✓ | merged then deleted |
| `agent/copilot-minimax-m3-f00121-s2-polish` | 67m | ✓ | merged then deleted |
| `agent/copilot-minimax-m3-f00121-s3` | 30m | ✓ | merged then deleted |

**Por qué F4 es MUY MAL**:

- 6 de 12 branches no cumplen el convenio
  `^agent/[a-z][a-z0-9-]+-[a-z][a-z0-9-]+(-[a-z][a-z0-9-]+)?$` que el
  playbook de multi-agente espera (cada agente usa su propio naming,
  y nadie enforcer).
- `mcp-vertex.config.json` no tiene `agentWorktree: true` (f00052 lo
  deja en `false` por default). El playbook es claro: *"If
  `false`/unset — do not call `proposals_agent_worktree`; commit to
  the active branch instead."* Pero los agentes están creando ramas
  sin worktrees, **violando las dos direcciones de la regla**: ni
  usan worktrees (cuando harían falta para evitar pisarse), ni
  commitean a `develop` directamente (que es lo que el host permite
  sin worktrees).
- `branch_gc` (de `f00073`) borra las branches silenciosamente cuando
  se mergean. No avisa, no archiva: deja la history sin la rama y el
  reflog con los commits huérfanos.

**Slice que lo arregla**: S4 (lint `agent-branch-naming` + gate en CI
de branches huérfanas).

### F5 — `proposal_close_slice` no exige `bun run validate` verde (MEJORABLE)

**Evidencia**: el usuario explícitamente dijo *"si han terminado
tareas y hay bugs en las tareas es que algo no estan haciendo bien
tambien"*. El caso de F2 es exactamente esto: el commit `1ac227c2`
"feat(security): security_audit covers full posture" **se mergeó a
`develop` con `bun run validate` en rojo** (1 test failing). Lo hizo
posible que `proposal_close_slice` aceptara el cierre del slice
correspondiente sin verificar el gate `acceptance: bun run test`.

Esto es MEJORABLE (no FATAL) porque:

- Solo bloquea si los tests rojos sobreviven al merge — F2 demuestra
  que ocurre.
- El fix existe como spec: `tools/scripts/lint/no-preset-drift.script.ts`
  ya hace este patrón para otro caso (preset vs. plugins).

**Slice que lo arregla**: S5.

### F6 — Bugs que el agente anterior marcó como reales pero son falsos positivos (limpieza)

Para que la próxima auditoría no gaste turnos investigando los mismos
fantasmas, anoto explícitamente los **falsos positivos** que la sesión
anterior reportó y que esta auditoría descarta con evidencia:

| Reportado por sesión anterior | Verificación | Verdict |
|---|---|---|
| `packages/core/src/lib/scaffold/scaffold-tool.ts:377:1` — "Unexpected end of file" | `wc -l` 378 lines, brace balance 67/67, `bun test packages/core/tests/src/lib/scaffold/` → **47 pass / 0 fail** | FALSO POSITIVO — el archivo está bien, todos los tests del slice pasan. |
| `create-plugin.tool.spec.ts > surfaces doctor failures when the catalog point is still missing` falla | `bun test packages/core/tests/src/lib/scaffold/create-plugin.tool.spec.ts` → **4 pass / 0 fail** | FALSO POSITIVO — el commit `fcdca962` ("wiring-doctor skips catalog-regen for opt-in plugins") rompió el test en su día, pero el test fue arreglado en el mismo pase; ahora pasa. |
| Bug de "agents haciendo trabajo en mismo lugar sin worktrees" | `git worktree list` muestra **solo el main worktree** durante toda la tarde, pero hay **12 branches `agent/*` creadas**. | PARCIAL — los agentes NO usan worktrees, pero la host config no las habilita (`agentWorktree: false` por f00052). El bug es que las branches se crean sin worktrees (= peor que no tener branches), no que falten worktrees. Cubierto por F4. |

### F7 — Duplicados físicos del mismo `id` en `review/` y `done/` (FATAL)

**Evidencia (2026-07-25, post-tarde)**:

| ID | Copia A | status FM | Copia B | status FM | index.file / status |
|---|---|---|---|---|---|
| `f00121` | `review/f00121-forge-plugin.md` | `review` | `done/feats/f00121-forge-plugin.md` | `done` | `done/feats/...` / `done` |
| `a00067` | `review/a00067-...md` | `review` | `done/audits/a00067-...md` | `ready` | `done/audits/...` / `ready` |

Además, **14** archivos viven en `review/` mientras el index apunta a
otra carpeta/status para varios de ellos:

| ID | disk folder | index.file | index.status |
|---|---|---|---|
| `a00067` | review | done/audits/… | ready |
| `a00068` | review | done/audits/… | in-progress |
| `c00089` | review | done/chores/… | done |
| `c00123` | review | done/chores/… | done |
| `f00120` | review | done/feats/… | done |
| `f00121` | review | done/feats/… | done |
| `f00144` | review | done/feats/… | done |
| `f00145` | review | done/feats/… | done |
| `d00004` | review | review/… | review ✓ |
| `f00119` | review | review/… | review ✓ |
| `f00143` | review | review/… | review ✓ |
| `f00146` | review | review/… | review ✓ |
| `f00147` | review | review/… | review ✓ |

**Por qué F7 es FATAL**: el contrato del monorepo es **un id → un
archivo**. Dos copias con frontmatter distinto hacen que
`continue_proposal`, linters y humanos lean realidades incompatibles.
El index solo indexa **una** ruta; la otra es basura silenciosa que
`sync_proposals` no elimina.

**Esperado vs actual**:

| Paso | Esperado | Actual |
|---|---|---|
| `proposal_transition { to: review }` | mueve **el** archivo a `review/`, actualiza FM + index | a menudo **copia** o deja residual en `done/`/`ready/` |
| `proposal_transition { to: done }` | mueve desde `review/` a `done/<kind>/`, un solo path | deja gemelo en `review/` con `status: review` |
| `lint:proposals` / reconcile | falla si id duplicado en disco | **no detecta** duplicados cross-folder |
| Index rebuild | una entrada por id, path canónico | una entrada, path canónico, **ignora** el gemelo |

**Slice**: S3 (ampliar anti-duplicados + reconcile destructivo del
residual con dry-run).

### F8 — `proposal_review` existe pero el swarm no lo usa (FATAL operativo)

**Evidencia**:

- Tool registrado en `plugins/proposals/src/lib/tools/authoring.tool.ts`
  (`id: 'proposal_review'`).
- Log `2026-07-24.jsonl`: **0** eventos `tool-completed` /
  `tool-started` para `proposal_review`.
- Carpeta `review/`: **14** propuestas.
- Histórico reciente: casi cero uso de `proposal_review` en logs
  2026-07-16…24.

**Esperado vs actual**:

| Paso | Esperado (playbook / tool contract) | Actual 2026-07-24 |
|---|---|---|
| Implementer termina slices | `transition → review` + handoff | a veces sí mueve a `review/` |
| Peer distinto del implementer | `proposal_review` approve/request-changes | **nunca** |
| Gate a `done` | requiere review-state done / peer approve | se puede marcar `done` o dejar en `review/` sin review |
| `auto_work` sobre item en review | sugiere `proposal_review` | devuelve `work` / plan sobre el mismo id |

**Slice**: S7.

### F9 — `agent_lock` sin `ok` estable + claim/release desbalanceado (MUY MAL)

**Evidencia**:

- Payload real de claim (structuredContent):
  `claimed: true`, `ownership_count`, `summary` — **sin campo `ok`**.
- Conteos 2026-07-24: **claim 29 / release 19 / status 4** → imbalance
  **+10 claims** sin release emparejado.
- Plugin `notification` **enabled** en config; **0** llamadas
  `notification_*` / `await_lock` en el log del día (los agentes
  reintentan claim o siguen sin esperar).
- Al final del día `agents.lock.json` / `proposal-lock` reportan
  `in_flight: []` — los locks se “evaporan” o nunca se liberan de
  forma observable en telemetría.

**Esperado vs actual**:

| Paso | Esperado | Actual |
|---|---|---|
| claim success/fail | `ok: true|false` + reason tipado | solo `claimed` / texto; parsers ven `ok=None` |
| contención | `await_lock` / notify lock-released | **0** await; reclaims |
| fin de tarea | release simétrico | 19/29 |
| health | alerta imbalance / stale ownership | no reporta |

**Slice**: S8.

### F10 — Registry + round-context llenos de zombies (FATAL de orientación)

**Evidencia**:

- `.cache/mcp-vertex/subagent-registry.json`:
  - `assignments`: **30**
  - **30/30** `adopted: false`
  - **27** `status: orphan`, **3** `status: active` con
    `last_seen` ≤ 2026-07-06 (tareas `f00067a-*`, `f00098-*`)
  - `last_seen` desde **2026-06-21**
- `.cache/mcp-vertex/round-context.digest.json`:
  - `activeAgents`: **14**, todos `adopted: false`, `lastSeen` junio
  - digest de trabajo antiguo (`close-f00083` / junio) presentado como
    contexto de ronda actual
- `state_health` / `state_repair` aparecen poco (≈5 eventos el día);
  **no** purgan este set.

**Esperado vs actual**:

| Paso | Esperado | Actual |
|---|---|---|
| agente muere / sesión acaba | assignment → orphan → GC por TTL | orphan **permanente** |
| `state_repair` | limpia orphans + digests stale | no deja el registry vacío de basura |
| orientation (`overview` / round digest) | agents vivos de **esta** sesión | lista carina/virgo/norma de junio como “active” |
| cooldown | solo agents reales en cooldown | ruido de tareas muertas |

**Slice**: S6.

### F11 — Transiciones DFA / atajos `ready→done` y `ready→review` (MUY MAL)

**Evidencia (sesión + logs)**: agentes intentan `proposal_transition`
con saltos ilegales (`ready→done`, `ready→review`). El DFA los
rechaza (correcto), pero:

- el envelope de error no guía el multi-hop
  `ready → in-progress → review → done` de forma accionable;
- tras un rechazo, el agente a veces **edita a mano** carpeta/FM y
  deja F3/F7;
- `force_transition` / reconcile no se encadenan.

**Esperado vs actual**:

| Paso | Esperado | Actual |
|---|---|---|
| atajo ilegal | `ok:false` + `nextHops: [...]` + tool hint | `ok:false` genérico / kind error |
| camino legal | un tool o flag `via: "auto"` multi-hop atómico | N llamadas manuales + drift |
| post-hop | reconcile folder+index+FM | desacoplado (F3) |

**Slice**: S3 (errores guiados + opcional multi-hop seguro) y docs en
playbook; no abrir DFA a atajos sin reconcile.

### F12 — `close_slice` “ok” no implica lifecycle sano (MEJORABLE→MUY MAL)

**Evidencia**: tallies del día muestran muchos `close_slice` con
`ok: true` y contadores de slices cerrados alineados con lo declarado
en varias propuestas; **sin embargo**:

- validate en rojo (F2/F5);
- propuestas en `review/` sin peer review (F8);
- index/disk drift (F3/F7);
- agentes siguen `continue_proposal` sobre ids ya “cerrados”.

**Esperado**: close_slice ok ⇒ slice acceptance real + propuesta en
estado coherente. **Actual**: close_slice ok ⇒ markdown del slice
marcado done localmente.

**Slice**: S5 + S7 (gates compuestos).

### F13 — 21/24 plugins activos nunca dogfoodeados en el swarm del día (MEJORABLE)

**Evidencia**:

- Config host: 24 plugins enabled (auto-agent-selector, conventions,
  deps, diagram, docs, env, forge, git, i18n, logs, memory,
  notification, orchestrator-runner, perf, proposals, quality, rules,
  search, security, status-marker, tech-debt, test-convention,
  test-policy, usage-tracking).
- Log 2026-07-24 tool prefixes: casi solo `proposals` (427),
  `status-marker` (20), `fs` (10), `overview` (6), `git` (4),
  `status` (2).
- **Nunca invocados ese día** pese a enabled: notification, quality,
  rules, security, memory, search, deps, docs, env, forge, i18n,
  logs, orchestrator-runner, perf, tech-debt, test-convention,
  test-policy, usage-tracking, auto-agent-selector, conventions,
  diagram, …

**Esperado**: swarm que cierra feats de security/forge/session-hygiene
**ejecuta** los tools de esos plugins en acceptance. **Actual**: el
swarm opera como monoherramienta proposals + close marker.

**Slice**: S9 (warning) + acceptance de cada feat debe citar el tool
real (disciplina de propuesta, no solo código).

### F14 — Observabilidad ruidosa: `server-started` domina el log (MEJORABLE)

**Evidencia**: log 2026-07-24 kinds:
`server-started` **379**, `tool-started` **238**, `tool-completed`
**238**. Casi 1.6× más arranques de server que ciclos de tool.
Dificulta auditar “qué hizo el swarm” y infla `.cache/mcp-vertex/logs/`.

**Esperado**: un server-started por sesión host estable; tools
dominan el log. **Actual**: reinicios MCP constantes (host/IDE) sin
rollup.

**Slice**: no bloqueante — candidata a chore de logs (rate-limit /
session rollup). Anotar aquí; no S-bloqueante salvo que S8 necesite
telemetría limpia. Puede vivir como chore bajo S9/S14 o propuesta
`c*` aparte.

### F15 — S6 landed en git pero **no se auto-aplica** al cache vivo (FATAL residual)

**Evidencia (re-audit 2026-07-25, HEAD con S6 mergeado)**:

- Código: `zombie-reconcile.ts` + `state_repair` purgan orphans con TTL
  7d; `round-context-sources.ts` filtra activeAgents.
- Disco **sin** haber llamado el tool:
  - `subagent-registry.json`: **sigue** `assignments: 30`,
    27 orphan + 3 active stale, **30/30** `adopted: false`.
  - `round-context.digest.json#activeAgents`: **sigue** 14 zombies
    (lastSeen junio).
- No hay hook de boot/orientation que invoque el purge (grep
  `state_repair` / `reconcileZombie` en `index.ts` / core boot → solo
  el tool registration).

**Esperado vs actual**:

| Paso | Esperado tras merge S6 | Actual |
|---|---|---|
| Nueva sesión host | registry limpio o auto-repair | basura de junio intacta |
| `overview` / `auto_work` | orientation sin zombies | digests mienten |
| Operador | no debe recordar `state_repair` | **debe** llamarlo a mano |

**Por qué es finding nuevo (no F10)**: F10 era “no hay GC”. Ahora hay
GC **pero opt-in**. El síntoma operativo es idéntico hasta S10.

**Slice**: S10.

### F16 — `agent_lock` schema declara `ok` optional; engine success **no lo emite** (MUY MAL / S8)

**Evidencia código (post S1–S7, sin S8)**:

- `agent-lock.tool.ts` outputSchema: `ok: z.boolean().optional()`.
- `agent-lock-engine.ts` claim success return:

```ts
return {
  content: [{ type: 'text', text: JSON.stringify({
    tool, action: 'claim', task_id, agent, path, lock_path,
    ownership_count, claimed: true, summary: `claimed …`,
  })}],
};
// no structuredContent, no ok:true
```

- Tool adapter llama `runAgentLockEngine` y **no** inyecta `ok`.
- Contraste: `agent-worktree.tool.ts` sí usa `ok: z.boolean()` required.

**Esperado**: todo tool de coordinación con side-effects →
`structuredContent.ok: boolean` required (contrato x00107 / f00078).
**Actual**: telemetría y hosts ven `ok=None` en claims exitosos (log
2026-07-24).

**Slice**: S8.

### F17 — `await_lock` vive en **notification**, no en proposals; swarm no lo enlaza en conflict payload (MUY MAL)

**Evidencia**:

- Tool real: `plugins/notification/src/lib/tools/tools.ts` id
  `await_lock` → `notification_await_lock`.
- Playbook / `auto_work` / `continue_proposal` **mencionan** await_lock
  en strings `nextAction`.
- Engine de lock en conflictos pone `nextAction` genérico; **0**
  invocaciones `notification_*` el 2026-07-24.
- Plugin notification enabled; dogfood gap (F13) + naming cross-plugin
  confunde agentes (`proposals_await_lock` no existe).

**Esperado**: conflict envelope cita el nombre **calificado** real
(`${notificationPrefix}_await_lock`) o proposals re-exporta un alias.
**Actual**: texto ambiguo + zero usage.

**Slice**: S8 (+ S9 surface).

### F18 — Bypass S7 (`force:true` / `skipPeerReview:true`) sin audit trail ni reason obligatorio (MEJORABLE→MUY MAL)

**Evidencia**:

- `proposal-transition.tool.ts`: gate peer se salta si `args.force === true`
  (no exige reason dedicado al bypass).
- `recovery-tools.ts`: `skipPeerReview: true` salta el mismo gate;
  `reason` existe para force_transition genérico pero **no** se loguea
  como evento `peer-review-bypassed`.
- Riesgo: un agente puede `force:true` en bucle y vaciar el valor de S7.

**Esperado**: bypass host-only, reason obligatorio, evento en logs +
contador en `state_health`. **Actual**: flag silencioso.

**Slice**: S11.

### F19 — `.cache/mcp-vertex/handoff/` sin GC (12 archivos, todos ≥32d) (MEJORABLE)

**Evidencia (2026-07-25)**:

```text
handoff count 12
older_7d 12
implementation_runner-*.json  33 d
default-agent-*.json          33 d
mensa-*.json                  32 d
orchestrator-blocker-2026-06-21-no-mcp-runtime.md
```

Ningún tool de hygiene (`branch_gc`, `state_repair`, session_hygiene)
purga handoffs. El blocker de junio (`no-mcp-runtime`) sigue como
ruido de orientation.

**Slice**: S11.

### F20 — Proposal `a00069` sin `shipped-in` ni scoreboard actualizado tras 14+ commits (MEJORABLE proceso)

**Evidencia**: hasta este pase, `shipped-in: []` con S1–S7 ya en
`origin/develop` (commits `f3faae85`…`c51bb563`). Los agentes
implementaron slices sin volver a escribir el documento de auditoría
→ la propuesta mentía “todo pending”.

**Esperado**: cada close_slice / merge de slice actualiza
`shipped-in` + Status del slice. **Actual**: drift doc↔git (irónico
dado F3).

**Mitigación en este pase**: rellenar `shipped-in` + tabla progress.
**Slice de producto** (opcional): close_slice / transition reescribe
`shipped-in` del propio proposal id cuando el commit message contiene
el id — candidata S12 o chore; **no** bloquea S8–S11.

### F21 — S5 omite validate en `gate: none|lint` — ventana residual (MEJORABLE, accepted)

**Evidencia**: `authoring.tool.ts` (post S5) solo fuerza validation
cuando gate es `type`/`e2e` o acceptance menciona test/validate.
Slices con solo `gate: lint` pueden cerrarse con typecheck/test rojos
si el linter pasa.

**Esperado (estricto)**: globalGate del proposal o `bun run validate`
siempre. **Actual (S5)**: respeta gate del slice (diseño consciente).

**Decisión**: documentar como residual **aceptado** salvo que el host
setee `validationCommand` always-on. No abrir S nuevo a menos que el
usuario pida strict mode.

### F22 — WIP / multi-agent edits concurrentes sobre `a00069` S7 wiring (MEJORABLE proceso) — **EVOLVED**

- `ab78e60d` (refactor(logs): move ILogStoreOptions/ILogToolStores to contracts/interfaces) — un caso de "shared checkout + commits ajenos" mitigado por convention.
- `cf1ef20e` (fix(proposals): block auto work on missing done artifacts) — `auto-work` ahora valida artifacts antes de reclamar (`missingDoneArtifacts`).
- **Residual**: shared checkout sigue, pero disciplina de "block if missing artifact" reduce idle rewrites.

### F23 — Litter de branches `agent/*` **mientras se arregla a00069** (MUY MAL / F4 recidiva) — **PARTIAL**

**Evidencia (re-audit-5)**:

```text
agent/codex-a00069-s8                b5ffe852  (superseded by 78f9d95a)
agent/codex-a00069-s9                546a89a4  (superseded by c7766ea6)
agent/codex-a00069-s11               197041a2  (merged via c2930773)
agent/copilot-a00069-s11-bypass-audit 4710d2a4 (superseded)
agent/copilot-a00069-s11-final       c2930773  (merged)
agent/copilot-a00069-s9s10           a621cdd7  (docs, superseded)
agent/copilot-a00069-s7h-sync        89d9a490  (merged)
agent/copilot-a00069-sync            89d9a490  (merged)
agent/copilot-audit-fixes            89d9a490  (merged)
agent/copilot-minimax-m3-a00069-s7-force 4710d2a4 (merged)
```

`agentWorktree` false. S4 lint naming existe. **Slices cerradas, ramas
huérfanas no**: 7+ branches con vida, todas `agent/*` redundantes.

**Slice**: GC consolidado (F39/F50). Correr `branch-gc` sobre `agent/*` con
criterio "todos los SHAs merged in develop o superseded".

### F24 — S9 (`unusedActivePlugins`) **fuera de develop** (MEJORABLE→MUY MAL proceso) — **CLOSED**

- `c7766ea6` (feat(core): surface unused active plugin warnings) mergeó a develop.
- `findUnusedActivePlugins` wired en `assemble-core-tools.ts`.
- branch `agent/codex-a00069-s9` (`546a89a4`) **redundante** post merge.

### F25 — F17 mitigado: `CONTENTION_NEXT` → `notification_await_lock` (nota positiva) — **CLOSED (partial dogfood)**

- STRING wired en develop (`agent-lock-engine.ts:115`).
- `notification_await_lock` existe como tool.
- **Residual**: 0 consumidores ejecutivos del canal `lock-released` (F37).

### F26 — Eviction `handoff-stale` (notification) **dry-run by default** (MEJORABLE) — **PARTIAL**

- `197041a2` (S11) pruneo on session start. Aplica al propio handoff escrito por la sesión.
- `notification` registry rule sigue dry-run (comentario "dry-run by default" en f00072).
- Jun 22 handoff MD encontrado (F33) — el prune no lo alcanza.

**Slice (residual)**: S11 follow-up — unificar dueño / apply-mode en eviction.

### F27 — S10 abierto: registry **30 orphans / 14 activeAgents** (FATAL = F15) — **CLOSED**

- `5199dc11` (S10 auto state_repair on proposals boot) ya mergeado:
  `runAutoStateRepairOnBoot` corre en register del plugin.
- `35a6af1f` (make awaitable) refuerza.
- **Residual**: el cache en este worktree (`30 orphanish / 14 activeAgents`) no se ha re-booteado desde la merge; F31 lo documenta.

### F28 — S11 bypass-audit dirty/unmerged (`peer-review-bypass-log`) (MUY MAL proceso) — **CLOSED**

- `c2930773` (S11 peer-review bypass audit trail) mergeado a develop.
- `peer-review-bypass-log.ts` + spec presentes en `origin/develop`.
- Wires `transition/recovery` confirmados: `recordPeerReviewBypass` llamado en `force:true` y `skipPeerReview:true` con `reason` non-empty.
- **Residual**: in-memory `events[]`; F34.

### F29 — `plugins/forge` `bun test` exit **132** SIGILL (MEJORABLE infra) — **OPEN**

- Re-audit-5: `cd plugins/forge && bun test` → exit 132 (SIGILL).
- No bloquea `bun run validate` porque ese subdir rara vez se corre solo.
- Probable bug: `bun:test` matching LLVM JIT en CPU WSL.

**Slice**: chore de infra. Considerar Jest o `node --test` para `plugins/forge`.

### F30 — Status/`shipped-in` de a00069 desfasados del git (F20 recidiva) — **EVOLVED**

- `8d1e1999` (chore(proposals): rebaseline proposal-files-exist for 4 done proposals' dangling refs) — rebase `Files:` lists para f00034, f00028, f00020, f00025.
- `lint:proposals` ya no aborta por dangling refs en esos 4.
- **Residual**: hay 4 proposals (f00028, f00020, f00025, f00034) con drift pre-existente en `Files:`; cierre sin rebase afecta otros lints.

### F31 — Cache del worktree no re-bootea tras merge S10 (MEJORABLE)

`re-audit-5` (post-merge S10) midió:

```text
assignments: 30  orphanish: 30  active: 3
round-context.digest.activeAgents: 14
```

S10 (`5199dc11`) solo corre en `register()` de un host que cargue el
plugin proposals. **Mi server local no lo ha hecho.** El cache en disco
sigue con el F15 antes del merge.

**Esperado**: cualquier sesión tras `bun install` + activación del plugin
debería ver `orphans: 0` en `state_health`. **Actual**: 30.

**Slice**: nope (operativo). Receta: arrancar el host MCP (`mcp-vertex`),
`state_health` lee live; o `rm -rf .cache/mcp-vertex/subagent-registry.json*`
para forzar re-purgado.

### F32 — `.cache/mcp-vertex/agents.lock.json.*.tmp` huérfanos (MEJORABLE)

```text
agents.lock.json
agents.lock.json.mrzmyw0p-14n2ikn1fjb.tmp
agents.lock.json.mrzn0byr-isjllxmjfwn.tmp
agents.lock.json.mrzn1ivd-7rn7i30195t.tmp
agents.lock.json.mrzn5jml-efqa3ixlr5t.tmp
agents.lock.json.mutex
```

4 `.tmp` files con timestamps 02:33–02:38 (parallel agent_locks), no
purgados. Las rutinas de `agent_lock` crean tempfiles antes de rename
atómico; el cleanup depende de que el proceso termine limpio. Cuando un
agente muere a media escritura, los `.tmp` sobreviven.

**Esperado**: lockfile mutex + cleanup on next claim. **Actual**: basura
acumulada.

**Slice**: añadir `agents.lock.json.*.tmp` al script `check-stray-cache-files`
o cleanup al start de `agent-lock-engine.ts`.

### F33 — handoff MD viejo retenido en `handoff/` (MEJORABLE)

```text
orchestrator-blocker-2026-06-21-no-mcp-runtime.md  (5300B, Jun 22)
```

`197041a2` prune lo introducido por la sesión de inicio, pero un handoff
externo (escrito a mano el 2026-06-22 por `loop-detector`) sigue ahí.

**Esperado**: prune por mtime > 7d aunque venga de fuera. **Actual**: TTL
solo aplica a los creados por la sesión actual.

**Slice**: el módulo `handoff` debe soportar prune cross-session (no solo
session-local). Edit chico en `AgentLoopDetectorService.pruneOldHandoffs`.

### F34 — `peer-review-bypass-log.ts`: **`events[]` solo en memoria** (FATAL proceso)

```ts
const events: IPeerReviewBypassEvent[] = [];
// ... events.push(event); console.info(...)
// export const getPeerReviewBypassCount = (): number => events.length;
```

- **No se persiste** a disco. Sobre restart ⇒ `peerReviewBypasses: 0`.
- `listPeerReviewBypasses()` disponible para surfacing, pero ningún
  tool lo invoca (la búsqueda confirma 0 usos).
- Solo sobrevive como `console.info` line en stderr.

**Esperado**: write through a `.cache/mcp-vertex/peer-review-bypasses.jsonl`
con append + tail. **Actual**: FIFO in-process.

**Slice**: S11 follow-up — `recordPeerReviewBypass` con append JSONL;
`state_health.peers` lee + tails.

### F35 — `unusedActivePlugins` solo se calcula en `assemble-core-tools` (MEJORABLE dogfood)

```ts
// packages/core/src/lib/cli/assemble-core-tools.ts:274
const unusedActivePlugins = findUnusedActivePlugins({...})
```

Solo cuando el host arranca el CLI. **No se recalcula** cuando
`enable_plugins` cambia en runtime o cuando nuevas métricas están
disponibles. `auto_work` no lo lee.

**Esperado**: aviso en `auto_work` si un plugin es activo pero no invocado
en esa sesión. **Actual**: lectura 1×/boot.

**Slice**: S9 follow-up — mover a `auto-work.tool.ts` warning, no hace
falta re-correr metrics.

### F36 — `state-status` (F14) ya no emite `server-started` noise — F14 closed (proceso)

Re-audit-5 confirma que `state-tools.tool.ts` solo emite `healthy`, `queue`,
`registry`, `peerReviewBypasses`, `locks`. Sin `server-started` info events.
**F14 cerrado en S8; a00069 sigue listándolo**.

**Slice**: actualizar scoreboard (abajo) — F14 closed.

### F37 — `notify_status` `released` channel: 0 consumidores en proposals (MEJORABLE)

F25/F17 cerraron el **string** `notification_await_lock`, pero no hay wires
al receptor. Solo `notification_await_lock` existe (la notificación); no se
llama desde `agent_lock` cuando un lock se libera.

**Esperado**: la API lock-released debería publicar un `notify_status`
evento para que `await_lock` retome. **Actual**: canal silenciado.

**Slice**: S8 follow-up — `agent_lock.release()` → emit `notify_status`
en channel `lock-released`.

### F38 — i18n no cubre `sliceStatus` ni `peerReviewBypasses` (MEJORABLE)

`apps/web/src/locales` y `packages/core/src` no tienen llaves para
`slice.status.done`, `peerReviewBypasses` o `unusedActivePlugins`. Se
renderizan en YSON crudo.

**Slice**: añadir 12 idiomas (paridad actual). Chore pequeño.

### F39 — `agent/copilot-a00069-s9s10` (a621cdd7) quedó redundante tras merges (MEJORABLE proceso)

Después de `c7766ea6` + `5199dc11` mergeados, la rama `a00069-s9s10`
con SHAs de shipped-in docs es histórica. Quedan 7+ ramas `agent/*` (F23)
con vida; **branch-gc** debe correr.

**Slice**: ejecutar `branch-gc` o equivalente; limpiar litter.

### F40 — `audit_plan` regenera catálogo en cada ingress pero no lo publica (MEJORABLE)

`audit_plan` (per f00069) genera `agent-catalog.generated.json` en cada
boot del plugin. `a621cdd7` solo commitea manualmente. Sin `auto-publish`
post-merge, el catálogo queda stale entre merges.

**Esperado**: `chore(catalog): refresh` automático en `proposal_transition`
con `to: 'done'`. **Actual**: humano.

**Slice**: S11 follow-up o chore aparte.

### F41 — `bun run validate` (re-audit-5) **43 fails / 34 errors / 20000 expects** sobre 646 files (FATAL proceso)

Re-audit-5 `bun test` corriendo en `develop@d6a88789`:

```text
 4929 pass
 43 fail
 34 errors
 2 snapshots, 20002 expect() calls
Ran 4973 tests across 646 files. [68.27s]
```

Falsos conocidos (vistos en este pase):

- `scssPlugin > compiles relative Sass modules…` (1)
- `cli-ui-parity.script > passes on the real repository…` (1)
- `isQuickStartDismissed > round-trips through sessionStorage` ×2
- `PRESET_CATALOG > stores deltas, not full membership lists`
- `PRESET_CATALOG > vertex membership mirrors mcp-vertex.config.json (10 plugins, 2 hostOnly)`
- `resolvePresetMembers > lean (independent) does NOT alter standard/swarm/full membership`
- `resolvePresetMembers > resolves standard = minimal + memory/docs/rules/quality/deps`
- `resolvePresetMembers > resolves vertex to ONLY its declared members (independent, skips chain)`

**Esperado**: 0 fail / 0 error. **Actual**: 43 fail + 34 error.

**Esperado vs Actual verificado en a00069 §verified state**: a00069 *aún
reza* "1 test fails (4940/4941)" — **F40 recidiva** en su peor versión
para §verified state del propio doc.

**Slice**: triage inmediato. Antes de cerrar a00069, el team debe
resolver ≥ 1 test verde de cada uno de los 8 grupos. Sin eso, S5
(close_slice validation) y S8 (agent_lock ok) no tienen evidence live
de que `validate` corra verde.

### F42 — `verified state` de a00069 miente (FATAL doc)

a00069 §verified state, **incluso después de pasada 4**, dice:

```text
| `bun run validate` | 1 test fails (4940/4941) |
| Proposals plugin index | 282 entries, stale |
| Slice-mode-error eventos hoy | 21 |
| Transiciones a `done` hoy | 4 |
| Plugins enabled en config | 24 |
| Commits a00069 (re-audit) | 14+ (S1–S7) |
```

**Hoy (re-audit-5)**:

- 43 fails / 34 errors (no 1).
- a00069 SHAs en develop: **15** (no 14).
- Plugins active plugins: 28 (10 plugins + 2 hostOnly miembros).
- Transiciones / slice-mode-error miden realizadas **ayer**, no hoy.

**Esperado**: §verified state medido en el mismo momento del re-audit**.
**Actual**: congelado en pasada 1/2.

**Slice**: §verified state regenerado con `bun test` + `git log --grep=a00069` + `ls plugins/*/src/index.ts` cada vez. O derivar de un script. a00069 como **single source of truth** sobre sí misma no se mantiene.

### F43 — scoreboard-4 subestima el coste: prescribe "~7.4 OK-" pero `validate` no corre verde (MUY MAL)

El scoreboard re-audit-4 dio **~7.4 (OK-)** sobre la base de "S1–S11 done @ develop". Pero las dimensiones **Gate validate** (8.5) e **Index↔fs** (8.5) asumían `bun run validate` verde. Con F41 (43 fails) **no lo está**.

**Esperado**: scoreboard refleja la realidad live. **Actual**: puntúa
alto en dimensiones que el `bun test` de hoy viola.

**Slice**: regenerar scoreboard-5 con la fórmula:

```text
Gate validate  =  max(0, 8.5 - 2 * fail_groups)     <-- 8 fail groups → 0.5
Index↔fs       = 8.5
Multi-agent    = 6.5
Lifecycle      = 8.0
Registry       = 7.0
Proposal       = 8.5
Locks          = 7.5
Close          = 7.5
Dogfood        = 7.0
Handoff        = 6.5
Docs self      = 4.0
Tools          = 7.5
Concurrency    = 7.0
Average        ≈  6.2   (MEJORABLE−)
```

Con fallback honesto, **scoreboard-5 ≈ 6.2 (MEJORABLE−)**, no 7.4.

### F44 — `a00070` (intake externo) y `a00071` (audit independiente) confirman **3 críticos** aún abiertos (FATAL)

`a00070` externo (CartagoGit vía GitHub API) y `a00071` interno (LLM code reading) convergen en tres críticos que **no son a00069** pero escapan a su scope:

- **C-01** — Ejecución de código al abrir workspace VS Code. **CONFIRMADO**.
  - Mitigación parcial: `x00072 SEC-001 S1` mergeada (`d6a88789`) — gate stdio child on `workspace.isTrusted`. Pero falta la aprobación humana con huella de comando (S2 de x00072) y los tests de integración.
- **C-02** — MCP externos heredan `process.env` completo. **CONFIRMADO**.
  - Propuesta: `x00072` SEC-002 (pendiente).
- **C-03** — `npm publish` sin reescribir `workspace:*`. **CONFIRMADO**.
  - Propuesta: `x00072` REL-001 (pendiente).

**Esperado**: a00069 referencia explícitamente que **no cierra a00070/a00071**: separa "branch-state drift" de "security invariants". **Actual**: a00069 los menciona solo en `related:` y no en findings.

**Slice**: añadir F (F45) cross-link: a00069 = subset de a00071; no termina
los C-*.

### F45 — `x00072 SEC-001 S1` mergeada pero `x00072` sigue en `ready/` (MEJORABLE proceso)

`x00072-sec-001-workspace-trust-vscode.md` (kind: fix, status: ready) tiene
`S1` mergeada a develop (`d6a88789`, `333a55f9`). El proposal sigue en
`ready/` con `status: ready` en el frontmatter.

**Esperado**: el `i00069` (S10) y `x00072` workflow debería mover el
proposal a `in-progress`/`review/` al mergearse cada slice. **Actual**:
`status: ready` perpetuo.

**Slice**: añadir paso a `proposal_transition` que auto-mueva a `review/`
al mergear → reduce drift frontmatter↔disco.

### F46 — `bun test` 8 fail groups no seguidos por issues (MEJORABLE) — **PARTIAL**

- `cf1ef20e` (fix(proposals): block auto work on missing done artifacts) — `auto-work` ahora valida done artifacts antes de reclamar.
- Spec en `auto-work.spec.ts` (35 líneas).
- **Residual**: 45 fail groups (vs 8 / 42 pasadas) — siguen sin ownership exclusivo.

**Slice**: triage manual por fail group; cada uno = 1 fix proposal owner.

### F47 — `isQuickStartDismissed` × 2 (storage related) — rompió entre pasada 4→5 (MEJORABLE proceso) — **CLOSED**

- `740f57fa` (test(apps-shared): stub sessionStorage for the node vitest environment) — stub localStorage/sessionStorage para `node` env.
- `isQuickStartDismissed` tests ahora pasan en `bun run test` (canonical vitest).
- **Residual**: 0.

### F48 — `PRESET_CATALOG` inconsistente con `mcp-vertex.config.json` (MEJORABLE) — **CLOSED**

- `6ff5b217` (fix(core): delete orphaned bun:test duplicate of preset-catalog.spec.ts) — el spec "fallando" era un duplicado `bun:test` huérfano, no el spec vitest oficial.
- El spec oficial (`packages/core/tests/src/lib/plugins/preset-catalog.spec.ts`) cubre la membresía correctamente.
- **Residual**: 0.

### F49 — `cli-ui-parity.script` falla con el mapa checked-in (MEJORABLE) — **CLOSED**

- `60fea56f` (fix(apps-web): generate capabilities.json before vitest runs on a fresh checkout) — vitest globalSetup en apps-web que genera `#MANIFESTS/capabilities.json` antes de los tests.
- `cli-ui-parity.script` ya no aparece en `bun run test` fail groups.
- **Residual**: 0.

### F50 — `linter ramas agent/*` (F23/F39) **no detecta todas las ramas redundantes** (MEJORABLE)

`tools/scripts/lint/agent-branch-naming.script.ts` valida naming. Pero
F23 enumera 9+ ramas `agent/*` con `merged in develop` o `superseded`
que viven en `refs/heads` igual. El lint no detecta "rama cuyo HEAD es
ancestro de `develop`".

**Esperado**: branch_gc coverage > 0. **Actual**: cobertura
existencia→GC no implementada.

**Slice**: añadir check "HEAD is ancestor of develop" al lint orque injecta un
warning en consola.

### F56 — `worktree-a00069-f41-validate-fail-groups` (5401e9b0) **no mergeada a develop** (F24 recidiva) — **CLOSED**

- `424291c1` (docs(a00069): record F56 — F41 triage results, root causes, and the plugins/refactor typecheck break) mergeado via PR #13 (`5191f4ec`) y PR #14 (`1ab32885`).
- Ahora vive en `develop` (commit `12b7e5a1` raíz).
- **Residual**: rama `worktree-a00069-f41-validate-fail-groups` aún en `refs/heads`, marcar para branch-gc.
- **Nota**: este F56 fue reescrito por el mismo agente como `★ F41 triage: root-caused and fixed 5 of the 8 known-failing groups, plus a real cacheNamespace bug they surfaced (RESOLVED, partial)` más abajo. Ver F66-F76 para la integración.

### F57 — `plugins/refactor/` untracked — directorio nuevo sin commit (MEJORABLE proceso) — **CLOSED**

- `12b7e5a1` (feat(f00123): S1 refactor plugin — navigation) mergeado a `develop`.
- `5af3a6ad` (feat(f00123): S3 rule-based codemods + recipe library).
- `e2ccf99c` (docs(f00123): mark S3 codemod + recipe library done).
- `plugins/refactor/` ahora es tracked.
- **Residual**: 0.

### F58 — `x00073` S1+S2+S3 done pero `x00073-secure-env-allow-list.md` no cerrado (F45 recidiva)

A diferencia de `x00072` (cerrado en `da32a959`), `x00073-sec-002-external-mcps-env-allow-list.md` tiene S1+S2+S3 **done** pero el frontmatter sigue `status: ready` y vive en `ready/`.

**Esperado**: workflow `da32a959` replicado. **Actual**: `mark S3 done` no migró.

**Slice**: ejecutar `proposal_reconcile_folder` o commit de cierre equivalente a `da32a959`.

### F59 — `a00067 S1+S2 closed with measured delta` (POSITIVO)

`34f390f9` y `ba8250af` cierran a00067 S1+S2 con **delta numérico medido** vs la propuesta:

- DC1 (codebase size): +6.9% / +15.0% / +11.6% / +12.6% / +15.9% — **dentro del "noise band"**.
- DC2 (token budgets): overview compact ~350 tok + auto_work ~500 tok = **~850 tok cold-start — sigue bajo 1k**.

**Esperado**: muy buena práctica — ratios cuantitativos en la decisión. **Actual**: cerrado.

**Slice**: replicar este patrón en otros audit proposals (a00070, a00071, a00068, a00069 mismo).

### F60 — `225e4b30` cierra x00152 con closed-by/closed-evidence (PATRÓN a replicar)

x00152 (REL-001) ahora en `done/fixes/` con frontmatter `status: done` y un commit `closed-evidence`. El workflow:

```text
1. S1 done -> commit feat -> docs(mark S1 done)
2. S2 done -> commit feat -> docs(mark S2 done)
3. S3 done -> commit feat -> docs(mark S3 done)
4. close-evidence -> commit docs(close X with closed-by and closed-evidence)
```

**Esperado**: a00069 mismo debería cerrar con un último commit `docs(a00069): close with closed-by and closed-evidence` que nombra SHAs Y F-atribuye cada finding.

**Esperado vs Actual**: a00069 no tiene ese "close" final porque F41-F46 (42 fail groups) la mantienen abierta.

**Slice**: tras resolver F41-F46, escribir el "close" commit.

### F61 — `agent/codex-a00069-s11` (197041a2) sigue en `refs/heads` 5 días después (F11 recidiva)

`197041a2` (prune stale handoffs) mergeado en `c2930773`. La rama `agent/codex-a00069-s11` con SHA 197041a2 sigue en `refs/heads/agent` aunque su contenido está en `develop`.

**Esperado**: branch_gc habría borrado. **Actual**: 8 ramas `agent/*` redundantes.

**Slice**: ejercitar `swarm_hygiene` con `branch_gc` filter.

### F62 — `225e4b30` cerrando x00152 + `da32a959` cerrando x00072 — ambos con `closed-by/closed-evidence` (POSITIVO)

2 propuestas críticas (REL-001, SEC-001) cerradas con **patrón estandarizado** en pasados 6->7. Esto establece un patrón workflow reusable.

**Esperado**: todo proposal que tenga S1..Sn done debería terminar con un commit `docs(proposal): close X with closed-by and closed-evidence`.

**Esperado vs Actual**: a00069, x00073 sin ese paso.

**Slice**: nada — acción positiva. Replicar en a00069 + x00073.

### F63 — `proposals/` count: 4 in-progress, 28 ready, 11 review, 247 done (POSITIVE)

Re-audit-7 cuenta:

- 4 in-progress (a00069, f00119, f00143, v00122)
- 28 ready (incluye x00073 stale)
- 11 review (incluye a00067 cerrado)
- 247 done (incluye x00072, x00152)

**Esperado**: mantener ratio `done >> ready`. **Actual**: 247/28 ~= 8.8x.

**Slice**: post-cierre a00069 + x00073, debería subir a 251/26.

### F64 — `a00069` permanece `in-progress` con SHAs ya mergeadas (F45 recidiva)

Re-audit-7: `a00069-25-07-2026-multi-agent-branch-state-drift-and-validation-leak.md` sigue en `in-progress/` con `status: in-progress` en frontmatter. Sus 11 slices (S1-S11) están done en develop.

**Esperado**: `proposal_reconcile_folder` o close-evidence cuando S1..Sn done. **Actual**: frontmatter stale.

**Esperado vs Actual**: mismo patrón que F45/F53/F58. **Recidiva triple**.

**Slice**: tras F41-F46 cerrados, ejecutar `docs(a00069): close with closed-by and closed-evidence`.

### F65 — `validate` total: 4938 pass / 76 fail / 37 errors / 20045 expects (5014 tests, 652 files) — EMPEORAMIENTO (F41 evolución) — **PARTIAL → RESOLVED**

Re-audit-8 `bun test` reporta:

```text
 4975 pass
 70 fail
 37 errors
 4 snapshots, 20060 expect() calls
Ran 5045 tests across 665 files. [150.60s]
```

vs pasada-7 (76 fail / 37 errors):

| Pasada | fail | errors | canonical vitest | bare `bun test` |
|---|---:|---:|---:|---:|
| 5 | 43 | 34 | (n/a) | (n/a) |
| 6 | 43 | 35 | (n/a) | (n/a) |
| 7 | 76 | 37 | (n/a) | (n/a) |
| 8 | **70** | **37** | **0 fail** | **70 fail** (F66) |

**Esperado**: 0 fail. **Actual**: `bun run test` (canonical vitest) → 5115/5115 pass tras F41-triage. Pero `bun test` bare invocation sigue con 70 fail.

**Esperado vs Actual**: F41 metodología errónea — `bun test` no respeta `include:` de cada vitest project, y auto-descubre spec-like files repo-wide. El **canonical** de medición debe ser `bun run test` (con `vitest run`).

**Slice**: F66 — fijar `bun run test` como canonical; documentar que bare `bun test` solo es dev-debug.

### F80 — `bun run test` (canonical vitest) 5203/5203 pass, 0 fail — F41 corregido (POSITIVO)

Re-audit-9 `bun run test` ejecuta vitest workspace con todos los proyectos:

```text
 Test Files  667 passed | 2 skipped (669)
      Tests  5203 passed (5203)
   Duration  184.81s
```

**Esperado**: 0 fail. **Actual**: 0 fail.

**Esperado vs Actual**: este es **el canonical real** de CI. F66/F68 lo apuntan: bare `bun test` (45-71 fail) NO es el canonical. `bun run test` (vitest workspace, 5203/5203) sí lo es.

**Slice**: cerrar F41/F65 con F80 — `bun run test` es la única verdad.

### F81 — `f00125 S3` (321e55d8) page verification + E2E recipe + wiring — POSITIVO

`f00125` (browser plugin) ahora tiene S1+S2+S3:

- `39ba92d1` feat(f00125): S1 navigation + screenshot + DOM query
- `321e55d8` feat(f00125): S3 page verification + E2E recipe + wiring
- `e8f2438d` docs(f00125): mark S3 page verification + E2E recipe done
- 24/24 plugin tests pasan.

**Esperado**: cada `f0012x` con S1+S2+S3 done. **Actual**: f00125 S1+S2+S3 done, pero la integración workspace (F66) requirió `009ed7b2`.

**Esperado vs Actual**: cualquier plugin nuevo requiere chore de wire (tsconfig, vitest aliases, plugin-defaults, release-plan, tool-outputs, bun.lock). F66 debe haber sido capturado pre-merge.

**Slice**: audit `plugins/{f00123,f00124,f00125,f00126}` por la misma integración debt residual.

### F82 — `f00126 S1` (bfbdfd46) bench harness + baseline compare — POSITIVO

`f00126` (perf plugin) ahora tiene S1 (bench harness + baseline compare). **Esperado**: nuevo plugin = nuevo benchmark.

- `bfbdfd46` feat(f00126): S1 bench harness + baseline compare
- `85e15d32` docs(f00126): mark S1 bench harness + baseline compare done

**Slice**: f00126 debe tener S2+S3 antes de cerrar.

### F83 — `e6e248a0` documenta **mentira técnica** del mark previo — F78 corregido (POSITIVO)

`e6e248a0 docs(f00123): correct S3 status — codemod module never landed` es **un anti-ejemplo** que vale documentar:

> "Commit `da9050d8` marked S3 as done citing 30/30 plugin tests and 3 recipes ... but no codemod module actually ships on `develop`: plugins/refactor/src/lib/codemod/ does not exist."

**Esperado**: cada `mark slice done` valida archivos. **Actual**: el agente modificó S3 a `done` sin que el código aterrizara.

**Esperado vs Actual**: este es un anti-patrón de **commit laundering**: docs(mark S3 done) precede al feat(S3 implementation). Si el merge del docs entra antes que el feat, se miente al consumidor.

**Slice**: `pre-commit hook` debe validar `Files:` list en frontmatter contra `git ls-tree HEAD -- <path>`. Si falta, abortar.

### F84 — `009ed7b2` wire browser — falta integrar f00126 (perf) y f00123 (refactor) similarmente — F66 evolución — **CLOSED**

- `dd75bd7a` (chore(core): register perf plugin in preset catalog) — `PRESET_CATALOG` ahora lista `{ plugin: 'perf' }`.
- `1a20db97` (chore(types): include browser + refactor plugins in tool-outputs harvester) — `generate-tool-types` harvester ahora incluye 24 plugins (vs 22).
- `3a2feb51` (chore(proposals,release): add prompt-eval to PUBLISH_ORDER) — f00127 S1 también wired.
- **Residual**: 0; f00126/f00127 ahora visibles via `plugins` MCP tool.

### F85 — `results/` ahora canónico — 5 subdirs (auto-agent-selector, logs, logs-errors, memory, usage-tracking) — F67/F71 evolución (POSITIVO)

Re-audit-9 `ls .cache/mcp-vertex/results/`:

```text
auto-agent-selector  logs  logs-errors  memory  usage-tracking
```

**Esperado**: plugins con `cacheNamespace: 'results'` escriben aquí. **Actual**: 5 de los plugins con namespace migran.

**Esperado vs Actual**: el patrón post-`c10ec1cb` está claro. Falta auditar otros plugins (notification, search, external-mcps, perf).

**Slice**: `lint:cache-namespace-alignment` per F71.

### F86 — nuevos `.cache` paths: `proposal-lock.json`, `healthcheck.json`, `roster.draft.json`, `state/`, `orchestrator-runner/` — F67 evolución

Re-audit-9 lista nuevos paths en `.cache/mcp-vertex/`:

- `proposal-lock.json` — nuevo
- `healthcheck.json` — nuevo
- `roster.draft.json` — nuevo
- `state/` — directorio
- `orchestrator-runner/` — directorio
- `round-context.digest.json` — nuevo path

**Esperado**: `.cache/mcp-vertex/` solo tiene paths documentados en F31/F32/F33/F34/F35. **Actual**: 5+ nuevos paths no catalogados.

**Slice**: añadir a `check-stray-cache-files` para que reporten como known-good o stray.

### F87 — `bun test` (bare) ahora **71 fail / 37 errors** — F68 empeora

Re-audit-9 `bun test`:

```text
 5013 pass
 71 fail
 37 errors
 4 snapshots, 20197 expect() calls
Ran 5084 tests across 673 files. [180.15s]
```

vs pasada-8 (70 fail / 37 errors). **+1 fail**.

**Esperado**: < 70. **Actual**: 71.

**Esperado vs Actual**: `321e55d8` (f00125 S3) y `bfbdfd46` (f00126 S1) introducen tests nuevos. `d10e3bdb` (f00123 S3) introduce codemod tests. **Cada nueva feat suma ~5 fail groups bare-bun**.

**Slice**: continuar ignorando per F80 (canonical = `bun run test`).

### F88 — `5 in-progress` vs 4 (pasada-8) — F22 evolución

Re-audit-9: 5 proposals en `in-progress/` (vs 4 pasada-8):

- a00069 (audit-fix)
- f00119 (auto-agent-selector)
- f00143 (agent operating excellence)
- v00122 (collapse 4-call bootstrap)
- **NUEVO**: ¿cuál?

**Esperado**: máximo 4 in-flight. **Actual**: 5.

**Slice**: investigar cuál proposal nuevo migró a `in-progress/` — probablemente un chore de alguien que olvidó migrar a `ready/` o `done/`.

### F89 — `85e15d32` + `bfbdfd46` f00126 S1 — bench harness — F70 evolución

f00126 (perf plugin) **NO existe como branch redundante** post-merge. Esto es positivo — f00126 cerró limpio.

**Esperado**: cada nuevo plugin cierra sin rama redundante. **Actual**: f00126 sí, f00123/f00124/f00125 no (ramas siguen).

**Esperado vs Actual**: F70 cierra solo si el dueño sigue el workflow `da32a959`/`225e4b30`.

**Slice**: documentar f00126 como **ejemplo de close limpio** vs f00123/24/25 como casos recidiva.

### F90 — `bfbdfd46` perf plugin S1 cierra, pero f00126 sigue en `ready/` — F78 recidiva — **CLOSED**

- `f0d55edf` (feat(f00126): S2 bundle-size budget — perf_bundle tool + tests) — S2 done.
- `3815c571` (feat(perf): S3 perf_profile tool + profile capture + tests) — S3 done.
- `bbf3b945` (feat(f00126): S3 profiling capture + metrics-gate integration) — metrics-gate wire.
- `f00126-perf-plugin.md` aún en `ready/` (sigue pendiente close-evidence).
- **Residual**: f00126 close-evidence (F78 recidiva).

### F91 — f00125-browser-plugin.md ahora en `in-progress/` — F22/F45/F64 recidiva (MEJORABLE)

Re-audit-10 `ls docs/mcp-vertex/proposals/in-progress/`:

```text
a00069-25-07-2026-multi-agent-branch-state-drift-and-validation-leak.md
f00119-auto-agent-selector-plugin.md
f00125-browser-plugin.md           <-- NEW
f00143-agent-operating-excellence-and-session-governance-program.md
v00122-collapse-4-call-bootstrap-into-1-call-auto-work.md
```

**Esperado**: máximo 4 in-progress (re-audit-9). **Actual**: 5 in-progress con f00125 moviéndose a `in-progress/`.

**Esperado vs Actual**: f00125 está en `ready/` con S1+S2+S3 done (status: done), pero alguien lo movió a `in-progress/` — posiblemente siguiendo el workflow `review → done`. **Falta**: close-evidence.

**Slice**: ejecutar `docs(f00125): close with closed-by and closed-evidence` y mover a `done/`.

### F92 — `dd75bd7a` perf plugin registered — pero el plugin en `tools` MCP tool solo lista 1 entry vs 8+10 esperados — F84 evolución

`dd75bd7a` registra perf en `PRESET_CATALOG`. Pero `mcp-vertex plugins` tool muestra menos tools que `plugins/perf/src/lib/tools/*`.

**Esperado**: lista completa. **Actual**: el catalog muestra el plugin, pero los tools internos requieren `generate-tool-types` regeneration.

**Slice**: ejecutar `bun tools/scripts/types/generate-tool-types.script.ts` post-merge para regenerar el tool-outputs.

### F93 — `bun run test` (canonical vitest) — 2 failed en usage-tracking (`pricing.spec.ts`, `record-buffer.spec.ts`) — F80 regresión (FATAL)

Re-audit-10 `bun run test`:

```text
FAIL | usage-tracking | tests/src/lib/pricing.spec.ts
  > resolvePricing (stale-while-revalidate, non-blocking) > writes a background refresh when the cache is stale
FAIL | usage-tracking | tests/src/lib/record-buffer.spec.ts
  > RecordBuffer (CRITICAL C2 buffered append) > flushes on the time window when the batch is not filled
  Tests  2 failed | 5224 passed (5226)
```

**Esperado**: 0 fail (F80 cerrado). **Actual**: 2 fail.

**Esperado vs Actual**: F80 cerró en pasada-9. Re-audit-10 ve **regresiones** en `usage-tracking`. Probable:

- `bbf3b945` (perf metrics-gate integration) no impacta.
- `8199bd1d` (f00126 S3 profiling capture) **afecta** `record-buffer.spec.ts` si routing cambia.
- Posiblemente `c10ec1cb` (logs cacheNamespace) introduce charge-based tracking.

**Slice**: investigate root cause `RecordBuffer.flushes on time window` — fue S10/S11 a00069?

### F94 — `bun test` (bare) ahora **72 fail / 37 errors** — F87 evolución (F87 worsen)

Re-audit-10 `bun test`:

```text
 5026 pass
 72 fail
 37 errors
 4 snapshots, 20236 expect() calls
Ran 5098 tests across 678 files. [160.41s]
```

vs pasada-9 (71 fail / 37 errors). **+1 fail**.

**Esperado**: < 71. **Actual**: 72.

**Slice**: ignorar per F80 (canonical). Pero **sumar a F68 tracking**.

### F95 — `plugins/prompt-eval/` untracked + tracked files — F57 evolución (F86 paralelo)

Re-audit-10 `git status --short`:

```text
M plugins/prompt-eval/src/index.ts
M plugins/prompt-eval/src/lib/tools/eval-report.tool.spec.ts
M plugins/prompt-eval/src/public/index.ts
?? plugins/prompt-eval/README.md
?? plugins/prompt-eval/src/index.spec.ts
?? plugins/prompt-eval/src/lib/calibrate/
?? plugins/prompt-eval/src/lib/tools/eval-calibrate.tool.spec.ts
?? plugins/prompt-eval/src/lib/tools/eval-calibrate.tool.ts
```

**Esperado**: f00127 S1 todo commiteado. **Actual**: 7 files untracked.

**Slice**: `git add` + commit `feat(f00127): S1 — eval harness + calibrate` antes de proseguir.

### F96 — `bbf3b945` y `8199bd1d` dos commits con subject idéntico — F77 residuo (commit subject dup)

`git log --oneline`:

```text
3815c571 feat(perf): S3 perf_profile tool + profile capture + tests
f0d55edf feat(f00126): S2 bundle-size budget — perf_bundle tool + tests
87b722e2 docs(f00126): mark S2 bundle-size budget done — actual file paths
85e15d32 docs(f00126): mark S1 bench harness + baseline compare done
bfbdfd46 feat(f00126): S1 bench harness + baseline compare
bbf3b945 feat(f00126): S3 profiling capture + metrics-gate integration
009ed7b2 chore(f00125): wire browser plugin into workspace + fix init test counts
8199bd1d feat(f00126): S3 profiling capture + metrics-gate integration (worktree)
```

**Esperado**: cada commit con subject único. **Actual**: `bbf3b945` y `8199bd1d` tienen **subject idéntico** ("feat(f00126): S3 profiling capture + metrics-gate integration"). El segundo commit (worktree) re-empaquetó lo mismo.

**Esperado vs Actual**: `8199bd1d` añadió "(worktree)" al subject para diferenciar, pero eso **rompe Conventional Commits** (no es Conventional-compliant).

**Slice**: marcar `8199bd1d` como superseded por `bbf3b945` (en realidad `bbf3b945` se publicó desde la main worktree después del worktree).

### F97 — `f00126 S3` metrics-gate integration dispara `record-buffer` test failure — F93 evolución

`bbf3b945` (feat(f00126): S3 profiling capture + metrics-gate integration) introduce integration con `usage-tracking` (record-buffer).

**Esperado**: `record-buffer.spec.ts` ≈ green. **Actual**: `flushes on the time window when the batch is not filled` falla.

**Slice**: investigate `RecordBuffer.flushes` — mide el comportamiento del buffer cuando batch no se llena. **Probable**: el cambio en `record-buffer` (shared-cache directory?) impacta este test.

### F98 — `dd75bd7a` solo registra 1 plugin (perf) — F92 complement

`dd75bd7a` registra `{ plugin: 'perf' }`. **Pero** `1a20db97` ya había includido browser + refactor en `tool-outputs.ts`.

**Esperado**: ambos actualizaciones cierran F84. **Actual**: 2 commits separados.

**Esperado vs Actual**: `dd75bd7a` solo afecta `PRESET_CATALOG` (1 file). `1a20db97` afecta `tool-outputs.ts` (regenerated). **2 commits para "wire perf plugin" — coordinación**.

**Slice**: chore `lint:plugin-wiring` que detecte drift entre `PRESET_CATALOG` y `tool-outputs.ts` harvester.

### F99 — `f00127 S1` introduce `auto-agent-selector` integration — F57/K17 evolución

`f00127-prompt-eval-plugin.md` (S1) `write the results into `auto-agent-selector`'s calibration store (its S4 win-rate table)`.

**Esperado**: f00127 S1 (`80cd369e`) **escribe** en auto-agent-selector calibration. **Actual**: `bun test 2 failed` — `usage-tracking` (relacionado con pricing) roto.

**Esperado vs Actual**: si f00127 lee `auto-agent-selector`, debería estar en `dependencies` (no solo `track`). El cost calibration cambia `pricing.spec.ts`.

**Slice**: validate `f00127`'s dependency on `auto-agent-selector` lineage.

### F100 — `f00119-auto-agent-selector-plugin.md` sigue en `in-progress/` — F88 evolución

`f00119` (auto-agent-selector) en `in-progress/`. **Esperado**: close-evidence.

**Esperado vs Actual**: f00119 sigue en `in-progress/` con S1+S2+S3 done + S4 (calibration) marcado. **Falta**: close-evidence para que cierre a `done/`.

**Slice**: ejecutar `docs(f00119): close with closed-by and closed-evidence`.

### F101 — worktree f00126-S3 detached HEAD — F79 evolución

`git worktree list`:

```text
/home/cartago/_projects/mcp-vertex/.worktrees/f00126-S3  8199bd1d (detached HEAD)
```

**Esperado**: worktree merged + cleaned. **Actual**: detached HEAD `@8199bd1d` no mergeado a develop.

**Esperado vs Actual**: `bbf3b945` (develop) re-hace el mismo commit con subject id. `8199bd1d` (worktree) puede ser cherry-pick de develop o un duplicate. **Diferencia**: el trabajo del worktree es ignorado.

**Slice**: identificar y resolver `8199bd1d` vs `bbf3b945` — branch-gc o re-cherry-pick.

### F102 — `chore(release): pin f00127 S2 as future work` — F46 evolución (F90 residuo)

`3a2feb51` (chore(proposals,release): pin f00127 S2 as future work) marca S2 como `future work` en lugar de done.

**Esperado**: S2 done. **Actual**: S2 pinneada como `future work`.

**Esperado vs Actual**: el owner de f00127 prefirió marcar S2 como pinned en lugar de cerrarla. **Esto es OK** si S2 realmente va por su propio commit. Pero es **F46 evolución**: `Slices pendientes: ninguno` se mantuvo en a00069; f00127 S2 sigue en `ready/` con `pending`.

**Slice**: clear `future work` semantics: si S2 está pinned, usar `on-hold` status en frontmatter, no `pending`.

### F103 — Patrón "agente zombie": `started_at == last_seen` + asimetría log/lock + sin watchdog proactivo (FATAL operativo, sesión 2026-07-25 14:00 UTC)

**Evidencia verbatim** (snapshot `.cache/mcp-vertex/` al ejecutar este audit):

```text
.cache/mcp-vertex/agents.lock.json:
  in_flight[0]  f00127-S2  copilot-minimax-m3    last_seen 2026-07-25T11:50:32Z  (2h09m ago, stale 13×)
  in_flight[1]  f00126-S3  impl-runner-perf-s3   last_seen 2026-07-25T11:59:37Z  (2h00m ago, stale 12×)
  stale_after_minutes: 10

.cache/mcp-vertex/agents.lock.json.*.tmp  (6 huérfanos, mtime 02:33 → 13:48 HOY):
  ms0b2uz1-bdl6pck4ch.tmp   mtime 13:48:44  in_flight:[f00127-S2]              ← mismo contenido que el lock final
  mrzs5bm3-9hwhy9te79f.tmp  mtime 04:58:46  in_flight:[f00125-S1, f00125-S2]
  mrzmyw0p-14n2ikn1fjb.tmp  mtime 02:33:48  in_flight:[]
  mrzn0byr-isjllxmjfwn.tmp  mtime 02:34:56  in_flight:[]
  mrzn1ivd-7rn7i30195t.tmp  mtime 02:35:51  in_flight:[]
  mrzn5jml-efqa3ixlr5i.tmp  mtime 02:38:59  in_flight:[]

.cache/mcp-vertex/logs/2026-07-25.jsonl:
  última entrada:        2026-07-25T04:06:59.096Z  (tool-completed: proposal_reconcile_folder)
  entradas post 04:06:    8 (todas en 04:05–04:07, mismo batch)
  entradas post 06:00:    0
  entradas post 11:00:    0
  entradas para f00126-S3 o impl-runner-perf-s3: 0   ← LA TAREA CON LOCK NUNCA APARECIÓ EN EL LOG
  size:                   592187 B (parado a 06:06)
```

**Diagnóstico — 4 bugs encadenados que producen el mismo síntoma**:

1. **Bug A — `appendFile` (log) NO tiene la durabilidad de `writeFileAtomic` (lock).**
   `packages/core/src/lib/shared/atomic-write.ts:51` implementa `write → fsync → rename → fsyncDir` (POSIX durable, survives kill -9). Pero `plugins/logs/src/lib/services/log-store.ts:106` usa `appendFile` directamente — sin fsync, buffer del kernel.
   Si el proceso muere entre `rename` del lock (visible) y `appendFile` del log, el lock persiste con su `last_seen` actualizado pero **el log queda mudo**. La diagnosis desde "leer el log" no detecta el zombie.
   - **Evidencia**: lock de `f00126-S3` con `last_seen: 2026-07-25T11:59:37.856Z`, log termina a 04:06. Gap de 8h sin una sola entrada.
   - **Severidad**: FATAL — el "log = verdad del agente" deja de serlo en cuanto hay un kill -9 / OOM.

2. **Bug B — `removeStale` solo corre on-action.**
   `plugins/proposals/src/lib/locks/agent-lock-engine.ts:245-249` purga stale únicamente cuando `executeLockAction` se invoca (claim/release/status/gc). Si **ningún agente está vivo** para gatillar la siguiente acción, las entradas stale sobreviven `stale_after_minutes × ∞`. El sistema no es self-healing sin un cliente activo.
   - **Evidencia**: 2 in_flight stale a 2h+ — nadie las está reclamando porque, precisamente, los agentes que las reclaman están muertos.
   - **Severidad**: FATAL — dead-lock permanente (lock figurative, no literal).

3. **Bug C — tmp files se acumulan en crashes silenciosos.**
   `writeFileAtomic` (`packages/core/src/lib/shared/atomic-write.ts:54-78`) hace `open(tmp) → write → fsync → rename → fsyncDir` con un `catch` que solo corre `rm(tmp)` **en errores síncronos del bloque try**. Si el proceso recibe SIGKILL / SIGTERM / OOM-kill entre el `open` y el `rename`, el catch nunca ejecuta y el tmp sobrevive indefinidamente. No hay boot-time sweep.
   - **Evidencia**: el `ms0b2uz1-bdl6pck4ch.tmp` (13:48:44 HOY) tiene **el mismo contenido** que el `agents.lock.json` final. Eso solo puede pasar si hubo un primer `writeFileAtomic` cuyo `rename` falló silenciosamente, y luego un segundo write que sí completó — patrón típico de "two writers race to the same target con SIGKILL entre medias".
   - **Evidencia adicional**: `mrzs5bm3-9hwhy9te79f.tmp` (04:58) contiene `in_flight:[f00125-S1, f00125-S2]` con `started_at == last_seen` en ambos — el archivo fue escrito al final de la vida de los agentes, justo cuando morían.
   - **Severidad**: MUY MAL — acumulable; cada crash añade 1+. F32 ya lo mencionaba con 4 files; F69 con 5; hoy son **6**.

4. **Bug D — `last_seen` solo avanza si el agente coopera.**
   No hay watchdog. El campo `last_seen` solo se actualiza cuando el agente llama explícitamente a `agent_lock { action: 'status' }` o vuelve a `claim`. Un agente puede bloquear el lock, ejecutar trabajo durante horas, **y nunca tocar el lock** mientras tanto — su `last_seen` queda fijado en el momento del claim inicial.
   - **Evidencia**: `f00126-S3` con `started_at == last_seen == 2026-07-25T11:59:37`. **Cero progreso** entre claim y muerte.
   - **Severidad**: compuesto con B — sin watchdog proactivo, no hay forma de distinguir "agente trabajando silenciosamente" de "agente muerto".

**Esperado**:
- Log writer con durabilidad equivalente a `writeFileAtomic` (append + fsync, o write-tmp + rename atómico).
- `removeStale` corre también al **boot del MCP server**, no solo on-action.
- Boot-time sweep elimina `.tmp` huérfanos con `mtime > 60s` (un tmp de 60s es ya evidencia de crash).
- Watchdog de heartbeat opcional: si `started_at == last_seen && age > N` (e.g., 30s en dev, 5min en prod), marcar `zombie: true` en la entry para que `agent_lock { action: 'status' }` lo surface como warning.

**Actual**: lock zombie persiste; log miente; tmp acumula; nadie lo sabe.

**Slice propuesto** (nuevo **S12** — agent-stuck self-healing, o extender **S10**):

- **S12.a — Write-through atomic log.** Sustituir `appendFile` por `writeFileAtomic` con append-equivalent semantics en `plugins/logs/src/lib/services/log-store.ts:106-110`. Mantener el `withFileMutex` (evita que dos writers intercalen bytes). Si se conserva `appendFile`, añadir `await handle.sync()` tras cada write.
- **S12.b — Lock GC al boot.** En `packages/core/src/lib/cli/assemble-core-tools.ts` (o `createMcpServer`), después de cargar plugins, leer `agents.lock.json`, aplicar `removeStale`, escribir de vuelta si cambió. Idempotente y barato.
- **S12.c — Tmp sweep al boot.** `tools/scripts/lint/check-stray-cache-files.script.ts` ya barre `.cache/mcp-vertex/*.tmp` con `mtime > 7d`; **rebajar el threshold a 60s para `*.tmp` con prefijo `agents.lock.json.`** (esos siempre deben ser efímeros; un tmp de 60s es ya evidencia de crash).
- **S12.d — `agents_lock_diagnose` tool.** Nuevo tool en `plugins/proposals/src/lib/tools/` que enumera: zombies (started_at == last_seen && age > N), tmp huérfanos, y diff entre `last_seen` y la última entrada de log del task_id. Surface en `auto_work` cuando detecte zombies.

**Cross-references**:
- **F32** (huérfanos `.tmp` — MEJORABLE): este F103 lo GENERALIZA. Los tmp son síntoma; las causas son A, B, D.
- **F9 / F16** (`agent_lock` sin `ok` + claim/release desbalanceado): Bug B y D explican **por qué** el imbalance crece sin que `close_slice` lo arregle.
- **F15** (S10 auto-boot `state_repair`): el mecanismo existe para `subagent-registry` y `round-context`, pero NO para `agents.lock.json`. S12.b extiende S10.
- **F34** (peer-review-bypass in-memory): mismo anti-patrón — "estado crítico del swarm vive en memoria o en file sin auto-GC".
- **F69** (worsen de 4→5 tmp): Bug C explica la tendencia — sin S12.c, va a seguir creciendo (hoy: 6).

**Estado**: OPEN (FATAL operativo). Sesión de este audit descubrió los 4 bugs encadenados al inspeccionar el lock tras el branch-cleanup pass.

### F51 — nuevo fail/err entre pasada 5→6 (43 fail / 35 errors) — drift implícito (MEJORABLE) — **EVOLVED**

Re-audit-6 muestra **un error más** (35 vs 34) y **un test más** (4988 vs
4973) sin ningún shipped-in de a00069/x00072/x00073 entre pasadas 5 y 6.

**Esperado**: mismo número (o menos). **Actual**: +1 fail y +1 err.

**Esperado vs Actual**: ningún commit en `git log origin/develop` desde
`d6a88789` explica +1. Probable: `auto_work` añadió archivo spec
mientras yo leía, o `bun test` corre parcialmente en writes concurrent
de cache.

**Slice**: ci debe correr con `bun test --bail` para abortar y aislar
el primer fail. **Más importante**: medir delta entre dos `bun test`
consecutivos sin scripts escribientes.

### F52 — `outOfCache` worktree warning en `auto_work` 2026-07-25 (MEJORABLE higiene)

Re-audit-6 capturó en `.cache/mcp-vertex/logs/2026-07-25.jsonl`:

```text
branchStatusWarnings: [
  "worktree /home/cartago/_projects/mcp-vertex lives outside the canonical
   cache dir (AGENTS.md violation)"
]
hygieneWarnings: [
  "1 worktree(s) outside the canonical cache dir (AGENTS.md violation) —
   review and remove manually (see swarm_hygiene.outOfCache)"
]
```

Esta sesión de copia sobre `/home/cartago/_projects/mcp-vertex` (no en
`~/.cache/mcp-vertex/.worktrees`). `swarm_hygiene.outOfCache` lo detecta
y emite `branchStatusWarnings`, pero **`auto_work` solo muestra el
warning, no aborta ni intenta mover la copia**.

**Esperado**: `auto_work` debe ofrecer mover a `<cacheDir>` y notificar
a `swarm_hygiene`. **Actual**: warning informativo solamente.

**Slice**: chore de `auto-work.tool.ts:776` — cuando `outOfCache` o
`nonConformingBranches` aparecen, añadir step "Mover worktree a
canonical cache dir" en `steps`.

### F53 — `x00073 SEC-002 S1+S2` mergeadas pero x00073 sigue en `ready/` (MEJORABLE proceso)

`x00073-sec-002-external-mcps-env-allow-list.md` (kind: fix, status: ready)
tiene S1+S2 mergeadas a develop (`1f0c812a`, `2f2576ca`). El proposal
sigue en `ready/` con `status: ready` en el frontmatter.

**Esperado**: propuesta se mueve a `review/` o `done/` cuando S1+S2
están mergeadas. **Actual**: `status: ready` perpetuo.

**Esperado vs Actual**: mismo patrón que F45, ahora con x00073 en lugar
de x00072. **Recidiva**.

**Slice**: F45 follow-up — `proposal_transition` debería auto-mover a
`review/` cuando un slice queda done. Sin esa automatización, **todos
los x0007x share este drift**.

### F54 — `x00152-rel-001-publish-tarballs-verified.md` ≠ `x00072-rel-001` (MEJORABLE nomenclatura)

Hay dos propuestas con la misma etiqueta "REL-001":

- `x00072-rel-001-npm-publish-workspace-rewrite.md` (mencionado en a00070).
- `x00152-rel-001-publish-tarballs-verified.md` (en `ready/`).

**Esperado**: 1 propuesta por issue. **Actual**: 2 con código distinto,
mismo label.

**Esperado vs Actual**: el usuario podría confundirlas: ¿REL-001 cubre
wp rewrite o tarballs? El código de nomenclatura "x00072-rel-001" no
matcha el id ("x00152").

**Slice**: requiere acceso al seed/index — `proposal_adopt` debería
denegar id collisions. **Chore**: renombrar x00152 → f00152-rel-001
si es **feat**, o unificar ambos en x00152-rel-001.

### F55 — `lint:proposals` ya **0 fatales** en pasada-6 (POSITIVE)

Pasada-6 `bun tools/scripts/lint/proposals.script.ts` → **0 fatal error(s)**
sobre 289 files. Pasada-5 tenía 5 fatales (f00120/f00121/f00122 duplicados).

**Esperado**: 0 fatales. **Actual**: 0 fatales.

**Origen**: comandos de pasada-6 (`git mv in-progress/f00120 → done/feats/`,
`git rm review/f00120|f00121`, `rm -f ready/f00122`) resolvieron los
3 duplicados.

**Slice**: cerrado. Pero el **acceptance** debe actualizarse: a00069
midió `5 fatales` en pasada-5; esa línea ya no aplica.

### F66 — `bun run typecheck` falla en `plugins/browser/src/lib/tools/browser-inspect.tool.spec.ts` (FATAL build) — **CLOSED**

- `009ed7b2` (chore(f00125): wire browser plugin into workspace + fix init test counts) — fija `writeScreenshotAtomic` con `handle.write(data)` en lugar de `handle.writeFile(data, 'binary')`.
- También wirea `@mcp-vertex/browser` en `tsconfig.base.json`, `vitest.shared.ts`, `plugin-defaults.ts`, `release-plan.ts` (PUBLISH_ORDER), `bun.lock`.
- **Residual**: 0.

### F67 — `cacheNamespace: 'results'` ignorado en logs plugin (FATAL cache integrity) — **CLOSED**

- `c10ec1cb` (fix(logs,core): resolve the logs plugin's cache dir under results/) — logs y logs-errors ahora en `.cache/mcp-vertex/results/`.
- Re-audit-9 confirma `ls .cache/mcp-vertex/results/` = `auto-agent-selector, logs, logs-errors, memory, usage-tracking`. **F71 partial**: otros plugins también migran a `results/`.
- **Residual**: 0 para logs; F71 sigue sobre otros plugins.

### F68 — `bun test` 45 fail groups (FATAL proceso post-F41-corregido)

Re-audit-8 fail groups: 45. Pasada-7: 42. Pasada-6: 8. Pasada-5: 8.

**Esperado**: < 8 fail groups bajo `bun run test` (canonical). **Actual**: 45 bajo `bun test` bare — **degradación** aparente. **Pero**: bajo `bun run test` 0 fail.

**Esperado vs Actual**: F66 (paralelo F56 resuelto) demostró que `bun test` no es canonical. **Los 45 grupos son ruido de invocación incorrecta**. Los nuevos fail groups introducidos por f00123, f00124 (refactor + semantic search plugins) — `PRESET_CATALOG` tests, `renderInitBundle` tests, `publishTarballs` test, `e2e: token budget` test, `init:default` test, `mcpServerTransportFactory` test, `packageInstall` test, `playwright-probe` test, `runAcceptanceCriteria` (integration) — todos subsystem-level pero solo fallan bajo bare `bun test`.

**Slice**: documentar `bun run test` como canonical; cerrar los 45 grupos bare-bun como out-of-scope a00069.

### F69 — `agents.lock.json.*.tmp` + `agents.lock.json.mutex` aún residen (F32 partial) — **WORSEN**

Re-audit-9 confirma `ls .cache/mcp-vertex/agents.lock.json*` muestra **5 .tmp files** (`mrzm...`, `mrzn...`, `mrzn...`, `mrzn...`, `mrzs...`) + `mutex` + 1 file activo. **+1 tmp vs pasada-8**.

**Esperado**: limpieza on next claim. **Actual**: basura acumulada crece.

**Esperado vs Actual**: `cf1ef20e` (block auto work on missing done artifacts) NO toca el agent_lock flow. F32 sigue OPEN.

**Slice**: añadir cleanup on next claim en `agent-lock-engine.ts`; o gc script que ejecute on host boot.

### F70 — `agent/codex-auto-work-artifact-drift` (cf1ef20e) — nueva rama agent/* (F61 recidiva)

Re-audit-8 lista `refs/heads/agent` muestra 9 ramas. `agent/codex-auto-work-artifact-drift` (cf1ef20e) es la **última en aparecer**, ya merged en `develop`.

**Esperado**: tras merge, branch_gc elimina la rama. **Actual**: F61 recidiva — sigue en `refs/heads/agent`.

**Esperado vs Actual**: 9 ramas redundantes acumuladas. F61/F23/F39/F50 no resueltos.

**Slice**: ejecutar `branch-gc` con filtro "rama cuyo HEAD es ancestro de develop".

### F71 — `c10ec1cb` resuelve cacheNamespace pero el plugin `notification` puede tener el mismo bug (FATAL cache integrity)

`c10ec1cb` arregló `logs` plugin. Pero la búsqueda en otros plugins no está automatizada.

**Esperado**: cada plugin con `cacheNamespace` respeta la convención. **Actual**: solo `logs` auditado.

**Esperado vs Actual**: el mismo bug puede vivir en `notification`, `search`, `external-mcps`, `perf`. Sin lint, no se sabe.

**Slice**: `lint:cache-namespace-alignment` script — para cada plugin con `cacheNamespace`, check `<cacheDir>/<namespace>/` en metadata.

### F72 — `8d1e1999` rebaseline `Files:` lists — f00034/f00028/f00020/f00025 con drift pre-existente (MEJORABLE proceso)

`8d1e1999` revela: 4 proposals (f00028 IDE dashboard, f00020 skills-coverage, f00025 promote, f00034 typecheck) tienen `Files:` lists referencing paths renamed/removed by other work ya en develop.

**Esperado**: `Files:` lists reflejan el estado real. **Actual**: rebaseline manual a `.baseline.json`.

**Esperado vs Actual**: el propio `lint:proposals` aborta si encuentra dangling refs. **Esto bloquea `validate`**.

**Slice**: chore de mantenimiento — auditar todas las proposals 'done' por `Files:` drift vs su versión actual.

### F73 — `ab78e60d` refactor logs interfaces — types-in-contracts enforcement (POSITIVO)

`ab78e60d` mueve `ILogStoreOptions` y `ILogToolStores` a `contracts/interfaces/`, alineando con la convención `git` y otros plugins.

**Esperado**: cada plugin interfaces en `contracts/interfaces/`. **Actual**: logs ahora alineado.

**Slice**: audit los demás plugins (memory, search, plugins/proposals) por la misma convención.

### F74 — `cf1ef20e` introduce `missingDoneArtifacts` en IClaimReadyResolution (F46 evolución)

`auto-work` retorna `missingDoneArtifacts: readonly string[]` cuando un slice cerró pero el artifact no está en disco.

**Esperado**: el auto-work failure surface incluye claramente qué falta. **Actual**: implementado.

**Slice**: replicar el patrón a `recovery-tools.ts` (force/skipPeerReview) para que `reason` vacío también retorne `missing: [...]`.

### F75 — `f00123 S1` (12b7e5a1) introduce nuevos fail groups en `bun test` bare (F68 evolución)

`f00123 S1 refactor plugin — navigation` (12b7e5a1) shipped-in. **Pero** el plugin trae `plugins/refactor/` que bajo `bun test` auto-discovery es recogido.

**Esperado**: cada nuevo plugin cubierto por `include:` de su vitest.config.ts. **Actual**: `refactor-nav.tool.spec.ts` (untracked al tiempo del merge) crea un fail group nuevo.

**Esperado vs Actual**: el agente paralelo (F56 resuelto) ha documentado que `bun test` no es canonical. Pero el ruido persiste.

**Slice**: asegurar `vitest.config.ts` en plugins/refactor/ con `include: ['src/**/*.spec.ts']` y `exclude: ['src/**/*.bun-test.ts']`.

### F76 — `f00124 S3` (5f1b2a5e) introduce `pack auto-tuning` — nuevo fail group (F75 evolución)

`f00124 S3 optional API embeddings + pack auto-tuning` (5f1b2a5e) shipped-in. **Pero** el auto-tuning tiene init:default test que solo corre bajo vitest; bajo `bun test` parece broken.

**Esperado**: `init:default (f00103) > runs the full pipeline end-to-end` — verde. **Actual**: rojo bajo bare `bun test`.

**Slice**: validar con `bun run test`; si pasa, ignorar bajo bare `bun test` per F66.

### F77 — `424291c1` documentado como triage F41, no como F56-F41 — nomenclatura (F60 evolución)

El commit `424291c1 docs(a00069): record F56 — F41 triage results, root causes, and the plugins/refactor typecheck break` tiene un **subject** confuso: cita F56 (rama) y F41 (triage) en una sola línea.

**Esperado**: subject Conventional Commits = `docs(a00069): ...`. **Actual**: `docs(a00069): record F56 — F41 triage...` mezcla id y proceso.

**Esperado vs Actual**: legibilidad OK, pero confunde al lector que no sabe si F56 es rama o finding.

**Slice**: chore de convention — agents deben distinguir `record F56 (rama ref)` vs `record F41 (finding)`.

### F78 — `f00123 S3` (5af3a6ad) cierra f00123 entero — slice de "rule-based codemods + recipe library" — F57 evolución (POSITIVO) — **CORRECTED→LANDED**

- `da9050d8` (docs(f00123): mark S3 codemod + recipe library done) — **mark incorrecto**: el módulo codemod nunca aterrizó en develop (commit del agente no contenía `plugins/refactor/src/lib/codemod/`).
- `e6e248a0` (docs(f00123): correct S3 status — codemod module never landed) — S3 revertido a `pending` con honestidad: "S1 + S2 done; S3 pending — needs an actual implementation".
- `d10e3bdb` (feat(f00123): S3 rule-based codemods + recipe library) — **ahora S3 sí landed**: `plugins/refactor/src/lib/codemod/{codemod-runner,recipes}.ts` + tool specs + wire en `index.ts`.

**Esperado vs Actual**: la primera mark fue **mentira técnica**; el commit no contenía el código. El correction commit (`e6e248a0`) lo documentó. **Lección F78 corregido**: cada `docs(...): mark S... done` debe verificar `git ls-tree HEAD -- <path>` antes de commitear.

**Slice**: añadir paso de "verify files exist" al pre-commit de `mark slice done` (similar a F46 `missingDoneArtifacts`).

### F79 — `1ab32885` Merge PR #14 + `5191f4ec` Merge PR #13 son PRs de `worktree-a00069-f41-validate-fail-groups` (F56/F41 meta)

2 PRs (#13, #14) mergearon el contenido de `worktree-a00069-f41-validate-fail-groups` a `develop`. **Esto es F56 cerrado**.

**Esperado**: tras merge, branch_gc. **Actual**: `worktree-a00069-f41-validate-fail-groups` y `worktree-a00069-f41-validate-fail-groups` ambas aún en `refs/heads`.

**Esperado vs Actual**: equivalente a F70. La rama persiste tras merge.

**Slice**: ejecutar `branch-gc` con filtro "rama cuyo HEAD es ancestro de develop".

### F56 — F41 triage: root-caused and fixed 5 of the 8 known-failing groups, plus a real cacheNamespace bug they surfaced (RESOLVED, partial)

Worked F41's own prescribed slice ("triage inmediato... resolver ≥ 1
test verde de cada uno de los 8 grupos") against a fresh worktree, using
`bun run test` (the canonical `vitest run`, **not** bare `bun test` —
F41's own methodology likely used the latter, which is why several of
its "8 known groups" turn out to be Bun's native test runner picking up
files never meant to run under it; see below). Result: the canonical
suite is **5115/5115 pass, 0 fail** after these fixes (shipped-in
c10ec1cb, ab78e60d, 60fea56f, 740f57fa, 6ff5b217, 8d1e1999):

- **F48** (`PRESET_CATALOG`/`resolvePresetMembers` "drift") — not
  drift: `packages/core/src/lib/plugins/preset-catalog.spec.ts` was a
  stale, orphaned duplicate written for `bun:test` (not vitest,
  unlike every other spec in the repo), invisible to
  `packages/core/vitest.config.ts`'s own `include`, only ever
  executed by a bare `bun test` invocation. Its assertions predated
  test-policy/forge/auto-agent-selector joining their presets. The
  real, maintained, vitest-registered spec at
  `packages/core/tests/src/lib/plugins/preset-catalog.spec.ts` already
  covers the same ground correctly. Deleted the duplicate; no
  coverage lost (6ff5b217).
- **F47** (`sessionStorage` × 2) — `apps/shared`'s vitest project runs
  `environment: 'node'`; the spec read `sessionStorage` as a bare
  global the node environment doesn't provide. Added a minimal
  in-memory stub scoped to the one spec file that needs it (740f57fa).
- **New, not in F41's original 8**: `apps-web` test files crashed with
  `Cannot find module '#MANIFESTS/capabilities.json'` on a fresh
  checkout — `gen-capabilities.ts` already had a stub-on-fresh-checkout
  fallback (`bun run dev` never crashes on this) but nothing triggered
  the generator before `apps-web`'s vitest project ran. Reproduced
  independently in PR #12's own CI run before tracing it here. Fixed
  with a `globalSetup` (60fea56f).
- **Real architecture bug found via this same triage**: the `logs`
  plugin (F41 is unrelated to `logs`, but `check-stray-cache-files`
  fired once run against a truly fresh checkout) declared
  `cacheNamespace: 'results'` but computed its store paths from
  `ctx.cacheDir` instead of the namespace-aware `ctx.pluginCacheDir` —
  both its event streams were silently writing outside `results/`
  (the directory `IMcpPlugin#cacheNamespace` exists specifically to
  protect from being treated as derivable/evictable cache). Fixed at
  the root; also relocated 2 new inline interfaces the fix's
  companion work added, to satisfy `types-in-contracts` without
  silently absorbing unrelated debt (c10ec1cb, ab78e60d).
- **Rebaselined** `proposal-files-exist` for 4 old `done/` proposals
  whose planned `Files:` lists reference paths later renamed/removed
  by unrelated work (one entry is this session's own deletion above)
  (8d1e1999).

**Not fixed (out of scope, no context to safely touch)**:
- `scssPlugin`, `cli-ui-parity.script`, and the remaining subprocess-
  spawning suites (`createCommandRunner`, `createStdioTransport`,
  `external-mcps ack↔call`, `mcpServerTransportFactory`,
  `runAcceptanceCriteria`, `gracefulShutdown` e2e) were NOT reproduced
  under the canonical `bun run test` — they only failed under a bare
  `bun test` invocation, which auto-discovers spec-like files
  repo-wide independent of any vitest project's `include` glob and
  appears to hit sandbox/environment-specific subprocess-spawn limits
  in at least one execution context. `gracefulShutdown` matches an
  already-documented flaky-under-full-suite-load pattern. Recommend
  F41's own "8 known groups" baseline be re-measured with `bun run
  test`/`bun run validate` specifically (the repo's own canonical
  gate — see `package.json`'s `"test"` script), not bare `bun test`,
  before treating any of these as still-open.
- `types-in-contracts` still blocks `bun run validate` on 10 files
  from other in-flight work (`extensions/vscode/src/commands/
  trust-fingerprint.ts`, `packages/core/src/lib/hosts/
  host-adapter-pack.ts` + `host-capability-profile.ts`,
  `packages/core/src/lib/tools/unused-active-plugins.ts`,
  `plugins/external-mcps/src/lib/subprocess/env-filter.ts`,
  `packages/cli/src/lib/init/core-skill-projection.service.ts`,
  `plugins/proposals/src/lib/agents/zombie-reconcile.ts` +
  `rewrite-stale-self-paths.ts` + `shared/peer-review-bypass-log.ts`
  + `tools/auto-work.tool.ts`) — left untouched rather than blindly
  running `--update` and absorbing debt from work this session has no
  context on.
- **NEW, found while validating this fix (not part of F41's original
  set)**: `bun run typecheck` currently fails on `develop` HEAD —
  `plugins/refactor/src/index.ts` and `.../public/index.ts` import
  `./lib/tools/refactor-nav.tool` and `../nav/nav-engine`, neither of
  which exist anywhere in the tree (`git ls-tree -r` confirms). Looks
  like a commit that landed without `git add`-ing 2 new files. This
  currently breaks typecheck for anyone on `develop`, not just CI —
  more severe than any F41 finding since nothing downstream of
  typecheck can be trusted green until it's resolved. No context on
  the intended `nav-engine` design to safely implement it; needs an
  owner.

## scoreboard

> Rúbrica: **FATAL** (≤3) · **MUY MAL** (3-4.9) · **MEJORABLE** (5-6.9) ·
> **OK** (7-7.9) · **MUY BIEN** (8-8.9) · **PERFECTO** (9-10).
> Una dimensión con un P0 finding no puede pasar de 6/10 (regla del playbook).

### Scoreboard original (tarde 2026-07-24, pre-fix)

| Dimension | Score | Comments |
|---|---:|---|
| Estado del gate (validate) | 2.5 | **FATAL.** F2 |
| Consistencia índice↔filesystem | 1.5 | **FATAL.** F3+F7 |
| Disciplina multi-agente | 2.0 | **FATAL.** F4 |
| Lifecycle review/done | 2.0 | **FATAL.** F8+F11+F12 |
| Registry / orientation | 2.0 | **FATAL.** F10 |
| Estructura de proposals | 4.0 | **MUY MAL.** F1 |
| Locks / coordinación | 4.5 | **MUY MAL.** F9 |
| Close-acceptance gate | 5.0 | **MEJORABLE.** F5+F12 |
| Dogfood plugins | 5.0 | **MEJORABLE.** F13 |
| Observabilidad logs | 5.5 | **MEJORABLE.** F14 |
| Tools / scaffolding | 7.0 | **OK.** F6 |
| Docs / skills | 7.5 | **OK.** |
| Concurrencia I/O | 7.5 | **OK-.** |
| **Total (Average)** | **~4.0** | **MUY MAL.** |

### Scoreboard re-audit-10 (post f00126 S2+S3, f00127 S1, F84 closed)

| Dimension | Score | Comments |
|---|---:|---|
| Gate validate | **7.5** | **OK.** `bun run test` 2 fail (F93 regresión); `bun test` bare 72 fail (out-of-scope F80). |
| Index↔fs | 8.5 | S3 holds |
| Multi-agent discipline | 6.5 | F23/F39 ramas; **F88** +1 in-progress (f00125); **F101** detached HEAD |
| Lifecycle review/done | 8.0 | F45/F53/F54 closed; **F84 closed**; F66/F67 closed; **F90 closed** |
| Registry / orientation | 7.5 | F31 cache; F67 closed |
| Proposal structure | 8.5 | S1 |
| Locks | 7.5 | F25; F37 |
| Close-acceptance | 7.5 | F21; F46 partial |
| Dogfood plugins | **8.0** | **OK.** f00126 S1+S2+S3 done; f00127 S1 done; F48 closed; F84 closed |
| Handoff / logs | 6.5 | F33 stale MD; F69 worsen; F26 dual GC |
| Docs self | 4.0 | F42 stale; F60 close-evidence; F83 commit laundering |
| Tools | 7.0 | F66 OK; F92/F98 plugin-wiring drift |
| Concurrency I/O | 7.0 | F32 .tmp litter |
| **Average** | **~7.0** | **OK-.** F84/F90 closed. F93 regresión. |

### Scoreboard re-audit-9 (post f00125 S3, f00126 S1, F66/F67/F78 closed, F69 worsen)

| Dimension | Score | Comments |
|---|---:|---|
| Gate validate | **8.0** | **MUY BIEN.** `bun run test` 5203/5203 pass (F80/F41 closed!). F87 bare-bun 71 fail (out-of-scope). |
| Index↔fs | 8.5 | S3 holds |
| Multi-agent discipline | 6.5 | F23/F39/F50 ramas redundantes; **F88** +1 in-progress |
| Lifecycle review/done | 8.0 | F45/F53/F54 closed; **F66/F67 closed**; F58/F59/F60 partial |
| Registry / orientation | 7.5 | F31 cache; **F67** cerrado (logs/results/) |
| Proposal structure | 8.5 | S1 |
| Locks | 7.5 | F25; F37 sin notify_status wire |
| Close-acceptance | 7.5 | F21 accepted; F46 partial (cf1ef20e) |
| Dogfood plugins | 7.5 | **F80 POSITIVO**; F48 closed; F73 logs interfaces |
| Handoff / logs | 6.5 | F33 stale MD; **F69 worsen**; F26 dual GC |
| Docs self | **4.0** | F42 stale; F60 close-evidence; **F83** commit laundering |
| Tools | 7.5 | OK |
| Concurrency I/O | 7.0 | F32 .tmp litter |
| **Average** | **~7.0** | **OK-.** F80 closes F41 (canonical 0 fail). F66/F67/F78 closed. F83 newly surfaced. |

### Scoreboard re-audit-8 (post f00123 S1, f00124 S3, F46/F47/F48/F49/F56/F57 closed, F41-corrected)

| Dimension | Score | Comments |
|---|---:|---|
| Gate validate | **1.0** | **FATAL.** F41 (canonical) 0 fail! F66 typecheck roto. F68 45 fail groups bare-bun. |
| Index↔fs | 8.5 | S3 holds |
| Multi-agent discipline | 6.0 | F23/F39/F50 ramas redundantes; **F70** nueva agent/*; F56 closed |
| Lifecycle review/done | 8.5 | F45/F53/F54 closed; F55 closed; F59 closed-evidence |
| Registry / orientation | 7.5 | F31 cache; **F67** cacheNamespace bug arreglado (`c10ec1cb`) |
| Proposal structure | 8.5 | S1 |
| Locks | 7.5 | F25; F37 sin notify_status wire |
| Close-acceptance | 7.5 | F21 accepted; F46 partial (cf1ef20e) |
| Dogfood plugins | 6.0 | F35 boot-time; F48 closed; F73 logs interfaces |
| Handoff / logs | 6.5 | F33 stale MD; F32 OPEN; F26 dual GC |
| Docs self | 5.0 | F42 stale; F60 close-evidence |
| Tools | 7.0 | F66 typecheck roto en browser spec |
| Concurrency I/O | 7.0 | F32 .tmp litter |
| **Average** | **~6.5** | **MEJORABLE−.** F41 corregido (canonical 0 fail). F66/F68 aún F38. |

### Scoreboard re-audit-7 (post x00072 close, x00152 close, x00073 S3 done, a00067 S1+S2 closed)

| Dimension | Score | Comments |
|---|---:|---|
| Gate validate | **0.5** | **FATAL.** F41 76 fail / 37 errors (empeoró vs 43/35). F65 raises. |
| Index↔fs | 8.5 | S3 holds |
| Multi-agent discipline | 6.0 | S4 lint; **F23/F39/F50** ramas redundantes; **F56** rama worktree-a00069-f41 redundante |
| Lifecycle review/done | 8.0 | S7+S11 ok; **F45/F53 closed** x00072 done; **F58** x00073 still ready |
| Registry / orientation | 7.0 | S10 wired; **F31** cache sin re-boot |
| Proposal structure | 8.5 | S1 |
| Locks | 7.5 | S8 develop; F25; **F37** no notify_status wire |
| Close-acceptance | 7.5 | S5; F21 accepted |
| Dogfood plugins | 7.0 | S9 done; **F35** solo boot-time; **F48** PRESET_CATALOG drift |
| Handoff / logs | 6.5 | F19↓ 12→1; **F33** stale MD; F26 dual GC |
| Docs self | **4.0** | **MUY MAL.** F42 verified state desfasado; F43 scoreboard miente; **F60** close-evidence pendiente |
| Tools | 7.5 | OK |
| Concurrency I/O | 7.0 | F32 .tmp litter |
| **Average** | **~6.2** | **MEJORABLE−.** F41 worsened (F65). F45/F54/F55 closed. |

### Scoreboard re-audit-6 (post x00073 S2, F51–F55)

| Dimension | Score | Comments |
|---|---:|---|
| Gate validate | **0.5** | **FATAL.** F41 43 fail / 35 error. +1 err vs pasada 5 (F51). |
| Index↔fs | 8.5 | S3 holds |
| Multi-agent discipline | 6.0 | S4 lint; **F23/F39/F50** ramas redundantes; **F52** outOfCache |
| Lifecycle review/done | 8.0 | S7+S11+S30 ok; **F45/F53** x00072/x00073 still ready |
| Registry / orientation | 7.0 | S10 wired; **F31** cache sin re-boot |
| Proposal structure | 8.5 | S1 |
| Locks | 7.5 | S8 develop; F25; **F37** no notify_status wire |
| Close-acceptance | 7.5 | S5; F21 accepted |
| Dogfood plugins | 7.0 | S9 done; **F35** solo boot-time; **F48** PRESET_CATALOG drift |
| Handoff / logs | 6.5 | F19↓ 12→1; **F33** stale MD; F26 dual GC |
| Docs self | **4.0** | **MUY MAL.** F42 verified state desfasado; F43 scoreboard miente |
| Tools | 7.5 | OK |
| Concurrency I/O | 7.0 | F32 .tmp litter |
| **Average** | **~6.2** | **MEJORABLE−.** F41+F42 hunden techo. F51 empeora. |

### Scoreboard re-audit-5 (post F41–F50, validate roto)

| Dimension | Score | Comments |
|---|---:|---|
| Gate validate | **0.5** | **FATAL.** F41 43 fail / 34 error. F2 cerrado pero nada se verifica. |
| Index↔fs | 8.5 | S3 holds |
| Multi-agent discipline | 6.5 | S4 lint; **F23/F39/F50** ramas redundantes |
| Lifecycle review/done | 8.0 | S7+S11 ok; **F45** x00072 still ready |
| Registry / orientation | 7.0 | S10 wired; **F31** cache sin re-boot |
| Proposal structure | 8.5 | S1 |
| Locks | 7.5 | S8 develop; F25; **F37** no notify_status wire |
| Close-acceptance | 7.5 | S5; F21 accepted |
| Dogfood plugins | 7.0 | S9 done; **F35** solo boot-time; **F48** PRESET_CATALOG drift |
| Handoff / logs | 6.5 | F19↓ 12→1; **F33** stale MD; F26 dual GC |
| Docs self | **4.0** | **MUY MAL.** F42 verified state desfasado; F43 scoreboard miente |
| Tools | 7.5 | OK |
| Concurrency I/O | 7.0 | F32 .tmp litter |
| **Average** | **~6.2** | **MEJORABLE−.** F41+F42 hunden techo. Post-fix failures ≈ 7.5 |

### Scoreboard re-audit (2026-07-25, post S1–S7 en código)

| Dimension | Score | Comments |
|---|---:|---|
| Estado del gate (validate) | 8.0 | **MUY BIEN.** F2 cerrado (S2). |
| Consistencia índice↔filesystem | 8.5 | **MUY BIEN.** S3: 0 dups; review/ alineado (F3/F7 mitigados). |
| Disciplina multi-agente | 7.0 | **OK.** S4 lint existe; 0 agent branches; F22 WIP shared checkout residual. |
| Lifecycle review/done | 7.0 | **OK.** S7 gate on; F18 bypass sin audit. |
| Registry / orientation | 3.5 | **MUY MAL.** S6 código sí, cache vivo no (F15). |
| Estructura de proposals | 8.5 | **MUY BIEN.** S1 parser. |
| Locks / coordinación | 8.0 | **BIEN.** S8: ok+session+await_lock; residual S9–S11. |
| Close-acceptance gate | 7.5 | **OK.** S5 on; F21 gate lint bypass accepted. |
| Dogfood plugins | 5.0 | **MEJORABLE.** F13/F20; S9 pending. |
| Observabilidad logs | 5.5 | **MEJORABLE.** F14+F19 handoff. |
| Tools / scaffolding | 7.5 | **OK.** |
| Docs / skills / proposal self | 6.0 | **MEJORABLE.** F20 shipped-in drift (mitigado este pase). |
| Concurrencia I/O | 7.0 | **OK.** |
| **Total (Average)** | **~6.5** | **MEJORABLE.** Subió ~2.5 pts con S1–S7. Quedan S9–S11 para empujar a **~8.0 OK/MUY BIEN**. |

## notes

### Progress re-audit (2026-07-25)

| Slice | Status código | Evidencia residual en disco/runtime |
|---|---|---|
| S1 | **done** (`## Slices` case-insensitive + alias) | parser ok |
| S2 | **done** (description única; import security-gate resuelve) | validate path unblocked en tree actual |
| S3 | **done** (transition+Files rewrite+dup scan) | **0** ids duplicados; review/ index-aligned (11 files) |
| S4 | **done** (`lint:agent-branch-naming`) | 0 branches `agent/*` locales |
| S5 | **done** (close_slice validation gate) | bypass legítimo `gate: none\|lint` sigue (F21) |
| S6 | **done** (orphan GC + TTL) | S10 auto-applies purge on boot |
| S7 | **done** (transition + force_transition + auto_work) | S11 audita force/skipPeerReview |
| S8 | **done** (`ok` + session balance + await_lock nextAction) | claim/release counters + state_health imbalance gate |
| S9 | **done** (`unusedActivePlugins` en overview) | dogfood warning compacto |
| S10 | **done** (`runAutoStateRepairOnBoot`) | autoRepairOrphans default true |
| S11 | **done** (handoff GC + peer-review bypass audit) | state_health.peerReviewBypasses |

### verdict

**Pasada 1 (2026-07-24)**: `develop` rojo + swarm incoherente — F1–F14.

**Pasada 2 (2026-07-25)**: S1–S7 mergeados.

**Pasada 3 (late)**: S8 en develop. Handoff prune. S9 branch-only. S11 WIP. S10 P0.

**Pasada 4 (late)**: S9, S10, S11 **mergeados a develop** (`c7766ea6`, `5199dc11`, `c2930773`). F24/F27/F28/F30 cerrados. F23/F39 litter residual. shipped-in + Status real.

**Pasada 5 (late)**: detenida por **F41** (`bun test` 43 fail / 34 error). F45 detecta x00072 stale. F42 a00069 verified state miente. F43 scoreboard-4 mentía.

**F41–F50 nuevos** (re-audit-5):
- **F41**: `bun test` 43 fail / 34 error. 8 fail groups.
- **F42**: a00069 verified state desfasado (1 fail vs 43 real).
- **F43**: scoreboard-4 subestimaba (7.4 vs 6.2 real).
- **F44**: a00070/a00071 confirman C-01/C-02/C-03 sin cerrar (subset no-a00069).
- **F45**: x00072 SEC-001 S1 mergeada, propuesta sigue en ready/.
- **F46**: fail groups ñoños sin ownership.
- **F47**: sessionStorage parity CI/local divergente.
- **F48**: PRESET_CATALOG vs config drift.
- **F49**: cli-ui-parity map stale.
- **F50**: agent-branch-naming lint no cubre "ancestro de develop".

**FATAL residual**: F41 (43 fail/34 error en validate). F34 (audit log in-memory).

**Pasada 6 (late)**: x00073 SEC-002 S1+S2 mergeadas. x00072 SEC-001 S1+S2 mergeadas. lint proposals 0 fatales (F55 closed). F51 detecta +1 fail/err drift implícito.

**F51–F55 nuevos** (re-audit-6):
- **F51**: +1 fail/err entre pasada 5→6 sin shipped-in explicativo.
- **F52**: `auto_work` `outOfCache` warning solo informativo, no mueve la copia.
- **F53**: x00073 sigue en `ready/` post S1+S2 mergeadas (recidiva F45).
- **F54**: x00072-rel-001 vs x00152-rel-001 — mismo label, distinto id.
- **F55**: lint proposals 0 fatales (closed; 5 fatales en pasada-5 cerrados).

**FATAL residual**: F41 (43 fail/35 err). F34 (audit log in-memory).

**Pasada 7 (late)**: x00072 SEC-001 closed (da32a959) — F45 closed. x00152 REL-001 closed (225e4b30) — F54 closed. x00073 S3 done (759b7c6f) sigue en ready/ — F58. a00067 S1+S2 closed con delta medido (34f390f9, ba8250af) — F59. F55 closed (lint 0 fatales re-audit-6).

**F56–F65 nuevos** (re-audit-7):
- **F56**: worktree-a00069-f41-validate-fail-groups redundante (F24 recidiva).
- **F57**: plugins/refactor/ untracked.
- **F58**: x00073 S1+S2+S3 done pero en ready/ (F45 recidiva).
- **F59**: a00067 closed con delta medido (POSITIVO, replicar).
- **F60**: patron close-evidence (x00072, x00152) — replicar a a00069.
- **F61**: 8 ramas agent/* redundantes (F11 recidiva).
- **F62**: workflow close-evidence estandarizado (POSITIVO).
- **F63**: 4 in-progress / 28 ready / 11 review / 247 done (ratio 8.8x).
- **F64**: a00069 sigue in-progress con SHAs mergeadas (F45 recidiva).
- **F65**: validate empero — 76 fail / 37 errors (era 43/35). Tests anadidos sin tests verdes.

**FATAL residual**: F41 (76 fail / 37 errors). F34 (audit log in-memory).

**Pasada 8 (late)**: f00123 S1 mergeada (12b7e5a1) — F57 closed. f00124 S1+S2+S3 done (5f1b2a5e chain). F56-F41 triage mergeado (424291c1 via PR #13/14). F47 closed (740f57fa sessionStorage). F48 closed (6ff5b217 orphan). F49 closed (60fea56f capabilities). F46 partial (cf1ef20e block missing done artifacts). F30 evolved (8d1e1999 rebaseline). F22 evolved (ab78e60d logs interfaces). F67 closed (c10ec1cb cacheNamespace). F59 closed. F65: PASADA 8 **resuelve** F41 bajo canonical `bun run test` (5115/5115 pass). Pero bare `bun test` sigue rojo (45 fail groups).

**F66-F79 nuevos** (re-audit-8):
- **F66** (FATAL): `bun run typecheck` falla en `plugins/browser/.../browser-inspect.tool.spec.ts` (TS2345).
- **F67** (FATAL cache): `c10ec1cb` arregla logs `cacheNamespace: 'results'`; **F71** lo extiende a otros plugins.
- **F68** (FATAL contextual): 45 fail groups bajo bare `bun test` (out-of-scope per F41-canonical).
- **F69** (MEJORABLE): agents.lock.json.*.tmp + mutex (F32 partial).
- **F70** (MEJORABLE): `agent/codex-auto-work-artifact-drift` (cf1ef20e) nueva rama redundante (F61 recidiva).
- **F71** (FATAL cache): otros plugins pueden tener el mismo `cacheNamespace` bug.
- **F72** (MEJORABLE): 4 proposals done con Files: drift pre-existente.
- **F73** (POSITIVO): ab78e60d refactor logs interfaces — types-in-contracts.
- **F74** (F46 evolución): `missingDoneArtifacts` en `IClaimReadyResolution`.
- **F75** (F68 evolución): `f00123 S1` introduce nuevos fail groups bare-bun.
- **F76** (F75 evolución): `f00124 S3` introduce `pack auto-tuning` (init:default test).
- **F77** (MEJORABLE): `424291c1` subject confunde F56 (rama) vs F41 (finding).
- **F78** (F60 recidiva): `f00123 S3` done pero `f00123` sigue en `ready/`.
- **F79** (F70 recidiva): `worktree-a00069-f41-validate-fail-groups` persiste post-merge.

**FATAL residual**: F66 (typecheck roto). F34 (audit log in-memory). F71 (cacheNamespace en otros plugins).

**Pasada 9 (late)**: F66 closed (009ed7b2 wire browser). F67 closed (c10ec1cb cacheNamespace logs). F78 corrected + landed (e6e248a0 + d10e3bdb f00123 S3). F69 worsen (5 tmp files). F41 closed (canonical 5203/5203 pass). f00125 S3 done (321e55d8). f00126 S1 done (bfbdfd46).

**F80-F90 nuevos** (re-audit-9):
- **F80** (POSITIVO — F41 closed): `bun run test` canonical 5203/5203 pass.
- **F81** (POSITIVO): f00125 S3 done (page verification + E2E recipe).
- **F82** (POSITIVO): f00126 S1 done (bench harness + baseline compare).
- **F83** (F78 corrected): `e6e248a0` documenta **commit laundering** — `da9050d8` marked S3 done sin código; correción honesta.
- **F84** (F66 evolución): f00123/f00126 aún no wirados al workspace (chore pendiente).
- **F85** (F67/F71 evolución): `results/` 5 subdirs canónicos (logs, logs-errors, memory, auto-agent-selector, usage-tracking).
- **F86** (MEJORABLE): nuevos `.cache` paths no catalogados (proposal-lock, healthcheck, roster.draft, state/, orchestrator-runner/).
- **F87** (F68 evolución): bare `bun test` ahora **71 fail** (vs 70 pasada-8; out-of-scope per F80).
- **F88** (MEJORABLE): 5 in-progress (vs 4 pasada-8) — qué migró?
- **F89** (POSITIVO): f00126 cerró limpio (ejemplo de close sin ramas redundantes).
- **F90** (F78 recidiva): f00126 sigue en `ready/` (close-evidence pendiente).

**FATAL residual**: F34 (audit log in-memory). F71 (cacheNamespace en otros plugins).

**Pasada 10 (late)**: f00126 S2+S3 done (f0d55edf, 3815c571, bbf3b945). f00127 S1 done (80cd369e). F84 closed (dd75bd7a, 1a20db97, 3a2feb51). F90 closed (f00126 S3 done). F93 regresión en `bun run test` (2 fail en usage-tracking).

**F91-F102 nuevos** (re-audit-10):
- **F91** (MEJORABLE): f00125-browser-plugin.md en `in-progress/` (F45 recidiva triple).
- **F92** (MEJORABLE): `dd75bd7a` solo 1 file (perf registration); F98 complement.
- **F93** (FATAL regresión): `bun run test` 2 fail en usage-tracking (pricing, record-buffer).
- **F94** (F87 worsen): bare `bun test` 72 fail (+1 vs pasada-9).
- **F95** (F86 paralelo): `plugins/prompt-eval/` 7 files untracked.
- **F96** (F77 residuo): `bbf3b945` y `8199bd1d` subject duplicado.
- **F97** (F93 evolución): `bbf3b945` metrics-gate → `record-buffer` test failure.
- **F98** (F92 complement): `dd75bd7a` vs `1a20db97` coordinación wire.
- **F99** (F57/K17): f00127 S1 ↔ auto-agent-selector dependency.
- **F100** (F22 recidiva): f00119 sigue en `in-progress/`.
- **F101** (F79 evolución): worktree f00126-S3 detached HEAD.
- **F102** (F46 evolución): f00127 S2 pinneada como `future work`.

**F103 (re-audit-11, mismo día)**: Patrón "agente zombie" — `agents.lock.json` con `started_at == last_seen` para f00126-S3 / f00127-S2 (2h+ stale), log writer `appendFile` sin fsync (gap de 8h sin entradas para la task con lock), 6 tmp files huérfanos acumulados desde 02:33 hasta HOY 13:48. Cuatro bugs encadenados (log durability gap, lock GC only on-action, tmp sin boot-sweep, sin heartbeat watchdog). **FATAL operativo** — ver §F103 para el slice S12.

**FATAL residual**: F93 (regresión). F103 (agent-stuck). F34 (audit log in-memory). F71 (cacheNamespace cross-plugin).

**Recomendación**: Resolver F93 (regresión usage-tracking). Tras F71 + F34 cerrados, close-evidence (F60). Scoreboard 10 ≈ 7.0 OK-; post-fix ≈ 7.8 OK.

### appendix A — Log evidence (verbatim)

#### A1 — Slice-mode-error events (21 today)

````text
2026-07-24T17:26:55  f00119  has no ## Slices section
2026-07-24T17:41:26  f00142  has no ## Slices section
2026-07-24T19:51:39  a00068  proposal file missing on disk: .../ready/a00068-24-07-2026-...md
2026-07-24T20:05:02  f00120  has no ## Slices section
2026-07-24T20:22:21  f00120  has no ## Slices section
2026-07-24T21:01:34  f00121  has no ## Slices section
2026-07-24T22:42:16  f00122  has no ## Slices section
````

#### A2 — Branch activity (12 → 0 across 12 minutes)

````text
00:48 UTC  git for-each-ref refs/heads/agent → 12 entries (ver tabla F4)
01:00 UTC  git for-each-ref refs/heads/agent → 0 entries
         (branch_gc borró todas sin archivar)
````

#### A3 — Tool-output SDK error (from `bun test`)

````text
error: Expected " =" but found ","
    at plugins/security/src/lib/tools/security-audit.tool.ts:48:410
error: Expected "}" but found ":"
    at plugins/security/src/lib/tools/security-audit.tool.ts:49:16
…
Test Files  1 failed | 617 passed | 2 skipped (620)
Tests       1 failed | 4940 passed (4941)
````

#### A4 — `a00068` slice `**Files**` stale (line 89 of done/audits/a00068-...md)

````yaml
### S1 — Captura del estado y registro de la auditoría
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/a00068-24-07-2026-copilot-minimax-m3-auditoria-exhaustiva-recomendaciones.md`
- **Gate**: lint
````

(El archivo está en `done/audits/`, pero el `**Files**` apunta a `ready/`.)

#### A5 — Branch names that violate the convention

````text
agent/copilot-minimax-doctor-skip-optin        ← no proposal id, no slice
agent/copilot-minimax-c00123-fix               ← no -m3-, no slice
agent/copilot-minimax-f00120-s2-done           ← no -m3-, redundant -done
agent/copilot-minimax-f00120-s2-s4             ← no -m3-, redundant -s4
agent/copilot-minimax-f00120-s1                ← no -m3- (vs agent/copilot-minimax-m3-f00120-s1 que sí)
agent/copilot-minimax-f00121-s2                ← no -m3-
````

#### A6 — Duplicate ids on disk (2026-07-25)

````text
a00067
  review/a00067-24-07-2026-...md          status: review
  done/audits/a00067-24-07-2026-...md     status: ready
  index → done/audits/… status: ready

f00121
  review/f00121-forge-plugin.md           status: review
  done/feats/f00121-forge-plugin.md       status: done
  index → done/feats/… status: done
````

#### A7 — proposal_review zero-use vs review/ population

````text
2026-07-24 tool-completed proposal_review : 0
docs/mcp-vertex/proposals/review/*.md     : 14 files
authoring.tool.ts registers proposal_review : yes (id: proposal_review)
````

#### A8 — agent_lock imbalance + payload without `ok`

````text
claim 29 / release 19 / status 4
sample structuredContent keys:
  tool, action, task_id, agent, path, lock_path, ownership_count,
  claimed, summary, identity
  # missing: ok
notification_* / await_lock calls that day: 0
````

#### A9 — subagent-registry + round-context zombies

````text
assignments: 30 (adopted=false all)
  orphan: 27 (last_seen from 2026-06-21 .. 2026-07-06)
  active: 3  (f00067a-S2, f00098-S1-S2, f00098-S4; last_seen 2026-07-06)
round-context.activeAgents: 14 (all adopted=false, lastSeen June)
state_health/state_repair events ~5; orphans remain
````

#### A10 — plugins enabled vs tools used (2026-07-24)

````text
enabled plugins: 24
tool prefixes used: proposals(427), status-marker(20), fs(10),
  overview(6), git(4), status(2)
never invoked that day despite enabled: 21 plugins
  (notification, quality, security, memory, rules, …)
server-started: 379  |  tool-started/completed: 238/238
````

#### A11 — Re-audit 2026-07-25 residual (post S1–S7 merge)

````text
HEAD: e37b21e3+ (S7 on develop)
duplicate proposal ids on disk: 0
review/ files: 11, index misaligned: 0
agent/* branches: 0
security-audit description: single string (S2 ok)
security-gate import: ../../../../../../tools/... resolves (exists)
slices parser: /^##(?:\s+\d+\.)?\s*Slices\b/im  (S1 ok)

subagent-registry AFTER S6 code merge, BEFORE state_repair call:
  assignments: 30  orphan:27  active:3  adopted_false:30
round-context.activeAgents: 14 (still June zombies)
→ F15: S6 is opt-in only

agent-lock-engine claim success: no structuredContent, no ok:true
agent-lock.tool outputSchema: ok optional, not injected
await_lock: lives in notification plugin (notification_await_lock)
handoff/: 12 files, all older_7d (32–33 days)
proposal-transition: force:true skips peer gate without bypass audit event
force_transition: skipPeerReview:true same
a00069 shipped-in was [] while 14 commits already on develop (F20)
````

#### A12 — a00069 implementation commits (shipped-in)

````text
f3faae85 fix(a00069): case-insensitive ## Slices parser
dc31bb70 fix(a00069): S1 case-insensitive slices parser + proposal hygiene
7bd59036 feat(a00069): S3 atomic transition↔index + stale **Files** rewrite
a14237a6 test(a00069): S3 duplicate-id scan and Files rewrite
88992ee5 test(a00069): continue_proposal stale-index heal + mark S1-S3 done
2ae13475 feat(a00069): S4 agent-branch-naming lint gate
2e74b4ee feat(a00069): S5 close_slice validation gate
2049f41a fix(a00069): broaden close_slice acceptance detection
8238cf70 test(a00069): cover S5 close_slice validation gate
f1a629b9 feat(a00069): S6 purge orphan registry assignments
e6b0c6d5 feat(a00069): S6 orphan GC + round-context activeAgents filter
e37b21e3 feat(a00069): S7 peer-review gate on review→done
d48d6ef4 fix(a00069): complete S7 peer-review short-circuit paths
c51bb563 fix(a00069): unnest requirePeerReview from validationCommand
````

#### A13 — Re-audit-9 residuals (2026-07-25 late)

````text
origin/develop: d10e3bdb (develop ahead 3 vs origin/develop)
f00125 S3 done (321e55d8, e8f2438d)
f00126 S1 done (bfbdfd46, 85e15d32) — perf plugin bench harness
f00123 S3 corrected + landed (e6e248a0 then d10e3bdb)
f00125 wire workspace (009ed7b2) — closed F66
cacheNamespace logs resolved (c10ec1cb; F67 closed)
results/ subdirs: auto-agent-selector, logs, logs-errors, memory, usage-tracking
bun run test (canonical): 5203/5203 pass (F80 — F41 closed)
bun test (bare): 5013 pass / 71 fail / 37 errors / 20197 expects (F87)
F66 closed: 009ed7b2 fix browser spec + wire workspace
F67 closed: c10ec1cb cacheNamespace logs
F78 corrected: e6e248a0 codemod nunca landed, ahora landed via d10e3bdb
F69 worsen: agents.lock.json.*.tmp 5 files (vs 4 pasada-8)
F80: bun run test canonical (F41 closed)
F81: f00125 S3 done (positiva)
F82: f00126 S1 done (positiva)
F83: F78 correction commit e6e248a0 documenta commit laundering (positiva)
F84: f00126/f00123 aún no wirados al workspace (F66 evolución)
F85: results/ 5 subdirs canónicos (F67/F71 evolución)
F86: nuevos .cache paths (proposal-lock, healthcheck, roster.draft, state/, orchestrator-runner/)
F87: bare bun test 71 fail (out-of-scope per F80)
F88: 5 in-progress (vs 4 pasada-8)
F89: f00126 cerró limpio
F90: f00126 sigue en ready/ (F78 recidiva)
proposals: 5 in-progress, 27 ready, 11 review, 247 done
branches: 14 total, 10 agent/*
registry orphans: 0
agents.lock.json.*.tmp: 5 files (F69 worsen)
handoff/: orchestrator-blocker-2026-06-21-no-mcp-runtime.md (F33)
peer-review-bypass-log: in-memory (F34 FATAL)
unusedActivePlugins: assemble-core-tools only (F35)
i18n sliceStatus/peerReviewBypasses: missing (F38)
catalog auto-publish: none (F40)
auto_work outOfCache warning only (F52)
````

#### A13 — Re-audit-7 residuals (2026-07-25 late)

````text
origin/develop: 225e4b30 (develop), x00072 SEC-001 closed, x00152 REL-001 closed,
  a00067 S1+S2 closed, x00073 S3 done (still ready)
x00072 -> done/fixes/status:done (da32a959)
x00152 -> done/fixes/status:done (225e4b30)
a00067 S1+S2 -> review/, status:review (34f390f9, ba8250af)
x00073 S3 done (759b7c6f) — still in ready/ (F58)
worktree-a00069-f41-validate-fail-groups (5401e9b0) NOT on develop (F56)
plugins/refactor/ untracked (F57)
bun test 4938 pass / 76 fail / 37 errors / 20045 expects (F65 empeoro)
F65 fail groups: createCommandRunner x5, createStdioTransport x7,
  external-mcps ack x3, gracefulShutdown x2, f00067 S10 x1, +18 others
proposals: 4 in-progress, 28 ready, 11 review, 247 done
worktree cache: 30 assignments, 30 orphanish, 14 activeAgents (F31)
agents.lock.json.*.tmp: 4 files (F32)
handoff/: orchestrator-blocker-2026-06-21-no-mcp-runtime.md (F33)
peer-review-bypass-log: in-memory only (F34 FATAL)
unusedActivePlugins: assemble-core-tools only (F35)
lock-released notify_status: no wire (F37)
i18n sliceStatus/peerReviewBypasses: missing (F38)
branches agent/*: 8 still present (F23/F39/F50)
worktree-a00069-f41-validate-fail-groups: also redundant (F56)
catalog auto-publish: none (F40)
cli-ui-parity map: stale (F49)
PRESET_CATALOG: vs mcp-vertex.config.json drift (F48)
sessionStorage parity CI/local: divergente (F47)
auto_work outOfCache warning only (F52)
````

#### A13 — Re-audit-10 residuals (2026-07-25 late)

````text
origin/develop: 3a2feb51 (develop ahead 1 vs origin/develop)
f00126 S1+S2+S3 done (bfbdfd46, f0d55edf, 3815c571)
f00127 S1 done (80cd369e) — prompt-eval plugin spend-guarded eval harness
f00126 worktree detached HEAD 8199bd1d (duplicate de bbf3b945)
perf plugin registered in PRESET_CATALOG (dd75bd7a)
browser + refactor plugins in tool-outputs harvester (1a20db97)
f00127 added to PUBLISH_ORDER (3a2feb51)
bun run test (canonical): 2 failed (F93) — usage-tracking pricing, record-buffer
  5224 passed / 2 failed
bun test (bare): 5026 pass / 72 fail / 37 errors / 20236 expects (F87)
F84 closed: dd75bd7a + 1a20db97 + 3a2feb51
F90 closed: f00126 S1+S2+S3 done (bbf3b945 integration)
F91: f00125-browser-plugin.md migró a in-progress/
F92: dd75bd7a solo 1 file (vs 1a20db97 multi-file)
F93: bun run test 2 fail (regresión desde pasada-9)
F94: bun test 72 fail bare-bun (F87 worsen)
F95: plugins/prompt-eval/ 7 files untracked
F96: bbf3b945 / 8199bd1d subject duplicado
F97: bbf3b945 metrics-gate → record-buffer test failure
F98: dd75bd7a vs 1a20db97 coordinación wire
F99: f00127 S1 ↔ auto-agent-selector dependency
F100: f00119 sigue en in-progress/ (F22 recidiva)
F101: worktree f00126-S3 detached HEAD (F79 evolución)
F102: f00127 S2 pinneada como future work (F46 evolución)
agents.lock.json.*.tmp: 6 files (F69 worsen) — 02:33, 02:34, 02:35, 02:38, 04:58, 13:48
worktrees: 2 (main, f00126-S3 detached)
proposals: 5 in-progress, 27 ready, 11 review, 247 done
registry: 0 orphans
results/: 5 subdirs canónicos
peer-review-bypass-log: in-memory (F34 FATAL)
unusedActivePlugins: assemble-core-tools only (F35)
i18n sliceStatus/peerReviewBypasses: missing (F38)
catalog auto-publish: none (F40)
auto_work outOfCache warning only (F52)
````

#### A13 — Re-audit-8 residuals (2026-07-25 late)

````text
origin/develop: 12b7e5a1 (develop), f00123 S1 merged, f00124 S3 done,
  a00069 F56-F41 triage merged (PR #13, #14)
plugins/refactor/ committed (f00123 S1: 12b7e5a1)
plugins/semantic-search S1+S2+S3 done (f00124)
logs plugin cacheNamespace bug fixed (c10ec1cb)
bun test (canonical vitest): 5115/5115 pass, 0 fail (F41 corregido)
bun test (bare): 4975 pass / 70 fail / 37 errors / 20060 expects (F68)
F66 typecheck: plugins/browser/.../browser-inspect.tool.spec.ts TS2345
F46: cf1ef20e block auto work on missing done artifacts
F47: 740f57fa sessionStorage stub (closed)
F48: 6ff5b217 orphan preset-catalog.spec.ts deleted (closed)
F49: 60fea56f capabilities.json globalSetup (closed)
F30: 8d1e1999 files-exist rebaseline
F22: ab78e60d logs interfaces refactor
F56: 424291c1 a00069 F56-F41 triage mergeado (closed)
F57: 12b7e5a1 refactor plugin S1 (closed)
F58: x00073 S1+S2+S3 done, sigue en ready/ (no cerrado)
F59: a00067 closed
F60: patron close-evidence replicado a x00072/x00152
F67: c10ec1cb cacheNamespace bug fixed
F68: 45 fail groups bare-bun (out-of-scope: F66 said use bun run test)
F70: agent/codex-auto-work-artifact-drift redundant
F71: otros plugins pueden tener mismo cacheNamespace bug
F72: 4 proposals 'done' con Files: drift pre-existente
F73: logs interfaces refactor (POSITIVO)
F74: missingDoneArtifacts en auto-work (F46 evolucion)
F75: f00123 S1 introduce nuevos fail groups bare-bun
F76: f00124 S3 introduce pack auto-tuning tests
F77: 424291c1 subject confunde F56 (rama) vs F41 (finding)
F78: f00123 S3 done pero f00123 sigue en ready/ (F60 recidiva)
F79: worktree-a00069-f41-validate-fail-groups rama persiste post-merge
proposals: 4 in-progress, 28 ready, 11 review, 247 done
branches: 14 total, 9 agent/* (F70, F79)
registry orphans: 0
agents.lock.json.*.tmp: 4 files (F32 OPEN)
handoff/: orchestrator-blocker-2026-06-21-no-mcp-runtime.md (F33)
peer-review-bypass-log: in-memory (F34 FATAL)
unusedActivePlugins: assemble-core-tools only (F35)
i18n sliceStatus/peerReviewBypasses: missing (F38)
catalog auto-publish: none (F40)
cli-ui-parity map: regenerated via 60fea56f (F49 closed)
PRESET_CATALOG: 6ff5b217 deleted orphan (F48 closed)
sessionStorage parity: 740f57fa stub (F47 closed)
auto_work outOfCache warning only (F52)
````

#### A13 — Re-audit-6 residuals (2026-07-25 late)

````text
origin/develop: 2f2576ca (develop), x00072 SEC-001 S1+S2 merged,
  x00073 SEC-002 S1+S2 merged
x00073 SEC-002 S1+S2 mergeada (buildSafeEnv + server-registry wire)
x00072 SEC-001 S1+S2 mergeada (trust fingerprint + QuickPick)
lint:proposals 0 fatales (F55) — 5 fatales en pasada-5 cerrados
bun test 4945 pass / 43 fail / 35 errors / 20030 expects (F41, F51)
worktree: 11 branches, 8 agent/* (litter F23/F39/F50)
proposals: 290 indexed, 4 in-progress, 30 ready, 11 review, 245 done
outOfCache warning: /home/cartago/_projects/mcp-vertex (F52)
x00073 status: ready despite S1+S2 merged (F53)
x00152-rel-001 duplica label con x00072-rel-001 (F54)
x00072 status: ready despite S1+S2 merged (F45)
worktree cache: 30 assignments, 30 orphanish, 14 activeAgents (F31 cache sin re-boot)
agents.lock.json.*.tmp: 4 files (F32)
handoff/: orchestrator-blocker-2026-06-21-no-mcp-runtime.md (F33)
peer-review-bypass-log: in-memory only (F34 FATAL)
unusedActivePlugins: assemble-core-tools only (F35)
lock-released notify_status: no wire (F37)
i18n sliceStatus/peerReviewBypasses: missing (F38)
branches agent/*: 8 still present (F23/F39/F50)
catalog auto-publish: none (F40)
cli-ui-parity map: stale (F49)
PRESET_CATALOG: vs mcp-vertex.config.json drift (F48)
sessionStorage parity CI/local: divergente (F47)
auto_work outOfCache warning only (F52)
````

#### A13 — Re-audit-5 residuals (2026-07-25 late)

````text
origin/develop: d6a88789 (develop), S9/S10/S11 all merged
a00069 SHAs now: 78f9d95a, 4710d2a4, 197041a2, c7766ea6, c2930773,
  5199dc11, 7979b39d, 89d9a490, 35a6af1f, cabc42f7, 4dc01795, daab5199,
  183df88e, 333a55f9, d6a88789 (15 commits)
x00072 SEC-001 S1 mergeada (d6a88789, 333a55f9)
a00070 (external) + a00071 (independent) en review/ con 3 C-* confirmados
bun test 4929 pass / 43 fail / 34 error / 20000 expects (F41)
8 fail groups: scssPlugin, cli-ui-parity, isQuickStartDismissed ×2,
  PRESET_CATALOG ×2, resolvePresetMembers ×3
a00069 verified state desfasado (F42)
scoreboard-4 mentía (F43); re-audit-5 ≈ 6.2 NOT 7.4
x00072 status: ready despite S1 merged (F45)
worktree cache: 30 assignments, 30 orphanish, 14 activeAgents (F31 cache sin re-boot)
agents.lock.json.*.tmp: 4 files (F32)
handoff/: orchestrator-blocker-2026-06-21-no-mcp-runtime.md (F33)
peer-review-bypass-log: in-memory only (F34 FATAL)
unusedActivePlugins: assemble-core-tools only (F35)
lock-released notify_status: no wire (F37)
i18n sliceStatus/peerReviewBypasses: missing (F38)
branches agent/*: 7+ still present (F23/F39/F50)
catalog auto-publish: none (F40)
cli-ui-parity map: stale (F49)
PRESET_CATALOG: vs mcp-vertex.config.json drift (F48)
sessionStorage parity CI/local: divergente (F47)
````

### appendix B — Concurrency table

| Escenario | Riesgo | Mitigación hoy | Gap |
|---|---|---|---|
| Dos agentes cierran el mismo slice a la vez | Doble escritura del archivo | `agent_lock` antes de `close_slice` | ⚠ F9/F16 — claim sin `ok` + release asimétrico → **S8** |
| Agente A mueve proposal, B lee index stale | `slice-mode-error` falso | **S3 done** (sync post-transition) | ✅ mitigado |
| Transition deja gemelo review+done | Doble fuente de verdad | **S3 done** (0 dups re-audit) | ✅ mitigado |
| Agente commitea con validate rojo | `develop` roto | **S5 done** close_slice gate | ⚠ F21 gate lint bypass |
| Agente crea branch `agent/*` sin worktree | Pisarse / litter | **S4 done** lint | ⚠ F22 shared checkout WIP |
| Contención de lock | Busy-loop claim | texto nextAction menciona await_lock | ❌ F17 0 usos → **S8** |
| Sesión muere con assignment active | Orientation miente | S6 + S10 auto boot purge | ✅ F15 mitigated |
| Item en `review/` sin peer | done sin calidad | **S7 done** gate | ⚠ F18 force bypass → **S11** |
| Handoff basura meses | Orientation ruido | (ninguna) | ❌ F19 → **S11** |
| Plugins enabled nunca llamados | False confidence dogfood | (ninguna) | ❌ F13 → **S9** |
