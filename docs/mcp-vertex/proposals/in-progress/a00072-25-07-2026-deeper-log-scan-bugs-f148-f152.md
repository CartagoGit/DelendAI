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

- **Status**: todo
- **Files**:
  - `plugins/proposals/src/lib/tools/recovery-tools.ts` —
    `runProposalDiagnose` filtro cross-proposal cuando hay zombies.
  - `plugins/proposals/src/lib/tools/state-tools.tool.ts` —
    `state_health` invoca `removeStale` antes de contar.
  - `plugins/proposals/src/lib/shared/purge-stale-locks.ts` (nuevo) —
    helper compartido `purgeStaleLocks` que ambos consumen.
- **Cambio** (3 sub-slices):
  - **S1.a** — `state_health` invoca `removeStale` antes de
    contar. Mover la lógica de
    `agent-lock-engine.ts:245-249` a un helper compartido
    `purgeStaleLocks`. Output: `locks.stale: 2` cuando hay zombies.
  - **S1.b** — `proposal_diagnose` cross-proposal cuando hay
    zombies. El filtro `task_id === id` se relaja a
    `task_id === id || crossProposal === true` cuando el
    caller es `auto_work`.
  - **S1.c** — `state_health` retorna `stale[]` cuando hay
    zombies. Nuevo campo `locks.stale: number` +
    `locks.staleTaskIds: string[]` + `locks.lastStaleSeen:
    string` (ISO).
- **Gate**: type, lint, test.
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

## scoreboard

- **Locks**: 5.0 (MUY MAL — F148/F151 no detectados; F103 zombies
  no flaggeados).
- **Multi-agent discipline**: 5.5 (MUY MAL — F149 peer-review
  bypasseado; F150 72% tools sin dogfood).
- **Lifecycle review/done**: 4.0 (FATAL — S7 mergeado pero
  bypasseado, F149).
- **Registry / orientation**: 6.0 (MEJORABLE — F151 state_health
  no detecta stale).
- **Dogfood plugins**: 4.0 (FATAL — F150 108/150 tools unused,
  F152 quality_run 0 calls).
- **Average**: ~4.9 (MUY MAL).

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
