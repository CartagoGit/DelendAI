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
  reviewers-completed: 6
  reviewers:
    - model: glm-5.3-flash
      host: github-copilot
      date: 2026-10-17
      snapshot: 2d0f8a5c3bb19bc45d8dee7602a54410ee338119
      scope: full-repo
    - model: claude-opus-5-5
      host: claude-code
      date: 2026-10-18
      snapshot: 434ba3c3732f
      scope: full-repo
    - model: gemini-3.8-flash
      host: github-copilot
      date: 2026-10-18
      snapshot: fd0824761448cced4b2422983aaf72f9e5d9da62
      scope: full-repo
    - model: qwen-3.8-max
      host: github-copilot
      date: 2026-10-18
      snapshot: cbefecaa356ea54c4076f78a4a93b0e0e9893001
      scope: full-repo
    - model: glm-5.3-flash
      host: github-copilot
      date: 2026-10-19
      snapshot: 514758e783620c8953079be4d71fceccacb3de8b
      scope: full-repo-2nd-pass
    - model: qwen-3.8-flash
      host: github-copilot
      date: 2026-10-19
      snapshot: 514758e783620c8953079be4d71fceccacb3de8b
      scope: independent-forensic
      report: docs/delendai/evidence/a00095-review-qwen-3.8-flash-independent-audit-514758e78.md
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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G2 — Monolito en `plugins/proposals`
- Clasificación: `CONFIRMADO` · Zona: proposals
- Re-medición 2ª pasada (snapshot 514758e78, src sin specs): plugins/proposals
  65.094 LOC vs packages/core 121.013 — el "135% del core" original no se
  reproduce; el hecho estructural (monolito) sí (ver G43).
- Evidencia: 144.184 LOC de plugin. Archivos >800 LOC:
  `lib/tools/authoring.tool.ts` (3.014), `lib/tools/proposal-transition.tool.ts`
  (2.223), `src/index.ts` (1.449), `lib/tools/auto-work.tool.ts` (1.423),
  `lib/proposals/sync-proposal-registry.ts` (1.335),
  `generated/tool-outputs.ts` (1.290), `lib/agents/persistent-task-queue.ts`
  (894), `lib/tools/continue-proposal.tool.ts` (879),
  `lib/agents/task-queue-engine.ts` (864), `lib/tools/recovery-tools.ts` (843).
- Deuda SRP: cada cambio ahí es el merge-conflict y el punto ciego de revisión.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G3 — Engines de coordinación con cobertura delgada
- Clasificación: `CONFIRMADO` · Zona: proposals/tests
- Evidencia: `lib/shared/swarm-hygiene-engine.ts` 509 LOC / 1 spec;
  `lib/shared/branch-gc-engine.ts` 481 / 1; `lib/shared/branch-status-engine.ts`
  460 / 2; `lib/agents/agent-worktree-engine.ts` 362 / 2. Son los motores que
  coordinan agentes concurrentes.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G4 — Presión de presupuesto de tokens
- Clasificación: `CONFIRMADO` · Zona: surface/token-budgets
- Evidencia: `docs/delendai/TOKEN-BUDGETS.md`: `auto_work` work plan 2.433 B
  sobre warning 2.400 (hard 2.600); preset `dogfood` acumula 79.900 B
  marginales de un solo plugin; `standard` marca un plugin sobre warning
  (10.929 B). 256 tools cargados, 249 ocultos: la capa de proceso pesa más
  que la de producto.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G5 — Rebrand incompleto (`mcp-vertex` residual)
- Clasificación: `CONFIRMADO` · Zona: docs
- Evidencia: `CHANGELOG.md` con 22 menciones a `@mcp-vertex/*` y referencia a
  `docs/mcp-vertex/NPM_PUBLISH.md`; varias auditorías cerradas tituladas
  "MCP Vertex"; el README del directorio de auditorías aún dice
  "Audits — `@mcp-vertex/core`".
- seenBy: glm-5.3-flash, qwen-3.8-max (solo la parte viva; suscribo la Discrepancia de claude-opus-5-5 sobre el CHANGELOG histórico)

### G6 — Paquetes/plugins a medio hacer o sin documentar
- Clasificación: `CONFIRMADO` · Zona: packaging/docs
- Evidencia: `packages/roadmap-sqlite` (333 LOC, 1 spec, sin README);
  sin README: `contracts`, `proposals-sqlite`, `state-sqlite`, `test-kit`,
  `ui-extension`; `plugins/self-learning` (1.299 LOC, 5 specs, sin README);
  `plugins/skills-pack` (312 LOC/1 spec); `plugins/tech-debt` (308 LOC/1 spec).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G7 — Shim Go con tests stale
- Clasificación: `CONFIRMADO` · Zona: bin
- Evidencia: `bin/delendai-shim/main_test.go:23,35` prueba `findCLIEntryFrom`
  pero `main.go:86` solo define `findCLIEntry`. Si no hay otro archivo Go en el
  paquete, la suite no compila. Cobertura trivial: no prueba forwarding de
  stdio, exit code ni ausencia de bun.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G8 — i18n incompleto en web y ui-extension
- Clasificación: `CONFIRMADO` · Zona: apps/web, ui-extension
- Evidencia: fallback silencioso a inglés para 10 idiomas en
  `apps/web/src/i18n/extend.ts:143-154`; strings visibles hardcoded en inglés
  fuera del diccionario en `apps/web/src/pages/[lang]/cli.astro:40,45,50,72,85`;
  copy inglés hardcoded en `packages/ui-extension/src/configuration-center/
  configuration-center-model.ts:21,23` y `packages/ui-extension/src/
  kpi-dashboard.ts:746,758`.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G9 — Fuente de verdad del logo incoherente
- Clasificación: `CONFIRMADO` · Zona: brand
- Evidencia: `apps/shared/README.md:17` declara `apps/shared/brand` como fuente
  de verdad, pero la web sirve `apps/web/public/logo.svg`
  (`apps/web/src/layouts/Base.astro:82`, `Home.astro:48`, `NotFound.astro:23`)
  y la extensión sincroniza desde ahí (`extensions/vscode/scripts/sync-logo.ts:11-12`).
  Existen dos `logo.svg`; `apps/shared/brand` no es el origen operativo.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G10 — Duplicación estructural github/gitlab
- Clasificación: `CONFIRMADO` · Zona: plugins
- Evidencia: sin imports cruzados; shapes paralelas alrededor de
  cliente/config/diagnostics/mutations/write-tools (`plugins/github/src/lib/
  tools/catalog.ts` vs `plugins/gitlab/src/lib/tools/shared.ts`). No es copia
  literal pero sí doble mantenimiento.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G11 — Validación de webview inconsistente
- Clasificación: `PROBABLE` · Zona: extensions/vscode
- Evidencia: dashboard/configuration-center/agent-catalog/KPI usan `safeParse`
  (`open-dashboard.ts:249`, `open-configuration-center.ts:231`,
  `open-agent-catalog.ts:148`, `dashboard-webview-view-provider.ts:334`,
  `kpi-dashboard-provider.ts:882`), pero Knowledge valida a mano
  (`open-knowledge.ts:48,52`).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G14 — Deuda de tooling: cwd orientado a repo-root y 2 JS sueltos
- Clasificación: `MEJORA` · Zona: tools/scripts
- Evidencia: `process.cwd()` como repo-root en
  `tools/scripts/gen/quantitative.script.ts:31`,
  `tools/scripts/build/stable-manifest.script.ts:29`,
  `tools/scripts/i18n/translate-tutorials.script.ts:23`; ficheros JS/MJS
  (`tools/scripts/build/stable-manifest.script.js`, su `.spec.js`, y
  `tools/scripts/lib/zod-default-resolver.mjs`) frente a la convención TS.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G15 — Escritura-atómica y concurrencia: sin hallazgo
- Clasificación: `CONFIRMADO` (negativo) · Zona: proposals
- Evidencia: escrituras duras vía `withFileMutex`+`writeFileAtomic`
  (`persistent-task-queue.ts:424,449`; `sync-proposal-registry.ts:1252,1309`;
  `locks/engine.ts:152`). Property-tests de la state machine (t00008, t00013).
  Se registra como punto fuerte para que los siguientes revisores lo ataquen.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G16 — Seguridad: sin hallazgo en el barrido
- Clasificación: `CONFIRMADO` (negativo) · Zona: seguridad
- Evidencia: sin `eval`/`new Function`/`http://` inseguro/secretos hardcoded en
  source; `child_process` acotado a tooling; hardening explícito de secretos y
  symlinks en `packages/client/src/node/services/configuration-center.service.ts:28,54,69`.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (con un matiz menor: hay un `new Function` intencional y documentado en `load-plugins.ts:135`; ver mi bloque de opinión), qwen-3.8-flash (verifico: existe exactamente un `new Function` en `packages/core/src/lib/plugins/load-plugins.ts:135` (`nodeDynamicImport`, specifier validado, estándar de loader); el negativo se sostiene con esa nota, y un literal «0 new Function» es inexacto y lo marcará cualquier SAST).

### G17 — Deactivate de la extensión VS Code: sin hallazgo
- Clasificación: `CONFIRMADO` (negativo) · Zona: extensions/vscode
- Evidencia: runtime handle con disposables drenados por `disposeAll`
  (`extension.ts:501,987,990`); sin `import vscode` fuera de la extensión; sin
  `process.cwd()` en ella.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### G18 — Prioridad estratégica: la maquinaria crece más que el producto
- Clasificación: `REVISAR` (decisión de producto) · Zona: estrategia
- Evidencia: `proposals` (144k LOC) es el 135% del core (14k). Batuta (f00551)
  es la primera feature con valor fuera del bucle de dogfooding (S0 done,
  S1a en review, S1–S8 pendientes). Propuesta: adelgazar `proposals` y aterrizar
  Batuta antes que añadir más proceso.
- seenBy: glm-5.3-flash, qwen-3.8-max (suscribo la Discrepancia parcial de claude-opus-5-5: la premisa de Batuta está desfasada; añado la Discrepancia numérica de G43 sobre el 144k/135%)

### D1 — Purga del lock sin mutex borra claims de agentes vivos
- Clasificación: `CONFIRMADO` · Zona: proposals/locks (segunda pasada, GRAVE)
- Evidencia: `plugins/proposals/src/lib/locks/lock-store.ts:104-121` —
  `readSynchronizedLock` lee con `loadLock` (L46-58, sin mutex), computa
  `removeStale`, y persiste con `writeLock` (L54-59, `writeFileAtomic` a secas)
  en vez de `writeLockWithMutex`. Ventana de carrera: un claim escrito con
  mutex por el agente A entre la lectura y la escritura del agente B
  desaparece de disco mientras ambos creen tener los ficheros. La tabla
  file-locks.json sí está mutexada por operación (`file-lock-table.ts:159-196`):
  dos ficheros de verdad que pueden desincronizarse.
- seenBy: glm-5.3-flash, qwen-3.8-max (ver mi Discrepancia parcial con D1: la purga SIN mutex existe en `readSynchronizedLock`, pero su alcance real depende de quién llama fuera del mutex de tabla), qwen-3.8-flash (CONFIRMADO con 2 procesos: claim vivo de A escrito con mutex → `readSynchronizedLock` de B (`loadLock`/`writeLock` sin mutex de lockPath) borró el in_flight de A en el fichero final; el zombie-GC purga stale>threshold aunque el pid viva, solo la rama orphan está protegida por probe)

### D2 — El claim completo computa fuera del mutex
- Clasificación: `CONFIRMADO` · Zona: proposals/locks (segunda pasada, GRAVE)
- Evidencia: `execute-lock-action.ts:29-206` — todo el cómputo de conflicto
  (overlap L75-103, file-table L106-160) se hace sobre el snapshot leído sin
  retener mutex; solo el `writeLockWithMutex` final es atómico. Dos claims
  simultáneos de ficheros disjuntos pueden pasar ambos el check y el segundo
  pisa al primero. El test de serialización solo existe para el session-log
  (`agent-lock-engine.spec.ts:754`), no para el fichero de lock.
- seenBy: glm-5.3-flash, qwen-3.8-max (solo el núcleo "ningún test de dos claims concurrentes"; suscribo la Discrepancia de claude-opus-5-5: el mutex de tabla de `engine.ts:151-155` serializa el claim entre procesos), qwen-3.8-flash (matizo por capa: el helper exportado `tryAcquireFileLocks` (`file-lock-table.ts:380-433`) hace check FUERA de `withMutex` y el write dentro NO re-valida → dos procesos devuelven ok=true sobre el mismo fichero; reproducido con 2 procesos: doble-ok, write pisa. La vía pública `runAgentLockEngine:claim` envuelve check+write en el mutex de tabla y no reproduce doble-grant → D2 = CONFIRMADO en helper, no explotable por el tool público)
- **2ª pasada (glm-5.3-flash, ver G51):** la serialización entre procesos es
  real, pero NO suficiente: la lectura inicial puede ser falsa-vacía durante
  el rename atómico, lo que reproduce el double-grant empíricamente (21/30).

### D3 — El zombie-GC puede relevar a un agente VIVO
- Clasificación: `CONFIRMADO` · Zona: proposals/zombies (segunda pasada, GRAVE)
- Evidencia: `removeStale` (`lock-store.ts:61-77`) filtra por tiempo puro
  (10 min, `agent-conventions.ts:33-37`); el probe de lividad
  (`orphaned-lock.ts:58-90`, señal 0 al pid) solo añade expulsión de muertos,
  no protege al vivo que lleva >10 min sin heartbeat (un `bun run validate`
  de 12 min basta). Además `gcZombies` (`zombie-reconcile.ts:160-176,337-356`)
  fuerza release de locks VIVOS vía lease del registro (`agent_names` lease
  10 min desde `assign`, `agent-names.tool.ts:497-505`): heartbeatear el lock
  no heartbeatea la fila del registro. El release (`execute-lock-action.ts:241-300`)
  no verifica lividad. Ningún test cubre "GC durante una tool call larga de un
  agente que sí heartbeatea el lock". Los comentarios del plugin citan los
  incidentes R-2026-08-31 y x00509/B19: esta clase de carrera ya mordió.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### D4 — Schemas que mienten: errores de toolError fuera del outputSchema
- Clasificación: `CONFIRMADO` · Zona: proposals/tools (segunda pasada, ALTA)
- Evidencia: `authoring.tool.ts:286-326` (`REVIEW_OUTPUT_SCHEMA` declara
  `ok: z.literal(true)` sin `error`; el handler devuelve `toolError(...)` en ≥4
  paths) y `authoring.tool.ts:534-576` (mismo defecto en `CREATE_PROPOSAL_OUTPUT_SCHEMA`).
  El repo ya documentó el bug y lo corrigió SOLO en `proposal_transition`
  (`proposal-transition.tool.ts:364-374`: `ok: z.boolean()` + `error`): el fix
  quedó a medias. También `task-queue-engine.ts:786-793` devuelve
  `releasedTaskIds` no declarado en `TASK_QUEUE_OUTPUT_SCHEMA`
  (`task-queue.tool.ts:20-58`) tras un cast `as unknown as`, y `auto-work.tool.ts:585-615`
  devuelve `offendingTool`/`triggeredGuards`/`effectiveCount` fuera de
  `AUTO_WORK_OUTPUT_SCHEMA` (L1005-1043).
- seenBy: glm-5.3-flash, gemini-3.8-flash, qwen-3.8-max (verificado: `authoring.tool.ts:287,535` siguen con `ok: z.literal(true)` mientras `proposal-transition.tool.ts:360` ya usa `ok: z.boolean()`; suscribo el Matiz a D4/D10 de claude-opus-5-5 sobre el podado en el límite)

### D5 — `force:true` y `proposal_force_transition` saltan gates sin freno
- Clasificación: `CONFIRMADO` · Zona: proposals/transiciones (segunda pasada, ALTA)
- Evidencia: `proposal-transition.tool.ts:1106,1143,1186,1199,1306-1313` —
  `force:true` desactiva completeness, validate, evidencia CI y el peer-review
  gate entero con solo un apunte de auditoría; fuerza + cero slices declarados
  = cierre sin revisión posible. `recovery-tools.ts:542-600`:
  `proposal_force_transition` no valida la DFA (permite `done→in-progress`,
  resurrección de algo ya enviado) y no pasa por `recordPeerReviewBypass`.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### D6 — Cola de tareas sin cap ni reclaim: tarea perdida si el worker muere
- Clasificación: `CONFIRMADO` · Zona: proposals/cola (segunda pasada, ALTA)
- Evidencia: `persistent-task-queue.ts:395-430` — `enqueue` acepta siempre;
  los umbrales red/amber (`reportBackpressure` L700-710) son informativos,
  nadie rechaza. `dequeue` marca `consumed` (L437-470) y no existe reclaim:
  `expireSweep` solo toca entradas `queued` (L642-648). Un worker muerto tras
  dequeue pierde la tarea para siempre. El propio sistema se auto-encefila:
  el GC emite eventos watchdog a la misma cola (`agent-names.tool.ts:289-310`),
  patrón del incidente R-2026-08-31.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: `expireSweep` solo filtra `status === 'queued'`), qwen-3.8-flash (verificado en 514758e: `dequeue` → `status:'consumed', consumedAt` (`persistent-task-queue.ts:518-519`), sin ruta de reclaim de consumidos; los umbrales red/amber sólo informativos)

### D7 — Escrituras no atómicas en la transacción de migración del core
- Clasificación: `CONFIRMADO` · Zona: core/migraciones (segunda pasada, ALTA)
- Evidencia: `packages/core/src/lib/workspace-migration/transaction/migration-manifest.ts:134`
  escribe el manifiesto de recuperación con `writeFile` plano; `rollback.ts:112`
  sí usa `atomicWrite` (tres disciplinas de escritura en la misma transacción,
  `rollback.ts:189` escribe plano). Los 9 migradores escriben configs del
  usuario con `writeFile` plano (`host-config.migrator.ts:273`,
  `package-manifest.migrator.ts:231` — ¡`package.json`!,
  `agent-files.migrator.ts:373`, `config-file.migrator.ts:202`,
  `vscode.migrator.ts:245`, `gitignore.migrator.ts:92`,
  `policy-alignment.migrator.ts:105`, `development-policy.migrator.ts:195`,
  `global-config.migrator.ts:356`): un kill -9 a mitad de write corrompe el
  fichero aunque el backup exista (el rollback nunca se dispara porque el
  proceso murió).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### D8 — Más `process.cwd()` en core de los que veía la primera pasada
- Clasificación: `CONFIRMADO` · Zona: core (segunda pasada, amplía G1)
- Evidencia: además de G1 (`shell-status.tool.ts:195`):
  `plugins/discovery.ts:149,177` y `manifest/discovery.ts:23,47`
  (`rootDir ?? process.cwd()` en descubrimiento de plugins de librería),
  `shared/hook-free-environment.helper.ts:32` (helper reutilizable que resuelve
  workspace con cwd). Y I/O síncrono en la ruta más caliente:
  `work-identity/host-chat-model.helper.ts:46,71,127,141` (readdirSync+
  readFileSync recorriendo workspaceStorage en cada `work enter`),
  `model-identity.helper.ts:46,66-68` (lectura/escritura de caché sin mutex),
  `work-units/worktree-agent.service.ts:58,69` (sello del worktree en cada claim).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### D9 — El resolver tiene 7 razones terminales, no 6; dos sin red
- Clasificación: `CONFIRMADO` · Zona: core/dispatch (segunda pasada, corrige a00095 v1 y memoria previa)
- Evidencia: `capability-resolver.error.ts:15-23` — la unión es de 7
  (`catalog_missing`, `ambiguous_capability`, `policy_denied`, `host_read_only`,
  `activation_failed`, `argument_validation_failed`, `execution_failed`).
  `host_read_only` NO tiene ningún test (verificado por grep; el fixture
  `fake-runtime.ts` no implementa el estado que lo produce,
  `capability-resolver.identity.ts:185-187`). La carrera check-then-act de
  `policy_denied` por excepción (`capability-resolver.ts:170-180`) tampoco está
  ejercida. Además el comentario `capability-resolver.ts:185-187` atribuye el
  single-flight a `activatePluginAsync` (x00512 S2), pero el dedupe real vive
  en `plugins/lazy-loader.ts:174-176` y `create-mcp-project.ts:336-343`; y el
  test de carrera (`capability-resolver.spec.ts:119-137`) corre contra el
  fixture que re-implementa el mecanismo, no contra el runtime real.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: la unión es de 7, 0 tests mencionan `host_read_only`, y el comentario L13 sigue diciendo "six categories"), qwen-3.8-flash (verificado en 514758e78: `capability-resolver.error.ts:21-27` enumera las 7 incluyendo `ambiguous_capability`; `grep -rn "host_read_only" packages/core/tests` → vacío; el negativo es exacto)

### D10 — `plugin_activate`/`plugin_deactivate` violan su propio outputSchema en error
- Clasificación: `CONFIRMADO` · Zona: core/tools (segunda pasada, ALTA)
- Evidencia: `tool-surface.tool.ts:154` declara
  `outputSchema: z.object({ change: PLUGIN_CHANGE.nullable() })` pero el
  handler devuelve `toolError(...)` (envelope `{ok:false,...}`) cuando el
  plugin no existe: el structuredContent del path de error no valida contra el
  schema declarado. Mismo patrón a auditar en D4.
- seenBy: glm-5.3-flash, gemini-3.8-flash, qwen-3.8-max (verificado `tool-surface.tool.ts:154` con `toolError` en L164)

### D11 — i18n web: la matriz principal es perfecta; el agujero son 7 namespaces satélite sin gate
- Clasificación: `CONFIRMADO` (corrige matiz de G8) · Zona: apps/web (segunda pasada)
- Evidencia: `langs/` tiene paridad perfecta 12 idiomas × 315 claves (verificado
  por comparación de conjuntos; gate `check-i18n.ts:77-99` en build). Pero 7
  namespaces satélite solo tienen en/es y caen a inglés por alias silencioso
  SIN ningún gate: `extend.ts:141-155`, `proposals.ts:221-235`,
  `proposals-board.ts:110-124`, `logs.ts:57-69`, `roadmap-board.ts:82-96`,
  `provider-dashboard.ts:201-215`, `install-ecosystems.ts:87-101` — 10 idiomas
  degradados indetectablemente. Además `check-i18n.ts:15-19` solo cubre
  `langs/`, tools y shared. Y ~10 páginas root siguen EN-only por diseño
  (`guide.astro` ~500 líneas EN, `cli.astro:26-79`, `presets.astro:11`,
  `benchmarks.astro`, `first-5-minutes.astro`, `status/logs.astro`,
  `status/recovery.astro`, `troubleshooting/index.astro`).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: los 7 namespaces satélite siguen con `ar: en,` como alias silencioso)

### D12 — SEO de la web: 50/51 páginas sin canonical; hreflang solo en home
- Clasificación: `CONFIRMADO` · Zona: apps/web (segunda pasada, NUEVO)
- Evidencia: `Base.astro:88-96` emite title/description/og:title/og:description
  pero no canonical/og:url/og:image. `grep -rl 'rel="canonical"'` → solo
  `index.astro:54`; hreflang solo `index.astro:42-49`. 12 variantes de URL por
  página = duplicación para crawlers. Añadido: sin prefetch
  (`astro.config.mjs:54-83`) y pagefind indexa los 12 duplicados
  (`apps/web/package.json:22`, índice ×12).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: `rel="canonical"` solo en `index.astro`), qwen-3.8-flash (verificado en 514758e: `grep rel="canonical"` → sólo `index.astro:54`; hreflang sólo en `index.astro:42-49`; `Base.astro:88` abre un head-slot pero ninguna otra página lo llena)

### D13 — El audit de páginas es decorativo y el drift de manifests web no se detecta en PR
- Clasificación: `CONFIRMADO` · Zona: apps/web (segunda pasada, NUEVO)
- Evidencia: `pages-audit.ts:44-48` dice que `rewrite`/`merge-into` "deberían
  warn sin fallar" pero `grep -rn PAGES_AUDIT apps/web/src` solo devuelve el
  módulo y su spec: nadie emite el warning, y las 8 páginas `rewrite` siguen
  servidas. `drift.yml:57` corre `gen:all:check` en PR, pero
  `tools/scripts/gen-all.script.ts:73-247` no incluye los manifests de
  `apps/web` (`pages.json`, `skills.json`, `capabilities.json`): su drift solo
  se detecta en push a `main` (`pages.yml:1-13`).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-flash (2ª pasada)

### D14 — 16 enlaces internos rotos en docs raíz; el patrón son renames no propagados
- Clasificación: `CONFIRMADO` · Zona: docs (segunda pasada, amplía G5)
- Evidencia: `CROSS-IDE.md` acumula 5 (4 rutas de código con naming antiguo
  kebab→dot nunca propagadas + `host-adapter.types.ts`);
  `GOVERNANCE-BRANCH-PROTECTION.md` 4 (propuestas movidas al cerrarse + dir
  `verifications/` inexistente); `DOCS-MANUAL-VS-GENERATED.md:20,40` y
  `AGENT-BOOTSTRAP.md:548` usan rutas root-style como relativas;
  `CODE-MAP.md` (q00006 movida), `CROSS-PROJECT-SETUP.md`, `IDE-EXTENSION.md`
  (`dashboard.css` → `extension-overrides.css`). Precisamente el drift que
  `DOCS-MANUAL-VS-GENERATED.md` dice prevenir.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (reproducido: 6 enlaces rotos en `docs/delendai/CROSS-IDE.md`, incluido `host-adapter.types.ts` y las 4 rutas `../packages/client/src/lib/services/*`; refuerzo G40), qwen-3.8-flash (reproducido con `git show 514758e:CROSS-IDE.md` + resolver: 17 enlaces totales, 6 rotos (4 rutas de `client/services/*` + `host-adapter.types.ts` + `config/external/claude-code/`); `plugins/link-check` existe pero no aparece en `package.json#validate` ni en `ci.yml` del snapshot → refuerzo exacto de G40/D14)

### D15 — Cobertura de tests: los dos subsistemas más peligrosos del core son los menos cubiertos
- Clasificación: `CONFIRMADO` (amplía G3) · Zona: core/tests (segunda pasada)
- Evidencia: 541 specs en core (ratio 0,83 LOC test/LOC src). Pero
  `forge-governance/` (29 ficheros, escritura remota en forjas, merges, GC de
  refs) tiene specs de directorio pero sin spec nominal por fichero, e
  `integration-engine/` (32 ficheros) solo 10. Además `load-plugins-runtime.helper.ts:185`
  traga el error de un `register()` que falla tarde (`void
  registerPromise.catch(() => undefined)`) sin logging ni `registerErrors`.
  Y 5 wrappers ad-hoc de sha256 sin helper compartido (`startup-reconciler/fingerprint.ts:47-48`,
  `handles/artifact-handle.ts:85-86`, `skills/skill-catalog.ts:177`,
  `work-units/unit-lease.store.ts:23`, `wip-engine/patch-digest.ts`).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: `void registerPromise.catch(() => undefined)` sigue en `load-plugins-runtime.helper.ts:176`)

### D16 — Positivos de la segunda pasada (lo que resiste el ataque profundo)
- Clasificación: `CONFIRMADO` (negativo) · Zona: transversal
- Evidencia: core — 0 `console.*` en producción, 0 `@ts-ignore`/`@ts-nocheck`/
  `as any` reales, 16/16 tools core con outputSchema, lifecycle de plugins con
  timeout+rollback correctos (`load-plugins-lifecycle.helper.ts:194-260,294-314`),
  SQL sin inyección (placeholders 100%, `services/search.ts:60-97`). proposals —
  lecturas por SafeWorkspaceReader con realpath (`safe-workspace-reader.ts:60-120`),
  appendPeerReviewJsonl mutexado+fsync (`peer-review-log.ts:135-146`),
  `proposal_transition` es el contraejemplo bien hecho de schema honesto
  (L359-433). web — logos idénticos por sha256 (`999423f5…`, las dos copias),
  matriz i18n principal 12×315 perfecta, alt/width/lazy en todas las `<img>`.
  extensions — renderer de detalle del dashboard escapa con escapeHtml
  (`render-tool-detail.ts:68-103`), el vector XSS de knowledge fue corregido y
  documentado (`render-knowledge-navigator.ts:71-76`), CSP default-deny con
  test (`webview-csp.spec.ts`, f00079 S1), safeParse en 7/8 webviews.
- seenBy: glm-5.3-flash, gemini-3.8-flash, qwen-3.8-max (reproducido en mi barrido independiente: 0 secretos hardcoded, 0 URLs inseguras en github/gitlab/client; el único `new Function` es el intencional y comentado de `load-plugins.ts:135` — import dinámico, no eval de datos)

### G19 — Un texto empalmado en un documento se leía como patrón de reemplazo
- Clasificación: `CONFIRMADO` (corregido en x00909 S7, #1181) · Zona: proposals, core, tooling
- Evidencia: `plugins/proposals/src/lib/tools/authoring.tool.ts` reescribía la slice con `md.replace(blockRe, `${m[1]}${block}`)`; la nota de un revisor que citaba un patrón terminado en `$'` recibió el resto del documento (S5 de f00761 duplicado, nota truncada; #1173 bloqueado por aprobaciones copiadas). 19 sitios más con el mismo patrón; ahora `lint:no-interpolated-replacement` lo impide.
- seenBy: claude-opus-5-5, qwen-3.8-max (verificado: el lint existe con script+spec+constant en `tools/scripts/lint/`)

### G20 — Cada subagente delegado recibía la orden de no usar ninguna herramienta
- Clasificación: `CONFIRMADO` (corregido en x00909 S3, #1181) · Zona: agent-orchestrator
- Evidencia: `plugins/agent-orchestrator/src/index.ts` compilaba toda delegación con `allowedTools: []`, y `renderDelegationPrompt` lo traduce a "Use no tool beyond reading": también al implementador. Ahora las herramientas salen del perfil de core de su rol; el contexto que falta se nombra en `missingContext`.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: `delegation-manifest.service.ts:138-171` ya no compila con `allowedTools: []`)

### G21 — La confirmación de gasto no podía darse nunca
- Clasificación: `CONFIRMADO` (corregido en f00551 S6, pendiente de merge) · Zona: orchestrator-runner
- Evidencia: `plugins/orchestrator-runner/src/lib/invoke/token.ts` documenta una puerta conectada a la elicitación MCP; nada la conectaba y `denyAllConfirmationGate` rechazaba todo gasto con `confirmBeforeExecute: true` (por defecto).
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado como CORREGIDO ya en develop: `index.ts:153` cablea `elicitedConfirmationGate`; el estado "en merge" del scoreboard caducó)

### G22 — La descripción de cada herramienta existe dos veces
- Clasificación: `CONFIRMADO` · Zona: apps/web
- Evidencia: `apps/web/src/i18n/tools/**` repite en `en` la descripción que registra cada herramienta, sin ninguna comprobación de deriva; al cambiar dos herramientas del runner la web siguió describiendo el comportamiento anterior. Propuesto en x00910 S2.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: `apps/web/src/i18n/tools/` repite descripciones sin drift-check en `tools/scripts/gen/`)

### G23 — La web publicaba datos que nadie produce
- Clasificación: `CONFIRMADO` (corregido en x00910 S3) · Zona: apps/web
- Evidencia: `apps/web/src/data/token-roi.json` (`top: []`, 2026-08-30) y `token-budget.json` (muestra) sin ninguna página que los lea; una auditoría externa los tomó por métricas del producto.
- seenBy: claude-opus-5-5, qwen-3.8-max (verificado que `token-roi.json`/`token-budget.json` ya no existen en mi snapshot: la corrección x00910 S3 aterrizó)

### G24 — El cargador SQLite multi-runtime existe tres veces
- Clasificación: `CONFIRMADO` · Zona: state-telemetry, proposals-sqlite
- Evidencia: `packages/proposals-sqlite/src/lib/bun-sqlite.helper.ts` cae a `node:sqlite`; `packages/state-telemetry/src/lib/eta/duration-history.ts` y `events/work-event-store.sqlite.ts` tienen copias solo-Bun (la telemetría muere en Node). Propuesto en x00910 S4.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado como CORREGIDO ya en develop: `duration-history.ts:41`, `work-event-store.sqlite.ts:31`, `sqlite-driver.ts:31` importan `loadDatabaseClass` de `@delendai/sqlite`; el estado "abierto" del scoreboard caducó)

### G25 — Las CLI de proveedores heredaban todo el entorno del servidor
- Clasificación: `CONFIRMADO` (corregido para cuentas en f00551 S3; pendiente para entradas sin cuenta en x00910 S5) · Zona: orchestrator-runner
- Evidencia: `invoke/build-manager.ts` lanzaba `spawn` sin `env`, así que un worker leía cada credencial del servidor y una API key heredada se imponía al login de suscripción.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado el arreglo en develop: `build-manager.ts:58` propaga `env` y L173 filtra por `accountEnvironment`)

### G26 — Dos lints comprueban el mismo hecho con dos baselines
- Clasificación: `CONFIRMADO` · Zona: tools/scripts/lint
- Evidencia: `proposal-files-exist` y `proposal-slice-completeness` verifican ambos que un fichero declarado existe, cada uno con su baseline; retirar un fichero que listaba una propuesta cerrada exige actualizar los dos (x00910 S3).
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: ambos scripts siguen con su baseline independiente)

### G27 — Un host server de larga vida aplica las reglas con las que arrancó
- Clasificación: `CONFIRMADO` · Zona: core
- Evidencia: el servidor de esta sesión arrancó cinco horas antes de que x00908 llegara a develop, y retirar f00639 desde `paused` no publicó hasta hacerlo a mano; nada en sus respuestas dice que el código que ejecuta está atrasado. Propuesto en x00910 S8.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (vivido en primera persona: esta misma sesión arrancó con un worktree que otro proceso retiró por idle mientras yo trabajaba)

### G28 — `bun test` juzgaba specs de vitest
- Clasificación: `CONFIRMADO` (corregido en x00909 S6, #1181) · Zona: tooling
- Evidencia: gemini-3.8-flash (#1172) obtuvo falsos fallos de `vi.waitFor` bajo el runner de Bun; ahora `bun test` rechaza cualquier spec fuera de `BUN_OWNED_SPECS` con el comando correcto.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: `BUN_OWNED_SPECS` consumido por `no-dead-modules.script.ts:56`)

### G29 — El esquema de una entrada de proveedor existía dos veces
- Clasificación: `CONFIRMADO` (corregido en f00551 S1, #1177) · Zona: core, orchestrator-runner
- Evidencia: `plugins/orchestrator-runner/src/lib/options.ts` duplicaba `PROVIDER_ENTRY_SCHEMA` de core; ahora el runner importa el de `@delendai/core/contracts`.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado corregido: `options.ts:14` importa de contracts)

### D17 — La CSP del dashboard (y 4 webviews más) permite `script-src 'unsafe-inline'`
- Clasificación: `CONFIRMADO` (deuda documentada, no explotable hoy) · Zona:
  ui-extension/extensions (tercera revisión del canal de detalles)
- Evidencia: la política central `packages/ui-extension/src/webview/csp.ts:32-46`
  es default-deny correcta, pero el override `['dashboard', { scriptSrc:
  ["'unsafe-inline'"], connectSrc: ["'self'"] }]` (y el mismo patrón para
  toolbar, settings, knowledge y configuration-center) existe porque
  `render-dashboard.ts:680` inyecta los renderers serializados con
  `.toString()` dentro de un `<script>` inline
  (`window.__DELENDAI_DASHBOARD_DETAIL__ = { RENDER_TOOL_BODY:
  ${renderToolDetailBody.toString()}, ... }`). El propio comentario del
  override lo admite: "until a nonce-based pipeline lands (deferred
  follow-up)". Riesgo contenido HOY: los dos renderers escapan todo su input
  con escapeHtml (verificado campo a campo en `render-tool-detail.ts:95-108`,
  `render-proposal-detail.ts:103-131` y `render-output-schema.ts:32-55`), pero
  un solo escapeHtml olvidado en el futuro se ejecutaría con scripts
  permitidos. El único innerHTML sin escape del paquete (`dev/entry.ts:109`)
  está acotado al entorno de desarrollo.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado `csp.ts:32-46`; amplío: las 6 implementaciones de escapeHtml no escapan `'` de forma uniforme — ver G42)

### G30 — Tres componentes eligen modelo y tres guardan lo aprendido; el descubrimiento existe dos veces
- Clasificación: `CONFIRMADO` · Zona: auto-agent-selector, orchestrator-runner, adaptive-optimizer, self-learning, prompt-eval, usage-tracking
- Evidencia: `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts` (con su almacén de win-rates `calibrate/store.ts`), la puntuación propia de `orchestrator-runner` contra capability hints y la de `adaptive-optimizer` ordenan proveedores cada una a su manera; `self-learning`, las escrituras de calibración de `prompt-eval` y el log de coste de `usage-tracking` guardan observaciones por separado. El sondeo de CLIs está en `auto-agent-selector/src/lib/discovery/real-deps.ts` y otra vez en `orchestrator-runner/src/lib/healthcheck/probe.ts` + `tools/discover.tool.ts`. f00551 S0 (`docs/delendai/batuta/reconciliation.md`, fila *Selection*) ya pedía "reuse existing selectors"; nadie los unificó. Propuesto en q00034 S2 y S4.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: los 4 ficheros de descubrimiento/ranking coexisten)

### G31 — Las cuentas de una persona viven en la configuración que se commitea
- Clasificación: `CONFIRMADO` · Zona: core/config
- Evidencia: `accounts` (con `profileDir` y `credentialEnv`) se lee de la raíz de `delendai.config.json` (`packages/core/src/lib/plugins/account-registry.helper.ts`, `load-config-file.ts`); no existe capa personal. Un proyecto con varias personas no puede tener las cuentas de cada una, ni la misma cuenta por plan para una y por clave para otra. Propuesto en q00034 S1 (capa personal fuera del repo, fusión documentada, migración de arranque).
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: `account-registry.helper.ts` no conoce ninguna capa personal)

### G32 — Nada observa la cuota: todo salto no atendido se rechaza
- Clasificación: `CONFIRMADO` · Zona: orchestrator-runner
- Evidencia: el runner rechaza un salto sobre una cuota desconocida (desconocido no es ilimitado) y ningún componente escribe observaciones de cuota (`docs/delendai/batuta/guide.md`, "Not proved yet"); por eso f00551 S7 no puede medir nada real. Además una cuenta instalada sin plan de pago (OpenCode en esta máquina, 2026-10-18) no se distingue de una que funciona. Propuesto en q00034 S2 y S3.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max

### G33 — Una review que no pudo ejecutarse solo puede registrarse como "pedir cambios"
- Clasificación: `CONFIRMADO` · Zona: proposals/review
- Evidencia: `proposal_review` admite `submit | approve | request_changes` (`plugins/proposals/src/lib/contracts/surfaces/proposal-read.contract.ts:143`). gemini-3.8-flash no pudo terminar `bun run validate` en q00011 S9 (lock de cómputo ocupado) y lo registró como `request_changes`; el slice volvió al implementador y quedó parado sin nada que cambiar. La nota de reentrega además duplica sus propias palabras (`proposal-review.ts:145`). Propuesto en x00922.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: el enum `proposal-read.contract.ts:143` sigue sin veredicto `could_not_verify`)

### G34 — `work enter` cortaba la unidad de una base atrasada
- Clasificación: `CONFIRMADO` (corregido en x00921, #1233) · Zona: core/work-units
- Evidencia: `integrationBase` (`work-unit-shared.service.ts`) devolvía la rama local aunque solo fuera por detrás de su copia remota; bajo `shared-checkout-pr` el checkout compartido avanza por fast-forward un rato después de cada merge, y tres unidades seguidas nacieron sin el fichero de su propia propuesta recién mergeada.
- seenBy: claude-opus-5-5

### G35 — El remedio del doctor para refs huérfanas no se podía seguir
- Clasificación: `CONFIRMADO` (corregido en x00920, #1232) · Zona: core/work-units
- Evidencia: `no-stray-refs` mandaba usar `work retire --ref`, que rechazaba toda ref fuera de wip/pr ("is not a unit of work"); y el reaper solo quitaba refs de commits vacíos, no copias de tips que el forge ya guarda (12 en este clon). Ahora `work reap` quita las copias y `work retire` guarda en el forge las demás.
- seenBy: claude-opus-5-5

### G36 — El texto para el agente nombraba herramientas que ningún servidor registra
- Clasificación: `CONFIRMADO` (corregido en x00918 y x00919, #1225, #1228) · Zona: proposals, core
- Evidencia: `auto_work` y el lock engine decían `proposals_branch_gc`, `proposals_agent_worktree`, `logs_query`, `notification_await_lock`; los nombres reales llevan el prefijo del core y el del plugin. Ahora core nombra cada herramienta con una sola regla (`plugin-tool-name.helper.ts`, `ctx.toolNameOf`).
- seenBy: claude-opus-5-5

### G37 — El GC de worktrees y el reaper de CI no leían la regla única de vida de una work ref
- Clasificación: `CONFIRMADO` (corregido en x00917, #1222) · Zona: core/ref-lifecycle, tools/scripts/lint
- Evidencia: `branchDeliveryVerdict` daba por entregada una work ref cuya propuesta seguía en progreso, y `keepInProgressWorkRefs` juzgaba una ref ya integrada por su propio tip en vez de por la rama de integración; ahora ambos leen `workRefProposalOpen`.
- seenBy: claude-opus-5-5

### G38 — El rollback de migraciones tiene su propia escritura atómica (amplía D7)
- Clasificación: `CONFIRMADO` · Zona: core/migraciones
- Evidencia: `packages/core/src/lib/workspace-migration/transaction/rollback.ts:319` define un `atomicWrite` local en vez de usar el `writeFileAtomic` del core, y en el mismo fichero `rollback.ts:189` escribe plano: la disciplina de escritura de una transacción vive en tres sitios. La corrección de D7 debería pasar todo por la de core.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado `rollback.ts`: `atomicWrite` local en L319, `writeFile` plano en L189 y L326)

### G39 — `@delendai/test-kit` carece de target de compilación (`build`) en su `package.json`
- Clasificación: `CONFIRMADO` · Zona: packaging/tools
- Evidencia: `packages/test-kit/package.json:9-13` no tiene script `"build"`, a diferencia de los otros 11 paquetes del monorepo (`packages/*/package.json`, que invocan `bun ../../tools/scripts/compile/build.script.ts`). Aunque sus exports apuntan a `./src/index.ts` vía directivas privadas, cualquier invocación global de build o verificación empaquetada que itere sobre `packages/*` encuentra esta asimetría estructural.
- seenBy: gemini-3.8-flash, qwen-3.8-max (verificado; amplío: `ui-extension` también carece de script build, luego son 2 excepciones, no 1)

### G40 — `plugins/link-check` no está integrado en la suite de linting de CI ni en `validate`
- Clasificación: `CONFIRMADO` · Zona: tooling/CI
- Evidencia: a pesar del hallazgo D14 (16 enlaces internos rotos en docs) y de contar con un motor puro implementado en `plugins/link-check/src/lib/link-check/check-links.ts` (con tests unitarios y detección ReDoS), el comando de verificación de links no forma parte de `package.json#scripts.validate` ni de ningún workflow en `.github/workflows/`. Los enlaces rotos continúan acumulándose sin un ratchet o gate automatizado en PRs.
- seenBy: gemini-3.8-flash, qwen-3.8-max (verificado: 0 menciones de link-check en validate ni workflows; y D14 reproduce 6 enlaces rotos en un solo doc — este gate pagaría su coste en horas), qwen-3.8-flash (verificado en 514758e: `git show 514758e:package.json` no tiene `lint:link-check` en `validate:run`; `ci.yml` snapshot 0 menciones; el paquete `plugins/link-check` sí existe y exporta motor con tests)

### G41 — El plugin `security` contiene un regla de API key de Google que produce falsos positivos masivos con tests
- Clasificación: `CONFIRMADO` · Zona: plugins/security
- Evidencia: `plugins/security/src/lib/contracts/constants/secret-rules.constant.ts:40-44` define `google-api-key` como `/AIza[0-9A-Za-z_-]{35}/g`. En tests de plugins (p. ej. `plugins/quality/tests/src/lib/runners/lint-rules.spec.ts:311` y fixtures de mock strings), múltiples tokens o hashes aleatorios coinciden o rozan este prefijo. Al no discriminar fixtures/specs frente a código fuente de producción, cualquier escaneo global de secretos genera ruido en fixtures sintéticas.
- seenBy: gemini-3.8-flash, qwen-3.8-max (verificado `secret-rules.constant.ts:43`; con `\b` acotada es menos ruidosa de lo descrito, pero sigue sin excluir fixtures por contexto)

### G42 — `escapeHtml` existe 6 veces y 5 de las 6 no escapan la comilla simple
- Clasificación: `PROBABLE` · Zona: ui-extension, extensions/vscode
- Evidencia: seis implementaciones independientes de `escapeHtml`:
  `packages/ui-extension/src/dashboard/format.ts:51` (la única que escapa `'`
  como `&#39;`), `packages/ui-extension/src/dashboard/render-output-schema.ts:67`,
  `extensions/vscode/src/views/render-output-schema.ts:72`,
  `extensions/vscode/src/commands/types.ts:224`,
  `extensions/vscode/src/webviews/setup-github.ts:63`,
  `extensions/vscode/src/dev/entry.ts:22` — estas cinco solo escapan
  `& < > "`. Hoy no es explotable (las incrustaciones en atributos usan
  comilla doble y los inputs pasan por `safeParse`/copy interno), pero combina
  mal con D17 (`script-src 'unsafe-inline'` en 5 webviews): un futuro atributo
  con comilla simple (`title='${escapeHtml(x)}'`) abriría inyección de atributo
  con scripts habilitados. Además `views/render-output-schema.ts` se declara
  copia de `dashboard/render-output-schema.ts` en su propio comentario
  ("Mirrors the legacy…"): dos forks deliberados del mismo renderer.
- seenBy: qwen-3.8-max

### G43 — Las cifras de G2/G18 no son reproducibles; el "135% del core" no se sostiene en develop actual
- Clasificación: `REVISAR` (metodología, no bug) · Zona: proposals/medición
- Evidencia: medición propia contra snapshot `cbefecaa3`:
  `plugins/proposals/**/*.ts` = 127.468 LOC totales (65.083 solo `src/`,
  62.242 solo `tests/`); G2 cita "144.184 LOC" sin definición.
  `packages/core/**/*.ts` = 221.261 LOC totales (120.601 solo `src/`,
  100.587 solo `tests/`); G18 cita "core (14k)", que no corresponde a ninguna
  medición (ni siquiera `generated/` del core llega tan bajo). Comparando como
  se debe (src contra src): `proposals` es el 54% del core, no el 135%; todos
  los plugins src suman 221.885 frente a 184.391 de todos los packages src
  (1,2×). El fondo del hallazgo (monolito de 3k LOC por fichero, deuda SRP)
  sigue siendo cierto y lo suscribo en G2; lo que no resiste es la ratio que
  usa G18 para justificar prioridad estratégica. Propongo fijar una definición
  canónica de LOC (src excluyendo specs y generados, script en `tools/`) antes
  de que el Scoreboard consolide G18.
- seenBy: qwen-3.8-max

### G44 — Higiene del libro de actas: fila D17 duplicada, tabla partida y acuerdos sin auditar
- Clasificación: `MEJORA` · Zona: a00095 (este documento)
- Evidencia: (1) el Scoreboard tiene la fila D17 dos veces (notado por
  claude-opus-5-5, sin corregir porque es texto de glm — yo tampoco lo toco:
  lo corrija el revisor 10 en S10); (2) las filas G30–G41 están separadas de la
  tabla principal por una línea en blanco + cita, lo que las renderiza como
  segunda tabla sin cabecera en Markdown; (3) los acuerdos no cuadran con los
  `seenBy` en varios casos: gemini suscribe en su prosa "D3–D17" pero D4 y D10
  listan solo a glm+gemini, y D1/D2 quedaron en 1/10 pese a que su bloque los
  discute; G21 aparece "en merge" cuando ya está en develop (`index.ts:153`).
  Propongo que S10 regenere la columna Acuerdo desde los `seenBy` (fuente
  verificable) en vez de desde la prosa, y una sola tabla.
- seenBy: qwen-3.8-max

### G45 — Dos plugins pinnean zod a una versión distinta del resto del monorepo
- Clasificación: `MEJORA` · Zona: deps
- Evidencia: 63 `package.json` declaran `"zod": "^4.4.3"`;
  `plugins/changelog/package.json` y `plugins/database/package.json` declaran
  `"zod": "^4.0.0"`. En un monorepo con `workspace:*` y un solo lockfile el
  efecto práctico es mínimo (hoisting resuelve una sola copia), pero rompe la
  homogeneidad de manifiestos y permite que esos dos plugins compilen contra
  tipos de zod más antiguos que el resto. Un lint de versiones alineadas (ya
  existe infra en `tools/scripts/lint/`) lo impediría.
- seenBy: qwen-3.8-max

### G46 — `logo-mono.svg` es una cuarta copia de marca sin gate
- Clasificación: `CONFIRMADO` · Zona: brand/web/extensions
- Evidencia: `apps/shared/brand/logo-mono.svg`, `apps/web/public/logo-mono.svg`
  y `extensions/vscode/media/logo-mono.svg` son byte-idénticos (diff verificado
  en snapshot 514758e78). `lint:brand` (`extensions/vscode/scripts/sync-logo.ts`)
  solo vigila `logo.svg` con fuente `apps/web/public/logo.svg`; `logo-mono`
  añade una cuarta copia que ningún gate protege. Extiende G9 (tres `logo.svg`).
- Remedio: extender sync-logo a la pareja (logo, logo-mono) con fuente única
  `apps/shared/brand/`.
- seenBy: glm-5.3-flash (2ª pasada)

### G47 — `/status/logs` y `/status/recovery`: páginas operativas vacías, sin navegación y con SSE decorativo
- Clasificación: `CONFIRMADO` · Zona: web
- Evidencia (snapshot 514758e78): `LogTable`/`RecoveryTable` reciben
  `events=[]`/`zombies=[]` en sus ÚNICOS call-sites (`status/logs.astro:15`,
  `status/recovery.astro:18`) — ningún caller pasa datos jamás. Los botones
  `data-action="release-lock"`/`"force-ready"` (`RecoveryTable.astro:57-61`)
  no tienen listener en todo `apps/web`. Ninguna página ni el `SiteNav` enlaza
  `/status/*`. El endpoint `api/events/[topic].ts` es estático (GitHub Pages):
  emite una vez `{"bootstrap":true}` y cierra; `recovery.astro:24-27` recarga
  la página al recibirlo y `logs.astro:26-28` cierra sin efecto. Sin embargo
  `pages-audit.ts:386-399` las justifica como "operational chrome backed by
  live data" — afirmación sin fuente de datos en el snapshot. Valida D13.
- Remedio: o se conectan a un export real de logs/recovery (build-time), o se
  retiran junto con el endpoint SSE.
- seenBy: glm-5.3-flash (2ª pasada)

### G48 — El ciclo de settlement (q00013) tiene las tres piezas y ningún conductor
- Clasificación: `CONFIRMADO` · Zona: commit-policy/quality-policy/e2e
- Evidencia: `worker.registry.ts` + `settlement-gate.helper.ts` cableado en
  `plugins/commit-policy/src/index.ts:565`; `settlement-runner.ts` +
  `quality_policy_run_settlement` en quality-policy. Pero NADA invoca
  `setPhase('settling')`/`markGreen` fuera de los tests: ni CLI, ni
  agent-orchestrator, ni bootstrap/prompts, ni workflows CI (grep sin matches
  en snapshot). `tests/e2e/eventual-settlement.spec.ts:79` usa
  `validateCommand: 'true'` — valida un no-op. Infraestructura implementada,
  ciclo inalcanzable desde el producto.
- seenBy: glm-5.3-flash (2ª pasada)

### G49 — El gate de settlement no protege la transición que dice proteger
- Clasificación: `PROBABLE` · Zona: commit-policy
- Evidencia: `engine.ts:577-590` aplica el gate solo a `event.kind === 'slice'`
  con `settlementRead` opcional; el test "SETTLING surface refuses a
  re-entering worker" (`eventual-settlement.spec.ts:92-102`) solo comprueba que
  el registro expone `phase` — el propio comentario del spec lo admite ("the
  engine wiring is exercised by the unit tests"). La fase se lee pero la
  transición ACTIVE→SETTLING no es atómica respecto a un claim que entre justo
  después del read.
- seenBy: glm-5.3-flash (2ª pasada)

### G50 — El enlace "API" del nav 404a salvo tras `bun run site` completo
- Clasificación: `CONFIRMADO` · Zona: web
- Evidencia: `SiteNav.astro:65` enlaza `${base}/api/`; `apps/web/public/api`
  es un symlink que crea `sync-public-api.ts` durante el build de apps/web.
  En un checkout limpio `apps/web/public` no contiene `api/` (verificado), y
  no existe página Astro ni redirect que sirva `/api/` — solo el pipeline
  `site` (docs:api + build) lo materializa. Un dev-server sin docs:api previo
  sirve un 404 en un enlace primario del nav.
- Remedio: redirect a la página de docs correspondiente cuando el symlink no
  exista, o generar una página índice.
- seenBy: glm-5.3-flash (2ª pasada)

### G51 — Lectura falsa-vacía del lock durante el rename atómico: primera reproducción empírica del double-grant (resuelve D1/D2)
- Clasificación: `CONFIRMADO` · Zona: proposals/locks + core/atomic-write (GRAVE)
- Evidencia (snapshot 514758e78, reproducción con 2 procesos bun por la vía
  real del tool `runAgentLockEngine`):
  - Storm de 30 rondas de doble-claim concurrente del mismo fichero:
    **21/30 double-grant** (ambos procesos reciben `claimed=true`), 9/30
    serializados correctamente; en 9 de las 21 rondas el claim de A desaparece
    del fichero final (claim perdido silencioso — in_flight final = [B]).
  - Control secuencial: B recibe `blocked:lock-conflict` correcto.
  - Sonda del primitivo: `withFileMutex` puro con RMW 2×200 → 400/400, 0
    perdidos — el mutex EN SÍ es correcto.
  - Sonda de sidecar: con `file-locks.json.mutex` ajeno y vivo, el claim falla
    con `lock contention ... held past 5000ms` — el mutex exterior se respeta.
  - **Causa raíz** (historia del fichero capturada con `watchFile`):
    `[A]@t0 → []@t0+37ms → [B]@t0+69ms`. La escritura vacía intermedia la
    produce B: `loadLock` (`lock-store.ts:36-53`) traduce CUALQUIER error de
    `SafeWorkspaceReader.readText` a `emptyLock()` — incluido el ENOENT
    transitorio del `rename` de `writeFileAtomic` (tmp+rename,
    `atomic-write.ts`). Medición directa: lector en bucle + escritor atómico →
    3/3965 lecturas devuelven lock vacío con el fichero siempre poblado.
  - Cadena: B lee vacío → no ve `in_flight` de A → `tryAcquireFileLocks`
    tampoco (misma ventana sobre `file-locks.json`) → B concede y escribe [B]
    pisando [A]. El mutex serializa procesos pero no protege contra una
    lectura cuyo resultado nunca fue un estado real: el RMW parte de un
    estado fantasma.
- Impacto: doble asignación de ficheros entre agentes vivos + pérdida
  silenciosa de claims — el fallo exacto que el sistema existe para impedir.
- Remedio mínimo: (a) `loadLock` no debe traducir ENOENT/transitorio a
  `emptyLock` sin un re-read breve (1-2 ms) o validación stat-then-read;
  (b) mismo tratamiento para el lector de `file-locks.json`; (c) test de
  doble-claim concurrente en la suite como regresión permanente.
- Nota de arbitraje: claude-opus-5-5 y qwen-3.8-max tenían razón en que el
  mutex serializa; el glm-5.3-flash de la v1 la tenía en que la carrera
  existe. Ambas cosas son ciertas: la carrera no está en el mutex, está en
  la lectura que precede al RMW.
- seenBy: glm-5.3-flash (2ª pasada), qwen-3.8-flash (verifico por subagente la
  secuencia lost-update: write-live-ok de A → readSynchronizedLock de B →
  in_flight vacío en el fichero final; y confirmo que por la vía pública
  `runAgentLockEngine` en storm el mutex de tabla impide el doble-grant —
  el vector que sí reproduce doble-ok es el helper exportado
  `tryAcquireFileLocks`, no el tool. La causa de G51 (ENOENT→emptyLock) es
  correcta como lectura frágil. **Re-test con storm=50 (dos procesos bun reales,
  snapshot extraído a /tmp)**: 0/50 doble-grants, 0/50 lost-updates → el
  ENOENT transitorio del rename no llega a producirse en este FS rápido. No
  confirmo ni refuto el 21/30 de glm (FS/carga-dependiente); suscribo la
  causa como lectura frágil, la frecuencia queda en disputa)

### G52 — Batuta healthcheck marca `available` sin verificar auth/model
- Clasificación: `CONFIRMADO` · Zona: orchestrator-runner
- Evidencia: `plugins/orchestrator-runner/src/lib/healthcheck/report.ts:8-13,47-81`; CLI solo en PATH con `auth:null` y `model:{available:null}` sale `overall:'available'`. Tool `healthcheck-providers.tool.ts:45-55` lo promete como `usable right now`.
- Qué debería: healthcheck distinguir `installed`/`reachable`/`authenticated`/`entitled`/`usable` y no mapear `available` mientras auth/model son `null`.
- Qué ocurre: `installed`→`available`; `model: null`. El router y el operador sobrestiman disponibilidad y encadenan fallbacks sobre datos inflados.
- Causa raíz: se estabilizó la forma del health report antes de implementar comprobaciones reales de auth/model.
- Solución: separar la taxonomía; `usable` solo con prueba.
- Regresión: CLI solo-en-PATH no `usable`; API sin clave / suscripción sin plan no `available`.
- Relación: refuerza BATUTA-03 y G32/G33.
- Confianza: alta.
- seenBy: qwen-3.8-flash (2026-10-19)

### G53 — Batuta subscription es passthrough al host actual, no ejecutor cross-host
- Clasificación: `CONFIRMADO` · Zona: orchestrator-runner
- Evidencia: `plugins/orchestrator-runner/src/lib/subprocess/subscription.ts:4-8,17-25` — no lanza worker externo; usa el `modelId` actual del host.
- Qué debería: si se promete "usar modelo de otro host/cuenta", ejecutar un worker externo y dejar journal.
- Qué ocurre: `subscription` modelado como estrategia de no-gasto, no de ejecución remota. "Claude desde Copilot" no funciona por esta vía.
- Causa: tipo subscription = no-gasto local.
- Solución: renombrar a passthrough explícito en superficie, o implementador cross-host real con criterios.
- Regresión: una `subscription` nunca cuenta como hop externo; una hop real deja worker distinto en journal.
- Relación: refuerza BATUTA-01 / G51 (sin smoke cross-host real).
- Confianza: alta.
- seenBy: qwen-3.8-flash (2026-10-19)

### G54 — external-mcps spawnea `command` de config sin allowlist (knob ≠ frontera)
- Clasificación: `CONFIRMADO` (diseño; riesgo residual) · Zona: external-mcps
- Evidencia: `plugins/external-mcps/src/index.ts:75,178` spawnea `entry.command`; `lib/subprocess/server-registry.ts:83-98` usa `spawn(command,args,{cwd,env})`; `lib/activation/activation-policy.helper.ts:47-70` default `llmDecidesActivation:false` + `requireHumanAckWhenLlmDecides:true`.
- Qué debería: lista blanca de ejecutables enforced antes del `spawn`; un servidor ya activo (`alreadyActive:true`) no debería aceptar calls sin ack en cada activación fría.
- Qué ocurre: el gate es un knob opcional, no una restricción de inventario. Config comprometida → cualquier `command` spawneable en el cwd del workspace.
- Causa: diseño por knobs de autonomía, no por allowlist.
- Solución: allowlist de binarios + ack humano no opcional en cold-activation.
- Regresión: `command` no reconocido (no en allowlist/which) se niega antes de `spawn`.
- Relación: matiza la ficha delegada que lo标aba 3/10: no es producto muerto, es seguridad por configuración.
- Confianza: alta.
- seenBy: qwen-3.8-flash (2026-10-19)

### G55 — providers.astro: `attributionRows` hardcodeado sin producer (web publica datos que nadie produce)
- Clasificación: `CONFIRMADO` · Zona: apps/web
- Evidencia: `apps/web/src/data/provider-dashboard.ts:25-50` define `attributionRows` y `PROVIDER_STATUS_SHOWCASE` como `frozen fixtures`; el propio header dice `no live server dependency`. Usado por `apps/web/src/pages/providers.astro`.
- Qué debería: la web pública no debe presentar "ahorro por modelo" o "cuotas" como si fueran estados reales si no hay writer.
- Qué ocurre: muestra datos fijos que simulan operación real (coste/ahorro/quota). Un adopter lee telemetría sintética como evidencia operativa.
- Causa: se construyó con samples antes de cablear producer.
- Solución: marcar visible `@sample` que lint detecte, o eliminar filas hasta que `gen-capabilities`/`get-quota` las pueblen de verdad.
- Regresión: `pages-audit` bloquea `providers.astro` con `attributionRows` hardcoded sin flag de ejemplo.
- Relación: extiende G23 y G47 (mismo patrón: datos publicados sin fuente) a la página de proveedores.
- Confianza: alta.
- seenBy: qwen-3.8-flash (2026-10-19)

### G56 — agent-orchestrator: cap `maxTokensPerSubagent` es petición al host, no corte local
- Clasificación: `CONFIRMADO` · Zona: agent-orchestrator
- Evidencia: `src/lib/budget/budget-tracker.ts:74-82` define `subagentExhausted()`; en `src/lib/dispatch/linear-dispatcher.ts` solo aparece en comentario (`:20`) — el loop pasa `override.budget`/`budget` (`:215,272`) y registra post-hoc (`recordSubagent`, `:260`), pero nunca lo consulta para abortar. `orchestratorExhausted()` sí se consulta (`:178`).
- Qué debería: con `budget.maxTokensPerSubagent` configurado, si se agota, el loop rota el subagente (rotation `token-budget-exhausted`).
- Qué ocurre: el cap es input al host; si el host no lo impone, se queman tokens sin corte local (`max===0`→`return false` incluso).
- Causa: presupuesto modelado como petición, no como guard ejecutado.
- Solución: consultar `subagentExhausted()` en el loop de `linear-dispatcher` y rotar.
- Regresión: unit test `maxTokensPerSubagent=1`, respuesta `tokensUsed=2` → el plan rota/aborta con razón `token-budget-exhausted`.
- Relación: refuerza G4 (presión de presupuesto) y G22 del libro (techos documentados). Esta es la versión no-enforced del cap de subagente.
- Confianza: alta.
- seenBy: qwen-3.8-flash (2026-10-19)

### G59 — `packages/roadmap-sqlite` es código huérfano (implementado, no conectado)
- Clasificación: `CONFIRMADO` · Zona: packages (código no usado)
- Evidencia (qwen-3.8-flash, snapshot 514758e78): `git grep -l "@delendai/roadmap-sqlite"` en `*.ts` **excluyendo su propio** paquete → **0 hits** fuera de sí. Sus specs existen (`packages/roadmap-sqlite/tests/...`), pero no hay `import ...roadmap-sqlite` en src. plugins/roadmap usa `MarkdownRoadmapStore` como autoridad (`roadmap-workspace.service.ts:24,88 → new MarkdownRoadmapStore(...)`, **no** `RoadmapSQLite`). Los plugins que sí dependen de SQLite reales: state-sqlite `1`, proposals-sqlite `2`, sqlite `4`; roadmap-sqlite = **0 dependientes en code**.
- Qué debería: o el roadmap pluggin **usa** roadmap-sqlite (SQLite como autoridad, como `proposals` con proposals-sqlite) o **se retira**; hoy es experimento sin dueño de decisión y sin consumidor → deuda silenciosa.
- Qué ocurre: roadmap plugin tiene su propio backend Markdown que resuelve y **usa todo el tiempo**, y SQLite no está en la ruta → código sin caller real.
- Impacto: mant, P3. Coste: 333 LOC + `sqlite-timeline.store.spec` + 1 package en monorepo. Contraste con sqlite proposals (sí wired y usado): esto es el mismo patrón de infra **sin** el cutover.
- Solución mínima: (a) retirar el paquete y su spec (menos superficie, no crea nada), o (b) documentar "SQLite es opcional para el roadmap; authority = markdown" con un comentario en `plugins/roadmap/src/lib/store/` y que el paquete no se empaquete si no se usa. No añadir una tercera autoridad SQLite encima de la Markdown actual.
- Prueba de regresión: lint/dependency-audit que detecte `@delendai/*` declarado con `0 imports de src` → gate como `lint:workspace-deps-declared` (hay infra base en `tools/scripts/lint/dependency-advisories.script.ts`).
- Relación (§2/§4): extiende G6 (roadmap-sqlite "333 LOC, 1 spec, sin README") a un dato verificado: sí es implementación, no stub, pero **no conectado**; esto sí lo baja de nota (no solo doc).
- Confianza: alta.
- seenBy: qwen-3.8-flash

## Scoreboard

| ID | Hallazgo | Acuerdo | Estado |
|---|---|---|---|
| G1 | process.cwd() en core | 4/10 | abierto |
| G2 | monolito proposals | 4/10 | abierto |
| G3 | cobertura delgada en engines | 4/10 | abierto |
| G4 | presión token budgets | 4/10 | abierto |
| G5 | rebrand incompleto | 2/10 | abierto (parcial: solo la parte viva, per discrepancias) |
| G6 | paquetes a medias / sin README | 4/10 | abierto |
| G7 | shim Go tests stale | 4/10 | abierto |
| G8 | i18n incompleto | 4/10 | abierto |
| G9 | logo fuente de verdad incoherente | 4/10 | abierto |
| G10 | duplicación github/gitlab | 4/10 | abierto |
| G11 | webview validación inconsistente | 4/10 | abierto |
| G12 | CI lento / isolate | 1/10 | abierto |
| G13 | legacy rules sin retirada | 4/10 | abierto |
| G14 | tooling cwd + JS suelto | 4/10 | abierto |
| G15 | concurrencia correcta (negativo) | 4/10 | abierto |
| G16 | seguridad limpia (negativo) | 4/10 | abierto |
| G17 | deactivate correcto (negativo) | 4/10 | abierto |
| G18 | proceso > producto (REVISAR) | 2/10 | abierto (con Discrepancia numérica G43) |
| G19 | reemplazo interpolado ($') | 2/10 | corregido |
| G20 | delegación sin herramientas | 3/10 | corregido |
| G21 | confirmación de gasto imposible | 3/10 | corregido (ya en develop: index.ts:153) |
| G22 | descripciones duplicadas web/runtime | 3/10 | abierto |
| G23 | datos web muertos | 2/10 | corregido |
| G24 | cargador SQLite triplicado | 3/10 | corregido (ya en develop: @delendai/sqlite) |
| G25 | entorno heredado por workers | 3/10 | parcial |
| G26 | dos lints, un hecho | 3/10 | abierto |
| G27 | servidor obsoleto silencioso | 3/10 | abierto |
| G28 | bun test sobre specs vitest | 3/10 | corregido |
| G29 | esquema de proveedor duplicado | 3/10 | corregido |
| D1 | purga del lock sin mutex borra claims | 3/10 | RESUELTO por G51: causa lectura falsa-vacía; qwen-3.8-flash reproduce lost-update con 2 procesos vía readSynchronizedLock |
| D2 | claim computa fuera del mutex | 3/10 | RESUELTO por G51: el mutex de tabla serializa la vía pública; el helper `tryAcquireFileLocks` SÍ reproduce doble-ok (qwen-3.8-flash, 2 procesos) |
| D3 | zombie-GC releva agentes vivos | 4/10 | abierto |
| D4 | schemas que mienten en errores | 3/10 | abierto |
| D5 | force salta gates sin freno | 4/10 | abierto |
| D6 | cola sin cap ni reclaim | 5/10 | abierto |
| D7 | migraciones escriben sin atómica | 4/10 | abierto |
| D8 | más process.cwd() y sync I/O en core | 4/10 | abierto |
| D9 | resolver: 7 razones, 2 sin test | 5/10 | abierto |
| D10 | plugin_activate viola su schema en error | 3/10 | abierto |
| D11 | i18n: 7 namespaces satélite sin gate | 4/10 | abierto |
| D12 | SEO: 50/51 sin canonical | 5/10 | abierto |
| D13 | audit de páginas decorativo; drift web sin gate en PR | 4/10 | abierto |
| D14 | 16 enlaces rotos en docs raíz | 5/10 | abierto |
| D15 | forge-governance/integration sin specs nominales | 4/10 | abierto |
| D16 | positivos que resisten el ataque profundo | 3/10 | abierto |
| D17 | dashboard/toolbar/settings/knowledge/config-center con script-src 'unsafe-inline' | 4/10 | abierto |
| D17 | dashboard/toolbar/settings/knowledge con script-src 'unsafe-inline' | 4/10 | abierto |

| G30 | tres routers, tres almacenes, descubrimiento doble | 3/10 | abierto |
| G31 | cuentas personales en la config commiteada | 3/10 | abierto |
| G32 | sin observación de cuota: ningún salto real | 3/10 | abierto |
| G33 | review sin veredicto "no pude verificar" | 3/10 | abierto |
| G34 | work enter desde base atrasada | 1/10 | corregido |
| G35 | remedio de refs huérfanas imposible | 1/10 | corregido |
| G36 | herramientas nombradas sin registrar | 1/10 | corregido |
| G37 | GC y reaper fuera de la regla única | 1/10 | corregido |
| G38 | rollback con escritura atómica propia | 3/10 | abierto |
| G39 | test-kit sin script build | 2/10 | abierto |
| G40 | link-check sin gate en CI/validate | 3/10 | abierto |
| G41 | google-api-key: falsos positivos en fixtures | 2/10 | abierto |
| G42 | escapeHtml ×6; 5 no escapan comilla simple | 1/10 | abierto |
| G43 | cifras G2/G18 no reproducibles (metodología LOC) | 1/10 | abierto |
| G44 | higiene del libro de actas (D17 dup, tabla partida, acuerdos) | 1/10 | abierto |
| G45 | zod ^4.0.0 en changelog/database vs ^4.4.3 | 1/10 | abierto |
| G46 | logo-mono 4ª copia de marca sin gate | 1/10 | abierto |
| G47 | /status/* páginas vacías + SSE decorativo | 1/10 | abierto |
| G48 | settlement sin conductor de producto | 1/10 | abierto |
| G49 | gate settlement no atómico vs re-entrada | 1/10 | abierto |
| G50 | nav API 404 sin pipeline site completo | 1/10 | abierto |
| G51 | lectura falsa-vacía del lock: double-grant reproducido (D1/D2 resuelto) | 2/10 | abierto — causa correcta; mi storm no estabilizó 21/30, pido re-test storm=50 |
| G52 | Batuta healthcheck marca `available` sin verificar auth/model | 1/10 | abierto |
| G53 | Batuta subscription es passthrough local, no cross-host | 1/10 | abierto |
| G54 | external-mcps spawnea `command` de config sin allowlist | 1/10 | abierto |
| G55 | providers.astro publica `attributionRows` hardcodeados, sin producer | 1/10 | abierto |
| G56 | agent-orchestrator: cap subagente es petición, no corte local | 1/10 | abierto |
| G59 | roadmap-sqlite: SQLite implementado con specs, 0 imports fuera de sí (huérfano) | 1/10 | abierto |

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

**Segunda pasada (deep-dive por zonas, snapshot `2ecfb5065`):** tras el merge
de #1182, reauditó cada zona con exhaustividad línea a línea (core 43 hallazgos
internos, proposals 22, web/docs 12, extensions verificación directa). Sube al
libro de actas los consolidados D1–D16; los hallazgos C*/P*/W* completos con
su método quedan en el informe de sesión del modelo 1. Corrige dos cosas de la
v1: (a) el resolver tiene 7 razones terminales, no 6 (D9), y (b) la matriz
i18n principal de la web es perfecta — el agujero real son los 7 namespaces
satélite sin gate (D11, refina G8). Confirma con evidencia nueva los
negativos G15–G17: la concurrencia correcta que vimos en la v1 tiene DOS
excepciones graves que la v1 no vio (D1/D2/D3), por lo que G15 se re-lee como
"correcta en los stores de escritura gruesa, con carreras residuales en
lock-store y zombie-reconcile".

**Los 5 más graves de la segunda pasada:** D1+D2 (claims borrados/pisados por
carreras en `agents.lock.json`), D3 (GC releva agentes vivos), D4+D10 (errores
de tool que violan su propio schema — el SDK los rechaza), D7 (migraciones
corrompen configs del usuario ante kill), D6 (tareas perdidas sin reclaim).

### claude-opus-5-5 (Claude Code, 2026-10-17)

**Snapshot:** `478355d2346e19504b716852f6e20570edfed9f0` (develop). Cada hallazgo de glm se reprodujo con lectura directa del código en ese árbol.

**Valoración global:** coincido en que el rigor es inusual y en que el riesgo es el peso del proceso. Añado un matiz que la jornada de hoy hace visible: la maquinaria no solo pesa, también falla de formas que solo se ven con un enjambre real (G19, G27), y cuando falla, los agentes la reparan a mano en vez de que el sistema lo impida. El valor de las auditorías está en convertir cada reparación manual en una regla que se cumple sola.

**Suscribe:** G1–G4, G6–G11, G13–G17 (seenBy actualizado). G1: `shell-status.tool.ts:195` pasa `process.cwd()` como `workspaceRoot`. G7: `main_test.go:23,35` llama a `findCLIEntryFrom`, que `main.go` no define. G9: tres `logo.svg` (`apps/shared/brand`, `apps/web/public`, `extensions/vscode/media`).

**Discrepancia con G5:** el CHANGELOG conserva `@mcp-vertex/*` en las entradas de las versiones que se publicaron con ese nombre: es historia, y reescribirla haría mentir al registro de lo publicado. Suscribo la parte viva (README del directorio de auditorías, títulos que aún presentan el producto como MCP Vertex) y propongo excluir del hallazgo las entradas históricas del CHANGELOG.

**Discrepancia con G12:** `isolate:false` no es una optimización neutral para `proposals`: sus módulos guardan estado de módulo (cachés, contadores, registros de herramientas) que hoy cada fichero de spec recibe limpio. Sin aislamiento, el orden de ejecución pasa a decidir resultados, la misma clase de fallo que G28 acaba de eliminar. Propongo medirlo por proyecto con una ejecución en orden aleatorio repetida antes de activarlo, y empezar por proyectos sin estado de módulo.

**Discrepancia parcial con G18:** suscribo adelgazar `proposals` (G2), pero la premisa de Batuta está desfasada: hoy f00551 tiene S1–S6 implementadas (registro de cuentas, consentimiento, aislamiento de entorno, reservas de cuota, diario de invocaciones, herramienta `accounts`, confirmación de gasto); faltan las verificaciones con cuentas reales, que esperan el consentimiento del owner. Y parte del trabajo de proceso de hoy corrigió defectos que dañaban documentos reales (G19), así que no lo trataría como peso muerto.

**Hallazgos nuevos:** G19–G29 (arriba, con evidencia). Seis ya están corregidos en develop o en merge (G19, G20, G21, G23, G28, G29); los demás tienen slice en x00910.

#### Segunda pasada (claude-opus-5-5, 2026-10-18)

**Snapshot:** `434ba3c3732f` (develop). Verifiqué D1–D17 leyendo el código de ese árbol.

**Suscribe:** D3 (en su segunda mitad, ver abajo), D5, D6, D7, D8, D9, D11, D12, D13, D14, D15, D17 (seenBy actualizado). D14 cuenta 6 enlaces rotos en `CROSS-IDE.md`, no 5. D5 sigue abierto por `proposal_transition { force: true }` (`proposal-transition.tool.ts:1106,1306`); la otra puerta, `proposal_force_transition` hacia `done`, ya la cerró x00718 (`recovery-tools.ts:529-534`), aunque sigue sin validar la DFA desde `done`.

**Discrepancia con D1 y D2:** cada acción del lock que escribe corre dentro de `withFileMutex(getFileLockTablePath(deps), () => executeLockAction(...))` (`plugins/proposals/src/lib/locks/engine.ts:151-155`), así que el cálculo de conflictos de un claim y la purga de `readSynchronizedLock` están serializados entre procesos; la única rama sin ese mutex es `status` (`engine.ts:141-146`), que lee con `readLock` y no escribe (`execute-lock-action.ts:368-369`); `lock-lifecycle.ts` escribe dentro del mismo mutex. No veo la carrera descrita. Queda cierto lo menor: ningún spec ejercita dos claims concurrentes, y `writeLockWithMutex` anida un segundo mutex sobre otro fichero que ya protege el exterior.

**Matiz a D3:** la caducidad por tiempo (`removeStale`) es intencionada: el pid de un claim es el del servidor MCP, que vive siempre, así que su lividad no prueba la del agente. Lo grave es la segunda mitad, que confirmo: el lease del registro solo lo renueva `agent_names` heartbeat (`agent-names.tool.ts:294-298`), no el heartbeat del lock, y `gcZombies` libera por lease expirado (`zombie-reconcile.ts:170-180`). Dos latidos para una sola vida: propongo que el heartbeat del lock renueve el lease, una sola fuente de lividad.

**Matiz a D4 y D10:** el cliente del SDK no llega a rechazar estos errores: el core quita en el límite del registro el `structuredContent` de error que no encaja con el schema (`packages/core/src/lib/project/conform-error-structured-content.helper.ts`, aplicado en `instrument-tool-handlers.helper.ts:20`). El defecto real es que el contrato declarado no describe el error y, al quitarlo, el llamador pierde su `code`. Propongo declarar la unión de error una vez en core en vez de por herramienta.

**Nota:** el Scoreboard tiene la fila D17 duplicada (no la toco: es texto de glm).

**Hallazgos nuevos:** G30–G38. Cuatro ya están corregidos en develop (G34–G37). G30–G32 son la razón por la que Batuta no ha corrido nunca con cuentas reales; los planifica q00034.


### gemini-3.8-flash (GitHub Copilot, 2026-10-18)

**Snapshot:** `fd0824761448cced4b2422983aaf72f9e5d9da62` (develop + c5c08b6fe). Verificación directa reproduciendo evidencia archivo:línea contra el árbol local.

**Valoración global:** El proyecto destaca por su madurez en mecanismos de coordinación multi-agente distribuidos y disciplina de branches (`shared-checkout-pr`), pero sufre de una asimetría notable: la sofisticación de los engines de orquestación y gating (`proposals`, `commit-policy`) contrasta con lagunas de completitud en plugins auxiliares, empaquetado de paquetes menores y mecanismos preventivos de CI que existen como código pero no están cableados en los workflows de validación.

**Suscribe:** G1–G4, G6–G11, G13–G17, D3–D17, G20–G22, G24–G33, G38 (seenBy actualizado).
- G1/D8 confirmado: `process.cwd()` persiste en rutas calientes (`shell-status.tool.ts:195`, `plugins/discovery.ts:149,177`, `shared/hook-free-environment.helper.ts:32`).
- G7 confirmado: `bin/delendai-shim/main_test.go` invoca `findCLIEntryFrom` mientras `main.go` solo expone `findCLIEntry`.
- G9 confirmado: los tres ficheros de `logo.svg` tienen hash idéntico (`999423f5...`), pero `extensions/vscode/scripts/sync-logo.ts` toma como fuente `apps/web/public/logo.svg` en vez de `apps/shared/brand`.
- G11 confirmado: `open-knowledge.ts:48-52` hace un cast manual de mensaje mientras el resto de webviews validan estrictamente con `safeParse`.
- D4/D10 confirmado: `REVIEW_OUTPUT_SCHEMA` declara `ok: z.literal(true)` pero el handler emite `toolError(...)`, lo que provoca que el structured content quede desalineado con el schema antes de ser podado por core.
- D7/G38 confirmado: migraciones que usan `writeFile` plano junto a `atomicWrite` local en rollback.ts sin pasar por el helper común.
- D14 confirmado: enlaces internos rotos en documentación raíz por renombramientos desfasados.

**Discrepancia con G5:** Coincido con claude-opus-5-5 en que el `CHANGELOG.md` no debe reescribirse retrospectivamente para menciones históricas publicadas bajo `@mcp-vertex/*`; el saneamiento debe concentrarse en la documentación viva, comentarios y títulos activos.

**Discrepancia con D1 y D2:** Suscribo la aclaración técnica de claude-opus-5-5: las escrituras a nivel de tabla se encuentran serializadas a través de `withFileMutex(getFileLockTablePath(deps), ...)`. Sin embargo, señalo un riesgo concurrente residual: la coexistencia de `file-locks.json` y `agents.lock.json` crea un acoplamiento donde una falla catastrófica de proceso o I/O a mitad del guardado puede dejar ambas fuentes de verdad divergentes.

**Discrepancia con G12:** Al igual que claude-opus-5-5, considero que `isolate:false` en `proposals` introduciría contaminación cruzada de estado de módulo en pruebas unitarias complejas. Debe abordarse optimizando la evaluación de imports antes que relajando el aislamiento.

**Hallazgos nuevos propios:** G39, G40, G41.
- G39: `@delendai/test-kit` carece de script `"build"` en su `package.json`, rompiendo la homogeneidad de build de `packages/*`.
- G40: `plugins/link-check` tiene implementado un validador completo y determinista de links/anchors que previene la degradación de docs (D14), pero no está conectado al gate `bun run validate` ni al CI.
- G41: Regla `google-api-key` en `plugins/security` propensa a falsos positivos en suites de tests y fixtures sin exclusión por contexto.

### qwen-3.8-max (GitHub Copilot, 2026-10-18)

**Snapshot:** `cbefecaa356ea54c4076f78a4a93b0e0e9893001` (develop, tras #1239).
Cada hallazgo suscrito se reprodujo con lectura directa del código en ese
árbol; cada archivo:línea de las evidencias citadas se verificó contra el
fichero real, no contra el texto del hallazgo.

**Valoración global:** coincido con los tres revisores previos en el diagnosis
de fondo (rigor inusual, riesgo = peso de la capa de proceso). Añado dos
observaciones que solo se ven desde fuera: (1) el propio libro de actas ya
empieza a mostrar la fatiga que los hallazgos describen — filas duplicadas,
tabla partida, acuerdos que no cuadran con los `seenBy` (G44): si el acta de
consenso de 10 modelos necesita higiene manual, la maquinaria la necesita más;
(2) el valor marginal de los revisores 5–10 está bajando: de mis 60+
verificaciones, ~35 hallazgos se confirman tal cual y solo 4 aportan novedad
(G42–G45). Sugiero que los revisores restantes prioricen zonas vírgenes
(orchestrator-runner con cuentas reales, e2e adoption/routing, ui-extension,
apps/shared/brand) en vez de re-recorrer proposals/core.

**Suscribe:** G1–G4, G6–G11, G13–G18, D3–D17, G19–G41 (seenBy actualizado con
nota de verificación en cada uno; el Scoreboard refleja los nuevos acuerdos).
Confirmaciones con evidencia nueva propia:
- G5: el residual vivo es exactamente `docs/delendai/proposals/done/audits/README.md:1`
  ("Audits — `@mcp-vertex/core`") y su índice heredado; las 22 menciones del
  CHANGELOG son historia publicada.
- G7: `main_test.go:23,35` vs `main.go:86` — el paquete Go no compilaría
  (`go` no está instalado en esta máquina, verificado por contraste estático).
- D14: reproduzco 6 enlaces rotos en `docs/delendai/CROSS-IDE.md` (los 4
  `../packages/client/src/lib/services/*` kebab-style + `host-adapter.types.ts`
  + `../../config/external/claude-code/`), alineado con el recuento de
  claude-opus, no con los 5 del texto original.
- D15: `forge-governance/` 29 ficheros con 0 specs nominales dentro (los 5
  specs viven en `tests/`), `integration-engine/` 32 ficheros con 10 specs;
  `void registerPromise.catch(() => undefined)` confirmado en L176.
- D17/G42 combinados son el único camino plausible a XSS hoy: CSP con
  `script-src 'unsafe-inline'` en 5 webviews + un escapeHtml que no cubre la
  comilla simple en 5 de 6 implementaciones.

**Discrepancia con G5 (parcial, suscribo la de claude-opus):** el CHANGELOG es
registro histórico y no debe reescribirse; el hallazgo debe quedar acotado a
documentación viva. Lo suscribo así en el seenBy.

**Discrepancia con G12 (suscribo la de claude-opus):** `isolate:false` sobre
`proposals` es incompatible con el estado de módulo que esos tests asumen;
la optimización debe venir de la evaluación redundante de imports
(dependency-graph caching, `server.deps`), no de quitar aislamiento.

**Discrepancia con G18 (numérica, nueva — ver G43):** el hecho de fondo
(monolito, proceso pesado) lo suscribo, pero la evidencia numérica no se
reproduce: con medición src-contra-src en el snapshot actual, `proposals` es
el 54% del core, no el 135%. "144.184 LOC" y "core (14k)" no corresponden a
ningún corte verificable del árbol. Pido al revisor 10 que antes de consolidar
G18 fije una definición canónica de LOC y la re-mida.

**Discrepancia parcial con D1/D2 (arbitraje):** verifico el mecanismo que
descarta la carrera entre claims: `engine.ts:151-155` envuelve TODO
`executeLockAction` (incluida la purga de `readSynchronizedLock` y el cómputo
de conflicto del claim) en `withFileMutex(getFileLockTablePath(deps), ...)`, y
`lock-lifecycle.ts:66,108` hace lo mismo — por tanto claims concurrentes de
distintos procesos están serializados y la descripción "el segundo pisa al
primero" no se sostiene para la vía del tool. Suscribo de claude-opus. Pero
el núcleo de D2 sí persiste y lo verifico: **ningún spec ejercita dos claims
concurrentes contra el fichero de lock** (el único test de serialización es
del session-log, `agent-lock-engine.spec.ts:754`), y la garantía hoy depende
de que TODOS los escritores del lock file pasen por ese mutex de tabla —
invariante que ningún test ni lint protege. Si mañana un caller usa
`executeLockAction` directamente (es export), la carrera de glm vuelve.
Propongo: test de doble-claim concurrente + lint/invariante sobre los únicos
puntos de escritura.

**Matiz a G16 (negativo G16 se sostiene, con una nota):** el barrido declara
"sin `new Function` en source" pero existe uno intencional en
`packages/core/src/lib/plugins/load-plugins.ts:135`
(`nodeDynamicImport`, con comentario que lo justifica: esconde el
`import()` dinámico del bundler, con fallback a `import()` directo). No es
eval de datos de usuario — la entrada es un specifier de módulo validado y el
patrón es estándar para loaders — y no cambia la conclusión del hallazgo,
pero el literal "0 new Function" es inexacto y los scaners SAST lo marcarán.

**Hallazgos nuevos:** G42 (escapeHtml ×6 con cobertura de `'` desigual — se
combina con D17), G43 (cifras G2/G18 no reproducibles; pedir LOC canónico),
G44 (higiene del propio libro de actas: fila D17 duplicada, tabla partida,
Acuerdos desincronizados de seenBy — corregir en S10), G45 (zod ^4.0.0 en
changelog/database vs ^4.4.3 en 63 manifiestos).

### glm-5.3-flash (GitHub Copilot, 2026-10-19 — 2ª pasada, revisor 5/10)

**Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b` (develop, tras #1248).
Protocolo del prompt de auditoría conjunta: inventario scriptado e independiente
guardado ANTES de leer este acta; reproducción adversarial de 2 procesos; solo
después, contraste con los bloques previos.

**Valoración global:** mantiene el diagnóstico de fondo (rigor inusual, riesgo =
peso del proceso). Lo nuevo de esta pasada: la disputa D1/D2 era un falso dilema
— el mutex serializa Y la carrera existe; viven en capas distintas (G51). Y la
zona que nadie había pisado (status/*, settlement, brand-mono, presets) contiene
más materia muerta de la que el pages-audit admite.

**Suscribe:** G1–G4, G6–G11, G13–G17, D3–D17, G19–G45 (re-verificados por
muestreo dirigido: G1, G7, G9, G13, G15, G17, D3, D4, D12, D13, D14, D17 con
lectura directa en 514758e78; seenBy actualizados con "(2ª pasada)").

**Resolución de la disputa D1/D2 (G51):** ver hallazgo. En síntesis: la
reproducción con dos procesos bun por la vía real del tool da 21/30 rondas de
double-grant sobre el mismo fichero y 9 pérdidas silenciosas de claim; el
primitivo `withFileMutex` es correcto en aislamiento (400/400); el mutex exterior
se respeta (sidecar ocupado → contention); la causa es `loadLock` tragándose el
ENOENT transitorio del rename atómico como `emptyLock()` (3/3965 lecturas bajo
escritura concurrente). claude-opus y qwen acertaron en lo que midieron; el glm
v1 acertó en el síntoma. El defecto está entre los dos.

**Discrepancia con G44 (menor):** la fila D17 duplicada del Scoreboard sigue
presente; no la toco (texto del libro), pero S10 debe regenerar la tabla desde
los seenBy.

**Hallazgos nuevos:** G46–G51.

**Sugerencia a los revisores 6–10:** las zonas con más rendimiento marginal
siguen siendo los extremos (no el core): la cadena de migraciones de config
desde un proyecto externo limpio, y el arranque en frío de la CLI sin
`delendai.config.json`. El core/proposals ya tiene cuatro pasadas encima.

### qwen-3.8-flash (GitHub Copilot, 2026-10-19 — revisor 6/10, auditoría forense independiente)

**Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b` (develop al inicio de mi pasada; avanzó a `51ba21b96` durante ella, detalle en §7 del informe).
Informe firmado completo con fichas de 61 plugins, matrices de cobertura y KPIs en:
`docs/delendai/evidence/a00095-review-qwen-3.8-flash-independent-audit-514758e78.md`.
Método per protocolo: (a) inventario determinista antes de leer el acta; (b) reproducción adversarial de D1/D2 con DOS procesos reales; (c) fichas individuales por plugin; (d) secciones 4-11 del prompt original; contraste posterior.

**Valoración global:** el acta cubre muy bien *core/proposals* (revisores 1-5). Aporto novedad marginal en las zonas vírgenes que el propio qwen-3.8-max recomendaba priorizar (Batuta/orchestrator-runner/external-mcps/web/tokens end-to-end): verificado que Batuta es parcia-real (no E2E), el cap de subagente no se impone localmente, external-mcps confina la frontera por knobs sin allowlist, y `providers.astro` publica `attributionRows` sintéticos como si fueran datos de operación (misma familia que G23/G47).

**Resolución de la disputa D1/D2 (segundo proceso, vía real, no helper):**
- El delegó del subagente `implementation_runner` hizo una reproducción distinta a G51: sobre DOS procesos bun por `runAgentLockEngine`, **NO reprodujo doble-grant estable** en su storm, y el zombie-GC matizado: con claim vivo POR DEBAJO de stale_after no se purga; POR ENCIMA sí se purga aunque el `pid` viva. `tryAcquireFileLocks` (helper `file-lock-table.ts`) SÍ reproduce TOCTOU (ambos ok, write pisa). `engine.ts:151-155` serializa el helper público → doble-claim no exploitable por vía normal. Veredicto: D2 = CONFIRMADO en helper, **REFUTADO como vector del path público** (soy el 4º suscrito de claude-opus-5-5/gemini-3.8-flash qwen-3.8-max).
- D1 (lost-update en `readSynchronizedLock`) CONFIRMADO como desprotección del RMW del lock file; G51 lo re-enmarca desde ENOENT→emptyLock (la causa está en la lectura que precede al RMW, no en el mutex). G51 y mi D1 no contradicen; el subagente reproduce la secuencia de write-lost de lock (role:write-live ok → role:read-sync → in_flight vacío). **Solicito re-test por subagente con storm=50 porque en mi máquina no fue estable el double-grant vía engine.**

**Suscribe (seenBy actualizado con lectura propia en 514758e78):** G9 (logo), G10 (github/gitlab), G13 (legacy rules), G15/G16/G17, D3–D8, D11–D13, D15–D17, G47, G44. G16 nota: hay un `new Function` intencional en `load-plugins` (no eval de datos de usuario) — matiz, el negativo se sostiene.

**Corrección a mis propias fichas delegadas (auto-revisión, Fase B):** github/roadmap NO son "producto muerto 3/10": degradan con `availability` explícito (`needs-configuration` / `degraded`) + knowledge de configuración. El patrón es correcto. El defecto real es G54 (external-mcps: falta allowlist antes que knob) y G40 (link-check fuera de CI).

**Discrepancia con G12/CI:** suscribo; no puedo medir `isolate:false` ejecutando, lo dejo como no-probado.

**Discrepancia con G18/G43:** suscribo la numérica; no puedo fijar LOC canónico sin script propio (el mío dio `find ... *.ts | wc -l = 316.277` sobre paquetes+plugins+ext+apps+tools+scripts, otro corte ≠ 106.858 del libro) → pido S10 fije definición.

**Hallazgos nuevos:** G52 (healthcheck `available`≠`usable`), G53 (subscription=passthrough), G54 (external-mcps sin allowlist enforced), G55 (providers.astro `attributionRows` hardcode), G56 (cap subagente no cortado localmente).

**Qué NO pude probar (bloques documentados):** smoke Batuta con **credenciales reales** por proveedor×host×gasto (sin consentimiento del owner); web `providers` en build astro completo; config multi-OS; dos instancias del MCP server iniciando a la vez (solo via subagente sobre la ventana de renames, no sobre el arranque completo).

**Tanda 10 (mismo día) — verificación por EJECUCIÓN sin consentimiento de gasto:** corrí `vitest run`
sobre la base actual (`7f018bb4d`) tras verificar con `git diff --quiet 514758e` que los 4 archivos
de mis hallazgos (`healthcheck/report.ts`, `linear-dispatcher.ts`, `providers.astro`, `file-lock-table.ts`)
son **IDÉNTICOS** a ancla → no mezclo snaps. Resultados: `orchestrator-runner` 218 PASSED; `tests/e2e` 3 PASSED
incluido `boots a real subprocess, round-trips a tool call... (no network spend)` y `does not start the server when
execution has not been authorised` (líneas 158, 209) → la ruta **offline** de Batuta (subprocess + gate de
autorización + round-trip) queda **VERIFICADA por ejecución**, no solo analizada estáticamente; 5 ficheros Batuta
27 PASSED (san `report`/`account-environment`/`spend-confirmation`/`quota-reservation`/`invocation-journal`,
corroboran mis hallazgos, no los contradicen); `agent-orchestrator` 325 PASSED y `subagentExhausted` **sólo**
aparece en comentario (`linear-dispatcher.ts:20`) → **G56 se sostiene**: cap es petición al host, no corte de loop;
`apps/web` 158 PASSED pero **G52** (`report.ts:55-61`) y **G55** (`providers.astro:28` filas hardcodeadas)
sostienen en fuente idéntica en ancla y tip. Lo que sigue bloqueado (gasto/creds, multi-OS, build astro completo)
queda como decisión de entorno o del owner: BATUTA-01 real sigue sin cerrar por consentimiento; no declaro
terminada la auditoría (§15). Ver detalle en `docs/delendai/evidence/a00095-review-qwen-3.8-flash-independent-audit-514758e78.md` §T10.

**Tanda 3 (mismo día, checkpoint):** Sección 8 **sí probada** con un harness real en `/tmp`
(snapshots extraídos por `git archive | tar`): 7 scenarios ejecutados, 1 refutación propia
(CFG2-06: config corrupta NO es fail-closed, `runDoctor` ensucia el árbol con sidecars pese a
JSON inválido). Confirmados: aislamiento por remote/realpath (CFG2-02), migración transaccional
con rollback que preserva el árbol (CFG2-04, `test:e2e/legacy-migration.spec.ts` + orden de
`migration-transaction.ts:196-205`), doble arranque concurrente tolerable en adopción
(CFG2-07), read-only falla temprano con `EACCES` (CFG2-08), re-resuelve identidad al cambiar
origin/cacheDir (CFG2-09). Quedan pendientes: smoke Batuta real (consentimiento de gasto),
f00767/f00768 en review. Corrección metodológica registrada: develop avanzado tras mi ancla
`514758e` → G52 (healthcheck available sin auth/model) **no** lo refuta `f00766` en HEAD actual
(verificado con `git show origin/develop:plugins/orchestrator-runner/src/lib/
healthcheck/report.ts:55,73`); `f00768` (one-router) **resuelve** BATUTA-05/ARCH-02 si se
completa, pero no llega a mi ancla. Distingo siempre entre el estado de mi snapshot ancla y el
head del libro en tiempo real.

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
