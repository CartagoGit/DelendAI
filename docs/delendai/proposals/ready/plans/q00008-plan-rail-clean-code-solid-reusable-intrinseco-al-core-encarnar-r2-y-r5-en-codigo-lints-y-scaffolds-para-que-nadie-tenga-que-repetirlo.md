---
id: q00008
title: "Plan: Rail Clean Code + SOLID + Reusable intrínseco al core — encarnar R2 y R5 en código, lints y scaffolds para que nadie tenga que repetirlo"
kind: plan
status: ready
type: plan
track: rail-clean-code-solid-intrinsic
date: 2026-08-26
date_iso: 2026-08-26
author: delendai-orchestrator (MiniMax M3, agent mode)

predecessor-plans:
    - q00006 # cuarta pasada — fuente de las reglas R2 y R5
    - q00007 # closeout — coherencia con main-strict / develop-flex

related:
    # Predecesores / fuentes
    - q00006 # R2 y R5 nacen aquí
    - q00007 # closeout con main-strict + contracts subpath
    # Hijas relacionadas que el rail completa / complementa
    - r00027 # Inventario stable/experimental/internal de core/public
    - r00028 # Subpath exports de core (contracts/plugin/runtime/node)
    - r00029 # Extraer @delendai/contracts con tipos puros sin Node
    - f00184 # Lifecycle phases prepare/activate/dispose
    - f00185 # Plugin states UNLOADED/LOADED_HIDDEN/ACTIVE/DENIED
    - f00186 # TokenBudgetRegistry unificado
    # Infra de enforcement existente que este plan reutiliza
    - tools/scripts/lint/ # 30+ lints arquitectónicos ya ejecutados en CI
    - packages/core/src/lib/scaffold/ # scaffolding tipado existente
    - apps/shared/ # utilidades reusables entre web/cli/core

contains:
    proposals:
        # ─── Track 1 — Rail API en el core (raíz del rail) ───────────────
        - { id: f00252, kind: feat, required: true, priority: P0, track: rail-api,
            rationale: "API pública `@delendai/core/rail` con `IRail` interface y 5 checks tipadas (cleanCode, solid, reusable, repoStyle, lintTypes). Sin este módulo no hay rail — los lints y scaffolds se quedan sin contrato." }

        # ─── Track 2 — Lints arquitectónicos que enforcen el rail ─────────
        - { id: c00147, kind: chore, required: true, priority: P0, track: rail-lints,
            rationale: "3 lints ejecutables: `rail-clean-code.script.ts`, `rail-solid.script.ts`, `rail-reusable.script.ts`. Viven bajo `tools/scripts/lint/rail/` y se invocan desde `bun run validate`. Sin lints, el rail es opt-in." }

        # ─── Track 3 — Scaffolds que generan código compliant por defecto ──
        - { id: f00253, kind: feat, required: true, priority: P1, track: rail-scaffold,
            rationale: "Plantilla `clean-plugin.template.ts` + `clean-tool.template.ts` en `tools/scripts/scaffold/` que producen plugins/tools que ya pasan todos los lints del rail. El rail deja de ser retrofit y se vuelve birthplace." }

        # ─── Track 4 — Migración piloto: 3 plugins consumen el rail ──────
        - { id: r00034, kind: refactor, required: true, priority: P1, track: rail-migration,
            rationale: "Reescribir `plugins/audit`, `plugins/proposals` y `plugins/status-marker` consumiendo el rail. Piloto: si estos 3 quedan clean, el patrón es replicable." }

        # ─── Track 5 — CI gate: rail como required check ──────────────────
        - { id: c00148, kind: chore, required: true, priority: P1, track: rail-ci,
            rationale: "Wire `bun run validate` + quality gate (Track G de q00006) para que cualquier violación del rail bloquee merge. Defense in depth: el rail no es solo advisory." }

        # ─── Track 6 — Tests property-based + adversarial del rail ─────────
        - { id: t00024, kind: test, required: true, priority: P1, track: rail-tests,
            rationale: "Cobertura del propio rail: property-based sobre `IRail.check*` + adversarial sobre plugins que intenten saltarse SOLID / clean code / reutilización. El rail come su propia dog food." }

        # ─── Track 7 — Docs: ADRs + AGENT-BOOTSTRAP apunta al rail ────────
        - { id: d00013, kind: docs, required: true, priority: P2, track: rail-docs,
            rationale: "ADRs 0008-0010 documentando decisiones de diseño del rail; `AGENT-BOOTSTRAP.md §6` actualizado para que apunte a `core/rail` como fuente única de truth para R2/R5." }

closureGate:
    requirePeerReview: true
    requireAllSlicesDone: true
    requireAllChildrenDone: true
    requireEvidenceOnClose: true
    requireDevelopGreen: true

globalGate: type

project-rules:
    privacy-inviolable: true
    privacy-by-construction: true
    fail-closed-on-uncertainty: true
    synthetic-examples-only: true
    one-source-of-truth: true
    budgets-are-constraints: true
    load-only-required-capabilities: true
    invariants-as-apis-or-lints: true
    solid-mandatory: true
    clean-code-mandatory: true
    reusable-code-mandatory: true
    documentation-updated-on-change: true
    no-proposal-id-comments-in-source: true
---

# q00008 — Plan: Rail Clean Code + SOLID + Reusable intrínseco al core

## Goal

Encarnar las reglas **R2** (Clean Code + SOLID + reusable + lint/types +
repo-style) y **R5** (invariantes como APIs/lints) en el propio core, de
modo que sean **propiedades arquitectónicas** y no recordatorios
declarativos. El rail deja de ser un texto en `AGENT-BOOTSTRAP.md` que el
agente debe recordar y se convierte en:

1. **Una API pública del core** (`@delendai/core/rail`) con `IRail` y 5
   checks tipadas (`checkCleanCode`, `checkSolid`, `checkReusable`,
   `checkRepoStyle`, `checkLintTypes`).
2. **Lints arquitectónicos** ejecutables que bloquean violaciones en CI
   (`tools/scripts/lint/rail/*.script.ts`).
3. **Scaffolds** que generan plugins/tools ya compliant por defecto
   (`tools/scripts/scaffold/clean-*.template.ts`).
4. **Migración de prueba** en 3 plugins existentes que demuestra que el
   rail funciona contra código real.
5. **CI integration** que hace el rail un required check pre-merge.
6. **Tests property-based + adversarial** que verifican que el propio
   rail cumple lo que predica.
7. **Documentación** que conecta `AGENT-BOOTSTRAP.md §6` con
   `@delendai/core/rail` como única fuente de verdad.

Cuando este plan cierre, **ningún agente ni humano necesita repetir
"clean code, SOLID, reusable" en cada tarea**: el rail lo enforce. Si
lo intenta, el lint lo bloquea; si lo evita, los scaffolds producen
código ya compliant; si todo lo anterior se salta, el CI gate rechaza
el merge.

## why

El estado actual tiene tres grietas estructurales que este plan cierra:

1. **Repetición obligatoria del rail**: en cada propuesta, en cada
   tarea, en cada review, el usuario (o el propio agente) tiene que
   re-declarar "esto debe ser clean code, SOLID, reusable, con lint,
   con tipos". Es el **Rails Documentation Tax** — el rail se aplica
   por recordatorio, no por construcción. El coste escala linealmente
   con el número de propuestas (489 hoy, ~10/semana).
2. **Auditorías externas repiten los mismos hallazgos**:
   - God classes en `@delendai/core` (§6 auditoría cuarta pasada).
   - Copy-paste doloroso entre plugins (varios hallazgos).
   - Lints arquitectónicos decorativos que pasan pero no bloquean
     (§22 auditoría).
   - Falta de contratos reusables: cada plugin reinventa envelopes
     (§11, §12 auditoría).
3. **El tooling existe pero está disperso**:
   - 30+ lints en `tools/scripts/lint/`.
   - `packages/core/src/lib/scaffold/` con plantillas.
   - `apps/shared/` con utilidades reusables.
   - Ninguno está conectado por un contrato único. Un agente que
     quiere "hacerlo bien" tiene que descubrir las 3 fuentes a mano.

La solución es la que la auditoría pidió en §30 (invariantes como APIs)
y §51 (scaffolds tipados): un módulo `core/rail` que centralice el
contrato, lints que lo enforcen, scaffolds que lo produzcan, y CI que
lo gate.

### Naturaleza de este plan

**El plan produce 7 hijas** que en conjunto encarnan el rail. El plan
mismo es un orquestador: no introduce código nuevo, sino que **define
la división del trabajo** para que cada hija ataque una cara del rail
sin acoplamiento circular.

Este plan **NO** entra en colisión con q00006 o q00007:
- **q00006** es una auditoría de regresión contra `develop`; produce
  hijas por hallazgo (65 total).
- **q00007** cierra el delta de la cuarta pasada (10 hijas).
- **q00008** ataca un problema transversal: la **codificación** de
  R2+R5. Es complemento, no sustitución.

Las hijas de q00008 consumen trabajo previo (`r00027` inventario,
`r00028` subpath exports, `f00186` `TokenBudgetRegistry`) cuando
aplica, y dejan el rail plantado para que hijas futuras
(q00006/q00007 u otras) lo consuman automáticamente.

## non-goals

- **No introducir un mega-tool `action: string` libre** para reducir el
  coste de proposals. El rail aumenta la superficie de tipos pero NO a
  costa de safety.
- **No forzar 100% de cobertura** en el primer ciclo. El rail acepta
  adopción gradual con `warn`-level por defecto y `error`-level
  opt-in por capa.
- **No partir el core en N paquetes**. El rail vive en
  `@delendai/core/rail` (subpath) que se apoya en `r00028`
  (subpath exports). No crear `packages/rail/**` separado.
- **No reescribir plugins existentes en bulk**. La migración es
  piloto en 3 plugins (`audit`, `proposals`, `status-marker`). El resto
  migra cuando el patrón esté probado.
- **No añadir IA al rail**. El rail es **mecánico**: lints + AST +
  reglas tipadas. Sin LLM en el loop, sin heurística opaca.
- **No relajar R1** (privacidad por construcción). El rail trabaja
  sobre metadata estructural (tipos, imports, patrones AST). Nunca
  sobre paths reales del usuario.
- **No introducir dependencias nuevas** salvo `typescript` (ya
  presente) y `vitest` (ya presente). El análisis AST usa
  `ts-morph` o `typescript` compiler API directamente — sin SAST
  externos.
- **No duplicar lints existentes**. Si un lint en `tools/scripts/lint/`
  ya cubre una invariante, el rail lo invoca vía registry; no
  re-implementa la lógica.

---

# Reglas de proyecto obligatorias para todas las hijas (R1–R9, subset relevante)

Las hijas de este plan heredan y **refuerzan** R2 y R5 de q00006; el
resto de R1–R9 aplica sin cambios.

### R2 — Code quality (Clean Code + SOLID + reuse) — *el corazón del rail*

- **R2.1 — SOLID** (SRP, OCP, LSP, ISP, DIP) por defecto, sin
  recordatorio. Interfaces estrechas, registries en lugar de `switch`
  largos, dependency injection.
- **R2.2 — Clean Code**: nombres intention-revealing, funciones
  pequeñas y de un solo propósito, comentarios solo cuando explican
  *por qué* (no *qué*), sin errores tragados, sin código muerto, sin
  magic numbers, sin ramas comentadas.
- **R2.3 — Reusable code**: helpers compartidos antes que duplicación;
  utilities reusables en `packages/core/src/lib/util/` o
  `apps/shared/src/`; sin copy-paste doloroso entre plugins.
- **R2.4 — Best practices**: tests para lógica no trivial, validación
  en bordes I/O, bajo acoplamiento, alta cohesión, strict types,
  dependencias declaradas, errores tipados.

> **Cómo se vuelve intrínseco con este plan**: el lint
> `rail-solid.script.ts` rechaza clases con >1 responsabilidad,
> switches >5 casos, god-contexts. El lint
> `rail-clean-code.script.ts` rechaza magic numbers, ramas comentadas,
  nombres crípticos. El lint `rail-reusable.script.ts` detecta
  duplicación inter-plugin. El scaffold produce código compliant por
  defecto. CI bloquea el merge.

### R5 — Invariantes como APIs / lints, no tribal knowledge

- **R5.1** — Si dos plugins pueden necesitar la misma garantía
  (filesystem containment, network allowlist, process safety, privacy
  validator), esa garantía se convierte en API pública del core.
- **R5.2** — Si una clase de bug puede reintroducirse, se añade un lint
  arquitectónico que lo bloquee en CI.
- **R5.3** — Los lints viven bajo `tools/scripts/lint/` y son ejecutados
  por `bun run validate`. Cada lint tiene un test de sí mismo.

> **Cómo se vuelve intrínseco con este plan**: `core/rail` define las
> invariantes como **API tipada** (no texto). Cada invariante tiene
> **un test de sí misma** (R5.3). El lint ejecutivo vive en
> `tools/scripts/lint/rail/`. La conexión lint ↔ API es trazable vía
> provenance metadata.

### R7 — Tests antes que código de producción

- **R7.1** — Para cada bug, **primero el test reproductor**, después
  el fix. La propuesta debe incluir el commit del test rojo y el commit
  del fix que lo pone verde.
- **R7.2** — Property-based tests para parsers y validadores.
- **R7.3** — Tests adversarios para capacidades de seguridad.

> **Por qué aplica al rail**: el propio rail come su propia dog food
> (`t00024`). Property-based sobre `IRail.check*` con fixtures
> generados aleatoriamente + adversarial sobre plugins que intenten
> evadir las checks.

---

# Tracks y propuesta de hijas

Este plan produce **7 hijas** organizadas en **7 tracks** (uno por
cara del rail). Cada track es atómico y cerrable independientemente.

> **Convención de ID** — Para este plan reservamos:
>
> | Prefijo | ID | Track |
> | --- | --- | --- |
> | `f00252` | feat | T1 — Rail API en el core |
> | `c00147` | chore | T2 — Lints arquitectónicos |
> | `f00253` | feat | T3 — Scaffolds compliant |
> | `r00034` | refactor | T4 — Migración piloto |
> | `c00148` | chore | T5 — CI gate |
> | `t00024` | test | T6 — Tests del rail |
> | `d00013` | docs | T7 — Docs + AGENT-BOOTSTRAP |
>
> Los IDs numéricos pueden desplazarse si el agente detecta colisiones
> con nuevas proposals abiertas durante la ejecución. Mantener siempre
> la **gama** por track.

## Slices

This plan orchestrates 7 tracks containing 7 daughter proposals. Each
track's daughter is a work item; this plan itself does not introduce
additional code slices — it is a coordination layer over the daughters.
Closure of the plan requires each daughter to be closed (`done`) with
peer review.

### S1 — Track-by-track execution

- **Status**: in-progress
- **Files**: (this plan; the 7 daughter proposals; per-track daughter `.md` files)
- **Gate**: type
- acceptance:
  - "All 7 daughters are `done` with peer review."
  - "`proposals_close_plan q00008` returns no blockers."
  - "`develop` is green and protected."
  - "`bun run validate` ejecuta el rail como required check."
  - "El `IRail.check*` está exportado por `@delendai/core/rail` y consumido por ≥3 plugins reales."

Each `### Track X` subsection below groups its daughter and is closed when
the daughter is done with peer review and the track-specific acceptance
criteria are met.

---

### Track 1 — Rail API en el core (raíz del rail) [f00252]

> **Goal:** introducir la API pública `@delendai/core/rail` que
> codifica R2+R5 como contratos tipados. Esta es la raíz del rail;
> sin este módulo, los lints y scaffolds no tienen contrato al que
> atenerse.
>
> **Scope:** `packages/core/src/lib/rail/**` + `packages/core/src/public/index.ts` (re-export).
>
> **Non-goals:** no incluir análisis IA/LLM; no partir el core en más paquetes; no añadir dependencias nuevas.

#### `f00252` — `core/rail` module con `IRail` interface y 5 checks tipadas

- **Goal:** que el core exponga una API pública `IRail` con 5 métodos
  tipados, uno por invariante R2+R5.
- **Files (expected):**
  - `packages/core/src/lib/rail/contracts.ts` — interfaces
  - `packages/core/src/lib/rail/clean-code.ts` — implementación de `checkCleanCode`
  - `packages/core/src/lib/rail/solid.ts` — implementación de `checkSolid`
  - `packages/core/src/lib/rail/reusable.ts` — implementación de `checkReusable`
  - `packages/core/src/lib/rail/repo-style.ts` — implementación de `checkRepoStyle`
  - `packages/core/src/lib/rail/lint-types.ts` — implementación de `checkLintTypes`
  - `packages/core/src/lib/rail/index.ts` — entry point público
  - `packages/core/src/lib/rail/registry.ts` — `RailRegistry` para registrar checks adicionales
  - `packages/core/src/lib/rail/rail.spec.ts` — tests de la API misma
- **Interface objetivo:**
  ```ts
  // packages/core/src/lib/rail/contracts.ts
  export interface IRailCheck<T = unknown> {
    readonly id: `rail.${string}`;
    readonly appliesTo: RailSubject; // 'plugin' | 'tool' | 'module' | 'spec'
    check(input: T): Promise<RailReport>;
  }

  export interface IRail {
    checkCleanCode(target: RailTarget): Promise<RailReport>;
    checkSolid(target: RailTarget): Promise<RailReport>;
    checkReusable(target: RailTarget): Promise<RailReport>;
    checkRepoStyle(target: RailTarget): Promise<RailReport>;
    checkLintTypes(target: RailTarget): Promise<RailReport>;
  }

  export interface RailReport {
    readonly target: string;
    readonly rail: 'clean-code' | 'solid' | 'reusable' | 'repo-style' | 'lint-types';
    readonly status: 'pass' | 'warn' | 'fail';
    readonly findings: readonly RailFinding[];
    readonly durationMs: number;
  }

  export interface RailFinding {
    readonly code: string;            // 'GOD_CLASS', 'SWITCH_TOO_LONG', 'DUPLICATED_LOGIC'
    readonly severity: 'info' | 'warn' | 'fail';
    readonly message: string;
    readonly location?: { file: string; line?: number; column?: number };
  }

  export interface RailRegistry {
    register(check: IRailCheck): void;
    get(id: string): IRailCheck | undefined;
    all(): readonly IRailCheck[];
  }
  ```
- **Implementación de cada check:**
  - `checkCleanCode`: AST-level checks (no regex frágil). Detecta
    magic numbers, funciones >50 líneas, >5 parámetros, nombres de 1
    carácter, comentarios `// fNNNNN` (R3.5), ramas comentadas.
  - `checkSolid`: detecta clases con >2 fields públicos (SRP),
    switches >5 casos (OCP), herencia >3 niveles (LSP), interfaces con
    >10 métodos (ISP), dependencias de tipos concretos en
    constructores (DIP).
  - `checkReusable`: detecta duplicación entre archivos del repo
    (normalizado), imports de módulos legacy, copy-paste de bloques >20
    líneas.
  - `checkRepoStyle`: verifica naming convention (kebab-case para
    archivos, PascalCase para clases, camelCase para funciones),
    ausencia de `console.log`, ausencia de `as any`, presencia de
    `import type` para tipos.
  - `checkLintTypes`: ejecuta `tsc --noEmit` sobre el target en modo
    isolated; verifica `strict: true`, ausencia de `any`, ausencia de
    `@ts-ignore`.
- **Acceptance:**
  - API exportada por `@delendai/core` (o `@delendai/core/rail`).
  - Cada check tiene ≥3 tests unitarios.
  - `IRail` consume targets via `RailTarget = { kind: 'file' | 'dir'; path: string }`.
  - `RailRegistry` permite a plugins registrar checks custom.
  - Tests cubren happy path + edge cases (target inexistente, target
    vacío, target binario).
- **Dependencies:** `r00028` (subpath exports) si se usa subpath;
  opcional si se exporta desde `core/public`.
- **Tokens impact:** ninguno directo (la API es liviana).
- **Security impact:** positivo (lints consistentes evitan fugas).
- **Compatibility:** aditiva.
- **Rollback:** remover el módulo y los imports.
- **Risk:** API demasiado abstracta; ofrecer shims deprecados.

---

### Track 2 — Lints arquitectónicos que enforcen el rail [c00147]

> **Goal:** ejecutar el rail desde CI. Tres lints ejecutables (uno por
> invariante R2 principal) que invocan la API de `core/rail` y fallan
> el build si encuentran violaciones `fail`-severity.
>
> **Scope:** `tools/scripts/lint/rail/*.script.ts` + `tools/scripts/lint/rail/*.spec.ts`.
>
> **Non-goals:** no duplicar la lógica del core (los lints llaman a `core/rail`); no añadir lints que no estén en el registry.

#### `c00147` — 3 lints ejecutables: `rail-clean-code`, `rail-solid`, `rail-reusable`

- **Goal:** cada lint es un `*.script.ts` ejecutable por
  `bun run lint:rail:clean-code` (etc.) y por `bun run validate`.
- **Files (expected):**
  - `tools/scripts/lint/rail/clean-code.script.ts`
  - `tools/scripts/lint/rail/clean-code.spec.ts`
  - `tools/scripts/lint/rail/solid.script.ts`
  - `tools/scripts/lint/rail/solid.spec.ts`
  - `tools/scripts/lint/rail/reusable.script.ts`
  - `tools/scripts/lint/rail/reusable.spec.ts`
  - `tools/scripts/lint/rail/_lib.ts` — utilidades compartidas
- **Behavior:** cada lint:
  1. Carga `IRail` desde `@delendai/core/rail`.
  2. Itera sobre `plugins/**/src/**` y `packages/**/src/**`.
  3. Llama al check correspondiente.
  4. Emite findings en formato `bun:test`-compatible.
  5. Exit code 0 si no hay `fail`-severity; 1 si los hay.
- **Configuración:**
  - Modo `--level=warn|fail` (default `warn` para adopción
    gradual, `fail` opt-in).
  - Modo `--target=path` para validar un solo archivo/dir.
  - Modo `--json` para integración con dashboards.
- **Tests:**
  - Fixture de plugin "limpio" → exit 0.
  - Fixture de plugin "god class" → exit 1 con finding
    `GOD_CLASS`.
  - Fixture de plugin "switch de 10 casos" → exit 1 con finding
    `SWITCH_TOO_LONG`.
  - Fixture de plugin con duplicación → exit 1 con finding
    `DUPLICATED_LOGIC`.
- **Acceptance:**
  - 3 lints ejecutables y probados.
  - Cada lint tiene su propio `.spec.ts` (R5.3).
  - Output es JSON para máquinas + texto para humanos.
  - Documentación inline en cada script.
- **Dependencies:** `f00252`.
- **Tokens impact:** ninguno.
- **Compatibility:** aditiva.
- **Rollback:** remover los scripts.

---

### Track 3 — Scaffolds que generan código compliant por defecto [f00253]

> **Goal:** que el código generado por los scaffolds del repo ya pase
> todos los lints del rail. El rail deja de ser retrofit y se vuelve
> birthplace.
>
> **Scope:** `tools/scripts/scaffold/clean-plugin.template.ts` +
> `tools/scripts/scaffold/clean-tool.template.ts` + tests.
>
> **Non-goals:** no forzar adopción; los scaffolds legacy siguen funcionando hasta deprecation.

#### `f00253` — `clean-plugin.template.ts` + `clean-tool.template.ts`

- **Goal:** dos plantillas tipadas que, cuando se usan para crear un
> plugin o tool nuevo, producen código que **ya pasa** todos los
> checks del rail.
- **Files (expected):**
  - `tools/scripts/scaffold/clean-plugin.template.ts`
  - `tools/scripts/scaffold/clean-tool.template.ts`
  - `tools/scripts/scaffold/clean-plugin.spec.ts` (test del output)
  - `tools/scripts/scaffold/clean-tool.spec.ts`
  - `tools/scripts/scaffold/README.md` (actualizado)
- **Contenido típico de `clean-plugin.template.ts`:**
  - Plugin con `definePlugin` (`f00074`).
  - `prepare()` + `activate()` + `dispose()` (`f00184`).
  - Estados explícitos (`f00185`).
  - Tools con `inputSchema` + `outputSchema` (no envelopes dinámicos).
  - Sin magic numbers, sin `console.log`, sin `as any`.
  - Imports relativos vía `@delendai/core/rail` cuando aplique.
- **Tests:**
  - Renderizar la plantilla → ejecutar los lints del rail sobre el
    output → exit 0.
  - Modificar una línea del output → exit 1 con finding específico.
- **Acceptance:**
  - Output verificado contra `rail-clean-code`, `rail-solid`,
    `rail-reusable`, `rail-repo-style`, `rail-lint-types`.
  - Documentado cómo invocar (CLI flag o via MCP).
- **Dependencies:** `f00252`, `c00147`.
- **Tokens impact:** ninguno.
- **Compatibility:** aditiva.
- **Rollback:** revertir las plantillas.

---

### Track 4 — Migración piloto: 3 plugins consumen el rail [r00034]

> **Goal:** demostrar que el rail funciona contra código real. Si
> `audit`, `proposals` y `status-marker` quedan clean tras consumir el
> rail, el patrón es replicable al resto.
>
> **Scope:** `plugins/audit/src/**`, `plugins/proposals/src/**`,
> `plugins/status-marker/src/**`.
>
> **Non-goals:** no migrar todos los plugins; no cambiar API pública de esos plugins (solo interna).

#### `r00034` — Piloto: `audit` + `proposals` + `status-marker` consumen `core/rail`

- **Goal:** reescribir internamente las 3 plugins para que:
  1. Importen helpers de `@delendai/core/rail` cuando aplique
     (e.g. registro de checks custom en `RailRegistry`).
  2. Su código pase los 3 lints del rail sin findings.
  3. Su superficie pública no cambie (no breaking).
- **Files (expected):**
  - `plugins/audit/src/index.ts` (consume `RailRegistry.register`)
  - `plugins/proposals/src/index.ts` (idem)
  - `plugins/status-marker/src/index.ts` (idem)
  - `plugins/audit/tests/src/rail-integration.spec.ts` (test de regresión)
  - `plugins/proposals/tests/src/rail-integration.spec.ts`
  - `plugins/status-marker/tests/src/rail-integration.spec.ts`
- **Acceptance:**
  - 3 plugins pasan los 3 lints del rail.
  - No se introducen nuevos findings.
  - Test suites existentes siguen verdes.
  - Reporte `before/after` con tabla medible de findings.
- **Dependencies:** `f00252`, `c00147`.
- **Tokens impact:** ninguno.
- **Compatibility:** interna; API pública inalterada.
- **Rollback:** revert de cada plugin individualmente.

---

### Track 5 — CI gate: rail como required check [c00148]

> **Goal:** que cualquier violación `fail`-severity del rail bloquee
> el merge a `develop` y `main`. El rail deja de ser advisory.
>
> **Scope:** `bun run validate`, quality gate workflow, branch
> protection.
>
> **Non-goals:** no fallar en `warn`-severity por defecto (eso es para
> T4 piloto y siguientes); solo `fail` bloquea.

#### `c00148` — Wire `bun run validate` + quality gate para el rail

- **Goal:** integrar los 3 lints del rail en el pipeline CI de modo
> que un `fail`-severity impida el merge.
- **Files (expected):**
  - `package.json` (script `lint:rail` agregado)
  - `tools/scripts/validate.script.ts` (invoca los lints)
  - `.github/workflows/quality-gate.yml` (job `rail` agregado)
  - `.github/workflows/drift.yml` (job `rail` en nightly)
- **Behavior:**
  - `bun run validate` ejecuta `lint:rail:*` después de los lints
    existentes.
  - Quality gate (`c00132` de q00006) tiene un step `rail-checks` que
    falla si hay `fail`-severity.
  - Drift workflow corre el rail en nightly y postea al dashboard.
- **Tests:**
  - PR con código que viola `rail-solid` → bloqueado por CI.
  - PR con código clean → merge permitido.
- **Acceptance:**
  - Quality gate documenta el rail como required check.
  - Branch protection (Track A de q00006) lista el rail.
  - Evidencia: SHA de un PR rechazado por el rail.
- **Dependencies:** `c00147`, `c00132` (de q00006).
- **Tokens impact:** ninguno (CI minutes adicionales).
- **Compatibility:** aditiva.
- **Rollback:** quitar el step del workflow (no recomendable).

---

### Track 6 — Tests property-based + adversarial del rail [t00024]

> **Goal:** que el propio rail coma su propia dog food. Tests que
> verifiquen que `IRail.check*` se comporta según contrato, más tests
> adversariales contra plugins que intenten evadir las checks.
>
> **Scope:** `packages/core/tests/src/lib/rail/rail-property.spec.ts` +
> `tools/scripts/lint/rail/adversarial.spec.ts`.
>
> **Non-goals:** no testear toda la lógica interna (eso es T1); solo el contrato público y los adversarial cases.

#### `t00024` — Property-based + adversarial tests del rail

- **Goal:** cobertura ≥90% del contrato `IRail` + adversarial tests.
- **Files (expected):**
  - `packages/core/tests/src/lib/rail/contract.spec.ts` — verifica
    `IRail.check*` retorna `RailReport` válido en todos los casos.
  - `packages/core/tests/src/lib/rail/property.spec.ts` — genera
    1000 targets aleatorios y verifica invariantes del report
    (`findings.length ≥ 0`, `durationMs ≥ 0`, `status ∈ {pass, warn,
    fail}`).
  - `tools/scripts/lint/rail/adversarial.spec.ts` — fixtures de
    plugins que intentan evadir el rail (god classes disfrazadas,
    switches en diccionarios, duplicación fragmentada).
- **Acceptance:**
  - 100% de los métodos de `IRail` cubiertos.
  - Property-based pasa 1000 iteraciones sin fallos.
  - Adversarial detecta ≥3 patrones de evasión.
  - Coverage de `core/rail/**` ≥90%.
- **Dependencies:** `f00252`, `c00147`.
- **Compatibility:** aditiva.

---

### Track 7 — Docs: ADRs + AGENT-BOOTSTRAP apunta al rail [d00013]

> **Goal:** documentar las decisiones de diseño del rail y conectar
> `AGENT-BOOTSTRAP.md §6` con `@delendai/core/rail` como única
> fuente de verdad para R2+R5.
>
> **Scope:** `docs/delendai/adr/0008-rail-api-design.md` +
> `docs/delendai/adr/0009-rail-lint-architecture.md` +
> `docs/delendai/adr/0010-rail-scaffold-strategy.md` +
> `docs/delendai/AGENT-BOOTSTRAP.md §6`.
>
> **Non-goals:** no reescribir todo el bootstrap; solo actualizar §6.

#### `d00013` — ADRs 0008-0010 + actualizar `AGENT-BOOTSTRAP.md §6`

- **Goal:** 3 ADRs que documenten:
  1. **ADR 0008** — ¿Por qué `core/rail` y no un paquete separado?
     ¿Por qué subpath y no barrel?
  2. **ADR 0009** — ¿Cómo se relacionan los lints con el core? ¿Por qué
     los lints invocan `core/rail` y no duplican lógica?
  3. **ADR 0010** — ¿Cómo se decide qué plugins consumen el rail? ¿Cuál
     es la estrategia de adopción gradual?
- **Además:** actualizar `AGENT-BOOTSTRAP.md §6` (Code Quality) para
  que apunte a `core/rail` como la fuente de verdad, en lugar de
  re-declarar las reglas.
- **Files (expected):**
  - `docs/delendai/adr/0008-rail-api-design.md`
  - `docs/delendai/adr/0009-rail-lint-architecture.md`
  - `docs/delendai/adr/0010-rail-scaffold-strategy.md`
  - `docs/delendai/AGENT-BOOTSTRAP.md` (sección 6 actualizada)
- **Acceptance:**
  - 3 ADRs revisados y firmados (autor + fecha + estado).
  - `AGENT-BOOTSTRAP.md §6` ahora dice "Sigue `core/rail`. No
    re-definas clean code/SOLID aquí." con link al módulo.
- **Dependencies:** `f00252`, `c00147`, `f00253`, `r00034`, `c00148`.
- **Compatibility:** aditiva.

---

## acceptance

This plan is closed when:

1. Each of the 7 daughter proposals is closed (`done`) with peer review.
2. The `proposals_close_plan` tool returns no blockers.
3. `core/rail` está exportado por `@delendai/core` (o
   `@delendai/core/rail`) y consumido por ≥3 plugins reales.
4. Los 3 lints del rail son ejecutables por `bun run validate`.
5. Los 2 scaffolds (`clean-plugin`, `clean-tool`) producen código que
   pasa todos los lints del rail.
6. `bun run validate` es green en el SHA de cierre.
7. `develop` está verde y protegido (heredado de q00006 Track A).
8. `AGENT-BOOTSTRAP.md §6` apunta a `core/rail` y deja de re-declarar
   R2+R5.

---

# Risk register

| Risk | Mitigation |
| --- | --- |
| `core/rail` se vuelve god module | ADR 0008 + ISP estricto; cada check es independiente |
| Lints demasiado ruidosos en adopción | Default `warn`, opt-in `fail` |
| Migración de 3 plugins rompe comportamiento | Tests de regresión exhaustivos (T6) |
| RAM/CI overhead del rail | Property-based con budget de iteraciones; lints con cache |
| API de rail cambia después de plugins depender | ADR 0008 marca API como `@experimental` por 1 release |
| Resistencia cultural al rail | Documentación clara + T4 piloto exitoso como evidencia |

---

# Tabla resumen de hijas

| ID | Kind | Priority | Track | Title |
| --- | --- | --- | --- | --- |
| `f00252` | feat | P0 | rail-api | `core/rail` module con `IRail` interface y 5 checks tipadas |
| `c00147` | chore | P0 | rail-lints | 3 lints arquitectónicos ejecutables (`rail-clean-code`, `rail-solid`, `rail-reusable`) |
| `f00253` | feat | P1 | rail-scaffold | Scaffolds `clean-plugin` y `clean-tool` que generan código compliant |
| `r00034` | refactor | P1 | rail-migration | Piloto: `audit`, `proposals`, `status-marker` consumen el rail |
| `c00148` | chore | P1 | rail-ci | Wire `bun run validate` + quality gate para el rail |
| `t00024` | test | P1 | rail-tests | Property-based + adversarial tests del rail |
| `d00013` | docs | P2 | rail-docs | ADRs 0008-0010 + actualizar `AGENT-BOOTSTRAP.md §6` |
