---
id: q00020
title: "Plan — Work Telemetry & Progress Runtime: progreso, fase, ETA y observación de agentes en tiempo real, sin LLM, sin coste de tokens, sobre el State Engine ya consolidado en SQLite"
kind: plan
status: ready
type: proposal
track: trust
date: 2026-09-06
parent:
    - q00018
    - q00019
depends-on:
    - q00019 # SQLite shadow driver consolidada (Phase 1 de State Engine)
nonGoals:
    - "No reemplaza usage-tracking ni observability ni auto-plugin-selector; los consume."
    - "No introduce ML, embeddings ni llamadas a LLM; sólo aritmética sobre eventos locales."
    - "No envía telemetría fuera del equipo; todo vive en .cache/delendai/telemetry/."
    - "No sustituye al Progress Watchdog de f00504; le entrega las snapshots que consume."
    - "No bloquea trabajo en curso por progreso; la verificación llega al cierre de la slice (vía f00278)."
    - "No inventa un daemon en background; el bus es append-only a SQLite y el projector se ejecuta bajo demanda."
    - "No extiende la enumeración de fases fuera de las 10 declaradas en este plan."
contains:
    proposals:
        - { id: f00509, kind: feat, required: true, priority: P0, track: trust,
            rationale: "F1 — Work Event Bus: insertar y consultar el stream append-only de work_events (IWorkEvent + work_event_store + observadores git/test/tool/agent-lease). Sin este bus las proyecciones de F2 no tienen fuente." }
        - { id: f00510, kind: feat, required: true, priority: P0, track: trust,
            rationale: "F2 — Progress Projector: el productor determinista del State Engine (IStateProducer) que consume work_events y emite work_progress_snapshots con fase, peso ponderado, confianza, incertidumbre y stalled detection." }
        - { id: f00511, kind: feat, required: true, priority: P1, track: trust,
            rationale: "F3 — ETA Engine: cálculo de ETA puramente estadístico (mediana + p80 por vector de características) sobre duración histórica local; sin embeddings ni LLM." }
        - { id: f00512, kind: feat, required: true, priority: P1, track: trust,
            rationale: "F4 — UI Surfaces: `delendai work status` + `--watch` (CLI), `delendai work agents`, item de barra de estado en la extensión VS Code y vista intrínseca en el chat del agente (host-emitida, no-modelo-emitida)." }
    unblocks:
        - { id: f00277, rationale: "AgentSession + delendai agents: su bloqueador actual (q00011 no consolidada) se sustituye por 'q00019 consolidada + F1/F2 entregados'. Esta propuesta ya no necesita esperar a q00011." }
        - { id: f00278, rationale: "WorkIntent + completion gates: la fase 'completed' que requiere deriva se beneficia de las snapshots de F2; reescribir su `related` para apuntar a F2." }
---

# q00020 — Plan — Work Telemetry & Progress Runtime

## Goal

Convertir el progreso del trabajo — humano o de agente, en CLI, en extensión, en chat — en una **proyección determinista** del State Engine, no en una pregunta al modelo. Cuando el usuario mira la terminal, la barra de estado de la extensión o el chat, ve, sin gastar tokens, qué está haciendo cada agente, en qué fase está, cuánto le queda, con qué confianza y por qué. Este plan orquesta cuatro propuestas hijas (`F1`–`F4`) —eventos, projector, ETA, superficies— y las hace depender explícitamente de que `q00019` (SQLite shadow driver) esté consolidada, porque la persistencia de eventos y la promoción de la sombra SQLite son requisitos no negociables de la primera propuesta ejecutable.

## why

El dolor original (cita textual del autor): *"Cuando varios agentes trabajan en worktrees es imposible saber si lo que están haciendo es lo que queremos de verdad, y no voy a estar cambiando de ramas"*. Las propuestas `f00277` (`AgentSession` + `delendai agents`) y `f00278` (`WorkIntent` + completion gates) cubren **la foto estática** de qué está tocando cada agente, pero no **la película** — cuánto lleva, cuánto le queda, si avanza o está en bucle, qué fase ejecuta ahora mismo. Hoy, cubrir esa película cuesta LLM (preguntarle al modelo "¿cuánto llevas?") y por tanto tokens, contexto y reliability. La conversación con ChatGPT del 2026-09-06 mapeó una arquitectura limpia: un bus de eventos barato, un projector determinista que vive **como un productor más** del State Engine (`IStateProducer`), un motor de ETA puramente estadístico y unas superficies (CLI, extensión, chat) que consumen esa proyección. Lo que este plan añade es la gobernanza: que cada hija tenga slices disjuntos y comprobables, que la dependencia de `q00019` (SQLite) sea dura —no un nice-to-have— y que el resultado sea **no-rompedor** por construcción (la feature arranca en opt-in y degrada con elegancia si la sombra no está consolidada).

## non-goals

- Reemplazar `usage-tracking`, `observability`, `auto-plugin-selector`, `adaptive-optimizer` ni `project-kpis`. Esta feature los **consume** cuando aplican (tokens gastados vienen de `usage-tracking`; presupuesto de superficie viene de `adaptive-optimizer`).
- Introducir ML, embeddings ni cualquier llamada a un LLM para inferir progreso, fase o ETA. Toda la inteligencia de esta feature es aritmética sobre eventos locales: frecuencias, medianas, percentiles y grafos.
- Telemetría hacia fuera. Todos los eventos y proyecciones viven en `.cache/delendai/telemetry/` del proyecto. Lo único que sale del equipo es lo que `error-reporting` ya envía, con su validador de privacidad intacto.
- Sustituir al watchdog de `f00504` (`Progress Watchdog`). Este plan produce las **snapshots** que `f00504` consume: el watchdog decide cuándo rotar, este plan le dice cuánto falta.
- Bloquear trabajo en curso por progreso. La comparación con la fase esperada se hace al cierre de la slice (a través de `f00278`), no a mitad. Un agente sigue siendo libre de leer, escribir y testear fuera del alcance, sólo no puede declarar terminado sin resolver la deriva.
- Inventar un nuevo daemon persistente en segundo plano. El bus de eventos es append-only a SQLite; el projector se ejecuta bajo demanda (`delendai work status` o `getProjection()`). Si la sombra SQLite no está consolidada, `delendai work status` degrada a una vista derivada de las fuentes que ya son fuente de verdad (`git worktree list`, `agent-lock` y los logs ya existentes).
- Inventar un sub-lenguaje de progress. Las fases (`investigating`, `designing`, `implementing`, `testing`, `fixing`, `validating`, `reviewing`, `reconciling`, `done`, `blocked`) son una enumeración cerrada con cardinalidad estable; no se extiende sin proposal aparte.

## slices

Este plan **no entrega código propio**: orquesta las cuatro propuestas hijas declaradas en `contains.proposals`. La unidad de progreso del plan es la **consolidación** de cada hija, no un slice con archivos. La sección siguiente fija el orden y la dependencia entre ellas.

### slice orquestador — consolidar F1, F2, F3, F4 sobre `q00019` done

- **Status**: pending
- **Files**: ninguno propio; modifica el frontmatter de `f00277` y `f00278` para redirigir su `parent-plan` desde `q00011` a este `q00020` (ver sección `unblocks`).
- **Gate**: las cuatro hijas (`f00509`, `f00510`, `f00511`, `f00512`) están en `done/` y `bun run validate` está verde sobre el árbol que tocan (cada hija declara su propio globalGate, ver archivos de cada hija).
- **Acceptance**: `delendai work status` (CLI) emite el snapshot completo de las cuatro hijas; la barra de estado de la extensión muestra al menos un agente activo; el test de `phase-inference.spec.ts` pasa con ≥95% de acierto sobre los eventos sintéticos del dataset canónico.

## architecture

```
                ┌──────────────────────┐
                │ Agente / Humano / CLI│
                └──────────┬───────────┘
                           │ eventos baratos (sin await dentro de rebuild)
                           ▼
                ┌──────────────────────┐
                │ Work Event Bus       │  (F1 — append-only a SQLite)
                │ work_events(id, …)   │
                └──────────┬───────────┘
                           │
           ┌───────────────┼─────────────────┐
           ▼               ▼                 ▼
      GitObserver    TestObserver     ToolObserver   AgentLeaseObserver
           │               │                 │              │
           └───────────────┼─────────────────┘
                           ▼
                ┌──────────────────────┐
                │ Progress Projector   │  (F2 — IStateProducer del State Engine)
                │ IWorkProgressProducer│
                │ rebuild / reconcile  │
                └──────────┬───────────┘
                           │ snapshots
                           ▼
                ┌──────────────────────┐
                │ ETA Engine           │  (F3 — estadístico local)
                │ duration_history +   │
                │ feature_vector_hash  │
                └──────────┬───────────┘
                           │ eta { p50, p80, range }
                           ▼
              ┌────────────────────────┐
              │ UI Surfaces            │  (F4 — read-only)
              │ CLI `delendai work *`  │
              │ Ext. status bar        │
              │ Chat host-emitted      │
              └────────────────────────┘
```

**Por qué este productor es uno más del State Engine.** Porque `incremental === cleanRebuild` ya es la propiedad que `q00018` Phase 0 garantiza para todo productor. Si el projector cumple su `IProducerInputSpec[]`, queda automáticamente cubierto por los property tests del State Engine y por el `parity sampler` de `q00019` cuando la sombra SQLite esté en marcha. **No se introduce un subsistema paralelo con su propia noción de consistencia** — la consistencia la aporta el State Engine.

**Fases canónicas (enum cerrada, cardinalidad 10).**

```
type WorkPhase =
  | "investigating"   // lectura, search, planning
  | "designing"       // sketching antes de tocar código
  | "implementing"    // writes de código
  | "testing"         // ejecución de tests / validate
  | "fixing"          // writes tras fallo de test/validate
  | "validating"      // lint/type/e2e, sin cambios de código
  | "reviewing"       // diff self-review antes de cerrar
  | "reconciling"     // merge, push, cierre de slice
  | "done"            // estado terminal (lo cierra el flujo de propuesta)
  | "blocked";        // bloqueo determinista (stalled / forbidden / drift)
```

**El agente no tiene que declarar la fase.** Se infiere del último evento observado en la ventana de los últimos N segundos:

```
investigating  ← tool_call{name ∈ {read_file, search, grep}}   ∧ code_edit_window == 0
implementing   ← file_write ∧ path ∉ .test. / .spec.          ∧ code_edit_window > 0
testing        ← command_started{name ∈ {bun test, vitest, …}}
fixing         ← test_finished{exit≠0} seguido de file_write   en los 30s siguientes
validating     ← command_started{name ∈ {tsc, biome, …}}       sin file_write en 60s
reviewing      ← git_diff_self                                  ∧ sin write en 60s
reconciling    ← command_started{name ∈ {git push, gh pr}}
blocked        ← (test_finished{exit≠0})^k con misma hash      ∧ k ≥ 3
done           ← proposal_transition → done / review
```

Esta tabla vive en `f00510` S2 (phase-inference) como dato, no como lógica embebida; cambiar el umbral de `k` para `blocked` no requiere tocar el resto del projector.

**Schema SQLite (F1).** Cinco tablas, todas append-only excepto `progress_snapshots` que se sobrescribe por `(work_item_id, slice_id)`:

```
work_items (
  id TEXT PRIMARY KEY,             -- "<proposalId>/<sliceId>"
  proposal_id TEXT NOT NULL,
  slice_id TEXT NOT NULL,
  kind TEXT,                        -- 'feat' | 'refactor' | 'fix' | …
  weight REAL NOT NULL DEFAULT 1,  -- peso del slice para el Σ ponderado
  status TEXT,                      -- mirrors proposal.status
  created_at INTEGER,
  completed_at INTEGER
);

work_assignments (
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  actor_id TEXT,                    -- 'agent:delendai-impl-20260906' o 'human:cartago'
  actor_kind TEXT,                  -- 'agent' | 'human'
  claimed_at INTEGER,
  released_at INTEGER
);

work_events (
  id INTEGER PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  actor_id TEXT,
  kind TEXT NOT NULL,               -- 18 kinds cerrados, ver f00509 S1
  payload_hash TEXT,                -- sha256 del payload canónico (sin secretos)
  created_at INTEGER NOT NULL
);

progress_snapshots (
  work_item_id TEXT PRIMARY KEY REFERENCES work_items(id),
  phase TEXT,                       -- de la enum WorkPhase
  progress REAL,                    -- 0..1, ponderado
  confidence REAL,                  -- 0..1, ver f00510 S3
  uncertainty REAL,                 -- 0..1, complemento de confidence
  eta_p50_ms INTEGER,
  eta_p80_ms INTEGER,
  stalled INTEGER NOT NULL DEFAULT 0,
  repeated_failure_hash TEXT,       -- si stalled=1, hash del fallo repetido
  last_event_id INTEGER REFERENCES work_events(id),
  updated_at INTEGER NOT NULL
);

duration_history (
  feature_vector_hash TEXT NOT NULL,  -- sha256 del vector canónico
  actor_profile TEXT,                  -- 'agent:<name>' | 'human'
  task_kind TEXT,                      -- 'slice:feat' | 'slice:fix' …
  duration_ms INTEGER,
  outcome TEXT,                        -- 'done' | 'blocked' | 'stalled'
  recorded_at INTEGER,
  PRIMARY KEY (feature_vector_hash, actor_profile, task_kind)
);
```

**Degradación elegante cuando `q00019` no está consolidada.** Si `delendai.config.json#state.parity.shadow.enabled === false` o `@delendai/state-sqlite` no está instalado, `work_events` se escribe en `.cache/delendai/telemetry/work-events.ndjson` (un append-only newline-delimited JSON) y el projector degrada a una vista derivada de fuentes ya existentes: `git worktree list --porcelain`, `agent-lock` lock store y los logs `.cache/delendai/results/`. La salida en `delendai work status` lleva siempre un campo `source: 'sqlite-shadow' | 'git-fallback'` para que el usuario sepa con qué se está calculando.

## dependency graph

```
q00018 (State Engine contracts, DONE vía x00501/x00502/x00504)
        │
        ▼
q00019 (SQLite shadow + parity sampler) ─────── PRE-REQUISITO DURO
        │
        ├──► f00509 (F1 — Work Event Bus)        ─┐
        │                                          │
        ├──► f00510 (F2 — Progress Projector)     ─┤ los 4 disjuntos
        │       └── consume IWorkEvent de F1      │
        │       └── expone IWorkProgressProducer  │
        │                                          │
        ├──► f00511 (F3 — ETA Engine)             ─┤
        │       └── consume progress_snapshots    │
        │                                          │
        └──► f00512 (F4 — UI Surfaces)            ─┘
                └── consume snapshots de F2 + ETA de F3

f00277 (AgentSession)        ─► re-orientada a parent-plan=q00020
f00278 (WorkIntent gates)    ─► re-orientada a parent-plan=q00020 + related=f00510
f00504 (Progress Watchdog)   ─► consume progress_snapshots de F2 (snap-in)
```

**No hay camino que cruce q00019.** Toda propuesta hija que toque `work_events` o `progress_snapshots` exige que la sombra SQLite esté operativa. Si una implementación de F1 cayese sobre JSON legacy para “avanzar antes”, el acceptance se le rechaza y se reabre.

## acceptance

- [ ] Las cuatro hijas (`f00509`, `f00510`, `f00511`, `f00512`) están en `done/` con sus respectivos `global_gate` verdes.
- [ ] `bun run validate` está verde sobre el árbol completo.
- [ ] `delendai work status` ejecuta y devuelve snapshot con `source: 'sqlite-shadow'` cuando `q00019` está consolidada y `source: 'git-fallback'` en caso contrario (nunca falla por la sombra no estar).
- [ ] `delendai work --watch` actualiza la vista cada 500 ms sin disparar re-renders al LLM ni al MCP server (los eventos leídos son del fichero SQLite o NDJSON local).
- [ ] El item de la barra de estado de la extensión VS Code aparece en un proyecto con un agente activo y desaparece en cuanto el agente libera el lock; el coste de polling es ≤ 2 KB por ciclo.
- [ ] Con al menos 50 slices previas en `duration_history`, la mediana de error de la ETA p50 es ≤ 35% sobre el dataset sintético `tests/fixtures/eta-fixtures.spec.ts`.
- [ ] El test `tests/integration/telemetry-no-tokens.spec.ts` demuestra que pintar el snapshot del progreso de un agente durante una sesión completa **no añade tokens al LLM** (assertion: el contador `usage_tracking.llm_tokens_total` es invariante entre `delendai work status --watch` arrancado y parado 5 minutos después).
- [ ] `f00277` y `f00278` tienen `parent-plan: q00020` (no `q00011`) en su frontmatter; sus acceptance no cambian.
- [ ] Conventional Commit (`chore(proposals): q00020 plan + F1–F4 children`) firmado y pusheado.

## risks and mitigations

- **Riesgo: la sombra SQLite no se consolida y el plan queda en `in-progress` indefinidamente.** Mitigación: la `delendai work status` ya emite `source: 'git-fallback'` desde el primer slice, así que el valor para el usuario llega aunque la sombra tarde. La sombra es un requisito del acceptance completo, no del primer valor.
- **Riesgo: el projector infiere mal la fase y muestra `implementing` mientras el agente está `investigating`, dando una falsa sensación de avance.** Mitigación: `confidence` y `uncertainty` son SIEMPRE parte del snapshot, no son opcionales. La UI los muestra al lado del porcentaje. Una `confidence < 0.5` cambia el icono a un signo de interrogación.
- **Riesgo: la ETA inicial (sin histórico) es ruidosa y engaña al usuario.** Mitigación: la primera vez que se muestra una ETA sin duración histórica para `(feature_vector_hash, actor_profile)`, se devuelve `eta: null` con `reason: 'insufficient_history'`; la UI renderiza `~?` hasta tener ≥ 5 muestras. Esto es preferible a un número falso.
- **Riesgo: el bus de eventos crece sin control y ocupa disco.** Mitigación: una tarea de GC retenida por el `work_event_store` purga eventos con `created_at < now - 30d` o `work_item_id` ya en `status='done'` con `completed_at < now - 7d`. Política documentada y testeada.
- **Riesgo: el projector llama a `await` dentro de `rebuild`/`reconcile` y rompe el invariante del State Engine.** Mitigación: el test `state-engine-purity` (q00018 S6) cubre ya `packages/state-telemetry/src/**`; cualquier `await` dentro de los métodos del productor falla el lint en CI.
- **Riesgo: la UI intrínseca del chat se renderiza aunque el usuario no la quiera, contaminando el contexto visible.** Mitigación: F4 S4 la entrega detrás de un setting `delendai.config.json#telemetry.chat_intrinsic.enabled` que por defecto es `false`. El opt-in es explícito por sesión.

## notes

- **Hilo de pensamiento con la conversación del 2026-09-06.** Esta propuesta es la versión gobernada de la arquitectura bosquejada en esa charla. Se conservan las cinco tablas, las diez fases, el projector como `IStateProducer`, la separación `event-bus → projector → eta → ui` y los principios “0 tokens para pintar progreso” y “degradación elegante”. Lo que el plan añade: gate duro sobre `q00019`, slices disjuntos entre hijas, nombres de comandos CLI no colisionando con `agents` (auto-agent-selector ya usa `delendai agents`), aceptación verificable de no-rompimiento y referencia explícita a `f00504` (watchdog) y `f00277`/`f00278` (AgentSession + WorkIntent) como consumidores naturales.
- **Por qué `delendai work` y no `delendai agents` ni `delendai status`.** `delendai agents` ya lo ocupa el plugin `auto-agent-selector` (router LLM); `delendai status` ya muestra los colectores de runtime. `delendai work` es la raíz semántica natural para progreso + agente + slice + ETA y deja libre `delendai progress` para una vista de alto nivel en el futuro.
- **Por qué `WorkPhase` y no `Status` ni `State`.** `Status` ya está sobrecargado (status de proposal, status de slice, status de agente). `State` colisiona con el namespace del State Engine. `WorkPhase` describe “qué está haciendo el actor ahora mismo” sin implicar lifecycle.
- **Por qué `IWorkProgressProducer` y no una tabla plana.** El State Engine exige que cada productor declare su `IProducerInputSpec[]`. Esa firma es la que el `parity sampler` de q00019 usará para verificar que la sombra SQLite y la memoria ven la misma proyección. Sin esa firma, esta feature queda fuera del contrato de verificabilidad que el resto del State Engine ya cumple.
- **Por qué un plan y no una sola feat grande.** Cuatro feat con slices disjuntos se pueden paralelizar (varios agentes) y cada una tiene su propio `global_gate`. Una feat monolítica exige sequential y un solo global_gate, lo que aumenta el riesgo de bloqueo y diluye la responsabilidad de revisión.
- **Próximos pasos al cierre.** Cuando las cuatro hijas estén `done`, este plan se cierra con `proposal_transition` a `done`; el siguiente plan natural es `q00021` (no entra en este), que cubre **promoción de la sombra SQLite a primary** cuando el sampler lleve N ciclos sin diff (Phase 2 de `q00018`).

