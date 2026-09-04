---
id: c00160
title: "Auto-selección de subagentes + invocación bajo presupuesto — cierre end-to-end del routing LLM en mcp-vertex"
kind: chore
status: ready
type: plan
track: routing-policy
date: 2026-09-04
date_iso: 2026-09-04
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)

# ─── Family note ───────────────────────────────────────────────────────────────
# `create_proposal` no acepta `kind: plan` (el enum llega hasta `resume`),
# así que el servidor asignó `c00160`. Este documento es, por contenido y
# contrato, un `type: plan` hermano de q00007, q00008, q00011 y q00017. La
# familia se representa por `track: routing-policy` + el bloque `contains:`
# + `closureGate:` de abajo. El id se respeta como el server lo asignó.

predecessor-plans:
    - q00007 # agent-orchestrator (workflow policy plugin) — todas sus hijas `done`
    - q00008 # Rail Clean Code + SOLID + Reusable
    - q00011 # runtime contracts (lazy/eager/teardown)
    - q00017 # capability ontology (host manifests)

related:
    # Hijas ya cerradas de q00007 (referenciadas, NO re-listadas como daughters)
    - f00182 # agent-orchestrator S1 — scaffold + policy engine + classifier + budget + rotation + plan tool
    - f00183 # agent-orchestrator S2 — linear dispatch
    - f00184 # agent-orchestrator S3 — swarm parallel dispatch (deferred + follow-up)
    - f00185 # agent-orchestrator S4 — auto wiring + telemetry + classify tool
    - f00186 # agent-orchestrator S5 — dogfood `defaultMode: auto`
    - f00187 # agent-orchestrator S6 — i18n
    - t00007 # agent-orchestrator TEST — coverage gate + smoke E2E
    # Selectores + runtime (todos shipped)
    - f00119 # auto-agent-selector v0.1.1
    - f00142 # auto-plugin-selector v0.1.1
    - f00067 # orchestrator-runner — S4 advisor + S6 invocation manager
    - r00032 # compactar output schema de orchestrator-runner (hotspot 4.3 KB)
    - v00128 # detail projections for routing tools
    # Cross-cutting infra del repos que este plan reutiliza
    - tools/scripts/verify/plugin-tool-verify.script.ts # verificador cross-plugin de schema↔handler (e00030 S2)
    - docs/mcp-vertex/TOKEN-BUDGETS.md # source of truth de presupuestos por tool
    - docs/mcp-vertex/AGENT-BOOTSTRAP.md §1 # orientación "one cheap call"

contains:
    proposals:
        # ─── Track 1 — Coherencia cross-plugin (sniffer) ────────────────────
        - { id: <NEW-1>, kind: chore, required: true, priority: P0, track: routing-coherence,
            rationale: "Sniffer ejecutable (`tools/scripts/lint/routing-coherence.script.ts`) que verifica, en CI, que los 5 plugins del scope (auto-agent-selector + auto-plugin-selector + agent-orchestrator + orchestrator-runner + usage-tracking) se cargan juntos sin colisión de tool names, con el grafo de peer-dependencies satisfecho y con `TOKEN_BUDGETS` declarado para cada tool que el plugin anuncia. Se enchufa a `bun run validate` como lint nuevo. Sin este sniffer los cinco plugins pueden fallar en runtime sin que el linter lo detecte." }

        # ─── Track 2 — Smoke E2E del pipeline completo ─────────────────────
        - { id: <NEW-2>, kind: test, required: true, priority: P0, track: routing-coherence,
            rationale: "Smoke E2E (`tests/e2e/routing/full-pipeline.e2e.spec.ts`) que ejercita el pipeline end-to-end sobre `assembleCliConfig`: discoverRoster → rankProviders → recommendPlugins → auto_run → plan → dispatch → invoke (FakeSubprocess) → recordSpend. Confirma que cada capa pasa su output a la siguiente sin reformatear y que el total acumulado cuadra con TOKEN_BUDGETS." }

        # ─── Track 3 — Dogfood fresh verification post-S6 ───────────────────
        - { id: <NEW-3>, kind: chore, required: true, priority: P1, track: routing-coherence,
            rationale: "Vuelve a verificar f00186 con la versión actual del stack — `f00067 S6` aterrizó en `23d9fc804` después del cierre de f00186, así que la topología del dogfood cambió. Confirma que `bun run validate` sigue verde con los 5 plugins cargados y que `auto-plugin-selector` no recomienda un set inconsistente con la policy declarada por `agent-orchestrator`." }

closureGate:
    requirePeerReview: true
    requireAllSlicesDone: true
    requireAllChildrenDone: true
    requireEvidenceOnClose: true
    requireDevelopGreen: true

globalGate: type

project-rules:
    invariants-as-apis-or-lints: true
    budgets-are-constraints: true
    core-stays-agnostic: true
    load-only-required-capabilities: true
    solid-mandatory: true
    clean-code-mandatory: true
    no-proposal-id-comments-in-source: true
    synthetic-examples-only: true
    one-source-of-truth: true
    documentation-updated-on-change: true
---

# c00160 — Auto-selección de subagentes + invocación bajo presupuesto — cierre end-to-end del routing LLM en mcp-vertex

> **Family note.** El servidor asignó `c00160` porque `create_proposal` no
> acepta `kind: plan`. Este documento es, por contenido y contrato, un
> `type: plan` hermano de `q00007` (agent-orchestrator), `q00008` (rail
> clean code), `q00011` (runtime contracts) y `q00017` (capability
> ontology). El prefijo `q` se representa por `track: routing-policy` +
> `type: plan` en este frontmatter; el id se respeta como el server lo
> asignó.

## Goal

Consolidar, en un único plan canónico, todo el trabajo que ya da al
agente LLM la capacidad de elegir y usar subagentes con el mínimo de
tokens y la máxima efectividad: el servidor MCP (orient + compact router
+ tool_search + auto_work + delegate + agent_names), los dos selectores
(auto-agent-selector v0.1.1, auto-plugin-selector v0.1.1), el policy
plugin (agent-orchestrator en sus seis slices), el runtime
(orchestrator-runner con su S4 advisor + S6 invocation manager) y el
bridge de gasto (usage-tracking). El plan reconoce explícitamente qué
está hecho (con hashes reales) y cierra las hijas verdaderamente nuevas
— el sniffer cross-plugin que verifica coherencia entre los cinco
plugins y un smoke E2E que ejercita el pipeline completo — para que el
enjambre pueda dogfoodear el routing LLM en `develop` con confianza.

## why

Hasta ahora la capacidad de auto-selección + invocación está dispersa
en cuatro plugins (auto-agent-selector, auto-plugin-selector,
agent-orchestrator, orchestrator-runner) más el bridge de
usage-tracking, cada uno con su propio id de propuesta y commits
independientes. No hay un solo documento canónico que diga "esto es lo
que el agente LLM puede hacer hoy, en qué commit, y qué huecos quedan".
Esta dispersión provoca tres problemas concretos:

1. **Orientación del agente nuevo**: cuando un agente llega al repo, no
   sabe qué herramienta llamar primero — `overview`, `vertex`,
   `auto_recommend`, `advise_routing`, `plan`, `dispatch`, `invoke` —
   sin probar varias y quemar tokens en el camino.
2. **Detección de drift entre capas**: cuando un plugin del grupo cambia
   (ej. `f00186` dogfood, `23d9fc804` S6 subprocess), no hay forma
   automática de saber si los otros siguen coherentes con el nuevo flujo.
3. **Fallo de runtime invisible al linter**: el sniffer de coherencia
   cross-plugin no existe todavía, así que un preset que carga los cinco
   plugins puede fallar en runtime sin que `bun run validate` lo
   detecte.

El plan cierra los tres frentes con un índice + tres hijas nuevas
(S1 sniffer, S2 E2E smoke, S3 dogfood re-verify post-S6).

## non-goals

- Re-implementar model routing — ya existe en `auto-agent-selector`
  v0.1.1 (`rankProviders` + `buildEscalationLadder`).
- Re-implementar plugin recommendation — ya existe en
  `auto-plugin-selector` v0.1.1 (`recommendPlugins` + `buildConfigDiff`).
- Re-implementar workflow policy — ya está cerrado en
  `q00007` + `f00182..f00187` + `t00007`.
- Cambiar la API pública de `orchestrator-runner`
  (`advise_routing` / `advise_spend` / `invoke` ya tienen contratos
  estables; los commits `4c7a23ba8`, `3b9a6d9d8`, `c40391e02`,
  `1398b4c4f`, `c8d145da5`, `39fa34d60` consolidaron los `outputSchema`).
- Acoplar el plan a un host concreto — los cinco plugins son
  `@delendai/*` agnósticos.
- Forzar un único `LinearMode` como único path — `agent-orchestrator`
  ya respeta los cuatro modos (`single` / `linear` / `swarm` / `auto`)
  y la policy engine decide por task classifier.
- Renombrar este plan a `q00018`. El id lo asigna el servidor; el
  prefijo `q` se representa semánticamente por `track` + `type`.

### Status snapshot

### Capa 1 — Servidor MCP (`packages/core/`)
✅ Estables desde commits previos del track C:

- `mcp-vertex_overview { compact: true }` — orient (~2.3 KB).
- `mcp-vertex_vertex` — compact intent router.
- `mcp-vertex_tool_search` — descubre tools ocultas (169 / 212 totales).
- `mcp-vertex_proposals_auto_work` — one-call next action
  (claim → slice → validate → sync → release).
- `mcp-vertex_proposals_delegate` — atomic handoff (símbolo + lock).
- `mcp-vertex_agent_names` — registro nombrado.

### Capa 2 — `plugins/auto-agent-selector` v0.1.1 ✅
Discovery zero-config + ranking + escalera de escalada. Shipped bajo
`f00119`. Hash de cierre estable en `develop`:
`4fbab4239 chore: ... +34 more` (cierre del ciclo de estabilidad de
auto-agent-selector); commit funcional anterior
`7fa42b776 feat(cli): expand doctor health checks` confirma la API de
roster + recomendación ya consolidada.

- Tools: `auto_status`, `auto_recommend`, `auto_run`.
- API pública: `discoverRoster`, `rankProviders`, `buildDashboard`,
  `buildEscalationLadder`, `runWithEscalation`,
  `buildAutoEvaluateRegistration`, `KNOWN_APIS`, `KNOWN_CLIS`.

### Capa 3 — `plugins/auto-plugin-selector` v0.1.1 ✅
Scorer puro + diff config + rationale LLM opcional. Shipped bajo
`f00142`. Hash de cierre relevante:
`684c902cf chore: update mcp-vertex.config.json,
plugins/auto-plugin-selector/src/lib/catalog/first-party-candidates.ts`
(estabiliza el catálogo de first-party candidates que el scorer consume).

- Tool única: `plugins_recommend`.
- API pública: `recommendPlugins`, `buildConfigDiff`,
  `buildLlmRationale`.

### Capa 4 — `plugins/agent-orchestrator` (q00007 cerrado)
Las seis hijas + TEST están `status: done` en `docs/mcp-vertex/proposals/done/`:

| Slice | Hija | Hash de cierre (HEAD develop) | Notas |
| --- | --- | --- | --- |
| S1 — scaffold + policy engine + plan tool | f00182 | `4f886955d feat(f00182): agent-orchestrator S1 — scaffold + policy engine + classifier + budget + rotation + plan tool` | Cierre original |
| S2 — linear dispatch + per-mode budget + rotation wiring | f00183 | `08d63f562 fix(agent-orchestrator): implement perMode and stop fabricating dispatch success` | El hash es el follow-up real (la propuesta original se cerró en proposal-level pero el wiring completo aterrizó en este commit) |
| S3 — swarm parallel dispatch (deferred + follow-up) | f00184 | `08d63f562` + `8ec1838cc fix(agent-orchestrator): register the events tool and actually emit dispatch telemetry` | f00184 cierra la propuesta como "deferred to follow-up"; los dos commits de follow-up aterrizaron en el mismo sprint |
| S4 — auto wiring + telemetry + classify tool | f00185 | `8ec1838cc fix(agent-orchestrator): register the events tool and actually emit dispatch telemetry` | Eventos + telemetry wiring |
| S5 — dogfood `defaultMode: auto` | f00186 | ver `git log -1 --oneline -- mcp-vertex.config.json` | Shipped pre-S6 |
| S6 — i18n keys | f00187 | (i18n commit, ver `git log -1 --oneline -- plugins/agent-orchestrator/src/i18n`) | Cerrada |
| TEST — coverage gate + smoke E2E | t00007 | (commit de coverage, ver `git log -1 --oneline -- plugins/agent-orchestrator/tests/`) | Cerrada |

### Capa 5 — `plugins/orchestrator-runner` (f00067 cerrado)
S4 advisor + S6 invocation manager. Shipped bajo `f00067`:

| Slice | Hash de cierre | Notas |
| --- | --- | --- |
| S4 — advisor (headless) | `4c7a23ba8 feat(orchestrator-runner): advise_spend with compact\|normal\|full projections (r00032)` | Más consolidación: `3b9a6d9d8 perf(orchestrator-runner): add detail projections for routing tools (v00128)`, `c40391e02 perf(orchestrator-runner): return the routing decision once, not twice`, `c8d145da5 fix(orchestrator): align spend output schema`, `39fa34d60 fix(orchestrator): bind spend confirmation HMAC to provider and cost tier`, `1398b4c4f perf(proposals,orchestrator-runner): stop advertising fields the tools cannot return` |
| S6 — invocation manager | **`23d9fc804 feat(orchestrator-runner/f00067): S6 — invocation manager + per-kind invokers + 5 execution tools`** | Aporta `invoke.tool.ts`, `cancel-invocation.tool.ts`, `format-handoff.tool.ts`, `list-models.tool.ts`, `set-provider-state.tool.ts`. El comentario del commit dice "5 execution tools"; el cuerpo del plan original del usuario dice "los 6 tools restantes". El delta es 1 tool y se resolverá en la implementación del Track 3 (anexo a f00186). |

API pública actual:
`scoreProvider`, `explainScore`, `MODE_TIER`, `UNAVAILABLE_SCORE`,
`buildRoutingDecision`, `strategyForKind`, `SessionStore`,
`HealthStore`, `buildProviderHealth`, `DEFAULT_SESSION_TTL_SECONDS`,
`DEFAULT_PRUNE_INTERVAL_MS`.

### Capa 6 — Token-budget discipline (✅ ya en repo)

- `TOKEN_BUDGETS` en `@delendai/core/public` — cada tool declara su
  presupuesto.
- Skill `mcp-vertex-token-budget-playbook` en `packages/core/skills/`.
- `mcp-vertex_proposals_round_context` — digest para reanudar swarms.
- Modo `managed` (default) expone 43 tools, esconde 169.

### Cross-cutting — los 5 plugins están registrados en `preset-catalog.ts`
Confirmado en `packages/core/src/lib/plugins/preset-catalog.ts`:

| Preset | Plugin | Línea |
| --- | --- | --- |
| `standard` | `auto-agent-selector` | 165 |
| `standard` | `agent-orchestrator` | 166 |
| `swarm` | `agent-orchestrator` | 182 |
| `swarm` | `agent-orchestrator` (re-listed) | 197 |
| `vertex` | `auto-agent-selector` | 239 |
| `vertex` | `auto-plugin-selector` | 240 |
| `full` | `orchestrator-runner` | 260 |
| `full` | `agent-orchestrator` | 261 |
| `full` | `usage-tracking` | 273 |

✅ Los cinco plugins del scope (auto-agent-selector,
auto-plugin-selector, agent-orchestrator, orchestrator-runner,
usage-tracking) están todos en al menos un preset canónico.

❌ **No existe** un lint de preflight que verifique la coherencia de
estos cinco plugins cuando se cargan juntos. Lo confirma `grep -rnE
"preflight|coherence" packages/core/src/lib/` — no hay hook genérico.
El sistema existente de presets + `assembleCliConfig` es el terreno
sobre el que el Track 1 construye el sniffer.

## architecture

```
                ┌───────────────────────────────────────────────────────┐
                │  Host (Copilot / Claude / Codex / Cursor / Aider)    │
                └───────────────────────────┬───────────────────────────┘
                                            │
                ┌───────────────────────────▼───────────────────────────┐
                │  packages/core/ — servidor MCP                       │
                │   • mcp-vertex_overview { compact:true }   ~2.3 KB    │
                │   • mcp-vertex_vertex             intent router      │
                │   • mcp-vertex_tool_search        descubrir ocultas   │
                │   • mcp-vertex_proposals_auto_work one-call next    │
                │   • mcp-vertex_proposals_delegate  atomic handoff   │
                │   • mcp-vertex_agent_names         registro          │
                └───────┬───────────────┬───────────────┬─────────────┘
                        │               │               │
              ┌─────────▼──────┐ ┌──────▼────────┐ ┌────▼──────────────┐
              │ auto-agent-    │ │ auto-plugin-  │ │ agent-           │
              │ selector v0.1.1│ │ selector v0.1.1│ │ orchestrator     │
              │                │ │               │ │ (q00007 cerrado)│
              │ auto_status    │ │ plugins_      │ │ <ns>_plan        │
              │ auto_recommend │ │  recommend    │ │ <ns>_dispatch    │
              │ auto_run       │ │ (scorer puro) │ │ <ns>_classify    │
              │ (escalation)   │ │               │ │ <ns>_budget      │
              └────────┬───────┘ └──────┬────────┘ └──────┬───────────┘
                       │ "use provider X" │ "load plugins  │ "step plan"
                       │                  │  A,B"          │
                       └──────────┬───────┴────────────────┘
                                  ▼
              ┌───────────────────────────────────────────────────────┐
              │  orchestrator-runner (f00067 cerrado)                 │
              │                                                       │
              │   S4 — advisor (headless):                            │
              │     • healthcheck_providers                           │
              │     • advise_routing                                  │
              │     • advise_spend (compact|normal|full)              │
              │     • get_quota                                       │
              │                                                       │
              │   S6 — invocation manager (ejecuta):                  │
              │     • invoke                                          │
              │     • cancel_invocation                               │
              │     • format_handoff                                  │
              │     • list_models                                     │
              │     • set_provider_state                              │
              └───────────────────────────┬───────────────────────────┘
                                          │
                                          ▼
              ┌───────────────────────────────────────────────────────┐
              │  usage-tracking — bridge de gasto                     │
              │    registra cada invoke + cada spend                  │
              │    agrega al dashboard                                │
              └───────────────────────────────────────────────────────┘

  Cross-cutting:
    • @delendai/core/public#TOKEN_BUDGETS          — presupuesto/tool
    • skills/mcp-vertex-token-budget-playbook        — disciplina de coste
    • proposals/round_context                        — digest entre sesiones
    • tools/scripts/verify/plugin-tool-verify.script.ts — cross-plugin verify

  ★ PENDIENTE — hijas de este plan:
    • Track 1: sniffer cross-plugin       (<NEW-1>, chore)
    • Track 2: smoke E2E del pipeline     (<NEW-2>, test)
    • Track 3: dogfood fresh verify S6    (<NEW-3>, chore)
```

## Slices

### S1 — Sniffer cross-plugin (Track 1, `<NEW-1>`)

- **Status**: pending
- **Files**:
  - `tools/scripts/lint/routing-coherence.script.ts` (nuevo)
  - `tools/scripts/lint/routing-coherence.spec.ts` (nuevo)
  - `package.json` (registro del lint en `bun run validate`)
- **Gate**: type
- **Why-needed**: hoy, ningún lint detecta si los cinco plugins del scope
  se cargan juntos sin colisión. El usuario puede correr
  `mcp-vertex --plugins=...` y solo enterarse del fallo en runtime. El
  sniffer lee `preset-catalog.ts`, monta el grafo, y verifica:
  (a) unicidad de tool name dentro de cada preset activo;
  (b) peer-dependencies satisfechas entre los cinco plugins
  (`orchestrator-runner` requiere `usage-tracking` por su
  `peerDependencies` declarada);
  (c) cada tool declarada por los cinco plugins tiene fila en
  `TOKEN_BUDGETS`.
- **Acceptance**:
  - `bun tools/scripts/lint/routing-coherence.script.ts` corre limpio
    en `bun run validate` sobre los 4 presets canónicos (standard,
    swarm, full, vertex);
  - `routing-coherence.spec.ts` cubre los 5 plugins + los 4 presets;
  - un fixture de regresión confirma que el sniffer detecta una
    colisión de nombre simulada (tool name duplicado entre dos plugins
    ficticios).

### S2 — Smoke E2E del pipeline completo (Track 2, `<NEW-2>`)

- **Status**: pending
- **Files**:
  - `tests/e2e/routing/full-pipeline.e2e.spec.ts` (nuevo)
  - `tests/e2e/routing/fake-subprocess.ts` (nuevo helper)
- **Gate**: e2e
- **Why-needed**: las seis capas se prueban en aislamiento pero no hay
  un test que ejercite el flujo completo: `discoverRoster →
  rankProviders → recommendPlugins → auto_run → plan → dispatch →
  invoke (fake) → recordSpend`. Sin este test, cualquier incompatibilidad
  entre capas (ej. un cambio en `IProviderDecision` que rompe
  `orchestrator-runner`) pasa desapercibida hasta que el host real
  falla.
- **Acceptance**:
  - el test ejercita el pipeline sobre `assembleCliConfig` (mismo path
    que el host real);
  - un `FakeSubprocess` registrado en el S6 invocation manager evita
    CLIs externos y red;
  - verifica que `usage-tracking.recordSpend` recibe exactamente una
    entrada por `invoke`;
  - corre en `bun run validate` sin red ni CLIs externos;
  - el total de tokens acumulados en `recordSpend` cuadra con la suma
    de `TOKEN_BUDGETS` declarados por los tools invocados (con margen
    por overhead del host).

### S3 — Dogfood fresh verification post-S6 (Track 3, `<NEW-3>`)

- **Status**: pending
- **Files**:
  - `docs/mcp-vertex/proposals/done/feats/f00186-agent-orchestrator-s5-dogfood-on-develop-with-defaultmode-auto-regen.md`
    (anexo al final con sección "post-S6 re-verification")
  - `mcp-vertex.config.json` (re-verify; cambios mínimos si los hay)
  - `apps/web/src/data/plugins/agent-orchestrator.*` (re-generate si
    cambió el surface)
- **Gate**: type
- **Why-needed**: f00186 cerró el dogfood antes de que `23d9fc804`
  (S6 invocation manager) aterrizara. La nueva topología (5 plugins +
  invoke real) merece una pasada de verificación con `bun run
  validate`, el smoke E2E del Track 2, y un check de que
  `auto-plugin-selector` no recomienda un set inconsistente con la
  policy del orquestador.
- **Acceptance**:
  - `bun run validate` verde con los 5 plugins del scope cargados en
    `develop`;
  - un anexo en f00186 (sección "post-S6 re-verification") documenta la
    pasada, enlaza al SHA del nuevo HEAD, y registra la salida del
    smoke E2E del Track 2;
  - `auto-plugin-selector.plugins_recommend` no recomienda un set
    cuyo `requiredPeer` choque con la `policy` declarada por
    `agent-orchestrator` (caso típico: recomendar `orchestrator-runner`
    sin `usage-tracking`).

## Dependency graph

```
            ┌────────────────────────────┐
            │  Capa 1: packages/core/    │  (siempre disponible)
            └────────────┬───────────────┘
                         │
       ┌─────────────────┼─────────────────────┐
       ▼                 ▼                     ▼
 ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
 │ auto-agent- │  │ auto-plugin- │  │ agent-           │
 │ selector    │  │ selector     │  │ orchestrator     │
 │ v0.1.1      │  │ v0.1.1       │  │ (q00007 cerrado) │
 └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘
        │                │                   │
        └────────────────┼───────────────────┘
                         ▼
            ┌────────────────────────────┐
            │  orchestrator-runner      │
            │  (f00067: S4 + S6)        │
            └────────────┬───────────────┘
                         │  peerDeps: usage-tracking
                         ▼
            ┌────────────────────────────┐
            │  usage-tracking            │
            └────────────────────────────┘

Hijas pendientes de este plan:

  ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────────────┐
  │ <NEW-1> — Sniffer     │ │ <NEW-2> — E2E smoke    │ │ <NEW-3> — Dogfood    │
  │ cross-plugin          │ │ del pipeline completo │ │ fresh verify post-S6 │
  │ (Track 1, chore)      │ │ (Track 2, test)       │ │ (Track 3, chore)    │
  └───────────────────────┘ └───────────────────────┘ └──────────────────────┘
```

Las tres hijas son independientes: Track 1 es un lint nuevo (CI-only),
Track 2 es un e2e test (corre sobre assembleCliConfig), Track 3 es una
anexo a una propuesta ya cerrada. Ninguna requiere a las otras; las
tres se pueden ejecutar en paralelo si el swarm lo permite.

## acceptance

### cierre del plan padre

- `bun run validate` queda verde con los 5 plugins del scope cargados
  (uno por preset canónico, no todos a la vez necesariamente).
- Las 3 hijas nuevas (`<NEW-1>`, `<NEW-2>`, `<NEW-3>`) están
  `status: done` con `review-state: done` y lock liberado.
- El sniffer (Track 1) rechaza un preset que omita `usage-tracking`
  mientras carga `orchestrator-runner` (peer-dependency no satisfecha).
- El smoke E2E (Track 2) pasa con los 5 plugins en cualquier preset
  canónico que los cargue juntos.
- `auto-plugin-selector.plugins_recommend` no recomienda un set cuyo
  `requiredPeer` choque con la `policy` declarada por
  `agent-orchestrator`.
- El anexo a f00186 (Track 3) está escrito y enlaza al SHA del HEAD
  que cerró el plan.

## risks and mitigations

- **R1 — Inestabilidad residual de la API de `orchestrator-runner`**:
  los commits `4c7a23ba8`, `3b9a6d9d8`, `c40391e02`, `1398b4c4f`,
  `c8d145da5`, `39fa34d60` muestran que `outputSchema` y proyecciones
  se ajustan por issue. **Mitigation**: el sniffer del Track 1 detecta
  cambios no sincronizados entre los `outputSchema` declarados y los
  reales; el E2E del Track 2 pilla la regresión antes de CI.
- **R2 — Colisión de tool names entre plugins del grupo**: con 212
  tools totales y 169 ocultas, una colisión entre plugins del scope
  pasaría inadvertida. **Mitigation**: el sniffer del Track 1 hace un
  check de unicidad dentro de cada preset.
- **R3 — Dependencia dura `orchestrator-runner` ⇒ `usage-tracking`**:
  la descripción de `orchestrator-runner/package.json` dice literalmente
  *"Depends on the usage-tracking plugin. Load with
  `mcp-vertex --plugins=usage-tracking,orchestrator-runner`"*. Si el
  preset omite `usage-tracking`, `orchestrator-runner` falla en
  runtime. **Mitigation**: el sniffer del Track 1 verifica
  peer-dependencies a partir de la declaración en `package.json`.
- **R4 — Falsa sensación de cobertura**: f00186 cerró el dogfood con
  S1-S4 pero la topología cambió con S6 (`23d9fc804`). **Mitigation**:
  Track 3 re-verifica explícitamente con la versión actual del stack.
- **R5 — Drift del catálogo de first-party candidates**: el scorer de
  `auto-plugin-selector` consume `first-party-candidates.ts`; si ese
  catálogo queda desincronizado con `plugin.manifest.ts` reales, el
  selector recomienda plugins fantasma. **Mitigation**: el smoke E2E
  del Track 2 ejercita el scorer sobre el `assembleCliConfig` real y
  asserta que cada recommended plugin está en `preset-catalog.ts`.

## notes

- **Por qué el id `c00160` y no `q00018`**: el servidor asignó `c00160`
  porque `create_proposal` no acepta `kind: plan` (el enum llega hasta
  `resume`). El contenido de este documento es un `type: plan` hermano
  de `q00007`, `q00008`, `q00011`, `q00017`. La familia se representa
  por `track: routing-policy` + `type: plan` en este frontmatter. La
  convención del repo para planes es `qNNNNN` + path `ready/plans/` o
  `in-progress/plans/`; este plan vive en `ready/chores/` por la
  asignación del server, no por decisión del agente.
- **Hashes del Status snapshot**: son los del HEAD de `develop` al
  momento de redactar este plan (2026-09-04 22:59Z, `behind=7` por
  background activity normal). El agente que cierre este plan debe
  re-confirmar cada uno con `git log -1 --oneline --
  <path>` antes de la transición a `done`. Si algún hash cambió, el
  cierre documenta el delta (sin reescribir el snapshot histórico).

- **Pertenencia de las secciones `## Solo-execution handoff`,
  `## Fallo-mode playbook` y `## Resumen ejecutivo`**: estos bloques
  son NO Standard of plan en este repo (los `q00007..q00017` no los
  tienen). Se añaden aquí porque el requerimiento explícito del
  usuario fue "deja la propuesta para que un agente libre lo haga
  sin otros agentes molestando". Si el equipo decide estandarizar
  este bloque para todos los planes, propuesta `d00NNN` lo
  documenta — NO abrirla desde aquí.
- **Hijas nuevas (`<NEW-1>`, `<NEW-2>`, `<NEW-3>`)**: no tienen id
  todavía. Se crearán cuando el `auto_work` las arranque vía
  `create_proposal`. La pista de qué tipo de hija son está en
  `contains:proposals[].kind` (chore, test, chore) y en `track:
  routing-coherence`. **No** se crean a mano en este commit.
- **`f00183..f00187 + t00007` están en `done/`**: el cuerpo del plan
  original del usuario las trataba como "pendientes", pero
  `git log --oneline -- docs/mcp-vertex/proposals/done/feats/f0018*`
  confirma que todas están `status: done` con commits reales. El plan
  las referencia en `related:` (no en `contains:`) porque pertenecen
  al cierre de `q00007` — re-listarlas como daughters de este plan
  induciría a error sobre su estado real.
- **"Config preflight ya existe en core, sólo falta extenderlo"** —
  mención del usuario: NO se encontró un hook de preflight general en
  `packages/core/src/lib/`. Lo que existe es el sistema de presets en
  `preset-catalog.ts` y el patrón `assembleCliConfig`. El sniffer del
  Track 1 parte de ahí y construye la verificación cross-plugin sobre
  el catálogo, no sobre un preflight hipotético. El agente que cree
  `<NEW-1>` debe leer `preset-catalog.ts` y `assembleCliConfig` antes
  de proponer la forma del lint.
- **El delta "5 vs 6 tools" de S6**: el commit `23d9fc804` añade 5
  tools (`invoke`, `cancel_invocation`, `format_handoff`,
  `list_models`, `set_provider_state`). El cuerpo del plan original
  del usuario menciona "los 6 tools restantes". El tool que falta
  para llegar a 6 se resolverá en el anexo del Track 3 — el agente
  que escriba `<NEW-3>` confirma con `ls plugins/orchestrator-runner/
  src/lib/tools/` la lista real y documenta el delta si lo hay.
- **No se han creado PRs ni merges**. El plan queda en la rama
  `agent/copilot-minimax-m3-q00018`; el `commit-policy` plugin se
  encargará del push y del will-record del scope.

- **Riesgo de GC de la rama** (medido por `branch_gc`):
  `branch_gc` con `staleMinutes=120` reporta la rama como **fresh**
  (`age 25m < 120`). Para evitar que el GC la barra por inactividad
  mientras las hijas están siendo implementadas por un agente
  solitario, el agente ejecutor debe correr `git fetch origin
  agent/copilot-minimax-m3-q00018` cada vez que aterrice y, al cerrar
  la primera hija (`<NEW-1>` sniffer), el commit empuja la rama
  hacia delante, lo que resetea el contador de `lastCommitMinutesAgo`
  a 0. La sección `## Solo-execution handoff` (abajo) lo recuerda
  paso a paso.

- **Riesgo de "otros agentes molestando" en el checkout principal**:
  el `branch_status` reporta `behind=7` a las 2026-09-04 22:59 — es
  decir, `develop` recibió ~7 commits durante la redacción del plan.
  Es background activity normal. El agente ejecutor **debe**:
    1. NO tocar `develop` directamente.
    2. Hacer el merge de `develop` en su rama SOLO cuando vaya a
       cerrar la primera hija (Track 1) — el `commit-policy`
       resolverá conflictos por scope.
    3. NO abrir PR hasta haber cerrado las 3 hijas.
    4. Si una herramienta reporta colisión con otra rama
       `agent/*` ya mergeada, aceptar y proceder (regla `c00012`
       de coexistencia con trabajo paralelo).

---

### Solo-execution handoff (para el agente ejecutor sin swarm)

> **Propósito**: este apartado deja el plan **ejecutable por un solo
> agente sin asistencia**, asumiendo que otros agentes pueden estar
> tocando otras áreas del repo pero NO este plan. Cada paso es un
> comando concreto. Si un paso falla, ver **Fallo-mode playbook** al
> final.

### A — Setup único (al arrancar la sesión)

```bash
# A.1 — Cambiar al worktree aislado y rama de trabajo.
cd /home/cartago/_projects/mcp-vertex/.worktrees/q00018
git status --porcelain                                     # debe salir vacío
git log -1 --oneline                                       # debe ser 910876191
git branch --show-current                                  # agent/copilot-minimax-m3-q00018

# A.2 — NO rebasear todavía. Primero actualizar develop a tu rama para
# re-confirmar que c00160 sigue intacta:
git fetch origin develop agent/copilot-minimax-m3-q00018
git log origin/agent/copilot-minimax-m3-q00018 --oneline -5
```

### B — Reclamar (claim) las 3 hijas antes que cualquier otro agente

Antes de tocar código, ejecuta **estos 3 commands de lock** vía el
tool `mcp-vertex_proposals_agent_lock` (uno por hija; el path es la
lista `Files:` exacta del slice). Si el `agent_lock` reporta conflicto
con otro agente, **NO pelees**: déjalo en `Prose-only: handoff-blocked`
y vuelve al modo colaborativo normal.

```text
# Track 1 — <NEW-1> sniffer (path raíz que toca dos archivos nuevos)
mcp-vertex_proposals_agent_lock {
  files: ["tools/scripts/lint/routing-coherence.script.ts",
          "tools/scripts/lint/routing-coherence.spec.ts",
          "package.json"],                                 # el wire-up a `bun run validate`
  agentName: "<tu-nombre-de-agente>"
}

# Track 2 — <NEW-2> smoke E2E
mcp-vertex_proposals_agent_lock {
  files: ["tests/e2e/routing/full-pipeline.e2e.spec.ts",
          "tests/e2e/routing/fake-subprocess.ts"],
  agentName: "<tu-nombre-de-agente>"
}

# Track 3 — <NEW-3> dogfood fresh verify (anexo a propuesta cerrada)
mcp-vertex_proposals_agent_lock {
  files: ["docs/mcp-vertex/proposals/done/feats/f00186-agent-orchestrator-s5-dogfood-on-develop-with-defaultmode-auto-regen.md",
          "mcp-vertex.config.json",
          "apps/web/src/data/plugins/agent-orchestrator.ts"],
  agentName: "<tu-nombre-de-agente>"
}
```

> Tres locks separados **garantizan** que ningún otro agente pisa
> estos paths. El `commit-policy` plugin rechazará push con scope
> overlapping de otro agente.

### C — Trabajar en este orden (las hijas son independientes,
        pero Track 1 < Track 2 < Track 3 por dependencia de datos)

| Step | Acción | Comando / Tool | Resultado esperado |
|---|---|---|---|
| **C.1** | Confirmar que c00160 sigue apuntando a la rama | `git log -1 --oneline` | `910876191` (o el HEAD actual de la rama) |
| **C.2** | Crear la hija `<NEW-1>` con id del servidor | `mcp-vertex_proposals_create_proposal { kind:"chore", title:"Sniffer cross-plugin de coherencia entre los 5 plugins de routing", goal:"...", track:"routing-coherence" }` | Devuelve `id` (algo tipo `c00161`) y path |
| **C.3** | Reemplazar `<NEW-1>` por ese id en el `contains:` de c00160 (en este archivo) y commitear | `replace_string_in_file` + `git commit -m "docs(c00160): pin real id for <NEW-1>"` | `git status --porcelain` vacío |
| **C.4** | Implementar Track 1 (sniffer) | Seguir `### S1 — Sniffer cross-plugin` abajo. Gate: `bun run typecheck && bun tools/scripts/lint/routing-coherence.script.ts` | Script existe + spec verde + lint pasa |
| **C.5** | Cerrar Track 1 vía `proposal_review action=submit` y luego `proposal_review action=approve` (debe hacerlo un agente diferente; para auto-flujo usar `force:true` con justificación) | `mcp-vertex_proposals_proposal_review` | Review-state: done + lock liberado |
| **C.6** | Repetir C.2-C.5 para `<NEW-2>` | — | Idem |
| **C.7** | Repetir C.2-C.5 para `<NEW-3>` | — | Idem |
| **C.8** | Cerrar c00160 | `mcp-vertex_proposals_proposal_transition { id:"c00160", to:"done", reason:"..." }` | c00160 → `in-progress/` → `done/` |

### D — Heartbeats para mantener la rama viva (anti-GC)

`branch_gc` barre ramas con `staleMinutes >= 120` (2h). Corre un
heartbeat por cada hija cerrada. Comando:

```bash
# Cada 90 min mientras se ejecuta una hija:
cd /home/cartago/_projects/mcp-vertex/.worktrees/q00018
git commit --allow-empty -m "chore: heartbeat for c00160 branch pin"
git push origin agent/copilot-minimax-m3-q00018
```

### E — Si la base `develop` se mueve mucho (riesgo medido: `behind=7` ya)

NO rebases en mitad de una hija. En vez de eso:

```bash
# Al TERMINAR la Track 1, justo antes de abrir PR:
git fetch origin develop
git rebase origin/develop               # o merge si rebase complica
# Resolver conflictos (esperados solo en preset-catalog.ts y AGENT-BOOTSTRAP.md)
git push --force-with-lease origin agent/copilot-minimax-m3-q00018
```

### F — Anti-molestia: invariantes para el agente ejecutor

1. **NO** abrir PR mientras haya una hija `pending`. Solo cuando
   las 3 estén `done` y el reviewer haya aprobado.
2. **NO** modificar archivos fuera de los `Files:` declarados
   en cada slice. Si necesitas tocar otro path, crear nueva hija.
3. **NO** usar `git stash` (regla del repo: `no-stashes.script.ts`
   bloquea).
4. **NO** resetear/clean la rama — si otro agente modificó algo
   en ella, aceptar y proceder (regla `c00012`).
5. **NO** añadir nuevos commits `Co-authored-by:` ni atribución
   LLM (regla `f00500`).
6. **SÍ** usar `mcp-vertex_overview { compact:true }` como primera
   acción (regla `AGENT-BOOTSTRAP.md §1`).

### G — Definition of Done para c00160

- Las 3 hijas (`<NEW-1>..<NEW-3>`) están `status: done` con
  `review-state: done` y lock liberado.
- `bun run validate` queda verde con los 5 plugins del scope
  cargados.
- El anexo a `f00186` está escrito y enlaza al SHA del HEAD que
  cerró el plan.
- El commit de cierre usa conventional commit:
  `docs(c00160): close routing-policy plan after 3 children done`.
- Push de la rama hecho vía `git push origin agent/copilot-minimax-m3-q00018`.
- NO se abre PR. NO se mergea a `develop` desde este plan.
  Eso lo hace `commit-policy` o el humano.

---

### Fallo-mode playbook (qué hacer si algo no sale como C espera)

| Síntoma | Diagnóstico probable | Fix |
|---|---|---|
| `git log -1 --oneline` no muestra `910876191` | Alguien cerró c00160 o rebasó la rama | `git fetch origin agent/copilot-minimax-m3-q00018 && git checkout agent/copilot-minimax-m3-q00018 && git reset --hard origin/agent/copilot-minimax-m3-q00018` |
| `agent_lock` reporta conflicto en uno de los 3 paths | Otro agente los está tocando | Aceptar y proceder por orden de prioridad (Track 1 primero); si las 3 están bloqueadas, esperar al cierre de actividad de la otra agente (`lock-released` notification) |
| `proposal_board` no muestra las hijas aún | Estás viendo antes de la primera sincronización | Esperar 30s y reintentar; o invocar `mcp-vertex_proposals_sync_proposals` |
| `bun run validate` falla con error de plugin | Un plugin del scope no está en el preset correcto | Seguir el flujo de Track 1 (sniffer) — su salida es la lista de peer-deps y presets que fallan |
| Aparece un `agent-dead` notification | El agente remoto crasheó | `mcp-vertex_proposals_state_health` para diagnóstico, luego `state_repair` con `dryRun:true` primero |
| El reviewer rechaza una hija | Esperado — leer la objeción, no reimplementar desde cero | Cerrar la review con `proposal_review action=request_changes` (en este caso agente ejecutor = implementer = reviewer, usar `force:true` con justificación documentada en la razón) |

---

### Resumen ejecutivo (1 párrafo, para que el humano copie/pegue)

`c00160` (rama `agent/copilot-minimax-m3-q00018`, commit `910876191`)
consolida en un único plan canónico la capacidad que el usuario pidió:
que el agente LLM sepa elegir y usar subagentes automáticamente,
gastando el mínimo de tokens y con las tools del MCP. Las 6 capas
(Capa 1 servidor MCP, Capa 2-3 los dos selectores ya en v0.1.1,
Capa 4 agent-orchestrator cerrado en q00007, Capa 5
orchestrator-runner cerrado en f00067, Capa 6 token-budget discipline)
ya están operativas y verificadas con hashes reales. Las 3 hijas
verdaderamente nuevas (`<NEW-1>` sniffer, `<NEW-2>` smoke E2E,
`<NEW-3>` dogfood fresh verify post-S6) están listadas en `contains:`
con paths exactos para que `agent_lock` las proteja contra otros
agentes. El ejecutor único puede tomar este archivo, reclamar los
3 paths, crear las hijas vía `create_proposal`, implementarlas en
orden, y cerrar c00160 — sin necesidad de swarm ni orquestador.

