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
  reviewers-completed: 3
  reviewers:
    - model: glm-5.3-flash
      host: github-copilot
      date: 2026-10-17
      snapshot: 2d0f8a5c3bb19bc45d8dee7602a54410ee338119
      scope: full-repo
    - model: claude-opus-5-5
      host: claude-code
      date: 2026-10-17
      snapshot: 478355d2346e19504b716852f6e20570edfed9f0
      scope: full-repo
    - model: gpt-5.4
      host: github-copilot
      date: 2026-10-19
      snapshot: 514758e783620c8953079be4d71fceccacb3de8b
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
- seenBy: glm-5.3-flash, claude-opus-5-5, gpt-5.4

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
- seenBy: glm-5.3-flash

### D2 — El claim completo computa fuera del mutex
- Clasificación: `CONFIRMADO` · Zona: proposals/locks (segunda pasada, GRAVE)
- Evidencia: `execute-lock-action.ts:29-206` — todo el cómputo de conflicto
  (overlap L75-103, file-table L106-160) se hace sobre el snapshot leído sin
  retener mutex; solo el `writeLockWithMutex` final es atómico. Dos claims
  simultáneos de ficheros disjuntos pueden pasar ambos el check y el segundo
  pisa al primero. El test de serialización solo existe para el session-log
  (`agent-lock-engine.spec.ts:754`), no para el fichero de lock.
- seenBy: glm-5.3-flash

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
- seenBy: glm-5.3-flash

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
- seenBy: glm-5.3-flash

### D5 — `force:true` y `proposal_force_transition` saltan gates sin freno
- Clasificación: `CONFIRMADO` · Zona: proposals/transiciones (segunda pasada, ALTA)
- Evidencia: `proposal-transition.tool.ts:1106,1143,1186,1199,1306-1313` —
  `force:true` desactiva completeness, validate, evidencia CI y el peer-review
  gate entero con solo un apunte de auditoría; fuerza + cero slices declarados
  = cierre sin revisión posible. `recovery-tools.ts:542-600`:
  `proposal_force_transition` no valida la DFA (permite `done→in-progress`,
  resurrección de algo ya enviado) y no pasa por `recordPeerReviewBypass`.
- seenBy: glm-5.3-flash

### D6 — Cola de tareas sin cap ni reclaim: tarea perdida si el worker muere
- Clasificación: `CONFIRMADO` · Zona: proposals/cola (segunda pasada, ALTA)
- Evidencia: `persistent-task-queue.ts:395-430` — `enqueue` acepta siempre;
  los umbrales red/amber (`reportBackpressure` L700-710) son informativos,
  nadie rechaza. `dequeue` marca `consumed` (L437-470) y no existe reclaim:
  `expireSweep` solo toca entradas `queued` (L642-648). Un worker muerto tras
  dequeue pierde la tarea para siempre. El propio sistema se auto-encefila:
  el GC emite eventos watchdog a la misma cola (`agent-names.tool.ts:289-310`),
  patrón del incidente R-2026-08-31.
- seenBy: glm-5.3-flash

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
- seenBy: glm-5.3-flash, gpt-5.4

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
- seenBy: glm-5.3-flash

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
- seenBy: glm-5.3-flash

### D10 — `plugin_activate`/`plugin_deactivate` violan su propio outputSchema en error
- Clasificación: `CONFIRMADO` · Zona: core/tools (segunda pasada, ALTA)
- Evidencia: `tool-surface.tool.ts:154` declara
  `outputSchema: z.object({ change: PLUGIN_CHANGE.nullable() })` pero el
  handler devuelve `toolError(...)` (envelope `{ok:false,...}`) cuando el
  plugin no existe: el structuredContent del path de error no valida contra el
  schema declarado. Mismo patrón a auditar en D4.
- seenBy: glm-5.3-flash

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
- seenBy: glm-5.3-flash

### D12 — SEO de la web: 50/51 páginas sin canonical; hreflang solo en home
- Clasificación: `CONFIRMADO` · Zona: apps/web (segunda pasada, NUEVO)
- Evidencia: `Base.astro:88-96` emite title/description/og:title/og:description
  pero no canonical/og:url/og:image. `grep -rl 'rel="canonical"'` → solo
  `index.astro:54`; hreflang solo `index.astro:42-49`. 12 variantes de URL por
  página = duplicación para crawlers. Añadido: sin prefetch
  (`astro.config.mjs:54-83`) y pagefind indexa los 12 duplicados
  (`apps/web/package.json:22`, índice ×12).
- seenBy: glm-5.3-flash

### D13 — El audit de páginas es decorativo y el drift de manifests web no se detecta en PR
- Clasificación: `CONFIRMADO` · Zona: apps/web (segunda pasada, NUEVO)
- Evidencia: `pages-audit.ts:44-48` dice que `rewrite`/`merge-into` "deberían
  warn sin fallar" pero `grep -rn PAGES_AUDIT apps/web/src` solo devuelve el
  módulo y su spec: nadie emite el warning, y las 8 páginas `rewrite` siguen
  servidas. `drift.yml:57` corre `gen:all:check` en PR, pero
  `tools/scripts/gen-all.script.ts:73-247` no incluye los manifests de
  `apps/web` (`pages.json`, `skills.json`, `capabilities.json`): su drift solo
  se detecta en push a `main` (`pages.yml:1-13`).
- seenBy: glm-5.3-flash

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
- seenBy: glm-5.3-flash

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
- seenBy: glm-5.3-flash

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
- seenBy: glm-5.3-flash

### D18 — El patrón de `outputSchema` deshonesto se repite fuera de proposals/core
- Clasificación: `CONFIRMADO` · Zona: memory, logs, usage-tracking
- Evidencia: `plugins/usage-tracking/src/lib/tools/clear.tool.ts:41-52`
  declara `ok: z.literal(true)` pero retorna `toolError(...)` si falta
  `confirm:true`; `plugins/memory/src/lib/tools/tools.ts:132-172`
  (`memory_save`), `365-378` (`memory_forget`) y `451-470`
  (`memory_import`) hacen lo mismo ante inputs inválidos o ids ausentes;
  `plugins/logs/src/lib/tools/tools.ts:681-701` (`logs_log`) declara solo
  éxito y retorna `toolError(...)` para `incidentType` inválido.
- Impacto: el problema que D4 y D10 habían localizado en proposals/core no es
  aislado: el contrato MCP anuncia structuredContent de solo-éxito y, en el
  camino de error, varios plugins emiten envelopes fuera de schema. Eso deja
  al SDK rechazando precisamente las respuestas que deberían ayudar al usuario
  a corregir su input.
- seenBy: gpt-5.4

### D19 — El plugin GitLab repite el mismo bug contractual en casi toda su superficie read-only
- Clasificación: `CONFIRMADO` · Zona: gitlab
- Evidencia: `plugins/gitlab/src/lib/tools/shared.ts:744-761`
  define `normalizeRequestError()` como `toolError(...)`, pero los tools de la
  suite declaran `outputSchema` de solo-éxito y en sus `catch` retornan justo
  ese error normalizado: `projects` (`958-1056`), `issues`/`merge_requests`
  (`1107-1244`), `commits` (`1302-1370`), `refs` (`1403-1432`), `pipelines`
  (`1479-1545`), `jobs` (`1612-1736`), `artifacts` (`1776-1854`), `releases`
  (`1899-1976`) y `deployments` (`2022-2085`).
- Impacto: D18 no era un borde de tres plugins; el mismo defecto aparece en una
  familia completa de provider tools de red. Un 404, timeout o permiso faltante
  en GitLab acaba produciendo structuredContent fuera del contrato declarado,
  justo en la superficie donde los errores remotos son parte del camino normal.
- seenBy: gpt-5.4

### D20 — El ratchet de `outputSchema` comprueba la forma declarada, no la congruencia del handler real
- Clasificación: `CONFIRMADO` · Zona: tooling, tests
- Evidencia: `docs/delendai/REPO-RULES.md:181-183` exige "add/keep its
  `outputSchema`", pero no exige verificar los caminos de error; el test
  `packages/core/tests/src/lib/tool-response.golden.spec.ts:1-118` fija la
  serialización del schema declarado de varios tools core, no ejecuta handlers
  ni valida que un `toolError(...)` cumpla el contrato publicado. El resultado
  visible es que el mismo defecto ya vive en proposals/core (D4, D10),
  memory/logs/usage-tracking (D18), GitLab (D19), `search_symbol`
  (`plugins/search/src/lib/tools/search-symbol.tool.ts:48-69`) y los tools de
  diagramas (`plugins/diagram/src/lib/tools/diagram-graph.tool.ts:147-208`,
  `diagram-proposals.tool.ts:97-172`).
- Impacto: el repo ratchea que haya schema y hasta fija su JSON declarado, pero
  no tiene una defensa transversal que ejecute el camino de fallo contra ese
  schema. Por eso el mismo bug supera CI una y otra vez en plugins no
  relacionados.
- seenBy: gpt-5.4

### D21 — El plugin forge solo autodetecta `github.com` y `gitlab.com`, no GitHub Enterprise ni GitLab self-managed
- Clasificación: `CONFIRMADO` · Zona: forge
- Evidencia: `plugins/forge/src/lib/services/forge.ts:457-502` parsea el host
  de `origin` y solo acepta coincidencia exacta con `github.com` o
  `gitlab.com`; cualquier otro host cae en `Unsupported forge provider...`.
  Sin embargo, la surface pública promete solo "auto-detected from the
  `origin` remote" (`plugins/forge/src/index.ts:68-77`) y las read tools
  repiten esa promesa (`plugins/forge/src/lib/tools/forge-read.tool.ts:111-116`).
  La cobertura solo prueba SaaS público exacto (`plugins/forge/src/lib/detect.spec.ts:15-62`).
- Impacto: en cualquier repo corporativo con GitHub Enterprise o GitLab
  self-managed, toda la superficie forge falla aunque el remote sea un forge
  perfectamente compatible y aunque `gh`/`glab` funcionen para ese host.
- seenBy: gpt-5.4

### D22 — `createProjectPlugin()` permite salir del workspace y registrar rutas `../...` en la config
- Clasificación: `CONFIRMADO` · Zona: client/scaffold
- Evidencia: `packages/client/src/node/scaffold/project-plugins.ts:299-313`
  acepta `pluginsRoot` y lo concatena con `join(options.workspaceRoot,
  options.pluginsRoot, id)` sin contención; `configFileName` se concatena igual
  en `:326`; y `relativePluginPath()` (`:227-235`) conserva rutas relativas que
  empiezan por punto, así que un plugin fuera del árbol termina registrado como
  `../.../src/index.ts` en la config. La suite solo cubre el caso feliz de
  `pluginsRoot` explícito (`packages/client/src/tests/project-plugins.spec.ts:296-303`),
  mientras una API vecina sí tiene guard contra `configFileName` escapado
  (`packages/client/src/tests/plugin-activation.service.spec.ts:166-180`).
- Impacto: la API de scaffolding puede escribir el plugin fuera del workspace
  esperado y además dejar en `delendai.config.json` una ruta de plugin fuera del
  árbol del proyecto. Es una inconsistencia de contención en una superficie de
  autoría, no solo una rareza de tests.
- seenBy: gpt-5.4

### D23 — `forge createPr()` inserta la propuesta completa en el body remoto sin ningún límite de tamaño
- Clasificación: `CONFIRMADO` · Zona: forge/write
- Evidencia: `plugins/forge/src/lib/services/forge-write.ts:133-178` lee el
  markdown completo de la propuesta y `buildPrBody()` lo concatena verbatim bajo
  `## Linked Proposal`; `createPr()` (`:349-426`) pasa ese `body` íntegro a
  `gh api` / `glab api` como `body=` / `description=` sin truncado, sin límite
  de bytes y sin degradación alternativa. La suite de
  `plugins/forge/tests/src/lib/services/forge-write.spec.ts:75-184` solo cubre
  casos nominales pequeños.
- Impacto: una propuesta grande puede disparar requests sobredimensionadas,
  fallar por límites del provider/CLI o convertir una operación rutinaria de PR
  en una subida de documento entero no acotada. La ruta ya tenía guardas contra
  traversal del `proposalId`, pero no contra volumen.
- seenBy: gpt-5.4

### D24 — La extensión VS Code está sesgada a `workspaceFolders[0]` y no al folder desde el que se opera
- Clasificación: `PROBABLE` · Zona: extensions/vscode
- Evidencia: `extensions/vscode/src/commands/open-plugin-config.ts:80-99` y
  `plugin-activation.ts:72-89` fijan siempre `workspaceFolders[0]` como raíz
  efectiva; el mismo patrón reaparece en `extension.ts:674-684` (runtime
  observer), `:870-872` (agent timeline) y `:1000-1015` (server command/cwd).
  Las suites cercanas modelan cero o un folder, no escenarios multi-root:
  `open-plugin-config.spec.ts:116-165` y `plugin-activation.spec.ts:16-63`.
- Impacto: en una ventana multi-root, comandos lanzados desde un segundo folder
  pueden leer o escribir configuración, timeline o arranque del servidor contra
  el primer proyecto abierto, no contra el contexto visible para el usuario.
- seenBy: gpt-5.4

### D25 — `run validation` reejecuta el comando fallido en terminal privada sin propagar `cwd`
- Clasificación: `PROBABLE` · Zona: extensions/vscode
- Evidencia: `extensions/vscode/src/commands/run-validation.ts:28-44` toma el
  primer comando fallido del dry-run y lo pasa a `runInPrivateTerminalWithRetry`
  con solo `timeoutMs`; el supervisor sí soporta `cwd` opcional
  (`private-terminal-supervisor.ts:8-15`, `:45-50`) y solo lo propaga al crear
  la terminal si el caller lo rellena. La spec `extensions/vscode/src/test/commands.spec.ts:66-108`
  cubre el caso feliz y el fallo del tool MCP, pero no el camino de reintento ni
  la propagación de cwd.
- Impacto: si un comando de validación depende de rutas relativas al repo, el
  reintento en terminal puede ejecutarse en el cwd del host de la extensión en
  vez de en la raíz del proyecto, produciendo falsos fallos o diagnósticos
  inconsistentes justo en la ruta de recuperación automática.
- seenBy: gpt-5.4

### D26 — `work claim` puede renombrar la unidad sin trasladar de verdad su identidad operativa
- Clasificación: `CONFIRMADO` · Zona: core/work-units
- Evidencia: `packages/core/src/lib/work-units/work-unit-claim.service.ts:36-91`
  renombra el ref y luego llama a `carryUnitRecords()`; pero `moveLease()` en
  `unit-adoption.service.ts:56-68` mueve la lease reescribiendo solo `ref`, no
  `owner`, y `touchUnitOfCheckout()` en `unit-lease.service.ts:87-107` sigue
  refrescando heartbeats con `worktreeAgent(top)`, es decir, con la estampilla
  persistida en el worktree. Resultado: tras "was X, now Y", el nombre del ref
  ya es Y, pero la lease y los heartbeats todavía pueden seguir atribuyendo la
  unidad a X.
- Impacto: el flujo de claim puede dejar desincronizadas tres fuentes de verdad
  del mismo unit-of-work: nombre del ref, lease y stamp del worktree. Eso
  degrada la reentrada automática, la atribución de ownership y cualquier lógica
  que confíe en la lease como identidad actual de la unidad.
- seenBy: gpt-5.4

### D27 — El dashboard web de logs no hace streaming real: entrega un bootstrap sintético y se cierra
- Clasificación: `CONFIRMADO` · Zona: apps/web/status
- Evidencia: `apps/web/src/pages/api/events/[topic].ts:3-16` prerenderiza solo
  dos topics y para cada conexión devuelve un único evento SSE bootstrap y una
  `Response` estática; `pages/status/logs.astro:24-28` abre `EventSource` y lo
  cierra en el primer evento `logs`; `components/logs/LogTable.astro:12-45`
  arranca con `events = []` y no tiene ninguna ruta de hidratación o append de
  eventos reales en cliente.
- Impacto: la página de logs no puede mostrar ni un stream vivo ni un historial
  real; como mucho recibe un bootstrap sintético y queda vacía. Es un fallo
  funcional del dashboard de estado, no solo deuda de UX.
- seenBy: gpt-5.4

### D28 — El gasto de generaciones mira siempre `origin`, aunque la política de integración use otro remote
- Clasificación: `CONFIRMADO` · Zona: core/work-units
- Evidencia: `packages/core/src/lib/work-units/work-unit-generation.service.ts:68-97`
  calcula generaciones ya gastadas contra `refs/remotes/origin/<integration>` y
  `git ls-remote origin ...`; sin embargo el resto del subsistema ya resuelve el
  remote efectivo dinámicamente (`integrationRemote()` en
  `work-unit-shared.service.ts`). En clones cuya rama de integración viva en
  `upstream` u otro nombre, el escaneo de generaciones terminadas puede quedar
  ciego.
- Impacto: una generación ya usada puede parecer libre en repos con remote de
  integración distinto de `origin`, reabriendo el problema que el propio helper
  describe: reutilizar la identidad de una unidad ya registrada y confundir al
  reconciler con "historia reescrita" o unidades desaparecidas.
- seenBy: gpt-5.4

### D29 — La página web de recovery recarga sobre un evento bootstrap sintético, no sobre estado real
- Clasificación: `CONFIRMADO` · Zona: apps/web/status
- Evidencia: la misma ruta SSE estática `apps/web/src/pages/api/events/[topic].ts:8-16`
  responde `agent-dead` con `{ bootstrap: true }`; `pages/status/recovery.astro:24-28`
  hace `window.location.reload()` en cualquier `agent-dead`; y
  `components/recovery/RecoveryTable.astro:3-21` arranca con `zombies = []` y no
  tiene ninguna carga real de datos ni callback de acción conectado.
- Impacto: la superficie recovery no está reaccionando a incidentes reales sino
  a un bootstrap fijo de una respuesta estática. Según el navegador y su política
  de reconexión/recarga, eso puede producir recargas espurias o una vista
  permanentemente vacía que aparenta ser operativa.
- seenBy: gpt-5.4

### D30 — El bootstrap multicuenta devuelve patch solo para `/providers`, no para `/accounts`, así que deja fuera reservas y aislamiento por cuenta
- Clasificación: `CONFIRMADO` · Zona: orchestrator-runner, Batuta
- Evidencia: `plugins/orchestrator-runner/src/lib/bootstrap.ts:259-279`
  construye un patch RFC 6902 únicamente para `/providers`; el propio brief
  pide al usuario perfiles y cuentas por herramienta (`:309-312`), pero esa
  información no se materializa en el patch confirmado. A la vez `accountId`
  sigue siendo opcional en `packages/core/src/lib/contracts/constants/provider-entry-schema.constant.ts:118-129`, y la reserva de cuota se omite por completo
  cuando el provider no está ligado a una cuenta
  (`plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts:204-214`).
- Impacto: el onboarding principal de Batuta puede dejar proveedores detectados
  "configurados" pero todavía fuera del modelo de aislamiento y reservas por
  cuenta que el producto promete para trabajo multicuenta.
- seenBy: gpt-5.4

### D31 — `migrate status`, `--dry-run` y `run` no cubren el mismo recorrido que el guard de arranque
- Clasificación: `CONFIRMADO` · Zona: cli, workspace-migration
- Evidencia: la CLI `migrate` usa `runPendingMigrations()` para `--dry-run`
  (`packages/cli/src/commands/migrate.command.ts:85-91`) y en `status` solo
  expone journal, último manifest y residual scan (`:98-119`); el `run`
  transaccional invoca `runMigrationTransaction()` (`:121-124`). Pero el guard
  de arranque ejecuta además `runCacheLayoutStep()` y
  `reconcileConfigTransitions()` tras las migraciones de identidad
  (`packages/core/src/lib/workspace-migration/legacy-migration.service.ts:207-260`).
  El propio servicio de cache-layout tiene estado y pasos propios
  (`cache-layout-step.service.ts:1-92`).
- Impacto: `migrate status` o `migrate --dry-run` pueden reportar que no queda
  nada relevante, y `migrate run` puede terminar, mientras el siguiente arranque
  todavía movería cacheDir o aplicaría transiciones de configuración. La CLI no
  describe ni ejecuta el mismo universo de cambios que el runtime real.
- seenBy: gpt-5.4

### D32 — Un fallo con rollback deja backup persistido pero no deja manifest persistido del intento fallido
- Clasificación: `CONFIRMADO` · Zona: workspace-migration/rollback
- Evidencia: `runMigrationTransaction()` persiste backups antes del apply
  (`packages/core/src/lib/workspace-migration/transaction/migration-transaction.ts:198-202`),
  pero solo escribe manifest a disco en los caminos `noop` y `committed`
  (`:180-187`, `:231-236`). Cuando `apply` o `validate` fallan, `rollbackFromFailure()`
  construye un manifest en memoria y devuelve `rolled-back` o `rollback-failed`
  (`:239-315`) sin llamar a `writeManifest()`. Como `migrate status` y
  `migrate rollback` leen solo `readLatestManifestFromDisk()`
  (`migrate.command.ts:103-117`, `:126-138`), el intento fallido queda sin rastro
  persistido aunque el backup sí exista en disco.
- Impacto: el caso más importante de la ruta transaccional, el fallo con
  rollback, pierde precisamente la evidencia persistente que un operador usaría
  para diagnosticarlo o para reanudar la recuperación. El sistema guarda el
  backup pero oculta el intento fallido a sus propios comandos de estado.
- seenBy: gpt-5.4

### D33 — El build local de `apps/web` puede servir `/api` vacío u obsoleto sin avisar
- Clasificación: `CONFIRMADO` · Zona: apps/web/docs-api
- Evidencia: `apps/web/scripts/sync-public-api.ts:78-110` crea el target
  `build/docs-api/` si no existe y enlaza `apps/web/public/api` hacia ese
  destino; `apps/web/package.json:8-23` ejecuta `sync:public-api` antes de
  `dev`, `preview`, `check` y `build`, pero solo `dev` lanza además
  `docs:api:watch`; `preview` y `check` no generan TypeDoc, y el build local de
  la app tampoco invoca `docs:api`. En cambio el root sí lo hace en `site` y
  `site:strict` (`package.json:249-252`).
- Impacto: quien trabaje desde `apps/web` puede previsualizar o servir una ruta
  `/api` vacía u obsoleta sin fallo visible, porque el symlink se considera
  válido aunque el contenido de `build/docs-api/` no se haya generado o esté
  desfasado.
- seenBy: gpt-5.4

### D34 — `work claim` sin identidad puede mentir diciendo que no hay nada reclamable
- Clasificación: `CONFIRMADO` · Zona: core/work-units
- Evidencia: `planWorkClaim()` devuelve una negativa explícita cuando `agent`
  está vacío (`packages/core/src/lib/work-units/work-claim.service.ts:61-66`),
  pero `claimableWorkRefs()` descarta toda negativa y solo conserva planes con
  `to` (`:120-136`). Luego `claimed()` en `work-unit-claim.service.ts:33-54`,
  si no se pasó `--ref`, interpreta la lista vacía como "no unit of work here
  belongs to anybody else". El problema no es ausencia real de unidades, sino
  ausencia de identidad para evaluarlas honestamente.
- Impacto: el operador recibe un mensaje falso de disponibilidad en vez del
  motivo real del bloqueo (`no agent identity`). Eso degrada el flujo de claim y
  es especialmente confuso en hosts donde la identidad depende del bridge o del
  entorno.
- seenBy: gpt-5.4

### D35 — El `Verified State` heredado de a00095 ya no describe el snapshot actual
- Clasificación: `CONFIRMADO` · Zona: audit/doc-state
- Evidencia: en el snapshot actual `develop` (`514758e783620c8953079be4d71fceccacb3de8b`) el árbol da `13` packages (`find packages -mindepth 1 -maxdepth 1 -type d | wc -l`), `1800` specs en `packages+plugins` (`find packages plugins -name '*.spec.ts' | wc -l`) y backlog visible `2 in-progress / 0 ready / 15 review / 47 retired` (`find docs/delendai/proposals/{in-progress,ready,review,retired} ...`). La tabla `Verified State` del documento todavía dice `12` packages, `1.778` specs y `2 / 1 / 14+ / 48` con `0 review`.
- Impacto: el libro de actas compartido sigue siendo útil como acta histórica, pero sus métricas de estado ya no sirven como inventario del snapshot que hoy se está auditando. Si no se separa explícitamente “estado base del modelo 1” de “estado verificado del snapshot actual”, el consenso mezcla evidencias sobre árboles distintos.
- seenBy: gpt-5.4

### D36 — El dashboard de tokens subestima el coste real de respuestas routed al medir solo `structuredContent`
- Clasificación: `CONFIRMADO` · Zona: token-budgets/tooling
- Evidencia: `tools/scripts/report/token-budget-report-lib.ts:321-350` define `payloadBytes()` como `JSON.stringify(structuredContent)` cuando existe, ignorando `content[]` y `_meta`. El propio comentario lo justifica como “lo que recibe el modelo”, pero el addendum de task context del dashboard publica esos bytes como si fueran el coste de la respuesta de herramienta. En un muestreo real de `delendai_compact_router { domain: "core", action: "project_context" }` guardado en `/tmp/project-context-routed.json`, el resultado MCP completo pesa ~1859 B en `managed` frente a 672 B de `structuredContent` solo; además incluye `content[0].text` duplicando el payload y `_meta.checkpointAdvisory`.
- Impacto: la medición actual es útil como aproximación del payload semántico, pero infraestima de forma grande el coste wire/end-to-end de herramientas routed y respuestas con advisory metadata. Eso sesga comparaciones entre superficies y puede ocultar que una optimización mueve coste desde `structuredContent` a texto/envelope en vez de eliminarlo.
- seenBy: gpt-5.4

### D37 — El roadmap 0.2.0 ya no describe fielmente lo que el árbol actual ha entregado
- Clasificación: `CONFIRMADO` · Zona: roadmap/proposals
- Evidencia: `docs/delendai/ROADMAP.md:4-33` mantiene `roadmap` y `state-shadow` como `in-progress`, y `style-surface`, `capability-contract` y `docker-tools` como `proposed`, aunque sus propuestas gate ya están `done`: `f00756` (`docs/delendai/proposals/done/feats/f00756-...md:1-15`), `q00019` (`docs/delendai/proposals/done/plans/q00019-...md:1-15`), `f00548` (`.../f00548-...md:1-14`), `f00550` (`.../f00550-...md:1-14`) y `f00543` (`.../f00543-...md:1-12`). En el caso de `state-shadow`, además el core ya lo cablea explícitamente mediante `state.parity.shadow.enabled` en `packages/core/src/lib/cli/state-registry-choice.ts:1-88`.
- Impacto: la hoja de ruta deja de ser autoridad fiable sobre qué pertenece al futuro y qué ya está entregado. Eso degrada el valor de versión, confunde priorización y hace que parte del horizonte 0.2.0 siga leyéndose como promesa cuando el árbol actual ya lo contiene.
- seenBy: gpt-5.4

### D38 — `review-diff` contiene bytes NUL dentro del nombre de una tool y el prompt llega corrupto al modelo
- Clasificación: `CONFIRMADO` · Zona: prompts-pack
- Evidencia: `plugins/prompts-pack/src/prompts/review-diff.ts` contiene dos bytes NUL en la línea que recomienda `delendai_git_changelog`; al leer el fichero con sustitución visible aparece `Use <NUL>delendai_git_changelog<NUL> with range ...` en la línea 47. El módulo sigue importando (`bun -e "import('./plugins/prompts-pack/src/prompts/review-diff.ts')"` devuelve `ok`), así que la corrupción no rompe el runtime pero sí llega al texto del prompt. La spec `plugins/prompts-pack/src/prompts/prompts.spec.ts:1-118` verifica ids y longitud, pero no detecta bytes NUL ni corrupción textual.
- Impacto: el prompt que se entrega al host/modelo puede nombrar una tool con caracteres invisibles incrustados. Eso degrada la copiabilidad exacta del nombre, la depuración del prompt y la confianza en una superficie cuyo contrato es precisamente texto para agentes.
- seenBy: gpt-5.4

### D39 — El universo de hosts está partido entre scaffold, runtime e instrucciones manuales; Aider queda fuera de la autoridad canónica
- Clasificación: `MEJORA` · Zona: hosts/scaffold
- Evidencia: `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts:1-70` define `AGENT_HOSTS` como "the one list of hosts delendai writes agents and instructions for", pero no incluye `aider`; sin embargo `plugins/usage-tracking/src/lib/detect-agent.ts:18-35` sí reconoce `aider`, `packages/core/src/lib/contracts/interfaces/agent-identity.interface.ts:38-44` lo incluye en el slug union, `packages/core/src/lib/development-policy/profiles.constant.ts:132-146` lo trata como host conocido, y `config/external/README.md:10-24` mantiene `.aider.conf.yml` como integración externa viva. `docs/delendai/FILE-CONVENTIONS.md:239-246` documenta Aider como "not scaffolded; manual", es decir: el sistema convive con dos autoridades distintas para el mismo universo de hosts.
- Impacto: no es un bug de ejecución inmediata, pero sí una fractura de fuente única de verdad. Hosts como Aider existen para detección, identidad y config externa, pero no para el scaffolder/host registry que otros servicios recorren. Eso aumenta el riesgo de migraciones incompletas, detección parcial y documentación que diverge por familia de host.
- seenBy: gpt-5.4

### D40 — `api_call` promete fetch gobernado por allowList/timeout/maxBytes, pero la carga de `specUrl` hace `fetch` crudo
- Clasificación: `CONFIRMADO` · Zona: api/openapi
- Evidencia: `plugins/api/src/lib/tools/api-call.tool.ts:126-150` anuncia que `specUrl` se resuelve "via the allow-listed web-fetch engine", pero delega a `fetchAndParseSpec()`. Esa función (`plugins/api/src/lib/spec/openapi.ts:355-370`) ignora `allowList`, `timeoutMs` y `maxBytes` y ejecuta `fetch(url, {})` sin el cerrojo de `webFetch`. En cambio la ruta hermana `api_validate` sí pasa por `webFetch` cuando no hay `specFetch` inyectado (`plugins/api/src/lib/tools/api-validate.tool.ts:132-158`).
- Impacto: la llamada al endpoint puede estar gobernada, pero la descarga previa de la spec remota no lo está. Eso abre una ruta de red sin las mismas cotas ni el mismo allow-list que el propio contrato del tool promete al usuario.
- seenBy: gpt-5.4

### D41 — `external_mcp_call` puede devolver `missing-env`, pero su `outputSchema` no admite ese código
- Clasificación: `CONFIRMADO` · Zona: external-mcps/contracts
- Evidencia: el registry declara `ExternalCallFailureCode = 'unknown-server' | 'missing-env' | 'call-failed' | 'call-timeout'` en `plugins/external-mcps/src/lib/subprocess/server-registry.ts:334-338`; `invoke-proxy` reexpone `outcome.code` tal cual (`plugins/external-mcps/src/lib/tools/invoke-proxy.ts:214-223`); pero `CallOutputSchema` solo enumera `ack-required`, `llm-activation-disabled`, `unknown-server`, `call-failed` y `call-timeout` (`invoke-proxy.ts:80-90`).
- Impacto: una falta real de variables de entorno puede producir una respuesta estructurada cuyo `code` cae fuera del contrato publicado. Para clientes tipados o hosts que validen la salida, eso convierte una falta de configuración en un error de protocolo secundario.
- seenBy: gpt-5.4

### D42 — `audit-orchestrator` no parsea un plan real del repo y puede derivar cero tareas de un `type: plan` válido
- Clasificación: `CONFIRMADO` · Zona: audit-orchestrator
- Evidencia: `parseChildren()` en `plugins/audit-orchestrator/src/lib/plan-reader.ts:45-62` solo acepta líneas que empiecen exactamente por ocho espacios + `- id:`. Un plan real del repo como `docs/delendai/proposals/ready/plans/q00011-...md:20-80` declara `contains.proposals` con listas YAML inline (`- { id: r00038, ... }`). Una sonda directa con `parseAuditPlan()` y `deriveAuditTasks()` sobre ese fichero devuelve `{ children: 0, slices: 0, taskCount: 0 }`.
- Impacto: el plugin que debería orquestar auditorías y planes puede tratar un plan válido del propio repositorio como si no contuviera trabajo alguno. Eso no es deuda de formato: es pérdida funcional directa en la lectura de la fuente de verdad de planificación.
- seenBy: gpt-5.4

### D43 — `browser_query` promete resultados acotados, pero ignora el planner que ya define el bound
- Clasificación: `CONFIRMADO` · Zona: browser
- Evidencia: `plugins/browser/src/lib/page/planner.ts:1-49` ya define `maxResults` por defecto 20 y tope 100, además de normalización de selector/URL. Sin embargo `plugins/browser/src/lib/tools/browser-inspect.tool.ts:166-210` registra `browser_query` sin `maxResults` en el `inputSchema`, no llama a `planPageRequest()`, y delega al driver solo `{ url, selector }` mientras la descripción sigue prometiendo "bounded DOM matches".
- Impacto: el contrato MCP promete una cota que hoy no existe en la llamada real. El tamaño de la respuesta depende por completo del adaptador host/driver, y el planner ya escrito para cerrar ese riesgo está desconectado.
- seenBy: gpt-5.4

### D44 — Dos screenshots concurrentes del plugin browser pueden sobrescribirse en el mismo milisegundo
- Clasificación: `CONFIRMADO` · Zona: browser/cache
- Evidencia: `plugins/browser/src/lib/tools/browser-inspect.tool.ts:97-101` construye la ruta de screenshot únicamente con `Date.now()` en milisegundos (`browser/<timestamp>.png`). `browser_screenshot` escribe luego de forma atómica sobre ese path (`:142-163`). Si dos invocaciones llegan en el mismo milisegundo, ambas eligen el mismo nombre y la segunda reemplaza silenciosamente el artefacto de la primera.
- Impacto: la ruta de cache del plugin no garantiza unicidad bajo concurrencia multiagente. Una respuesta puede apuntar a un artefacto ya sobrescrito por otra captura distinta, degradando reproducibilidad y evidencia visual.
- seenBy: gpt-5.4

### D45 — `injectCspMeta()` interpola el header CSP en un atributo HTML sin escape
- Clasificación: `CONFIRMADO` · Zona: ui-extension/CSP
- Evidencia: `packages/ui-extension/src/webview/csp.ts:120-127` construye `<meta http-equiv="Content-Security-Policy" content="${cspHeaderValue(policy)}" />` interpolando el header sin escapar comillas ni otros caracteres de atributo. Los helpers salen por el barrel público (`packages/ui-extension/src/webview/index.ts`) y `resolveCspPolicy()` admite overrides del caller; sin embargo la suite `packages/ui-extension/tests/webview/csp.spec.ts:120-148` solo cubre valores seguros y nunca tensa un token hostil con comillas.
- Impacto: hoy las políticas que usa el repo son seguras, pero el helper público no hace fail-closed frente a un valor de directiva malformado o inesperado. Un caller que pase tokens con comillas rompería el atributo `content` y la CSP inyectada dejaría de ser una serialización HTML robusta.
- seenBy: gpt-5.4

### D46 — La migración v1→v2 de `roadmap-sqlite` contradice su propio contrato y puede perder filas silenciosamente
- Clasificación: `CONFIRMADO` · Zona: roadmap-sqlite
- Evidencia: `packages/roadmap-sqlite/src/lib/contracts/constants/roadmap-sqlite-migrations.constant.ts:7-23` declara que "a row the step cannot carry aborts the whole migration", pero la migración v1→v2 añade `horizon` y `entry_id` como columnas nullable y las rellena con `json_extract(...)` sin validar que existan. Luego `list()` filtra precisamente por esas columnas (`packages/roadmap-sqlite/src/lib/sqlite-timeline.store.ts:92-108`). Una fila legacy cuyo `event_json` no tenga `horizon` o `entryId` deja la base en v2 igualmente y queda invisible para los filtros indexados.
- Impacto: no es una falta de README ni un detalle de runtime: es una pérdida silenciosa de visibilidad de datos durante una migración que el propio contrato describe como all-or-nothing. El store puede "migrar con éxito" y aun así dejar eventos huérfanos fuera de las consultas por horizonte/entry.
- seenBy: gpt-5.4

### D47 — `self-learning` hace read-modify-write del store sin exclusión mutua y puede perder observaciones concurrentes
- Clasificación: `CONFIRMADO` · Zona: self-learning/persistence
- Evidencia: `plugins/self-learning/src/lib/store/observation-store.service.ts:137-183` lee el store completo, deduplica en memoria y reescribe todo con `writeFileAtomic`, pero no rodea la operación con ningún mutex. La atomicidad evita truncados, no lost updates: dos collectors concurrentes sobre el mismo `filePath` pueden partir del mismo estado base y la última escritura pisa observaciones aceptadas por la otra. La suite `plugins/self-learning/tests/src/lib/store/observation-store.spec.ts:66-159` cubre comportamiento serial, compactación y líneas corruptas, no concurrencia.
- Impacto: el plugin que pretende acumular evidencia/observaciones del tiempo puede perderlas silenciosamente cuando dos procesos o dos agentes intentan aprender a la vez sobre el mismo store. La confianza de las lecciones deja de reflejar el historial real observado.
- seenBy: gpt-5.4

### D48 — Un `history.json` corrupto tumba la tool completa de `project-kpis` en vez de degradar con seguridad
- Clasificación: `CONFIRMADO` · Zona: project-kpis/history
- Evidencia: `parseStore()` en `plugins/project-kpis/src/lib/services/kpi-history.service.ts:69-88` hace throw ante contract/version inesperado o `entries` ausente; `readStore()` (`:90-118`) le entrega el fichero persistido sin catch de degradación; y `loadState()` en `project-kpis.tool.ts:1089-1122` llama a `readKpiHistoryWindow()` sin encapsular ese fallo, de modo que una sola caché corrupta puede abortar la carga entera del estado. La suite `plugins/project-kpis/tests/src/kpi-history.spec.ts:114-200` cubre persistencia sana y retención, no corrupción del store.
- Impacto: una vista que podría seguir respondiendo con snapshot/usage actuales queda tumbada por un histórico corrupto. La telemetría persistida de menor criticidad secuestra la disponibilidad de la tool completa.
- seenBy: gpt-5.4

### D49 — `quality_policy` presenta una “type policy” global, pero solo inspecciona la cadena `tsconfig.json` de la raíz
- Clasificación: `CONFIRMADO` · Zona: quality-policy/types
- Evidencia: `buildTypesEntry()` en `plugins/quality-policy/src/lib/services/quality-policy-types.service.ts:92-142` siempre arranca desde `tsconfig.json` del workspace root y resume "Type policy is ... from ..." como si describiera el workspace. Pero el repo ya contiene al menos una política divergente fuera de esa cadena raíz: `apps/web/tsconfig.json:1-4` extiende `astro/tsconfigs/strict`, no la cadena del root. El resultado publicado por `quality_policy` es, por tanto, una descripción parcial presentada como global.
- Impacto: la tool puede inducir a creer que el repo comparte una sola política de tipos cuando no es así. En auditoría o diagnosis de un monorepo eso oculta justamente las excepciones donde suelen aparecer desajustes de calidad.
- seenBy: gpt-5.4

### D50 — `commit_policy_status` puede afirmar que el commit/push directo está permitido aunque el engine derive la rama como protegida
- Clasificación: `CONFIRMADO` · Zona: commit-policy/status
- Evidencia: `plugins/commit-policy/src/lib/tools/status-tool.ts:46-58,146-164` calcula `directCommitPushAllowed` usando solo `options.push.protectedBranches` y `protectedPrefixes`; en cambio el engine real deriva la lista efectiva con `deriveProtectedBranches({ configured, policy })` (`plugins/commit-policy/src/lib/persistence/derive-branch-policy.ts:20-43`) y la usa al construirse en `plugins/commit-policy/src/index.ts:576-593`. Con `shared-checkout-pr`, eso incluye ramas protegidas implícitas desde la development policy aunque el status tool no las refleje en su booleano principal.
- Impacto: la superficie que promete mostrar la "effective commit-policy configuration" puede decir al operador que una rama permite commit/push directo cuando el enforcement real del plugin la tratará como protegida o WIP-only. Es una mentira de estado, no solo un detalle de UX.
- seenBy: gpt-5.4

### D51 — `observability` recorta los registros reales al revés y puede ocultar justo la muestra más reciente
- Clasificación: `CONFIRMADO` · Zona: observability/traces
- Evidencia: `plugins/observability/src/lib/traces/real-deps.ts:47-85` ordena los `.jsonl` de más nuevo a más viejo y empuja las líneas en ese orden; luego `takeRecent()` (`:80-85`) aplica `items.slice(items.length - limit)`, o sea conserva la cola más vieja del array, no la cabecera más reciente. Los fakes de test hacen lo contrario (`plugins/observability/src/lib/traces/interfaces.ts:48-57`), de modo que la ruta probada no replica el bug real.
- Impacto: `obs_trace` y `obs_release_health` pueden dejar fuera precisamente los eventos más recientes cuando se usa `limit`, ocultando fallos actuales detrás de una muestra más vieja. La herramienta se presenta como lectura de "recent" records, pero la implementación real sesga el muestreo al revés.
- seenBy: gpt-5.4

### D52 — `optimize_run` exige `budget > 0` prometiendo un techo explícito, pero el presupuesto no gobierna la optimización real
- Clasificación: `CONFIRMADO` · Zona: adaptive-optimizer
- Evidencia: `plugins/adaptive-optimizer/src/lib/tools/optimize-run.tool.ts:99-108` rechaza `budget <= 0` diciendo que sirve para "enforce an explicit ceiling"; sin embargo `buildOptimizeRunPayload()` en `plugins/adaptive-optimizer/src/lib/services/optimize-run.service.ts:328-367` fija el tradeoff con `ADAPTIVE_OPTIMIZER_DEFAULT_BUDGET_DIAL`, puntúa candidatos sin leer `args.budget`, y solo devuelve `budget` ecoado en el output final.
- Impacto: el contrato público vende un control real del techo de optimización que hoy no existe. El usuario cree estar gobernando la búsqueda con un presupuesto efectivo cuando en realidad solo satisface una validación de entrada y recibe el valor reflejado en la respuesta.
- seenBy: gpt-5.4

### D53 — `plugins_recommend` puede justificar un `remove` con una causa falsa cuando el plugin quedó fuera por `limit` o `minScore`
- Clasificación: `CONFIRMADO` · Zona: auto-plugin-selector
- Evidencia: `buildConfigDiff()` en `plugins/auto-plugin-selector/src/lib/apply/config-diff.ts:69-82` marca todo plugin actual no presente en `recommendations` como `remove` con la razón fija `no positive fit against project signals`. Pero `recommendations` ya llega recortado por `limit` y filtrado por `minScore` desde `recommendPlugins()` (`plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts:211-245`) y la propia tool lo pasa así al diff (`plugins/auto-plugin-selector/src/lib/tools/plugins-recommend.tool.ts:156-196`). Un plugin con fit positivo puede desaparecer por ranking o threshold y aun así recibir una explicación causal incorrecta.
- Impacto: el diff de configuración parece más explicativo de lo que realmente sabe. Puede recomendar quitar un plugin con una justificación falsa, sesgando revisiones humanas o automatizaciones que confíen en el texto de rationale.
- seenBy: gpt-5.4

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
| D1 | purga del lock sin mutex borra claims | 1/10 | abierto |
| D2 | claim computa fuera del mutex | 1/10 | abierto |
| D3 | zombie-GC releva agentes vivos | 1/10 | abierto |
| D4 | schemas que mienten en errores | 1/10 | abierto |
| D5 | force salta gates sin freno | 1/10 | abierto |
| D6 | cola sin cap ni reclaim | 1/10 | abierto |
| D7 | migraciones escriben sin atómica | 1/10 | abierto |
| D8 | más process.cwd() y sync I/O en core | 1/10 | abierto |
| D9 | resolver: 7 razones, 2 sin test | 1/10 | abierto |
| D10 | plugin_activate viola su schema en error | 1/10 | abierto |
| D11 | i18n: 7 namespaces satélite sin gate | 1/10 | abierto |
| D12 | SEO: 50/51 sin canonical | 1/10 | abierto |
| D13 | audit de páginas decorativo; drift web sin gate en PR | 1/10 | abierto |
| D14 | 16 enlaces rotos en docs raíz | 1/10 | abierto |
| D15 | forge-governance/integration sin specs nominales | 1/10 | abierto |
| D16 | positivos que resisten el ataque profundo | 1/10 | abierto |
| D17 | dashboard/toolbar/settings/knowledge/config-center con script-src 'unsafe-inline' | 1/10 | abierto |
| D17 | dashboard/toolbar/settings/knowledge con script-src 'unsafe-inline' | 1/10 | abierto |
| D18 | outputSchema de solo-éxito también miente en memory/logs/usage-tracking | 1/10 | abierto |
| D19 | GitLab read-only devuelve toolError fuera de schema en casi toda la suite | 1/10 | abierto |
| D20 | el ratchet de outputSchema no ejecuta el camino de error real | 1/10 | abierto |
| D21 | forge autodetecta solo github.com/gitlab.com exactos | 1/10 | abierto |
| D22 | createProjectPlugin puede salir del workspace | 1/10 | abierto |
| D23 | forge PR body sube la propuesta entera sin límite | 1/10 | abierto |
| D24 | la extensión VS Code está sesgada al primer workspace folder | 1/10 | abierto |
| D25 | run validation reintenta en terminal sin cwd explícito | 1/10 | abierto |
| D26 | work claim puede dejar ref, lease y worktree stamp desincronizados | 1/10 | abierto |
| D27 | el dashboard web de logs no hace streaming real | 1/10 | abierto |
| D28 | endedGenerations queda ciego fuera de origin | 1/10 | abierto |
| D29 | la página recovery reacciona a un bootstrap estático | 1/10 | abierto |
| D30 | Batuta bootstrap configura providers pero no materializa accounts | 1/10 | abierto |
| D31 | migrate CLI y boot guard recorren migraciones distintas | 1/10 | abierto |
| D32 | rollback fallido guarda backup pero no manifest persistido | 1/10 | abierto |
| D33 | el build local de apps/web puede servir /api vacía u obsoleta | 1/10 | abierto |
| D34 | work claim sin identidad puede mentir al operador | 1/10 | abierto |
| D35 | el Verified State heredado ya no describe el snapshot actual | 1/10 | abierto |
| D36 | el dashboard de tokens mide payload semántico, no coste routed completo | 1/10 | abierto |
| D37 | el roadmap 0.2.0 ya no refleja correctamente lo ya entregado | 1/10 | abierto |
| D38 | review-diff contiene NUL bytes dentro del nombre de una tool | 1/10 | abierto |
| D39 | el universo de hosts no tiene una sola autoridad (Aider queda partido) | 1/10 | abierto |
| D40 | api_call carga specUrl con fetch crudo fuera del cerrojo web-fetch | 1/10 | abierto |
| D41 | external_mcp_call puede devolver missing-env fuera de schema | 1/10 | abierto |
| D42 | audit-orchestrator no parsea un plan real del repo | 1/10 | abierto |
| D43 | browser_query promete bound pero no usa el planner que lo define | 1/10 | abierto |
| D44 | browser_screenshot puede colisionar y sobrescribir artefactos | 1/10 | abierto |
| D45 | injectCspMeta interpola CSP en HTML sin escape de atributo | 1/10 | abierto |
| D46 | roadmap-sqlite puede migrar dejando filas invisibles | 1/10 | abierto |
| D47 | self-learning puede perder observaciones concurrentes | 1/10 | abierto |
| D48 | project-kpis cae completo ante history.json corrupto | 1/10 | abierto |
| D49 | quality_policy resume una type policy parcial como si fuera global | 1/10 | abierto |
| D50 | commit_policy_status puede mentir sobre ramas protegidas efectivas | 1/10 | abierto |
| D51 | observability recorta los registros reales al revés | 1/10 | abierto |
| D52 | optimize_run pide budget pero no lo usa para gobernar el score | 1/10 | abierto |
| D53 | plugins_recommend puede justificar removals con una causa falsa | 1/10 | abierto |

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

### gpt-5.4 (GitHub Copilot, 2026-10-18)

**Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b` (develop). Pasada reanclada al develop real del 2026-10-19, con inventario bruto del árbol, revisión de plugins y una segunda fase de reproducciones adversariales sobre locks, migraciones, surface MCP, web, VS Code, forge y Batuta.

**Valoración global:** coincido con la tesis de base: el repo tiene disciplina real, pero cuando un patrón contractual se rompe no suele romperse una sola vez. Esta segunda pasada me cambió la conclusión sobre D4/D10: el defecto ya no pertenece solo a proposals/core ni a un puñado de plugins auxiliares, sino también a una suite completa de herramientas GitLab, a tools read-only de search/diagram y a un ratchet que solo vigila la forma declarada del schema. A la vez, aparecieron dos bugs funcionales fuera de esa familia: forge no sirve para hosts enterprise/self-managed y el scaffold de plugins del cliente deja escapar rutas fuera del workspace.

**Suscribe:** G7 y D7. Reproduje directamente el desajuste `findCLIEntryFrom` vs `findCLIEntry` del shim Go y las escrituras planas de la transacción de migración (`writeManifest` / `persistBackups`) junto con el uso desigual de `atomicWrite` en `rollback`.

**Discrepancias:** D1 y D2 no me quedan confirmados en este snapshot por el camino productivo actual. `runAgentLockEngine()` envuelve `executeLockAction()` entero en `withFileMutex(getFileLockTablePath(...))` (`plugins/proposals/src/lib/locks/engine.ts:134-139`), y `cleanupStaleAgentLockState()` hace lo mismo (`lock-lifecycle.ts:55-83`). Reproducciones temporales fuera del repo con 200 iteraciones de (a) dos claims disjuntos concurrentes y (b) cleanup stale concurrente con un claim fresco terminaron siempre con estado consistente en `agents.lock.json` y `file-locks.json`. Mantengo D26 porque lease/ref/worktree siguen pudiendo desincronizarse tras `work claim`, pero no añado `seenBy` a D1/D2 hasta ver una reproducción que atraviese un entrypoint real no cubierto por esa serialización exterior.

**Hallazgos nuevos propios:** D18, D19, D20, D21, D22, D23, D24, D25, D26, D27, D28, D29, D30, D31, D32, D33, D34, D35, D36, D37, D38, D39, D40, D41, D42, D43, D44, D45, D46, D47, D48, D49, D50, D51, D52 y D53. Primero verifiqué la misma clase de mentira de `outputSchema` en `usage_clear`, `memory_save`, `memory_forget`, `memory_import` y `logs_log`. Después confirmé que el mismo patrón también vive en casi toda la suite read-only de GitLab, y además en tools read-only de `search` y `diagram`. Eso me llevó a D20: el repo ratchea la existencia y forma declarada del schema, pero no ejecuta el camino de error contra el contrato real. Fuera de esa familia encontré treinta y tres bugs funcionales o de consolidación propios: D21, la autodetección forge solo acepta `github.com`/`gitlab.com` exactos y rompe enterprise/self-managed; D22, `createProjectPlugin()` permite escribir fuera del workspace y registrar rutas `../...` en la config del proyecto; D23, la creación de PR/MR en forge embebe la propuesta completa sin ningún límite de tamaño ni truncado previo; D24, la extensión VS Code resuelve varios flujos contra `workspaceFolders[0]` en vez del folder activo; D25, `run validation` reintenta comandos fallidos en terminal sin fijar el cwd del proyecto; D26, `work claim` puede cambiar el nombre del unit-of-work sin trasladar coherentemente lease y stamp de identidad; D27, el dashboard web de logs no hace streaming real aunque se presente como superficie viva de estado; D28, el gasto de generaciones sigue cableado a `origin`; D29, la página recovery recarga sobre un bootstrap SSE estático en vez de sobre estado real; D30, el bootstrap multicuenta configura providers pero no materializa accounts; D31, la CLI de migrate no cubre el mismo recorrido que el guard de arranque; D32, un rollback fallido persiste backup pero no deja manifest persistido del intento; D33, el build local de `apps/web` puede servir `/api` vacía u obsoleta; D34, `work claim` sin identidad puede mentir al operador sobre si hay o no unidades reclamables; D35, la propia tabla `Verified State` heredada de a00095 ya no describe el snapshot actual de develop; D36, el dashboard de tokens mide payload semántico pero no el coste completo de respuestas routed con texto duplicado y metadata; D37, la hoja de ruta 0.2.0 ya no refleja fielmente qué entradas siguen siendo promesa y cuáles ya están entregadas en el árbol; D38, el prompt `review-diff` contiene bytes NUL dentro del nombre de una tool; D39, el universo de hosts sigue partido entre scaffold, detección e instrucciones manuales en vez de tener una sola autoridad; D40, `api_call` carga `specUrl` con `fetch` crudo fuera del cerrojo `web-fetch`; D41, `external_mcp_call` puede devolver `missing-env` fuera de schema; D42, `audit-orchestrator` no parsea un plan real del propio repositorio; D43, `browser_query` promete un bound que no aplica; D44, `browser_screenshot` puede sobrescribir artefactos concurrentes por colisión de timestamp; D45, `injectCspMeta()` no escapa el valor del atributo `content`; D46, `roadmap-sqlite` puede migrar a v2 dejando filas invisibles en vez de abortar como su propio contrato promete; D47, `self-learning` puede perder observaciones concurrentes; D48, `project-kpis` cae completo ante un `history.json` corrupto; D49, `quality_policy` resume una política de tipos parcial como si fuera la política global del workspace; D50, `commit_policy_status` puede mentir sobre ramas protegidas efectivas; D51, `observability` recorta los registros reales al revés; D52, `optimize_run` exige un presupuesto que no gobierna la puntuación real; y D53, `plugins_recommend` puede justificar un `remove` con una causa falsa cuando el plugin quedó fuera por ranking o threshold.

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
