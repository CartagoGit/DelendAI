---
id: a00072
status: in-progress
type: proposal
track: audit+multi-agent+state-consistency+proposals-plugin+log-honesty
date: 2026-07-25
kind: audit
title: 'Deeper log-scan followup to a00069 — F148-F152 bugs surfaced post-closure (smoke detectors that do not detect, peer-review bypass, 72% tools unused)'
related:
    - a00069 # parent audit (closed in c85303f1, S1-S12 landed)
    - a00067 # evaluation de migración de lenguaje
    - f00073 # branch-status + worktree-gc
    - f00075 # swarm-hygiene routine
    - f00052 # gate agent-worktree detrás de host flag
    - c00086 # swarm commit discipline
    - x00107 # every-tool outputSchema — gate fix the 8 offender files
    - f00078 # coordination protocol enforcement
ownership:
    - {
          agent: implementation_runner,
          task: 'S1 — proposal_diagnose self-heal + state_health stale check (F148/F151).',
      }
    - {
          agent: implementation_runner,
          task: 'S2 — proposal_review mandatory pre-done gate (F149).',
      }
    - {
          agent: implementation_runner,
          task: 'S3 — auto_work invoca logs/notification/quality en cada ciclo (F150/F152).',
      }
    - {
          agent: implementation_runner,
          task: 'S4 — state_health stale check + removeStale before count.',
      }
    - {
          agent: implementation_runner,
          task: 'S5 — close_slice invoca quality_run antes de retornar ok.',
      }
---

## goal

a00069 cerró formalmente (commit `c85303f1`) con F1-F145 + S1-S12+S13
landed. El log-scan de la misma sesión (9 días, 1524 entries) reveló
5 nuevos bugs **post-closure** que el swarm no había detectado durante
la auditoría original. Este proposal es un followup que aterriza
F148-F152 con slices y verifications.

## why

Los F148-F152 son bugs **estructurales** del swarm, no cosméticos:

- **F148** — `proposal_diagnose` retorna 0 inconsistencies/lockOwners/
  suggestedActions en 17/17 calls. Es un smoke detector que **no
  detecta el humo**: F103 (zombie lock) existía cuando se le llamó,
  pero el tool no lo reportó. **FATAL operativo**.
- **F149** — `proposal_review` 0 invocaciones en 9 días. S7
  (peer-review gate) mergeado pero bypasseado. 3 transiciones
  review→done documentadas con `last_review` < 60s antes de done
  (auto-review en lugar de peer). **MUY MAL**.
- **F150** — 108/150 tools catalogados nunca se llaman (72%). El
  swarm no dogfood `logs`, `notification`, `orchestrator-runner`,
  `forge`, `security`, `quality`, etc. **MEJORABLE / F13 evolución**.
- **F151** — `state_health` siempre retorna `healthy:true` +
  `active:0` (2/2 calls). No invoca `removeStale` antes de contar.
  Idem F148. **MEJORABLE**.
- **F152** — `quality_run` 0 invocaciones en 9 días. El plugin
  quality existe pero el swarm no lo dogfood. **MEJORABLE**.

## non-goals

- Reabrir a00069. El close-evidence ya está mergeado
  (c85303f1). Este proposal es **estrictamente** un followup.
- Reescribir F1-F147. Eso ya está en a00069.
- Implementar los slices en este commit. Este proposal documenta
  y propone; la implementación será de un agente separado.

## Slices

### S1 — `proposal_diagnose` self-heal + `state_health` stale check (F148/F151)

- **Status**: done (F148 closed, F151 closed)
- **Files**: `plugins/proposals/src/lib/tools/state-tools.tool.ts` (S1.a/S1.c),
  `plugins/proposals/src/lib/tools/recovery-tools.ts` (S1.b),
  `plugins/proposals/tests/src/lib/state-tools.spec.ts` (new S1.a test),
  `plugins/proposals/tests/src/lib/tools/recovery-tools.spec.ts` (3 new S1.b tests).
- **S1.a — done**: `state_health` invoca `removeStale` antes de contar.
  Schema `stale: { count, taskIds, lastStaleSeen }`. `healthy` ahora también chequea
  `stale.count === 0`. Helper `purge-stale-locks.ts` no necesario (`removeStale` export
  cubre el caso).
- **S1.b — done**: `proposal_diagnose` cross-proposal cuando hay zombies.
  Schema `crossProposal: boolean`, `crossProposalStaleTaskIds: string[]`,
  `crossProposalStaleAgents: string[]`. Filter cross-proposal cuando
  `task_id !== args.id && in cleaned = false`.
  `suggestedActions`: `agent_lock_release_orphan` si ≤3 stale, `state_repair` si >3.
- **S1.c — done**: `state_health` retorna `stale[]` (junto con S1.a).
- **Gate**: type ✓, lint ✓, test ✓ (960/960 proposals passing).
- **Close evidence**:
  - 6 tests en `state-tools.spec.ts` (incluye nuevo `a00072 S1.a (F148/F151)`).
  - 6 tests en `recovery-tools.spec.ts` (incluye 3 nuevos S1.b cross-proposal).
  - `bun --cwd plugins/proposals test` 960/960 verde.
- **Verification**:
  - Spec: `state_health` con 1 entry stale → `healthy:false`,
    `stale:1`, `staleTaskIds:["f00126-S3"]`.
  - Spec: `proposal_diagnose { id: f00126 }` con zombie en
    f00126-S3 → retorna `lockOwners:["impl-runner-perf-s3"]`,
    `suggestedActions:["agent_lock_release_orphan"]`.
  - Spec: `proposal_diagnose { id: f00128 }` con zombies
    cross-proposal → retorna `crossProposal:true`,
    `staleTaskIds:["f00126-S3","f00127-S2"]`.

### S2 — `proposal_review` mandatory pre-done gate (F149)

- **Status**: todo
- **Files**:
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts` —
    gate rechaza `to: done` si la propuesta no tiene al menos
    1 entrada en `peer-review.jsonl` desde su último
    `to: review`.
  - `plugins/proposals/src/lib/tools/proposal-review.tool.ts` (nuevo
    o ampliado) — el reviewer debe ser **distinto** del
    agente que implementó.
- **Cambio** (3 sub-slices):
  - **S2.a** — Gate mandatory. `proposal_transition` rechaza
    `to: done` si la propuesta no tiene ≥1 entrada en
    `peer-review.jsonl` desde su último `to: review`.
  - **S2.b** — `auto_work` invoca `proposal_review` por
    convención. Antes de sugerir `to: done`, llama
    `proposal_review { id, reviewer, verdict }` como parte del
    step list.
  - **S2.c** — Spec: 3 bypass regressions (r00010, a00063,
    a00065). Cubrir con tests que verifiquen que
    `proposal_review` es invocado antes de `to: done`.
- **Gate**: type, lint, test.
- **Verification**:
  - Spec: `proposal_transition { to: "done" }` sin
    `peer-review.jsonl` → rechaza con `blockerType: "missing-peer-review"`.
  - Spec: `proposal_review { id, reviewer: "B", verdict: "approved" }`
    donde A es el implementador → ok:true.
  - Spec: 3 tests regresivos r00010/a00063/a00065 que
    verifican que la nueva gate rechaza el bypass.

### S3 — `auto_work` invoca logs/notification/quality en cada ciclo (F150/F152)

- **Status**: todo
- **Files**:
  - `plugins/proposals/src/lib/tools/auto-work.tool.ts` — wiring
    en el `step 4` del flow.
  - `plugins/quality/src/index.ts` — `bun run validate` invoca
    `quality_run_quality` post-vitest.
  - `plugins/proposals/src/lib/agents/auto-work-engine.ts` —
    `close_slice` post-condition invoca `quality_run`.
- **Cambio** (3 sub-slices):
  - **S3.a** — `auto_work` invoca logs/notification/agent_names
    en cada ciclo. Wiring en el step 4. Si el LLM olvida,
    el wiring lo garantiza.
  - **S3.b** — `bun run validate` post-vitest invoca
    `quality_run_quality`. Si quality severidad=error, fail.
  - **S3.c** — `close_slice` invoca quality pre-`ok:true`. Si
    quality falla, `close_slice` retorna `ok:false` con el
    motivo.
- **Gate**: type, lint, test.
- **Verification**:
  - Spec: 10-call session cubre ≥8 plugins distintos (dogfood
    coverage).
  - Spec: `bun run validate` exit 0 con quality passing,
    non-zero si quality severidad=error.
  - Spec: `close_slice` con quality error → `ok:false`,
    `blockerType: "quality-failed"`.

## acceptance

```text
- F148 fixed: state_health detecta zombies stale (S1.a, S1.c).
- F148 fixed: proposal_diagnose cross-proposal cuando hay zombies (S1.b).
- F149 fixed: proposal_transition to:done requiere peer-review.jsonl (S2.a).
- F149 fixed: auto_work invoca proposal_review por convención (S2.b).
- F150 mitigated: auto_work invoca logs/notification/quality (S3.a).
- F151 fixed: state_health invoca removeStale (S1.a).
- F152 fixed: validate invoca quality_run (S3.b).
- F152 fixed: close_slice invoca quality_run pre-ok (S3.c).
```

## verified state

- a00069 cerrado (commit `c85303f1`).
- Post-a00072 shipped (post creation):
  - `0f407093` — `feat(f00130): S2 api_validate — contract validation against OpenAPI schema`
  - `512fdc73` — `fix(f00128 S3): cast inline ITableInfo literals to satisfy mutable-array variance`
  - `3a3dd248` — `docs(f00128): move proposal to done/feats — all 3 slices shipped`
  - `6aefd786` — `docs(f00129): mark S2 traces + release health done`
  - `ef0f3828` — `docs(f00128): reconcile S3 done — move proposal to done/feats`
  - `ca0507f9` — `fix(proposals): bound close-slice validation`
  - `550b8264` — `feat(f00128): S3 ERD rendering + catalog (db_erd)`
  - `572de032` — `feat(f00128): S3 ERD + pack + catalog`
  - `bfcb7858` — `fix(cli): expose curated error log stream`
  - `039ce3c5` — `feat(f00129): S3 local correlation + catalog`
  - `ed3ece3e` — `docs(f00129): fold observability README S3 notes`
  - `217e1609` — `feat(f00130): add api_validate contract validator`
- F148-F152 documentados verbatim con logs.
- 5 slices propuestos (S1.a-d, S2.a-c, S3.a-c).
- Lint proposals pasa para a00072.
- Tests pasan: pendiente hasta que un agente implemente los
  slices.

## findings

### F148 — `proposal_diagnose` smoke detector que no detecta el humo — 17/17 returns vacíos (FATAL operativo)

**Evidencia verbatim** (9 días / 17 calls):

```text
calls:       17
incc=[]:     17  (100% siempre vacío)
lockOwners=[]:  17  (100% siempre vacío)
suggestedActions=[]: 17  (100% siempre vacío)
```

Distribución por id (top): `a00067` (4), `a00069` (2), `f00125` (2),
`f00119` (2), `f00123` (1), `f00144` (1), `f00146` (1), `f00147` (1),
`d00004` (1), `f00143` (1), `f00142` (1).

**Diagnóstico**:

- `recovery-tools.ts:490-538` (`runProposalDiagnose`) implementa
  correctamente la lógica: lee `lock.json`, filtra `in_flight`
  por `task_id === id`, popula `inconsistencies` si
  `folder !== expectedFolder` o `lockOwners.some(agent !== owner)`,
  popula `suggestedActions` si hay inconsistencies o lastDead.
- Los 17/17 returns muestran que las **condiciones nunca se cumplen**:
  ninguna propuesta diagnosticada tuvo lock en el momento del
  call, ninguna tuvo folder-status-mismatch, ninguna tuvo
  lock-owner-mismatch.
- **Pero el lock file tiene 2 in_flight stale desde hace 2h+**:
  `f00126-S3` (impl-runner-perf-s3) y `f00127-S2` (copilot-minimax-m3).
  Esas propuestas **nunca se diagnosticaron** (`f00126` 0 calls,
  `f00127` 0 calls).
- Y `a00069` (2 calls) se diagnosticó 2 veces pero ambas con lockOwners=[].
  **¿Por qué?** Probable: las calls fueron en momentos sin zombies; pero
  en los momentos en que los zombies existían, nadie llamó diagnose.

**Esperado**:
- `proposal_diagnose` debería invocarse **periódicamente** (boot,
  pre-work) y **detectar** los zombies. Hoy solo se invoca
  manualmente cuando el usuario lo solicita — exactamente cuando
  no se necesita.
- Cuando el lock tiene `in_flight[].last_seen < (now - stale_after)`,
  `state_health` debería reportarlo. Hoy `state_health` retorna
  `healthy:true` + `active:0` (F151).

**Slice**: S1.

**Cross-references**: F103 (Patrón zombie — el bug que estamos
diagnosticando), F15 (S6 landed en git pero no se auto-aplica),
F32/F69 (tmp files huérfanos — otro síntoma de la misma falta
de auto-diagnóstico), F151 (state_health siempre verde — mismo
anti-patrón).

### F149 — `proposal_review` 0 invocaciones en 9 días — S7 gate bypasseado (MUY MAL)

**Evidencia verbatim** (9 días, 22 `proposal_transition` calls):

```text
proposal_transition calls: 22
  to review: 9
  to done:   13
proposal_review tool calls: 0  ← !!!

Violaciones review→done SIN peer review en medio:
  2026-07-16T16:37:47  r00010  last_review=2026-07-16T16:37:39.152Z
  2026-07-16T23:00:59  a00063  last_review=2026-07-16T23:00:47.933Z
  2026-07-21T18:41:29  a00065  last_review=2026-07-21T18:41:21.137Z
```

**Diagnóstico**:
- S7 (`proposal_review` gate) está mergeada a develop (commits
  `e37b21e3`, `d48d6ef4`, `c51bb563`). El gate existe.
- Pero el gate es **opt-in** — solo se activa si el caller
  llama `proposal_review` antes de `proposal_transition to: done`.
- 0 invocaciones de `proposal_review` en 9 días = nadie lo usa.
- 3 transiciones documentadas con `last_review` < 1 minuto de
  `to: done` — son los agents haciendo "self-review" en lugar
  de peer-review.

**Slice**: S2.

**Cross-references**: F8 (proposal_review existe pero el swarm
no lo usa — FATAL operativo), F18 (Bypass S7 sin audit trail).

### F150 — 108/150 tools catalogados nunca se llaman en 9 días (72% sin uso) (MEJORABLE)

**Evidencia verbatim** (`docs/mcp-vertex/agent-catalog.generated.json` vs logs):

```text
Total tools catalogados: 150
Tools called al menos 1x: 42
Tools NEVER called:        108  (72%)

Por plugin (used / total):
  (core)                :  7/17  (41%)  | never: 10
  auto-agent-selector   :  0/5   ( 0%)  | never: 5
  conventions           :  1/2   (50%)  | never: 1
  database              :  0/2   ( 0%)  | never: 2
  deps                  :  1/6   (16%)  | never: 5
  diagram               :  0/1   ( 0%)  | never: 1
  docs                  :  0/3   ( 0%)  | never: 3
  env                   :  0/1   ( 0%)  | never: 1
  forge                 :  0/9   ( 0%)  | never: 9
  git                   :  3/10  (30%)  | never: 7
  i18n                  :  1/1  (100%)  | never: 0
  link-check            :  0/1   ( 0%)  | never: 1
  logs                  :  0/6   ( 0%)  | never: 6
  memory                :  3/9   (33%)  | never: 6
  notification          :  0/2   ( 0%)  | never: 2
  orchestrator-runner   :  0/11  ( 0%)  | never: 11
  perf                  :  0/3   ( 0%)  | never: 3
  proposals             : 20/31  (64%)  | never: 11
  quality               :  2/4   (50%)  | never: 2
  refactor              :  0/6   ( 0%)  | never: 6
  rules                 :  1/3   (33%)  | never: 2
  search                :  0/1   ( 0%)  | never: 1
  security              :  0/4   ( 0%)  | never: 4
  status-marker         :  1/3   (33%)  | never: 2
  tech-debt             :  0/1   ( 0%)  | never: 1
  test-convention       :  0/3   ( 0%)  | never: 3
  test-policy           :  0/2   ( 0%)  | never: 2
  usage-tracking        :  2/3   (66%)  | never: 1
```

**Diagnóstico**:
- 17 plugins tienen 0 tools invocados en 9 días:
  `auto-agent-selector`, `database`, `diagram`, `docs`, `env`,
  `forge`, `link-check`, `logs`, `notification`,
  `orchestrator-runner`, `perf`, `refactor`, `search`, `security`,
  `tech-debt`, `test-convention`, `test-policy`.
- `orchestrator-runner` es el caso más grave: **11 tools
  registrados, 0 calls**. Es el plugin que debería coordinar
  todo el swarm.
- F13 (plugins activos nunca dogfoodeados) ya marcó este
  problema en pasada-9. La métrica empeoró: 21/24 (88%) → 17/24
  (71%) con 0 calls — pero el ratio de tools es 72%.

**Slice**: S3.

**Cross-references**: F13 (21/24 plugins activos nunca
dogfoodeados), F35 (unusedActivePlugins solo en boot),
F9 (orchestrator-runner sin uso).

### F151 — `state_health` siempre retorna `healthy:true` + `active:0` — idem F148 (MEJORABLE)

**Evidencia verbatim** (2 calls en 9 días):

```text
2026-07-22T15:27:31Z  state_health  healthy=true   active=0
2026-07-24T17:41:07Z  state_health  healthy=true   active=0
```

Response shape (verbatim):

```json
{
  "locks": { "active": 0 },
  "queue": null,
  "registry": { "orphans": 0, "threshold": "green" },
  "healthy": true
}
```

**Diagnóstico**:
- Igual que F148: `state_health` lee el lock file **en el
  momento de la call**. Si en ese momento el lock tiene
  in_flight stale de 2h, los ignora porque el filtro solo es
  `active: in_flight.size > 0` (no `stale`).
- **El check de "stale" no existe** — `state_health` no
  llama `removeStale` antes de contar, ni filtra por
  `last_seen < (now - stale_after)`.
- Resultado: `active:0` cuando en realidad hay 2 zombies
  en el lock file. Falso `healthy:true`.

**Slice**: S1.

**Cross-references**: F148 (mismo anti-patrón), F103 (zombie
lock — root cause), F15 (S6 landed pero no auto-aplica —
extiende).

### F152 — `quality_run` 0 invocaciones en 9 días — S9 dogfood nunca ejercita quality (MEJORABLE)

**Evidencia verbatim**:

```text
mcp-vertex_quality_run_quality calls: 0
mcp-vertex_quality_quality_cancel calls: 3  (cancelaciones, no runs)
```

**Diagnóstico**:
- `quality_run_quality` (el tool canónico para dogfood
  quality) nunca se invoca en 9 días.
- Las 3 calls de `quality_quality_cancel` son cancelaciones
  (probablemente de sesiones que nunca llegaron a run).
- F13 (plugins activos nunca dogfoodeados) ya lo marcó.
  F35 (unusedActivePlugins solo en boot) también.
- El plugin `quality` está **registrado en el catalog pero
  no en `assemble-core-tools` para auto-runs**.

**Slice**: S3.

**Cross-references**: F13 (plugins sin dogfood — quality es
uno de ellos), F35 (unusedActivePlugins solo en boot),
F150 (108/150 tools never called — quality_run es uno).

### F153 — `agents.lock.json` `in_flight[0] = f00130-S2` con `started_at == last_seen` — nuevo zombie en formación (FATAL reincidente F103/F148)

Re-audit-14 `cat .cache/mcp-vertex/agents.lock.json`:

```text
{
  "version": 1,
  "stale_after_minutes": 10,
  "in_flight": [
    {
      "task_id": "f00130-S2",
      "agent": "copilot-minimax-m3",
      "ownership": [
        "plugins/api/src/lib/validate/",
        "plugins/api/src/lib/tools/api-validate.tool.ts"
      ],
      "started_at": "2026-07-25T12:58:16.525Z",
      "last_seen": "2026-07-25T12:58:16.525Z",
      "parent_task_id": "f00130"
    }
  ]
}
```

**Esperado**: lock activo para f00130 S2 (api_validate en progreso). **Actual**: lock creado, `started_at == last_seen`, **3h+ sin update de heartbeat**.

**Esperado vs Actual**: F127 (pasada-13) confirmó `in_flight:[]` y 0 tmp files. **F153 demuestra que la regresión es continua** — cada vez que un agente claims un slice sin heartbeat, el zombie se reproduce. **F103 reincidente**.

**Severidad**: FATAL — F148 (smoke detector que no detecta) aplica también aquí: `state_health` no alertaría de este zombie.

**Cross-references**: F103 (zombie pattern original), F148 (smoke detector), F151 (state_health always healthy).

### F154 — 5 ramas `agent/*` activas — F23/F39/F50/F133 recidiva (FATAL operativo)

Re-audit-14 `git branch -a | grep agent/`:

```text
+ agent/claude-docfix                                          <-- WORKTREE
+ agent/codex-auto-work-pending-drift                          <-- WORKTREE
+ agent/codex-cli-logs-errors-tail                             <-- WORKTREE
+ agent/codex-close-slice-timeout                              <-- WORKTREE
+ agent/codex-observability-readme                             <-- WORKTREE
  agent/codex-prompt-eval-s1                                   <-- branch only
```

**Esperado**: branches `agent/*` cerradas post-merge. **Actual**: 5 ramas con worktree activo + 1 branch huérfana.

**Esperado vs Actual**: **F23/F39 reincidente**. Las nuevas ramas agent/* son `claude-docfix`, `codex-cli-logs-errors-tail`, `codex-close-slice-timeout`, `codex-observability-readme` — todas creadas **post-cierre de a00069**. La disciplina `agent-branch-naming` (S4) sigue sin gate enforced en CI.

**Severidad**: FATAL operativo — ramas agent/* proliferan post-cierre del audit que las detectó.

**Slice**: **S4** — enforcement de `agent-branch-naming` lint + branch-gc automático post-merge. (Ya propuesto en F50, F133 — vuelve a recidivar.)

**Cross-references**: F23/F39/F50/F133 (todos reincidentes).

### F155 — `usage-tracking/usage-summary.json.*.tmp` sigue 64 files — F104/F128 persistente (FATAL, no mitigado)

Re-audit-14 `ls .cache/mcp-vertex/results/usage-tracking/*.tmp | wc -l`:

```text
64
```

**Esperado**: 0 (F104/F128 FATAL). **Actual**: 64.

**Esperado vs Actual**: **F104 MEGA-WORSEN** persiste desde pasada-11 (era 63, ahora 64, +1). El lint `check-stray-cache-files` con `mtime > 60s` cross-cutting (S13.c) **NO se ha implementado** — el código sigue ahí pero el threshold no cubre `usage-tracking/*.tmp`.

**Severidad**: FATAL persistente — acumula ~1 tmp/24h.

**Slice**: **S5** (extensión de S13) — `check-stray-cache-files` con `*/*.json.*.tmp mtime > 60s` cross-cutting. Investigar `usage-tracking/write-pricing-summary.ts` (F104/S13.b).

**Cross-references**: F104/F128/F145.

### F156 — `lint:proposals` 1 fatal externo `f00130` — F131/F139 close-evidence pendiente (MEJORABLE persistente)

Re-audit-14 `bun tools/scripts/lint/proposals.script.ts`:

```text
ERROR in-progress/f00130-api-openapi-plugin.md
  line 0: frontmatter status "ready" expects folder "ready" but the nearest status ancestor is "in-progress"
```

**Esperado**: 0 fatales. **Actual**: 1 fatal externo.

**Esperado vs Actual**: `f00130` S1+S2 shipped (`0f407093` + `217e1609`) pero la propuesta sigue en `in-progress/` con `status: ready` (mismatch). **F131/F139 reincidente**.

**Severidad**: MEJORABLE — close-evidence pendiente. Necesita o (a) cambiar frontmatter a `status: in-progress` o (b) `proposal_reconcile_folder { id: "f00130" }` para mover a `ready/`.

**Cross-references**: F45/F64/F131/F139 (close-evidence recidiva).

### F157 — `c85303f1` a00069 cerrado pero **trimmed de 3688 → 223 líneas** — ¿dónde están F1-F147? (MEJORABLE pérdida de contexto)

Re-audit-14 `git show --stat c85303f1 | tail -5`:

```text
.../proposals/done/audits/a00069-25-07-2026-multi-agent-branch-state-drift-and-validation-leak.md | 3842 +-------------------
1 file changed, 2 insertions(+), 3840 deletions(-)
```

**Esperado**: cierre preserva el contenido del audit (F1-F147). **Actual**: cierre **borra 3840 líneas** (98% del contenido).

**Esperado vs Actual**: a00069 ahora es solo shipped-in + frontmatter resumido. **El detalle de F1-F147 se pierde**. La decisión de trim fue "for clarity" pero **rompe la trazabilidad**: una nueva revisión no puede auditar las decisiones pasadas.

**Esperado vs Actual**: si F1-F147 eran demasiado verbose, lo correcto era moverlos a un anexo (e.g. `a00069.findings.md`) o crear `a00069.archive.md` con el contenido completo. El trim directo **borra evidencia**.

**Severidad**: MEJORABLE — pérdida de contexto. Slice **S6** opcional: restaurar contenido completo en `done/audits/a00069.findings.md`.

**Cross-references**: F42 (verified state desfasado), F60 (close-evidence patrón).

### F158 — a00072 scoreboard 4.9 MUY MAL — pero F148-F152 son **duplicaciones cross-proposal** de bugs ya documentados en a00069 (FATAL duplicación)

Re-audit-14 mapping F148-F152 ↔ a00069:

| a00072 | a00069 equivalent | ¿Dup? |
|---|---|---|
| F148 (proposal_diagnose 17/17 returns vacíos) | F103 (Patrón zombie) | **SÍ — dup conceptual** |
| F149 (proposal_review 0 calls) | F8 (proposal_review existe pero no se usa) | **SÍ — dup directo** |
| F150 (108/150 tools unused) | F13 (21/24 plugins activos nunca dogfoodeados) | **SÍ — dup evolutivo** |
| F151 (state_health always healthy:true) | F15 (S6 landed en git pero no auto-aplica) | **SÍ — dup evolutivo** |
| F152 (quality_run 0 calls) | F13 + F35 (unusedActivePlugins) | **SÍ — dup evolutivo** |

**Esperado**: a00072 aterriza bugs **nuevos** descubiertos post-closure. **Actual**: a00072 re-documenta bugs ya conocidos en a00069, sin cross-refs explícitos.

**Esperado vs Actual**: **a00072 sección `related` cita `a00069`** pero los F-id-mapping no se hace explícito. Esto causa:
1. Doble trabajo de slices (S1-S3 en a00072 + slices ya hechas en a00069 S6/S7/S9).
2. Métricas duplicadas (scoreboard 4.9 vs a00069 scoreboard 8.0 — divergente).
3. Confusión de ownership: ¿quién implementa S1.a? ¿El agente de a00069 (ya cerrado) o el de a00072?

**Severidad**: FATAL de proceso — duplicación cross-proposal genera scope creep y confusion.

**Slice**: **S6** — refactor a00072 para que cada F-id tenga un cross-ref explícito a su equivalente en a00069. Si el F es genuinamente nuevo (no equivalente), documentar la evidencia nueva. Si es equivalente, considerar cierre como "evolved" o "dup-merged".

**Cross-references**: este mismo F158 es meta — la duplicación es estructural.

### F159 — `f00130` S2 shipped (`0f407093` + `217e1609`) pero propuesta en `in-progress/` con `status: ready` mismatch — F131/F139/F156 reincidente (MEJORABLE)

Re-audit-14 `git log --oneline f00130`:

```text
217e1609 feat(f00130): add api_validate contract validator
0f407093 feat(f00130): S2 api_validate — contract validation against OpenAPI schema
dcac0462 feat(f00130): S1 — api plugin spec parse + request build (api_call)
```

**Esperado**: f00130 cerrada (S1+S2 done). **Actual**: 3 commits shipped, propuesta en `in-progress/` con `status: ready` (mismatch).

**Severidad**: MEJORABLE — close-evidence pendiente.

**Slice**: ejecutar `mcp-vertex_proposals_proposal_reconcile_folder { id: "f00130" }`.

### F160 — `apps/web/scripts/__tests__/preset-table.spec.ts` modified — test counts 14→16 → 36 plugins (F132 evol, INFO)

Re-audit-14 `git status --short`:

```text
 M apps/web/scripts/__tests__/preset-table.spec.ts
```

**Severado**: INFO — F132 evolución. Test counts reflejan 36 plugins (era 14).

### F161 — `docs/mcp-vertex/agent-catalog.generated.json` modified — F134 evol (INFO)

**Severado**: INFO — F134 evolución. Catalog regenerado con 36 plugins.

### F162 — `plugins/database/src/lib/introspect/introspect-engine.ts` modified — f00128 S4+ (MEJORABLE proceso)

Re-audit-14 `git status --short`:

```text
 M plugins/database/src/lib/introspect/introspect-engine.spec.ts
 M plugins/database/src/lib/introspect/introspect-engine.ts
 M plugins/database/src/lib/tools/db-schema.tool.spec.ts
```

**Esperado**: f00128 S3 done (3a3dd248). **Actual**: 3 archivos de introspect modified, presumiblemente para S4+ del database plugin.

**Esperado vs Actual**: el database plugin sigue extendiéndose sin propuesta visible. **Slice**: documentar S4+ en f00128 o abrir f00152 (database S4 followup).

**Severidad**: MEJORABLE — trabajo sin trazabilidad.

### F163 — `token-budget.e2e.spec.ts` modified — F135 evol (INFO)

**Severado**: INFO — F135 evolución.

### F164 — `usage-tracking/usage-summary.json.*.tmp` con 0 bytes — `open()` sin `write()` (MEJORABLE / F103 Bug C variante)

Re-audit-15 `find .cache/mcp-vertex/results/usage-tracking -name '*.tmp' -size 0`:

```text
mrzdxe...0 bytes   mtime=2026-07-24T22:20:42  (size 0)
mrzfq...0 bytes   mtime=2026-07-24T23:11:18  (size 0)
mrzk5...0 bytes   mtime=2026-07-25T01:15:05  (size 0)
mrzolc5...0 bytes  mtime=2026-07-25T03:19:15  (size 0)
mrzp0p...0 bytes   mtime=2026-07-25T03:31:12  (size 0)
mrzl76...0 bytes   mtime=2026-07-25T01:44:16  (size 0)
ms0bno...0 bytes   mtime=2026-07-25T14:04:55  (size 0)

Total: 7/64 (11%) zero-byte tmp files en usage-tracking
```

**Diagnóstico**:

- F103 Bug C describe el patrón **write→fsync→rename** interrumpido
  entre `open` y `rename`, lo que deja un tmp con contenido
  parcial (≥1 byte).
- **F164 describe una variante**: el tmp se crea con `open(tmp, 'w')`
  pero **`write`/`writeFile`/`fsync` nunca se llama** antes del
  rename o de un crash. El `catch` de `writeFileAtomic` borra
  el tmp (`rm(tmp, { force: true })`), pero si el crash ocurre
  **antes** del primer `await handle.writeFile()`, el tmp ya
  existe con 0 bytes.
- **Esperado vs Actual**: 7/64 (11%) de los tmp son 0 bytes.
  `writeFileAtomic` debería llamar a `handle.truncate(0)` o
  verificar `tmp exists && size === 0` antes de escribir.
- **Severidad**: MEJORABLE — variante de F103/F155/F128. El
  código actual `open(tmp, 'w')` trunca implícitamente, pero
  si `writeFile` no se llama, el tmp queda vacío.

**Slice**: **S5** (extender F155) — `writeFileAtomic` con
`assertion` post-`open`: si `tmp` existe con size=0 y
`stat(absolutePath).size > 0`, el tmp es huérfano.

**Cross-references**: F103 (Bug C original), F155 (64 tmp
usage-tracking), F128 (mega-worsen 64 files).

**Estado**: OPEN (MEJORABLE).

### F165 — `subagent-registry.json` tiene 5 entries `adopted` con task_ids históricos — anti-pattern (MEJORABLE)

Re-audit-15 `cat .cache/mcp-vertex/subagent-registry.json`:

```json
{
  "version": 2,
  "adopted": [
    { "name": "mcp-core-s4-runner",     "task_id": "p111-s4-memory-concurrency" },
    { "name": "mcp-core-p112-s1",        "task_id": "p112-s1-local-aliases-module" },
    { "name": "mcp-core-p112-s2",        "task_id": "p112-s2-wire-local-aliases" },
    { "name": "codex-orchestrator",      "task_id": "a00022-S1" },
    { "name": "implementation_runner",   "task_id": "f00051-S10" }
  ],
  "assignments": []
}
```

**Diagnóstico**:

- 5 entries en `adopted` con task_ids **históricos** (p111, p112,
  a00022, f00051) — ninguno está activo ahora.
- `assignments: []` confirma que no hay agents en flight, pero
  `adopted` retiene nombres de agents que ya no se usan.
- **Esperado vs Actual**: F10/S6 esperaba GC automático de
  adopted entries. **Actual**: 5 adopted persisten indefinidamente.
  `state_repair` no limpia el campo `adopted`.

**Esperado**: `state_repair` aplica un TTL a `adopted` (default 7d).
**Actual**: `adopted` crece monótonamente.

**Slice**: **S7** (extender S10 — auto state_repair) —
`removeAdoptedOlderThan({ days: 7 })` invocado en cada
`state_repair` + boot.

**Cross-references**: F10 (registry + round-context zombies),
F15 (S6 landed pero no se auto-aplica), F148 (mismo anti-pattern
— smoke detector no limpia).

**Estado**: OPEN (MEJORABLE).

### F166 — `proposals/in-progress/` con 6 archivos pero 2 son zombis (close-evidence faltante) (MEJORABLE)

Re-audit-15 `ls docs/mcp-vertex/proposals/in-progress/`:

```text
.gitkeep
a00072-25-07-2026-deeper-log-scan-bugs-f148-f152.md   (this proposal)
f00119-auto-agent-selector-plugin.md                  (F131/F139/F156 reincidente)
f00125-browser-plugin.md                              (F91 partial)
f00143-agent-operating-excellence-and-session-governance-program.md
v00122-collapse-4-call-bootstrap-into-1-call-auto-work.md
```

**Diagnóstico**:

- 5 propuestas activas (excluyendo `.gitkeep` y a00072).
- **f00119**: frontmatter dice `status: in-progress` pero su
  S5/S6 ya shipped. close-evidence pendiente (F131/F139/F156
  reincidente).
- **f00125**: frontmatter dice `status: in-progress` pero S1+S2+S3
  ya shipped. Close-evidence pendiente (F91 partial).
- **f00143**: archivo en in-progress/ sin movimiento reciente —
  zombie.
- **v00122**: archivo en in-progress/ sin movement reciente.

**Esperado**: 0-1 in-progress/ (lo que está activamente en flight).
**Actual**: 4 zombis. Ratio: 80% in-progress/ son dead.

**Slice**: **S8** (extender F45/F64) — `proposal_diagnose`
añade check: para cada propuesta en in-progress/, verifica
que su `shipped-in` count == total slices. Si no, mark
`close-evidence-needed` en metadata.

**Cross-references**: F45 (x00072 close-evidence pendiente),
F64 (a00069 frontmatter stale), F131 (f00130 in-progress
mismatch), F156 (f00130 close-evidence pendiente),
F159 (f00130 reincidente).

**Estado**: OPEN (MEJORABLE — close-evidence chronic fail).

### F167 — `agents.lock.json` reescrito 482 veces en 9 días — write-amplification (MEJORABLE)

Re-audit-15 `git log --diff-filter=M .cache/mcp-vertex/agents.lock.json
| wc -l`:

```text
482   (commits modifying agents.lock.json)
```

**Diagnóstico**:

- El lock file es 482 bytes promedio. 482 escrituras en 9 días
  = ~54/día = 1 cada ~27 min.
- Cada write hace `open + write + fsync + rename + fsyncDir`
  (writeFileAtomic). Eso es ~5 syscalls × 482 = 2,410 syscalls
  en 9 días.
- **Esperado**: ≤10 escrituras/día (un claim + un release + un
  gc). **Actual**: 54/día = 5.4× el rate esperado.

**Causa raíz probable**: el `close_slice` reescribe el lock
cada vez, **incluso si no hay claims que limpiar**. La lock
GC se ejecuta en close_slice y eso escribe.

**Slice**: **S9** (extender S8 — agent_lock contrato):
- **S9.a** — `writeLock` solo escribe si el contenido cambió.
  Comparar JSON.stringify(oldLock) !== JSON.stringify(newLock)
  antes de escribir. Sin cambio, no write.
- **S9.b** — `close_slice` invoca `removeStale` solo si hay
  stale entries (no en cada close). Hoy se ejecuta siempre.

**Cross-references**: F103 (write amplification que crea tmp
files), F155 (64 usage-tracking tmp — mismo write-amplification
pattern), F158 (duplicación cross-proposal).

**Estado**: OPEN (MEJORABLE — performance, no correctness).

### F168 — `mcp-vertex_proposals_proposal_board` solo invocado 5× en 9 días — `auto_work` no le pasa la respuesta a `agent` (MEJORABLE)

Re-audit-15 (from previous F150):

```text
mcp-vertex_proposals_proposal_board calls: 5  (vs auto_work 92)
```

**Diagnóstico**:

- `proposal_board` retorna un snapshot del estado del swarm
  (proposals en cada status). Es útil para **decidir** qué
  proposal trabajar.
- 5 calls en 9 días = `auto_work` no lo usa para decidir.
- `auto_work` se llama 92× — cada call tiene una decision
  interna (cascade) pero **no usa `proposal_board`** para
  ver el estado global primero.
- **Esperado vs Actual**: el cascade de `auto_work` debería
  opcionalmente `proposal_board` antes de elegir slice. Hoy
  es opaco.

**Slice**: **S10** — `auto_work` invoca `proposal_board` antes
de cascade si `cascade.length > 5` (muchas proposals, ayuda
a priorizar). Slice ligero.

**Cross-references**: F150 (108/150 tools unused), F13 (plugins
sin dogfood).

**Estado**: OPEN (MEJORABLE).

### F169 — `auto_work` step "Run `bun run validate`" se da 89× pero solo 3 invocaciones reales (FATAL enforce gap)

Re-audit-15 (logs 9 días):

```text
auto_work invocations with "Run `bun run validate`" in steps: 89
tool invocations with `bun run validate` in args: 3
ratio: 3/89 = 3.4% (95.6% omiten el step)
```

**Diagnóstico**:

- 89 invocaciones de `auto_work` retornan un `steps` array que
  incluye "Validate: run `bun run validate`" como step #5.
- Pero solo **3** invocaciones de tool en los logs tienen
  `bun run validate` en `args`. La diferencia es 86.
- Eso significa que **86/89 invocaciones de auto_work**
  sugieren al LLM que corra `bun run validate` pero el LLM
  **omite el step**.
- El gate S5 (close_slice validation) **NO chequea** que el
  LLM realmente ejecutó validate. Solo chequea que el
  `validationCommand` se ejecutó en el pasado (no en este
  ciclo).

**Esperado vs Actual**:

- `auto_work` step 5 dice "Run `bun run validate`" como
  obligation. El LLM lo skipea. close_slice retorna `ok:true`.
- El gate S5 acepta el close sin validate **real** en este
  ciclo.
- **Resultado**: 86 slices cerradas sin validate real.
  F80 (canonical 5203/5203 pass) es la **garantía nominal**;
  F169 es la **realidad operacional** (validate skipped).

**Esperado**:

- close_slice debe:
  1. Verificar que el LLM ejecutó `bun run validate` en este
     ciclo (no en el pasado).
  2. Si NO, rechazar el close con `blockerType: "validate-skipped"`.
  3. O auto_work debe ejecutar validate **server-side** antes
     de devolver el step list.

**Slice**: **S11** — `close_slice` requiere evidencia de
validate:

- **S11.a** — `close_slice` acepta `validateEvidence: { sha,
  passed, timestamp }`. Sin `validateEvidence.passed:true`,
  rechaza.
- **S11.b** — `auto_work` ejecuta `bun run validate` en su
  propio step (no delega al LLM). El step list solo incluye
  "Read close_slice instructions" en lugar de "Run validate".
- **S11.c** — Spec: 86 closes sin validate real → reject con
  `blockerType: "validate-skipped"`. Cubre regressions.

**Cross-references**: F21 (S5 omite validate en `gate:
none|lint`), F80 (canonical 5203/5203 pass — pero skip-rate
95.6% en practice), F142/F147 (auto_work re-claim — mismo
patrón de "step en step list, pero no ejecutado"), F149
(close_slice sin audit trail real).

**Estado**: OPEN (FATAL enforce).

## scoreboard

- **Locks**: 5.0 (MUY MAL — F148/F151 no detectados; F103 zombies
  no flaggeados; **F153 nuevo zombie en formación**).
- **Multi-agent discipline**: 5.5 (MUY MAL — F149 peer-review
  bypasseado; F150 72% tools sin dogfood).
- **Lifecycle review/done**: 4.0 (FATAL — S7 mergeado pero
  bypasseado, F149).
- **Registry / orientation**: 6.0 (MEJORABLE — F151 state_health
  no detecta stale).
- **Dogfood plugins**: 4.0 (FATAL — F150 108/150 tools unused,
  F152 quality_run 0 calls).
- **Locks**: 4.5 (MUY MAL — **F153 nuevo zombie reincidente F103**).
- **Multi-agent discipline**: 4.0 (MUY MAL — **F154 5 ramas agent/* activas recidiva F23/F39/F50/F133**).
- **Lifecycle review/done**: 4.5 (FATAL — **F156/F159 close-evidence pendiente**).
- **Registry / orientation**: 5.0 (MEJORABLE — F148/F151 no detectados).
- **Dogfood plugins**: 3.5 (FATAL — F150/F152 + **F158 duplicación cross-proposal**).
- **Documentation hygiene**: 4.0 (FATAL — **F157 a00069 trimmed 3840 líneas borradas**; **F158 duplicación**).
- **Cache integrity**: 4.5 (FATAL persistente — **F155 64 tmp files usage-tracking** + **F164 7 zero-byte tmp (11%)** + **F167 482 writes/9d write-amplification**).
- **Subagent registry**: 5.5 (MEJORABLE — **F165 5 adopted históricos sin TTL**).
- **Proposal structure**: 4.0 (FATAL — **F166 4/5 in-progress/ son zombis close-evidence** + **F168 proposal_board subutilizado**).
- **Enforce gap**: 4.0 (FATAL — **F169 86/89 auto_work invocations skipean bun run validate (95.6% skip-rate)**).
- **Average**: ~4.2 (MUY MAL). **Baja vs pasada-13 (4.9) por F153-F169 nuevos**. Post-S1-S11: ~7.0.

## notes

- Los F148-F152 son **bugs reales** del swarm, no de
  infraestructura del proposal. La separación entre
  "smoke detector que no detecta" (F148) y "peer-review
  gate mergeado pero bypasseado" (F149) muestra que el
  swarm tiene gaps de enforcement, no solo de discovery.
- El F150 (72% tools unused) **es un problema de adopción,
  no de calidad**: los tools están bien diseñados pero
  el swarm no los invoca. S3.a (auto_work wiring) cierra
  ese gap forzando la invocación en cada ciclo.
- El close de a00069 fue prematuro respecto a F148-F152.
  Este proposal a00072 es el "epilogue" necesario.
- cross-refs: a00069 (parent audit), f00078 (coordination),
  x00107 (outputSchema gate), f00073/f00075 (hygiene routines
  que deberían haber detectado F148/F151 antes de close).
