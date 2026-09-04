---
id: q00010
title: "Plan closeout post-auditoría ChatGPT 5.6 Sol (cuarta pasada) — delta identificado por el reviewer externo después de ver el avance de q00006: cross-agent ordering/invariante/aislamiento, main-vs-develop policy split, ADR contracts subpath"
kind: plan
status: ready
type: plan
track: develop-audit-hardening-v4-closeout
date: 2026-08-25
predecessor-plans:
    - q00006 # la cuarta pasada completa (65 hijas en ready/in-progress)
related:
    - q00006
    - q00003 # predecesor lejano (43 hijas)
    - q00004 # predecesor (28 hijas review)
    - q00005 # tercera pasada (33 hijas done)
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    lines: 1366
    size: 36K
    reviewer: ChatGPT-5.6-Sol (rectificación cuarta pasada)
contains:
    proposals:
        # ─── Track B — closeout: cross-agent ordering, isolation, E2E, invariante ─────
        - { id: x00269, kind: fix, required: true, priority: P0, track: commit-policy,
            rationale: "Orden de operaciones: validar staged subset ANTES de commit, no después." }
        - { id: x00270, kind: fix, required: true, priority: P0, track: commit-policy,
            rationale: "Aislamiento del índice Git vía GIT_INDEX_FILE para eliminar TOCTOU del staging compartido entre agentes." }
        - { id: t00022, kind: test, required: true, priority: P0, track: commit-policy,
            rationale: "E2E con Git real: HEAD inicial = HEAD final = ABC, 0 commits creados, staged set vacío tras refusal." }
        - { id: t00023, kind: test, required: true, priority: P0, track: commit-policy,
            rationale: "Invariante estructural: stage → assertSubset → commit no se puede reordenar (lint + spec)." }

        # ─── Track A — closeout: main estricto, develop flexible, sin tocar trabajo en curso ────
        - { id: c00156, kind: chore, required: true, priority: P0, track: governance,
            rationale: "Branch protection YAML bifurcada (main estricto, develop flexible, carve-out agent/*)." }
        - { id: c00145, kind: chore, required: true, priority: P0, track: governance,
            rationale: "commit-policy.protectedBranches default sin develop; opt-in explícito." }
        - { id: x00272, kind: fix, required: true, priority: P0, track: governance,
            rationale: "Bloquear push directo a main (no a develop). Supersede de x00258." }
        - { id: v00127, kind: perf, required: true, priority: P0, track: governance,
            rationale: "Verificar estado real de main (verde + protegida) consultando la API de GitHub." }

        # ─── Track C — closeout: ADR para la decisión contracts subpath vs paquete ──────
        - { id: d00012, kind: docs, required: true, priority: P1, track: architecture,
            rationale: "ADR 0007: registrar la decisión de usar subpath @delendai/core/contracts en lugar de paquete separado, con trigger de reversión explícito." }
        - { id: c00146, kind: chore, required: true, priority: P1, track: architecture,
            rationale: "Realignar r00029 (superseded-by d00012) y r00030 (path subpath) para eliminar contradicción entre hijas existentes." }
---

# q00010 — Plan closeout post-auditoría ChatGPT 5.6 Sol (cuarta pasada)

## Goal

Cerrar el delta identificado por **ChatGPT 5.6 Sol (cuarta pasada
sobre `develop`)** durante la revisión externa del trabajo que
otro agente ya ha producido para `q00006`. Este plan NO modifica
ninguna de las 65 hijas de `q00006`; **añade** 10 propuestas
nuevas que dependen explícitamente de las correlativas
existentes, de modo que cuando el plan `q00006` cierre
honestamente, este plan `q00010` arranque y complete lo que el
reviewer externo señaló como faltante.

El delta es de tres tipos:

1. **Track B — ordering, isolation, E2E, invariante** (4 hijas).
   El reviewer demostró con un escenario adversarial concreto
   que la corrección de `x00263` (validar subset) puede llegar
   demasiado tarde en el pipeline (`commit → return → check`), y
   que el staging compartido sigue siendo un TOCTOU real entre
   agentes. Pidió: validate-then-commit (no commit-then-validate),
   `GIT_INDEX_FILE` (o mutex) por operación/agent, y un test E2E
   con Git real — no con fakes — que verifique `HEAD inicial =
   ABC / HEAD final = ABC / 0 commits`.

2. **Track A — main-vs-develop split** (4 hijas).
   Tras revisar el workflow real del dueño único del repo
   (`develop` = laboratorio, `main` = publicación), el reviewer
   **retractó** la recomendación original de proteger
   `develop` y pidió, en su lugar, la **bifurcación** de la
   branch protection: `main` estricto (sin force-push, push
   directo bloqueado, required checks), `develop` flexible
   (force-with-lease permitido, push directo permitido al
   owner). Las 4 hijas nuevas materializan esa retractación
   sin contradecir las Track A ya en curso en `q00006`: cambian
   los defaults, definen el guard contra push directo a `main`,
   y verifican el estado real de `main` consultando la API de
   GitHub (no configs declarativas).

3. **Track C — ADR para la decisión de boundary contracts**
   (2 hijas). El agente que ejecutó `r00028` eligió implementar
   `@delendai/core/contracts` como **subpath** en lugar de
   extraer un paquete `@delendai/contracts` separado. El
   reviewer lo aceptó pero pidió que esa decisión **quede
   registrada como ADR** con un `Trigger for reversal` explícito
   (4 condiciones medibles para extraer a paquete en el futuro).
   Las 2 hijas nuevas crean el ADR 0007 (`d00012`) y
   realinean `r00029`/`r00030` para que el plan no quede con dos
   verdades contradictorias.

### Naturaleza de este plan

- **Sucesor puro de `q00006`**: `predecessor-plans: [q00006]`.
  No arranca hasta que `q00006` haya cerrado.
- **No modifica** las 65 hijas existentes en `ready/{kind}/`
  (`x00257…x00268`, `c00130…c00143`, `r00027…r00033`,
  `t00017…t00021`, etc.).
- **Sí modifica** ciertos frontmatters de propuestas Track A y
  Track C para marcar `superseded-by:` cuando aplique (ver
  slices de cada Track).
- **10 hijas nuevas** organizadas en 3 tracks conceptuales.

## Why

- Cita literal del reviewer externo:
  > "estaría bien que el agente empiece por la sección
  > 'Cómo debe usarse este documento' y respete el orden
  > P0 → P1 → P2. No conviene que intente resolver las 70+
  > áreas en una macro-propuesta, porque se perdería
  > precisamente la trazabilidad que buscamos."
- El reviewer también fue explícito sobre la naturaleza de
  este delta:
  > "yo no dejaría que siga ahora simplemente 'hasta
  > terminar las 65'. Haría el corte de consolidación."
- El delta cabe en este **plan** y no en un commit suelto,
  porque requiere coordinación entre 3 tracks con dependencias
  cruzadas y criterios de aceptación comunes.
- Sin un plan sucesor, las 10 hijas nuevas serían **huérfanas**
  en `ready/` sin entrar en ninguna red de cierre.

## Non-goals

- No reabre ninguna de las 65 hijas de `q00006`.
- No contradice los criterios de acceptance de `q00006` (en
  particular: "develop verde + protegida" se sustituye por
  "main verde + protegida" en las Track A nuevas, pero el
  criterio de `q00006` se respeta de forma backward-compatible
  hasta que cierre y entonces este plan entre con la
  retractación).
- No implementa nada hasta que `q00006` esté `done`.
- No modifica `q00006`. El `predecessor-plans` es la única
  conexión entre los dos planes.

## Architecture

### Tracks conceptuales

#### Track B — closeout: cross-agent ordering, isolation, E2E, invariante

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `x00269` | fix | P0 | `commitWithGuard`: validar staged subset antes de `git commit`; `commitCreated:false`, `headMoved:false` en refusal. |
| `x00270` | fix | P0 | `commitWithGuard` opera con `GIT_INDEX_FILE` aislado por operación + `withFileMutex` por repo. |
| `t00022` | test | P0 | E2E con Git real (mkdtemp + git init): `HEAD inicial = HEAD final`, 0 commits, staged vacío tras refusal. |
| `t00023` | test | P0 | Invariante estructural: lint que prohíbe `git commit` fuera de `commitWithGuard`; spec de orden sintáctico; spec con spies del orden runtime. |

Precondición: `x00263` (sliceScoping), `x00264` (threshold),
`f00266` (engine), `t00018` (happy path cross-agent) deben estar
`done` dentro de `q00006`.

#### Track A — closeout: main estricto, develop flexible

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `c00156` | chore | P0 | Branch protection YAML bifurcada: `main` estricto, `develop` flexible, carve-out `agent/*`. |
| `c00145` | chore | P0 | `commit-policy.protectedBranches` default = `['main', 'master']` (sin `develop` por defecto). |
| `x00272` | fix | P0 | Driver bloquea push directo a `main`; `develop` y `agent/*` fuera. Supersede explícito de `x00258`. |
| `v00127` | perf | P0 | `verify-main-health.script.ts`: lee API de GitHub, exit 0 si `main` verde + protegida; `develop` solo observación. Supersede explícito de `v00125`. |

Precondición: `c00130`, `c00131`, `c00132`, `c00133`, `x00257`
deben estar `done` dentro de `q00006`. Esto garantiza que el
plugin `commit-policy` tiene la primitiva `withFileMutex`,
los hooks de branch protection y el verificador nocturno
disponibles — sobre los que `q00010` construye.

#### Track C — closeout: ADR para la decisión de boundary contracts

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `d00012` | docs | P1 | ADR 0007: `@delendai/core/contracts` (subpath) vs `@delendai/contracts` (paquete) — decisión aceptada, `Trigger for reversal` documentado. |
| `c00146` | chore | P1 | Realignar `r00029` (supersede-by d00012) y `r00030` (path @delendai/core/contracts), evitando contradicción con `r00028`. |

Precondición: `r00027`, `r00028`, `r00029`, `r00030`, `b00237`
deben estar `done` o `in-progress` dentro de `q00006`. La
realignment no requiere que estén todos `done` — puede aplicarse
de forma segura en cualquier momento siempre que `r00028` haya
introducido el subpath (lo cual es precondición dura).

## Slices

### S1 — Verificación de precondición de `q00006`

- **Status**: pending
- **Files**: estado de `q00006` y metadatos de transición de propuestas
- **Gate**: estado de `q00006` y `mcp-vertex_proposals_close_plan q00006`
- **Acceptance**:
  - `q00006` está `status: done`.
  - `mcp-vertex_proposals_close_plan q00006` retorna sin
    `blockers[]`.
  - El hook de `predecessor-plans` permite transición
    `q00010: ready → in-progress` automáticamente (vía
    `mcp-vertex_proposals_proposal_transition`).
- **Gate**: meta (estado de q00006)

### S2 — Ejecución Track B + Track A + Track C

- **Status**: pending
- **Files**: las 10 propuestas hijas de Tracks B, A y C
- **Gate**: `bun run validate`

Cada track tiene su propio gate Slice, pero todos requieren
S1 verde.

- Track B → Slices S2.B1 (x00269), S2.B2 (x00270), S2.B3
  (t00022), S2.B4 (t00023). Cada uno con su propio `Files` y
  `Gate` detallados en la hija.
- Track A → Slices S2.A1 (c00156), S2.A2 (c00145), S2.A3
  (x00272), S2.A4 (v00127).
- Track C → Slices S2.C1 (d00012), S2.C2 (c00146).

### S3 — Cierre del plan

- **Status**: pending
- **Files**: las 10 propuestas hijas y el registro de cierre del plan
- **Gate**: `bun run validate`
- **Acceptance**:
  - Las 10 hijas están `status: done` con peer review.
  - **El fork de `commit-policy` plugin muestra al ejecutar
    `bun tools/scripts/proposals/sync-proposal-counters.script.ts`
    que los contadores están sincronizados.**
  - `bun run validate` verde.
  - Las 10 hijas tienen `superseded-by` correctamente en los
    heredados (`x00258 superseded-by x00272`, `v00125
    superseded-by v00127`, `r00029 superseded-by d00012`).
- **Gate**: meta

## acceptance

- `mcp-vertex_proposals_close_plan q00010` retorna sin
  `blockers[]` y `predecessor-plans: [q00006]` está cerrado.
- `bun run validate` verde en CI.
- El test E2E `t00022` corre en CI y verifica el escenario
  completo del reviewer (HEAD inicial = HEAD final; 0 commits).
- `verify-main-health.script.ts` corre nightly y reporta
  `main.status === gate` cuando aplica.
- `docs/mcp-vertex/adr/0007-core-contracts-subpath-vs-package.md`
  existe y está enlazado desde `AGENT-BOOTSTRAP.md`.
- `r00029` lleva `superseded-by: d00012` en frontmatter.
- El plan no invierte trabajo de `q00006` ya hecho; todo lo
  que `q00006` cerró sigue válido.

## notes

Como macro-propuesta única. Si un agente intenta ejecutar
las 10 hijas en una sola pasada, pierde la trazabilidad que
este documento busca. Debe recorrerse Track-por-Track, en el
orden **B → A → C** (porque B elimina el riesgo de
contaminación del propio agente que ejecuta A y C).

Si `q00006` no cierra antes de activar este plan (es decir, si
un humano o un agente fuerza una transición manual), abrir
`q00008-riesgo-orden-incorrecto-de-predecesores` con análisis
del damage antes de continuar.
