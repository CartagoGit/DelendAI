---
id: q00009
title: "Plan: Managed Surface + portable Skills + 5-level Startup Report — separar catálogo, superficie LLM, working set y bajo demanda"
kind: plan
status: ready
type: plan
track: managed-surface-portable-skills-startup-report
date: 2026-08-26
date_iso: 2026-08-26
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)

predecessor-plans:
    - q00005 # auditoría tercera pasada — fuente original de TOK-004
    - q00006 # cuarta pasada — consolidación post-auditoría
    - q00007 # closeout main-strict + ADR contracts subpath
    - q00008 # rail clean-code-solid-reusable

related:
    # Predecesores / fuentes del contrato existente
    - r00027 # silent default `native` después de r00026 — base del cambio a `managed`
    - r00026 # adaptive como silent default — superseded por r00027
    - f00176 # surface-mode-by-client-capabilities — base del bootstrap
    - f00184 # Plugin lifecycle phases prepare/activate/dispose
    - f00185 # Plugin states UNLOADED/LOADED_HIDDEN/ACTIVE/DENIED
    - f00186 # TokenBudgetRegistry unificado
    - r00028 # Subpath exports de core (contracts/plugin/runtime/node)
    # Hijas/hermanas activas que el plan reutiliza o coordina
    - x00269 # commit-policy: validate-then-commit (P0 para los nuevos slices)
    - x00270 # commit-policy: GIT_INDEX_FILE aislamiento (P0)
    - c00144 # branch-protection bifurcada (P0)
    - d00012 # ADR 0007 contracts subpath (P1)
    # Infra de enforcement
    - tools/scripts/lint/ # 30+ lints arquitectónicos — punto de extensión para nuevos gates
    - packages/core/src/lib/surface/ # decide-mode.ts + bootstrap.ts — base del contrato `managed`
    - packages/core/src/lib/skills/ # registry/catalog/load-skills/paths — base del resolver portable
    - packages/core/src/lib/tools/vertex-router.tool.ts # router existente a evolucionar
    - packages/core/src/lib/tools/tool-surface.tool.ts # surface tool a extender

contains:
    proposals:
        # ─── Track M — Managed surface contracts & mode (P0 raíz) ────────────
        - { id: f00254, kind: feat, required: true, priority: P0, track: managed-surface,
            rationale: "Extender `IMcpToolSurfaceMode` con `managed`; `decide-mode.ts` reconoce el nuevo modo; tests que cubren los cinco valores posibles (native/compact/adaptive/managed + alias `extended`)." }
        - { id: f00255, kind: feat, required: true, priority: P0, track: managed-surface,
            rationale: "Surface registry interno (catalog tools/skills/resources) separado de la superficie bootstrap expuesta al LLM; una sola fuente de verdad por dimensión." }
        - { id: r00035, kind: refactor, required: true, priority: P1, track: managed-surface,
            rationale: "Evolucionar `vertex-router.tool.ts` para que pueda resolver, validar y ejecutar tools internas no expuestas en `tools/list` sin cambiar visibilidad." }
        - { id: c00149, kind: chore, required: true, priority: P1, track: managed-surface,
            rationale: "Migrar el default silencioso de `native` (r00027) a `managed` con feature flag; opt-out explícito para hosts legacy. Migration path documentado + tests de backwards compat." }

        # ─── Track SR — 5-level Startup Report (P0 deliverable visible) ──────
        - { id: f00256, kind: feat, required: true, priority: P0, track: startup-report,
            rationale: "Resolver único de `startupReport.level`: ausencia ⇒ `medium`. Schema Zod + default export centralizado + tests con TODO el árbol de config vacío." }
        - { id: f00257, kind: feat, required: true, priority: P0, track: startup-report,
            rationale: "`StartupReportModel`: data class inmutable (off/compact/medium/high/full) con builders tipados y reconciliación schema-bytes/tokens por plugin." }
        - { id: f00258, kind: feat, required: true, priority: P0, track: startup-report,
            rationale: "Renderer split: `AnsiStartupReportRenderer` + `PlainStartupReportRenderer` + auto-detect TTY/NO_COLOR; tokens semánticos (`color.startup.ready|warning|error|header|budget|dim`) — no ANSI hardcoded." }
        - { id: f00259, kind: feat, required: true, priority: P1, track: startup-report,
            rationale: "Bootstrap channel split: stdout del MCP stdio permanece 100% limpio; logging humano va a stderr (o host Output Channel para VS Code). Verificar con MCP SDK 1.x actual." }
        - { id: t00025, kind: test, required: true, priority: P0, track: startup-report,
            rationale: "Snapshots de los 5 niveles para ansi + plain; tabla per-plugin en medium/high/full; reconciliación suma == total expuesta; tests parametrizados sobre presets swarm/solo/core." }

        # ─── Track C — Per-plugin per-request cost accounting (P0 acceptance) ─
        - { id: f00260, kind: feat, required: true, priority: P0, track: cost-accounting,
            rationale: "Plugin cost descriptor: `exposedSchemaBytesPerRequest`, `estimatedSchemaTokensPerRequest`, `% del total recurrente`, budget semantics (`dedicated|shared|inherited|unbounded-by-plugin`)." }
        - { id: f00261, kind: feat, required: true, priority: P0, track: cost-accounting,
            rationale: "Surface-wide reconciliation: `sum(plugin.exposedSchemaBytes) == surface.exposedSchemaBytes` (con redondeo documentado). Runtime/usage tokens separados del schema tax." }
        - { id: v00128, kind: perf, required: true, priority: P0, track: cost-accounting,
            rationale: "Baseline before/after: medir native (full surface) vs managed (bootstrap only) en preset swarm; tokens/request evitados + %. No elevar thresholds para maquillar el resultado." }
        - { id: c00150, kind: chore, required: true, priority: P1, track: cost-accounting,
            rationale: "Regression gate: si `bootstrap.tokens/request > T` o `exposed/available > ratio` CI falla. Threshold real basado en la baseline v00128, no inventado." }

        # ─── Track S — Portable Skill resolver (P0 acceptance E2E) ──────────
        - { id: f00262, kind: feat, required: true, priority: P0, track: skill-resolver,
            rationale: "SkillSource interface + `WorkspaceSkillSource` + `PackageSkillSource` + `PluginSkillSource`; precedence explícita y testeada; catálogo compacto (id/version/description/tags/appliesTo/source/owner/estimatedBodyTokens/hash)." }
        - { id: f00263, kind: feat, required: true, priority: P0, track: skill-resolver,
            rationale: "Package-root resolution sin hardcodear rutas del monorepo: usa `import.meta.url` del módulo propietario + asset root del plugin manifest; funciona con `node_modules/@mcp-vertex/<plugin>/` en proyecto externo." }
        - { id: c00151, kind: chore, required: true, priority: P0, track: skill-resolver,
            rationale: "Skill packaging: `package.json#files` correcto en cada plugin + `@mcp-vertex/core`; SKILL.md y manifest llegan al artefacto publicado; `bun pm pack` smoke + diff contra `node_modules` esperado." }
        - { id: t00026, kind: test, required: true, priority: P0, track: skill-resolver,
            rationale: "E2E downstream consumer: mkdtemp + `bun add @mcp-vertex/core @mcp-vertex/proposals` (paquete local tarball); arranca MCP-Vertex; lista catálogo de skills; recupera body de core skill + plugin skill; workspace override opcional." }

        # ─── Track L — Lifecycle + working set + eviction (P1) ───────────────
        - { id: f00264, kind: feat, required: true, priority: P1, track: lifecycle,
            rationale: "Plugin lifecycle machine: UNLOADED → LOADED_HIDDEN → ACTIVE_INTERNAL → DENIED con leases/refcount; activation idempotente; eviction usa refcount+mutex para no romper ejecuciones en vuelo." }
        - { id: f00265, kind: feat, required: true, priority: P1, track: lifecycle,
            rationale: "Working set + LRU eviction: idle TTL configurable, max warm plugins, max warm schema/body bytes; hysteresis para evitar load/unload ping-pong; never-evict list para bootstrap-critical." }
        - { id: c00152, kind: chore, required: true, priority: P2, track: lifecycle,
            rationale: "Plugin selector scoring: semantic match + token tax + latency tax + historical success + permission/risk + warm state + dependency cost + task phase + hysteresis. Reutilizar/evolucionar `auto-plugin-selector`." }

        # ─── Track V — VS Code / host smoke (P1) ─────────────────────────────
        - { id: t00027, kind: test, required: true, priority: P1, track: host-smoke,
            rationale: "VS Code smoke: extension arranca MCP-Vertex; Output Channel recibe el Startup Report completo; host puede decir `Discovered N tools` pero N == superficie bootstrap expuesta ≠ catálogo total; sin dependencia de `tools/list_changed`." }
        - { id: c00153, kind: chore, required: true, priority: P2, track: host-smoke,
            rationale: "Documentar en README del extension y ADOPTER-SURFACE-MODE.md la semántica `available ≠ exposed` y cómo el operador debe interpretar el Startup Report." }

        # ─── Track D — Docs, schema & generated artifacts (P1) ──────────────
        - { id: d00014, kind: docs, required: true, priority: P1, track: docs,
            rationale: "ADR 0011 Managed Surface + ADR 0012 portable Skill resolver; actualiza AGENT-BOOTSTRAP.md §3/§6 para apuntar a `core/managed` y `core/skills/resolver` como fuentes únicas de verdad." }
        - { id: d00015, kind: docs, required: true, priority: P1, track: docs,
            rationale: "Documentación de superficie: README §Surface modes, docs/mcp-vertex/SURFACE-MODES.md, ADOPTER-SURFACE-MODE.md, ejemplos de los 5 niveles de startup output, tabla before/after." }
        - { id: c00154, kind: chore, required: true, priority: P1, track: docs,
            rationale: "Regenerar `preset-metadata.generated.ts`, schema Zod docs, i18n keys (12 lenguas × N nuevas claves); commit atómico por artifact con `types:generate` y `i18n:sync`." }

        # ─── Track G — Gates, rollback & backwards compat (P1) ──────────────
        - { id: c00155, kind: chore, required: true, priority: P1, track: gates,
            rationale: "Quality gate completo: `bun run validate` + nuevos lints arquitectónicos (rail-lints de q00008) + cost regression gate (c00150). Defense in depth." }
        - { id: d00016, kind: docs, required: true, priority: P2, track: gates,
            rationale: "Migration matrix: native → managed default, `extended` alias → high, presets afectados, CLI flags, web configurator. Backwards compat tests que prueban los caminos antiguos siguen funcionando." }
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
    no-stdout-pollution-from-mcp-stdio: true
    no-bootstrap-schema-explosion: true
    skills-are-lazy-by-default: true
    cost-reconciliation-is-a-lint: true
    evidence-not-assertions: true

source-spec:
    file: docs/mcp-vertex/specs/managed-surface-portable-skills-startup-report.md
    sections:
        - §3 Managed Surface architecture
        - §5 Tool resolution flow
        - §6 Selector & working set
        - §7 Skills distribution & transport
        - §8 Startup Report levels (off/compact/medium/high/full)
        - §14 Per-plugin cost
        - §26 Acceptance criteria

acceptance-criteria-summary: |
    Solo `q00009` puede cerrarse cuando se demuestre con evidencia
    reproducible en el SHA final:
      • Default efectivo = `medium` cuando no hay config explícita.
      • Los 5 niveles existen y se renderean limpiamente (ansi + plain).
      • Medium lista todos los plugins con coste recurrente por petición.
      • sum(plugin.exposedSchemaBytes) == surface.exposedSchemaBytes.
      • Runtime/usage tokens separados del schema/context tax.
      • Tools internas no visibles son ejecutables vía router.
      • No dependencia funcional de `tools/list_changed`.
      • Lazy activation + eviction funcionan sin romper ejecuciones.
      • Catálogo de skills compacto, bodies lazy.
      • Core y plugin skills funcionan desde paquete instalado en proyecto externo.
      • Workspace overrides tienen precedencia explícita.
      • Stdout del MCP stdio permanece limpio.
      • VS Code smoke pasa.
      • Métrica before/after demuestra reducción significativa.
      • Config/schema/docs/generated artifacts sincronizados.
      • `bun run validate` verde en el SHA final.

deferred-to-future-plans:
    - "Selector ML scoring con pesos configurables (Track L c00152 marca P2; scoring heurístico suficiente en v1)."
    - "RemoteSkillSource con opt-in (no en v1; skill source es local-only por seguridad)."
    - "Auto-injection de skill body por selector (Track L f00265 marca P2; el router invoca `skill(id)` explícito en v1)."
    - "i18n de los 5 niveles del Startup Report (sólo strings de surface mode en v1; los 5 niveles son operator-facing en EN/ES)."

rollback-strategy: |
    El cambio de default `native → managed` (c00149) usa feature flag
    `MCP_VERTEX_SURFACE_DEFAULT` que se consulta en `decide-mode.ts`.
    Si la baseline v00128 demuestra regresión material, se flippa el
    flag en commit de rollback sin tocar a los hosts que ya opt-in.
    El nuevo `managed` mode es aditivo al enum IMcpToolSurfaceMode;
    un downgrade basta con volver el flag al estado pre-q00009 y
    el resto del trabajo (startup report, cost accounting, skill
    resolver) sigue siendo válido y visible para diagnóstico.
---

# q00009 — Plan: Managed Surface + portable Skills + 5-level Startup Report

## Goal

Separar de forma rigurosa las **cuatro dimensiones** que hoy pueden
confundirse en MCP-Vertex:

1. **Catálogo total disponible para el operador humano** — lo que el
   servidor sabe que puede ofrecer.
2. **Superficie visible al modelo/cliente MCP** — los schemas que el
   LLM paga en cada petición.
3. **Working set interno del runtime** — plugins/tools/skills cargados
   o calientes porque son útiles para la tarea actual.
4. **Contenido bajo demanda** — schemas completos, skill bodies,
   knowledge, resources que solo se materializan cuando se necesitan.

El operador debe ver el catálogo completo al iniciar MCP-Vertex; el
LLM solo debe pagar por la superficie bootstrap. MCP-Vertex selecciona
y ejecuta internamente las capacidades adecuadas. Plugins y skills se
cargan bajo demanda y se desalojan cuando dejan de ser útiles. Las
skills deben funcionar tanto en dogfooding dentro del monorepo como
en un proyecto externo que solo instala paquetes publicados.

## why

El contrato necesita separar el catálogo completo, la superficie que paga
el cliente MCP, el working set interno y el contenido bajo demanda. Esta
separación permite reducir el coste recurrente sin perder descubribilidad
para el operador ni portabilidad de skills fuera del monorepo.

## non-goals

- **Selector ML scoring con pesos configurables** (Track L c00152 es P2;
  scoring heurístico es suficiente en v1).
- **RemoteSkillSource** (no en v1; skill sources son locales por seguridad).
- **Auto-injection de skill body por selector** (Track L f00265 es P2;
  el router invoca `skill(id)` explícito en v1).
- **i18n de los 5 niveles del Startup Report** (sólo strings de surface
  mode en v1; los 5 niveles son operator-facing en EN/ES).
- **Telemetry externa** (MCP-Vertex no envía telemetría por sí mismo
  en esta iniciativa; las métricas son in-memory / logs locales).

## architecture

#### Track M — Managed Surface contracts & mode (P0 raíz)

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `f00254` | feat | P0 | Enum `IMcpToolSurfaceMode` extendido con `managed`; `decide-mode.ts` lo reconoce; tests sobre los 5 valores (native/compact/adaptive/managed + alias `extended`). |
| `f00255` | feat | P0 | Surface registry interno separado de la superficie bootstrap expuesta; una sola fuente de verdad por dimensión. |
| `r00035` | refactor | P1 | Evolucionar `vertex-router.tool.ts` para resolver/validar/ejecutar tools internas no expuestas en `tools/list` sin cambiar visibilidad. |
| `c00149` | chore | P1 | Migrar default silencioso `native → managed` con feature flag `MCP_VERTEX_SURFACE_DEFAULT`; opt-out para hosts legacy; tests backwards compat. |

Precondición: `r00027` (silent default `native`), `f00184` (lifecycle phases), `f00185` (plugin states) deben estar `done` o ser compatibles.

#### Track SR — 5-level Startup Report (P0 deliverable visible)

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `f00256` | feat | P0 | Resolver único de `startupReport.level`: ausencia ⇒ `medium`. Schema Zod + default centralizado + tests con TODO el árbol de config vacío. |
| `f00257` | feat | P0 | `StartupReportModel`: data class inmutable (off/compact/medium/high/full) con builders tipados y reconciliación schema-bytes/tokens por plugin. |
| `f00258` | feat | P0 | Renderer split: `AnsiStartupReportRenderer` + `PlainStartupReportRenderer` + auto-detect TTY/NO_COLOR; tokens semánticos (sin ANSI hardcoded). |
| `f00259` | feat | P1 | Bootstrap channel split: stdout MCP stdio 100% limpio; logging humano va a stderr (o host Output Channel para VS Code). Compatible con MCP SDK 1.x actual. |
| `t00025` | test | P0 | Snapshots de los 5 niveles ansi + plain; tabla per-plugin en medium/high/full; reconciliación suma == total; tests parametrizados sobre presets swarm/solo/core. |

Precondición: `f00254` (managed mode reconocido), `f00260` (cost descriptor por plugin).

#### Track C — Per-plugin per-request cost accounting (P0 acceptance)

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `f00260` | feat | P0 | Plugin cost descriptor: `exposedSchemaBytesPerRequest`, `estimatedSchemaTokensPerRequest`, `% del total recurrente`, budget semantics (`dedicated|shared|inherited|unbounded-by-plugin`). |
| `f00261` | feat | P0 | Surface-wide reconciliation: `sum(plugin.exposedSchemaBytes) == surface.exposedSchemaBytes`. Runtime/usage tokens separados del schema tax. |
| `v00128` | perf | P0 | Baseline before/after: medir native (full surface) vs managed (bootstrap only) en preset swarm; tokens/request evitados + %. |
| `c00150` | chore | P1 | Regression gate: `bootstrap.tokens/request > T` o `exposed/available > ratio` falla CI. Threshold de `v00128`, no inventado. |

Precondición: `f00186` (TokenBudgetRegistry unificado), `f00257` (StartupReportModel).

#### Track S — Portable Skill resolver (P0 acceptance E2E)

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `f00262` | feat | P0 | `SkillSource` interface + `WorkspaceSkillSource` + `PackageSkillSource` + `PluginSkillSource`; precedence explícita; catálogo compacto. |
| `f00263` | feat | P0 | Package-root resolution sin hardcodear rutas del monorepo: usa `import.meta.url` del módulo propietario + asset root del plugin manifest. |
| `c00151` | chore | P0 | Skill packaging: `package.json#files` correcto en cada plugin + `@mcp-vertex/core`; `bun pm pack` smoke + diff contra `node_modules` esperado. |
| `t00026` | test | P0 | E2E downstream consumer: mkdtemp + `bun add @mcp-vertex/core @mcp-vertex/proposals` (tarball); arranca MCP-Vertex; lista skills; recupera body core+plugin; override workspace opcional. |

Precondición: `packages/core/src/lib/skills/` (registry, catalog, paths) debe ser extensible sin breaking change.

#### Track L — Lifecycle + working set + eviction (P1)

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `f00264` | feat | P1 | Plugin lifecycle machine: UNLOADED → LOADED_HIDDEN → ACTIVE_INTERNAL → DENIED con leases/refcount; activation idempotente. |
| `f00265` | feat | P1 | Working set + LRU eviction: idle TTL configurable, max warm plugins/schema/body bytes; hysteresis; never-evict list para bootstrap-critical. |
| `c00152` | chore | P2 | Plugin selector scoring (semantic + token tax + latency tax + historical success + permissions + warm state + deps + task phase + hysteresis). Evoluciona `auto-plugin-selector`. |

Precondición: `f00185` (plugin states), `f00264` (lifecycle machine).

#### Track V — VS Code / host smoke (P1)

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `t00027` | test | P1 | VS Code smoke: extension arranca MCP-Vertex; Output Channel recibe el Startup Report; host puede decir `Discovered N tools` pero N == superficie bootstrap ≠ catálogo total. |
| `c00153` | chore | P2 | Documentar `available ≠ exposed` y cómo el operador interpreta el Startup Report en ADOPTER-SURFACE-MODE.md + README extension. |

Precondición: `f00258` (renderers), `f00259` (channel split).

#### Track D — Docs, schema & generated artifacts (P1)

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `d00014` | docs | P1 | ADR 0011 Managed Surface + ADR 0012 portable Skill resolver; actualiza AGENT-BOOTSTRAP.md §3/§6 para apuntar a `core/managed` y `core/skills/resolver`. |
| `d00015` | docs | P1 | Documentación: README §Surface modes, SURFACE-MODES.md, ADOPTER-SURFACE-MODE.md, ejemplos de los 5 niveles, tabla before/after. |
| `c00154` | chore | P1 | Regenerar `preset-metadata.generated.ts`, schema Zod docs, i18n keys; commit atómico por artifact con `types:generate` y `i18n:sync`. |

Precondición: todos los tracks técnicos deben estar `done` para que los docs reflejen el estado real.

#### Track G — Gates, rollback & backwards compat (P1)

| Hija | Tipo | Prioridad | Resumen |
|------|------|-----------|---------|
| `c00155` | chore | P1 | Quality gate completo: `bun run validate` + nuevos lints arquitectónicos (rail-lints de q00008) + cost regression gate (c00150). |
| `d00016` | docs | P2 | Migration matrix: native → managed, `extended` alias → high, presets/CLI/web configurator; backwards compat tests. |

Precondición: `c00150` (regression gate), `c00154` (generated artifacts).

## slices

### S1 — Managed Surface, startup report, costes y skills

- **Status**: pending
- **Files**: `packages/core/src/lib/surface/`, `packages/core/src/lib/skills/`, `packages/core/src/lib/tools/`, plugins y documentación indicados en los tracks
- **Gate**: `bun run validate`

## acceptance

Solo `q00009` puede cerrarse cuando se demuestre con evidencia
reproducible en el SHA final:

1. Default efectivo = `medium` cuando no hay config explícita (test: árbol de config vacío ⇒ resolver devuelve `medium`).
2. Los 5 niveles (`off`, `compact`, `medium`, `high`, `full`) existen y se renderean limpiamente en ansi + plain.
3. Medium lista todos los plugins con coste recurrente por petición + total reconciliado.
4. `sum(plugin.exposedSchemaBytes) == surface.exposedSchemaBytes` (salvo redondeo documentado).
5. Runtime/usage tokens están separados del schema/context tax recurrente.
6. Tools internas no visibles son ejecutables vía `vertex` router sin cambiar `tools/list`.
7. No dependencia funcional de `tools/list_changed`.
8. Lazy activation + eviction funcionan sin romper ejecuciones en vuelo (refcount + mutex).
9. Catálogo de skills compacto (id/version/description/tags/appliesTo/source/owner/estimatedBodyTokens/hash).
10. Bodies de skills son lazy (cero bodies preloaded salvo bootstrap deliberado).
11. Core skills funcionan desde paquete `@mcp-vertex/core` instalado en proyecto externo.
12. Plugin skills funcionan desde paquete `@mcp-vertex/<plugin>` instalado en proyecto externo.
13. Workspace overrides tienen precedencia explícita y testeada.
14. No hardcodear rutas del monorepo fuente como contrato de runtime.
15. Stdout del MCP stdio permanece 100% limpio (test E2E).
16. VS Code smoke pasa (Output Channel recibe el Startup Report, host puede decir `Discovered N tools` pero N == bootstrap ≠ catálogo).
17. Métrica before/after demuestra reducción significativa de tokens/request vs `native` baseline.
18. No se elevan thresholds para maquillar regresión.
19. Config/schema/docs/generated artifacts sincronizados.
20. Tests unit + integration + E2E pasan.
21. `bun run validate` verde en el SHA final.

## notes

Este plan **no produce código por sí mismo**: es un orquestador.
Las hijas lo entregan.

| Track | # hijas | Estado al cierre del plan |
|-------|---------|-----------------------------|
| M Managed surface | 4 | done |
| SR Startup Report | 5 | done |
| C Cost accounting | 4 | done |
| S Skill resolver | 4 | done |
| L Lifecycle + working set | 3 | done |
| V VS Code / host smoke | 2 | done |
| D Docs + artifacts | 3 | done |
| G Gates + rollback | 2 | done |
| **Total** | **27** | **all done** |

El plan no puede cerrarse hasta que las 27 hijas estén `done` con
peer review y la tabla de acceptance criteria de la sección anterior
esté verificada con evidencia en el SHA final.
