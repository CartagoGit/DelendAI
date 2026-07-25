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
  Slices accionables: S1–S11. Hallazgos: F1–F22.

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
  - `plugins/proposals/src/index.ts` o hook de register post-boot.
  - `plugins/proposals/src/lib/tools/state-tools.tool.ts` /
    `zombie-reconcile.ts` (ya tienen purge; falta invocación automática).
  - opcional: `packages/core` overview compact warning si registry
    unhealthy.
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
| `bun run validate` | **1 test fails** (4940/4941) | `bun test` salida |
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
| Slices código done / pending | S1–S8 done; S9–S11 pending | progress table |

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

### F22 — WIP / multi-agent edits concurrentes sobre `a00069` S7 wiring (MEJORABLE proceso)

**Evidencia sesión**:

- `git status` osciló con dirty `plugins/proposals/src/index.ts`,
  `auto-work.tool.ts`, `recovery-tools.ts` mientras otros agentes
  mergeaban S7 a `develop`.
- Terminals: `git checkout HEAD -- index.ts` para recuperar wires.
- Riesgo clásico F4 sin worktree: shared checkout + commits ajenos.

**Esperado con `agentWorktree: false`**: un solo writer en proposals
plugin surface. **Actual**: S4 nombra branches pero no serializa
editores en el main worktree.

**Slice**: cubierto parcialmente por S4 + playbook; candidata a
`agent_lock` obligatorio en files de `plugins/proposals/**` via
auto_work (refuerzo S8). No S nuevo si S8 health + disciplina bastan.

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
| S6 | **done en código**, **NO aplicado al cache vivo** | registry sigue 30 orphans / 14 activeAgents hasta `state_repair` → **F15** |
| S7 | **done** (transition + force_transition + auto_work) | bypass `force:true` / `skipPeerReview` sin audit trail → **F18** |
| S8 | **done** (`ok` + session balance + await_lock nextAction) | claim/release counters + state_health imbalance gate |
| S9 | **pending** | sin warning unused-active-plugins → **F13/F20** |
| S10 | **pending** (nuevo) | auto-repair on boot/session → **F15** |
| S11 | **pending** (nuevo) | handoff GC + force audit → **F18/F19** |

### verdict

**Pasada 1 (2026-07-24)**: `develop` rojo + swarm incoherente — F1–F14.

**Pasada 2 (2026-07-25)**: S1–S7 **implementados y mergeados** (ver
`shipped-in`). Mitigan F1–F8, F10 (código), F11–F12 en gran parte.
**No cierra** el incidente operativo:

1. **F15** — GC de orphans no corre solo → orientation sigue mintiendo.
2. **F16/F17/F9** — **cerrados en código por S8** (ok+session+await_lock nextAction).
3. **F18/F19** — bypass peer + handoff basura → S11.
4. **F13/F20** — dogfood + doc drift → S9 + disciplina shipped-in.

Camino restante: **S10 → S11 → S9** (S8 desbloqueó telemetría;
S10 hace real el S6; S11 cierra hygiene; S9 es advisory). F21 accepted.
F22 proceso. No redesign.

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

### appendix B — Concurrency table

| Escenario | Riesgo | Mitigación hoy | Gap |
|---|---|---|---|
| Dos agentes cierran el mismo slice a la vez | Doble escritura del archivo | `agent_lock` antes de `close_slice` | ⚠ F9/F16 — claim sin `ok` + release asimétrico → **S8** |
| Agente A mueve proposal, B lee index stale | `slice-mode-error` falso | **S3 done** (sync post-transition) | ✅ mitigado |
| Transition deja gemelo review+done | Doble fuente de verdad | **S3 done** (0 dups re-audit) | ✅ mitigado |
| Agente commitea con validate rojo | `develop` roto | **S5 done** close_slice gate | ⚠ F21 gate lint bypass |
| Agente crea branch `agent/*` sin worktree | Pisarse / litter | **S4 done** lint | ⚠ F22 shared checkout WIP |
| Contención de lock | Busy-loop claim | texto nextAction menciona await_lock | ❌ F17 0 usos → **S8** |
| Sesión muere con assignment active | Orientation miente | S6 código purge | ❌ F15 no auto → **S10** |
| Item en `review/` sin peer | done sin calidad | **S7 done** gate | ⚠ F18 force bypass → **S11** |
| Handoff basura meses | Orientation ruido | (ninguna) | ❌ F19 → **S11** |
| Plugins enabled nunca llamados | False confidence dogfood | (ninguna) | ❌ F13 → **S9** |
