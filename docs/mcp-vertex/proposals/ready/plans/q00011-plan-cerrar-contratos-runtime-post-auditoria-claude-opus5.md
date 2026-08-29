---
id: q00011
title: "Plan — cerrar los contratos de runtime que el sistema promete y no cumple: ciclo de vida eager/lazy, propiedad del teardown, enforcement de efectos, puertas ciegas de CI y el 66% del coste de tokens que vive en los output schemas"
kind: plan
status: ready
type: plan
track: runtime-contracts-v1
date: 2026-08-27
priority: P0
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    reviewer: Claude Opus 5 (auditoría independiente) + corroboración cruzada de dos revisores externos
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
    snapshot-initial: ff289141a26ecb3a70744ae608373517d7b87c1b
related:
    - q00006
    - q00010
contains:
    proposals:
        # ─── Track E — contratos de ciclo de vida (P0, la raíz de todo) ────────
        - { id: r00038, kind: refactor, required: true, priority: P0, track: lifecycle,
            rationale: "PluginActivationSession: una sola ruta de activacion para eager y lazy (opciones parseadas, timeout, AbortSignal, dispose retenido, rollback). AUD-E01." }
        - { id: t00029, kind: test, required: true, priority: P0, track: lifecycle,
            rationale: "Test de equivalencia parametrizado por ruta: la misma bateria corre para eager y lazy sobre un plugin sintetico con default/coerce/transform. AUD-E01." }
        - { id: r00039, kind: refactor, required: true, priority: P0, track: lifecycle,
            rationale: "McpHostSession.dispose() idempotente, teardown en orden inverso de dependencias, try/finally en runCli. AUD-E02." }
        # ─── Track D — efectos y frontera de seguridad (P0) ────────────────────
        - { id: x00291, kind: fix, required: true, priority: P0, track: security,
            rationale: "external-mcps devuelve dispose que llama a registry.closeAll(): los subprocesos MCP de terceros dejan de sobrevivir al servidor. AUD-D05." }
        - { id: x00290, kind: fix, required: true, priority: P0, track: security,
            rationale: "llmDecidesActivation conectado al proxy de activacion: hoy la opcion se parsea y no la consume nadie. AUD-D04." }
        - { id: x00289, kind: fix, required: true, priority: P1, track: security,
            rationale: "eager expresable en ServerEntrySchema (.strict() lo rechaza hoy) + test de contrato schema-vs-registry. AUD-D03." }
        - { id: x00288, kind: fix, required: true, priority: P0, track: security,
            rationale: "Lint de fronteras de efectos: prohibir node:child_process/fs/net/http en plugins fuera de adaptadores autorizados, con ratchet medido de 104 (el 13 publicado contaba solo child_process). AUD-D01." }
        - { id: r00037, kind: refactor, required: true, priority: P1, track: security,
            rationale: "EffectBroker: dryRun pasa de deteccion post-hoc a prevencion. AUD-D02." }
        - { id: x00292, kind: fix, required: true, priority: P1, track: security,
            rationale: "protectedBranches obligatorio en la firma de gitPush: el guard deja de ser fail-open. AUD-D06." }
        # ─── Track A — puertas de CI que no pueden fallar o no pueden pasar ────
        - { id: x00278, kind: fix, required: true, priority: P0, track: governance,
            rationale: "allow_deletion -> allow_deletions en los dos verificadores: hoy reportarian drift falso para siempre incluso con token admin. AUD-A06." }
        - { id: x00277, kind: fix, required: true, priority: P0, track: governance,
            rationale: "verify-branch-protection deja de devolver verde cuando no ha verificado nada: modelo pass/fail/unverified. AUD-A05." }
        - { id: x00276, kind: fix, required: true, priority: P0, track: governance,
            rationale: "verify-develop-health deja de explotar con 403: es el unico check rojo que queda en develop. AUD-A04." }
        - { id: x00279, kind: fix, required: true, priority: P1, track: governance,
            rationale: "BRANCH_PROTECTION.defaults consumido por los verificadores en vez de hardcodeado. AUD-A07." }
        - { id: x00281, kind: fix, required: true, priority: P0, track: ci,
            rationale: "biome ci sobre el monorepo completo con baseline-ratchet: hoy solo cubre extensions/vscode y hay 45 errores invisibles. AUD-A09." }
        - { id: x00282, kind: fix, required: true, priority: P1, track: ci,
            rationale: "Mapa unico workspace->proyecto vitest: affected.script.ts emite nombres de paquete que --project rechaza. AUD-A11." }
        - { id: x00294, kind: fix, required: true, priority: P1, track: ci,
            rationale: "tools/ no lo typechequea nadie: el tsconfig raiz lo excluye y tools/tsconfig.json no lo invoca ningun script. 95 errores TS invisibles en 29 ficheros. AUD-A12." }
        - { id: x00295, kind: fix, required: true, priority: P0, track: security,
            rationale: "El guard que impide sondear herramientas con efectos compara literales que no estan en el union: 33 tools con effects ['write'] se invocan con entrada vacia. AUD-D07." }
        - { id: r00035, kind: refactor, required: false, priority: P2, track: ci,
            rationale: "Desduplicar ci.yml frente a tier2 y extraer un workflow reutilizable de setup. AUD-A10." }
        - { id: d00013, kind: docs, required: true, priority: P1, track: governance,
            rationale: "ADR que fija el modelo de ramas (develop laboratorio / main publicacion) y el guard de push directo a main. AUD-A01." }
        - { id: x00273, kind: fix, required: true, priority: P1, track: governance,
            rationale: "Guard de push directo a main coherente con el ADR anterior. AUD-A01." }
        # ─── Track B — economia de tokens (el 66% esta en los output schemas) ──
        - { id: v00129, kind: perf, required: true, priority: P1, track: tokens,
            rationale: "Envelope compartido por $ref + niveles de detalle: los output schemas del core son 35.996 B de 51.786 B. AUD-B01." }
        - { id: v00130, kind: perf, required: true, priority: P1, track: tokens,
            rationale: "Podar advise_routing (12.157 B de outputSchema) e invoke (9.127 B) en orchestrator-runner. AUD-B01." }
        - { id: v00131, kind: perf, required: true, priority: P1, track: tokens,
            rationale: "Podar quality_policy (7.902 B) y usage_report (5.817 B). AUD-B01." }
        - { id: v00132, kind: perf, required: false, priority: P2, track: tokens,
            rationale: "Dejar de serializar el mismo JSON en content[0].text y structuredContent. AUD-F06." }
        - { id: x00283, kind: fix, required: true, priority: P1, track: tokens,
            rationale: "El dashboard deja de reportar 'over hard (0B)' por un ?? 0; techos marginales obligatorios en los 6 presets gobernados. AUD-B02." }
        - { id: x00284, kind: fix, required: true, priority: P1, track: tokens,
            rationale: "measureBootstrapBytes mide el mismo objeto que viaja en tools/list. AUD-B04." }
        - { id: r00036, kind: refactor, required: true, priority: P1, track: tokens,
            rationale: "Ratchet descendente de presupuestos: subir un techo exige excepcion documentada con caducidad. AUD-B03." }
        - { id: x00296, kind: fix, required: true, priority: P1, track: tokens,
            rationale: "Las filas fixture-gated del dashboard no declaran su superficie: el cliente hereda capabilities {} y tras x00285 resuelve a native, asi que overview se compara contra un techo calibrado para managed. AUD-B06." }
        - { id: f00272, kind: feat, required: true, priority: P2, track: tokens,
            rationale: "Metricas de superficie util: activation precision/recall/churn, unused activation tokens, surface utilization. AUD-B05." }
        # ─── Track C — superficie adaptativa ───────────────────────────────────
        - { id: x00285, kind: fix, required: true, priority: P1, track: adaptive,
            rationale: "decideSurfaceModeFromCapabilities deja de ignorar clientInfo y capabilities; perfiles por host. AUD-C01." }
        - { id: x00286, kind: fix, required: true, priority: P1, track: adaptive,
            rationale: "Eviccion real del working set: dispose + rebind lazy. idleTtlMs y maxWarmPlugins dejan de ser inertes. AUD-C02." }
        - { id: x00287, kind: fix, required: true, priority: P2, track: adaptive,
            rationale: "isToolExposed deja de ser fail-open para nombres desconocidos. AUD-C04." }
        - { id: f00273, kind: feat, required: false, priority: P2, track: adaptive,
            rationale: "Ranking, umbral de confianza e histeresis en tool_search. AUD-C03." }
        # ─── Track E2 — fronteras de paquete ───────────────────────────────────
        - { id: r00040, kind: refactor, required: false, priority: P2, track: architecture,
            rationale: "Subpaths del core por dominio; el barrel de 287 exports queda deprecado. AUD-E03." }
        - { id: r00041, kind: refactor, required: false, priority: P2, track: architecture,
            rationale: "client/{contracts,transport,node,scaffold} + lint de fronteras: el cliente deja de arrastrar el core. AUD-E04." }
        - { id: r00042, kind: refactor, required: false, priority: P2, track: architecture,
            rationale: "proposals como event log + maquina de estados + workflow front doors. AUD-E05." }
        # ─── Track G — confianza y control (dolores del uso real del autor) ────
        - { id: f00276, kind: feat, required: true, priority: P0, track: trust,
            rationale: "error-reporting como embudo observable: fallo 27 veces con GH_NOT_INSTALLED y abrio un cortacircuitos hace 3 dias sin que nada lo hiciera visible. Contadores por etapa + doctor --deep. AUD-G01." }
        - { id: f00277, kind: feat, required: true, priority: P1, track: trust,
            rationale: "AgentSession + mcpv agents: ver que hacen todos los agentes en worktrees sin cambiar de rama. AUD-G02." }
        - { id: f00278, kind: feat, required: true, priority: P1, track: trust,
            rationale: "WorkIntent + completion gates: intent vs actual con deriva determinista; ACTIVE->COMPLETED exige evidencia. AUD-G02." }
        - { id: f00279, kind: feat, required: true, priority: P1, track: trust,
            rationale: "Taxonomia de reglas guidance/verification/enforcement, cada una con su mecanismo. Las reglas dejan de depender de la obediencia del modelo. AUD-G03." }
        - { id: f00280, kind: feat, required: true, priority: P1, track: adoption,
            rationale: "mcpv adopt: descubrimiento en solo lectura + ProjectProfile + adopcion por etapas. En un repo grande el trabajo lo hace Vertex, no el usuario. AUD-G04." }
        - { id: d00015, kind: docs, required: true, priority: P1, track: governance,
            rationale: "Invariantes explicitos por subsistema con un test cada uno: la mitad de los que el autor daria por ciertos son falsos hoy. AUD-G05." }
        # ─── Track F — tests, DX y producto ────────────────────────────────────
        - { id: t00030, kind: test, required: true, priority: P1, track: testing,
            rationale: "Apretar los umbrales de cobertura al valor real y exigir branches >=80% en core/plugins, core/dry-run y core/project. AUD-F01." }
        - { id: t00031, kind: test, required: true, priority: P1, track: testing,
            rationale: "Reescribir el e2e de dogfood de commit-policy para el comportamiento post-x00258. AUD-F02." }
        - { id: x00293, kind: fix, required: true, priority: P1, track: release,
            rationale: "Version unica por plugin: 41 de 51 publican 0.1.1 y declaran 0.1.0 al host MCP; el gate manifest-vs-package cubre dos de las tres fuentes. AUD-F05." }
        - { id: f00274, kind: feat, required: false, priority: P2, track: product,
            rationale: "La extension VS Code se activa por comando: hoy no arranca en un repo sin mcp-vertex.config.json. AUD-F03." }
        - { id: f00275, kind: feat, required: false, priority: P2, track: product,
            rationale: "mcpv doctor --deep/--ci/--offline cubriendo los modos de fallo de esta auditoria. AUD-F04." }
        - { id: d00014, kind: docs, required: false, priority: P2, track: docs,
            rationale: "Una pagina canonica por plugin: tres paginas manuales duplican las auto-generadas. AUD-F07." }
---

# q00011 — Cerrar los contratos de runtime

## Goal

La auditoría independiente sobre `develop@2cf17373` concluye que mcp-vertex **no
tiene un problema de capacidad de ingeniería, sino de verificabilidad**: ha
construido más controles de los que puede demostrar que funcionan, y más
configuración de la que puede demostrar que surte efecto.

Este plan cierra esa brecha. No añade amplitud de producto — el proyecto ya
tiene amplitud de sobra para diferenciarse. Convierte ciclo de vida, efectos,
superficie adaptativa y enrutado externo en **contratos de runtime imposibles de
violar por accidente**, y hace que cada puerta de CI tenga un test que demuestre
que falla cuando debe fallar.

## Why

Cinco patrones, todos verificados línea a línea contra el snapshot:

1. **Dos implementaciones del mismo concepto que ya divergieron.** La activación
   lazy comprueba `safeParse(...).success` y **descarta `parsed.data`**, llama a
   `register()` **sin timeout ni AbortSignal**, y **no retiene el `dispose`**.
   El mismo plugin se comporta distinto según cómo se cargara — y la ruta débil
   es el modo `managed`, que es el default silencioso.

2. **Nadie posee el teardown, en tres niveles a la vez.** `external-mcps` no
   devuelve `dispose` (aunque `closeAll()` existe), el activador lazy no lo
   retiene, y `createMcpProject()` no expone forma de cerrar. Arreglar un solo
   nivel no produce mejora observable: por eso `r00038`, `r00039` y `x00291` van
   juntos.

3. **Una puerta que no puede fallar y otra que no puede pasar.**
   `verify-branch-protection` devuelve `0` cuando no ha verificado nada — el
   check aparece verde en cada ejecución sin haber comprobado jamás nada. Su
   gemela `verify-develop-health` lanza en el mismo 403 y es el único check rojo
   que queda. Y ambas leen `allow_deletion` cuando la API devuelve
   `allow_deletions`.

4. **Puertas que miden lo que no importa.** `bun run lint` cubre sólo
   `extensions/vscode`: 3.320 ficheros del monorepo nunca pasan por Biome y ya
   acumulan 45 errores. `lint:capabilities` reporta `✓ 51/51` porque busca un
   patrón textual que 13 plugins eluden importando `node:child_process` directo.

5. **Opciones declaradas que no hacen nada, algunas de seguridad.**
   `llmDecidesActivation` no lo consume nadie; `eager` es inexpresable porque el
   esquema es `.strict()`; `maxWarmPlugins`/`idleTtlMs` sólo cambian un array
   informativo; `decideSurfaceModeFromCapabilities` ignora sus dos parámetros.

Y **la cobertura de ramas al 69%** explica por qué nada de esto se detectó: los
umbrales están dos puntos por debajo de la medida real, y las ramas son
exactamente donde viven todos estos bugs. Ninguno estaba en el camino feliz.

## Non-goals

- No reescribir el core: los bugs son de contrato, no de estructura. Una
  reescritura destruiría 1.054 specs de valor demostrado para arreglar lo que se
  arregla con una primitiva compartida.
- No perseguir las descripciones (6% del coste) mientras el 66% vive en los
  output schemas.
- No tratar `hidden` como fallo de seguridad: es semántica intencionada y
  correcta (`visible` = listado+invocable, `hidden` = no listado+invocable,
  `deactivated` = ninguna). "Arreglarlo" rompería el router adaptativo.
- No añadir plugins ni tools nuevos hasta recuperar margen en `minimal` y `lean`.
- No fusionar los plugins solapados sin datos de uso: `f00272` primero.
- No modificar ninguna hija de `q00006` ni de `q00010`. Donde hay adyacencia
  (gobernanza de ramas), este plan se apoya en la decisión ya tomada en lugar de
  reabrirla.
- No implementar descarga agresiva de plugins sin respetar `inFlightByPlugin`.
- No añadir reintentos a operaciones mutadoras sin claves de idempotencia:
  `mutations/idempotency.ts` ya existe.

## Architecture

La arquitectura objetivo del informe (§15) en una frase por capa:

```
                              McpHostSession
                     start() · stop() · dispose() [idempotente]
                                    │
        ┌───────────────────────────┼───────────────────────────┐
 PluginActivationManager      PolicyEngine                 Telemetry
        │                           │                           │
 PluginActivationSession       EffectBroker              usage · tokens
  normalizeOptions()                │                    churn · confusion
  createAbortController()    fs git process net db browser
  applyRegisterTimeout()            │
  register()                  capacidad real | denegada
  retainRuntime()             (tool effects × policy × dryRun
  dispose() · rollback()       × trust × workspace × user ack)
        │
   ┌────┴────┐
 eager     lazy          ← parámetros de la MISMA sesión, no dos implementaciones
   └────┬────┘
        │
   PluginRuntime  ── dispose() obligatorio si declara capability `process`
        │
 ToolSurfaceController
  {visible|hidden|deactivated} × {cold|warm|hot|in-flight}
  histéresis · presupuestos por modelo · perfil de host
```

Cuatro invariantes que esta forma hace ciertos por construcción:

1. **Una sola ruta de activación.** Eager y lazy son parámetros de la misma
   sesión. La divergencia de `AUD-E01` deja de ser expresable.
2. **Un solo dueño del teardown.** `McpHostSession` posee el ciclo de vida.
3. **Un solo camino a los efectos.** El `EffectBroker` es la única fuente de
   capacidades y el lint de fronteras lo hace verificable; `dryRun: true` pasa a
   significar *imposible*, no *inadvisable*.
4. **Visibilidad y autorización siguen siendo ortogonales.** Esto ya está bien y
   no se toca.

## Slices

Cada slice agrupa propuestas hijas con fichero, tests y criterios propios. El
detalle vive en la hija; aquí el orden y la razón del orden.

### S1 — Gobernanza: devolver la señal a las puertas ciegas (P0)

- **Status**: done
- **Files**: [`tools/scripts/ci/verify-branch-protection.script.ts`, `tools/scripts/ci/verify-develop-health.script.ts`, `tools/tests/ci/verify-branch-protection.spec.ts`, `tools/tests/ci/verify-develop-health.spec.ts`]
- **Gate**: `bun run test -- tools/tests/ci && bun tools/scripts/ci/verify-branch-protection.script.ts --dry-run`


`x00278` (`allow_deletion` → `allow_deletions`) entra **primero**: sin él,
`x00277` y `x00276` seguirían reportando drift falso justo cuando alguien
intente hacerlo bien con un token de administrador. Después, en paralelo,
`x00277` (el falso verde deja de ser verde) y `x00276` (el 403 deja de explotar;
es el único check rojo que queda en `develop`).

### S2 — Ciclo de vida: la cadena completa o nada (P0)

- **Status**: done
- **Files**: [`packages/core/src/lib/plugins/managed-lazy-runtime.ts`, `packages/core/src/lib/plugins/load-plugins.ts`, `packages/core/src/lib/plugins/load-plugins-runtime.helper.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/cli/src/index.ts`, `plugins/external-mcps/src/index.ts`]
- **Gate**: `bun run test -- packages/core/tests/src/lib/plugins packages/core/tests/src/lib/project plugins/external-mcps`


`r00038` (`PluginActivationSession`) → `t00029` (test de equivalencia, escrito
**antes** del refactor y que debe fallar contra el código actual) → `r00039`
(`McpHostSession.dispose`) y `x00291` (`dispose` en `external-mcps`). Los tres
niveles están rotos a la vez: el plugin no expone, el activador no retiene, el
host no llama. Arreglar uno solo no produce ninguna mejora observable.

> **Estado de cobertura documental (2026-08-29).** Los 48 hijos declarados en
> `contains.proposals` tienen ya fichero escrito; hasta hoy faltaban 29 y el plan
> afirmaba un cuerpo de trabajo inexistente. Al escribirlos se corrigieron cinco
> premisas mías: `AUD-F02` fallaba por un bug de aserción anterior a `x00258` y no
> por `x00258`; `advise_routing` mide 7.969 B y no 12.157; `v00132` es `AUD-F06`,
> no `AUD-B05`; tres de las cuatro métricas de `AUD-B05` ya estaban propuestas en
> `f00198`/`f00199`; y `mcpv adopt` (`AUD-G04`) y los subpaths del core
> (`AUD-E03`) **ya existían** — prescribí construir lo construido. Todas las
> correcciones están anotadas en su hallazgo de la auditoría.

### S3 — Independientes de P0, en paralelo

- **Status**: done
- **Files**: [`plugins/external-mcps/src/lib/tools`, `tools/scripts/lint/effect-boundaries.script.ts`, `tools/scripts/lint/effect-boundaries.baseline.json`, `package.json`, `.github/workflows/ci.yml`]
- **Gate**: `bun run lint && bun tools/scripts/lint/effect-boundaries.script.ts`


`x00290` (`llmDecidesActivation` conectado al proxy), `x00288` (lint de
fronteras de efectos, ratchet medido en 104 — el 13 publicado contaba sólo
`child_process` con un grep ciego a `require()` dinámico), `x00281` (Biome sobre el monorepo
completo con baseline que sólo baja) y `x00295` (el guard de sondeo compara
literales que no existen en el union: 33 herramientas con efectos se invocan con
entrada vacía).

### S4 — Tokens: atacar el 66% (P1)

- **Status**: done
- **Files**: [`packages/core/src/lib/contracts/constants/token-budgets.constant.ts`, `packages/core/src/lib/surface/bootstrap.ts`, `tools/scripts/report/token-budget-dashboard.script.ts`, `plugins/orchestrator-runner/src/lib/schemas.ts`, `plugins/quality-policy/src`, `plugins/usage-tracking/src`]
- **Gate**: `bun run tokens:gate && bun run tokens:dashboard:check`


`x00283` y `x00284` primero (dashboard y medición honestos, para poder medir el
progreso), luego `v00129` (esquemas compactos por herramienta en core; el envelope
compartido vía `$defs`/`$ref` queda descartado: `v00128` estableció que zod v4 y
el SDK de MCP no deduplican `$ref`, así que no ahorra nada), `v00130`
(`advise_routing` + `invoke`), `v00131` (`quality_policy` + `usage_report`), y
`r00036` (ratchet descendente) para blindar lo ganado.

### S5 — Superficie adaptativa (P1)

- **Status**: done
- **Files**: [`packages/core/src/lib/surface/decide-mode.ts`, `packages/core/src/lib/project/tool-surface-runtime.service.ts`]
- **Gate**: `bun run test -- packages/core/tests/src/lib/surface packages/core/tests/src/lib/project`


`x00285` (decidir el modo leyendo al cliente) y `x00286` (evicción real del
working set, que depende del `dispose` retenido por `r00038`).

### S6 — Seguridad, resto (P1)

- **Status**: pending
- **Files**: [`packages/core/src/lib/dry-run`, `packages/core/src/lib/capabilities`, `packages/core/src/lib/shared/git-write.ts`, `plugins/external-mcps/src/lib/options-schema.ts`]
- **Gate**: `bun run test -- packages/core/tests/src/lib/dry-run plugins/external-mcps && bun run lint:capabilities`


`r00037` (`EffectBroker`: dry-run como prevención), `x00289` (`eager`
expresable), `x00292` (`protectedBranches` obligatorio en la firma).

### S7 — CI y gobernanza, resto (P1)

- **Status**: pending
- **Files**: [`.github/branch-protection.ts`, `tools/scripts/ci/affected.script.ts`, `.github/workflows/tier1.yml`, `docs/mcp-vertex/adr`]
- **Gate**: `bun run test -- tools/tests/ci && bun run lint:proposals`


`x00279` (`defaults` consumidos), `x00282` (mapa workspace→proyecto vitest),
`x00294` (`tools/` entra en el typecheck: 95 errores invisibles hoy),
`d00013` (ADR del modelo de ramas), `x00273` (guard de push a `main`) y
`x00293` (versión única por plugin: 41 de 51 mienten al host).

### S8 — Testing (P1)

- **Status**: pending
- **Files**: [`vitest.config.ts`, `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`]
- **Gate**: `bun run test:coverage`


`t00030` (umbrales apretados + branches ≥80% en los módulos de P0) y `t00031`
(reescribir el e2e de dogfood de `commit-policy`). Acompañan a toda la Ola 1:
los tests de caminos de error suben la cobertura de ramas por sí solos.

### S9 — Plataforma (P2)

- **Status**: pending
- **Files**: [`packages/core/src/public`, `packages/client/src`, `plugins/proposals/src`, `packages/cli/src/commands/groups/doctor.ts`, `extensions/vscode/package.json`, `docs/mcp-vertex/plugins`]
- **Gate**: `bun run validate`


`f00272` (métricas de superficie útil), `f00273` (ranking e histéresis),
`r00035` (desduplicar CI), `r00040` (subpaths del core), `r00041` (fronteras del
cliente), `r00042` (`proposals` como event log), `x00287` (fail-closed),
`v00132` (payload duplicado), `f00274` (activación de la extensión), `f00275`
(`doctor --deep`), `d00014` (docs canónicas).


## Dependency graph

```
x00278 ──► x00277 ──┐
       └──► x00276 ─┴──► d00013 ──► x00273

r00038 ──► t00029
   ├─────► r00039 ──┐
   └─────► x00286   ├──► DoD lifecycle
x00291 ─────────────┘

x00288 ──► r00037 ──► x00292
x00290 ──► x00289

x00283 ──► v00129 ──► v00130 ──► v00131 ──► r00036
x00284 ──┘
f00272 ──► f00273 (ranking necesita medir churn)

x00281 (independiente)   x00282 (independiente)
t00030 acompaña a toda la Ola 1 (los tests de error suben branches solos)
```

## Acceptance

El plan cierra cuando **todo** lo siguiente se cumple sobre el SHA **integrado**
en `develop` (no sobre la rama de trabajo), verificado por comando:

1. `eager` y `lazy` producen semántica idéntica: el test parametrizado por ruta
   (`t00029`) pasa sin ramas condicionales por ruta.
2. Cero fugas: sin runtimes, plugins ni subprocesos huérfanos tras `dispose()`;
   el test de handles activos da 0.
3. `dispose()` se invoca exactamente una vez por activación y es idempotente.
4. `register()` tiene timeout y cancelación probados en **ambas** rutas.
5. `dryRun: true` hace imposible el efecto a través de `ctx.effects`, y el lint
   de fronteras impide el camino directo.
6. `llmDecidesActivation` y `eager` están conectados, probados y documentados.
7. `verify-branch-protection` no puede devolver verde sin haber leído una rama;
   `verify-develop-health` está en verde o en `unverified` explícito.
8. `bun run lint` analiza ≥3.300 ficheros y la baseline sólo baja.
9. `tools/list` del preset `vertex` ≤ 120.000 B y el bootstrap adaptativo
   ≤ 4.500 B, sin pérdida funcional.
10. `TOKEN-BUDGETS.md` no contiene la cadena `(0B)`; los 6 presets gobernados
    declaran techo marginal.
11. `maxWarmPlugins` e `idleTtlMs` cambian comportamiento observable en un test.
12. Cobertura de branches ≥80% en `core/plugins`, `core/dry-run` y `core/project`;
    umbrales globales = medida − 0,5.
13. Cero `it.skip` incondicional sin caducidad declarada.
14. Cero drift de artefactos generados y de versión package/manifest/runtime.
15. `bun run validate` en verde.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| `r00038` toca la ruta de carga de los 51 plugins | El test de equivalencia (`t00029`) se escribe **antes** del refactor y debe fallar contra el código actual en la ruta lazy; sólo entonces se refactoriza |
| `r00039` puede introducir cierres prematuros | `dispose()` respeta `inFlightByPlugin` y drena antes de cerrar; test explícito de invocación en vuelo |
| `x00288` (lint de fronteras) podría bloquear a 13 plugins de golpe | Ratchet: el valor inicial es 13 y sólo puede bajar; ningún plugin existente se rompe, sólo se congela el techo |
| `x00281` (Biome global) podría exigir un PR gigante | Baseline con recuento por regla que sólo puede bajar, igual que `lint:file-conventions` |
| `v00129`–`v00131` cambian la superficie publicada | `outputSchema` es opcional en MCP; se expone bajo demanda por `tool_details` y como recurso. Se publica como cambio menor documentado |
| `x00285` cambia el modo por defecto para algunos hosts | El `reason` se propaga al startup report y a `overview`; el override explícito sigue ganando siempre |
| Otro agente toca `develop` en paralelo | Cada ola se integra por PR con `ci-complete` verde; se revalida el SHA integrado antes de cerrar cada slice |

## Notes

- Auditoría fuente:
  `docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md`
  (2.928 líneas, snapshot `2cf17373`).
- La rama se movió durante la auditoría: el snapshot inicial fue `ff289141` y el
  PR #49 se integró a mitad. Los hallazgos que #49 resolvió (`AUD-A01` drift,
  `AUD-A02`, `AUD-A03`, `AUD-A08`) **no** están en este plan; se conservan en el
  informe sólo como trazabilidad.
- Tres hallazgos de este plan (`AUD-E01`, `AUD-D04`, `AUD-D05`) fueron reportados
  también por revisores externos y **se han reconfirmado línea a línea de forma
  independiente** contra `2cf17373` antes de incluirse. Ninguno se acepta por
  referencia.

### Estado de ejecución y traspaso (2026-08-29)

> Escrito para el siguiente agente. Lo que sigue es **estado verificado contra
> disco y contra CI**, no un resumen de intenciones.

#### Slices cerrados

`S1` gobernanza · `S2` ciclo de vida · `S3` independientes · `S4` tokens ·
`S5` superficie adaptativa. Cada hijo se movió a `done/` sólo después de correr
su gate declarado.

#### Slices abiertos y qué falta exactamente

| Slice | Hijos sin implementar | Nota |
|---|---|---|
| `S6` seguridad | `x00289`, `x00292`, `x00287` | Los tres tienen propuesta escrita con gates ejecutables. `x00292` es el más barato: hacer `protectedBranches` obligatorio en la firma de `gitPush` — el único llamante real ya lo pasa, así que el riesgo es mínimo y el error de compilación **es** la prueba. |
| `S7` CI y gobernanza | `x00282`, `x00293`, `r00035`, `d00013`, `x00273` | `x00281` quedó a `2/3`: su `S2` (arreglar los ~50 errores reales de Biome) sigue `pending` a propósito, es deuda existente, no regresión. |
| `S8` testing | `t00030`, `t00031` | `t00031` lleva una corrección importante en su `why`: el e2e de dogfood **no** falla por `x00258` sino por una aserción que hace `git log` sobre el remoto bare sin argumento de rama. |
| `S9` plataforma | los 14 de Track G | Ninguno empezado. `f00280` y `r00040` están re-alcanzados: lo que la auditoría mandaba construir **ya existía** en parte. |

#### Reglas de casa que ahora son puertas, no costumbres

Se añadieron seis lints esta tanda. Un agente que los ignore verá CI en rojo:

- `type-naming` — todo `type`/`interface` exportado empieza por `I` (ratchet 320).
- `test-unsafe-casts` — nada de `as unknown` nuevo en specs; usar `fakePartial`
  de `@mcp-vertex/test-kit` (ratchet 354).
- `effect-boundaries` — nada de `node:fs`/`child_process`/red directo en plugins
  fuera de adaptadores marcados (ratchet 104).
- `single-frontmatter` — tolerancia cero.
- `biome-baseline` — Biome sobre el monorepo entero, por categoría.
- `file-conventions` — todo módulo lleva sufijo de rol (`.service.ts`,
  `.helper.ts`, `.factory.ts`…).

#### Dos trampas que ya me costaron tiempo

1. **Los techos de tokens sólo bajan.** `token-budget-ceiling-ratchet` exige
   excepción fechada para subir uno. Si una cifra sube, la causa es casi siempre
   que la fila mide otra superficie — ver `x00296`. Añadir una fila nueva con
   techo propio sí vale; subir una existente, no.
2. **`tokens:dashboard:check` antes de regenerar**, nunca después. Al revés
   parece que la puerta está ciega, y no lo está.

#### Método que conviene mantener

Ordenar explícitamente a cada subagente que **verifique la premisa contra el
código y contradiga la auditoría si no se sostiene**. Trece afirmaciones mías
cayeron así en esta ronda, incluidas dos donde cité un comentario obsoleto en
vez de leer el código, y dos donde mandé construir algo que ya existía. Todas
las correcciones están anotadas en su hallazgo dentro del documento de
auditoría.

Y la regla que hubo que imponer por las malas: **un slice está `done` cuando
pasa su gate, no cuando alguien ha escrito que lo está.**

