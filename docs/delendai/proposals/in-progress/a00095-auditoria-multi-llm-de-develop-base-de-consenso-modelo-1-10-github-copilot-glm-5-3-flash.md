---
id: a00095
title: "Auditoría multi-LLM de `develop` — base de consenso (modelo 1/10: GitHub Copilot · GLM 5.3 Flash)"
kind: audit
status: in-progress
type: proposal
track: architecture
date: 2026-10-17
priority: P1
audit-source:
  file: docs/delendai/proposals/in-progress/a00095-17-10-2026-copilot-glm-5-3-flash-auditoria-multi-llm-consenso-10-modelos.md
  snapshot: 2d0f8a5c3bb19bc45d8dee7602a54410ee338119
consensus:
  method: independent-review-then-merge
  target-reviewers: 10
  reviewers-completed: 1
  reviewers:
    - model: glm-5.3-flash
      host: github-copilot
      date: 2026-10-17
      snapshot: 2d0f8a5c3bb19bc45d8dee7602a54410ee338119
      scope: full-repo
  dispute-protocol: |
    Cada revisor añade su sección bajo "## Opiniones de revisores" y edita
    SOLO: (1) su bloque de opinión, (2) el campo `seenBy` de los hallazgos que
    verifique, (3) filas nuevas en "## Hallazgos" si son hallazgos nuevos.
    PROHIBIDO borrar o reescribir el texto de otro revisor. La discrepancia se
    expresa en el propio bloque añadiendo una subsección "Discrepancia con
    <hallazgo-ID>": qué se discrepa, evidencia en contra y propuesta alternativa.
    Un hallazgo con ≥80% de acuerdo (8/10) pasa a "## Consenso"; el resto
    queda en disputa para valoración individual.
---

# a00095 — Auditoría multi-LLM de `develop`: hallazgos base + protocolo de consenso entre 10 modelos

## Goal

Producir una auditoría completa del monorepo DelendAI en `develop` que sea
**complementada de forma independiente por ~10 LLMs distintos**, de modo que:

1. Los hallazgos con acuerdo ≥8/10 se convierten en trabajo obligatorio
   (propuestas concretas que se cumplen fielmente).
2. Los hallazgos en disputa reciben valoración individual con argumentación
   detallada de cada agente y se cierran por consenso explícito.
3. El documento final se entrega a `claude-opus-5-5` (u otro modelo potente)
   como **única fuente** para crear propuestas/slices e implementar.

Este documento es a la vez: (a) la primera auditoría del lote (GLM 5.3 Flash,
2026-10-17), (b) el protocolo que los siguientes 9 revisores deben seguir,
y (c) el libro de actas donde quedan opiniones, discrepancias y consenso.

**Snapshot auditado:** `2d0f8a5c3bb19bc45d8dee7602a54410ee338119` (develop,
2026-10-17). Cada revisor debe registrar su propio snapshot y repetir los
hallazgos contra él antes de suscribirlos.

## Why

El owner quiere decidir con evidencia agregada, no con la opinión de un solo
modelo: 10 auditorías independientes sobre el mismo árbol, un libro de actas
compartido, y solo lo que resiste ≥8/10 se convierte en trabajo obligatorio.
Los hallazgos en disputa reciben valoración individual con la argumentación de
cada agente y se cierran por consenso explícito. El repo ya tiene el hábito de
auditar (a00049–a00094), pero siempre de un solo revisor; lo que falta es el
mecanismo de contraste entre revisores distintos, y este documento lo
establece sin tocar código.

Reglas de edición para todos los revisores:

- Cada revisor añade su bloque H3 bajo `Notes → Opiniones de revisores` y
  edita SOLO: (1) su bloque, (2) el `seenBy` de los hallazgos que verifique,
  (3) filas nuevas en Findings/Scoreboard si aporta hallazgos nuevos.
- PROHIBIDO borrar o reescribir el texto de otro revisor; los conflictos de
  merge se resuelven conservando ambas aportaciones.
- La discrepancia se escribe en el propio bloque como "Discrepancia con Gxx":
  qué se discrepa, evidencia en contra, propuesta alternativa.

## Non-goals

- No implementa nada: este documento no toca código; las correcciones nacen
  como propuestas hijas creadas por el modelo implementador final.
- No reabre auditorías cerradas (a00049–a00094): sus hallazgos ya tienen
  dueño; aquí solo se citan como precedentes.
- No decide decisiones de producto (G18): las documenta para que el consenso
  y el owner decidan.
- No duplica x00909 (in-progress): ese arregla defectos ya confirmados por
  auditorías externas de hoy; este documento es una pasada nueva e
  independiente.

## Slices

- global_gate: type

### S1 — Auditoría base (glm-5.3-flash, modelo 1/10)

- **Status**: done
- **Files**: [este documento]
- **Gate**: `bun run lint:proposals` sin errores para este fichero; hallazgos
  G1–G18 con evidencia archivo:línea contra el snapshot del Goal.

### S2..S9 — Un slice por revisor adicional (modelos 2–9)

- **Status**: pending
- **Files**: [este documento]
- **Gate**: cada revisor reproduce G1–G18 contra su propio snapshot,
  actualiza `seenBy` o abre discrepancia, añade sus hallazgos nuevos y su
  bloque de opinión. Entrega por PR a develop
  (`audit: a00095 review <modelo>`).

### S10 — Cierre de consenso (revisor 10)

- **Status**: pending
- **Files**: [este documento]
- **Gate**: tabla de consenso (≥8/10) rellenada; disputas con las posiciones
  de todos los implicados; `reviewers-completed: 10` en frontmatter.

### S11 — Entrega al modelo implementador (fuera de este documento)

- **Status**: pending
- **Files**: [propuestas hijas]
- **Gate**: claude-opus-5-5 recibe este documento como entrada única y crea
  las propuestas/slices; no reabre el consenso.

## Acceptance

1. El documento acumula ≥10 bloques de revisor con snapshot propio.
2. Todo hallazgo tiene `seenBy` actualizado por cada revisor que lo verificó,
   o una discrepancia argumentada en el bloque del revisor.
3. El Scoreboard lista cada hallazgo con su nivel de acuerdo y su estado
   (abierto / CONSENSO / DISPUTA).
4. Las disputas recogen cada desacuerdo con la argumentación de todos los
   revisores implicados.
5. Ningún revisor borra ni reescribe texto de otro (diff revisable por PR).
6. `bun run lint:proposals` pasa con este fichero presente.

## Verified State

| Métrica | Valor |
|---|---|
| LOC TypeScript (packages+plugins+extensions+apps+tools+scripts) | 106.858 |
| Paquetes | 12 |
| Plugins | 61 |
| Archivos `*.spec.ts` (packages+plugins) | 1.778 |
| Specs solo en plugins/proposals | 292 |
| CI en develop | verde (`tests: core/packages/apps/tools` success) |
| PRs fusionados solo el 2026-10-17 | 5 (:#1175–#1181) |
| Propuestas: in-progress / ready / done / retired | 2 / 1 / 14+ / 48 |
| Backlog blocked / paused / review | 0 / 0 / 0 |
| Superficie MCP cargada | 256 tools (7 visibles, 249 ocultos por modo managed) |
| Plan P0 ready (`q00011`) | 8/9 slices done; queda S9 (P2) |
| Token budgets | `auto_work` work plan 2.433 B sobre warning 2.400; dogfood marginal 79.900 B |
| Limpieza de cola | unidades huérfanas retiradas activamente (`work reap --apply`: 1 delivered, 1 idle) |

## Findings

> Convención por hallazgo: **ID**, título, `CONFIRMADO|PROBABLE|REVISAR|MEJORA`,
> zona, evidencia (archivo:línea), y **`seenBy:`** lista de revisores que lo
> verificaron. Un revisor nuevo añade su modelo a `seenBy` tras verificar, o
> abre "Discrepancia" en su bloque si no lo confirma.

### G1 — `process.cwd()` en librería core
- Clasificación: `CONFIRMADO` · Zona: core
- Evidencia: `packages/core/src/lib/tools/shell-status.tool.ts:195` construye
  `InstallSuggestionsService` con el cwd implícito en una ruta de tool
  reutilizable.
- Violación de la propia regla hermética (no depender del cwd implícito).
- seenBy: glm-5.3-flash, claude-opus-5-5

### G2 — Monolito en `plugins/proposals`
- Clasificación: `CONFIRMADO` · Zona: proposals
- Evidencia: 144.184 LOC de plugin. Archivos >800 LOC:
  `lib/tools/authoring.tool.ts` (3.014), `lib/tools/proposal-transition.tool.ts`
  (2.223), `src/index.ts` (1.449), `lib/tools/auto-work.tool.ts` (1.423),
  `lib/proposals/sync-proposal-registry.ts` (1.335),
  `generated/tool-outputs.ts` (1.290), `lib/agents/persistent-task-queue.ts`
  (894), `lib/tools/continue-proposal.tool.ts` (879),
  `lib/agents/task-queue-engine.ts` (864), `lib/tools/recovery-tools.ts` (843).
- Deuda SRP: cada cambio ahí es el merge-conflict y el punto ciego de revisión.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G3 — Engines de coordinación con cobertura delgada
- Clasificación: `CONFIRMADO` · Zona: proposals/tests
- Evidencia: `lib/shared/swarm-hygiene-engine.ts` 509 LOC / 1 spec;
  `lib/shared/branch-gc-engine.ts` 481 / 1; `lib/shared/branch-status-engine.ts`
  460 / 2; `lib/agents/agent-worktree-engine.ts` 362 / 2. Son los motores que
  coordinan agentes concurrentes.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G4 — Presión de presupuesto de tokens
- Clasificación: `CONFIRMADO` · Zona: surface/token-budgets
- Evidencia: `docs/delendai/TOKEN-BUDGETS.md`: `auto_work` work plan 2.433 B
  sobre warning 2.400 (hard 2.600); preset `dogfood` acumula 79.900 B
  marginales de un solo plugin; `standard` marca un plugin sobre warning
  (10.929 B). 256 tools cargados, 249 ocultos: la capa de proceso pesa más
  que la de producto.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G5 — Rebrand incompleto (`mcp-vertex` residual)
- Clasificación: `CONFIRMADO` · Zona: docs
- Evidencia: `CHANGELOG.md` con 22 menciones a `@mcp-vertex/*` y referencia a
  `docs/mcp-vertex/NPM_PUBLISH.md`; varias auditorías cerradas tituladas
  "MCP Vertex"; el README del directorio de auditorías aún dice
  "Audits — `@mcp-vertex/core`".
- seenBy: glm-5.3-flash

### G6 — Paquetes/plugins a medio hacer o sin documentar
- Clasificación: `CONFIRMADO` · Zona: packaging/docs
- Evidencia: `packages/roadmap-sqlite` (333 LOC, 1 spec, sin README);
  sin README: `contracts`, `proposals-sqlite`, `state-sqlite`, `test-kit`,
  `ui-extension`; `plugins/self-learning` (1.299 LOC, 5 specs, sin README);
  `plugins/skills-pack` (312 LOC/1 spec); `plugins/tech-debt` (308 LOC/1 spec).
- seenBy: glm-5.3-flash, claude-opus-5-5

### G7 — Shim Go con tests stale
- Clasificación: `CONFIRMADO` · Zona: bin
- Evidencia: `bin/delendai-shim/main_test.go:23,35` prueba `findCLIEntryFrom`
  pero `main.go:86` solo define `findCLIEntry`. Si no hay otro archivo Go en el
  paquete, la suite no compila. Cobertura trivial: no prueba forwarding de
  stdio, exit code ni ausencia de bun.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G8 — i18n incompleto en web y ui-extension
- Clasificación: `CONFIRMADO` · Zona: apps/web, ui-extension
- Evidencia: fallback silencioso a inglés para 10 idiomas en
  `apps/web/src/i18n/extend.ts:143-154`; strings visibles hardcoded en inglés
  fuera del diccionario en `apps/web/src/pages/[lang]/cli.astro:40,45,50,72,85`;
  copy inglés hardcoded en `packages/ui-extension/src/configuration-center/
  configuration-center-model.ts:21,23` y `packages/ui-extension/src/
  kpi-dashboard.ts:746,758`.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G9 — Fuente de verdad del logo incoherente
- Clasificación: `CONFIRMADO` · Zona: brand
- Evidencia: `apps/shared/README.md:17` declara `apps/shared/brand` como fuente
  de verdad, pero la web sirve `apps/web/public/logo.svg`
  (`apps/web/src/layouts/Base.astro:82`, `Home.astro:48`, `NotFound.astro:23`)
  y la extensión sincroniza desde ahí (`extensions/vscode/scripts/sync-logo.ts:11-12`).
  Existen dos `logo.svg`; `apps/shared/brand` no es el origen operativo.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G10 — Duplicación estructural github/gitlab
- Clasificación: `CONFIRMADO` · Zona: plugins
- Evidencia: sin imports cruzados; shapes paralelas alrededor de
  cliente/config/diagnostics/mutations/write-tools (`plugins/github/src/lib/
  tools/catalog.ts` vs `plugins/gitlab/src/lib/tools/shared.ts`). No es copia
  literal pero sí doble mantenimiento.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G11 — Validación de webview inconsistente
- Clasificación: `PROBABLE` · Zona: extensions/vscode
- Evidencia: dashboard/configuration-center/agent-catalog/KPI usan `safeParse`
  (`open-dashboard.ts:249`, `open-configuration-center.ts:231`,
  `open-agent-catalog.ts:148`, `dashboard-webview-view-provider.ts:334`,
  `kpi-dashboard-provider.ts:882`), pero Knowledge valida a mano
  (`open-knowledge.ts:48,52`).
- seenBy: glm-5.3-flash, claude-opus-5-5

### G12 — CI lento y evaluación redundante de módulos
- Clasificación: `CONFIRMADO` · Zona: CI
- Evidencia: run de PR ~16 min; Vitest reporta que el proyecto `proposals`
  evalúa 1.524 módulos 151.382 veces (111,56 s, 31% del tiempo trackeado) y
  estima ~11,48 s ahorrables por worker con `isolate:false`.
- seenBy: glm-5.3-flash

### G13 — Legacy vivo sin fecha de extinción
- Clasificación: `MEJORA` · Zona: rules
- Evidencia: `buildRulesManifest` sigue en
  `plugins/rules/src/lib/frameworks/manifest.ts` como camino secundario; los
  tools ya consumen `buildManifestViaComposition` (`rules-tools.ts:12,97`,
  `index.ts:7,120`). Falta plan de retirada.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G14 — Deuda de tooling: cwd orientado a repo-root y 2 JS sueltos
- Clasificación: `MEJORA` · Zona: tools/scripts
- Evidencia: `process.cwd()` como repo-root en
  `tools/scripts/gen/quantitative.script.ts:31`,
  `tools/scripts/build/stable-manifest.script.ts:29`,
  `tools/scripts/i18n/translate-tutorials.script.ts:23`; ficheros JS/MJS
  (`tools/scripts/build/stable-manifest.script.js`, su `.spec.js`, y
  `tools/scripts/lib/zod-default-resolver.mjs`) frente a la convención TS.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G15 — Escritura-atómica y concurrencia: sin hallazgo
- Clasificación: `CONFIRMADO` (negativo) · Zona: proposals
- Evidencia: escrituras duras vía `withFileMutex`+`writeFileAtomic`
  (`persistent-task-queue.ts:424,449`; `sync-proposal-registry.ts:1252,1309`;
  `locks/engine.ts:152`). Property-tests de la state machine (t00008, t00013).
  Se registra como punto fuerte para que los siguientes revisores lo ataquen.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G16 — Seguridad: sin hallazgo en el barrido
- Clasificación: `CONFIRMADO` (negativo) · Zona: seguridad
- Evidencia: sin `eval`/`new Function`/`http://` inseguro/secretos hardcoded en
  source; `child_process` acotado a tooling; hardening explícito de secretos y
  symlinks en `packages/client/src/node/services/configuration-center.service.ts:28,54,69`.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G17 — Deactivate de la extensión VS Code: sin hallazgo
- Clasificación: `CONFIRMADO` (negativo) · Zona: extensions/vscode
- Evidencia: runtime handle con disposables drenados por `disposeAll`
  (`extension.ts:501,987,990`); sin `import vscode` fuera de la extensión; sin
  `process.cwd()` en ella.
- seenBy: glm-5.3-flash, claude-opus-5-5

### G18 — Prioridad estratégica: la maquinaria crece más que el producto
- Clasificación: `REVISAR` (decisión de producto) · Zona: estrategia
- Evidencia: `proposals` (144k LOC) es el 135% del core (14k). Batuta (f00551)
  es la primera feature con valor fuera del bucle de dogfooding (S0 done,
  S1a en review, S1–S8 pendientes). Propuesta: adelgazar `proposals` y aterrizar
  Batuta antes que añadir más proceso.
- seenBy: glm-5.3-flash

### G19 — Un texto empalmado en un documento se leía como patrón de reemplazo
- Clasificación: `CONFIRMADO` (corregido en x00909 S7, #1181) · Zona: proposals, core, tooling
- Evidencia: `plugins/proposals/src/lib/tools/authoring.tool.ts` reescribía la slice con `md.replace(blockRe, `${m[1]}${block}`)`; la nota de un revisor que citaba un patrón terminado en `$'` recibió el resto del documento (S5 de f00761 duplicado, nota truncada; #1173 bloqueado por aprobaciones copiadas). 19 sitios más con el mismo patrón; ahora `lint:no-interpolated-replacement` lo impide.
- seenBy: claude-opus-5-5

### G20 — Cada subagente delegado recibía la orden de no usar ninguna herramienta
- Clasificación: `CONFIRMADO` (corregido en x00909 S3, #1181) · Zona: agent-orchestrator
- Evidencia: `plugins/agent-orchestrator/src/index.ts` compilaba toda delegación con `allowedTools: []`, y `renderDelegationPrompt` lo traduce a "Use no tool beyond reading": también al implementador. Ahora las herramientas salen del perfil de core de su rol; el contexto que falta se nombra en `missingContext`.
- seenBy: claude-opus-5-5

### G21 — La confirmación de gasto no podía darse nunca
- Clasificación: `CONFIRMADO` (corregido en f00551 S6, pendiente de merge) · Zona: orchestrator-runner
- Evidencia: `plugins/orchestrator-runner/src/lib/invoke/token.ts` documenta una puerta conectada a la elicitación MCP; nada la conectaba y `denyAllConfirmationGate` rechazaba todo gasto con `confirmBeforeExecute: true` (por defecto).
- seenBy: claude-opus-5-5

### G22 — La descripción de cada herramienta existe dos veces
- Clasificación: `CONFIRMADO` · Zona: apps/web
- Evidencia: `apps/web/src/i18n/tools/**` repite en `en` la descripción que registra cada herramienta, sin ninguna comprobación de deriva; al cambiar dos herramientas del runner la web siguió describiendo el comportamiento anterior. Propuesto en x00910 S2.
- seenBy: claude-opus-5-5

### G23 — La web publicaba datos que nadie produce
- Clasificación: `CONFIRMADO` (corregido en x00910 S3) · Zona: apps/web
- Evidencia: `apps/web/src/data/token-roi.json` (`top: []`, 2026-08-30) y `token-budget.json` (muestra) sin ninguna página que los lea; una auditoría externa los tomó por métricas del producto.
- seenBy: claude-opus-5-5

### G24 — El cargador SQLite multi-runtime existe tres veces
- Clasificación: `CONFIRMADO` · Zona: state-telemetry, proposals-sqlite
- Evidencia: `packages/proposals-sqlite/src/lib/bun-sqlite.helper.ts` cae a `node:sqlite`; `packages/state-telemetry/src/lib/eta/duration-history.ts` y `events/work-event-store.sqlite.ts` tienen copias solo-Bun (la telemetría muere en Node). Propuesto en x00910 S4.
- seenBy: claude-opus-5-5

### G25 — Las CLI de proveedores heredaban todo el entorno del servidor
- Clasificación: `CONFIRMADO` (corregido para cuentas en f00551 S3; pendiente para entradas sin cuenta en x00910 S5) · Zona: orchestrator-runner
- Evidencia: `invoke/build-manager.ts` lanzaba `spawn` sin `env`, así que un worker leía cada credencial del servidor y una API key heredada se imponía al login de suscripción.
- seenBy: claude-opus-5-5

### G26 — Dos lints comprueban el mismo hecho con dos baselines
- Clasificación: `CONFIRMADO` · Zona: tools/scripts/lint
- Evidencia: `proposal-files-exist` y `proposal-slice-completeness` verifican ambos que un fichero declarado existe, cada uno con su baseline; retirar un fichero que listaba una propuesta cerrada exige actualizar los dos (x00910 S3).
- seenBy: claude-opus-5-5

### G27 — Un host server de larga vida aplica las reglas con las que arrancó
- Clasificación: `CONFIRMADO` · Zona: core
- Evidencia: el servidor de esta sesión arrancó cinco horas antes de que x00908 llegara a develop, y retirar f00639 desde `paused` no publicó hasta hacerlo a mano; nada en sus respuestas dice que el código que ejecuta está atrasado. Propuesto en x00910 S8.
- seenBy: claude-opus-5-5

### G28 — `bun test` juzgaba specs de vitest
- Clasificación: `CONFIRMADO` (corregido en x00909 S6, #1181) · Zona: tooling
- Evidencia: gemini-3.8-flash (#1172) obtuvo falsos fallos de `vi.waitFor` bajo el runner de Bun; ahora `bun test` rechaza cualquier spec fuera de `BUN_OWNED_SPECS` con el comando correcto.
- seenBy: claude-opus-5-5

### G29 — El esquema de una entrada de proveedor existía dos veces
- Clasificación: `CONFIRMADO` (corregido en f00551 S1, #1177) · Zona: core, orchestrator-runner
- Evidencia: `plugins/orchestrator-runner/src/lib/options.ts` duplicaba `PROVIDER_ENTRY_SCHEMA` de core; ahora el runner importa el de `@delendai/core/contracts`.
- seenBy: claude-opus-5-5

## Scoreboard

| ID | Hallazgo | Acuerdo | Estado |
|---|---|---|---|
| G1 | process.cwd() en core | 2/10 | abierto |
| G2 | monolito proposals | 2/10 | abierto |
| G3 | cobertura delgada en engines | 2/10 | abierto |
| G4 | presión token budgets | 2/10 | abierto |
| G5 | rebrand incompleto | 1/10 | abierto |
| G6 | paquetes a medias / sin README | 2/10 | abierto |
| G7 | shim Go tests stale | 2/10 | abierto |
| G8 | i18n incompleto | 2/10 | abierto |
| G9 | logo fuente de verdad incoherente | 2/10 | abierto |
| G10 | duplicación github/gitlab | 2/10 | abierto |
| G11 | webview validación inconsistente | 2/10 | abierto |
| G12 | CI lento / isolate | 1/10 | abierto |
| G13 | legacy rules sin retirada | 2/10 | abierto |
| G14 | tooling cwd + JS suelto | 2/10 | abierto |
| G15 | concurrencia correcta (negativo) | 2/10 | abierto |
| G16 | seguridad limpia (negativo) | 2/10 | abierto |
| G17 | deactivate correcto (negativo) | 2/10 | abierto |
| G18 | proceso > producto (REVISAR) | 1/10 | abierto |
| G19 | reemplazo interpolado ($') | 1/10 | corregido |
| G20 | delegación sin herramientas | 1/10 | corregido |
| G21 | confirmación de gasto imposible | 1/10 | en merge |
| G22 | descripciones duplicadas web/runtime | 1/10 | abierto |
| G23 | datos web muertos | 1/10 | corregido |
| G24 | cargador SQLite triplicado | 1/10 | abierto |
| G25 | entorno heredado por workers | 1/10 | parcial |
| G26 | dos lints, un hecho | 1/10 | abierto |
| G27 | servidor obsoleto silencioso | 1/10 | abierto |
| G28 | bun test sobre specs vitest | 1/10 | corregido |
| G29 | esquema de proveedor duplicado | 1/10 | corregido |

> Un hallazgo pasa a **CONSENSO** con ≥8/10; con desacuerdo sostenido pasa a **DISPUTA**.

### Puntos fuertes a preservar (para que los revisores discrepen si no están de acuerdo)

1. Presupuestos de tokens **gateados** (no documentados): techos hard/warning
   por superficie y fixture-gates.
2. Revisión cruzada obligatoria (`implementer ≠ reviewer`).
3. Suites adversariales de privacidad (t00005, t00009, t00011) y property tests
   de concurrencia (t00008, t00013).
4. CapabilityResolver con razones terminales tipadas + single-flight
   (`packages/core/src/lib/dispatch/`), verificado en vivo (7/256 visibles).
5. Higiene de cola real: `work retire` de unidades huérfanas, ratchets
   anti-drift, gates movidos al sitio correcto tras auditorías previas
   (a00049–a00094).

## Notes

### Opiniones de revisores

> Cada revisor añade EXACTAMENTE UN bloque `### <modelo> (<host>, <fecha>)`
> con: (1) su valoración global, (2) hallazgos que suscribe (`seenBy` ya
> actualizado arriba), (3) discrepancias argumentadas con evidencia, (4)
> hallazgos nuevos suyos (añadirlos también arriba con ID nuevo Gxx).

### glm-5.3-flash (GitHub Copilot, 2026-10-17)

**Valoración global:** proyecto real, vivo y con un rigor inusual para su
etapa; su rasgo diferencial es el dogfooding multi-agente que funciona (la cola
drena trabajo de verdad). Riesgo principal: peso — `proposals` crece más que
el producto.

**Suscribe:** G1–G14, G18. Confirma los negativos G15–G17 tal cual los midió.

**Discrepancias:** ninguna de entrada; deja abiertas para los siguientes
revisores: (a) si `isolate:false` en Vitest es seguro para la semántica de
tests de `proposals` (G12), (b) si `roadmap-sqlite` debe retirarse o
completarse (G6), (c) si la duplicación github/gitlab debe unificarse con un
motor compartido o dejarse como implementaciones independientes por aislamiento
de proveedor (G10).

**Hallazgos nuevos propios:** ninguno más allá de los listados.

### claude-opus-5-5 (Claude Code, 2026-10-17)

**Snapshot:** `478355d2346e19504b716852f6e20570edfed9f0` (develop). Cada hallazgo de glm se reprodujo con lectura directa del código en ese árbol.

**Valoración global:** coincido en que el rigor es inusual y en que el riesgo es el peso del proceso. Añado un matiz que la jornada de hoy hace visible: la maquinaria no solo pesa, también falla de formas que solo se ven con un enjambre real (G19, G27), y cuando falla, los agentes la reparan a mano en vez de que el sistema lo impida. El valor de las auditorías está en convertir cada reparación manual en una regla que se cumple sola.

**Suscribe:** G1–G4, G6–G11, G13–G17 (seenBy actualizado). G1: `shell-status.tool.ts:195` pasa `process.cwd()` como `workspaceRoot`. G7: `main_test.go:23,35` llama a `findCLIEntryFrom`, que `main.go` no define. G9: tres `logo.svg` (`apps/shared/brand`, `apps/web/public`, `extensions/vscode/media`).

**Discrepancia con G5:** el CHANGELOG conserva `@mcp-vertex/*` en las entradas de las versiones que se publicaron con ese nombre: es historia, y reescribirla haría mentir al registro de lo publicado. Suscribo la parte viva (README del directorio de auditorías, títulos que aún presentan el producto como MCP Vertex) y propongo excluir del hallazgo las entradas históricas del CHANGELOG.

**Discrepancia con G12:** `isolate:false` no es una optimización neutral para `proposals`: sus módulos guardan estado de módulo (cachés, contadores, registros de herramientas) que hoy cada fichero de spec recibe limpio. Sin aislamiento, el orden de ejecución pasa a decidir resultados, la misma clase de fallo que G28 acaba de eliminar. Propongo medirlo por proyecto con una ejecución en orden aleatorio repetida antes de activarlo, y empezar por proyectos sin estado de módulo.

**Discrepancia parcial con G18:** suscribo adelgazar `proposals` (G2), pero la premisa de Batuta está desfasada: hoy f00551 tiene S1–S6 implementadas (registro de cuentas, consentimiento, aislamiento de entorno, reservas de cuota, diario de invocaciones, herramienta `accounts`, confirmación de gasto); faltan las verificaciones con cuentas reales, que esperan el consentimiento del owner. Y parte del trabajo de proceso de hoy corrigió defectos que dañaban documentos reales (G19), así que no lo trataría como peso muerto.

**Hallazgos nuevos:** G19–G29 (arriba, con evidencia). Seis ya están corregidos en develop o en merge (G19, G20, G21, G23, G28, G29); los demás tienen slice en x00910.

### Consenso (hallazgos ≥8/10 — se rellena al cerrar las 10 auditorías)

| ID | Título | Acuerdo | Decisión |
|---|---|---|---|
| — | pendiente de 10/10 revisores | — | — |

### Disputas abiertas (valoración individual pendiente)

| ID | Disputan | Resumen de posiciones |
|---|---|---|
| — | — | — |

### Contrato de cierre (aceptación del documento final)

1. El documento acumula ≥10 bloques de revisor con snapshot propio.
2. Todo hallazgo tiene `seenBy` actualizado por cada revisor que lo verificó,
   o una discrepancia argumentada en el bloque del revisor.
3. La tabla "Consenso" lista cada hallazgo con ≥8/10 y su decisión.
4. La tabla "Disputas abiertas" recoge cada desacuerdo con las posiciones de
   todos los revisores implicados y su argumentación.
5. Ningún revisor borra ni reescribe texto de otro (diff revisable por PR).
6. El documento final se entrega a claude-opus-5-5 como entrada única para
   crear propuestas/slices; el modelo implementador no reabre el consenso.

### Riesgos del método

- Revisores que copien hallazgos sin verificarlos inflarían el acuerdo; por eso
  `seenBy` exige verificación contra snapshot propio.
- El merge por PR puede generar conflictos en este mismo fichero; se resuelven
  conservando ambas aportaciones (nunca eliminando la del otro).
- Deriva de scope: los revisores deben auditar, no rediseñar; las ideas de
  evolución van como `REVISAR`/`IDEA`, nunca como bug.

### Flujo previsto

- Flujo previsto por el owner: 10 auditorías independientes → este documento
  compartido como libro de actas → consenso ≥8/10 → implementación única por
  claude-opus-5-5.
- Este es el modelo 1/10 del lote; el prompt para los siguientes revisores se
  deriva de la sección "Protocolo para el siguiente revisor" que sigue.

### Protocolo para el siguiente revisor (resumen ejecutable)

1. `git rev-parse HEAD` y registrar tu snapshot en el frontmatter
   (`consensus.reviewers[]`) y en tu bloque.
2. Reproducir cada hallazgo G1–G18 contra tu snapshot; actualizar `seenBy`
   (add tu modelo) si lo confirmas; si no, abrir "Discrepancia con Gxx" en tu
   bloque con evidencia en contra.
3. Añadir tus hallazgos nuevos con ID Gxx+1, clasificación y evidencia
   archivo:línea.
4. Añadir tu bloque de opinión; no tocar texto de otros.
5. Si eres el revisor 10: rellenar "Consenso" (≥8/10) y "Disputas abiertas".
6. Entregar por PR a develop; título del PR: `audit: a00095 review <tu-modelo>`.
