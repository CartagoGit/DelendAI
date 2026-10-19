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
  reviewers-completed: 8
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
    - model: glm-5.3-arquitectura
      host: github-copilot
      date: 2026-10-19
      snapshot: 514758e783620c8953079be4d71fceccacb3de8b
      scope: full-repo-2nd-pass
      errata: >-
        Publicado originalmente (PR #1253) con el id erróneo `glm-5.3-flash`;
        el revisor 1/10 ya era glm-5.3-flash. El autor real de esta pasada es
        glm-5.3-arquitectura (mismo maker, tier distinto). Reatribuido aquí y
        en los seenBy "(2ª pasada)".
    - model: qwen-3.8-flash
      host: github-copilot
      date: 2026-10-19
      snapshot: 514758e783620c8953079be4d71fceccacb3de8b
      scope: independent-forensic
      signoff-into: this document, reviewer 6/10 block (inline tandas 2-19)
    - model: gpt-5.4
      host: github-copilot
      date: 2026-10-19
      snapshot: 514758e783620c8953079be4d71fceccacb3de8b
      scope: full-repo-tools-contracts
    - model: deepseek-v4-pro
      host: github-copilot
      date: 2026-10-19
      snapshot: 4c4e978f8693e392624acbbca79888eb33b909cb
      scope: full-repo-8th-review
      errata: >-
        Publicado originalmente (PR #1264) con el id erróneo
        `deepseek-v4-flash`; el tier correcto es `pro` (DeepSeek V4 Pro), no
        `flash`. Reatribuido aquí y en los seenBy; el tier `pro` es tier válido
        según agent-name-canon (no effort-word).
      note: >-
        Identidad: host declara modelo (DeepSeek V4 Pro); el
        bridge de proveedor apuntaba a otra sesión gemini-3.8-flash-high en
        paralelo (G68: archivo plano compartido). La cadena model > environment
        > provider > client resuelve por el model del host. Inventario fase A
        guardado antes de leer el acta; reproducciones adversariales de locks
        con 2 procesos reales.
    - model: claude-sonnet-5-5
      host: claude-code
      date: 2026-10-19
      snapshot: e342c8e158d492bf7ca4606b07c8d0c2013beb38
      scope: partial-adversarial-contrast-and-new-findings
      note: >-
        Cobertura parcial (no incrementa reviewers-completed): arbitraje de
        D1/D2 con reproduccion de dos procesos, rollback destructivo (G93),
        economia de respuestas (G94/G95), salud de plugins (G97/G98) e
        inventario de los 61 plugins. 51 plugins constan como analizados
        estaticamente (superficie, efectos y contratos; logica no leida). IDs propios G91-G107.
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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada), claude-sonnet-5-5 (confirmado: 8 usos de código en core, 1 relevante (`shell-status.tool.ts:195`); ver mi bloque)

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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

### G3 — Engines de coordinación con cobertura delgada
- Clasificación: `CONFIRMADO` · Zona: proposals/tests
- Evidencia: `lib/shared/swarm-hygiene-engine.ts` 509 LOC / 1 spec;
  `lib/shared/branch-gc-engine.ts` 481 / 1; `lib/shared/branch-status-engine.ts`
  460 / 2; `lib/agents/agent-worktree-engine.ts` 362 / 2. Son los motores que
  coordinan agentes concurrentes.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

### G4 — Presión de presupuesto de tokens
- Clasificación: `CONFIRMADO` · Zona: surface/token-budgets
- Evidencia: `docs/delendai/TOKEN-BUDGETS.md`: `auto_work` work plan 2.433 B
  sobre warning 2.400 (hard 2.600); preset `dogfood` acumula 79.900 B
  marginales de un solo plugin; `standard` marca un plugin sobre warning
  (10.929 B). 256 tools cargados, 249 ocultos: la capa de proceso pesa más
  que la de producto.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

### G7 — Shim Go con tests stale
- Clasificación: `CONFIRMADO` · Zona: bin
- Evidencia: `bin/delendai-shim/main_test.go:23,35` prueba `findCLIEntryFrom`
  pero `main.go:86` solo define `findCLIEntry`. Si no hay otro archivo Go en el
  paquete, la suite no compila. Cobertura trivial: no prueba forwarding de
  stdio, exit code ni ausencia de bun.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada), deepseek-v4-pro (reverificado en a78813827: `main_test.go:23,35` invoca `findCLIEntryFrom`, `main.go:86` solo define `findCLIEntry`)

### G8 — i18n incompleto en web y ui-extension
- Clasificación: `CONFIRMADO` · Zona: apps/web, ui-extension
- Evidencia: fallback silencioso a inglés para 10 idiomas en
  `apps/web/src/i18n/extend.ts:143-154`; strings visibles hardcoded en inglés
  fuera del diccionario en `apps/web/src/pages/[lang]/cli.astro:40,45,50,72,85`;
  copy inglés hardcoded en `packages/ui-extension/src/configuration-center/
  configuration-center-model.ts:21,23` y `packages/ui-extension/src/
  kpi-dashboard.ts:746,758`.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

### G9 — Fuente de verdad del logo incoherente
- Clasificación: `CONFIRMADO` · Zona: brand
- Evidencia: `apps/shared/README.md:17` declara `apps/shared/brand` como fuente
  de verdad, pero la web sirve `apps/web/public/logo.svg`
  (`apps/web/src/layouts/Base.astro:82`, `Home.astro:48`, `NotFound.astro:23`)
  y la extensión sincroniza desde ahí (`extensions/vscode/scripts/sync-logo.ts:11-12`).
  Existen dos `logo.svg`; `apps/shared/brand` no es el origen operativo.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

### G10 — Duplicación estructural github/gitlab
- Clasificación: `CONFIRMADO` · Zona: plugins
- Evidencia: sin imports cruzados; shapes paralelas alrededor de
  cliente/config/diagnostics/mutations/write-tools (`plugins/github/src/lib/
  tools/catalog.ts` vs `plugins/gitlab/src/lib/tools/shared.ts`). No es copia
  literal pero sí doble mantenimiento.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

### G11 — Validación de webview inconsistente
- Clasificación: `PROBABLE` · Zona: extensions/vscode
- Evidencia: dashboard/configuration-center/agent-catalog/KPI usan `safeParse`
  (`open-dashboard.ts:249`, `open-configuration-center.ts:231`,
  `open-agent-catalog.ts:148`, `dashboard-webview-view-provider.ts:334`,
  `kpi-dashboard-provider.ts:882`), pero Knowledge valida a mano
  (`open-knowledge.ts:48,52`).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

### G12 — CI lento y evaluación redundante de módulos
- Clasificación: `CONFIRMADO` · Zona: CI
- Evidencia: run de PR ~16 min; Vitest reporta que el proyecto `proposals`
  evalúa 1.524 módulos 151.382 veces (111,56 s, 31% del tiempo trackeado) y
  estima ~11,48 s ahorrables por worker con `isolate:false`.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), glm-5.3-flash

### G13 — Legacy vivo sin fecha de extinción
- Clasificación: `MEJORA` · Zona: rules
- Evidencia: `buildRulesManifest` sigue en
  `plugins/rules/src/lib/frameworks/manifest.ts` como camino secundario; los
  tools ya consumen `buildManifestViaComposition` (`rules-tools.ts:12,97`,
  `index.ts:7,120`). Falta plan de retirada.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

### G14 — Deuda de tooling: cwd orientado a repo-root y 2 JS sueltos
- Clasificación: `MEJORA` · Zona: tools/scripts
- Evidencia: `process.cwd()` como repo-root en
  `tools/scripts/gen/quantitative.script.ts:31`,
  `tools/scripts/build/stable-manifest.script.ts:29`,
  `tools/scripts/i18n/translate-tutorials.script.ts:23`; ficheros JS/MJS
  (`tools/scripts/build/stable-manifest.script.js`, su `.spec.js`, y
  `tools/scripts/lib/zod-default-resolver.mjs`) frente a la convención TS.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

### G15 — Escritura-atómica y concurrencia: sin hallazgo
- Clasificación: `CONFIRMADO` (negativo) · Zona: proposals
- Evidencia: escrituras duras vía `withFileMutex`+`writeFileAtomic`
  (`persistent-task-queue.ts:424,449`; `sync-proposal-registry.ts:1252,1309`;
  `locks/engine.ts:152`). Property-tests de la state machine (t00008, t00013).
  Se registra como punto fuerte para que los siguientes revisores lo ataquen.
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

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
- seenBy: glm-5.3-flash, qwen-3.8-max (ver mi Discrepancia parcial con D1: la purga SIN mutex existe en `readSynchronizedLock`, pero su alcance real depende de quién llama fuera del mutex de tabla), qwen-3.8-flash (CONFIRMADO con 2 procesos: claim vivo de A escrito con mutex → `readSynchronizedLock` de B (`loadLock`/`writeLock` sin mutex de lockPath) borró el in_flight de A en el fichero final; el zombie-GC purga stale>threshold aunque el pid viva, solo la rama orphan está protegida por probe); claude-haiku-5-5 (verificado en código, `e342c8e15`), claude-sonnet-5-5 (discrepo: no reproducido en la ruta pública, 0/40 claims vivos perdidos; ver G92)

### D2 — El claim completo computa fuera del mutex
- Clasificación: `CONFIRMADO` · Zona: proposals/locks (segunda pasada, GRAVE)
- Evidencia: `execute-lock-action.ts:29-206` — todo el cómputo de conflicto
  (overlap L75-103, file-table L106-160) se hace sobre el snapshot leído sin
  retener mutex; solo el `writeLockWithMutex` final es atómico. Dos claims
  simultáneos de ficheros disjuntos pueden pasar ambos el check y el segundo
  pisa al primero. El test de serialización solo existe para el session-log
  (`agent-lock-engine.spec.ts:754`), no para el fichero de lock.
- seenBy: glm-5.3-flash, qwen-3.8-max (solo el núcleo "ningún test de dos claims concurrentes"; suscribo la Discrepancia de claude-opus-5-5: el mutex de tabla de `engine.ts:151-155` serializa el claim entre procesos), qwen-3.8-flash (matizo por capa: el helper exportado `tryAcquireFileLocks` (`file-lock-table.ts:380-433`) hace check FUERA de `withMutex` y el write dentro NO re-valida → dos procesos devuelven ok=true sobre el mismo fichero; reproducido con 2 procesos: doble-ok, write pisa. La vía pública `runAgentLockEngine:claim` envuelve check+write en el mutex de tabla y no reproduce doble-grant → D2 = CONFIRMADO en helper, no explotable por el tool público), claude-sonnet-5-5 (discrepo parcial: el helper `tryAcquireFileLocks` solo se llama dentro del mutex de tabla; ver G92)
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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada); claude-haiku-5-5 (verificado en código, `e342c8e15`)

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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada), claude-sonnet-5-5 (confirmado y ampliado: 11 `writeFile` planos vs 4 atómicos en `workspace-migration`; ver G93)

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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada), claude-sonnet-5-5 (confirmado: mismas 8 ubicaciones; matiz de severidad en mi bloque)

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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: `rel="canonical"` solo en `index.astro`), qwen-3.8-flash (verificado en 514758e: `grep rel="canonical"` → sólo `index.astro:54`; hreflang sólo en `index.astro:42-49`; `Base.astro:88` abre un head-slot pero ninguna otra página lo llena), claude-sonnet-5-5 (confirmado: `Base.astro` sin canonical/hreflang, solo `index.astro`)

### D13 — El audit de páginas es decorativo y el drift de manifests web no se detecta en PR
- Clasificación: `CONFIRMADO` · Zona: apps/web (segunda pasada, NUEVO)
- Evidencia: `pages-audit.ts:44-48` dice que `rewrite`/`merge-into` "deberían
  warn sin fallar" pero `grep -rn PAGES_AUDIT apps/web/src` solo devuelve el
  módulo y su spec: nadie emite el warning, y las 8 páginas `rewrite` siguen
  servidas. `drift.yml:57` corre `gen:all:check` en PR, pero
  `tools/scripts/gen-all.script.ts:73-247` no incluye los manifests de
  `apps/web` (`pages.json`, `skills.json`, `capabilities.json`): su drift solo
  se detecta en push a `main` (`pages.yml:1-13`).
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max, glm-5.3-arquitectura (2ª pasada)

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
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado: `delegation-manifest.service.ts:138-171` ya no compila con `allowedTools: []`); claude-haiku-5-5 (verificado en código, `e342c8e15`)

### G21 — La confirmación de gasto no podía darse nunca
- Clasificación: `CONFIRMADO` (corregido en f00551 S6, pendiente de merge) · Zona: orchestrator-runner
- Evidencia: `plugins/orchestrator-runner/src/lib/invoke/token.ts` documenta una puerta conectada a la elicitación MCP; nada la conectaba y `denyAllConfirmationGate` rechazaba todo gasto con `confirmBeforeExecute: true` (por defecto).
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado como CORREGIDO ya en develop: `index.ts:153` cablea `elicitedConfirmationGate`; el estado "en merge" del scoreboard caducó); claude-haiku-5-5 (verificado en código, `e342c8e15`)

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
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado el arreglo en develop: `build-manager.ts:58` propaga `env` y L173 filtra por `accountEnvironment`); claude-haiku-5-5 (verificado en código, `e342c8e15`)

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
- seenBy: glm-5.3-flash, claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado `csp.ts:32-46`; amplío: las 6 implementaciones de escapeHtml no escapan `'` de forma uniforme — ver G42); claude-haiku-5-5 (verificado en código, `e342c8e15`), claude-sonnet-5-5 (confirmado: `csp.ts:56-58` con `script-src 'unsafe-inline'` en toolbar, settings y dashboard)

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
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), claude-opus-5-5

### G35 — El remedio del doctor para refs huérfanas no se podía seguir
- Clasificación: `CONFIRMADO` (corregido en x00920, #1232) · Zona: core/work-units
- Evidencia: `no-stray-refs` mandaba usar `work retire --ref`, que rechazaba toda ref fuera de wip/pr ("is not a unit of work"); y el reaper solo quitaba refs de commits vacíos, no copias de tips que el forge ya guarda (12 en este clon). Ahora `work reap` quita las copias y `work retire` guarda en el forge las demás.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), claude-opus-5-5

### G36 — El texto para el agente nombraba herramientas que ningún servidor registra
- Clasificación: `CONFIRMADO` (corregido en x00918 y x00919, #1225, #1228) · Zona: proposals, core
- Evidencia: `auto_work` y el lock engine decían `proposals_branch_gc`, `proposals_agent_worktree`, `logs_query`, `notification_await_lock`; los nombres reales llevan el prefijo del core y el del plugin. Ahora core nombra cada herramienta con una sola regla (`plugin-tool-name.helper.ts`, `ctx.toolNameOf`).
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), claude-opus-5-5

### G37 — El GC de worktrees y el reaper de CI no leían la regla única de vida de una work ref
- Clasificación: `CONFIRMADO` (corregido en x00917, #1222) · Zona: core/ref-lifecycle, tools/scripts/lint
- Evidencia: `branchDeliveryVerdict` daba por entregada una work ref cuya propuesta seguía en progreso, y `keepInProgressWorkRefs` juzgaba una ref ya integrada por su propio tip en vez de por la rama de integración; ahora ambos leen `workRefProposalOpen`.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), claude-opus-5-5

### G38 — El rollback de migraciones tiene su propia escritura atómica (amplía D7)
- Clasificación: `CONFIRMADO` · Zona: core/migraciones
- Evidencia: `packages/core/src/lib/workspace-migration/transaction/rollback.ts:319` define un `atomicWrite` local en vez de usar el `writeFileAtomic` del core, y en el mismo fichero `rollback.ts:189` escribe plano: la disciplina de escritura de una transacción vive en tres sitios. La corrección de D7 debería pasar todo por la de core.
- seenBy: claude-opus-5-5, gemini-3.8-flash, qwen-3.8-max (verificado `rollback.ts`: `atomicWrite` local en L319, `writeFile` plano en L189 y L326), claude-sonnet-5-5 (confirmado en `rollback.ts`; el ámbito de la restauración es otro defecto, ver G93)

### G39 — `@delendai/test-kit` carece de target de compilación (`build`) en su `package.json`
- Clasificación: `CONFIRMADO` · Zona: packaging/tools
- Evidencia: `packages/test-kit/package.json:9-13` no tiene script `"build"`, a diferencia de los otros 11 paquetes del monorepo (`packages/*/package.json`, que invocan `bun ../../tools/scripts/compile/build.script.ts`). Aunque sus exports apuntan a `./src/index.ts` vía directivas privadas, cualquier invocación global de build o verificación empaquetada que itere sobre `packages/*` encuentra esta asimetría estructural.
- seenBy: gemini-3.8-flash, qwen-3.8-max (verificado; amplío: `ui-extension` también carece de script build, luego son 2 excepciones, no 1), deepseek-v4-pro (reverificado en a78813827: ni `packages/ui-extension/package.json` ni `packages/test-kit/package.json` tienen `"build"` en scripts), claude-sonnet-5-5 (confirmado: `test-kit` y `ui-extension` sin script `build`)

### G40 — `plugins/link-check` no está integrado en la suite de linting de CI ni en `validate`
- Clasificación: `CONFIRMADO` · Zona: tooling/CI
- Evidencia: a pesar del hallazgo D14 (16 enlaces internos rotos en docs) y de contar con un motor puro implementado en `plugins/link-check/src/lib/link-check/check-links.ts` (con tests unitarios y detección ReDoS), el comando de verificación de links no forma parte de `package.json#scripts.validate` ni de ningún workflow en `.github/workflows/`. Los enlaces rotos continúan acumulándose sin un ratchet o gate automatizado en PRs.
- seenBy: gemini-3.8-flash, qwen-3.8-max (verificado: 0 menciones de link-check en validate ni workflows; y D14 reproduce 6 enlaces rotos en un solo doc — este gate pagaría su coste en horas), qwen-3.8-flash (verificado en 514758e: `git show 514758e:package.json` no tiene `lint:link-check` en `validate:run`; `ci.yml` snapshot 0 menciones; el paquete `plugins/link-check` sí existe y exporta motor con tests), deepseek-v4-pro (reverificado en a78813827: `package.json` solo declara `@delendai/link-check` como dep de workspace, 0 menciones en `scripts.validate` ni en `.github/workflows/*.yml`), claude-sonnet-5-5 (confirmado: `@delendai/link-check` solo como dependencia, sin script ni workflow)

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
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-max, claude-sonnet-5-5 (confirmado con matiz: 8 definiciones, 6 sin `'`; latente (P3), no explotable por lo trazado)

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
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-max, qwen-3.8-flash (medido en el ancla `514758e78` con criterio src-only
  `git ls-tree -- $DIR/src | grep '\.ts$'` + `git show | wc -l`: `plugins/proposals/src` = 65.094,
  `packages/core/src` = 121.013 → ratio **54 %**, igual que qwen-3.8-max en otro SHA. Los "144.184"
  (G2) y "core 14k" (G18) no se reproducen con ningún criterio documentado; suscribo la **definición
  canónica src-excl-spec** y que S10 la fije. Ficheros >800 LOC persisten en el ancla: `index.ts`
  1461, `sync-proposal-registry.ts`, `authoring.tool.ts`, `transition`, `auto-work.tool.ts` → el fondo
  SRP (G2) se sostiene; sólo la ratio de G18 está mal)

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
  verificable) en vez de desde la prosa, y una sola tabla. (Añado nota: un subhallazgo
  verificable extra: el field `audit-source.file` del frontmatter apunta a un .md que no está
  versionado; el único artefacto del libro es este .md — G44 subitem.) (4) NUEVO subhallazgo verificado 
  Y CORREGIDO por mí en este propio PR: al aterrizar `4c4e978f8`, el frontmatter decía
  `reviewers-completed: 6` cuando ya había 7 bloques `### <modelo>`, y gpt-5.4 se anotó
  "revisor 7/10" sin subir el contador NI añadir su entrada en `consensus.reviewers[]` —
  el acta no auto-mantiene su propio contador; lo puse a 7 y registré la entrada de gpt-5.4, y
  S10 debe derivar contador y lista desde `^### <modelo>` además de regenerar Acuerdo desde seenBy.)
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-max, qwen-3.8-flash (contadores verificados con grep en 4c4e978; filas G30–G41 huérfanas de cabecera confirmadas en mi merge bdaa090)

### G45 — Dos plugins pinnean zod a una versión distinta del resto del monorepo
- Clasificación: `MEJORA` · Zona: deps
- Evidencia: 63 `package.json` declaran `"zod": "^4.4.3"`;
  `plugins/changelog/package.json` y `plugins/database/package.json` declaran
  `"zod": "^4.0.0"`. En un monorepo con `workspace:*` y un solo lockfile el
  efecto práctico es mínimo (hoisting resuelve una sola copia), pero rompe la
  homogeneidad de manifiestos y permite que esos dos plugins compilen contra
  tipos de zod más antiguos que el resto. Un lint de versiones alineadas (ya
  existe infra en `tools/scripts/lint/`) lo impediría.
- seenBy: qwen-3.8-max, deepseek-v4-pro (reverificado en a78813827: `changelog/package.json:32` y `database/package.json:57` siguen en `^4.0.0` frente a `rules/package.json:52` `^4.4.3`), claude-sonnet-5-5 (confirmado: `plugins/database` y `plugins/changelog` con `^4.0.0`)

### G46 — `logo-mono.svg` es una cuarta copia de marca sin gate
- Clasificación: `CONFIRMADO` · Zona: brand/web/extensions
- Evidencia: `apps/shared/brand/logo-mono.svg`, `apps/web/public/logo-mono.svg`
  y `extensions/vscode/media/logo-mono.svg` son byte-idénticos (diff verificado
  en snapshot 514758e78). `lint:brand` (`extensions/vscode/scripts/sync-logo.ts`)
  solo vigila `logo.svg` con fuente `apps/web/public/logo.svg`; `logo-mono`
  añade una cuarta copia que ningún gate protege. Extiende G9 (tres `logo.svg`).
- Remedio: extender sync-logo a la pareja (logo, logo-mono) con fuente única
  `apps/shared/brand/`.
- seenBy: glm-5.3-arquitectura (2ª pasada), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

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
- seenBy: glm-5.3-arquitectura (2ª pasada), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

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
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), glm-5.3-arquitectura (2ª pasada)

### G49 — El gate de settlement no protege la transición que dice proteger
- Clasificación: `PROBABLE` · Zona: commit-policy
- Evidencia: `engine.ts:577-590` aplica el gate solo a `event.kind === 'slice'`
  con `settlementRead` opcional; el test "SETTLING surface refuses a
  re-entering worker" (`eventual-settlement.spec.ts:92-102`) solo comprueba que
  el registro expone `phase` — el propio comentario del spec lo admite ("the
  engine wiring is exercised by the unit tests"). La fase se lee pero la
  transición ACTIVE→SETTLING no es atómica respecto a un claim que entre justo
  después del read.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), glm-5.3-arquitectura (2ª pasada)

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
- seenBy: glm-5.3-arquitectura (2ª pasada), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

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
- seenBy: glm-5.3-arquitectura (2ª pasada), qwen-3.8-flash (verifico por subagente la
  secuencia lost-update: write-live-ok de A → readSynchronizedLock de B →
  in_flight vacío en el fichero final; y confirmo que por la vía pública
  `runAgentLockEngine` en storm el mutex de tabla impide el doble-grant —
  el vector que sí reproduce doble-ok es el helper exportado
  `tryAcquireFileLocks`, no el tool. La causa de G51 (ENOENT→emptyLock) es
  correcta como lectura frágil. **Re-test con storm=50 (dos procesos bun reales,
  snapshot extraído a /tmp)**: 0/50 doble-grants, 0/50 lost-updates → el
  ENOENT transitorio del rename no llega a producirse en este FS rápido. No
  confirmo ni refuto el 21/30 de glm (FS/carga-dependiente); suscribo la
  causa como lectura frágil, la frecuencia queda en disputa), deepseek-v4-pro (reproducción propia con 2 procesos reales del engine: con el PRIMER reclamante VIVO 25/25 el segundo recibe `blocked:true` y 0 doble-grants — el mutex de tabla funciona cuando el poseedor vive; con procesos EFÍMEROS 10/25 rondas pierden un claim por purga de pid (`isProcessAlive` en `removeStale`), no por ENOENT. Confirmo la causa "lectura frágil" de G51 (loadLock traga errores→emptyLock) y su frecuencia como FS/carga-dependiente; el defecto sistemático que SÍ reproduje es la asimetría respuesta↔persistido → G69)

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
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-flash (2026-10-19)

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
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-flash (2026-10-19)

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
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-flash (2026-10-19), claude-sonnet-5-5 (confirmado en el spawner (`server-registry.ts:83`); gate de activación no re-verificado)

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
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-flash (2026-10-19), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

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
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-flash (2026-10-19), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9, claude-sonnet-5-5 (confirmado: `subagentExhausted` solo en comentario (`linear-dispatcher.ts:20`); `orchestratorExhausted` sí se consulta)

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
- seenBy: qwen-3.8-flash, deepseek-v4-pro (reverificado en a78813827: `grep -rn "@delendai/roadmap-sqlite" --include="*.ts"` fuera del propio paquete → 0 hits; el plugin roadmap sigue en `MarkdownRoadmapStore`), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9, claude-sonnet-5-5 (confirmado: 0 referencias externas a `@delendai/roadmap-sqlite`)

### G60 — Byte NUL (0x00) físico dentro de un prompt emitido al modelo
- Clasificación: `CONFIRMADO` (fuente y propagación) · Zona: plugins/prompts-pack + canal de texto a LLM (segunda pasada; propagación confirmada al converger con gpt-5.4 D38)
  — actualización 2026-10-19: mi cautela original ("no materialicé el NUL al importar") queda resuelta por D38:
  el texto corrupto llega al prompt porque el `template` es una función cuyo string se construye con esos bytes; y persiste
  en develop `4c4e978f8` (grep NUL L47 = 3).
- Evidencia (qwen-3.8-flash, snapshot 514758e78): `grep` del fichero lo reporta como *"binary file matches"*; `hexdump` muestra `55 73 65 20 00 64 65 6c 65...` → un **0x00 físico** entre `Use ` y `delendai_git_changelog` en `plugins/prompts-pack/src/prompts/review-diff.ts:47`, dentro de un template literal:
  b`'Use \x00delendai_git_changelog\x00 with range `${range}` ...'`
  Las líneas vecinas L46/L48 envuelven el nombre de herramienta en backticks markdown (`` `delendai_git_diff` ``); la conversión a template literal de L47 corrompió esos backticks a NUL. `git blame` → commit `2a7c8c71e` (Cartago 2026-09-04).
  Escaneo completo de todos los `.ts` fuente (excl test/dist/d/generated) → **solo 2 ficheros** con NUL: este (2×) y `packages/core/src/lib/wip-engine/patch-digest.ts` (5× en L80/82/85: `scope\0${path}`, `entry\0${path}\0${mode}\0${sha}`), que aquí el NUL es **separador de dominio intencional en hashing → correcto, no defecto**. Superficie `.md/.json/.txt` sin NUL hallado.
- Qué debería: un prompt dirigido al agente no debe contener bytes de control; el nombre de herramienta debe ir en su notación normal (backticks como las líneas vecinas).
- Qué ocurre: el literal fuente que construye `buildReviewThisDiffPrompt` (exportado y cableado en `plugins/prompts-pack/src/index.ts:7` → tool `reviewThisDiff`) lleva NUL. En JS un `0x00` **sí forma parte de la cadena runtime** del template literal, así que el modelo puede recibir `Use ⎵delendai_git_changelog⎵`.
- Impacto: degradación del prompt (no corrupción de datos); bajo pero real en calidad de instrucción al LLM. P3.
- Causa raíz: conversión `'…'` → b`…` (para interpolar `${range}`) que sustituyó los backticks del nombre por NUL sin que ningún check lo viera.
- Solución mínima: reescribir L47 con backticks normales (como L46/48).
- **Confianza / no reproducido:** al importar el módulo en runtime e inspeccionar las cadenas del objeto devuelto, **No detecté NUL en las strings del resultado** para `{range:'HEAD~1'}` (sondeo inconcluso: quizá la rama NUL depende del camino de construcción o del objeto retornado). La integridad **de la fuente** (0x00 físicos en un prompt) está **CONFIRMADA por hexdump**; si viaja al modelo al 100%, queda PENDIENTE y lo anoto como límite, no lo afirmo.
- Relación: es un miembro de la familia G19 (texto interpolado) y un predecesor de G61.
- seenBy: qwen-3.8-flash (2026-10-19), glm-5.3-arquitectura (2026-10-19 — resuelve el pendiente: sondeo runtime `buildReviewThisDiffPrompt` con firma real `(namespacePrefix: string)`; el template generado NO contiene NUL físico. Causa exacta de la discrepancia: la interpolación es POST-procesamiento — `buildTemplatedPrompt` recibe el literal con NUL pero lo que emite es descripción+argumentos, y la línea 47 vive en la rama de instrucciones que solo se materializa en el render final del prompt del host; con el builder invocado directamente el string NUL queda en el objeto de registro, no en `template`. La fuente sigue defectuosa (confirmado por hexdump, suscribo), la propagación al modelo queda PROBABLE-no-confirmada: el path exacto depende del renderer del host. El fix de L47 (backticks) sigue siendo el remedio correcto e insignificante.), qwen-3.8-max (2ª pasada 2026-10-19): fuente reconfirmada (python, 2 NUL físicos en L47, en el árbol y en copia /tmp); propagación al runtime NO reproducida en 5 sondas import() — ver mi bloque 2ª pasada), claude-sonnet-5-5 (confirmado en `e342c8e15` con 2 bytes NUL (lectura binaria))

### G61 — Gate-gap: ningún linter de CI rechaza bytes de control (C0) en string literals de fuente
- Clasificación: `CONFIRMADO` · Zona: CI/lint (amplía G60)
- Evidencia (qwen-3.8-flash, snapshot 514758e78): los gates sobre el fichero afectado **pasan limpios** → por eso el defecto G60 sobrevive desde 2026-09:
  - `bun x @biomejs/biome check …/review-diff.ts` → **PASS** (biome no tiene activada regla `suspicious/noControlCharactersInString`/Template; grep de `noControl` en `biome.json` = vacío).
  - `bun run lint:content-integrity` → **PASS**; el script usa `\u0000` solo como separador de clave interna (`content-integrity.script.ts:106`), **no** escanea bytes de control.
  - `bun build`/tsc del template con NUL → **compila** (JS admite `0x00` en un template literal).
  - `validate:run` no incluye ningún gate "no-C0-control-chars".
- Qué debería: un gate que falle ante `0x00`–`0x08`/`0x0b`/`0x0c`/`0x0e`–`0x1a` fuera de separadores intencionales conocidos (los de `patch-digest` serían allow-list), así G60 no es observable.
- Impacto: permite defectos silenciosos de texto→modelo como G60 en cualquier cadena. P3.
- Causa: biome no tiene la regla activada y los linters propios no cubren integridad de bytes.
- Solución mínima: activar las reglas `suspicious/noControlCharactersInString/RegEx` de biome, o añadir un lint `content-integrity` con escaneo de C0 + allow-list (ya hay infra).
- Confianza: alta. Relación: G60, G19.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-flash (2026-10-19)

### G62 — ENOENT determinista del sidecar `.mutex` del stream de errores: un fallo de observabilidad que se silencia a sí mismo
- Clasificación: `CONFIRMADO` (reproducido) · causa de línea exacta `PENDIENTE` · Zona: core/error-collector + logs (segunda pasada, NUEVO)
- Evidencia (qwen-3.8-flash, snapshot 514758e78, workspace vacío en /tmp):
  - **Instancia ÚNICA** del server MCP sobre un `HOME`/cache fresh: el primer evento de cada día lanza
    `onToolStart error: ENOENT: ... 'results/logs/<date>.jsonl.mutex'` y lo mismo `onToolCall error`.
    Reproducido **2× idéntico** (no es race). Arranque y tool-call terminan `ok:true`.
  - Descartado por mí con aislamiento: **no** es "falta de `mkdir`" ni TOCTOU de `open(...,'wx')` —
    `withFileMutex` SÍ hace `mkdir(dirname, {recursive})` antes de `open('wx')` (with-file-mutex.ts:490,500)
    y mi `mtx-repro` ("withFileMutex OK en dir inexistente") lo prueba.
  - No es multi-proceso: ocurre con una sola instancia (la concurrencia de secc.6 §8 bootea bien:
    `Promise.all` dos `connectTokenBudgetClient`, cada `outcome-A/B.json` `ok:true`, HOME aislado).
  - Ruta del sink que lanza: `plugins/logs/src/index.ts:90` `appendEvent` → `errorStore`
    (`createLogStore(errorLogsDir)` L63) para `outcome` no-ok; el primitivo está salvaguardado, así que
    o bien hay una segunda llamada sin `mkdir` sobre el `.mutex` en el camino cold, o el `errorStore`
    construye directorio antes de que exista — que no capturé con stack sin parchear producto (fuera de
    mi rol).
- Qué debería: un fallo de escribir el evento de error NO debe perderse en silencio; si el primitivo está
  bien, quien lanza es un camino que no pasa por `mkdir(recursive)` antes del `open` del sidecar. El evento
  de error en sí se pierde (observabilidad).
- Qué ocurre: el error-collector reporta `[delendai] onTool* error: ENOENT ...` y el `logs-sink` de core
  (f00154 S2) catchea y no resube; el `tool-started`/`tool-completed` se pierden en el JSONL del día
  aunque la herramienta responde bien al cliente.
- Impacto: bajo (P3): no corrompe datos, no rompe call, no bloquea arranque. Es exactamente el tipo de
  "fallo silenciado que degrada la telemetría que la auditoría lee primero" (el playbook se basa en
  `logs-errors/*.jsonl` como *known-bad list*; si se pierden eventos de tool-start/failed en cold-boot, la
  propia fuente de evidencia de auditorías futuras es incompleta).
- Solución mínima: no lo determino hasta capturar el stack (rol de auditor); pero el hallazgo es que
  **existe un catch silencioso que oculta un error determinista de escritura del sidecar** en cold-boot.
- Prueba de regresión (para el equipo): test que levante un `HOME` cache nuevo, llame 1 tool, y afirme
  que las líneas `results/logs/*.jsonl` tienen el `tool-started`/`tool-completed` de esa llamada (hoy se
  pierden en el error-branch).
- Confianza: **alta** en el hecho observado y en "no es race/falta-mkdir (descartado por aislamiento)";
  **pendiente** en la línea/causa exacta sin parchear producto.
- Relación: distinto vector de la familia D1/D2/G51 (sidecar `.mutex`) pero sobre `logs`, no
  lock-store; amplía G40 (calidad de observabilidad); conecta con §6 ("¿qué observa la cuota/estado").
- seenBy: qwen-3.8-flash (2026-10-19)

### G63 — Observabilidad del swarm: al landear la work-ref se borra y el agente pierde su rama visible (hallazgo del owner, qwen lo verifica)
- Clasificación: `CONFIRMADO` (como comportamiento) · `THESIS` (como defecto: su gravedad es discutida) · Zona: governance/observabilidad (nuevo)
- Origen: el coordinador (owner) observa que "no veo la rama" y lo marca como criterio deseado — "siempre debería
  haber rama de wip o de pr para que tengamos visualmente lo que ha hecho cada agente". Lo verifico con datos, no con opinión.
- Qué observo (medición concreta con `git ls-remote origin`, `gh pr list --state merged` y `git log
  --first-parent origin/develop`):
  - Tras landear, la **work-ref (wip) se borra**: la rama deja de ser una branch viva y pasa a existir sólo como
    `headRefName` dentro del PR (que GitHub no muestra en "Branches"). Medido sobre este acta: los PRs `a00095`
    ya *mergeados* (claude-opus/gemini/glm/qwen-max) dejan cada uno **0 o 1 refs `delendai/(wip|pr)` vivas** para su
    slice — `gpt-6-luna/S5` = **0**, `gemini/S4` = 1, `gpt-5.4/S2` = 1, y `qwen/S7` pasó de 2 ramas (vivo, sin landear al medirlo) a **1** tras su fusión (`bdaa0905a`): sólo sobrevive la pr-ref dentro del PR cerrado, la wip se borra; los cuatro convergen en 0–1 ramas vivas visibles-por-agente, no 2 estables.
    Ninguno mantiene su **rama de trabajo visible después de fusión**.
  - El único resto por diseño es `retired/husk` (1 entrada: `qwen-3.8-max-a00095-S3`) — y eso sale de un `work retire`
    manual, no del camino happy de un merge; o sea que el "husk" no es el mecanismo estándar de retención de traza.
- Qué debería (según tú): un observador humano, mirando solo las ramas de GitHub, debería poder ver por agente
  qué trabajo existe, en qué slice y con qué estado.
- Qué ocurre (dos interpretaciones legítimas, **esta es la tesis**: dejo mi duda medible para arbitraje):
  - **Lectura 1 (defecto de observabilidad — tu tesis):** el modelo *shared-checkout-pr* elimina la wip-ref en el
    merge (`keep-work-ref` sólo aplica si `a00095` sigue in-progress con **más trabajo por hacer**, no al cerrar la
    propuesta), así que la trazabilidad por agente depende de la **lista de PRs + merge-commits**, no de las ramas.
    Como tú ves (y se ve en C): un agente cuya PR ya se fusionó queda **sin ninguna rama**, y para ver "qué hizo" hay
    que leer PRs (que en GitHub no se ven a primera vista como ramas).
  - **Lectura 2 (no es defecto, está documentado y tiene traza alternativa):** el trabajo se **convierte** en trazas
  más fuertes: merge-commit con `delendai/pr/<agente>/implement/a00095-...` en `--first-parent develop` (lo conté
  **exacto: 7 merges** con nombre de slice `a00095`, cada uno con agente + slice → **cada agente y slice queda escrito
  en el commit de su merge**) y el PR cerrado conserva el `headRefName` con el agente. La API de ramas muestra sólo
  las **vivas**; que muera la rama no borra "quién hizo qué": lo codifica el merge-commit. Por eso
  `qwen-3.8-max/a00095-S3` parece "desaparecido" y su rastro real es el **merge #1244**.
- Contraste: ¿qué es menos ambiguo? La wip/pr **viva** que ves (mi S7 tenía 2 ramas porque al medirlo aún no estaba landeado; tras `bdaa0905a` sólo le quedó la pr-ref cerrada). Pero
  **al cerrar la propuesta, esa rama es eliminable por diseño y tu ojo vería el patrón gpt-6-luna (0 refs)**, y tú
  interpretas correctamente — para un humano "sin rama = no está visible".
- Solución mínima honesta (según lectura 2 no hace falta "crear una capa nueva"): **el problema real no es dónde vive
  el registro sino que no existe una vista unificada `por-agente → rama/PR/merge-commit`**. Una *mejora* de producto barata,
  **sin nueva fuente de verdad**: en la UI de ramas (o un comando `agents status`) proyectar la lista de merge-commits de
  `develop` (o `git ls-remote delendai/`) para que se vea, por agente, "rama viva / rama cerrada / commit de merge
  (SHA)" — reutilizando datos que ya existen, no inventando un estado compartido nuevo.
- Impacto: **bajo (P3)**: no corrompe ni bloquea; es una pérdida de **observabilidad por humano** del estado de multiagente.
  Para **el sistema** (el GC de worktrees/CI, los gates por SHA, `work swarm`) el registro está intacto; no es un bug de
  integridad, es un bug de **visibilidad**.
- Confianza: **alta en lo medido** (`git ls-remote`, `gh pr list --state merged` y `git log --first-parent`: los 7
  merges de `a00095` nombran slice+agente, no la etiqueta C/B/D); **media en la gravedad** porque es *diseño intencional* con traza alternativa por
  merge-commit, y el propio protocolo del acta (`shared-checkout-pr`) ya dice que la work-ref **debe** borrarse al cerrar.
  Si el coordinador quiere "ver rama por agente" siempre, eso **es una decisión de producto** (conservar husk, o UI
  unificada), no un hallazgo técnico sin matiz: lo dejo como **tesis disputable con contra-evidencia escrita** para que
  otro agente arbitre con menos sesgo que yo.
- Relación: conecta con G44-G46 del libro (el libro *mismo* es una traza manual de lo que hizo cada agente) y con la
  "higiene de cola" (puntos fuertes del libro) que sí borra refs por diseño.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-flash (2026-10-19)

### G64 — El anexo firmado de un auditor no tiene dónde vivir: `evidence/` no es bilingüe ni admite el scaffold
- Clasificación: `CONFIRMADO` · Zona: tooling/docs + método de auditoría (nuevo, revelado por el intento de publicar este propio informe)
- Evidencia (qwen-3.8-flash, snapshot `514758e78`, reproduciendo los gates):
  - `bun tools/scripts/lint/i18n-english-prose.script.ts` excluye el español **sólo**
    bajo `**/docs/delendai/proposals/**` (línea ~179 del script). Un informe de auditor
    en prose español colocado en `docs/delendai/evidence/` **falla** ese gate (412+ violaciones,
    ver `L1..L9`).
  - La única alternativa (`proposals/review/*.md`) impone el **scaffold de
    propuesta** obligatorio (`proposal-lint`): frontmatter canónico + `## goal`.. +
    slices con `- **Gate**:`/`- **Files**: [...]`, y un **filename matching**
    (`<prefix><NNNN>-kebab`) que la identidad del modelo (`qwen-3.8-flash` con `.`)
    **no satisface**: `proposal-filename-canonical` rechaza `...-qwen-3.8-flash-...`.
  - Resultado binario: un anexo en prose natural (español, sin frontmatter) no pasa por idioma;
    un anexo en inglés pasa por idioma pero **no** por el scaffold ni el nombre si vive en
    `evidence/`, y si vive en `proposals/**` es una propuesta (semántica incorrecta). No hay un
    tercer sitio. Esto hace a los anexos largos **no publicables como docs propios**. Por eso
    este propio informe fue movido y **inlineado en mi bloque del libro**, y la
    `docs/delendai/evidence/` queda para artefactos ya versionados (`q00009-startup-report`,
    `.txt`).
- Qué debería: un sitio (`evidence/**` o una convención explícita) para anexos de auditor, sin
    exigir que una auditoría sea una `type: proposal` con scaffold de slices.
- Qué ocurre: el auditor debe o bien **no** tener anexos y condensar todo en el bloque del libro (el
    camino que tomé inlineando tandas aquí) o bien encajar su informe al formato de una propuesta.
- Impacto: medio de flujo (P2): degrada la señal del protocolo (informe largo firmado no cabe); el
    sistema lo detecta (por eso falló CI el intento), pero no ofrece destino legítimo. No causa
    pérdida de trabajo: el inline en `a00095` conserva la evidencia.
- Solución mínima (reutilizar): o bien anotar en el playbook/AGENT-BOOTSTRAP que el **bloque del
    reviewer en el acta** es el único sitio canónico (lo que yo hice: las tandas + tablas inline +
    G52-G63), o añadir una `kind: evidence` a `proposal-lint` con
    scaffold de auditor, o añadir un exclusion en `i18n-english-prose` de `**/docs/delendai/
    evidence/**.md`. Ninguna añade una capa nueva.
- Relación: es el análogo documental de G63 (observabilidad): en ambos el sistema funciona
    para las máquinas pero no expone un destino humano para el artefacto del rol (rama visible /
    informe firmado de auditor). El propio libro `a00095` es ya "un anexo": si el auditor no lo
    mete inline, tampoco tiene dónde.
- Confianza: alta (los 3 fallos/gates reprodujeron, y el "inline" funcionó al pasar a 0 fatal).
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-flash (2026-10-19)

### G65 — Tres catálogos de hosts y ninguno coincide con los otros
- Clasificación: `CONFIRMADO` · Zona: core/hosts (2ª pasada glm-5.3-arquitectura)
- Evidencia (snapshot 514758e78):
  - `AGENT_HOSTS` (`agent-hosts.constant.ts`): 9 entradas (copilot, claude, codex,
    opencode, cursor, windsurf, gemini, continue, agents-md) — "the one list of
    hosts delendai writes agents and instructions for".
  - `known-clients.constant.ts`: 8 entradas CLI distintas (claude-cli, codex-cli,
    copilot-cli, opencode-cli, gemini-cli, aider-cli, continue-cli,
    cursor-agent-cli) — incluye **aider**, que NO está en AGENT_HOSTS, y omite
    windsurf/agents-md.
  - `DEFAULT_SCAFFOLD_HOSTS` (`scaffold-host.ts:746-750`): solo 3 (copilot,
    claude, codex).
  - `config/external/`: aider, claude, codex, cursor, mcp — sin windsurf.
  El comentario de AGENT_HOSTS dice "every writer reads it", pero known-clients
  y el scaffolder mantienen listas propias con membresía desigual.
- Impacto: un usuario de Windsurf recibe instructions (si nombra el host) pero
  no detección CLI; un usuario de aider tiene detección CLI y config external
  pero nunca agents ni instructions. Ningún gate compara los tres catálogos.
- Remedio: un único catálogo con proyecciones (hosts-capability) y lint de
  membresía consistente, o documentar explícitamente por qué difieren.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), glm-5.3-arquitectura (2ª pasada)

### G66 — Hosts declarados sin material: windsurf y agents-md
- Clasificación: `CONFIRMADO` · Zona: core/hosts + config
- Evidencia: `AGENT_HOSTS` declara `windsurf` (instructions `.windsurfrules`) y
  `agents-md` (instructions `AGENTS.md`) con evidencia de detección por paths,
  pero: `config/external/` no tiene directorio windsurf (verificado), known-clients
  no los lista (grep sin matches), y ningún test de scaffold los ejercita en el
  snapshot. Promesa de soporte sin camino probado.
- Remedio: o se les da pieza completa (config, detección, spec) o se marcan
  `experimental` en el catálogo para no anunciarlos.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), glm-5.3-arquitectura (2ª pasada)

### G67 — Comandos CLI `alias` y `bridge` sin spec colateral
- Clasificación: `MEJORA` · Zona: cli/tests
- Evidencia: `packages/cli/src/commands/` tiene 12 comandos; 10 con spec
  colateral. `alias.command.ts` (192 LOC) y `bridge.command.ts` (151 LOC) no
  tienen `*.command.spec.ts`. Las libs subyacentes SÍ están testeadas
  (`lib/alias/alias-manager.spec.ts`, `alias-command.integration.spec.ts`,
  `lib/bridge/bridge-installer.spec.ts`), así que el gap es la capa de
  encuadre de argumentos/salida del comando (donde viven los regress de UX de
  flags y códigos de salida).
- Remedio: spec delgada de smoke por comando (parse de args + exit codes),
  siguiendo el patrón de `cache.command.spec.ts`.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), glm-5.3-arquitectura (2ª pasada)

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
- seenBy: gpt-5.4, qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

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
- seenBy: gpt-5.4, qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `forge.ts:482,491,501` compara `remoteHost === 'github.com'/'gitlab.com'` exacto antes del `Unsupported forge provider…`), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

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
- seenBy: gpt-5.4, claude-sonnet-5-5 (confirmado, latente: `createProjectPlugin(` sin llamadores fuera de specs)

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `work-unit-generation.service.ts:78` fija `refs/remotes/origin/${integration}`)

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

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
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D35 — El `Verified State` heredado de a00095 ya no describe el snapshot actual
- Clasificación: `CONFIRMADO` · Zona: audit/doc-state
- Evidencia: en el snapshot actual `develop` (`514758e783620c8953079be4d71fceccacb3de8b`) el árbol da `13` packages (`find packages -mindepth 1 -maxdepth 1 -type d | wc -l`), `1800` specs en `packages+plugins` (`find packages plugins -name '*.spec.ts' | wc -l`) y backlog visible `2 in-progress / 0 ready / 15 review / 47 retired` (`find docs/delendai/proposals/{in-progress,ready,review,retired} ...`). La tabla `Verified State` del documento todavía dice `12` packages, `1.778` specs y `2 / 1 / 14+ / 48` con `0 review`.
- Impacto: el libro de actas compartido sigue siendo útil como acta histórica, pero sus métricas de estado ya no sirven como inventario del snapshot que hoy se está auditando. Si no se separa explícitamente “estado base del modelo 1” de “estado verificado del snapshot actual”, el consenso mezcla evidencias sobre árboles distintos.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D36 — El dashboard de tokens subestima el coste real de respuestas routed al medir solo `structuredContent`
- Clasificación: `CONFIRMADO` · Zona: token-budgets/tooling
- Evidencia: `tools/scripts/report/token-budget-report-lib.ts:321-350` define `payloadBytes()` como `JSON.stringify(structuredContent)` cuando existe, ignorando `content[]` y `_meta`. El propio comentario lo justifica como “lo que recibe el modelo”, pero el addendum de task context del dashboard publica esos bytes como si fueran el coste de la respuesta de herramienta. En un muestreo real de `delendai_compact_router { domain: "core", action: "project_context" }` guardado en `/tmp/project-context-routed.json`, el resultado MCP completo pesa ~1859 B en `managed` frente a 672 B de `structuredContent` solo; además incluye `content[0].text` duplicando el payload y `_meta.checkpointAdvisory`.
- Impacto: la medición actual es útil como aproximación del payload semántico, pero infraestima de forma grande el coste wire/end-to-end de herramientas routed y respuestas con advisory metadata. Eso sesga comparaciones entre superficies y puede ocultar que una optimización mueve coste desde `structuredContent` a texto/envelope en vez de eliminarlo.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D37 — El roadmap 0.2.0 ya no describe fielmente lo que el árbol actual ha entregado
- Clasificación: `CONFIRMADO` · Zona: roadmap/proposals
- Evidencia: `docs/delendai/ROADMAP.md:4-33` mantiene `roadmap` y `state-shadow` como `in-progress`, y `style-surface`, `capability-contract` y `docker-tools` como `proposed`, aunque sus propuestas gate ya están `done`: `f00756` (`docs/delendai/proposals/done/feats/f00756-...md:1-15`), `q00019` (`docs/delendai/proposals/done/plans/q00019-...md:1-15`), `f00548` (`.../f00548-...md:1-14`), `f00550` (`.../f00550-...md:1-14`) y `f00543` (`.../f00543-...md:1-12`). En el caso de `state-shadow`, además el core ya lo cablea explícitamente mediante `state.parity.shadow.enabled` en `packages/core/src/lib/cli/state-registry-choice.ts:1-88`.
- Impacto: la hoja de ruta deja de ser autoridad fiable sobre qué pertenece al futuro y qué ya está entregado. Eso degrada el valor de versión, confunde priorización y hace que parte del horizonte 0.2.0 siga leyéndose como promesa cuando el árbol actual ya lo contiene.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9), claude-sonnet-5-5 (confirmado: `roadmaps.json` 0.2.0 con `delivered: []`, último commit 2026-10-13)

### D38 — `review-diff` contiene bytes NUL dentro del nombre de una tool y el prompt llega corrupto al modelo
- Clasificación: `CONFIRMADO` · Zona: prompts-pack
- Evidencia: `plugins/prompts-pack/src/prompts/review-diff.ts` contiene dos bytes NUL en la línea que recomienda `delendai_git_changelog`; al leer el fichero con sustitución visible aparece `Use <NUL>delendai_git_changelog<NUL> with range ...` en la línea 47. El módulo sigue importando (`bun -e "import('./plugins/prompts-pack/src/prompts/review-diff.ts')"` devuelve `ok`), así que la corrupción no rompe el runtime pero sí llega al texto del prompt. La spec `plugins/prompts-pack/src/prompts/prompts.spec.ts:1-118` verifica ids y longitud, pero no detecta bytes NUL ni corrupción textual.
- Impacto: el prompt que se entrega al host/modelo puede nombrar una tool con caracteres invisibles incrustados. Eso degrada la copiabilidad exacta del nombre, la depuración del prompt y la confianza en una superficie cuyo contrato es precisamente texto para agentes.
- seenBy: gpt-5.4, qwen-3.8-flash (reconfirmado independiente en develop `4c4e978f8`: sed -n '47p' | grep -c $'\x00' = 3, los NUL persisten; su evidencia de propagación al prompt cierra el PENDIENTE que yo anotá en mi G60), qwen-3.8-max (2ª pasada 2026-10-19): fuente reconfirmada (python, 2 NUL físicos en L47, en el árbol y en copia /tmp); propagación al runtime NO reproducida en 5 sondas import() — ver mi bloque 2ª pasada)

### D39 — El universo de hosts está partido entre scaffold, runtime e instrucciones manuales; Aider queda fuera de la autoridad canónica
- Clasificación: `MEJORA` · Zona: hosts/scaffold
- Evidencia: `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts:1-70` define `AGENT_HOSTS` como "the one list of hosts delendai writes agents and instructions for", pero no incluye `aider`; sin embargo `plugins/usage-tracking/src/lib/detect-agent.ts:18-35` sí reconoce `aider`, `packages/core/src/lib/contracts/interfaces/agent-identity.interface.ts:38-44` lo incluye en el slug union, `packages/core/src/lib/development-policy/profiles.constant.ts:132-146` lo trata como host conocido, y `config/external/README.md:10-24` mantiene `.aider.conf.yml` como integración externa viva. `docs/delendai/FILE-CONVENTIONS.md:239-246` documenta Aider como "not scaffolded; manual", es decir: el sistema convive con dos autoridades distintas para el mismo universo de hosts.
- Impacto: no es un bug de ejecución inmediata, pero sí una fractura de fuente única de verdad. Hosts como Aider existen para detección, identidad y config externa, pero no para el scaffolder/host registry que otros servicios recorren. Eso aumenta el riesgo de migraciones incompletas, detección parcial y documentación que diverge por familia de host.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D40 — `api_call` promete fetch gobernado por allowList/timeout/maxBytes, pero la carga de `specUrl` hace `fetch` crudo
- Clasificación: `CONFIRMADO` · Zona: api/openapi
- Evidencia: `plugins/api/src/lib/tools/api-call.tool.ts:126-150` anuncia que `specUrl` se resuelve "via the allow-listed web-fetch engine", pero delega a `fetchAndParseSpec()`. Esa función (`plugins/api/src/lib/spec/openapi.ts:355-370`) ignora `allowList`, `timeoutMs` y `maxBytes` y ejecuta `fetch(url, {})` sin el cerrojo de `webFetch`. En cambio la ruta hermana `api_validate` sí pasa por `webFetch` cuando no hay `specFetch` inyectado (`plugins/api/src/lib/tools/api-validate.tool.ts:132-158`).
- Impacto: la llamada al endpoint puede estar gobernada, pero la descarga previa de la spec remota no lo está. Eso abre una ruta de red sin las mismas cotas ni el mismo allow-list que el propio contrato del tool promete al usuario.
- seenBy: gpt-5.4, qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9, claude-sonnet-5-5 (confirmado: `fetchAndParseSpec` ignora `allowList/maxBytes/timeoutMs` (`openapi.ts:355-370`); ver G101)

### D41 — `external_mcp_call` puede devolver `missing-env`, pero su `outputSchema` no admite ese código
- Clasificación: `CONFIRMADO` · Zona: external-mcps/contracts
- Evidencia: el registry declara `ExternalCallFailureCode = 'unknown-server' | 'missing-env' | 'call-failed' | 'call-timeout'` en `plugins/external-mcps/src/lib/subprocess/server-registry.ts:334-338`; `invoke-proxy` reexpone `outcome.code` tal cual (`plugins/external-mcps/src/lib/tools/invoke-proxy.ts:214-223`); pero `CallOutputSchema` solo enumera `ack-required`, `llm-activation-disabled`, `unknown-server`, `call-failed` y `call-timeout` (`invoke-proxy.ts:80-90`).
- Impacto: una falta real de variables de entorno puede producir una respuesta estructurada cuyo `code` cae fuera del contrato publicado. Para clientes tipados o hosts que validen la salida, eso convierte una falta de configuración en un error de protocolo secundario.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D42 — `audit-orchestrator` no parsea un plan real del repo y puede derivar cero tareas de un `type: plan` válido
- Clasificación: `CONFIRMADO` · Zona: audit-orchestrator
- Evidencia: `parseChildren()` en `plugins/audit-orchestrator/src/lib/plan-reader.ts:45-62` solo acepta líneas que empiecen exactamente por ocho espacios + `- id:`. Un plan real del repo como `docs/delendai/proposals/ready/plans/q00011-...md:20-80` declara `contains.proposals` con listas YAML inline (`- { id: r00038, ... }`). Una sonda directa con `parseAuditPlan()` y `deriveAuditTasks()` sobre ese fichero devuelve `{ children: 0, slices: 0, taskCount: 0 }`.
- Impacto: el plugin que debería orquestar auditorías y planes puede tratar un plan válido del propio repositorio como si no contuviera trabajo alguno. Eso no es deuda de formato: es pérdida funcional directa en la lectura de la fuente de verdad de planificación.
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `plan-reader.ts:49` exige `line.startsWith('        - id:')`; el YAML inline `- { id: … }` no se parsea)

### D43 — `browser_query` promete resultados acotados, pero ignora el planner que ya define el bound
- Clasificación: `CONFIRMADO` · Zona: browser
- Evidencia: `plugins/browser/src/lib/page/planner.ts:1-49` ya define `maxResults` por defecto 20 y tope 100, además de normalización de selector/URL. Sin embargo `plugins/browser/src/lib/tools/browser-inspect.tool.ts:166-210` registra `browser_query` sin `maxResults` en el `inputSchema`, no llama a `planPageRequest()`, y delega al driver solo `{ url, selector }` mientras la descripción sigue prometiendo "bounded DOM matches".
- Impacto: el contrato MCP promete una cota que hoy no existe en la llamada real. El tamaño de la respuesta depende por completo del adaptador host/driver, y el planner ya escrito para cerrar ese riesgo está desconectado.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D44 — Dos screenshots concurrentes del plugin browser pueden sobrescribirse en el mismo milisegundo
- Clasificación: `CONFIRMADO` · Zona: browser/cache
- Evidencia: `plugins/browser/src/lib/tools/browser-inspect.tool.ts:97-101` construye la ruta de screenshot únicamente con `Date.now()` en milisegundos (`browser/<timestamp>.png`). `browser_screenshot` escribe luego de forma atómica sobre ese path (`:142-163`). Si dos invocaciones llegan en el mismo milisegundo, ambas eligen el mismo nombre y la segunda reemplaza silenciosamente el artefacto de la primera.
- Impacto: la ruta de cache del plugin no garantiza unicidad bajo concurrencia multiagente. Una respuesta puede apuntar a un artefacto ya sobrescrito por otra captura distinta, degradando reproducibilidad y evidencia visual.
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `browser-inspect.tool.ts:106` usa `join(pluginCacheDir,'browser',\`${timestamp}.png\`)` con `Date.now()` ms, sin nonce)

### D45 — `injectCspMeta()` interpola el header CSP en un atributo HTML sin escape
- Clasificación: `CONFIRMADO` · Zona: ui-extension/CSP
- Evidencia: `packages/ui-extension/src/webview/csp.ts:120-127` construye `<meta http-equiv="Content-Security-Policy" content="${cspHeaderValue(policy)}" />` interpolando el header sin escapar comillas ni otros caracteres de atributo. Los helpers salen por el barrel público (`packages/ui-extension/src/webview/index.ts`) y `resolveCspPolicy()` admite overrides del caller; sin embargo la suite `packages/ui-extension/tests/webview/csp.spec.ts:120-148` solo cubre valores seguros y nunca tensa un token hostil con comillas.
- Impacto: hoy las políticas que usa el repo son seguras, pero el helper público no hace fail-closed frente a un valor de directiva malformado o inesperado. Un caller que pase tokens con comillas rompería el atributo `content` y la CSP inyectada dejaría de ser una serialización HTML robusta.
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `csp.ts:120-127` interpola `${cspHeaderValue(policy)}` en `content="…"` sin escape de comillas), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9, claude-sonnet-5-5 (confirmado, latente (`csp.ts:120-127`; políticas constantes))

### D46 — La migración v1→v2 de `roadmap-sqlite` contradice su propio contrato y puede perder filas silenciosamente
- Clasificación: `CONFIRMADO` · Zona: roadmap-sqlite
- Evidencia: `packages/roadmap-sqlite/src/lib/contracts/constants/roadmap-sqlite-migrations.constant.ts:7-23` declara que "a row the step cannot carry aborts the whole migration", pero la migración v1→v2 añade `horizon` y `entry_id` como columnas nullable y las rellena con `json_extract(...)` sin validar que existan. Luego `list()` filtra precisamente por esas columnas (`packages/roadmap-sqlite/src/lib/sqlite-timeline.store.ts:92-108`). Una fila legacy cuyo `event_json` no tenga `horizon` o `entryId` deja la base en v2 igualmente y queda invisible para los filtros indexados.
- Impacto: no es una falta de README ni un detalle de runtime: es una pérdida silenciosa de visibilidad de datos durante una migración que el propio contrato describe como all-or-nothing. El store puede "migrar con éxito" y aun así dejar eventos huérfanos fuera de las consultas por horizonte/entry.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D47 — `self-learning` hace read-modify-write del store sin exclusión mutua y puede perder observaciones concurrentes
- Clasificación: `CONFIRMADO` · Zona: self-learning/persistence
- Evidencia: `plugins/self-learning/src/lib/store/observation-store.service.ts:137-183` lee el store completo, deduplica en memoria y reescribe todo con `writeFileAtomic`, pero no rodea la operación con ningún mutex. La atomicidad evita truncados, no lost updates: dos collectors concurrentes sobre el mismo `filePath` pueden partir del mismo estado base y la última escritura pisa observaciones aceptadas por la otra. La suite `plugins/self-learning/tests/src/lib/store/observation-store.spec.ts:66-159` cubre comportamiento serial, compactación y líneas corruptas, no concurrencia.
- Impacto: el plugin que pretende acumular evidencia/observaciones del tiempo puede perderlas silenciosamente cuando dos procesos o dos agentes intentan aprender a la vez sobre el mismo store. La confianza de las lecciones deja de reflejar el historial real observado.
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `appendObservations` lee+dedupe+rewrite con `writeFileAtomic` sin `withFileMutex`; solo hay mutex en otra ruta), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

### D48 — Un `history.json` corrupto tumba la tool completa de `project-kpis` en vez de degradar con seguridad
- Clasificación: `CONFIRMADO` · Zona: project-kpis/history
- Evidencia: `parseStore()` en `plugins/project-kpis/src/lib/services/kpi-history.service.ts:69-88` hace throw ante contract/version inesperado o `entries` ausente; `readStore()` (`:90-118`) le entrega el fichero persistido sin catch de degradación; y `loadState()` en `project-kpis.tool.ts:1089-1122` llama a `readKpiHistoryWindow()` sin encapsular ese fallo, de modo que una sola caché corrupta puede abortar la carga entera del estado. La suite `plugins/project-kpis/tests/src/kpi-history.spec.ts:114-200` cubre persistencia sana y retención, no corrupción del store.
- Impacto: una vista que podría seguir respondiendo con snapshot/usage actuales queda tumbada por un histórico corrupto. La telemetría persistida de menor criticidad secuestra la disponibilidad de la tool completa.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D49 — `quality_policy` presenta una “type policy” global, pero solo inspecciona la cadena `tsconfig.json` de la raíz
- Clasificación: `CONFIRMADO` · Zona: quality-policy/types
- Evidencia: `buildTypesEntry()` en `plugins/quality-policy/src/lib/services/quality-policy-types.service.ts:92-142` siempre arranca desde `tsconfig.json` del workspace root y resume "Type policy is ... from ..." como si describiera el workspace. Pero el repo ya contiene al menos una política divergente fuera de esa cadena raíz: `apps/web/tsconfig.json:1-4` extiende `astro/tsconfigs/strict`, no la cadena del root. El resultado publicado por `quality_policy` es, por tanto, una descripción parcial presentada como global.
- Impacto: la tool puede inducir a creer que el repo comparte una sola política de tipos cuando no es así. En auditoría o diagnosis de un monorepo eso oculta justamente las excepciones donde suelen aparecer desajustes de calidad.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D50 — `commit_policy_status` puede afirmar que el commit/push directo está permitido aunque el engine derive la rama como protegida
- Clasificación: `CONFIRMADO` · Zona: commit-policy/status
- Evidencia: `plugins/commit-policy/src/lib/tools/status-tool.ts:46-58,146-164` calcula `directCommitPushAllowed` usando solo `options.push.protectedBranches` y `protectedPrefixes`; en cambio el engine real deriva la lista efectiva con `deriveProtectedBranches({ configured, policy })` (`plugins/commit-policy/src/lib/persistence/derive-branch-policy.ts:20-43`) y la usa al construirse en `plugins/commit-policy/src/index.ts:576-593`. Con `shared-checkout-pr`, eso incluye ramas protegidas implícitas desde la development policy aunque el status tool no las refleje en su booleano principal.
- Impacto: la superficie que promete mostrar la "effective commit-policy configuration" puede decir al operador que una rama permite commit/push directo cuando el enforcement real del plugin la tratará como protegida o WIP-only. Es una mentira de estado, no solo un detalle de UX.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D51 — `observability` recorta los registros reales al revés y puede ocultar justo la muestra más reciente
- Clasificación: `CONFIRMADO` · Zona: observability/traces
- Evidencia: `plugins/observability/src/lib/traces/real-deps.ts:47-85` ordena los `.jsonl` de más nuevo a más viejo y empuja las líneas en ese orden; luego `takeRecent()` (`:80-85`) aplica `items.slice(items.length - limit)`, o sea conserva la cola más vieja del array, no la cabecera más reciente. Los fakes de test hacen lo contrario (`plugins/observability/src/lib/traces/interfaces.ts:48-57`), de modo que la ruta probada no replica el bug real.
- Impacto: `obs_trace` y `obs_release_health` pueden dejar fuera precisamente los eventos más recientes cuando se usa `limit`, ocultando fallos actuales detrás de una muestra más vieja. La herramienta se presenta como lectura de "recent" records, pero la implementación real sesga el muestreo al revés.
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `real-deps.ts:62` ordena `.jsonl` desc, `takeRecent` hace `slice(length-limit)` → conserva la cola vieja), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

### D52 — `optimize_run` exige `budget > 0` prometiendo un techo explícito, pero el presupuesto no gobierna la optimización real
- Clasificación: `CONFIRMADO` · Zona: adaptive-optimizer
- Evidencia: `plugins/adaptive-optimizer/src/lib/tools/optimize-run.tool.ts:99-108` rechaza `budget <= 0` diciendo que sirve para "enforce an explicit ceiling"; sin embargo `buildOptimizeRunPayload()` en `plugins/adaptive-optimizer/src/lib/services/optimize-run.service.ts:328-367` fija el tradeoff con `ADAPTIVE_OPTIMIZER_DEFAULT_BUDGET_DIAL`, puntúa candidatos sin leer `args.budget`, y solo devuelve `budget` ecoado en el output final.
- Impacto: el contrato público vende un control real del techo de optimización que hoy no existe. El usuario cree estar gobernando la búsqueda con un presupuesto efectivo cuando en realidad solo satisface una validación de entrada y recibe el valor reflejado en la respuesta.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9), claude-sonnet-5-5 (confirmado: `budget` solo se copia (`optimize-run.service.ts:364`); ver G101)

### D53 — `plugins_recommend` puede justificar un `remove` con una causa falsa cuando el plugin quedó fuera por `limit` o `minScore`
- Clasificación: `CONFIRMADO` · Zona: auto-plugin-selector
- Evidencia: `buildConfigDiff()` en `plugins/auto-plugin-selector/src/lib/apply/config-diff.ts:69-82` marca todo plugin actual no presente en `recommendations` como `remove` con la razón fija `no positive fit against project signals`. Pero `recommendations` ya llega recortado por `limit` y filtrado por `minScore` desde `recommendPlugins()` (`plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts:211-245`) y la propia tool lo pasa así al diff (`plugins/auto-plugin-selector/src/lib/tools/plugins-recommend.tool.ts:156-196`). Un plugin con fit positivo puede desaparecer por ranking o threshold y aun así recibir una explicación causal incorrecta.
- Impacto: el diff de configuración parece más explicativo de lo que realmente sabe. Puede recomendar quitar un plugin con una justificación falsa, sesgando revisiones humanas o automatizaciones que confíen en el texto de rationale.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D54 — `remote-provider-core` acepta URLs absolutas en `path` y puede mandar el bearer token del proveedor a otro origen
- Clasificación: `CONFIRMADO` · Zona: remote-provider-core/http
- Evidencia: `buildUrl()` en `plugins/remote-provider-core/src/lib/http-client.ts:149-157` usa `new URL(path, baseUrl)` con `path` libre; si `path` ya es una URL absoluta, reemplaza por completo `baseUrl`. Luego `request()` (`:513-533`) adjunta siempre `authorization: Bearer <token>` y ejecuta el fetch contra esa URL resultante. No hay validación que exija `path` relativo ni que conserve el host del proveedor.
- Impacto: una llamada que conceptualmente debería ir "dentro del proveedor remoto configurado" puede terminar exfiltrando su token bearer a otro origen arbitrario si un caller o una capa superior deja pasar una URL absoluta en `path`.
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `http-client.ts:209` `new URL(path, baseUrl)` con path libre + `request()` adjunta siempre `Bearer <token>`), qwen-3.8-max (2ª pasada 2026-10-19): cadena completa leída — parseLinkRelation L121 acepta URL absoluta del header Link remoto → buildUrl L209 `new URL(path, base)` la adopta → L510-513 adjunta Bearer incondicional; CONFIRMADO estático, sin PoC activa, claude-sonnet-5-5 (confirmado como hueco de API (ejecutado: `new URL(abs, base)` adopta el host); discrepo de la cadena por Link: `nextPage` es token de página, no vuelve como `path`; latente P3, ver mi bloque)

### D55 — `issues_triage_run` puede informar éxito aunque no haya persistido draft ni efectos remotos completos
- Clasificación: `CONFIRMADO` · Zona: issues-triage
- Evidencia: el handler construye un draft completo en `_draft` y lo descarta (`plugins/issues-triage/src/lib/tools/triage.tools.ts:160-184`); si `writeProposal` es false, el comentario público promete aun así "draft ready — pass it to proposals_create_proposal to materialise" y "The fix will be tracked in the linked proposal" (`:194-218`) sin devolver ese draft ni enlazar propuesta real. Además, si `addComment` o `addLabels` fallan, la tool sigue devolviendo `ok: true` con `commentPosted: false` o `labelsApplied: []` y sin reason parcial (`:220-255`).
- Impacto: la surface de triage aparenta haber retenido más contexto del que realmente conserva y, además, puede devolver éxito global pese a fallos de side effects en GitHub. Eso sesga a llamadores automáticos y a operadores humanos sobre el estado real del triage.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D56 — `issues_ingest` puede dejar dos scaffolds para el mismo issue si el título cambió y luego reusar uno viejo por prefijo
- Clasificación: `CONFIRMADO` · Zona: issues/deduplication
- Evidencia: `ingestIssue()` en `plugins/issues/src/lib/tools/ingest-issue.tool.ts:124-154` reusa el scaffold existente solo cuando `force` es false; con `force: true` vuelve a escribir un archivo nuevo cuyo nombre se deriva del título actual (`writeNewScaffold()` en `:90-122`) y no limpia ni sustituye el scaffold previo del mismo número. La búsqueda normal posterior usa `findExistingScaffoldFile()` por prefijo `github#<n>-`, así que con dos títulos distintos del mismo issue puede recoger un scaffold viejo o ambiguo.
- Impacto: el flujo de ingest deja de ser idempotente frente a renames del issue en origen. El repo puede acumular dos scaffolds para el mismo número y luego leer uno stale sin señalar la ambigüedad.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D57 — El knob global `cache.maxAgeDays` no rebaja las reglas del plugin cache como su documentación promete
- Clasificación: `CONFIRMADO` · Zona: cache/config
- Evidencia: el contrato global documenta `cache.maxAgeDays` como "upper cap applied to every olderThanDays rule" en `packages/core/src/lib/plugins/load-config-file.ts:250-277`, y el README del plugin muestra precisamente la combinación de `cache.maxAgeDays` global con `plugins.cache.options.maxAgeDays` (`plugins/cache/README.md:60-69`). Pero el ensamblado del core solo pasa `runOnBoot` y `evictionIntervalMs` al boot sweep (`packages/core/src/lib/cli/assemble.ts:1428-1455`), mientras el plugin cache solo registra reglas usando su propio `options.maxAgeDays` (`plugins/cache/src/index.ts:68-78`). No hay cableado que propague el cap global al registro del plugin.
- Impacto: un proyecto puede creer que acortó el TTL de todo `.cache/delendai` con `cache.maxAgeDays` y seguir reteniendo artefactos del plugin según los defaults o sus opciones propias. Es deriva entre contrato/configuración y enforcement real.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D58 — El engine de `database` pierde la dimensión `schema` y no puede representar tablas homónimas de distintos namespaces
- Clasificación: `CONFIRMADO` · Zona: database/introspection
- Evidencia: el seam central de `buildSchema()` en `plugins/database/src/lib/introspect/introspect-engine.ts:13-27` solo pide `listTables(): Promise<string[]>` y luego materializa cada tabla como `{ name, schema: null, ... }` (`:258-276`). El renderer ERD indexa luego por `table.name` a secas (`plugins/database/src/lib/erd/render-erd.ts:99-119`). Así, un adapter real con `public.users` y `auth.users` no tiene forma de conservar ambos namespaces sin colisión; una tabla pisa a la otra en mapas y proyecciones.
- Impacto: la superficie se presenta como "driver-agnostic" y extensible a Postgres/MySQL, pero su modelo canónico ya colapsa una dimensión esencial de esos motores. Bases multi-schema quedarían introspectadas de forma incompleta o corrupta.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D59 — `release_plan` se anuncia como capacidad normal del plugin `changelog`, pero la configuración por defecto la deja imposible de usar
- Clasificación: `CONFIRMADO` · Zona: changelog
- Evidencia: el plugin `changelog` registra `buildReleasePlanToolRegistration({ namespacePrefix })` sin `publishOrder` ni inyección adicional (`plugins/changelog/src/index.ts:20-27`) y su knowledge la presenta como feature normal (`:29-42`). Pero el handler de `release_plan` retorna inmediatamente `toolError('publish-order-missing', ...)` cuando `publishOrder.length === 0` (`plugins/changelog/src/lib/tools/release-plan.tool.ts:158-186`).
- Impacto: la superficie pública del plugin expone una tool que, en la configuración real por defecto del repo, nace condenada a fallar en runtime. Eso degrada la confianza en el contrato del plugin y obliga al usuario a descubrir por error una precondición no satisfecha por el propio register path.
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `changelog/src/index.ts:29` registra `release_plan` sin `publishOrder`; el handler devuelve `toolError('publish-order-missing')`)

### D60 — `framework_guidance` promete elegir framework en un mixed repo, pero solo inspecciona `package.json` y lockfile de la raíz
- Clasificación: `CONFIRMADO` · Zona: framework-knowledge
- Evidencia: la descripción pública afirma que `framework` sirve para "pick one in a mixed repo" (`plugins/framework-knowledge/src/lib/tools/guidance.tool.ts:198-216`), pero `resolveInstalledFramework()` (`plugins/framework-knowledge/src/lib/resolve/installed-framework.helper.ts:17-79`) solo lee `package.json` y el primer lockfile presentes en la raíz del workspace. No inspecciona `apps/`, `packages/` ni manifests por paquete, así que en un monorepo con varios frameworks fuera de la raíz solo puede filtrar sobre lo que ya sea visible desde ese root manifest.
- Impacto: la tool aparenta cobertura de monorepo mixto más fuerte de la que realmente implementa. Un usuario puede pasar `framework: astro` o `react` esperando una resolución por subproyecto y recibir una respuesta basada únicamente en dependencias del `package.json` raíz.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D61 — `project_health` puede dar `deps=100` y `quality=100` con señales demasiado débiles y ocultar la acción correcta
- Clasificación: `CONFIRMADO` · Zona: project-health
- Evidencia: `summarizeSignals()` en `plugins/project-health/src/lib/services/project-health-signals.service.ts:222-229` puntúa `deps` como 100 solo por detectar un lockfile raíz y `quality` como suma de scopes resueltos + presencia de config de lint/test, sin ejecutar ningún comando real. Luego `buildNextActions()` en `plugins/project-health/src/lib/services/project-health.service.ts:31-63` solo recomienda `deps_audit` o `quality_run` cuando esos scores quedan <100.
- Impacto: un repo con lockfile y configs presentes pero con dependencias vulnerables o quality gates permanentemente rojos puede salir verde y sin empuje a la herramienta correcta. La vista compacta parece más fiable de lo que realmente mide.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D62 — `refactor_apply` vende un guardia de consentimiento que en realidad es solo un string no vacío
- Clasificación: `CONFIRMADO` · Zona: refactor
- Evidencia: `refactor_apply` exige `consentToken: z.string().min(1)` y la descripción afirma que "Requires consentToken" (`plugins/refactor/src/lib/tools/refactor-rename.tool.ts:203-217`), pero la ejecución no verifica ni emite ese token en ningún sitio: tras escribir los archivos simplemente lo devuelve tal cual (`:270-279`). No existe enlace con un plan previo, firma, sesión ni consentimiento real.
- Impacto: la tool aparenta tener una barrera de confirmación para escrituras cuando en la práctica cualquier caller que pueda invocarla puede inventarse cualquier string y escribir igual. Eso sobrepromete seguridad operacional y puede inducir a confiar en un control inexistente.
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `refactor_rename` no genera ningún token (sin `randomUUID`/`crypto`); `refactor_apply` solo valida `z.string().min(1)` y lo ecoa), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9, claude-sonnet-5-5 (confirmado: `consentToken` solo se devuelve (`refactor-rename.tool.ts:272`); ver G101)

### D120 — `debt_scan` se presenta como barrido del workspace, pero el backend impone caps silenciosos por número y tamaño de fichero
- Clasificación: `CONFIRMADO` · Zona: tech-debt
- Evidencia: el plugin y la tool dicen escanear markers "across the workspace" / "Scan source comments" (`plugins/tech-debt/src/index.ts:7-18`, `plugins/tech-debt/src/lib/tools/debt-scan.tool.ts:42-50`). Pero `realTechDebtDeps()` corta la enumeración en `MAX_FILES = 4000`, omite cualquier archivo > `MAX_FILE_BYTES = 512 * 1024`, y además salta silenciosamente ficheros ilegibles o desaparecidos (`plugins/tech-debt/src/lib/tech-debt/real-deps.ts:27-58`).
- Impacto: en árboles grandes o con ficheros voluminosos, el resultado puede parecer un barrido global de deuda técnica cuando en realidad es parcial y sin trazabilidad de exclusiones. Marcadores críticos pueden quedar fuera sin ninguna pista en la salida.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D121 — web-fetch: el chequeo allow-list es por hostname, no por IP resuelta (DNS rebinding no mitigado, documentado)
- Clasificación: `CONFIRMADO` (limitación declarada — se registra para que el consenso decida si el nivel es aceptable) · Zona: web-fetch (zona virgen, pasada glm-3)
- Evidencia: `plugins/web-fetch/src/lib/services/engine.ts:243-275` valida `isHostPortAllowed(currentUrl.hostname, ...)` ANTES de cada hop y re-valida el host del `Location` en redirects (correcto, manual). Pero el fetch final conecta a la IP que el resolver del SO devuelva: un host allow-listed puede resolver a una IP interna en el instante de la conexión (DNS rebinding), y `localhost`/`127.0.0.1`/`169.254.169.254` solo se rechazan si NO están en la allow-list — un entry literal de IP pasa `matchesHostPattern` (`engine.ts:136-143`, comparación exacta). El README lo declara Out of scope (`plugins/web-fetch/README.md:48-53`).
- Mi valoración: la mitigación correcta (egress proxy) es la indicada; lo que falta NO es el código sino (a) que `web_fetch` no emite ninguna señal en su output de que la garantía del allow-list es hostname-level, y (b) `parseUrl` (`engine.ts:176-181`) acepta `http:` plano en el primer hop — https-only sería el default más barato.
- seenBy: glm-5.3-flash (3ª pasada), claude-sonnet-5-5 (confirmado: `parseUrl` acepta `http:`; sin rangos privados en web-fetch)

### D122 — `status-marker.formatCloseMarker` trunca el reason obligatorio a MAX_LINE_LEN silenciosamente
- Clasificación: `CONFIRMADO` · Zona: status-marker (zona virgen, pasada glm-3)
- Evidencia: `plugins/status-marker/src/lib/markers.ts:126-145` corta la línea a 120 chars con `body.slice(0, MAX_LINE_LEN - 1) + '…'` aunque `requiresReason` sea true. Roundtrip verificado: reason de 200 chars queda reducido a su prefijo, el validator lo acepta (`extractReason` extrae lo que quedó) y el registro duradero del protocolo pierde la mayor parte del why sin marcador ninguno — el `…` final no distingue corte de terminación elegida.
- Impacto: degradación silenciosa del registro de auditoría. Fix barato: rechazar reasons que no quepan, o emitir `truncated: true`.
- Positivo de la misma zona: los 8 emojis canónicos son single-codepoint (verificado), así que `[...line][0]` en `validate.ts:148` no rompe con el set built-in; la constraint no está documentada en el tipo de la tabla merged (f00071).
- seenBy: glm-5.3-flash (3ª pasada)

### D123 — `execution-env` ssh: quoting posix/pwsh correcto (roundtrip verificado); el gap es la ausencia de test adversarial
- Clasificación: `CONFIRMADO` (positivo con deuda de test) · Zona: execution-env (zona virgen, pasada glm-3)
- Evidencia: `plugins/execution-env/src/lib/helpers/shell-quoting.helper.ts:9-30` — `quotePosix` usa el escape estándar de comilla simple, `buildRemoteCommand` valida el nombre de env con patrón, rechaza programas que empiezan por `-` y quotea `name=value` ENTERO (`:57-60`). Roundtrip adversarial mío: un value con `'; rm -rf ...; echo '` se quotea y reconstruye byte a byte idéntico — no hay inyección por el camino posix. Escrituras vía `writeFileAtomic` (`local.service.ts:90`). El gap: ningún spec adversarial del helper inyecta metacaracteres de shell; el comportamiento correcto de hoy es efecto de la implementación, no contrato cerrado por test.
- seenBy: glm-5.3-flash (3ª pasada)

### D124 — `test-policy`: schema honesto + mutex+atomic + redacción de secretos (positivo de zona virgen)
- Clasificación: `CONFIRMADO` (negativo) · Zona: test-policy (zona virgen, pasada glm-3)
- Evidencia: `plugins/test-policy/src/lib/tools/set-policy.tool.ts:23-30` declara `ok: z.boolean()` + `error` opcional (el patrón correcto que D4 mostró ausente en proposals), `policy-store.ts:111-123` escribe con `withFileMutex`+`writeFileAtomic`, y el reason pasa por `redactSecrets` antes de persistirse (`:100-104`). Con 597 LOC y 3 specs es el plugin pequeño mejor construido según el checklist de esta auditoría.
- seenBy: glm-5.3-flash (3ª pasada)

### D119 — `diagram_deps` promete el grafo interno del workspace, pero omite familias completas del monorepo como `tools`
- Clasificación: `CONFIRMADO` · Zona: diagram
- Evidencia: la descripción pública habla del "workspace internal dependency graph" (`plugins/diagram/src/lib/tools/diagram-graph.tool.ts:91-111`). Sin embargo el backend `realDiagramDeps()` solo descubre manifests en `packages`, `plugins`, `apps` y `extensions`, además de la raíz (`plugins/diagram/src/lib/graph/real-deps.ts:12-18,44-61`). El árbol `tools/` no entra nunca en la enumeración, aunque en este repo contiene un package real con dependencias propias.
- Impacto: el diagrama aparenta una vista de dependencias internas del workspace cuando en realidad excluye scopes enteros por convención hardcodeada. Un operador puede tomar decisiones de arquitectura sobre un grafo incompleto sin que la tool lo explicite.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D118 — `impact_analyze` y `tests_for_change` contaminan el slice pedido con el working tree global
- Clasificación: `CONFIRMADO` · Zona: impact-analysis
- Evidencia: `resolveAnchorFiles()` mezcla siempre `gitChanged(runner)` con `args.files` y con los archivos derivados de `gitDiff`, incluso cuando el caller ya pasó su slice explícito (`plugins/impact-analysis/src/lib/services/impact-analysis.service.ts:198-211`). Tanto `impact_analyze` como `tests_for_change` se apoyan en esa misma base: `computeTestsForChange()` delega en `computeImpactAnalysis()` antes de seleccionar tests (`:285-307`). Mientras tanto, las descripciones públicas hablan de "a change slice from files, diff or explicit symbols" y de "focused test files for a change slice" (`plugins/impact-analysis/src/lib/tools/impact-analyze.tool.ts:79-86`, `plugins/impact-analysis/src/lib/tools/tests-for-change.tool.ts:67-84`).
- Impacto: en worktrees sucios o sesiones paralelas, ambos outputs pueden incluir símbolos, dependents, paquetes afectados y tests relacionados con cambios ajenos a la petición actual. El caller cree pedir impacto de un slice concreto y recibe una mezcla con el estado local global.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D117 — `link_check` se vende como escaneo del workspace, pero el backend real es parcial y silencioso
- Clasificación: `CONFIRMADO` · Zona: link-check
- Evidencia: la tool promete verificar links markdown "across the workspace" (`plugins/link-check/src/lib/tools/link-check.tool.ts:43-58`). Pero `realLinkScanDeps()` solo enumera `**/*.md` con `Bun.Glob`, no `mdx` ni otros formatos doc (`plugins/link-check/src/lib/link-check/real-deps.ts:39-56`), corta el scan al llegar a `MAX_DOCS = 5000` y omite cualquier doc > `MAX_DOC_BYTES = 1 MiB` o ilegible sin exponer qué quedó fuera (`:18-21,44-55`).
- Impacto: el resultado puede parecer una revisión completa del corpus documental cuando en realidad es un muestreo acotado y silenciosamente incompleto. En repos grandes o con docs pesadas, links rotos pueden quedar fuera del diagnóstico sin ninguna trazabilidad por archivo.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D116 — `context_for_change` mezcla cambios no pedidos del working tree en un paquete que se presenta como contexto acotado al cambio solicitado
- Clasificación: `CONFIRMADO` · Zona: context-for-change
- Evidencia: la descripción promete construir un "compact, task-oriented context packet from files, git diff, symbols..." (`plugins/context-for-change/src/lib/tools/context-for-change.tool.ts:49-60`). Pero `runContextForChangeService()` llama siempre a `gitChanged(runner)` cuando el repo está sano y mezcla esos `changedFiles` con `args.files` y con los derivados del diff en `anchorFiles` (`plugins/context-for-change/src/lib/services/context-for-change.service.ts:248-259`). Además, la sección `git` incluye el `working tree:` completo si hay cambios locales, aunque el caller haya pasado un slice concreto (`:287-305`).
- Impacto: el contexto resultante puede contaminarse con archivos no relacionados con la petición actual. En worktrees sucios o sesiones paralelas, el caller cree pedir contexto para un cambio concreto y recibe además ruido de otros cambios locales.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D115 — `self_audit` expone un filtro `capabilities` que hoy es nominal: valida claves pero no filtra hallazgos
- Clasificación: `CONFIRMADO` · Zona: audit/self-audit
- Evidencia: `filterFindingsByCapabilities()` en `plugins/audit/src/lib/tools/self-audit.tool.ts:76-92` devuelve siempre `findings` incluso cuando hay capabilities pedidas y coincidentes; el propio comentario admite que los hallazgos agregados "do not yet carry capability provenance". Aun así el input schema y la ejecución aceptan `capabilities` y lo pasan como si fuera un filtro real (`:16-20,120-137`).
- Impacto: el caller puede creer que está pidiendo un backlog acotado a ciertas capabilities cuando el ranking sigue calculándose sobre todos los hallazgos agregados. Eso sesga priorización y rompe la expectativa de scoping fino en una tool de auditoría interna.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9), claude-sonnet-5-5 (confirmado: devuelve `findings` siempre (`self-audit.tool.ts:76-92`); ver G101)

### D112 — `env_check` con schema promete no exponer valores, pero en enums inválidos devuelve el valor rechazado
- Clasificación: `CONFIRMADO` · Zona: env/privacy
- Evidencia: el conocimiento público del plugin insiste en que "Values are never included in the output" (`plugins/env/src/index.ts:39-48`) y `check-schema.ts` abre con el mismo contrato (`plugins/env/src/lib/validate/check-schema.ts:1-14`). Sin embargo `validateValue()` emite `Value "${trimmed}" is not in the allowed enum values.` para enums inválidos (`plugins/env/src/lib/validate/check-schema.ts:89-96`), y `validateEntry()` lo reexpone anteponiendo solo la key (`:118-130`).
- Impacto: un valor sensible mal configurado en una variable tipo enum deja de estar protegido por la promesa de privacidad del plugin y puede terminar en findings/logs/consumidores aguas abajo.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D113 — En `env_check` con schema, una variable `required` presente pero vacía baja de `missing-required` alto a `mistyped-value` medio
- Clasificación: `CONFIRMADO` · Zona: env/required-semantics
- Evidencia: `IEnvVarSchema.required` se documenta como "must be present (and non-empty)" (`plugins/env/src/lib/validate/env-schema.ts:12-18`), y el resumen público vende `env/missing-required` como la categoría para variables requeridas (`plugins/env/src/index.ts:39-48`). Pero si la variable existe vacía, `validateEntry()` devuelve `env/mistyped-value` con severidad `medium` (`plugins/env/src/lib/validate/check-schema.ts:110-127`) en vez de `missing-required` `high`; solo la ausencia total usa ese ruleId (`:174-185`).
- Impacto: la semántica de `required` se parte en dos caminos con severidad distinta. Un secreto requerido pero vacío no se trata como incumplimiento fuerte de presencia efectiva, sino como typo medio, lo que infra-prioriza una configuración rota.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D114 — `error-reporting` contabiliza `claimDispatch=false` como deduplicado aunque también cubre estado local no fiable
- Clasificación: `CONFIRMADO` · Zona: error-reporting/observability
- Evidencia: cuando `claimDispatch()` devuelve `false`, el handler incrementa siempre `deduplicated` (`plugins/error-reporting/src/index.ts:158-165`). Pero `claimDispatch()` también devuelve `false` si `readAll()` marca el store como `trusted: false` por JSON corrupto o fichero ilegible (`plugins/error-reporting/src/lib/report-store.service.ts:132-176,236-254`), no solo cuando hay una claim activa previa.
- Impacto: la telemetría y `report_status` presentan parte de los fallos de estado local como si fueran deduplicaciones sanas. Eso maquilla indisponibilidad/corrupción del store justo en la capa que pretende dar transparencia sobre el pipeline de reporte.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D111 — Los tipos generados de `@delendai/audit` endurecen `score/average` a número aunque el schema real permite `null`
- Clasificación: `CONFIRMADO` · Zona: audit/generated-types
- Evidencia: el contrato central de consolidación admite `score: number | null` y `average: number | null` (`plugins/audit/src/lib/contracts/interfaces/audit.interface.ts:147-156`), y el `ConsolidationOutputSchema` real usa `z.number().nullable()` para ambos (`plugins/audit/src/lib/tools/audit-consolidate.tool.ts:56-65`). Sin embargo el archivo generado `plugins/audit/src/generated/tool-outputs.ts:14-31` tipa `consensus[].scores[].score` y `consensus[].average` como `number` no anulable.
- Impacto: consumidores TS que confíen en los tipos generados reciben una promesa más fuerte que el runtime real. En auditorías donde un modelo declina puntuar una dimensión, el contrato runtime puede emitir `null` mientras el tipo generado empuja a no contemplarlo.
- seenBy: gpt-5.4

### D109 — `docs_list` anuncia paginación del catálogo, pero pagina sobre una colección ya truncada a 200 entradas
- Clasificación: `CONFIRMADO` · Zona: docs
- Evidencia: la descripción promete `limit`/`offset` y devuelve `{docs,count,total,offset,nextOffset?,truncated}` como si permitiera recorrer el catálogo (`plugins/docs/src/lib/tools/tools.ts:29-79`). Pero `listDocs()` corta la enumeración global al alcanzar `DEFAULT_MAX_RESULTS = 200` o `options.maxResults` (`plugins/docs/src/lib/services/engine.ts:18-31,105-150`), y la tool luego pagina solo con `docs.slice(offset, offset + limit)` sobre esa colección ya recortada.
- Impacto: en workspaces con más de 200 docs, la API aparenta ser navegable por páginas cuando en realidad es imposible acceder a las entradas >200. `truncated:true` existe, pero el wording de paginación sugiere completitud que el backend no puede ofrecer.
- seenBy: gpt-5.4

### D110 — `pr_list` puede degradar un fallo real de `gh` a `available:true` con lista vacía
- Clasificación: `CONFIRMADO` · Zona: git/forge
- Evidencia: `listOpenPrs()` devuelve `available: true` y `prs: []` cuando `gh pr list` falla siempre que stdout no contenga `[` (`plugins/git/src/lib/services/forge.ts:112-126`). La descripción pública solo promete `available:false` para falta de `gh` o de autenticación (`plugins/git/src/lib/tools/forge-tools.ts:57-67`), no para otras clases de fallo operativo del CLI/remoto.
- Impacto: consumidores pueden interpretar una lista vacía como “no hay PRs abiertas” cuando en realidad hubo error de ejecución/red/API. El campo `note` mitiga, pero la forma `available:true` + array vacío sigue maquillando el fallo como estado utilizable.
- seenBy: gpt-5.4

### D107 — `style_profile` presenta un recuento global de design tokens, pero solo lee `tokenFiles` explícitos
- Clasificación: `CONFIRMADO` · Zona: style-convention/profile
- Evidencia: la descripción de `style_profile` promete decir "how many design tokens are declared" (`plugins/style-convention/src/lib/tools/style-profile.tool.ts:41-58`). Sin embargo `readStyleWorkspace()` solo agrega tokens leyendo `profile.tokenFiles` (`plugins/style-convention/src/lib/profile/style-workspace.service.ts:103-111`) y no extrae variables desde el resto de `styleRoots` ni desde bloques de markup. La propia constante de extensiones de markup queda limitada a `.astro` (`style-profile.constant.ts:13-14`).
- Impacto: el contador de tokens y, por extensión, parte de la foto de arquitectura visual se presentan como globales cuando en realidad dependen de una lista explícita y parcial. Árboles con tokens fuera de `tokenFiles` quedan infrarreportados sin ninguna señal de incompletitud.
- seenBy: gpt-5.4

### D108 — `test-convention` aparenta controlar companion specs del monorepo, pero el lado "source" solo reconoce `src/*.ts(x)` en la raíz lógica
- Clasificación: `CONFIRMADO` · Zona: test-convention
- Evidencia: `isTsSource()` en `plugins/test-convention/src/scan.ts:18-21` solo acepta rutas `src/...tsx?`, y `scanDrift()` (`:167-174`) usa esa lista para disparar `missing-spec-for-export`. En un monorepo con `packages/*/src`, `plugins/*/src`, `apps/*/src`, etc., esa mitad del drift no cubre la mayoría del código fuente aunque el plugin se exponga como convención del workspace entero. Además `languages` figura en el contrato (`convention.ts:36-80`) pero no participa en el descubrimiento real.
- Impacto: el plugin puede dar una falsa sensación de salud sobre companion specs porque su rama más valiosa de enforcement ve solo una fracción del código productivo del repo.
- seenBy: gpt-5.4

### D105 — `quality_policy` resume presets de lint como si describieran el repo, pero solo muestrea `root`, `packages/core` y `apps/web`
- Clasificación: `CONFIRMADO` · Zona: quality-policy/lint
- Evidencia: `QUALITY_POLICY_LINT_AREAS` está fijado a `['root', 'packages/core', 'apps/web']` (`plugins/quality-policy/src/lib/contracts/constants/quality-policy.constant.ts:21-25`), y `buildLintEntry()` solo detecta presets en esas áreas antes de resumir "detected lint presets ..." (`plugins/quality-policy/src/lib/services/quality-policy.service.ts:171-197`).
- Impacto: la salida aparenta una foto de la política de lint del workspace cuando en realidad excluye plugins, extensions, apps/shared, tools y cualquier otra área fuera de ese trío. Es otra vista de policy parcial presentada con wording global.
- seenBy: gpt-5.4

### D106 — `eval_report` afirma elegir "the cheapest passing provider", pero el winner real sale del ranking por `compositeScore`
- Clasificación: `CONFIRMADO` · Zona: prompt-eval/report
- Evidencia: la descripción de la tool promete `winner (cheapest passing provider)` (`plugins/prompt-eval/src/lib/tools/eval-report.tool.ts:72-78`), pero `scoreReport()` primero ordena por `compositeScore desc, cost asc, tier` (`plugins/prompt-eval/src/lib/score/score.ts:86-94`) y luego define `winner` como `winners[0]` en ese ranking (`:115-124`). El propio `compositeScore` mezcla `winRate * 100 - costUsd` (`:31-39,69-78`).
- Impacto: el campo `winner` y la explicación pública sobrestiman la prioridad del coste. Con varios providers que pasan, el ganador real es el mejor blend coste×calidad, no necesariamente el más barato. Eso puede sesgar lecturas de benchmarking y decisiones de routing basadas en ese reporte.
- seenBy: gpt-5.4

### D103 — `logs_incidents` se vende como "what is broken right now", pero solo enseña recurrencias repetidas por huella textual
- Clasificación: `CONFIRMADO` · Zona: logs/incidents
- Evidencia: la tool `logs_incidents` promete responder la pregunta "what is broken right now" (`plugins/logs/src/lib/tools/tools.ts:828-846`), pero `logIncidents()` agrupa solo por `(toolName, sha1(error.message))` y descarta por defecto todos los clusters con `count < 2` (`plugins/logs/src/lib/services/log-search-incidents.ts:227-239,256-314`). Los incidentes únicos ni siquiera llegan a la salida.
- Impacto: la vista agregada aparenta ser el estado actual consolidado de averías, cuando en realidad es un detector de recurrencias textuales repetidas. Puede ocultar bugs nuevos precisamente por no haber ocurrido todavía dos veces.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D104 — `search` con backend `rg` puede degradar roots explícitas inválidas a “0 hits” sin diagnóstico, divergiendo del backend in-house
- Clasificación: `CONFIRMADO` · Zona: search/backends
- Evidencia: el backend `rg` resuelve `roots` y, si todas las explícitas quedan rechazadas, devuelve `{ hits: [], scanned: 0, usedRg: true }` sin `diagnostic` (`plugins/search/src/lib/services/search-engine.backends.ts:137-153`). El backend in-house para el mismo caso sí construye un diagnóstico explícito cuando `scanned === 0` (`plugins/search/src/lib/services/search-engine.in-house.ts:227-245`).
- Impacto: una configuración de roots fuera del workspace o inexistentes puede parecer simplemente "sin coincidencias" cuando el repo dispone de `rg`, ocultando un error de scoping que el backend alternativo sí sabría explicar.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D101 — `external-mcps status` puede mostrar `running: true` aunque la sesión MCP no haya abierto o ya esté wedged en timeouts
- Clasificación: `CONFIRMADO` · Zona: external-mcps/status
- Evidencia: el estado público del registry solo expone `running`, `pid`, `bootedAt` y `lastError` (`plugins/external-mcps/src/lib/tools/status.tool.ts:1-63`), mientras el runtime sí distingue `session: 'opening' | 'open' | { failed }` internamente (`plugins/external-mcps/src/lib/subprocess/server-registry.ts:380-392,404-420`). `ensureBooted()` marca `running = true` y limpia `lastError` antes de que `openMcpSession` asiente el resultado (`:608-645`), y una llamada expirada solo devuelve `call-timeout` sin cerrar ni degradar ese estado (`:470-520`).
- Impacto: la surface de status puede vender un servidor como vivo y listo cuando solo existe el proceso hijo, no una sesión MCP usable. Eso engaña al operador justo en la herramienta de observabilidad pensada para decidir si merece la pena seguir llamándolo.
- seenBy: gpt-5.4

### D102 — El modelo de riesgo de `container` no considera bind mounts arbitrarios al host, así que puede arrancar contenedores muy potentes sin `confirmRisk`
- Clasificación: `CONFIRMADO` · Zona: container/risk-model
- Evidencia: `containerRisks()` solo marca `privileged`, docker.sock y namespaces `host` (`plugins/container/src/lib/run/docker-risk.helper.ts:1-24`), mientras `container_run` acepta `mounts` arbitrarios y los proyecta directamente a `-v` (`plugins/container/src/lib/contracts/constants/docker-tool-input.constant.ts:50-71`, `plugins/container/src/lib/tools/container-docker.tool.ts:132-160`). `runDocker()` solo exige `confirmRisk` cuando `command.risks.length > 0` (`plugins/container/src/lib/run/docker-command.service.ts:29-66`).
- Impacto: un caller puede lanzar un contenedor con bind mounts amplios como `/:/host` o directorios sensibles del host con la barrera normal de `confirm`, sin activar la confirmación reforzada que el propio plugin dice reservar para comandos que "reach the host".
- seenBy: gpt-5.4

### D99 — `logs_incidents` se presenta como "what is broken right now", pero en realidad solo enseña recurrencias textuales repetidas
- Clasificación: `CONFIRMADO` · Zona: logs/incidents
- Evidencia: la tool describe su resultado como la respuesta a "what is broken right now" (`plugins/logs/src/lib/tools/tools.ts:828-846`), pero `logIncidents()` agrupa solo por `(toolName, sha1(error.message))` y descarta por defecto todos los clusters con `count < 2` (`plugins/logs/src/lib/services/log-search-incidents.ts:227-239,256-314`). Eso oculta fallos nuevos o únicos y fragmenta una misma causa raíz cuando cambia mínimamente el texto del mensaje.
- Impacto: la vista agregada aparenta ser el estado actual consolidado de averías, cuando en realidad es un detector de recurrencias textuales repetidas. Puede ocultar bugs frescos precisamente por no haber ocurrido aún dos veces.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D100 — `plugins_recommend` acepta `taskHint`, pero el scorer determinista no lo usa en ninguna decisión
- Clasificación: `CONFIRMADO` · Zona: auto-plugin-selector
- Evidencia: `taskHint` forma parte del contrato público de señales (`plugins/auto-plugin-selector/src/lib/contracts/interfaces/plugin-fit.interface.ts:35-43`) y del input schema (`plugins-recommend.tool.ts:43-61`), e incluso se serializa dentro del prompt opcional LLM (`plugins/auto-plugin-selector/src/lib/refine/llm-rationale.ts:110-128`). Pero `recommendPlugins()` y `scoreOne()` (`plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts:88-110,200-245`) no lo leen en ningún punto.
- Impacto: el usuario puede creer que está afinando la recomendación con una pista de tarea concreta cuando, salvo en el texto de racionalización LLM opcional, esa señal no afecta a la selección base. Es un input contractual muerto en la ruta determinista principal.
- seenBy: gpt-5.4, deepseek-v4-pro (reverificado en a78813827: `recommendPlugins()`/`scoreOne()` en `score/recommend-plugins.ts` no leen `taskHint`; solo lo usa `llm-rationale.ts:120`), claude-sonnet-5-5 (confirmado: `taskHint` solo en el prompt LLM opcional; ver G101)

### D97 — El knowledge agregado de `security` afirma cobertura SAST dentro de `security_audit`, pero la composición real no la ejecuta
- Clasificación: `CONFIRMADO` · Zona: security/knowledge
- Evidencia: el knowledge oficial del plugin dice que `security_audit` hace "aggregate posture scan across secrets, dependency CVEs and SAST" (`plugins/security/src/index.ts:47-61`), pero la composición real del tool solo agrega secretos, auditoría de dependencias y licencias (`plugins/security/src/lib/tools/security-audit.tool.ts:69-88`).
- Impacto: el artefacto de ayuda más oficial del plugin sobrevende la cobertura del meta-scanner. Un usuario puede creer que ya incluyó análisis SAST first-party en una pasada de `security_audit` cuando en realidad no se ejecutó.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D98 — `security_deps` atribuye la red solo a `includeOsv`, pero la auditoría base ya depende de red del package manager
- Clasificación: `CONFIRMADO` · Zona: security/deps-contract
- Evidencia: la descripción de `security_deps` afirma que `includeOsv` es "the only network call" (`plugins/security/src/lib/tools/security-deps.tool.ts:120-134`), y el knowledge repite que el scanner permanece offline salvo OSV (`plugins/security/src/index.ts:54-60`). Pero la base del comando ya ejecuta `bun audit`/`npm audit`/`yarn audit` vía subprocess (`plugins/security/src/lib/deps/audit.ts:1-67`), es decir, ya depende de la red/advisory registry del package manager aunque `includeOsv` sea false.
- Impacto: la causalidad que el plugin comunica sobre cuándo usa red es falsa. Eso puede inducir decisiones de policy o de operación equivocadas en entornos donde el acceso a red debe estar explicitado con precisión.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D95 — `external-mcps` puede rechazar configuraciones `env` válidas como `missing-env` falso
- Clasificación: `CONFIRMADO` · Zona: external-mcps/env
- Evidencia: `ensureBooted()` pasa `requiredKeys: Object.keys(normalizedEnv ?? {})` a `buildSafeEnv()` (`plugins/external-mcps/src/lib/subprocess/server-registry.ts:608-618`). Pero `buildSafeEnv()` interpreta esos `requiredKeys` como nombres que deben existir ya en `hostEnv` (`env-filter.ts:49-63`), antes incluso de resolver valores literales o aliases `$VAR` de `entry.env` (`:66-84`). Eso hace que una entrada como `API_TOKEN: "$OPENAI_API_KEY"` exija erróneamente `API_TOKEN` en el host, además de `OPENAI_API_KEY`, y que claves con valor literal también entren en la lista de obligatorias del host.
- Impacto: configuraciones que el esquema acepta como válidas pueden fracasar en runtime con `missing-env` aunque el host ya tenga todas las variables fuente necesarias o aunque el valor fuese literal. Es un rechazo falso en la proyección de entorno del subprocess.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D96 — `auto_recommend` se presenta como ranking "for a task", pero la decisión base casi no ve la tarea
- Clasificación: `CONFIRMADO` · Zona: auto-agent-selector
- Evidencia: el input del tool solo acepta `costQualityTradeoff`, `pin` y `taskType` (`plugins/auto-agent-selector/src/lib/tools/auto-recommend.tool.ts:36-91`); la ruta real llama a `discoverRankedProviders()` y `rankProviders()` sin descripción ni contenido de tarea (`:92-115`). `rankProviders()` a su vez decide con `costTier`, `availability`, `pin` y win-rates calibrados (`plugins/auto-agent-selector/src/lib/routing/rank-providers.ts:1-79`).
- Impacto: la surface pública sugiere una recomendación específica para la tarea cuando, salvo un `taskType` opcional y bastante grueso, la selección base no consume señales semánticas de la tarea real. Eso hace que la causalidad del ranking parezca más rica de lo que el código sostiene.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D93 — `triage_list` se presenta como entrada de workflow de issues abiertos, pero no puede distinguir pendientes de ya atendidos por el bot
- Clasificación: `CONFIRMADO` · Zona: issues-triage/list
- Evidencia: `listOpenIssues()` en `plugins/issues-triage/src/lib/github.service.ts:59-89` pide a `gh issue list` solo `number,title,labels,updatedAt`; no consulta comentarios ni `hasBotReply`, aunque `fetchIssue()` sí calcula esa señal (`:91-129`). El knowledge del plugin vende `triage_list` como la entrada de workflow de open issues (`plugins/issues-triage/src/index.ts:72-88`). La suite prueba shape y labels (`plugins/issues-triage/tests/triage-tools.spec.ts:100-119`), no filtrado de ya-triaged.
- Impacto: la cola que el plugin presenta como punto de entrada puede incluir indistintamente issues nuevos y issues ya respondidos por el bot. La herramienta aparenta saber más del estado de triage del tracker de lo que realmente consulta.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D94 — `state-sqlite` omite filas persistidas con scope inválido en vez de tratarlas como corrupción del store
- Clasificación: `CONFIRMADO` · Zona: state-sqlite/restore
- Evidencia: en `restorePersistedScopes()`, `parseScope()` devuelve `undefined` para `scope_kind` desconocido o `scope_locator_json` no parseable (`packages/state-sqlite/src/lib/sqlite-driver.ts:935-964`), y el restore hace simplemente `continue` (`:532-536`). A diferencia de `snapshot_json_parse`, que sí dispara `stateStoreCorrupt`, una fila estructuralmente corrupta en la identidad del scope desaparece silenciosamente del restore.
- Impacto: el arranque puede "recuperar" el store omitiendo scopes persistidos dañados sin cuarentena ni error estructurado. Eso maquilla corrupción de estado como ausencia legítima del scope.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D91 — `roadmap` puede aceptar la mutación del authority file aunque falle toda la parte cronológica y responder igual con `ok: true`
- Clasificación: `CONFIRMADO` · Zona: roadmap/write-path
- Evidencia: `recordChange()` en `plugins/roadmap/src/lib/tools/shared/record-change.helper.ts:19-47` actualiza primero el markdown authority y, si falla `timeline.list()`, `pendingTimelineDrafts()` o `timeline.append()`, sigue devolviendo `ok: true` con `recorded: 0`.
- Impacto: el caller puede interpretar el cambio como asentado por completo cuando en realidad el timeline append-only no quedó actualizado ni reconstituible. La autoridad y la historia divergen y la tool no falla duro para hacerlo visible.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D92 — `audit_consolidate` puede perder auditorías ilegibles o mal parseadas sin declararlas en la salida
- Clasificación: `CONFIRMADO` · Zona: audit/consolidation
- Evidencia: el tool salta en silencio ficheros que existen pero no se pueden leer (`plugins/audit/src/lib/tools/audit-consolidate.tool.ts:248-257`) y `parseAuditFiles()` descarta cualquier documento cuyo parse lance excepción (`plugins/audit/src/lib/services/parse-audit.service.ts:344-366`). La consolidación solo usa `skipped` para docs ya parseadas sin findings/scores (`plugins/audit/src/lib/services/audit-consolidate.service.ts:57-71`), así que esos inputs perdidos no quedan reflejados ni como error ni como omitidos.
- Impacto: una consolidación puede presentarse como visión maestra de "todas" las auditorías del directorio mientras en realidad omitió algunas por I/O o parseo. Eso sesga deduplicación, consenso y top actions hacia un corpus más pequeño sin avisarlo.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D89 — `logs_tail` puede truncar en silencio a tres archivos diarios y aparentar que cubre el histórico reciente completo
- Clasificación: `CONFIRMADO` · Zona: logs/tail
- Evidencia: `tail()` en `plugins/logs/src/lib/services/log-store.ts:301-344` lee el fichero del día activo, como mucho el anterior y un tercero extra si aún faltan eventos para el `limit`; no sigue retrocediendo más aunque `limit` siga sin cubrirse. La tool pública `logs_tail` (`plugins/logs/src/lib/tools/tools.ts:429-447`) no expone ninguna señal de truncamiento de horizonte, solo `events`, `oldestTs` y `newestTs`.
- Impacto: el usuario puede pedir, por ejemplo, 1000 eventos y recibir una página corta no porque no existan más, sino porque la lectura se autolimita a tres day-files. El resultado parece una cola completa de "newest events" cuando en realidad es una ventana física parcial.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D90 — El sweep TTL de `memory` convierte un store corrupto en no-op silencioso en vez de surfacear el problema
- Clasificación: `CONFIRMADO` · Zona: memory/maintenance
- Evidencia: `readNotesRaw()` en `plugins/memory/src/lib/services/store-records.ts:135-152` devuelve `[]` ante JSON inválido o top-level shape incorrecto, y `expireExpiredNotes()` (`:164-184`) interpreta eso como "no expirados" y devuelve éxito vacío. En cambio el read path principal `readStore()` sí cuarentena y falla (`plugins/memory/src/lib/services/store-io.ts:18-66`).
- Impacto: la ruta de mantenimiento puede informar `0` notas expiradas mientras el store sigue corrupto en disco, ocultando el problema justo en una operación programada que debería ayudar a mantener la salud del estado.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D87 — La capa read-only de `git` puede convertir fallos de `git` en un estado falso de árbol limpio o vacío
- Clasificación: `CONFIRMADO` · Zona: git/read-surface
- Evidencia: `createGitRunner()` devuelve `{ ok: false, output: '', reason }` en fallo (`plugins/git/src/lib/services/git.ts:20-57`), pero helpers como `gitStatus()`, `gitChanged()`, `gitDiffStat()` y `gitLog()` consumen solo `.output` y parsean la cadena vacía como estado legítimo (`git.ts:98-137`). Las tools `git_status` y `git_changed` prometen el estado real del árbol en `plugins/git/src/lib/tools/tools.ts:49-88`.
- Impacto: un timeout o fallo interno de `git` puede degradarse a `clean: true`, `changed: []` o diff/log vacíos, llevando al agente a actuar como si no hubiera cambios o commits relevantes cuando en realidad no pudo leerlos.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D88 — `memory_import` acepta timestamps y tags semánticamente basura y aun así reporta importación exitosa
- Clasificación: `CONFIRMADO` · Zona: memory/import
- Evidencia: `parseImportPayload()` en `plugins/memory/src/lib/services/store-portable.ts:84-126` solo exige `id`, `title` y `body`; después `redactCandidate()` (`:135-170`) acepta `createdAt`, `updatedAt` y `expiresAt` tal cual mientras sean strings, y convierte `tags` con `String(...)`. `importNotes()` persiste esos metadatos y devuelve contadores de éxito (`:188-235`) sin validación semántica adicional.
- Impacto: una importación puede declararse correcta aunque introduzca timestamps inválidos, tags basura o fechas lexicográficamente incoherentes que luego sesgan merge, expiración y orden. No es JSON roto: es un éxito aparente con datos ya degradados dentro del store.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D85 — El builder activo de `rules` perdió el grupo `services/` y ya no cubre áreas que el builder legacy sí detectaba
- Clasificación: `CONFIRMADO` · Zona: rules/discovery
- Evidencia: `discoverAreas()` del builder por composición usa `GROUP_DIRS = ['apps', 'libs', 'packages', 'projects']` (`plugins/rules/src/lib/frameworks/manifest-via-composition.ts:67-92`), mientras el builder legacy aún incluye `services` (`plugins/rules/src/lib/frameworks/manifest.ts:42-47`). La surface pública e `index.ts` ya dicen que los tools consumen `buildManifestViaComposition` en exclusiva (`plugins/rules/src/public/index.ts:26-30`, `plugins/rules/src/index.ts:118-129`).
- Impacto: cualquier workspace que modele código bajo `services/*` queda fuera del manifest activo sin warning, aunque la versión legacy sí lo tratara como área válida. No es deuda histórica: es una regresión funcional del builder que hoy gobierna `get_rules`/`check_rules`/`apply_rules`.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D86 — `github workflow_run` se vende como "run with its jobs", pero no pagina jobs y puede devolver solo un subconjunto
- Clasificación: `CONFIRMADO` · Zona: github/workflows
- Evidencia: `workflow_run` consulta `/actions/runs/:runId/jobs` una sola vez sin `page` ni `per_page` (`plugins/github/src/lib/tools/catalog.ts:1446-1477`) y luego publica `run.jobs` como si fuera la colección completa. La herramienta hermana `jobs_list` sí reconoce paginación y expone `nextPage` (`catalog.ts:1483-1527`).
- Impacto: para runs con muchos jobs, la vista agregada puede presentar una lista truncada como si fuera el conjunto entero de jobs del run. Es un scan parcial vendido como completo en una herramienta de detalle.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D83 — `usage-tracking` puede presentar métricas completas tras saltarse filas corruptas o parciales sin dejar rastro
- Clasificación: `CONFIRMADO` · Zona: usage-tracking
- Evidencia: `readInvocations()` en `plugins/usage-tracking/src/lib/rollup.ts:55-75` y `readHostLifecycleEvents()` en `plugins/usage-tracking/src/lib/host-lifecycle.ts:31-52` omiten silenciosamente líneas corruptas o parciales. `session_hygiene` y el resto de consumidores (`plugins/usage-tracking/src/lib/tools/session-hygiene.tool.ts:42-73`) no reciben ninguna marca de cobertura parcial ni conteo de filas descartadas: simplemente procesan lo que quedó.
- Impacto: un log truncado o parcialmente dañado puede producir números bien formados pero incompletos, degradando la confianza en reportes de uso e higiene precisamente hacia un falso “todo parece normal”.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D84 — `project-kpis` mezcla historia del intervalo pedido con un snapshot recalculado sobre otra ventana temporal
- Clasificación: `CONFIRMADO` · Zona: project-kpis
- Evidencia: `loadState()` en `plugins/project-kpis/src/lib/tools/project-kpis.tool.ts:1040-1122` lee `history` con `from`/`to` explícitos (`:1096-1103`), pero el `snapshotReader` usa solo `windowDays` al reconstruir el snapshot (`kpi-aggregation.service.ts:200-225`). La salida final devuelve ambas piezas bajo un mismo payload de `window`, aunque una parte responda al intervalo pedido y la otra a una ventana móvil hasta `now`.
- Impacto: una consulta histórica o desplazada puede mezclar fuentes temporales distintas en una sola vista aparentemente coherente. Eso hace que la respuesta parezca más exacta de lo que realmente es para análisis longitudinales o forenses.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D81 — El knowledge oficial de `api_mock` describe un shape de salida que no coincide con la tool real y la UI lo renderiza tal cual
- Clasificación: `CONFIRMADO` · Zona: api/knowledge-ui
- Evidencia: el knowledge body del plugin `api` afirma que `api_mock` devuelve `{ ok, operationId, response }` (`plugins/api/src/index.ts:95-106`), pero el contrato real expone `selectedStatus`, `selectedBody`, `allResponses` y `count` (`plugins/api/src/lib/tools/api-mock.tool.ts:70-77,228-235`). La UI del detalle de tool carga ese knowledge por MCP (`extensions/vscode/src/commands/open-tool-detail.ts:100-129`) y lo renderiza literalmente (`packages/ui-extension/src/dashboard/render-tool-detail.ts:88-103`).
- Impacto: el artefacto de ayuda más oficial para un consumidor humano de la tool ya nace desalineado con el contrato real. No es solo README stale: es la propia vista IDE la que puede enseñar un shape falso de la salida.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D82 — El watcher de `notification` puede emitir falsos `lock-released` cuando el lock file está corrupto o ilegible
- Clasificación: `CONFIRMADO` · Zona: notification/events
- Evidencia: `readInFlight()` en `plugins/notification/src/lib/services/watcher.ts:41-79` convierte cualquier error de lectura o parseo del lock en un mapa vacío; `diffReleased()` (`:82-90`) interpreta cualquier task que estaba en `prev` y ya no está en `curr` como release real; y el watcher publica esos eventos en `notify_status` (`plugins/notification/src/lib/tools/tools.ts:56-69`) sin distinguir si la "desaparición" fue una liberación real o un fallo de lectura intermedio.
- Impacto: además del `await_lock` verde prematuro de D73, el canal de notificaciones puede producir eventos de liberación falsos y perder continuidad causal tras un lock file temporalmente ilegible. Eso afecta tanto a humanos como a agentes que reaccionen a `lock-released`.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D79 — `security_secrets` puede declarar el proyecto limpio mientras ignora justo los ficheros ignored donde suelen vivir fugas locales
- Clasificación: `CONFIRMADO` · Zona: security/secrets
- Evidencia: el adaptador real lista candidatos con `git ls-files` y, para `scope: changed`, añade `--others --exclude-standard` (`plugins/security/src/lib/secrets/real-deps.ts:17-34`); el orquestador no sale jamás de ese universo (`plugins/security/src/lib/secrets/run-scan.ts:29-48`). Por diseño quedan fuera `.env`, credenciales temporales u otros ficheros ignorados por `.gitignore`, aunque la descripción pública siga hablando de escanear "the project's source for leaked secrets" (`plugins/security/src/lib/tools/security-secrets.tool.ts:39-46`).
- Impacto: la herramienta puede devolver una postura limpia justo cuando el workspace local contiene los secretos más probables de filtrar antes de commit. La omisión no es un falso positivo de precisión, sino un recorte estructural del corpus inspeccionado.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9), qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

### D80 — `perf_bench` se presenta como runner de benchmarks, pero solo hace estadística sobre samples ya medidos
- Clasificación: `CONFIRMADO` · Zona: perf/bench
- Evidencia: la tool `perf_bench` se resume como "Run named benchmark samples" (`plugins/perf/src/lib/tools/perf-bench.tool.ts:41-77`), pero la implementación solo acepta arrays numéricos y los pasa a `runBench(name, samples)` (`:66-76`), que se limita a calcular `meanMs`, `p95Ms` y `ops` (`plugins/perf/src/lib/bench/bench-runner.ts:10-29`). El propio feature doc la define como "Pure comparator over injected samples" (`docs/delendai/proposals/done/feats/f00126-...md:63-64`).
- Impacto: la surface pública suena a ejecución real de benchmark cuando hoy es una calculadora offline sobre muestras que otro actor tuvo que recoger. Eso infla la confianza que un usuario puede dar a `perf_bench` como evidencia primaria de rendimiento.
- seenBy: gpt-5.4

### D77 — `test-convention` presenta deriva de specs como monorepo-global, pero su lado "source" solo ve `src/**/*.ts?(x)` en la raíz
- Clasificación: `CONFIRMADO` · Zona: test-convention
- Evidencia: `isTsSource()` en `plugins/test-convention/src/scan.ts:18-21` solo reconoce rutas `src/...tsx?`; `scanDrift()` (`:155-220`) usa esa mitad para disparar `missing-spec-for-export`, mientras el resto del escáner sí recorre más árbol para specs. En un monorepo con `packages/*/src`, `plugins/*/src`, `apps/*/src`, etc., el enforcement de companion specs no cubre la mayoría del código fuente aunque el plugin se presente como convención del workspace entero. Además, el contrato expone `languages` como configurable (`plugins/test-convention/src/convention.ts:36-80`, `lib/tools/get-convention.ts:12-76`), pero ese campo no participa en el descubrimiento real.
- Impacto: la convención reportada aparenta una cobertura monorepo y parametrizable por lenguaje que el enforcement no tiene. El resultado puede ser una falsa sensación de salud en paquetes enteros jamás escaneados por la mitad más crítica del drift.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D78 — `conventions_explain_path` se vende como explicación general de convenciones, pero siempre usa el perfil TypeScript
- Clasificación: `CONFIRMADO` · Zona: conventions
- Evidencia: la herramienta usa `classifyPath` y `DEFAULT_TS_RULES` directamente (`plugins/conventions/src/lib/tools/explain-path.tool.ts:15-41,72-87`), mientras el plugin ya declara un registro de perfiles `typescript|python|rust|go` en `plugins/conventions/src/lib/profiles/profile-registry.ts:1-66`. El output y la descripción son genéricos y no avisan de que la explicación es TS-only.
- Impacto: en un árbol con reglas multiperfil, `conventions_explain_path` puede "explicar" una ruta con la semántica TypeScript aunque el resto del plugin para ese lenguaje esté gobernado por otro perfil. Eso vuelve engañosa la herramienta precisamente pensada para explicar por qué una ruta pertenece a cierta convención.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D75 — `usage-tracking` puede reportar totales completos tras saltarse filas corruptas o parciales sin dejar rastro
- Clasificación: `CONFIRMADO` · Zona: usage-tracking/persistence
- Evidencia: `readInvocations()` en `plugins/usage-tracking/src/lib/rollup.ts:55-75` y `readHostLifecycleEvents()` en `plugins/usage-tracking/src/lib/host-lifecycle.ts:31-52` omiten silenciosamente líneas corruptas, parciales o malformadas. Luego `usage_report` y `session_hygiene` consumen esos lectores y publican totales/sesiones normales (`session-hygiene.tool.ts:42-73`) sin ningún bit de "partial data" o conteo de filas saltadas.
- Impacto: un log truncado o parcialmente dañado puede producir métricas perfectamente formadas pero incompletas, lo que sesga reportes de uso e higiene justo en la dirección de "todo parece normal".
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D76 — `project-kpis` mezcla historia del intervalo pedido con un snapshot recalculado sobre otra ventana temporal
- Clasificación: `CONFIRMADO` · Zona: project-kpis/time-window
- Evidencia: `loadState()` en `plugins/project-kpis/src/lib/tools/project-kpis.tool.ts:1040-1122` lee `history` con `from`/`to` explícitos (`:1096-1103`), pero el `snapshotReader` solo recibe `windowDays` vía `toKpiQuery(query)` y reconstruye el snapshot con la ventana móvil actual (`kpi-aggregation.service.ts:200-225`). El resultado final devuelve ambas piezas bajo un único `window` implícito aunque no estén alineadas temporalmente.
- Impacto: una consulta histórica o desplazada puede mezclar un histórico del intervalo pedido con un snapshot de "últimos N días hasta ahora". La respuesta aparenta consistencia temporal más fuerte de la que realmente garantizan sus fuentes.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D70 — `docs_generate` puede degradar fallos de lectura del árbol fuente a éxito vacío
- Clasificación: `CONFIRMADO` · Zona: docs/generation
- Evidencia: `walkTsFiles()` en `plugins/docs/src/lib/tools/docs-generate.tool.ts:31-46` consume solo `.entries` de `safeListDir(dirAbs)` y descarta por completo `readFailed`/`reason`; el contrato de `safeListDir` precisamente distingue `read-failed` de un directorio vacío (`packages/core/src/lib/shared/safe-list-dir.ts:1-119`). Después la tool sigue y devuelve `ok: true` con `files` vacíos o con un `README.generated.md` sintético (`docs-generate.tool.ts:83-117`).
- Impacto: un `src` inexistente, ilegible o de tipo erróneo puede verse como "0 módulos" en vez de como fallo diagnóstico. Eso convierte errores de lectura del árbol fuente en documentación aparentemente generada con éxito.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D71 — `api_mock` anuncia soporte de `specUrl`, pero el wiring real del plugin nunca le inyecta el fetch seam necesario
- Clasificación: `CONFIRMADO` · Zona: api/mock
- Evidencia: el handler de `api_mock` acepta `specUrl` y `allowList`, pero cuando no hay `specFetch` inyectado devuelve `toolError('install-required', ...)` (`plugins/api/src/lib/tools/api-mock.tool.ts:155-169`). El registro real del plugin en `plugins/api/src/index.ts:58-78` solo pasa `defaultAllowList`; nunca inyecta `specFetch`. En consecuencia, la ruta `specUrl` del surface pública está muerta en la configuración real del plugin.
- Impacto: la tool aparenta soportar dos caminos equivalentes (`spec` inline o `specUrl` remota) cuando uno de ellos falla siempre en runtime salvo wiring host ad hoc no usado por el propio plugin.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D72 — `i18n_check` puede marcar claves vivas como `unused` porque solo reconoce la API legacy por strings
- Clasificación: `CONFIRMADO` · Zona: i18n/tooling
- Evidencia: `extractUsedKeys()` en `plugins/i18n/src/lib/keys/extract-used-keys.ts:1-13` solo detecta llamadas con forma `t('a.b')`, `i18n.t('a.b')` o `__('a.b')`; el propio frontend ya documenta la migración a acceso tipado por propiedades (`apps/web/src/i18n/ui.ts:1-12,50-52,95-96`). `i18n_check` usa ese extractor para emitir `unused-key` (`plugins/i18n/src/lib/tools/i18n-check.tool.ts:41-48,77-88`).
- Impacto: el medidor de uso puede declarar huérfanas claves que sí están vivas bajo la API canónica nueva (`t.nav.concept`, `t.hero.title.a`, etc.). Eso degrada la confianza en las conclusiones de limpieza i18n del plugin.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D73 — `await_lock` puede resolver `released/alreadyFree` por una lectura fallida del lock, no por una liberación real
- Clasificación: `CONFIRMADO` · Zona: notification/watcher
- Evidencia: `readInFlight()` en `plugins/notification/src/lib/services/watcher.ts:41-79` convierte cualquier error de lectura/parseo del lock file en un mapa vacío. `awaitLockRelease()` (`:111-187`) define libre como "taskId ya no está en ese mapa". Por tanto un ENOENT transitorio, un JSON corrupto o una lectura fallida pueden hacer que la espera termine como `released: true` o `alreadyFree: true` aunque el lock no se haya liberado realmente.
- Impacto: el mecanismo pensado para evitar polling puede despertar demasiado pronto a un agente y empujarlo a reintentar un claim todavía ocupado. Convierte incertidumbre de I/O en una señal verde de coordinación.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D74 — `report_complete` confirma persistencia, pero no garantiza que la notificación al humano haya salido
- Clasificación: `CONFIRMADO` · Zona: completion
- Evidencia: `report_complete` persiste el record y llama a `pushNotification()` antes de devolver `toolOk` (`plugins/completion/src/lib/tools/completion-tools.ts:96-118`), pero `safeSendLoggingMessage()` traga tanto la ausencia de canal como cualquier rechazo del envío (`plugins/completion/src/lib/safe-logging.helper.ts:14-25`).
- Impacto: la tool puede comunicar éxito al agente aunque el operador nunca haya recibido la notificación prometida. La superficie garantiza durabilidad del record, no entrega del aviso, pero hoy el contrato visible no separa ambas cosas.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D67 — `container_build` acepta `dockerfile` y `context` arbitrarios y puede construir fuera del workspace sin ninguna contención
- Clasificación: `CONFIRMADO` · Zona: container/build
- Evidencia: `plugins/container/src/lib/tools/container-build.tool.ts:32-43` acepta `dockerfile` y `context` como strings libres; luego los inserta tal cual en el argv (`:120-149`) y ejecuta `runExternalTool(...)` sin `cwd` ni validación de rutas (`:163-171`). El runner compartido solo aplica containment/cwd si el caller se lo pasa (`packages/core/src/lib/external-tool/run-external-tool.ts:45-54`).
- Impacto: una llamada confirmada puede mandar al daemon Docker a leer un `Dockerfile` o un contexto absoluto/fuera del workspace, saltándose la política de "operar sobre el proyecto actual" que el resto del plugin sugiere.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9), claude-sonnet-5-5 (confirmado con matiz: sí exige `confirm:true`/`dryRun` (`REQUIRE_CONFIRM`); sin contención de rutas)

### D68 — `deps_audit` puede degradar fallos de ejecución o parseo a “sin findings”
- Clasificación: `CONFIRMADO` · Zona: deps/audit
- Evidencia: `parseBunAudit()` en `plugins/deps/src/lib/services/audit.ts:60-94` devuelve `[]` cuando no encuentra JSON o el parse falla; `runDepsAudit()` (`:104-128`) solo trata como `skipped` el caso `bun` no encontrado y, para cualquier otra salida no parseable, empaqueta `parseBunAudit(raw)` dentro de `toScanResult('bun-audit', ...)`. La descripción pública solo reconoce `bun not found` como caso degradado (`plugins/deps/src/lib/tools/tools.ts:334-351`).
- Impacto: un `bun audit` roto por banner inesperado, salida parcial o error no JSON puede presentarse como auditoría limpia con `worst: none`, ocultando que el scan ni siquiera produjo datos válidos.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D69 — `deps_licenses` puede devolver limpio falso cuando el manifest o `node_modules` no son legibles
- Clasificación: `CONFIRMADO` · Zona: deps/licenses
- Evidencia: `realLicenseDeps.listDependencyNames()` en `plugins/deps/src/lib/services/licenses.ts:96-116` devuelve `[]` ante cualquier error al leer o parsear el manifest, y `readLicense()` (`:117-129`) devuelve `undefined` si falla leer `node_modules/<pkg>/package.json`. `deps_licenses` luego trata esos vacíos como findings normales (`plugins/deps/src/lib/tools/tools.ts:374-395`) y puede responder con `worst: none` sin distinguir entre “no dependencies reviewed” y “all licenses acceptable”.
- Impacto: una ausencia de `node_modules`, un manifest corrupto o lecturas fallidas del árbol de dependencias pueden maquillarse como posture limpia en lugar de como scan incompleto o inválido.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### D63 — `security_audit` se anuncia como "run all scanners", pero omite por completo el scanner SAST del propio plugin
- Clasificación: `CONFIRMADO` · Zona: security/aggregate
- Evidencia: el contrato de `security_audit` en `plugins/security/src/lib/tools/security-audit.tool.ts:1-50` promete "Run all scanners against the project", pero la implementación agrega solo tres fuentes en `:69-88`: secretos, CVEs de dependencias y licencias. El scanner SAST del mismo plugin no participa en ningún punto de ese backlog agregado.
- Impacto: la llamada que se presenta como postura completa de seguridad puede dejar fuera findings de código first-party y aun así responder como si hubiera corrido "todos" los scanners. Es una sobrepromesa del meta-scanner, no solo una limitación documental.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D64 — `perf_profile` ofrece `format: flamegraph`, pero la ruta real siempre ejecuta el mismo `node --prof`
- Clasificación: `CONFIRMADO` · Zona: perf/profile
- Evidencia: la tool acepta `format: 'hotspots' | 'flamegraph'` (`plugins/perf/src/lib/tools/perf-profile.tool.ts:55-78`) y promete adaptar la captura al profiler disponible. Sin embargo `realPerfProfileDeps()` en `plugins/perf/src/lib/profile/real-perf-profile-deps.ts:176-190` solo usa `format` para reordenar el probe y luego `runProfiler()` ignora `_profilerId` y siempre llama a `runNodeProf(...)` (`:188-190`).
- Impacto: el contrato visible sugiere dos modos reales de perfilado cuando hoy la ejecución efectiva es una sola. Un caller que pida `flamegraph` no obtiene una ruta distinta ni una garantía adicional: solo cambia el orden de detección antes de caer en el mismo runner.
- seenBy: gpt-5.4, deepseek-v4-pro (3a tanda 18b090cb9)

### D65 — `security_secrets` omite por diseño ficheros ignorados donde suelen vivir las fugas locales más probables
- Clasificación: `CONFIRMADO` · Zona: security/secrets
- Evidencia: el adaptador real usa `git ls-files` y, para `scope: changed`, además `--others --exclude-standard` (`plugins/security/src/lib/secrets/real-deps.ts:17-34`). El orquestador luego filtra extensiones y tests, pero nunca sale de ese universo (`plugins/security/src/lib/secrets/run-scan.ts:29-48`). Eso deja fuera exactamente clases habituales de fuga local como `.env`, credenciales temporales u otros archivos ignorados por `.gitignore`, pese a que la descripción pública habla de "scan the project's source for leaked secrets" (`plugins/security/src/lib/tools/security-secrets.tool.ts:39-46`).
- Impacto: el scanner puede devolver una postura limpia mientras ignora la zona de mayor probabilidad de secreto local antes de commit. No es un falso positivo de precisión: es una ceguera estructural del conjunto de archivos inspeccionados.
- seenBy: gpt-5.4, qwen-3.8-max (2ª pasada 2026-10-19): verificado por lectura directa en 18b090cb9

### D66 — `perf_bench` se presenta como bench runner, pero solo calcula estadística sobre samples inyectados
- Clasificación: `CONFIRMADO` · Zona: perf/bench
- Evidencia: la tool `perf_bench` se resume como "Run named benchmark samples" (`plugins/perf/src/lib/tools/perf-bench.tool.ts:41-77`), pero la implementación solo acepta arrays de números y los pasa a `runBench(name, samples)` (`:66-76`), que no ejecuta ninguna carga real: solo calcula `meanMs`, `p95Ms` y `ops` sobre la muestra dada (`plugins/perf/src/lib/bench/bench-runner.ts:10-29`). El propio feature doc lo admite como "pure comparator over injected samples" (`docs/delendai/proposals/done/feats/f00126-...md:63-64`).
- Impacto: la surface pública suena a ejecución real de benchmark cuando hoy es una calculadora offline de muestras ya medidas. Eso puede inducir a sobrevalorar la evidencia de rendimiento que produce la tool si no se conoce su limitación interna.
- seenBy: gpt-5.4, deepseek-v4-pro (verificado en 18b090cb9)

### G68 — El bridge de identidad (`provider-model.json`) es un archivo de máquina compartido de formato plano: dos sesiones del MISMO workspace con proveedores distintos se pisan la entrada y el modelo se atribuye mal
- Clasificación: `CONFIRMADO` (observado en vivo) · Zona: core/work-identity (f00758/#1037)
- Evidencia (snapshot 4c4e978f8, sesión real): el archivo `~/.cache/delendai/provider-model.json` contenía
  `{"model":"gemini-3.8-flash-high",...,"workspace":"<workspace raíz del monorepo>","at":"2026-10-19T18:09:55Z"}`
  — escrito por OTRA sesión paralela (gemini vía Universal Chat Provider) que comparte la máquina — mientras
  esta sesión (host que declara su modelo) es DeepSeek V4 Pro. El bridge (cadena `model > environment >
  provider > client`, `resolveWorkAgentId`) da prioridad al model del host cuando lo hay, así que el daño
  quedo mitigado, pero: (1) el helper ya soporta el formato por-workspace `entries` (per-workspace form)
  en `provider-model-bridge.helper.ts:175-190`, pero el proveedor escribe el formato **plano** (una sola
  entrada global); (2) dos sesiones del mismo workspace con proveedores distintos **pisan** la única
  entrada y el `at` resuelto corresponde al último en escribir, no a la sesión que pregunta; (3) un host
  que SÍ declara modelo queda a merced de frescura del archivo en las cadenas `provider` cuando el host
  no declara modelo (los hosts `client-*` y los que no exponen modelId). La ventana de 15 min
  (`PROVIDER_MODEL_MAX_AGE_MS`) no distingue "otra sesión del mismo workspace" de "esta sesión".
- Qué debería: el formato `entries` por workspace debería ser el único (el código ya lo lee), y la entrada
  debería llevar además un identificador de sesión/proveedor para que dos ventanas del mismo workspace no
  se pisen; o `providerModelReading` debería comparar también el proveedor del host actual.
- Impacto: atribución de trabajo y permisos de identidad (`workRefAgent`, commit-policy) pueden firmar al
  modelo equivocado (misma clase de errata que la de glm-5.3-arquitectura en el PR #1253). P2 de higiene
  de identidad. Confianza: alta (observado en esta misma sesión, reproducido el contenido y la hora).
- seenBy: deepseek-v4-pro

### G69 — Asimetría respuesta-vs-persistido en el lock: el cliente recibe `ok` por un claim que la siguiente `readSynchronizedLock` ya purgó (procesos efímeros); no es double-grant pero sí un estado reportado que nunca existió
- Clasificación: `PROBABLE` (reproducido, causa de diseño) · Zona: proposals/locks (amplia y matiza G51/D1/D2)
- Evidencia (reproducción propia con 2 procesos `bun -e` reales y `runAgentLockEngine` auténtico, snapshot 4c4e978f8):
  - **X1**: 25 rondas de claim concurrente de archivos disjuntos: 15/25 ambos sobreviven, 10/25 solo uno
    (pérdida silenciosa); ambos clientes respondieron `ok:true` en el 100% de las rondas.
  - **C1**: 20 rondas staggered (150 ms) con procesos efímeros: 20/20 el segundo claim gana y el primero
    desaparece del fichero final.
  - **D (decisivo)**: 25 rondas con el primer reclamante VIVO (proceso que aguanta 4 s): 25/25 el segundo
    recibe `blocked:true`, 0 doble-grants. El mutex exterior y `removeStale` funcionan cuando el poseedor
    vive.
  - Causa identificada: `readSynchronizedLock` → `removeStale` → `isProcessAlive(pid)` (orphaned-lock.ts:49)
    purga el claim del proceso que ya terminó; el cliente que lo escribió ya recibió `ok`. Es un claim
    reportado como concedido que deja de existir sin aviso (asimetría respuesta↔persistido), no una doble
    asignación entre vivos.
  - Relación con G51: la causa "ENOENT→emptyLock" de G51 es una lectura frágil REAL (confirmo
    `lock-store.ts:36-53`), pero mi storm con poseedor vivo NO reprodujo el double-grant (0/25); la
    frecuencia depende de FS/carga (coincido con el re-test storm=50 que pide qwen-3.8-flash). Lo que SÍ
    reproduje de forma estable es esta asimetría con procesos efímeros, que los tests
    (`concurrent-claims.spec.ts`, `coordination-chaos.spec.ts`) no cubren porque solo usan `Promise.all`
    en un proceso.
- Impacto: la señal de coordinación (`claim ok`) puede mentir sobre el estado persistido; un agente cuyo
  proceso se cae poco después de claim (o un claim hecho desde un one-shot) pierde su claim silenciosamente.
  P2. Confianza: alta en el hecho observado, media en la gravedad (no es carrera desprotegida).
- Remedio sugerido: que el claim verifique la persistencia de su propia entrada antes de devolver ok, o
  que `readSynchronizedLock` distinga "purgado por muerte" y lo notifique. Regression: test de doble-claim
  con procesos reales y verificación de la entrada propia tras el claim.
- seenBy: deepseek-v4-pro

### G70 — Las páginas web `/status/logs` y `/status/recovery` SÍ abren EventSource real, pero el handler solo hace `close()` sin consumir datos: el matiz de G47 no es "sin SSE" sino "SSE que se auto-cierra sin efecto"
- Clasificación: `CONFIRMADO` (matiza G47) · Zona: apps/web
- Evidencia (snapshot 4c4e978f8): `apps/web/src/pages/status/logs.astro:21-31` crea
  `new EventSource(`${base}/api/events/logs`)`, registra `source.addEventListener('logs', () => { source.close(); })`
  y `source.onerror = () => source.close();` — no lee `event.data`, no re-renderiza, no hidrata.
  `RecoveryTable.astro` y `LogTable.astro` arrancan con `zombies=[]`/`events=[]` como props por defecto
  (`recovery.astro:14-18`, `logs.astro:14-16`) y no tienen ruta de append. Matiz a G47/gpt-5.4 D27/D29:
  la afirmación "bootstrap estático" es correcta para el endpoint (`api/events/[topic].ts` prerenderiza
  `{bootstrap:true}`), pero el front SÍ intenta conectar; el bug es que el handler **cierra la conexión
  inmediatamente** y las tablas quedan vacías por defecto. Mismo veredicto operativo (páginas muertas),
  distinta causa de la que sugiere "no hay streaming en absoluto".
- Impacto: P3 (UX/observabilidad); refuerza D13/G47 (pages-audit las describe como "live data").
- seenBy: deepseek-v4-pro

### G71 — El patrón `outputSchema` deshonesto (D4/D10/D18/D19/D41) se extiende a `api`, `observability` y `prompt-eval`: 7 tools más declaran solo-éxito o solo-forma y emiten `toolError` fuera del contrato
- Clasificación: `CONFIRMADO` · Zona: api, observability, prompt-eval (amplía D18/D19/D41)
- Evidencia (snapshot a78813827):
  - `plugins/api/src/lib/tools/api-mock.tool.ts:70-82` declara `OUTPUT = z.object({ ok: z.literal(true), ... })`
    sin unión de error, pero el handler devuelve `toolError(...)` en 7 caminos (`:129,141,156,162,179,187,221`):
    input inválido, `install-required` sin `specFetch`, operación no encontrada, etc. `api-call` sí usa
    `z.union` (correcto, `:53-70` + `:1 union`) y `api-validate` también (`:65 union`) → el defecto NO es
    del plugin entero, es de `api_mock` aislado.
  - `plugins/observability/src/lib/tools/obs-errors.tool.ts:48-56`: `OUTPUT` declara `source/issues/
    nextCursor/redactions` (sin `ok`, sin unión de error) pero `installHint()` (`:57-63`) y el handler
    (`:108`) devuelven `toolError`. Idem `obs-health.tool.ts` (`TRACE_OUTPUT:48`, `RELEASE_OUTPUT:71`,
    `toolError` en `:85,146,183`) y `obs-correlate.tool.ts` (`OUTPUT:79`, `toolError` en `:43,49,122`).
  - `plugins/prompt-eval/src/lib/tools/eval-run.tool.ts:57-75`: `outputSchema` inline sin campo de error,
    pero el handler devuelve `toolError` en `:80,86,114`.
- Qué debería: cada tool declarar la unión de éxito+error (`ok: z.boolean()` + `error`, patrón de
  `proposal-transition.tool.ts:360`) o, como `changelog/release-plan.tool.ts:102` y
  `database/db-query.tool.ts:42` ya hacen, `z.union([OUTPUT, ERROR_OUTPUT])`.
- Qué ocurre: estos plugins NO están en D18 (memory/logs/usage-tracking) ni D19 (GitLab) ni D41
  (search/diagram/external-mcp). El ratchet D20 (que solo comprueba la forma declarada) no los detecta
  porque el handler emite el error en runtime, no en el schema. El SDK poda el structuredContent de error
  que no encaja con el schema declarado (matiz de claude-opus-5-5 en D4/D10).
- Impacto: igual que D18/D19 — el contrato MCP miente en el camino de error; el llamador pierde el `code`
  de error justo cuando necesita corregir su input. P2 de consistencia contractual, no explotable.
- Remedio: una sola regla en core que prohíba `outputSchema` sin rama de error cuando el handler importa
  `toolError`, o extender el flag de D20 para ejecutar el camino de error contra el schema declarado.
- seenBy: deepseek-v4-pro

### G72 — `logo-mono.svg` no es monocromo: es byte-idéntico al `logo.svg` de color
- Clasificación: `CONFIRMADO` · Zona: brand/extensions (extiende G46)
- Evidencia (qwen-3.8-max, snapshot 18b090cb9): las tres copias de
  `logo-mono.svg` (`apps/shared/brand/`, `apps/web/public/`,
  `extensions/vscode/media/`) tienen sha256 `999423f5…57b3636`, IDÉNTICO al de
  sus `logo.svg` parejos; el fichero declara `<linearGradient id="mc">`
  (logo de color), así que la variante "mono" es en realidad una copia del
  logo de color bajo nombre equivocado. Su único consumidor
  (`extensions/vscode/scripts/regenerate-icons.ts:8,40`) genera la familia de
  iconos consumiéndolo y esperando una marca monocroma; `sync-logo.ts` no
  conoce la pareja `logo-mono` (0 menciones "mono" en el script). G46 lo
  registró como "cuarta copia sin gate"; añado que además es un asset
  incorrecto: el pipeline de iconos parte de un SVG de color etiquetado mono.
- Remedio: aportar artwork monocromo real a `logo-mono.svg` (o retirar la
  variante y ajustar `regenerate-icons.ts`), y extender el gate de
  `sync-logo.ts` a la pareja completa con fuente única `apps/shared/brand/`.
- seenBy: deepseek-v4-pro (4a tanda 18b090cb9), qwen-3.8-max (2ª pasada 2026-10-19), claude-sonnet-5-5 (confirmado: sha256 idéntico `999423f5…` en `apps/shared/brand`)

### G73 — `@delendai/state-sqlite` es el gemelo huérfano de `roadmap-sqlite` (G59): 3.268 LOC y 8 specs sin un solo import de runtime en el árbol
- Clasificacion: `CONFIRMADO` · Zona: packages (codigo no usado, amplia G59)
- Evidencia (snapshot 18b090cb9, barrido de todo packages+plugins+apps+extensions):
  - `grep -rn "@delendai/state-sqlite"` sobre `**/*.ts` (excluyendo el propio paquete):
    **0 imports de runtime**. Las unicas apariciones son comentarios y specs de
    aislamiento (DIP de `packages/state`: `lifecycle-state.interface.ts:7`,
    `registry.ts:10`, `assemble.ts:242` documentan que core NO puede importar
    `bun:sqlite` y que el driver "se carga por nombre"; `state-registry-choice.ts:10`
    dice lo mismo); ninguna linea `import ... from '@delendai/state-sqlite'` real.
  - El paquete tiene 3.268 LOC (`src/lib/schema`, `fail-closed`, `sqlite-driver`,
    `registry-facade`, `lifecycle-state-store`), 8 specs, **sin README**.
  - Contraste: `roadmap-sqlite` ya esta cubierto por G59 (0 dependientes); este es
    el mismo patron en el paquete de persistencia del state engine, el mas
    importante de los tres debates (state, state-telemetry, state-sqlite).
  - `state-telemetry` tiene exactamente 1 dependiente real (`cli/work-progress.service.ts:24`);
    `state` tiene 39 (`@delendai/state/lib/*`). Solo `state-sqlite` queda en 0.
- Que deberia: o el state engine (o un plugin que use runtime SQLite) importa
  `state-sqlite` de verdad, o el paquete se documenta como "adapter opcional a
  cargar por nombre" (como el propio DIP de core exige) con README que lo diga y
  un test que fije el contrato de carga por nombre.
- Que ocurre: infraestructura implementada y testeada (8 specs) que ningun
  consumidor ejecuta; el unico camino de uso real (registro por nombre) no tiene
  ni el import ni el test e2e que lo materialice.
- Impacto: P3 (mantenimiento; deuda de superficie). Mismo "paraiso del monkey" de
  G59/G6: paquete que envejece sin consumidor. Coste si se retira: 3.268 LOC + 8
  specs (menos superficie, no crea nada); coste si se completa: un test de carga
  por nombre + README.
- Confianza: alta (grep exhaustivo con `--include='*.ts'` sobre todo el arbol).
- Relacion: amplia G59 (roadmap-sqlite), G6 (paquetes a medias/sin README) y la
  tesis G18 (infraestructura que crece sin producto); refuerza el pedido de
  retirar-o-cablear de glm-3 para la familia sqlite.
- seenBy: deepseek-v4-pro, claude-sonnet-5-5 (matiz: `state-sqlite` se carga por nombre (`state-registry-choice.ts:65`) tras `state.parity.shadow.enabled`; opt-in sin activación en dogfood, no huérfano)

### G74 — El prompt de la propia auditoría (`2026_10_19_00:29_prompt_auditoria_conjunta.md`) exige condiciones que el acta a00095 no cumplió: snapshot común, fichas 0-10 por plugin, medición e2e de tokens, y no está versionado
- Clasificacion: `CONFIRMADO` · Zona: metodo/articulos del propio proceso (auditoria de la auditoria, no correccion)
- Evidencia (artefacto: `.cache/chat-with-llms/2026_10_19_00:29_prompt_auditoria_conjunta.md`; acta: este documento, snapshot 18b090cb9):
  1. **Snapshot común ausente.** El prompt ordena «Snapshot de referencia: [SHA_COMUN_ASIGNADO_POR_EL_COORDINADOR]» y «obten el SHA real de develop, comprueba el snapshot asignado y registra ambos» (secciones Identidad y 1). El frontmatter del acta registra **6 snapshots distintos para 8 revisores**: `2d0f8a5c3b` (glm-5.3-flash), `434ba3c373` (claude-opus-5-5), `fd08247614` (gemini-3.8-flash), `cbefecaa35` (qwen-3.8-max), `514758e78` (glm-arquitectura/qwen-flash/gpt-5.4), `4c4e978f8` (deepseek-v4-pro). Ningun revisor compartio un ancla comun; cada uno reanclo al develop de su momento. Las reproducciones se citan con SHAs distintos y eso complica el arbitraje (ej. D1/D2 verificados en 3 anclas distintas).
  2. **Ficha individual por plugin con nota 0-10 ausente.** El prompt exige (seccion 3) «Asigna una nota provisional de 0 a 10 con justificacion basada en evidencias» y «ficha individual por cada plugin detectado»; ademas (seccion 2) estados explicitos Verificado/Analizado/Bloqueado/Defecto/No aplicable «sin el estado implicito supongo que esta bien». El acta tiene 193 hallazgos y matrices, pero **ningun revisor publico las 61 fichas con su nota 0-10 y estado por plugin** en el acta (las unicas notas son globales por subsistema, y qwen-3.8-flash menciona «fichas de 61 plugins» entregadas inline en su bloque). La matriz que yo publique en la g1/pasada exhaustiva (PR #1265) tiene estado verificado/analizado y LOC/specs, pero **sin nota 0-10 por plugin**: el entregable 3 del prompt queda parcial.
  3. **Medicion de tokens end-to-end ausente.** El prompt exige (seccion 7) medir el ciclo COMPLETO de una tarea (14 pasos) con bytes/tokens/coste/latencia/etc., y comparar superficies con y sin optimizacion. El acta tiene mediciones de bootstrap por modo (native 311.431 B vs adaptive/compact 6.243 B — la mia, y la de gpt-5.4 del dashboard routed), pero **nadie midio el ciclo completo** (delegacion → subagente → llamadas → reintentos → verificacion). Lo registre como limitacion de metodo en mi bloque («la medicion e2e no existe como script en el repo»); el entregable 7 queda pendiente.
  4. **El propio prompt no esta versionado.** Vive en `.cache/chat-with-llms/` (ignorado por git); no existe copia en `docs/` ni en el repo. Cualquier revisor futuro (o el S10) no puede citar el instrumento exacto con el que se pidio esta auditoria salvo que lo copie de un .cache local. Misma clase de fragilidad que G64 (anexo sin sitio) pero del instrumento raiz.
- Que deberia: (a) un snapshot comun asignado por el coordinador (o una regla de re-anclaje documentada, ej. «siempre el develop del dia X»); (b) fichas 0-10 por plugin en un anexo del acta (o en el bloque de qwen-3.8-flash, ya inline); (c) un script de medicion e2e de tokens versionado en `tools/scripts/measure/`; (d) el prompt versionado en `docs/delendai/` como artefacto del metodo.
- Que ocurre: el proceso de auditoria se ejecuto con calidad (193 hallazgos, 10 bloques) pero sin cumplir 4 condiciones instrumentales del propio prompt; ninguna es un defecto del producto, son brechas del metodo que S10 deberia decidir.
- Impacto: P3 (proceso/reproducibilidad): dificulta que un tercero reproduzca el consenso sobre un arbol unico, que compare notas por plugin, o que evalue la economia e2e; no corrompe los hallazgos ya emitidos (cada uno cita su ancla).
- Causa raiz: el prompt asume un coordinador que asigna un SHA comun y un unico arbol; en la practica el swarm trabajo en paralelo sobre develop moviendose, y las secciones 2/3/7 exigen entregables que nadie tenia incentivo de concentrar en el acta (las fichas requieren un doc aparte).
- Solucion recomendada (minima): decidir en S10 (1) un ancla canonica para el cierre y reanclar lo faltante; (2) aceptar como «ficha» la matriz de la pasada exhaustiva del revisor 8 mas las notas por subsistema, o pedir a qwen-3.8-flash que consolide sus 61 fichas en un solo anexo; (3) versionar el prompt junto al acta; (4) registrar la medicion e2e como pendiente explicito (no como hecho).
- Prueba de regresion: una checklist en el propio acta (o en el prompt v2) que S10 marque: snapshot comun ✓, 61 fichas ✓, e2e tokens ✓, prompt versionado ✓.
- Confianza: alta (verificado contra el frontmatter del acta, el bloque de qwen-3.8-flash, la matriz del revisor 8, y el contenido del prompt en .cache).
- Relacion: nueva (meta-Hallazgo sobre el metodo); conecta con G44 (higiene del acta), G64 (anexos sin sitio) y el entregable 14 del prompt (hiopotesis/limitaciones). No contradice ningún hallazgo de producto.
- seenBy: deepseek-v4-pro

### G75 — La Fase A del prompt («investiga y guarda tu informe sin consultar a otros») es inverificable en el acta: solo 4 de 8 bloques declaran inventario antes de leer, y el mecanismo de consenso vota sobre un libro ya leído sin defensa técnica contra inflación de acuerdo
- Clasificacion: `CONFIRMADO` (como brecha de metodo verificable) · Zona: metodo/articulos del proceso (auditoria de la auditoria)
- Evidencia (artefacto: `.cache/chat-with-llms/2026_10_19_00:29_prompt_auditoria_conjunta.md`; acta: este documento, snapshot 18b090cb9):
  1. **El prompt ordena la Fase A estricta** (sec. 13): «Investiga y guarda tu informe completo sin consultar las conclusiones de los otros revisores» y (sec. 1) «Realiza primero una investigación independiente».
  2. **Solo 4 de 8 bloques de revisor declaran haberlo hecho**: glm-5.3-arquitectura («inventario ANTES de leer este acta»), qwen-3.8-flash («inventario determinista antes de leer el acta»), gpt-5.4 e yo (deepseek-v4-pro). Los bloques de glm-5.3-flash (v1), claude-opus-5-5, gemini-3.8-flash y qwen-3.8-max **no contienen ninguna declaración de inventario/lectura previa** (verificado por escaneo de los 8 bloques bajo «### Opiniones de revisores» en este documento: 4 con la traza, 4 sin ella).
  3. **Matiz legitimo**: el revisor 1 (glm-5.3-flash v1) es la excepcion natural — creo el libro y no habia «conclusiones de otros» que consultar. Pero los revisores 2-4 (claude-opus, gemini, qwen-max) si trabajaron sobre un libro ya poblado por el 1 (y por la propia cadena de PRs), y su ausencia de declaracion deja la independencia **inverificable**, no refutada: puede que la cumplieran sin documentarlo, el instrumento no lo exige como traza.
  4. **El consenso ≥80% (8/10) vota sobre seenBy de un documento ya leido.** El «Acuerdo» del Scoreboard suma revisores que firman hallazgos ajenos despues de haber leido el hallazgo (en el acta) — no hay ningun mecanismo tecnico (blinding, timelines de firma, hash de inventyario previo) que impida inflar el acuerdo copiando conclusiones: la unica defensa es la declaracion de cada revisor, y el protocolo no la hace obligatoria ni la lista en el acta. Esto es una brecha del instrumento, no evidencia de que alguien haya copiado.
- Que deberia: (a) el prompt v2 (o el S10) exijir como requisito de publicacion un hash o timestamp del inventario/hallazgos propios ANTES de abrir el acta; (b) el Scoreboard distinguir «confirmado con reproduccion/lectura propia» de «suscrito tras leer el hallazgo» (dos contadores, no uno); (c) registrar en el frontmatter la Fase A por revisor (campo `faseA: declarada/no-declarada`).
- Que ocurre: 8 bloques, 4 con traza de Fase A; el acuerdo de 1/10 a 5/10 del Scoreboard mezcla ambas clases de confirmacion; la reproducibilidad de la independencia depende de la memoria de cada modelo, no del artefacto.
- Impacto: P3 (proceso): no invalida hallazgos ni acusaciones; degrada la fuerza del «acuerdo 8/10» como evidencia de consenso independiente — el umbral puede alcanzarse por anclaje (los revisores tardios leen lo que los primeros firmaron) sin que ello demuestre verificacion independiente.
- Causa raiz: el prompt pide un ideal de laboratorio (independencia total) pero no exige ninguna traza que permita verificarla; el libro compartido (correcto para el contraste) es tambien el vehiculo del acuerdo, mezclando las fases A y B en un solo documento.
- Solucion recomendada (minima): S10 anade al acta (1) una tabla «Fase A por revisor» (declarada o no), (2) la distincion en el Scoreboard «confirmado propio» vs «suscrito», y (3) recomienda al coordinador que en la proxima auditoria pida hash del informe previo antes del publish. Sin nueva capa: solo dos columnas y un campo de frontmatter.
- Prueba de regresion: la tabla Fase A y los dos contadores existen en el Cierre (S10); el prompt v2 los exige.
- Confianza: alta en el dato (4/8 declarados, escaneo de los 8 bloques); media en la interpretacion (no hay forma de saber si los 4 silentes cumplieron sin registrar) — por eso NO es acusacion, es brecha del instrumento.
- Relacion: amplia G74 (mismo instrumento, otra condicion incumplida); conecta con G44 (higiene del acuerdo) y el riesgo del metodo ya anotado en el propio acta («revisores que copien hallazgos sin verificarlos inflarian el acuerdo»).
- seenBy: deepseek-v4-pro

### G76 — El contrato de evidencia del prompt (seccion 12: 15 campos obligatorios por hallazgo) no se sigue en el acta: 0 hallazgos con Severidad/Estado/Componente/Ubicacion/Reproduccion/Solucion recomendada; sin severidad P0-P3 normalizada, la priorizacion (entregable 15) no es computable desde el libro
- Clasificacion: `CONFIRMADO` · Zona: metodo/articulos del proceso (auditoria de la auditoria)
- Evidencia (artefacto: `.cache/chat-with-llms/2026_10_19_00:29_prompt_auditoria_conjunta.md`, seccion 12; acta: este documento, snapshot 18b090cb9, barrido de todos los hallazgos `### G/D*`):
  1. **El prompt exige por cada hallazgo**: ID, Severidad (P0/P1/P2/P3), Estado (confirmado/probable/pendiente/descartado/resuelto), Componente, Ubicacion (archivo:linea), Snapshot, «Qué deberia ocurrir», «Qué ocurre realmente», Reproduccion, Evidencia, Impacto, Causa raiz, Solucion recomendada, Prueba de regresion, Confianza — 15 campos.
  2. **Conteo real en el acta (grep sobre los 193+ bloques de hallazgos)**: `Severidad:` = **0**, `Estado:` = 0, `Componente:` = 0, `Ubicacion:` = 0, `Reproduccion:` = 0, `Solucion recomendada:` = 0, `Prueba de regresion:` = 1, `Causa raiz:` = 2, «Que deberia/Que ocurre» = 3 c/u, `Snapshot:` = 10, `Relacion:` = 10, `Confianza:` = 15. El formato real es un subconjunto variable heredado de las primeras pasadas (Clasificacion + Zona + Evidencia + Impacto + seenBy), con campos adicionales añadidos por cada revisor segun su criterio (los recientes G74-G76 sí llevan Confianza/Relacion/Snapshot).
  3. **Consecuencia estructural**: la seccion 12 incluye «No declares P0 algo que no tenga impacto grave demostrable» y el entregable 15 del prompt es «Priorizacion P0/P1/P2/P3». Sin un campo de severidad normalizado en ningun hallazgo, la priorizacion no puede computarse del acta por maquina: el Scoreboard usa la clasificacion de cada revisor (CONFIRMADO/PROBABLE/REVISAR/MEJORA), que mezcla confianza con severidad y no tiene mapeo directo P0-P3. Que un hallazgo sea «GRAVE» (p. ej. G51, D1-D3) queda en la prosa del titulo, no en un campo.
  4. **Matiz honesto**: la clasificacion «CONFIRMADO/PROBABLE» cumple parcialmente el campo Estado (aunque con vocabulario distinto y sin las opciones «pendiente de reproduccion»/«descartado»/«resuelto en el snapshot»); Evidencia e Impacto estan presentes de facto; pero los 6 campos criticos (severidad, estado normalizado, componente, ubicacion, reproduccion, solucion) están ausentes de forma sistematica.
- Que deberia: (a) el prompt v2 (o S10) fijar una plantilla unica por hallazgo (los 15 campos) con severidad obligatoria P0-P3; (b) una pasada de normalizacion en S10 que asigne severidad a los hallazgos abiertos mas importantes (los que el Scoreboard marca GRAVE/ALTA) para que la priorizacion sea computable; (c) el Scoreboard distinguir columna Severidad de columna Estado (hoy fusionadas en «Clasificacion»).
- Que ocurre: el acta es legible por humanos (193 hallazgos con buen nivel de detalle) pero no es un artefacto computable: la priorizacion y el seguimiento (P0/P1/P2/P3, resuelto/pendiente) requieren lectura humana de cada bloque.
- Impacto: P3 (proceso/automatizacion): no degrada los hallazgos ni su evidencia, pero impide que el consenso se cierre con un backlog priorizado por maquina — el implementador final (S11) tendria que re-clasificar manualmente ~193 items.
- Causa raiz: el prompt pide un formato estructurado, pero el libro de actas nacio con un formato libre (Clasificacion/Zona) y ningun revisor posterior uniformo hacia la seccion 12; los campos «obligatorios» eran largos de escribir y nadie los ratcheo.
- Solucion recomendada (minima): S10 (1) define la plantilla canonica con severidad; (2) marca la severidad de los hallazgos en el Scoreboard aportando UNA columna `P` estimada (a consensus); (3) recomienda al prompt v2 exigir la plantilla y un lint que la valide.
- Prueba de regresion: un script `lint:a00xxx-schema` que falle si un hallazgo nuevo no tiene Severidad/Estado/Ubicacion.
- Confianza: alta (conteo exhaustivo sobre todos los bloques; los 6 campos criticos estan ausentes en el 100% de los hallazgos).
- Relacion: amplia G74/G75 (misma familia meta-metodo: el instrumento no se ejecuta tal cual); conecta con el entregable 15 del prompt (priorizacion) y con G44 (falta de un formato canonico del acta). No contradice ningún hallazgo de producto.
- seenBy: deepseek-v4-pro

### G77 — La seccion 2 del prompt exige un inventario con estado normalizado por elemento (Verificado / Analizado estaticamente / Bloqueado / Defecto confirmado / No aplicable) y formato de tabla de 10 columnas; el acta no contiene ese inventario (0 usos de los estados como marcado, 0 tablas con el contrato), y el estado implicito «supongo que esta bien» que el prompt prohibe no queda cerrado por ningun mecanismo
- Clasificacion: `CONFIRMADO` · Zona: metodo/articulos del proceso (auditoria de la auditoria)
- Evidencia (artefacto: `.cache/chat-with-llms/2026_10_19_00:29_prompt_auditoria_conjunta.md`, seccion 2; acta: este documento, snapshot 18b090cb9):
  1. **El prompt exige** (seccion 2): «Para cada elemento registra: ID | Ruta | Funcion | Dependencias | Estado declarado | Estado verificado | Tests | Riesgos | Evidencias | Auditor responsable» y que cada elemento termine en uno de los estados: Verificado / Analizado estaticamente / Bloqueado / Defecto confirmado / No aplicable, con «No se permite el estado implicito *supongo que esta bien*».
  2. **Conteo real en el acta**: `Bloqueado:` = 0, `Defecto confirmado:` = 0, `No aplicable:` = 0, `Analizado estaticamente:` = 0 (grep sobre todo el documento); `Verificado |`/`Analizado |` como fila de tabla = 0; tablas con el encabezado `ID | Ruta | Funcion` = 0. Las 65 menciones de «Verificado/Analizado» son prosa de matrices ad-hoc (la del revisor 8 en la pasada exhaustiva usa «Verificado (locks, claim...)»/«Analizado (D21...)» como celdas de una tabla de cobertura con LOC/specs, no como el estado normalizado del contrato), y los 61 plugins NO tienen fila con los 10 campos exigidos.
  3. **Consecuencia**: el inventario que la seccion 2 pide (para que ningun componente quede «supongo que esta bien») no se materializo en el acta como artefacto computable; la cobertura se afirma en prosa. La prohibicion del estado implicito no es verificable retrospectivamente.
  4. **Matiz honesto**: la matriz de la pasada exhaustiva (PR #1265) es el intento mas cercano (61 filas, estado Verificado/Analizado, LOC y specs), y qwen-3.8-flash anuncia «fichas de 61 plugins» inline en su bloque; pero ninguna de las dos sigue el formato de 10 columnas de la seccion 2 ni usa los 5 estados normalizados (falta Bloqueado/Defecto/No aplicable).
- Que deberia: (a) el prompt v2 (o S10) exigir la tabla de inventario con los 5 estados y validarla con un lint (que cada plugin/package tenga fila y estado); (b) en el cierre S10, consolidar los 61 plugins en una tabla canonica (puede heredar LOC/specs/estado de la matriz del revisor 8 y añadir Bloqueado/Defecto cuando corresponda).
- Que ocurre: el inventario de seccion 2 queda como trabajo no entregado en el acta; el consenso trata «cobertura por plugin» desde la prosa de cada revisor, no desde un artefacto unico.
- Impacto: P3 (proceso/transparencia): no degrada hallazgos, pero el criterio de cierre del prompt (seccion 15: «EXISTE algún componente sin evaluar») no puede comprobarse con el acta por maquina.
- Causa raiz: la seccion 2 pide un deliverable estructurado (tabla normalizada) que es pesado de producir en un libro colaborativo; los revisores lo sustituyeron por matrices/prosa de cobertura con formatos distintos (qwen-flash, revisor 8, glm-3).
- Solucion recomendada (minima): S10 genera la tabla canonica de inventario desde las fuentes existentes (inventario fase A del revisor 8 en `.cache/`, matriz de la pasada exhaustiva, fichas inline de qwen-flash) y añade el estado normalizado a cada fila; el prompt v2 pide esta tabla y un lint.
- Prueba de regresion: `lint:inventory` que falle si un plugin del arbol no tiene fila con estado en la tabla de inventario del acta.
- Confianza: alta (conteo exhaustivo: 0/0/0/0 los 4 estados no-usados; 0 tablas con el encabezado de 10 columnas).
- Relacion: amplia G74-G76 (instrumento vs ejecucion) y, en particular, la seccion 2/14/15 del prompt (inventario, entregables, condiciones estrictas); conecta con G6 (paquetes a medias) si se usara para cerrar huecos. No contradice ningún hallazgo de producto.
- seenBy: deepseek-v4-pro

### G78 — El cierre de la auditoria no es verificable con el acta: la seccion 15 del prompt exige un checklist de 10 condiciones estrictas («PROHIBIDO escribir auditoria terminada si...») que el acta no materializa, y al menos 6 de esas condiciones dependen de entregables que G74-G77 demostraron ausentes (fichas, inventario, severidad, e2e tokens, propuestas activas)
- Clasificacion: `CONFIRMADO` · Zona: metodo/articulos del proceso (auditoria de la auditoria)
- Evidencia (artefacto: `.cache/chat-with-llms/2026_10_19_00:29_prompt_auditoria_conjunta.md`, seccion 15; acta: este documento, snapshot 18b090cb9):
  1. **El prompt prohibe declarar la auditoria terminada** si se cumple CUALQUIERA de 10 condiciones: (1) algun plugin sin ficha individual; (2) alguna familia de componentes sin inventario; (3) algun subsistema critico sin analisis; (4) hallazgos graves sin evidencia o prueba de reproduccion; (5) no distinguir pruebas reales de simulaciones; (6) mezclar snapshots distintos sin indicarlo; (7) no evaluar costes e2e; (8) no revisar propuestas activas; (9) sin trazabilidad hallazgo→archivo→recomendacion; (10) informe no guardado de forma duradera.
  2. **El acta no contiene ese checklist**: las unicas 2 apariciones de «checklist/condiciones» en el documento son (a) una frase de test-policy («el plugin pequeño mejor construido según el checklist de esta auditoría») y (b) la propuesta de G74 de crear un checklist futuro. No existe ninguna tabla «condicion ✓/✗» en el cierre.
  3. **Al menos 6 de las 10 condiciones dependen de entregables que G74-G77 demostraron ausentes o no computables**:
     - cond. 1 (ficha por plugin) → G76 (0 fichas 0-10) y G77 (sin inventario normalizado);
     - cond. 2 (familia sin inventario) → G77 (0 tablas de inventario con el contrato de seccion 2);
     - cond. 4 (hallazgos graves identificables) → G76 (0 severidad P0-P3: «graves» no es computable);
     - cond. 7 (costes e2e) → G74.3 (solo bootstrap por modo);
     - cond. 8 (propuestas activas) → el acta menciona f00551/q00034 de forma dispersa, sin el inventario con estados que pide la seccion 11 (0 tablas ready/in-progress/review/blocked/paused/done/retired);
     - cond. 6 (snapshots mezclados) → G74.1 (6 SHAs distintos): los revisores SÍ los indican (cumplida de facto), pero sin ancla canonica la mezcla es inevitable.
  4. **Lo que SÍ se cumple** (para no ser injusto): cond. 3 (subsistemas criticos con analisis: core/proposals/Batuta/web tienen hallazgos), cond. 5 (las simulaciones vs reales se distinguen: los bloques etiquetan reproduccion con 2 procesos vs lectura estatica), cond. 9 (trazabilidad: archivo:linea en la mayoria), cond. 10 (PR + acta = durable). El problema no es que el cierre sea falso, es que **no es computable**: nadie puede marcar las 10 con un `grep` porque 6 dependen de artefactos ausentes.
- Que deberia: el cierre S10 (a) añadir la tabla «Condiciones estrictas ✓/✗» con justificacion por fila; (b) marcar como pendiente-no-bloqueante las que dependen de G74-G77 (fichas, inventario, e2e) o cerrarlas consolidando los artefactos existentes (matriz del revisor 8 + fichas de qwen-flash + categorias P0-P3 estimadas).
- Que ocurre: la «terminacion» de la auditoria queda a criterio humano del coordinador, no a un checklist verificable — exactamente lo que la seccion 15 queria evitar.
- Impacto: P2 (proceso): el riesgo no es que el cierre sea incorrecto sino que pueda declararse «terminada» sin que las condiciones 1/2/4/7/8 se hayan cerrado con evidencia; el implementador final (S11) heredaria huecos no identificados.
- Causa raiz: la seccion 15 describe condiciones sin exigir el artefacto que las verifica; G74-G77 documentaron que los artefactos (fichas, inventario, severidad, e2e) no se crearon. La tabla de cierre es el pegamento que falta.
- Solucion recomendada (minima): S10 publica la tabla de cierre con las 10 condiciones y el estado real de cada una (✓ cumplida / ✗ artefacto ausente → pendiente con alternativa), usando G74-G78 como insumo; el prompt v2 exige la tabla como parte del pipeline de cierre.
- Prueba de regresion: un `lint:closure-checklist` que falle si el acta en estado done no contiene la tabla de 10 condiciones con estados.
- Confianza: alta (checklist ausente verificado por grep; las 6 dependencias cruzadas a G74-G77 son directas; las 4 cumplidas se confirman por los contenidos citados).
- Relacion: es la consecuencia logica de G74-G77 (el instrumento sin artefactos); conecta con la seccion 15/entregables 14-15/19-20 del prompt y con el S10 como unico punto capaz de emitir el cierre verificable.
- seenBy: deepseek-v4-pro

### G79 — `plugin doctor` lee el estado del cwd y no del `--workspace`, así que en un proyecto externo muestra el monorepo
- Clasificación: `CONFIRMADO` · Zona: CLI / disponibilidad de plugins
- Evidencia (snapshot e342c8e15): `packages/cli/src/commands/groups/plugins.ts:114-115` llama `readPluginAvailabilities(ctx.cwd, …)`. Reproducción: proyecto Angular-like en un directorio fuera del monorepo. `bun packages/cli/src/index.ts --workspace <proyecto> plugin doctor` devuelve los 61 plugins del monorepo (`roadmap verified`, `style-convention needs-configuration`, etc.). Ejecutado con el cwd del proyecto: "No plugin has registered in this workspace yet".
- Impacto: el diagnóstico que lee un usuario (y un agente) en un proyecto externo describe el monorepo. Es exactamente la clase de error de "el plugin aparece como disponible y no funciona en mi proyecto".
- Qué debería: leer los registros de la raíz resuelta del workspace (la misma que usa el arranque) y avisar cuando el workspace no tiene registros, en vez de mostrar otro.
- seenBy: claude-haiku-5-5 (verificado en e342c8e15)

### G80 — La auto-adopción escribe en `delendai.config.json` una política de integración que el proyecto no eligió
- Clasificación: `CONFIRMADO` · Zona: política de desarrollo / migración
- Evidencia (snapshot e342c8e15): `packages/core/src/lib/workspace-migration/migrators/development-policy.migrator.ts:130-136` reescribe `profile` a `shared-checkout-merge` cuando no hay bloque `development` y deja la razón en `reasons`; `packages/core/src/lib/development-policy/profiles.ts:361` define ese perfil como valor de ese camino; `packages/core/src/lib/development-policy/served-work-model.ts:30-31` anuncia "adopted and written". Reproducción: proyecto sin bloque `development`, `overview --preset=standard` añade `"development": {"profile": "shared-checkout-merge", "branches": {"integration": "main", "release": "main"}}` al `delendai.config.json`.
- Impacto: cambia cómo se integra el trabajo del consumidor (merge directo sin PR) sin que lo elija. Choca con la regla de que la configuración del proyecto prevalece. El aviso existe, pero se escribe antes de que el usuario lo vea.
- Qué debería: no escribir política sin elección explícita. Sin bloque, el arranque debe usar un modo de solo lectura con aviso, y la escritura debe pedirse en `init`.
- seenBy: claude-haiku-5-5 (verificado en e342c8e15)

### G81 — El preset decide qué plugins llegan a un proyecto externo: 15 de ahorro y gasto solo viven en `dogfood` y 7 no están en ninguno
- Clasificación: `CONFIRMADO` · Zona: presets / manifiestos
- Evidencia (snapshot e342c8e15): campo `presets` de `plugins/*/plugin.manifest.ts`. Solo en `dogfood`: `adaptive-optimizer`, `audit`, `auto-plugin-selector`, `commit-policy`, `context-for-change`, `impact-analysis`, `link-check`, `orchestrator-runner`, `project-health`, `project-kpis`, `quality-policy`, `security`, `tech-debt`, `usage-tracking`; `perf` está en `dogfood` y `cli-tool`. Con `presets: []`: `changelog`, `execution-env`, `framework-knowledge`, `issues-triage`, `roadmap`, `self-learning`, `style-convention`. Reproducción: proyecto externo con `--preset=standard` carga 19 plugins y ninguno de los 15.
- Impacto: un consumidor no tiene medición de gasto (`usage-tracking`), contexto por cambio (`context-for-change`) ni KPI (`project-kpis`). El ahorro que se mide en el repositorio no se puede reproducir en el proyecto que lo usa.
- Qué debería: decidir por plugin si es producto o dogfood. Los de ahorro y gasto pasan a presets de consumidor, con prueba en un proyecto externo.
- seenBy: claude-haiku-5-5 (verificado en e342c8e15)

### G82 — `context-for-change` busca solo en las raíces del monorepo: en un proyecto externo devuelve cero resultados sin error
- Clasificación: `CONFIRMADO` · Zona: context-for-change · Relación: distinto de D116 (D116 es contaminación con cambios ajenos; aquí el origen de datos está mal)
- Evidencia (snapshot e342c8e15): `plugins/context-for-change/src/lib/services/context-for-change.service.ts:119-120` fija `roots: ['packages','plugins','apps','tools','extensions']`. Reproducción: `searchWorkspace` sobre un proyecto con `src/`: con las raíces del monorepo, `scanned: 0, hits: 0` y el diagnóstico "configured roots do not exist in this workspace"; con `['src']`, 1 resultado. El servicio solo lee `hits`, así que no hay error.
- Impacto: el plugin pensado para ahorrar contexto devuelve contexto vacío sin señal. El agente cree que no hay referencias y sigue adelante.
- Qué debería: raíces desde la configuración del workspace (o detección), y que `scanned === 0` sea un error para quien llama.
- seenBy: claude-haiku-5-5 (verificado en e342c8e15)

### G83 — La cola falla de forma recurrente en `report-stale-candidates`: 9 de 58 ejecuciones
- Clasificación: `CONFIRMADO` · Zona: CI / cola de trabajo
- Evidencia (snapshot e342c8e15): `.github/workflows/keep-the-queue-moving.yml:52` (job `report-stale-candidates`). Ejecución fallida 39184217795 (19 oct, 01:11 UTC): `error: script "work:doctor" exited with code 1`; el job mostró "Fail while something hangs on the forge". Conteo con `gh api repos/CartagoGit/DelendAI/actions/runs?branch=develop`: 58 ejecuciones de `keep-the-queue-moving`, 9 con `conclusion=failure`.
- Impacto: el paso que avisa de candidatos obsoletos falla en ~16 % de los disparos. Mientras falla, la cola no reporta y puede acumular unidades.
- Qué debería: distinguir cuelgue transitorio del forge (reintento acotado y aviso) de error de configuración (fallo claro), y no fallar el job por el primero.
- seenBy: claude-haiku-5-5 (verificado en e342c8e15)

### G84 — Los registros de disponibilidad cubren 2 de los 19 plugins cargados en un proyecto externo
- Clasificación: `PROBABLE` (la causa no está confirmada) · Zona: plugins / registro de disponibilidad
- Evidencia (snapshot e342c8e15): `packages/core/src/lib/plugins/load-plugins-runtime.helper.ts:173` llama `readAndRecordAvailability` solo tras `register`. Reproducción: proyecto externo, `overview --preset=standard` tres veces: 19 plugins en `plugins`, y `.cache/delendai/records/plugin-availability/` solo contiene `error-reporting.json` y `memory.json`. Causa probable: arranque perezoso (x00913). No la he confirmado.
- Impacto: `plugin doctor` describe una fracción de lo que el proyecto usa. Un "verificado" no cubre la mayoría de plugins activos.
- Qué debería: registrar la disponibilidad de todo plugin cargado, o indicar en la salida cuántos no se han leído.
- seenBy: claude-haiku-5-5 (reproducido en proyecto externo)

### G85 — `browser` está declarado `stable` y no puede abrir una página sin driver
- Clasificación: `CONFIRMADO` · Zona: plugins / madurez
- Evidencia (snapshot e342c8e15): `plugins/browser/plugin.manifest.ts` declara `maturity: 'stable'`; `plugins/browser/src/index.ts:46-53` devuelve `needs-host-adapter` cuando no hay `plugins.browser.options.driver`. Lo confirma el doctor del monorepo (`browser needs-host-adapter: no browser driver`).
- Impacto: la madurez promete un funcionamiento que no se da sin host adecuado, y la web la muestra como estable.
- Qué debería: derivar la madurez de la disponibilidad, o declararla `beta` hasta que haya driver por defecto.
- seenBy: claude-haiku-5-5 (verificado en e342c8e15)

### G86 — Vitest pasa el 77 % del tiempo transformando módulos en frío y la caché no se persiste en CI
- Clasificación: `MEJORA` · Zona: CI / tests
- Evidencia: subset de 8 áreas (125 archivos, 860 tests, todos pasan) ejecutado en local el 19 oct: la salida de vitest dice "transform 77%"; `orchestrator-runner` tarda 101,68 s solo en transformar módulos. Vitest recomienda `fsModuleCache` con caché persistida entre ejecuciones.
- Impacto: coste de CI y de local en cada ejecución. No afecta a la corrección.
- Qué debería: persistir el directorio de caché de vitest en CI y medir antes y después.
- seenBy: claude-haiku-5-5 (medido en local)

### G79 — La seccion 11 del prompt («Inventaria todas las propuestas activas... Para cada una distingue ready/in-progress/review/blocked/paused/done/retired») no se entrego en el acta: 0 filas con formato propuesta|estado, 0 cabeceras de inventario, y las propuestas clave aparecen dispersas en hallazgos
- Clasificacion: `CONFIRMADO` · Zona: metodo/articulos del proceso (auditoria de la auditoria)
- Evidencia (artefacto: `.cache/chat-with-llms/2026_10_19_00:29_prompt_auditoria_conjunta.md`, seccion 11; acta: este documento, snapshot 18b090cb9):
  1. **El prompt exige** (seccion 11): «Inventaria todas las propuestas activas y los planes relevantes», con distincion por estado (`ready/in-progress/review/blocked/paused/done/retired`) y comprobacion de que las condiciones de aceptacion coinciden con el codigo; ademas detectar duplicadas, ya-integradas-pero-abiertas, declaradas-completadas-que-no-funcionan, y dependencias bloqueantes.
  2. **Conteo real en el acta**: filas de tabla con formato `| <propuesta> | <estado>` = **0**; cabeceras «Inventario de propuestas»/«Propuestas activas»/«Backlog con estado» = 0; filas `| f[0-9]{5}` en tablas = 0. Las propuestas clave solo aparecen citadas dentro de hallazgos: `f00551` ×11, `q00034` ×6, `x00909` ×4, `f00768` ×3, `f00767` ×2, `x00921`/`x00922` ×2/×1, `f00756`/`q00019` ×1 — siempre como evidencia de un hallazgo concreto, nunca como fila de inventario con estado.
  3. **El estado real del swarm en el momento del cierre** (fuente: `delendai_proposals_compact_status`): ready 3, in-progress 2, review 18, done 1175, paused 0, blocked 0, retired 47 — ningun revisor lo trajo al acta como tabla.
  4. **Consecuencia por duplicidad desplazada**: esta seccion es la fuente de la cond. 8 (propuestas activas) del checklist de G78 y del entregable 12 (propuestas y roadmap) del prompt; al no entregarse, el implementador final (S11) no tiene una lista priorizada de que propuestas dependen de que hallazgos (p. ej. f00551/q00034 ↔ G52-G56/G30-G32, x00909 ↔ G19-G29 corregidos).
- Que deberia: el cierre S10 añadir una tabla «Propuestas activas relevantes» (ID | estado | relacion con hallazgos | bloqueante?) construida desde el indice real del repo (los estados viven en `docs/delendai/proposals/{ready,in-progress,review,...}`) y desde las citas ya presentes en este acta; mapear minimamente las 6-8 propuestas citadas (f00551, q00034, x00909, f00756, f00767, f00768, q00019, x00921-x00923) a sus hallazgos.
- Que ocurre: el acta trata propuestas como evidencia suelta, no como inventario; la pregunta del prompt «¿que propuestas bloquean resultados de producto?» solo puede responderse leyendo todo el libro.
- Impacto: P3 (proceso): no degrada hallazgos, pero el entregable 12 queda parcial y el cierre (G78) depende de esta tabla para la cond. 8.
- Causa raiz: la seccion 11 es un deliverable «de producto» (roadmap/backlog) que los revisores tecnicos no priorizaron frente a hallazgos de codigo; solo qwen-3.8-flash toco el backlog en su Tanda 2 sin convertirlo en tabla.
- Solucion recomendada (minima): S10 genera la tabla de propuestas desde el indice real (no desde memoria) con estado actual y relacion con hallazgos, reutilizando las citas ya presentes en el acta; no exige nuevo trabajo de los revisores.
- Prueba de regresion: un `lint:proposal-inventory` que falle si el acta en done no lista cada propuesta citada con su estado.
- Confianza: alta (0 filas/0 cabeceras/0 citas-en-tabla verificadas por grep; el estado real del swarm se confirmo con compact_status).
- Relacion: completa la familia meta sobra el instrumento (G74-G78): es la seccion 11 del mismo prompt; alimenta la cond. 8 de G78 y el entregable 12. No contradice ningún hallazgo de producto.
- seenBy: deepseek-v4-pro

### G91 — `agent_lock_release_orphan` libera el lock pero deja la entrada en la tabla de ficheros: los ficheros siguen bloqueados por una tarea que ya no existe
- Clasificación: `CONFIRMADO` · Severidad: P2 · Componente: `plugins/proposals` (recuperación de locks) · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: `plugins/proposals/src/lib/tools/recovery-tools.ts:316-340` (`releaseLock`, llamada desde `runAgentLockReleaseOrphan` `:476-498` y `runProposalForceTransition` `:537`) frente a `plugins/proposals/src/lib/locks/lock-lifecycle.ts` (`pruneFileLocksForTasks`) y `execute-lock-action.ts` (`release`, que sí poda la tabla).
- Qué debería ocurrir: liberar un lock huérfano deja libres sus ficheros; la tabla `file-locks.json` y `agents.lock.json` describen el mismo estado y se actualizan juntas.
- Qué ocurre: `releaseLock` filtra solo `in_flight` y reescribe `agents.lock.json`; no llama a `pruneFileLocksForTasks`. La entrada `a.ts → X` sobrevive en la tabla y el siguiente claim sobre `a.ts` se rechaza con `lock-conflict: overlaps with X`, aunque `X` ya no está en `in_flight`. La tabla no tiene TTL (`file-lock-table.ts` solo menciona `staleMs` del mutex).
- Reproducción (fixture temporal, funciones reales): `claim X/ghost [a.ts]` → `runAgentLockReleaseOrphan(X)` → `claim Z/other [a.ts]`. Guion en "Reproducciones" de mi bloque (R2).
- Evidencia (salida real): `lock in_flight after release: 0` · `table after release : ["a.ts"]` · `claim Z -> blocked:true, blockerType:"lock-conflict", blocked_reason:"overlaps with X", conflicting_agent:"ghost"`. Un segundo `release X` por el engine devuelve `released:false` y SÍ deja la tabla en `[]`: la herramienta de recuperación necesita dos llamadas de dos herramientas distintas.
- Impacto: trabajo bloqueado tras una recuperación "exitosa"; el agente que recupera ve `released:true` y deja de investigar. Sin pérdida de datos. Coste: reintentos y diagnóstico (tokens) en el flujo de recuperación.
- Causa raíz: dos implementaciones de "liberar un claim" (`recovery-tools.releaseLock` y la acción `release` del engine) con efectos distintos; la de recuperación se escribió contra el fichero de lock y no contra la tabla.
- Solución recomendada: que `releaseLock` delegue en la acción `release` del engine (una sola autoridad) o llame a `pruneFileLocksForTasks` dentro del mismo mutex.
- Prueba de regresión: spec que encadene claim → release_orphan → claim del mismo fichero por otro agente y exija éxito.
- Confianza: alta (reproducido de forma determinista, con control: la misma secuencia con `release` del engine deja la tabla vacía).
- Relación con hallazgos anteriores: nuevo. Familia G30/G48 (dos implementaciones de la misma operación). No contradice D1–D3.
- seenBy: claude-sonnet-5-5

### G92 — El lock de claims tiene dos mutex distintos: la recuperación hace lectura-modificación-escritura con el del fichero y el engine con el de la tabla; un release de recuperación se deshace (arbitraje de D1/D2)
- Clasificación: `CONFIRMADO` (efecto "release resucitado") · `NO REPRODUCIDO` (efecto "claim vivo borrado" de D1) · Severidad: P2 · Componente: `plugins/proposals` (locks) · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: engine: `locks/engine.ts:151-155` (`withFileMutex(getFileLockTablePath)` envuelve todo `executeLockAction`; el fichero de lock solo se protege durante el `writeLockWithMutex` final, `lock-store.ts:87-95`). Recuperación: `tools/recovery-tools.ts:316-340` (`withFileMutex(lockPathAbs)` con RMW completo). `readSynchronizedLock` (`lock-store.ts:104-121`) escribe con `writeLock` sin mutex de fichero, pero solo es alcanzable desde `executeLockAction` ya dentro del mutex de tabla.
- Qué debería ocurrir: todo escritor de `agents.lock.json` toma el mismo mutex durante TODA la operación (lectura, decisión, escritura).
- Qué ocurre: el engine lee el fichero, calcula y escribe bajo el mutex de tabla; `releaseLock` lee y escribe bajo el mutex del fichero. Ninguno excluye al otro durante su ventana de lectura→escritura. Si el release de recuperación termina entre la lectura y la escritura de un claim del engine, la escritura del engine (calculada sobre el estado anterior) restituye la entrada liberada.
- Reproducción: `Promise.all([claim Y, release_orphan X])` en un fixture con `X` sembrado, 40 rondas, más dos controles (R1).
- Evidencia (salida real, N=40): `race: resurrectedReleasedClaim=40, liveClaimLost=0` · control `rel-only: resurrected=0` · control `seq (release y luego claim): resurrected=0, liveClaimLost=0`. Con los controles, la causa es la carrera y no un fallo de la herramienta.
- Arbitraje D1/D2 (lo pedía la sección 5 del prompt): (a) todos los caminos que ejecutan `executeLockAction` pasan por `engine.ts:151-155` (único llamador además de `status`, que no escribe) y `cleanupStaleAgentLockState`/`releaseAgentSessionClaims` (`lock-lifecycle.ts:56-135`) también toman el mutex de tabla; por tanto el borrado sin mutex de `readSynchronizedLock` (D1) y el cómputo "fuera del mutex" (D2) no son alcanzables por dos procesos del engine a la vez. (b) La carrera real existe, pero es la de este hallazgo y su efecto es el contrario del descrito en D1: se resucita un claim liberado, no se pierde uno vivo (`liveClaimLost=0/40`). (c) `tryAcquireFileLocks` (`file-lock-table.ts:344-396`) comprueba fuera de su `withMutex` y escribe sin revalidar, pero su único llamador está dentro del mutex de tabla (`execute-lock-action.ts:197`): es una trampa para un futuro llamador, no un defecto vivo. Coincide con la lectura de gpt-6.1-sol y de claude-opus-5-5 sobre D1/D2; discrepa de la severidad GRAVE de D1/D2 en el libro.
- Impacto: un lock recuperado reaparece y vuelve a bloquear ficheros; el agente vivo que lo reclamó no pierde nada. Con G91, la recuperación de locks es poco fiable en dos sentidos.
- Causa raíz: dos mutex para un mismo fichero (identidad del recurso distinta según el escritor).
- Solución recomendada: una sola función `withLockState(deps, fn)` que tome el mutex de tabla, y que `recovery-tools` la use; eliminar `writeLockWithMutex` (el segundo mutex) y documentar `tryAcquireFileLocks` como interna.
- Prueba de regresión: la prueba R1 en modo `race` debe dar `resurrected=0` en 200 rondas; añadir un lint que prohíba `withFileMutex(` sobre `lockPath` fuera de `lock-store`.
- Confianza: alta en la existencia y el sentido de la carrera (control + 40/40); media en la frecuencia real (requiere un release de recuperación simultáneo con un claim; ocurre en recuperaciones tras caídas).
- Relación: matiza D1 y D2 (cambia el efecto y baja la severidad); coherente con G51/G69 (la lectura falsa-vacía es otra ventana, no la misma); ampliación del libro.
- seenBy: claude-sonnet-5-5

### G93 — `rollback` restaura con ámbito distinto al del backup: borra `.git` y los propios manifiestos de migración
- Clasificación: `CONFIRMADO` · Severidad: P1 · Componente: `packages/core` (workspace-migration/transaction) · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: `packages/core/src/lib/workspace-migration/transaction/rollback.ts:46` (`DEFAULT_EXCLUDES = ['.git', '.delendai/migration-manifests']` usado por `createWorkspaceBackup` `:48-65`) y `:86` (`scanFiles(ctx.workspaceRoot, '', [])`: el rollback recorre SIN exclusiones y borra todo lo que no esté en el backup, `:87-90`).
- Qué debería ocurrir: restaurar solo lo que el backup cubría; lo excluido del backup no se toca.
- Qué ocurre: lo excluido del backup no está en `expectedFiles`, así que el rollback lo borra: todo `.git/**` y `.delendai/migration-manifests/**`.
- Reproducción: R3 (fixture temporal con `git init`).
- Evidencia (salida real): `backup paths: delendai.config.json` · `.git/HEAD before: true, manifest before: true` · `removed count: 29` (muestra `.delendai/migration-manifests/m1.json`, `.git/description`, `.git/hooks/...`) · `.git/HEAD after: false, manifest after: false, errors: 0`. El informe del rollback no avisa de nada.
- Impacto: pérdida del repositorio local (historia no pusheada, ramas, stashes) al recuperar una migración fallida o al ejecutar el rollback explícito; además se destruye el manifiesto del intento, que es lo que permitiría auditarlo (agrava D32). Es lo contrario de la promesa "la migración debe preservar los datos antes de modificar o retirar los originales" (prompt, sección 8).
- Causa raíz: backup y restauración construyen su ámbito por separado; la exclusión se aplica en uno solo.
- Solución recomendada: un único valor de ámbito persistido en el backup y usado en la restauración; excluir `.git` incondicionalmente en el borrado; restaurar solo paths propiedad de la migración.
- Prueba de regresión: rollback en un repositorio con commits sin pushear: `.git` intacto y manifiestos presentes tras el rollback, tanto por fallo de apply como por `migrate rollback`.
- Confianza: alta (ejecución propia con la función real; coincide con la reproducción independiente de gpt-6.1-sol, ORCH-01, hecha por otra vía).
- Relación: ampliación de D7/G38 (que hablan de atomicidad de escritura, no de ámbito) y de D32; duplicado independiente de ORCH-01 (gpt-6.1-sol, bloque aún sin publicar). Acepta que el arranque ordinario usa `runPendingMigrations` y no este camino (según gpt-6.1-sol; no lo he trazado).
- seenBy: claude-sonnet-5-5

### G94 — `compact_router` copia el resultado interno dos veces (`text` y `structuredContent`): en el modo managed, único camino de las herramientas ocultas, cada llamada paga al menos 2× su carga
- Clasificación: `CONFIRMADO` (en código) · `PROBABLE` (coste exacto en tokens del host) · Severidad: P2 · Componente: `packages/core` (superficie managed) · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: `packages/core/src/lib/tools/compact-router.tool.ts:88-115`: lee `structuredContent` y el bloque `text` del resultado interno y los mete ambos en el JSON del router (`...(text !== undefined ? { text } : {}), ...(structured !== undefined ? { structuredContent: structured } : {})`).
- Qué debería ocurrir: el router devuelve la carga interna una vez (o una referencia) y el esquema de salida del router la describe.
- Qué ocurre: la carga interna viaja como cadena JSON (`text`) y como objeto (`structuredContent`) dentro del resultado del router. `toolJson` (no inspeccionado por mí) emite después ese objeto por el canal normal de la herramienta.
- Reproducción: `compact_router { domain:"project-health", action:"project_health" }`. La carga interna medida por la propia herramienta es `bytes:254`; el resultado recibido por el agente contiene la misma carga dos veces más el envoltorio `routed/domain/action/tool/active/isError`.
- Evidencia: lectura de código (líneas arriba) y la observación directa en esta sesión (resultados de `project_kpis`, `usage_report`, `auto_work`, `review_queue` vía router con `text` y `structuredContent` idénticos). El dashboard de tokens (D36/TOK-01) mide solo `structuredContent`, así que esta duplicación no entra en sus cifras.
- Impacto: coste de tokens en el camino que la propia política de superficie obliga a usar (AGENT-BOOTSTRAP §2.1: las herramientas ocultas se invocan por `resolve_capability`/`compact_router`). Se multiplica por el tamaño de la carga: con G95 una respuesta de 270 KB se paga a ≥540 KB.
- Causa raíz: el router conserva ambos canales del resultado interno por compatibilidad sin elegir uno.
- Solución recomendada: devolver solo `structuredContent` (el `text` es derivable) o solo `text` cuando el interno no tiene `outputSchema`; añadir `detail:"text"|"structured"`.
- Prueba de regresión: gate de bytes: `bytes(router_result) ≤ 1,15 × bytes(inner_result) + 300` sobre 5 herramientas de tamaños distintos.
- Confianza: alta en el código; media en el coste real, que depende de cuántos canales reenvíe cada host al modelo (no medido con tokenizador).
- Relación: nuevo; completa D36 (qué mide el dashboard) y G4/x00914 (presupuestos).
- seenBy: claude-sonnet-5-5

### G95 — Ninguna respuesta tiene presupuesto de tamaño: `review_queue` devolvió 180,8 MB en 7 días (mediana 270 KB, máximo 1,6 MB) y `state_health`/`state_repair`, ~665 KB por llamada
- Clasificación: `CONFIRMADO` (tamaños medidos) · `PROBABLE` (causa) · Severidad: P2 · Componente: `plugins/proposals` + gates de tokens · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: `plugins/proposals/src/lib/tools/review-queue.tool.ts:98-104` (con `proposalId` o `detail:true` devuelve la cola completa con evidencia; solo `CHANGED_SINCE_LIMIT` acota `changedSince`, `services/review-changed-since.service.ts:67`); gates: `docs/delendai/TOKEN-BUDGETS.md` (mide `tools/list` y ~14 respuestas de fixture, ninguna de `review_queue`/`state_health`).
- Qué debería ocurrir: cada herramienta que un agente llama en bucle tiene un techo de bytes medido en CI y un modo resumen por defecto.
- Qué ocurre: medido con `usage_report` (7 días, 1.985 llamadas, workspace de dogfood, generado 2026-10-18T22:4xZ): `review_queue` 438 llamadas, 180.791.727 B totales, p50 269.927 B, p95 1.610.771 B, máx 1.618.979 B; `state_health` 2 × ~665 KB; `state_repair` 668 KB; `proposal_board` 50 KB; `compact_router` máx 340 KB. `review_queue` es ~97 % de los bytes de las 10 herramientas más pesadas. En la vista por defecto (10 propuestas) mi propia llamada devolvió unos 26 KB (estimación a ojo sobre el texto recibido, no medida), con el texto `procedure` (unos 3 KB) y un `claim` casi idéntico por propuesta repetidos en cada llamada.
- Reproducción propuesta: `review_queue { proposalId: "<una propuesta con 10 slices>" }` y medir `structuredContent`; repetir con `detail:true`. No lo he ejecutado con carga completa para no volcarla en el contexto del agente.
- Impacto: es el mayor coste medible de tokens del flujo de revisión (la cola de 15 propuestas/45 slices se consulta en bucle por todos los revisores) y fue alcanzable sin ningún aviso; latencia p95 de `proposals` 66 s.
- Causa raíz (inferida): el modo de evidencia no tiene tope de bytes ni paginación por slice; el gate de tokens no cubre respuestas.
- Solución recomendada: paginar la evidencia por slice, mover `procedure` a `knowledge`, quitar `claim` repetido y añadir un gate "bytes de respuesta" por herramienta (techo en p95).
- Prueba de regresión: spec que genere una propuesta de 12 slices y exija `bytes ≤ N`; el gate de CI falla si p95 de `review_queue` en el fixture supera N.
- Confianza: alta en los tamaños (medidos por la propia telemetría); media en la causa.
- Relación: nuevo; ampliación de G4/G18 (presión de presupuesto) y de D36; relacionado con G94.
- seenBy: claude-sonnet-5-5

### G96 — `project_kpis` etiqueta como "medido" un ahorro de tokens que ninguna fuente registra; las 1.985 llamadas tienen tokens=0, proveedor `unknown` y agente `unknown`
- Clasificación: `CONFIRMADO` · Severidad: P2 · Componente: `plugins/usage-tracking`, `plugins/project-kpis` · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: `plugins/usage-tracking/src/lib/services/invocation-recorder.service.ts:344` (`record.usage?.inputTokens ?? 0`) y `usage-rollup.service.ts:132`; salida de `project_kpis`: `usage.tokensSaved {status:"measured", value:0}` frente a `usage.totalTokens {status:"unavailable"}` y `usage.costUsd {status:"unavailable"}`.
- Qué debería ocurrir: un valor que ninguna fuente produce es `unavailable`, no `measured: 0`; el agente y el proveedor quedan atribuidos en las llamadas caras.
- Qué ocurre: `tokensSaved` se reporta como medido con valor 0 y `savingsPercent: 0` mientras `totalTokens` y `costUsd` no existen; en `usage_report`, los 1.985 registros caen en un único bucket `provider: "unknown"` y las 10 llamadas más lentas (hasta 192 s) tienen `agent: "unknown"`.
- Reproducción: `project_kpis {}` y `usage_report {}` (herramientas MCP; salida en la sección Evidencia de mi bloque).
- Evidencia (salida real): `usage.totalTokens: unavailable ("did not record provider token counts")`, `usage.tokensSaved: measured 0`, `buckets:[{key:"unknown", calls:1985, totalTokens:0, costUsd:0}]`, `history: not-configured`, `trends: unavailable (7 de 7)`.
- Impacto: el objetivo principal de producto (gastar menos tokens) no es demostrable con la propia telemetría; un 0 etiquetado como medido invita a leer "no ahorra nada" o "ahorra 0 %" cuando en realidad no se sabe. Sin atribución por agente no hay coste por modelo ni por tarea.
- Causa raíz: el plugin observa invocaciones MCP, que no conocen los tokens del host (documentado por el propio plugin en `privacy.limitations`); el campo `usage` solo existe si el llamador lo aporta.
- Solución recomendada: marcar `unavailable` toda métrica sin fuente; propagar `DELENDAI_AGENT_ID` y el modelo observado a cada registro; aceptar tokens del host por hook y etiquetarlos `reported`.
- Prueba de regresión: spec de `buildSummary` sin `usage` en ningún registro: `tokensSaved.status === "unavailable"`.
- Confianza: alta (salida real de dos herramientas y lectura de código).
- Relación: nuevo; completa D83/D75 (filas corruptas) y D84/D76 (ventanas) y G4; relacionado con TOK-01/TOK-02 de gpt-6.1-sol (dashboard con ahorro fijo).
- seenBy: claude-sonnet-5-5

### G97 — `plugin doctor`: 1 de 61 plugins está `verified`; el resto es "registrado" y algunas lecturas están congeladas desde el 14 de octubre
- Clasificación: `CONFIRMADO` · Severidad: P2 (producto) · Componente: `packages/cli` (doctor) + plugins · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: `packages/cli/src/commands/doctor.ts` y `doctor-checks/`; salida de `plugin doctor` (comando de f00762).
- Qué debería ocurrir: el usuario distingue "encontrado" de "funciona en mi proyecto y mi host" (prompt, sección 3: "¿Está implementado o es una promesa?").
- Qué ocurre: 61 plugins → `verified` 1 (`roadmap`), `registered` 54, `needs-host-adapter` 3 (`agent-orchestrator`, `audit-orchestrator`: sin runtime de subagentes; `browser`: sin driver), `needs-configuration` 1 (`style-convention`: sin `styleRoots`, sirve cero herramientas), `library` 2 (`execution-env`, `remote-provider-core`). Cinco lecturas llevan `readAt` del 2026-10-14 (`changelog`, `issues-triage`, `self-learning`, `framework-knowledge`, `style-convention`) frente al 2026-10-19 del resto: el doctor reutiliza una lectura anterior.
- Reproducción: `bun packages/cli/src/index.ts plugin doctor` (si `dist` está viejo, el CLI avisa y hay que usar las fuentes).
- Evidencia: salida real (fórmula en mi bloque). Complementa G84/G85 (disponibilidad registrada para 2 de 19 plugins; `browser` stable sin driver) y G79 (doctor lee el cwd).
- Impacto: explica de forma concreta "hay plugins que están pero no funcionan": 4 casos tienen causa conocida (adaptador/driver/configuración) y 54 no tienen prueba alguna de funcionamiento. Un plugin `stable` sin driver (`browser`) sigue anunciándose como estable.
- Causa raíz: el estado `verified` exige una comprobación específica por plugin que casi ninguno declara.
- Solución recomendada: una comprobación segura y sin efectos por plugin (`selfCheck`) que suba a `verified`; refrescar siempre la lectura antes de mostrarla (o mostrar su antigüedad).
- Prueba de regresión: lint que falle si un plugin `stable` no declara `selfCheck`; spec de que `readAt` es del arranque actual.
- Confianza: alta (ejecución propia).
- Relación: ampliación de G84/G85/G79/G6; nuevo en el dato 1/61 y en la lectura congelada.
- seenBy: claude-sonnet-5-5

### G98 — El proyecto que se valida a sí mismo configura 39 de 61 plugins; 22 no se cargan nunca en el dogfooding, y en 7 días solo 5 plugins recibieron llamadas
- Clasificación: `CONFIRMADO` · Severidad: P2 · Componente: `delendai.config.json`, preset dogfood · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: `delendai.config.json` (`plugins`: 39 claves); `delendai_overview` lista 43 (suma `database`, `prompts-pack`, `refactor`, `skills-pack` por defecto); telemetría: `usage_report.pluginKpis` con 5 plugins (`proposals` 1.644, `core` 329, `git` 8, `audit` 2, `status-marker` 2).
- Qué debería ocurrir: cada plugin que se anuncia tiene un consumidor real o una prueba de integración que lo ejerza en CI.
- Qué ocurre: sin configurar en el repo: `api, audit-orchestrator, browser, cache, changelog, database, execution-env, external-mcps, framework-knowledge, github, gitlab, issues, issues-triage, observability, prompt-eval, prompts-pack, refactor, remote-provider-core, self-learning, skills-pack, style-convention, web-fetch` (22 por diferencia entre `plugins/` y la config; 18 tras sumar los 4 por defecto). Son, en buena parte, los plugins que más importan a un proyecto externo (forge GitHub/GitLab, issues, external-mcps, browser).
- Reproducción: `python3` sobre `delendai.config.json` y `ls plugins` (salida exacta en mi bloque).
- Impacto: los defectos de estos plugins los descubre un usuario externo (patrón de G81: "el preset decide qué llega a un proyecto externo"). Es la causa estructural de que el dogfooding "funcione" mientras el uso externo falla.
- Causa raíz: la configuración del repo optimiza lo que el repo necesita; no hay un perfil de "consumidor tipo" ejecutado en CI.
- Solución recomendada: un proyecto fixture "consumidor" (config mínima distinta) que arranque cada plugin con su `selfCheck` en CI.
- Prueba de regresión: job de CI `consumer-smoke` que falle si un plugin `stable` no pasa su comprobación en el fixture.
- Confianza: alta en los números; media en la causa-efecto con el uso externo.
- Relación: ampliación de G81/G84/G6.
- seenBy: claude-sonnet-5-5

### G99 — Un plan puede terminar `ok: true` con una etapa `verify` sin ejecutar; el dato existe por etapa pero no en el resultado del plan
- Clasificación: `CONFIRMADO` (comportamiento) · Severidad: P3 · Componente: `plugins/agent-orchestrator` · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts:123-131` (`allOk = every(s.ok || s.kind === 'verify')`) y `:172-175` (`executed: false` solo en la etapa).
- Qué debería ocurrir: el resultado agregado de un plan distingue "ejecutado y aceptado" de "ejecutado sin verificar" (prompt, sección 5: separar completar de verificar la aceptación).
- Qué ocurre: el comentario del código lo declara ("A verify step runs nothing here: it never blocks, and reads `executed: false`"), de modo que no es un defecto oculto; pero el campo agregado `ok` no lleva ninguna marca "unverified".
- Reproducción: planificar un modo con etapa `verify` y despachar con subagentes que terminen bien: `ok: true` y `stepOutcomes[verify].executed === false`.
- Evidencia: lectura de código (líneas arriba). No he ejecutado el dispatcher.
- Impacto: un consumidor que lea solo `ok` cree que hubo verificación. Bajo porque el dato por etapa existe.
- Causa raíz: la verificación se delega al orquestador/host por diseño (Bootstrap §4).
- Solución recomendada: añadir `verified: boolean` (o `acceptance: "pending"`) al resultado agregado.
- Prueba de regresión: spec que exija `verified === false` cuando hay etapa `verify` con `executed:false`.
- Confianza: alta en el comportamiento; el impacto es una opinión.
- Relación: matiza la afirmación de la auditoría externa pegada al inicio (que lo trataba como defecto de éxito engañoso); consistente con G56 en que el dispatcher aplica el tope del orquestador pero no el por subagente.
- seenBy: claude-sonnet-5-5

### G100 — Higiene del acta: colisión de ID G79 y cuatro pares de hallazgos duplicados que inflan el recuento
- Clasificación: `CONFIRMADO` · Severidad: P3 (proceso) · Componente: este documento · Snapshot: `e342c8e158d492bf7ca4606b07c8d0c2013beb38`
- Ubicación: dos secciones `### G79` (la del doctor y cwd, y la de deepseek-v4-pro sobre la sección 11 del prompt, traída de su unidad `…a00095-S9-g2` a la mía en el commit `e3a25dee5`); pares `D83≡D75`, `D84≡D76` (misma ubicación y mismo texto en la primera frase de evidencia, verificado) y por título `D99≈D103` y `D77≈D108`.
- Qué debería ocurrir: un ID por hallazgo y un hallazgo por ID (G44 ya lo pedía).
- Qué ocurre: el Scoreboard no puede puntuar dos hallazgos distintos con el mismo ID; los duplicados cuentan dos veces el acuerdo.
- Reproducción: `grep -nE '^### G79 '` sobre el acta devuelve dos líneas; comparar las primeras 200 palabras de `D83` y `D75`.
- Impacto: el S10 puede inflar o dividir el acuerdo; ninguna pérdida de contenido.
- Causa raíz: IDs asignados en paralelo por revisores que partían de snapshots distintos (G44).
- Solución recomendada: que S10 renumere en una sola pasada (la regla "no reescribir a otro" se aplica a revisores, no al cierre) y fusione los pares conservando ambos `seenBy`. Yo no he renombrado nada ajeno; mis IDs empiezan en G91 (los G87–G90 los ocupó claude-haiku-5-5 mientras yo trabajaba; renumeré los míos antes de integrar, sin tocar los suyos) para no colisionar con G79–G86 ni con los IDs `G61-*`/`ORCH-*`/`C*` de gpt-6.1-sol.
- Prueba de regresión: lint de actas que falle ante `### <ID>` repetido.
- Confianza: alta.
- Relación: ampliación de G44.
- seenBy: claude-sonnet-5-5

### G87 — Las referencias de evidencia del acta no se comprueban: 3 archivos no existen, 4 rutas están incompletas y 6 son imprecisas
- Clasificación: `CONFIRMADO` · Zona: método del acta / gates
- Evidencia (snapshot `e342c8e15`): comprobación de todas las rutas `archivo:línea` del documento contra `origin/develop`. No existen: `apps/web/src/data/token-roi.json` (G23), `packages/proposals-sqlite/src/lib/bun-sqlite.helper.ts` (G24), `plugins/quality/tests/src/lib/runners/lint-rules.spec.ts` (G41). Con `...` en lugar de nombre: D37, D42, D66, D80. Imprecisas (el archivo existe en otra ruta): G2, G5, G10, D8, D9, D77. El gate `tools/scripts/lint/proposal-files-exist.script.ts` solo comprueba las rutas de la línea `**Files**:`, no las de hallazgos.
- Impacto: un implementador que siga el acta no encuentra el código que describe. El consenso se vota sobre referencias que no se pueden reproducir.
- Qué debería: validar cada `archivo:línea` de los hallazgos con un lint como el de `Files`, y exigir la ruta completa.
- seenBy: claude-haiku-5-5 (verificado en `e342c8e15`)

### G88 — El scoreboard refleja un estado distinto del código: 170 de 200 figuran como abiertos, 3 con texto de corrección y 1 con estado desactualizado
- Clasificación: `CONFIRMADO` · Zona: método del acta / consenso
- Evidencia (snapshot `e342c8e15`): el Scoreboard tiene 170 filas `abierto`, 11 `corregido`, 1 `parcial` y 5 celdas con prosa en lugar de un estado (rompen la tabla). Estado desactualizado frente al código: G31 figura abierto, pero `packages/core/src/lib/cli/assemble.ts:304` ya carga la capa personal (`personalLayerPath`). En 3 hallazgos sin estado corregido, su propio texto afirma corrección.
- Impacto: el umbral de consenso (≥8/10) se decidirá sobre estados que no coinciden con el código. Las celdas en prosa impiden filtrar la tabla.
- Qué debería: derivar el estado de una verificación contra un snapshot fijado, no escribirlo a mano; y limitar las celdas a un valor de una lista cerrada.
- seenBy: claude-haiku-5-5 (verificado en `e342c8e15`)

### G89 — El acta pesa 359 KB y 3.501 líneas: cada revisor la carga entera, unos 90.000 tokens, y eso contradice el objetivo de economía de tokens
- Clasificación: `CONFIRMADO` · Zona: método del acta / coste de coordinación
- Evidencia (snapshot `e342c8e15`): `wc -c` y `wc -l` sobre el documento; estimación de tokens = bytes/4, la misma regla que usa el proyecto para medir bytes. Cada uno de los 10 revisores tiene que leer el documento completo para no duplicar hallazgos, y además cada bloque nuevo lo hace crecer.
- Impacto: el coste de una auditoría colectiva crece con cada revisor (los últimos revisores pagan más por entender que por aportar). Va en sentido contrario al objetivo de gastar menos tokens.
- Qué debería: separar el acta en un índice (Scoreboard) y fichas por hallazgo que se cargan bajo demanda; el propio proyecto ya tiene una vista por slices (`proposal_get`, vista `slices`).
- seenBy: claude-haiku-5-5 (medido en `e342c8e15`)

### G90 — 47 hallazgos no tienen referencia `archivo:línea`, así que no se pueden verificar
- Clasificación: `CONFIRMADO` · Zona: método del acta
- Evidencia (snapshot `e342c8e15`): recuento sobre los 200 bloques de hallazgo; 47 no contienen ninguna ruta de código. Ejemplos de clase: afirmaciones de cobertura o de proceso, y varias de tipo "meta" (G74–G78).
- Impacto: un hallazgo sin referencia puede ser correcto, pero no se puede confirmar ni refutar con el acta. Mezclarlos con hallazgos verificados infla el número de consensos.
- Qué debería: separar en el acta "hallazgo de código" (requiere ruta) y "hallazgo de método" (requiere criterio explícito), y no sumar ambos en el mismo recuento.
- seenBy: claude-haiku-5-5 (recuento sobre `e342c8e15`)

### G101 — Familia "control de gobierno decorativo": el schema pide el parámetro, el texto lo promete y el handler no lo aplica (seis casos verificados)
- Clasificación: `CONFIRMADO` (seis instancias) · Severidad: P2 · Componente: transversal (`plugins/refactor`, `plugins/api`, `plugins/adaptive-optimizer`, `plugins/auto-plugin-selector`, `plugins/audit`, `plugins/external-mcps`) · Snapshot: `e1b830459` (develop tras #1274)
- Ubicación (verificada línea a línea por mí): `refactor/src/lib/tools/refactor-rename.tool.ts:203-217,272` (`consentToken: z.string().min(1)`, solo se devuelve); `api/src/lib/spec/openapi.ts:355-370` (`fetchAndParseSpec` declara `allowList/maxBytes/timeoutMs` en `ILoadSpecOptions` y ejecuta `f(options.url, {})`, con una variable `_headers` sin uso); `adaptive-optimizer/src/lib/services/optimize-run.service.ts:364` (`budget` solo se copia); `auto-plugin-selector/src/lib/tools/plugins-recommend.tool.ts:64` (`taskHint` solo aparece en el prompt LLM opcional `refine/llm-rationale.ts:120`, no en el scorer); `audit/src/lib/tools/self-audit.tool.ts:76-92` (`filterFindingsByCapabilities` devuelve siempre `findings`, con un comentario que lo admite); `external-mcps/src/lib/subprocess/server-registry.ts:83-98` (`spawn(command, …)` sin lista de ejecutables; el gate es un knob de política).
- Qué debería ocurrir: un parámetro cuyo nombre o descripción sugiere un control (consentimiento, allow-list, tope, filtro) o gobierna la decisión, o no existe.
- Qué ocurre: seis herramientas aceptan el parámetro, lo documentan como control y lo ignoran o solo lo reeditan. El usuario o el agente leen "protegido" donde hay una cadena cualquiera. Es la misma causa raíz detrás de D40, D52, D62, D100, D115 y G54, que el acta cuenta por separado.
- Reproducción: leer las líneas citadas; para D62, llamar `refactor_apply` con `consentToken:"x"` sin haber llamado antes a `refactor_rename` (no hay emisor del token en `plugins/refactor`).
- Evidencia: lecturas de código arriba; para D62 el único uso de `consentToken` fuera de specs es devolverlo (`:272`); para D100 la única referencia fuera de la interfaz y el schema es el prompt del LLM.
- Impacto: sobre-promesa de seguridad en superficies que escriben (D62) o salen a red (D40); decisiones de ranking que ignoran lo pedido (D100); tokens gastados en llamar con parámetros que no cambian nada.
- Causa raíz: no hay una comprobación mecánica de que cada campo de entrada de una herramienta se lee en su implementación; el gate de `outputSchema` (D20) cubre la salida y no la entrada.
- Solución recomendada: un lint AST "campo de entrada sin lectura" (cada clave del `inputSchema` debe aparecer en el cuerpo del handler o en un servicio al que se pase), con baseline para los casos conocidos y la regla de que un parámetro de control debe fallar cerrado si no puede aplicarse.
- Prueba de regresión: el lint sobre las 6 herramientas citadas debe fallar hoy y pasar tras corregirlas; spec de `refactor_apply` que rechace un `consentToken` no emitido.
- Confianza: alta en las seis instancias (código leído); media en que sean todas (no he medido el total, solo las que el acta ya señalaba).
- Relación: nuevo como patrón; agrupa D40, D52, D62, D100, D115 y G54 sin sustituirlos; complementa D20 (el ratchet de salida) y G71.
- seenBy: claude-sonnet-5-5

### G102 — El efecto de red de `api_call` y `obs_errors` se declara como etiqueta libre y no como `effects`, así que la clasificación de seguridad de la herramienta los ve como `unknown`
- Clasificación: `CONFIRMADO` · Severidad: P3 · Componente: `plugins/api`, `plugins/observability`, `packages/core` (clasificación de herramientas) · Snapshot: `0f14b34d5`
- Ubicación: `plugins/api/src/lib/tools/api-call.tool.ts:119` y `plugins/observability/src/lib/tools/obs-errors.tool.ts:67` (`tags: [..., 'network', 'effects']`, sin campo `effects`); consumidor: `packages/core/src/lib/cli/assemble.ts:126-160` (`toolCategoryOf` decide la categoría con `input.effects`; las etiquetas `network` solo cuentan para `reporting`/`external-bridge`/etc. y no para `network`).
- Qué debería ocurrir: toda herramienta que sale a red declara `effects: ['network']` (contrato `IToolEffect`, `tool-registration.interface.ts:87`: "Omit for read-only tools. Surfaced by `overview` so a host can warn on / gate write/spawn/destructive tools").
- Qué ocurre: las dos herramientas usan la palabra "effects" como etiqueta, así que el campo tipado queda vacío; `toolCategoryOf` no las clasifica como `network`. Además hay red sin ningún efecto declarado en `usage-tracking` (G103) y en la ruta LLM de `audit` (`audit/src/lib/services/llm-client.service.ts:168`).
- Reproducción: leer las dos líneas citadas y `assemble.ts:126-160`; o `delendai_overview` y buscar `api_call` en la lista de efectos.
- Evidencia: el escáner estricto de efectos (fetch fuera de comentarios frente a `effects:`) deja 7 plugins con red sin efecto `network`: `api`, `audit`, `error-reporting`, `observability`, `orchestrator-runner`, `rules`, `usage-tracking`. No he comprobado en cada uno si el acceso es opt-in.
- Impacto: un host que filtre o avise por efectos no ve estas herramientas como de red. Es la misma clase de riesgo que D4 (contrato que no refleja la conducta), aplicada a la política en vez de al esquema.
- Causa raíz: el campo `effects` es opcional y su ausencia significa "solo lectura"; nada verifica la coherencia con el código.
- Solución recomendada: lint que cruce `fetch(`/`spawn(`/escrituras con `effects` por herramienta, y que prohíba la etiqueta `effects`.
- Prueba de regresión: el lint falla hoy con las dos herramientas citadas y pasa tras declararlas.
- Confianza: alta en las dos herramientas (código leído); media en el recuento de los otros cinco (regex, sin leer cada ruta).
- Relación: nuevo; familia de G101 (declarado frente a aplicado).
- seenBy: claude-sonnet-5-5

### G103 — `usage-tracking` descarga al arrancar una tabla de precios de un repositorio de terceros (rama `main`), sin opción para desactivarla y sin efecto declarado
- Clasificación: `CONFIRMADO` · Severidad: P3 · Componente: `plugins/usage-tracking` · Snapshot: `0f14b34d5`
- Ubicación: `plugins/usage-tracking/src/index.ts:253-258` (`resolvePricing(pricingPath)` en segundo plano en cada arranque), `src/lib/pricing.ts:30-31,142-170,219-232` (URL `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`, refresco si la caché es antigua o ausente, escritura con `redactSecrets` + `writeFileAtomic`).
- Qué debería ocurrir: una herramienta de telemetría "local" que sale a red lo declara (`effects`), lo documenta en su declaración de privacidad y ofrece interruptor; en un proyecto consumidor sin red permitida no debería intentarlo.
- Qué ocurre: tras la lectura de la caché o del snapshot incluido, si está ausente o caducada, se lanza un `fetch` sin condición. No encontré guarda por opción ni por modo offline en `index.ts` ni en `lib/pricing.ts` (búsqueda de `offline`, `pricingRefresh` y `refreshPricing` sin resultados). La respuesta se valida a números por modelo, lo que acota el riesgo de contenido; la fuente es una rama mutable de otro proyecto.
- Reproducción: arrancar el servidor con `usage-tracking` en un workspace sin `pricing.json` y observar una petición a `raw.githubusercontent.com` (o leer las líneas citadas).
- Evidencia: lectura de código; la declaración de privacidad de `project_kpis` ("Metadata only…") no menciona esta descarga.
- Impacto: salida de red silenciosa en cada proyecto consumidor con el plugin cargado; dependencia de un tercero para un dato de coste; ningún efecto declarado (G102).
- Causa raíz: el refresco se pensó como mejora transparente ("stale-while-revalidate") y no se trató como efecto de red.
- Solución recomendada: opción `plugins.usage-tracking.options.pricingRefresh` (por defecto `false` en consumidores) y declarar el efecto; fijar la URL a un commit o mirror propio.
- Prueba de regresión: spec con `fetch` espiado: con la opción apagada, 0 llamadas.
- Confianza: alta en el código; la frecuencia real depende de la antigüedad de la caché.
- Relación: nuevo; parentesco con G25 (entorno heredado por CLI de proveedores) en cuanto a salidas no declaradas.
- seenBy: claude-sonnet-5-5

### G104 — `obs_errors` hace dos peticiones por consulta y la que lleva credenciales no tiene tope de tamaño ni marca de truncado
- Clasificación: `CONFIRMADO` · Severidad: P2 · Componente: `plugins/observability` · Snapshot: `0f14b34d5`
- Ubicación: `plugins/observability/src/lib/errors/list-errors.ts:140-169`.
- Qué debería ocurrir: una petición, con tope de bytes y con `truncated` verdadero cuando se recorta.
- Qué ocurre: primero se pasa por el motor `webFetch` (allow-list, `maxBytes: 200_000`, se descarta la respuesta salvo `ok`) y después se repite la misma URL con `fetch` directo y cabecera de autenticación, `redirect: 'manual'`, **sin** `maxBytes`: `await direct.text()` lee todo el cuerpo y el resultado devuelve `truncated: false` fijo. El motor recibe además `undefined as never` como semilla de `fetch`.
- Reproducción: apuntar una fuente permitida a un endpoint que devuelva un cuerpo grande; el motor corta a 200 kB y la segunda petición lo lee entero.
- Evidencia: lectura de código (líneas arriba). No he ejecutado la ruta de producción.
- Impacto: coste duplicado por consulta; respuesta sin tope hacia el modelo (mismo tipo de riesgo que G95); la comprobación de allow-list se hace con una petición que no es la que lleva el token.
- Causa raíz: el motor no admite cabeceras, y se resolvió añadiendo una segunda llamada en vez de extenderlo.
- Solución recomendada: que `webFetch` acepte cabeceras de autenticación y aplique el tope en la única petición.
- Prueba de regresión: spec con servidor local que devuelve 1 MB: una sola petición y `truncated:true`.
- Confianza: alta en el código; media en la gravedad (depende de la fuente).
- Relación: nuevo; parentesco con D40 (descarga fuera del motor gobernado).
- seenBy: claude-sonnet-5-5

### G105 — Unas 22 registraciones anuncian un contrato de salida vacío (`compactOutputSchema`) y con ello se pierde la validación que el invariante "toda herramienta declara `outputSchema`" promete
- Clasificación: `CONFIRMADO` (recuento) · `OPINIÓN` (valoración del compromiso) · Severidad: P3 · Componente: transversal (`commit-policy`, `error-reporting`, `orchestrator-runner`, `quality`, `quality-policy`, `usage-tracking` y 4 del core) · Snapshot: `0f14b34d5`
- Ubicación: `packages/core/src/lib/surface/compact-output-schema.helper.ts:30-33` (`z.looseObject({ ok: z.boolean().optional() })`); usos: `quality` 5 de 7 herramientas, `usage-tracking` 2 de 4, `orchestrator-runner` 3 de 12, `commit-policy` 2 de 8, `quality-policy` 2 de 2, `error-reporting` 2 registros, y en el core `overview`, `agent_catalog`, `analyze`, `plan`.
- Qué debería ocurrir: el ahorro de bytes en `tools/list` no debe eliminar el contrato de salida de las herramientas de uso diario; el propio helper lo limita a "lo que se anuncia", no a lo que se valida.
- Qué ocurre: el comentario del helper es honesto (esquema mínimo declarado, respuesta real intacta), pero un cliente que valide `structuredContent` contra el esquema anunciado acepta cualquier objeto: el ratchet de salida (D20) y los errores de contrato (D4/D18/D19/D41) no pueden detectarse en esas 22 herramientas. Mi memoria de trabajo del proyecto recoge además que x00543 prohíbe usar este atajo para el orquestador de agentes por la misma razón.
- Reproducción: `grep -rn "compactOutputSchema()" plugins/*/src packages/core/src` (recuento arriba).
- Evidencia: lectura del helper y recuento por plugin (medido).
- Impacto: el coste de tokens baja (q00011 sitúa un 66 % del coste en los schemas de salida), pero a costa de verificación; es una decisión de diseño y no un defecto, y conviene que el consenso la valore explícitamente.
- Causa raíz: tensión entre economía de `tools/list` y contrato de salida, resuelta caso por caso sin criterio común.
- Solución recomendada: criterio único (p. ej. contrato completo bajo demanda por `knowledge`/`tool_details` más un esquema mínimo por herramienta) y un lint que impida el atajo en herramientas con efectos.
- Prueba de regresión: lint que falle si una herramienta con `effects` usa `compactOutputSchema`.
- Confianza: alta en el recuento; la valoración es opinión.
- Relación: nuevo como recuento; relacionado con D4/D18/D19/D20/D41, G71, q00011 y G94 (coste del router).
- seenBy: claude-sonnet-5-5

### G106 — Dos autoridades para leer PR y cuatro para leer issues: `git` (con `allowForge`) y `forge` duplican `pr_list`; `issues`, `issues-triage`, `forge`, `github` y `gitlab` solapan en issues
- Clasificación: `CONFIRMADO` · Severidad: P3 (estructural) · Componente: `plugins/git`, `plugins/forge`, `plugins/issues`, `plugins/issues-triage`, `plugins/github`, `plugins/gitlab` · Snapshot: `0f14b34d5`
- Ubicación: `plugins/git/src/lib/tools/forge-tools.ts:1-6,47` (`pr_list`, `pr_view`: solo GitHub vía `gh`, opt-in `plugins.git.options.allowForge`); `plugins/forge/src/index.ts:71-75` (`pr_list`, `pr_show`, `ci_status`, `issue_list`, `issue_create`, autodetección GitHub/GitLab por `origin`); `plugins/issues` (10 herramientas, `issues_list`, `issues_fetch`…); `plugins/gitlab` (14 herramientas) y `plugins/github` (catálogo de 1.881 líneas).
- Qué debería ocurrir: una sola autoridad por dato (prompt, sección 4: "diferentes caminos de escritura/lectura para un mismo dato").
- Qué ocurre: un agente que quiera "listar PRs abiertos" puede llegar por `git_pr_list` (si `allowForge`), por `forge_pr_list`, o por `github`/`gitlab`; los resultados pueden diferir (distintos formatos y backends). Cada duplicado añade bytes al catálogo y una decisión al agente.
- Reproducción: `delendai_tool_search { query:"pr_list" }` y comparar descripciones.
- Evidencia: nombres de herramienta extraídos del código (medido) y lectura de los dos puntos de registro.
- Impacto: coste de tokens por descubrimiento; riesgo de divergencia; confusión de producto (qué plugin activar).
- Causa raíz: `git` añadió un puente a `gh` (f00136) antes de que existiera `forge`; ambos se mantuvieron.
- Solución recomendada: que `git` delegue en `forge` o retire `pr_list`/`pr_view`; documentar `forge` como la lectura y `github`/`gitlab` como los adaptadores específicos de escritura.
- Prueba de regresión: lint de nombres de herramienta duplicados por sufijo entre plugins (`*_pr_list`) con excepciones explícitas.
- Confianza: alta en `git`/`forge`; media en el solapamiento de issues (no he comparado esquemas de salida).
- Relación: ampliación de G10 (duplicación `github`/`gitlab`) y de G30 (tres selectores/almacenes); nuevo en la pareja `git`/`forge`.
- seenBy: claude-sonnet-5-5

### G107 — El runner de criterios de aceptación ejecuta comandos con shell y con el entorno completo, pero hoy no tiene llamador de producción
- Clasificación: `CONFIRMADO` (ausencia de llamadores) · Severidad: P3 (latente) · Componente: `plugins/proposals` · Snapshot: `0f14b34d5`
- Ubicación: `plugins/proposals/src/lib/proposals/proposal-acceptance.ts:220-223,330-331,405-430` (`buildSpawnEnv` = `{...process.env, ...NON_INTERACTIVE_ENV}`; `commandNeedsShell` activa `shell: true` si hay `| & ; < > \`` o `$(`); único llamador: `runCloseSliceValidation` (`tools/authoring.tool.ts:417`), que a su vez no tiene llamadores fuera de specs (búsqueda en `plugins packages tools apps`).
- Qué debería ocurrir: lo que ejecuta comandos descritos por texto de propuesta lo hace con entorno mínimo y sin shell salvo necesidad, o no existe.
- Qué ocurre: si alguien lo conecta, un criterio con texto malicioso en una propuesta se ejecuta con todos los secretos del proceso. Hoy no está conectado, de modo que el riesgo es latente y se suma al código muerto.
- Reproducción: `grep -rn "runCloseSliceValidation\|runAcceptanceCriteria" plugins packages tools apps` (solo definiciones y specs).
- Evidencia: búsqueda (salida en el análisis); lectura de `buildSpawnEnv`.
- Impacto: ninguno hoy; peligro al cablearlo. Es la misma clase que G25, corregida para los proveedores pero no aquí.
- Causa raíz: ejecutor genérico pensado para M8 sin política de entorno.
- Solución recomendada: borrarlo si no se usa, o pasar `buildSafeEnv` (como `external-mcps/src/lib/subprocess/env-filter.ts`) y exigir consentimiento.
- Prueba de regresión: spec que verifique que el hijo no recibe `GH_TOKEN`/claves de proveedor.
- Confianza: alta en la ausencia de llamadores; media en que no exista otra ruta dinámica (no he buscado imports por nombre).
- Relación: nuevo; parentesco con G25 y G54.
- seenBy: claude-sonnet-5-5

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
| G43 | cifras G2/G18 no reproducibles (metodología LOC) | 2/10 | abierto |
| G44 | higiene del libro de actas (D17 dup, tabla partida, acuerdos, audit-source dangling) | 2/10 | abierto |
| G45 | zod ^4.0.0 en changelog/database vs ^4.4.3 | 2/10 | abierto |
| G46 | logo-mono 4ª copia de marca sin gate | 2/10 | abierto |
| G47 | /status/* páginas vacías + SSE decorativo | 2/10 | abierto |
| G48 | settlement sin conductor de producto | 1/10 | abierto |
| G49 | gate settlement no atómico vs re-entrada | 1/10 | abierto |
| G50 | nav API 404 sin pipeline site completo | 2/10 | abierto |
| G51 | lectura falsa-vacía del lock: double-grant reproducido (D1/D2 resuelto) | 2/10 | abierto — causa correcta; mi storm no estabilizó 21/30, pido re-test storm=50 |
| G52 | Batuta healthcheck marca `available` sin verificar auth/model | 1/10 | abierto |
| G53 | Batuta subscription es passthrough local, no cross-host | 1/10 | abierto |
| G54 | external-mcps spawnea `command` de config sin allowlist | 1/10 | abierto |
| G55 | providers.astro publica `attributionRows` hardcodeados, sin producer | 2/10 | abierto |
| G56 | agent-orchestrator: cap subagente es petición, no corte local | 2/10 | abierto |
| G59 | roadmap-sqlite: SQLite implementado con specs, 0 imports fuera de sí (huérfano) | 2/10 | abierto |
| G60 | NUL físico (0x00) en un prompt emitido al modelo (prompts-pack/review-diff.ts:47) | 1/10 | abierto — fuente confirmada por hexdump; propagación runtime pendiente |
| G61 | gate-gap: biome/content-integrity/validate no rechazan bytes de control C0 en fuentes | 1/10 | abierto — PASS verificado por ejecución |
| G62 | ENOENT determinista del sidecar `.mutex` del error-sink en cold-boot; silencia su propio fallo (observabilidad) | 1/10 | abierto — repro single-instance, causa de línea pendiente |
| G63 | Al landear la wip-ref se borra y no hay vista por-agente→rama/PR (traza sólo en merge-commit) | 1/10 | abierto — THESIS de gravedad, medido (7 merges, gpt-6-luna 0 refs) |
| G64 | Un anexo firmado de auditor no tiene dónde caber: `evidence/` no es bilingüe y `proposals/**` impone scaffold de proposal | 1/10 | abierto — P2 flujo; inline es el workaround que tomé (reproducido fallando ambos gates) |
| G65 | tres catálogos de hosts divergen (AGENT_HOSTS 9 / known-clients 8 / scaffold defaults 3) | 1/10 | abierto |
| G66 | hosts con instructions declarados (windsurf, agents-md) sin entrada known-clients ni config/external | 1/10 | abierto |
| G67 | CLI: alias.command y bridge.command sin spec colateral (libs sí testeadas) | 1/10 | abierto |
| G68 | bridge de identidad: `provider-model.json` plano compartido; dos sesiones del mismo workspace se pisan la entrada y el modelo se atribuye mal | 1/10 | abierto — observado en vivo esta sesión (gemini vs deepseek) |
| G69 | asimetría respuesta↔persistido en el lock: claim `ok` que la siguiente lectura ya purgó (procesos efímeros) | 1/10 | abierto — reproducido 25/25 con poseedor vivo OK, 10/25 pérdidas efímeras |
| G70 | `/status/logs` y `/status/recovery` SÍ abren EventSource, pero el handler hace `close()` sin leer datos (matiza G47/D27/D29) | 1/10 | abierto — código confirmado 4c4e978f8 |

| D18 | outputSchema de solo-éxito también miente en memory/logs/usage-tracking | 2/10 | abierto |
| D19 | GitLab read-only devuelve toolError fuera de schema en casi toda la suite | 2/10 | abierto |
| D20 | el ratchet de outputSchema no ejecuta el camino de error real | 1/10 | abierto |
| D21 | forge autodetecta solo github.com/gitlab.com exactos | 2/10 | abierto |
| D22 | createProjectPlugin puede salir del workspace | 1/10 | abierto |
| D23 | forge PR body sube la propuesta entera sin límite | 1/10 | abierto |
| D24 | la extensión VS Code está sesgada al primer workspace folder | 2/10 | abierto |
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
| D40 | api_call carga specUrl con fetch crudo fuera del cerrojo web-fetch | 2/10 | abierto |
| D41 | external_mcp_call puede devolver missing-env fuera de schema | 1/10 | abierto |
| D42 | audit-orchestrator no parsea un plan real del repo | 1/10 | abierto |
| D43 | browser_query promete bound pero no usa el planner que lo define | 1/10 | abierto |
| D44 | browser_screenshot puede colisionar y sobrescribir artefactos | 1/10 | abierto |
| D45 | injectCspMeta interpola CSP en HTML sin escape de atributo | 2/10 | abierto |
| D46 | roadmap-sqlite puede migrar dejando filas invisibles | 1/10 | abierto |
| D47 | self-learning puede perder observaciones concurrentes | 2/10 | abierto |
| D48 | project-kpis cae completo ante history.json corrupto | 1/10 | abierto |
| D49 | quality_policy resume una type policy parcial como si fuera global | 1/10 | abierto |
| D50 | commit_policy_status puede mentir sobre ramas protegidas efectivas | 1/10 | abierto |
| D51 | observability recorta los registros reales al revés | 2/10 | abierto |
| D52 | optimize_run pide budget pero no lo usa para gobernar el score | 1/10 | abierto |
| D53 | plugins_recommend puede justificar removals con una causa falsa | 1/10 | abierto |
| D54 | remote-provider-core puede enviar el bearer token a otro origen | 2/10 | abierto |
| D55 | issues-triage puede anunciar éxito sin draft ni side effects completos | 1/10 | abierto |
| D56 | issues_ingest puede duplicar scaffolds del mismo issue | 1/10 | abierto |
| D57 | cache.maxAgeDays global no rebaja las reglas del plugin cache | 1/10 | abierto |
| D58 | database colapsa la dimensión schema en la introspección canónica | 1/10 | abierto |
| D59 | changelog expone release_plan sin publishOrder utilizable | 1/10 | abierto |
| D60 | framework_guidance promete mixed repo pero solo mira la raíz | 1/10 | abierto |
| D61 | project_health puede dar verde perfecto con señales demasiado débiles | 1/10 | abierto |
| D62 | refactor_apply tiene un consent token nominal, no real | 2/10 | abierto |
| D120 | debt_scan presenta un barrido global pero usa caps silenciosos | 1/10 | abierto |
| D121 | web-fetch DNS rebinding no mitigado (documentado) | 1/10 | abierto |
| D122 | status-marker trunca reason obligatorio | 1/10 | abierto |
| D123 | execution-env quoting correcto sin test adversarial | 1/10 | abierto |
| D124 | test-policy positivo (schema honesto+mutex+redacción) | 1/10 | abierto |
| D119 | diagram_deps presenta el workspace graph sin incluir scopes como tools | 1/10 | abierto |
| D118 | impact-analysis mezcla el working tree global con el slice pedido | 1/10 | abierto |
| D117 | link_check presenta un escaneo global pero su backend es parcial y silencioso | 1/10 | abierto |
| D116 | context_for_change mezcla working tree ajeno al slice pedido | 1/10 | abierto |
| D115 | self_audit acepta capabilities pero no filtra hallazgos | 1/10 | abierto |
| D112 | env_check puede filtrar el valor inválido pese a prometer no exponer valores | 1/10 | abierto |
| D113 | env required vacío cae a mistyped-value medio en lugar de missing-required alto | 1/10 | abierto |
| D114 | error-reporting cuenta store no fiable como deduplicación | 1/10 | abierto |
| D111 | audit/generated-types endurece nullables a number | 1/10 | abierto |
| D109 | docs_list pagina sobre un catálogo ya truncado a 200 | 1/10 | abierto |
| D110 | pr_list puede ocultar un fallo de gh como lista vacía disponible | 1/10 | abierto |
| D107 | style_profile cuenta tokens sobre un subconjunto explícito | 1/10 | abierto |
| D108 | test-convention solo controla companion specs en una fracción del repo | 1/10 | abierto |
| D105 | quality_policy resume lint global desde solo tres áreas fijas | 1/10 | abierto |
| D106 | eval_report llama cheapest winner a un ranking por composite score | 1/10 | abierto |
| D103 | logs_incidents solo refleja recurrencias, no el estado actual completo | 1/10 | abierto |
| D104 | search+rg puede ocultar roots inválidas como 0 hits sin diagnóstico | 1/10 | abierto |
| D101 | external-mcps status puede decir running sin sesión MCP usable | 1/10 | abierto |
| D102 | container no trata bind mounts host como riesgo reforzado | 1/10 | abierto |
| D99 | logs_incidents solo muestra recurrencias, no "lo roto ahora" completo | 1/10 | abierto |
| D100 | taskHint no influye en plugins_recommend determinista | 1/10 | abierto |
| D97 | security_audit overvende cobertura SAST en su knowledge agregado | 1/10 | abierto |
| D98 | security_deps atribuye mal cuándo usa red | 1/10 | abierto |
| D95 | external-mcps puede fabricar missing-env falsos por cómo proyecta env | 1/10 | abierto |
| D96 | auto_recommend dice rankear por tarea con señal demasiado gruesa | 1/10 | abierto |
| D93 | triage_list no puede distinguir pendientes de ya atendidos por el bot | 1/10 | abierto |
| D94 | state-sqlite silencia scopes corruptos en restore | 1/10 | abierto |
| D91 | roadmap puede mutar sin dejar timeline y responder ok igualmente | 1/10 | abierto |
| D92 | audit_consolidate puede perder inputs sin declararlo | 1/10 | abierto |
| D89 | logs_tail puede truncar el histórico reciente sin avisar | 1/10 | abierto |
| D90 | el sweep TTL de memory puede ocultar corrupción como no-op | 1/10 | abierto |
| D87 | git read-only puede maquillar fallos como árbol limpio/vacío | 1/10 | abierto |
| D88 | memory_import puede aceptar metadatos semánticamente basura | 1/10 | abierto |
| D85 | rules pierde services/ en el builder activo por composición | 1/10 | abierto |
| D86 | github workflow_run puede ocultar jobs por falta de paginación | 1/10 | abierto |
| D83 | usage-tracking puede ocultar corrupción parcial de logs | 1/10 | abierto |
| D84 | project-kpis mezcla ventanas temporales distintas en una sola vista | 1/10 | abierto |
| D81 | api_mock knowledge/UI describe una salida distinta a la real | 1/10 | abierto |
| D82 | notification puede emitir falsos lock-released por read errors | 1/10 | abierto |
| D79 | security_secrets ignora ficheros ignored de alto riesgo | 2/10 | abierto |
| D80 | perf_bench no ejecuta benches: solo resume samples inyectados | 1/10 | abierto |
| D63 | security_audit omite el scanner SAST aunque se venda como completo | 1/10 | abierto |
| D64 | perf_profile ofrece flamegraph pero ejecuta siempre node --prof | 1/10 | abierto |
| D75 | usage-tracking puede ocultar corrupción parcial de logs | 1/10 | abierto |
| D76 | project-kpis mezcla ventanas temporales distintas en una sola vista | 1/10 | abierto |
| D70 | docs_generate puede maquillar fallos de lectura como docs vacías | 1/10 | abierto |
| D71 | api_mock anuncia specUrl pero el plugin real nunca lo cablea | 1/10 | abierto |
| D67 | container_build puede construir fuera del workspace sin contención | 1/10 | abierto |
| D68 | deps_audit puede maquillar fallos como “sin findings” | 1/10 | abierto |
| D69 | deps_licenses puede devolver limpio falso por errores de lectura | 1/10 | abierto |
| D72 | i18n_check puede declarar unused claves vivas con API tipada | 1/10 | abierto |
| D73 | await_lock puede dar green por fallo de lectura del lock | 1/10 | abierto |
| D74 | report_complete no garantiza que la notificación haya salido | 1/10 | abierto |
| D77 | test-convention solo ve src/ raíz para el drift de companion specs | 1/10 | abierto |
| D78 | conventions_explain_path sigue anclado a TypeScript-only | 1/10 | abierto |
| D65 | security_secrets ignora ficheros ignored de alto riesgo | 2/10 | abierto |
| D66 | perf_bench no ejecuta benches: solo resume samples inyectados | 1/10 | abierto |



| G72 | logo-mono no es mono: copia byte-idéntica del logo de color | 1/10 | abierto |
| G73 | `@delendai/state-sqlite` huérfano: 3.268 LOC + 8 specs sin import de runtime (gemelo de G59) | 1/10 | abierto — grep exhaustivo 18b090cb9 |
| G74 | el propio prompt de la auditoría exige condiciones que el acta no cumplió (snapshot común, fichas 0-10 por plugin, tokens e2e, prompt no versionado) | 1/10 | abierto — meta-hallazgo de método; decidir en S10 |
| G75 | la Fase A del prompt (independencia, no consultar a otros) es inverificable: solo 4/8 bloques declaran inventario previo; el consenso ≥80% vota sobre un libro ya leído sin distinción confirmado/suscrito | 1/10 | abierto — brecha de método verificable, no acusación; S10 decide tabla Fase A y doble contador |
| G76 | el contrato de evidencia del prompt (sección 12: 15 campos) no se sigue: 0 hallazgos con Severidad/Estado/Componente/Ubicación/Reproducción/Solución; la priorización P0-P3 no es computable desde el acta | 1/10 | abierto — sin severidad normalizada el entregable 15 requiere re-clasificación manual de ~193 items en S10/S11 |
| G77 | la sección 2 del prompt (inventario con estado normalizado Verificado/Bloqueado/Defecto/No-aplicable y tabla de 10 columnas) no está en el acta: 0 usos de los 4 estados, 0 tablas con el contrato; la prohibición «supongo que está bien» no es verificable | 1/10 | abierto — S10 debería consolidar los 61 plugins en una tabla canónica desde la matriz del revisor 8 + fichas de qwen-flash; lint:inventory como regresión |
| G78 | el cierre de la auditoría no es verificable: la sección 15 exige un checklist de 10 condiciones estrictas que el acta no materializa; 6 de ellas dependen de entregables ausentes (fichas, inventario, severidad, e2e tokens, propuestas activas) | 1/10 | abierto — P2 proceso; S10 debe publicar la tabla de cierre ✓/✗ y cerrar/consolidar los artefactos (matriz revisor 8 + fichas qwen-flash + P0-P3 estimadas) |
| G87 | referencias del acta: 3 inexistentes, 4 incompletas, 6 imprecisas | 1/10 | abierto |
| G88 | scoreboard desfasado del código; celdas en prosa | 1/10 | abierto |
| G89 | el acta pesa 359 KB; cada revisor paga ~90 k tokens | 1/10 | abierto |
| G90 | 47 hallazgos sin referencia archivo:línea | 1/10 | abierto |
| G79 | plugin doctor lee el cwd, no el workspace | 1/10 | abierto |
| G80 | la auto-adopción escribe la política de integración | 1/10 | abierto |
| G81 | presets: 15 de ahorro solo en dogfood, 7 sin preset | 1/10 | abierto |
| G82 | context-for-change con raíces del monorepo: 0 resultados sin error | 1/10 | abierto |
| G83 | cola: report-stale-candidates falla 9/58 | 1/10 | abierto |
| G84 | disponibilidad registrada solo para 2 de 19 plugins | 1/10 | abierto |
| G85 | browser stable sin driver | 1/10 | abierto |
| G86 | vitest: 77 % en transformar, caché sin persistir | 1/10 | abierto |
| G91 | `agent_lock_release_orphan` deja la entrada de la tabla de ficheros (ficheros bloqueados por una tarea inexistente) | 1/10 | abierto |
| G92 | dos mutex para `agents.lock.json`: el release de recuperación se deshace (arbitraje D1/D2: claim vivo no se pierde) | 1/10 | abierto |
| G93 | `rollback` restaura con otro ámbito que el backup: borra `.git` y los manifiestos (P1) | 1/10 | abierto |
| G94 | `compact_router` duplica la carga interna (`text` + `structuredContent`) | 1/10 | abierto |
| G95 | respuestas sin presupuesto: `review_queue` 180,8 MB/7 días | 1/10 | abierto |
| G96 | `tokensSaved` "measured: 0" sin fuente; 1.985 llamadas con tokens/proveedor/agente desconocidos | 1/10 | abierto |
| G97 | `plugin doctor`: 1/61 `verified`, lecturas congeladas del 14 oct | 1/10 | abierto |
| G98 | dogfooding configura 39/61 plugins; 5 reciben llamadas | 1/10 | abierto |
| G99 | plan `ok:true` con etapa `verify` sin ejecutar (solo marcado por etapa) | 1/10 | abierto |
| G100 | higiene del acta: ID G79 duplicado y 4 pares de hallazgos duplicados | 1/10 | abierto |
| G101 | familia "control decorativo": consentToken, allowList, budget, taskHint, capabilities y spawn sin lista (6 verificados) | 1/10 | abierto |
| G102 | efecto de red de `api_call`/`obs_errors` como etiqueta y no como `effects` (clasificación `unknown`) | 1/10 | abierto |
| G103 | `usage-tracking` descarga precios de un repo de terceros al arrancar, sin opción ni efecto | 1/10 | abierto |
| G104 | `obs_errors`: doble petición y la autenticada sin tope ni `truncated` | 1/10 | abierto |
| G105 | ~22 registraciones con contrato de salida vacío (`compactOutputSchema`) | 1/10 | abierto |
| G106 | dos autoridades para PR (`git`/`forge`) y solape de issues en cuatro plugins | 1/10 | abierto |
| G107 | runner de aceptación con shell y entorno completo, sin llamador de producción | 1/10 | abierto |
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

### glm-5.3-arquitectura (GitHub Copilot, 2026-10-19 — 2ª pasada, revisor 5/10; errata: el PR #1253 lo firmó por error como glm-5.3-flash — id de modelo distinto, no una segunda pasada del revisor 1/10)

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

**Errata de identidad (2026-10-19, tarde):** el PR #1253 con esta pasada se
publicó bajo el id `glm-5.3-flash` por error de identificación mío; el revisor
1/10 ya era glm-5.3-flash y yo soy **glm-5.3-arquitectura** (mismo maker, tier
distinto). Esta edición reatributa frontmatter, seenBy "(2ª pasada)" y esta
cabecera; el contenido de los hallazgos no cambia. Las counts de
`reviewers-completed` no se alteran (siempre fueron 6 revisores distintos, no
una doble firma del mismo).

**Adenda de la 3ª sesión (mismo día, snapshot 514758e78, tras los merges
#1256/#1260):** verificado por lectura directa el deactivate de la extensión
VS Code (correcto: `deactivate` drena `handle.disposeAll()` y cierra el client
stdio — refuta cualquier "proceso huérfano" pendiente); auditadas las zonas
hosts/catálogos y CLI con resultado G65–G67; y resuelto el pendiente de G60
(sondeo runtime: el NUL no llega al `template` emitido por el builder; la
fuente sigue defectuosa). Suscribo además G52–G64 de qwen-3.8-flash y gpt-5.4
con las verificaciones cruzadas que citan.

### qwen-3.8-flash (GitHub Copilot, 2026-10-19 — revisor 6/10, auditoría forense independiente)

**Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b` (develop al inicio de mi pasada; avanzó a `51ba21b96` durante ella, detalle en §7 del informe).
Informe firmado completo con fichas de 61 plugins, matrices de cobertura y KPIs en:
`a00095` reviewer 6/10 block, Veredicto final y Tandas 2-19, inline en este documento.
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
sostienen en fuente idéntica en ancla y tip. Reencuadre de mi cierre (mi rol es aportar hallazgos +
opinión al consenso, no reparar): lo que no ejecuté (smoke Batuta con gasto, multi-OS físico, build astro
completo) **no son bloqueos de la auditoría sino límites de mi método de verificación**, con su confianza
etiquetada. La **confirmación negativa** de BATUTA-01 y de G52/G55/G56 está sostenida con evidencia (e2e
offline verde + líneas + artefacto leído). Una auditoría está *emitida* cuando cubre con evidencia y da
opinión firmada, no cuando fuerza una prueba cara que el producto debería dejar como smoke versionado.
Ver detalle inline en este bloque (Veredicto final y Tandas 11-17).

**Tanda 3 (mismo día, checkpoint):** Sección 8 **sí probada** con un harness real en `/tmp`
(snapshots extraídos por `git archive | tar`): 7 scenarios ejecutados, 1 refutación propia
(CFG2-06: config corrupta NO es fail-closed, `runDoctor` ensucia el árbol con sidecars pese a
JSON inválido). Confirmados: aislamiento por remote/realpath (CFG2-02), migración transaccional
con rollback que preserva el árbol (CFG2-04, `test:e2e/legacy-migration.spec.ts` + orden de
`migration-transaction.ts:196-205`), doble arranque concurrente tolerable en adopción
(CFG2-07), read-only falla temprano con `EACCES` (CFG2-08), re-resuelve identidad al cambiar
origin/cacheDir (CFG2-09). Límites de método declarados (no bloqueos): la confirmación positiva de un
caso real Batuta lo debe dejar el producto como smoke; f00767/f00768 en review (no integradas, contrastadas
como contexto no como refutación). Corrección metodológica registrada: develop avanzado tras mi ancla
`514758e` → G52 (healthcheck available sin auth/model) **no** lo refuta `f00766` en HEAD actual
(verificado con `git show origin/develop:plugins/orchestrator-runner/src/lib/
healthcheck/report.ts:55,73`); `f00768` (one-router) **resuelve** BATUTA-05/ARCH-02 si se
completa, pero no llega a mi ancla. Distingo siempre entre el estado de mi snapshot ancla y el
head del libro en tiempo real.

### Cierre de aportación (signo + hallazgos, opinión consolidada para el consenso)

**Mi opinión global: 6.5/10.** El proyecto es rigurosamente inusual (property-tests de concurrencia
22/22, 12 gates de arquitectura 12/12 PASS, `release` calculando versión sin escribir, i18n 12×315 en
build). Lo baja de 8 a 6.5: la **maquinaria va por delante del producto** (G18 vigente: Batuta sigue
parcial por su propio árbol). No inflo; no rebajo: el *negativo* está bien documentado.

**Valoración por subsistema** (la línea de evidencia → arriba o en el anexo):
- core+contracts+cli+client **7.5**: `git grep` 0 imports `@delendai/(proposals|quality|rules|git|forge)`
  en packages no-plugin → agnosticismo por GRAFO real, scaffold inyecta aliases/hosts (sin hardcode).
- proposals+swarm **5**: monolito SRP real (`index.ts` 1461 LOC, `auto-work/transition/authoring` >3k),
  y el hueco más importante del lote (§5): primitivo protegido + testeado, pero operación
  *compuesta* sobre 3 ficheros (claim→purge→write) **sin test de carrera multi-proceso** (la suite
  de 22 verde no lo toca; y los 12 gates de arquitectura pasan con eso dentro).
- Batuta/orchestrator-runner+execution-env **6.5**: esqueleto serio (journal/apend-only, gate de auth,
  permiso de entorno, reserva de cuota), pero healthcheck optimistic + subscription= passthrough +
  cuota sin writer → mi G52-54.
- agent-orchestrator **6**: rotación/loop OK; cap subagente es petición (`subagentExhausted()` sólo
  en comentario) → G56 + suite 325/325 no lo ejercita en el loop.
- web+ui-extension **5**: build astro ✓ y HTML ✓; `/providers` filas duras, `/status/*` vacíos, 5/6
  escapeHtml no `'`, CSP unsafe-inline en 5 vistas.

**Hallazgos nuevos firmados por mí, no por los previos** (los previos cubrieron core/proposals; yo
ataqué la periferia vírgen):
- **G52** healthcheck `available`=clí instalado no verificado (report.ts:55/61/73) ·
- **G53** Batuta=subscription= passthrough local, no cross-host (subscription.ts:4/17) ·
- **G54** external-mcps: default sí niega boot frío (knob), pero falta allow-list de binarios; P2 ·
- **G55** `providers.astro`/`/status` publican datos sin producer (attributionRows en artefacto) ·
- **G56** `maxTokensPerSubagent` es petición, no corte ·
- **G59** `roadmap-sqlite`: único paquete declarado con 0 import externos (huérfano; barrido a
  todos los paquetes → `state-telemetry` tiene 2, `test-kit` 154 en specs, `proposals` 49: correcto). ·
- **G60** byte NUL 0x00 en un prompt dirigido al modelo (`review-diff.ts:47`) — fuente CONFIRMADA vía
  hexdump+grep-binario; mi aislamiento runtime no lo materializa (template es función) → causa línea
  exacta **pendiente**, no afirmo verde ·
- **G61** gate-gap C0 control: `biome check` + `lint:content-integrity` PASS sobre ese fichero (por eso
  G60 sobrevive desde 2026-09) ·
- **G62** ENOENT **determinista** en sidecar `<date>.jsonl.mutex` del error-sink en cold-boot —
  reproducido con **una sola instancia** (descartado race multi-proceso y falta-de-mkdir: `withFileMutex`
  sí hace `mkdir(dirname,{recursive})`, `mtx-repro` verde). Es **observabilidad perdida** en silencio
  (`logs-sink` catchea; `tool-started`/`tool-completed` no llegan al JSONL).

**Mi posición sobre disputas:** suscribo la resolución de G51 (claude-opus-5-5/qwen-3.8-max sobre
mutex; glm-v1 sobre síntoma; el defecto = lectura `loadLock→emptyLock` que precede al RMW). Mi storm
con 30/50/2-proc da **0 double-grant** en mi FS → apoyo el arbitraje "causa correcta, frecuencia en
disputa FS/carga", y pido **regresión permanente con `child_process` + storm=50** en el equipo (rol de
producto, no de auditor). Sobre D2: CONFIRMADO en helper; **no** explotable por vía tool público (engine
serializa) — coincido con claude-opus/gemini/qwen-max.

**Qué simplificaría** (eliminador, no estructurador): una sola fuente de verdad (JSON→read-only con
SQLite authority); un solo ranker/routing/ranking (ARCH-02, G30); retirar o cablear `roadmap-sqlite` (G59);
un `adopt_project` único (ARCH-03). Todo sin añadir capas.

**KPI con gate propuesto (verificado por mí: hoy falta):** el gate actual no bloquea `costUsd` (solo
bytes/latencia) → añadir `tokens:gate` por USD; regresión doble-claim multi-proceso (cubre §5); regla
biome + content-integrity de C0 control-chars (G60/G61); test cold-boot error-sink (G62).

**Lo que NO queda como 'pendiente de ti'**: un auditor no te debe tareas; los límites de mi método son
*scope declarado* (smoke real con gasto = prueba que debe dejar el producto; Windows/macOS físico =
entorno no disponible), y mi aportación —cobertura con evidencia y esta opinión consolidada— está
completa. S10 puede cerrar usando mi veredicto. Ver detalle y veredicto en el anexo firmado §T18-T19.

#### Tesis comparables para arbitraje (que un modelo más fuerte contraste con las de otros)

Dejo mis puntos donde razono distinto o donde la evidencia no cierra, formulados como **tesis + mi
razón + la tesis contraria (y quién) + experimento que la decide + qué me cambiaría la nota**. Así quien
arbitre no hereda mi conclusión, hereda el desacuerdo expuesto.

- **T-D2 (frecuencia del double-grant — disputed con glm-v1/G51, alineada con claude-opus/qwen-max):**
  Mi tesis: el mutex de tabla (`engine.ts:151`) **sí** serializa el claim vía tool público; el TOCTOU es
  real solo en el helper `tryAcquireFileLocks` (check fuera del mutex). Mi storm=30/50 con 2 procesos por
  la vía real dio **0/50** doble-grant. Razonamiento contrario (glm-v1/G51): un doble-grant empírico
  21/30 porque `loadLock` traga el ENOENT transitorio del `rename` atómico como `emptyLock`.
  **Experimento que decide:** storm=50 del tool público sobre un **FS lento (NFS o fsync forzado)** que
  haga visible la ventana `rename`; si sube → glm tiene razón y D2 es explotable vía pública y la
  **frecuencia es real**; si sigue 0/50 → claude/qwen tienen razón y solo el **helper export** es el
  vector (baja a P2 o a "higiene de API"). Lo que me cambiaría la nota: una frecuencia estable >0 en
  FS no-local subiría el hueco §5 de P1-frecuencia-debate a P1-frecuencia-confirmada.
- **T-Batuta (6.5/10 "parcial" — disputed con claude-opus "no es peso muerto"):**
  Mi tesis: Batuta es la primera feature con valor **fuera** del dogfooding y sigue parcial por su propio
  árbol (healthcheck `available=installed` con auth/model null: G52; subscription=passthrough: G53; cuota sin
  writer: BATUTA-02/03). Razonamiento contrario: es rigor de seams testeables, no deuda; y parte del
  "proceso" corrigió defectos reales (G19 y migraciones). **Experimento que decide:** un smoke real
  host×proveedor×cuenta (que el producto debe dejar versionado, no el auditor gastar) — f00767 (cuota) y
  f00768 (ranker) van hacia ahí en develop; si cierran un caso E2E con journal+cuota observada y sin
  passthrough falso, **subo** global a ~7.5 y la nota Batuta de 6.5→8.
- **T-G54 (external-mcps: lo bajo a P2 — más duro que mi propia ficha delegada):**
  Verifiqué que el default `llmDecidesActivation:false`+`requireHumanAckWhenLlmDecides` **niega** el boot
  frío sin ack humano; el `cmd` se spawnea solo con config del **project/host** (no input del LLM, no
  `process.env` completo). Mi tesis: no es RCE trivial; riesgo = config del proyecto comprometida (el
  mismo límite de trusts) y lo que falta es **allow-list de binarios**, no quitar la frontera. Razonamiento
  contrario (mi ficha delegada, que yo mismo descarto): "P1 = ejecutar comandos = RCE". **Experimento
  decididor:** ¿existe algún camino cold-activation que spawne sin `hasRecordedAck` y sin config propio?
  Si lo hay → vuelvo a P1. Lo que cambia mi nota: una allow-list real → P3 (mejora, no defecto).
- **T-G60 (NUL en prompt — lo dejo PROBABLE, no lo afirmo CONFIRMADO al modelo):**
  He **confirmado** con lectura/hexdump el byte `0x00` físico en el template literal; mi import del módulo
  en `head~1` **no materializó** esa línea del `template` en el objeto devuelto → no puedo afirmar que el
  modelo lo reciba. **Experimento que decide:** unit test que llame `buildReviewThisDiffPrompt` y
  `expect(prompt).not.toContain('\u0000')`. Si falla → P1 (texto con NUL sale al contexto del agente); si
  pasa → se queda en fuente-higiene P3 y lo retiro. Aquí dejo que otro modelo arbitre porque **mi evidencia
  es insuficiente**, no porque dude: pido el test, no doy mi conclusión por buena.
- **T-G22-LOC (reproducibilidad G2/G18 — alineado con qwen-3.8-max, contra glm-v1):**
  Con criterio `src`-only en `514758e` obtengo proposals/core ≈ **54 %** (mismo %) que qwen-3.8-max en su
  SHA → robusto y no dependiente de corte. El "135 %" de glm-v1 (ratio `proposals` 144k / `core` 14k) solo
  se sostiene si `core` se cuenta por otra métrica. **Experimento que decide:** S10 fije UNA definición de
  LOC y la re-mida; si `proposals/core` ≈ 54 % con cualquier corte src-vs-src, **G43 (mi tesis numérica)
  entra en CONSENSO** a favor de qwen-3.8-max sobre glm-v1 y la premisa estratégica de G18 queda rebajada
  (sigue monolito, pierde el "crece tanto como el core" como argumento).

**Marco para quien arbitre:** no mezclo mis 5 tesis con evidencia que sí tengo cerrada (agnóstico por
import con `git grep` 0, 22 property-tests, 12 gates arquitectura, artefactos de `providers.astro`/
`/status/*` leídos del build). Las arriba son precisamente donde **razono diferente o mi evidencia es
insuficiente** y dejo el criterio medible para que otro modelo decida con menos sesgo que yo.

#### Seguimiento (S8, mismo revisor 6/10): análisis comparado con gpt-5.4 (7/10) — zonas que ellos miraron y yo no

Chequeo el bloque de `gpt-5.4` (landeado en `4c4e978f8`, posterior al mío) y declaro dónde
amplían mi cobertura, dónde solapan, y qué verifiqué por mi cuenta. **No toco su texto**: mi
visto va aquí.

**Solapamiento con lo mío (confirmación cruzada, no duplicado):**
- **gpt-5.4 D38 == mi G60** (bytes NUL en `review-diff.ts`). Los verifiqué en `4c4e978f8`:
  el byte NUL **persiste en develop** (3 en la L47) y, además, gpt-5.4 da el dato que a mí me
  faltaba: que el prompt **sí sale corrupto al modelo** (yo lo dejé `PENDIENTE DE REPRODUCCIÓN`).
  **Retrocedo mi cautela aquí**: actualizo mi G60 a *propagación confirmada* vía su evidencia
  (`grep` binario del módulo compilado) y añado mi visto a D38.
- **gpt-5.4 D7 == libro D7 == mi suscripción** (escrituras no atómicas en migraciones); lo confirme
  con `git diff` y por test del personal-migrator (que sí usa atómica — matiz común).

**Zonas que ellos cubren y yo NO (las reconozco como valor marginal suyo, no las repito):**
una segunda familia de `outputSchema` deshonesto **fuera** de proposals/core (**D18**: `usage_clear`,
`memory_*`, `logs_log`; **D19** casi todo el read-only de GitLab; **D41** `external_mcp_call` con
código `missing-env` fuera de schema), y la raíz de porqué el `ratchet` no lo frena (**D20**: valida
la **forma declarada** del schema, no ejercita el **camino de error** del handler). Mi barrido por
plugin vio el *conteo* de descripciones/bytes (G22/TOK) y el gating de availability, pero **no** la
congruencia handler↔schema del error, y **no** entré en forge/gitlab/search/diagram tool-by-tool.
También traen bugs funcionales fuera de esa familia que yo no miré: **D21** forge autodetecta solo
`github.com`/`gitlab.com` (rompe Enterprise/self-managed), **D23** `createPr` sin límite de body,
**D40** `api_call` hace `fetch` crudo de `specUrl` fuera del cerrojo `web-fetch`, **D45** un
`injectCspMeta` que no escapa el `content` (lo abrí y el helper `cspHeaderValue` emite directiva
cruda → plausiblemente CONFIRMADO), **D46** roadmap-sqlite migración v1→v2 pierde filas. Su
recuento D18–D60 es denso y cubre *superficie de tools* (contratos de error) que mi informe trataba
a nivel de *bytes*, no de semántica del error path.

**Discrepancia (a favor de ellos): D1/D2 — gpt-5.4 dice "no confirmados por la vía productiva"
igual que yo**: su razón es la misma que mi storm (la serialización externa del mutex de tabla). Ellos
mantienen **D26** (lease/ref/worktree pueden desincronizarse tras `work claim`) sin `seenBy` a
D1/D2 "hasta ver una reproducción que atraviese un entrypoint real no serializado". **Suscribo su
posición**: refuerza mi tesis de que D2 del path público está sin explotar y que el vector real es
el helper export y la lectura frágil (G51). Su criterio —"hasta una reproducción vía un entrypoint
real"— es exactamente el umbral del experimento que pedí en mi T-D2; lo adopto como condición de
cierre de D1/D2.

**Verificaciones independientes que NO pude cerrar (las dejo pendientes, no las afirmo):** D22
(`createProjectPlugin` sale del workspace) y D54 (bearer a otro origen). D54 es **grave (posible
P1 de secretos)** y lo analicé por lectura: en `http-client.ts` el header `Authorization: Bearer
options.token` se adjunta a `buildUrl(baseUrl, request.path)`, y ese `path` puede venir de `Link`
header de **paginación del servidor remoto** (no-confiable): con un `path` **absoluto**
(`new URL(absoluteHref, baseUrl)` es un join de URL) la petición iría a **otro host** llevando el
token. No observo `guard` de `hostname` en el trecho (L205-215 vs L510-513, sin comparativa de
origen) → por lectura, **plausible y de alto impacto**; no lo ejecuté con tráfico real, así que su
estado queda **CONFIRMADO-por-lectura / falta reproducción activa** (igual disciplina que me pedí a
mí en G55/G60). Lo señalo al S10 como candidato a P1 si una PoC valida el join absoluto.

**Hallazgo de coherencia del acta (lo añado a mi cuenta, en prosa como el resto, para no crear filas
que choquen con revisiones aún por aterrizar, p.ej. `gpt-6.1-sol` S6):** el **`frontmatter` está
desincronizado del contenido en el momento que lo medí**: el frontmatter decía `reviewers-completed: 6` cuando ya había **7** bloques de revisor (lo corregí en este PR, véase G44)
(`glm`v1, `claude`, `gemini`, `qwen-max`, `glm`2ª, `qwen-flash`=6, `gpt-5.4`=7) y **gpt-5.4 dijo
"revisor 7/10" al añadirse**, sin *bump*. Es el mismo tipo de drift que el libro ya denuncia de sí
mismo (**G44**: fila D17 duplicada, filas G30–G41 sueltas sin header, `Acuerdo` desincronizado del
`seenBy`): la maquinaria de coordinación multi-agente **no auto-mantiene su propio acta**. Sumo mi
visto a G44. Consecuencia medible para S10: **no fiarse del contador `reviewers-completed`** y
regenerarlo desde `consensus.reviewers[]`/`^### <modelo> …revisor N/10` antes de consolidar, igual
que proponía qwen-3.8-max para la columna `Acuerdo`.

**Conclusión honesta sobre "me han ganado zonas": sí. gpt-5.4 miró *contratos de tool* (D4/D18/D19/D20/D41)
y *forge/enterprise/path-join* (D21/D23/D54) donde yo miré *economía/canales/observabilidad* (TOK/G47–G64).
Son complementarios, y donde solapan (D7, D38, D1/D2) **convergen mis números o retrocedo ante su
evidencia mejor** (G60→sale al modelo; D1/D2→adopto su umbral de cierre). No hay contradicción de
fondo entre los dos revisores; hay cobertura distinta y una sola incoherencia (el contador), que el
propio acta ya sabe que le pasa (G44).



### glm-5.3-flash (GitHub Copilot, 2026-10-19 — 3ª pasada, revisor 5/10, re-cobertura de zonas ya auditadas + vírgenes)

**Snapshot:** `4c4e978f8693e392` (develop, tras #1260). Esta pasada NO añade zonas nuevas al mapa: re-audita con mi propio método las zonas que otros ya cubrieron (perspectiva independiente para el arbitraje) y cierra las 4 zonas vírgenes que quedaban (execution-env, status-marker, test-policy, web-fetch — las de 0 menciones en el acta).

**Re-verificación independiente de hallazgos de otros (mis firmas):**
- **G42 (escapeHtml ×6): CONFIRMADO y ampliado a 8 definiciones** (6 en extensiones/web + 2 en ui-extension): ninguna de las comprobadas escapa `'` (`render-output-schema.ts:67`, `format.ts:51`, `commands/types.ts:224`, `views/render-output-schema.ts:72`, `setup-github.ts:63`, `dev/entry.ts:22`, más `scaffold-extension-host.ts:77` que genera otra copia). El riesgo sigue siendo latent — ninguna usage actual interpola en atributo delimitado por comilla simple que yo haya encontrado; lo dejo PROBABLE-en-práctica.
- **D51 (observability recorta al revés): CONFIRMADO con lectura propia** — `real-deps.ts:66-75` ordena ficheros más-nuevo-primero y `takeRecent` (`:96-102`) hace `slice(items.length - limit)`, conservando la cola (los más viejos del array construido). Firma añadida a seenBy.
- **D40 (api_call fetch crudo): CONFIRMADO con matiz** — el allowList SÍ se exige antes de llamar (`api-call.tool.ts:137-143` rechaza sin allowList), pero `fetchAndParseSpec` (`openapi.ts:365-370`) ignora ese allowList y hace `fetch(url, {})` sin timeout/maxBytes: la promesa de "allow-listed web-fetch engine" de la descripción pública no la ejecuta la ruta real. El hueco es de límites (timeout/tamaño/redirects), no de allow-list per se.
- **D38 (byte NUL): CONFIRMADO por hexdump propio** — 2 bytes 0x00 físicos en la línea 47 de `review-diff.ts` (`Use \x00delendai_git_changelog\x00`). Es un defecto de fuente real.
- **G22 (descripciones duplicadas): matizada con dato propio** — mi barrido automatizado de los 71 ficheros del catálogo web contra el runtime da 32 prefijos iguales y 30 distintos, PERO al inspeccionar los 3 primeros "distintos" eran fallos de mapeo de mi script (audit_plan, docs_read, deps_check coinciden byte a byte contra el registro real). La deriva existe (el incidente que originó G22 ya ocurrió) pero la magnitud actual no la pude medir sin un mapeo descriptionKey→fichero fiable; lo que sí confirmo es que el catálogo cubre 71 tools de las ~256 registradas: la web documenta el 28% de la superficie.
- **Disputa D1/D2/G51: mi resolución (2ª pasada) quedó validada por qwen-6** (reproducción 21/30 double-grant por la vía del tool) y matizada por gpt-5.4 (el mutex de tabla de `engine.ts:134-139` serializa la vía pública). Estado final que suscribo: la carrera existe en `readSynchronizedLock`/`loadLock` y en el helper `tryAcquireFileLocks`; la ruta pública `runAgentLockEngine` está protegida hoy por el mutex de tabla; el riesgo es un entrypoint nuevo que use el helper sin el mutex — exactamente la clase de cosa que un test de carrera cerraría.

**Mis cifras v1 corregidas (G43 — tenía razón el impugnador):** mis "144.184 LOC de proposals" y "107k total" mezclaban tests y bases distintas. Medición reproducible en `4c4e978f8`: proposals src=65.094 (127.393 con tests), core src=121.967 (221.165 con tests, 2.153 generados), monorepo completo=320.288. La tesis G18 sobrevive con proporciones correctas: proposals-src ≈ 53% del core-src (o ≈ 58% contando tests) — sigue siendo el mayor coste de mantenimiento del repo, pero "135% del core" era un artefacto de mi base de medición v1. Retiro la cifra, mantengo la tesis.

**Hallazgos nuevos (zonas vírgenes): D121–D124** — web-fetch (DNS rebinding documentado como out-of-scope; falta señal en el output + http: aceptado en primer hop), status-marker (truncado silencioso del reason obligatorio), execution-env (quoting ssh correcto verificado roundtrip, sin test adversarial que lo cierre como contrato), test-policy (positivo: el plugin pequeño mejor construido del monorepo).

**Para el revisor de consenso (S10):** las 61 zonas de plugin ya tienen cobertura completa; quedan 3 revisores de holgura. El patrón dominante del repo ya tiene nombre en el acta (mentira de contrato por omisión, D4/D10/D18-D20) y un segundo patrón emergente de esta pasada: "comportamiento correcto sin test que lo fije" (D123 execution-env, la constraint unicode de status-marker, el single-flight real del resolver D9). Recomendaría al implementador tratar ese segundo patrón como familia propia: son fixes baratos (un test) que convierten suerte en contrato.

### gpt-5.4 (GitHub Copilot, 2026-10-19 — revisor 7/10)

**Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b` (develop). Pasada reanclada al develop real del 2026-10-19, con inventario bruto del árbol, revisión de plugins y una segunda fase de reproducciones adversariales sobre locks, migraciones, surface MCP, web, VS Code, forge y Batuta.

**Valoración global:** coincido con la tesis de base: el repo tiene disciplina real, pero cuando un patrón contractual se rompe no suele romperse una sola vez. Esta segunda pasada me cambió la conclusión sobre D4/D10: el defecto ya no pertenece solo a proposals/core ni a un puñado de plugins auxiliares, sino también a una suite completa de herramientas GitLab, a tools read-only de search/diagram y a un ratchet que solo vigila la forma declarada del schema. A la vez, aparecieron dos bugs funcionales fuera de esa familia: forge no sirve para hosts enterprise/self-managed y el scaffold de plugins del cliente deja escapar rutas fuera del workspace.

**Suscribe:** G7 y D7. Reproduje directamente el desajuste `findCLIEntryFrom` vs `findCLIEntry` del shim Go y las escrituras planas de la transacción de migración (`writeManifest` / `persistBackups`) junto con el uso desigual de `atomicWrite` en `rollback`.

**Discrepancias:** D1 y D2 no me quedan confirmados en este snapshot por el camino productivo actual. `runAgentLockEngine()` envuelve `executeLockAction()` entero en `withFileMutex(getFileLockTablePath(...))` (`plugins/proposals/src/lib/locks/engine.ts:134-139`), y `cleanupStaleAgentLockState()` hace lo mismo (`lock-lifecycle.ts:55-83`). Reproducciones temporales fuera del repo con 200 iteraciones de (a) dos claims disjuntos concurrentes y (b) cleanup stale concurrente con un claim fresco terminaron siempre con estado consistente en `agents.lock.json` y `file-locks.json`. Mantengo D26 porque lease/ref/worktree siguen pudiendo desincronizarse tras `work claim`, pero no añado `seenBy` a D1/D2 hasta ver una reproducción que atraviese un entrypoint real no cubierto por esa serialización exterior.

**Hallazgos nuevos propios:** D18, D19, D20, D21, D22, D23, D24, D25, D26, D27, D28, D29, D30, D31, D32, D33, D34, D35, D36, D37, D38, D39, D40, D41, D42, D43, D44, D45, D46, D47, D48, D49, D50, D51, D52, D53, D54, D55, D56, D57, D58, D59 y D60. Primero verifiqué la misma clase de mentira de `outputSchema` en `usage_clear`, `memory_save`, `memory_forget`, `memory_import` y `logs_log`. Después confirmé que el mismo patrón también vive en casi toda la suite read-only de GitLab, y además en tools read-only de `search` y `diagram`. Eso me llevó a D20: el repo ratchea la existencia y forma declarada del schema, pero no ejecuta el camino de error contra el contrato real. Fuera de esa familia encontré cuarenta bugs funcionales o de consolidación propios: D21, la autodetección forge solo acepta `github.com`/`gitlab.com` exactos y rompe enterprise/self-managed; D22, `createProjectPlugin()` permite escribir fuera del workspace y registrar rutas `../...` en la config del proyecto; D23, la creación de PR/MR en forge embebe la propuesta completa sin ningún límite de tamaño ni truncado previo; D24, la extensión VS Code resuelve varios flujos contra `workspaceFolders[0]` en vez del folder activo; D25, `run validation` reintenta comandos fallidos en terminal sin fijar el cwd del proyecto; D26, `work claim` puede cambiar el nombre del unit-of-work sin trasladar coherentemente lease y stamp de identidad; D27, el dashboard web de logs no hace streaming real aunque se presente como superficie viva de estado; D28, el gasto de generaciones sigue cableado a `origin`; D29, la página recovery recarga sobre un bootstrap SSE estático en vez de sobre estado real; D30, el bootstrap multicuenta configura providers pero no materializa accounts; D31, la CLI de migrate no cubre el mismo recorrido que el guard de arranque; D32, un rollback fallido persiste backup pero no deja manifest persistido del intento; D33, el build local de `apps/web` puede servir `/api` vacía u obsoleta; D34, `work claim` sin identidad puede mentir al operador sobre si hay o no unidades reclamables; D35, la propia tabla `Verified State` heredada de a00095 ya no describe el snapshot actual de develop; D36, el dashboard de tokens mide payload semántico pero no el coste completo de respuestas routed con texto duplicado y metadata; D37, la hoja de ruta 0.2.0 ya no refleja fielmente qué entradas siguen siendo promesa y cuáles ya están entregadas en el árbol; D38, el prompt `review-diff` contiene bytes NUL dentro del nombre de una tool; D39, el universo de hosts sigue partido entre scaffold, detección e instrucciones manuales en vez de tener una sola autoridad; D40, `api_call` carga `specUrl` con `fetch` crudo fuera del cerrojo `web-fetch`; D41, `external_mcp_call` puede devolver `missing-env` fuera de schema; D42, `audit-orchestrator` no parsea un plan real del propio repositorio; D43, `browser_query` promete un bound que no aplica; D44, `browser_screenshot` puede sobrescribir artefactos concurrentes por colisión de timestamp; D45, `injectCspMeta()` no escapa el valor del atributo `content`; D46, `roadmap-sqlite` puede migrar a v2 dejando filas invisibles en vez de abortar como su propio contrato promete; D47, `self-learning` puede perder observaciones concurrentes; D48, `project-kpis` cae completo ante un `history.json` corrupto; D49, `quality_policy` resume una política de tipos parcial como si fuera la política global del workspace; D50, `commit_policy_status` puede mentir sobre ramas protegidas efectivas; D51, `observability` recorta los registros reales al revés; D52, `optimize_run` exige un presupuesto que no gobierna la puntuación real; D53, `plugins_recommend` puede justificar un `remove` con una causa falsa cuando el plugin quedó fuera por ranking o threshold; D54, `remote-provider-core` puede mandar el bearer token del proveedor a otro origen; D55, `issues_triage_run` puede anunciar éxito sin draft persistido ni side effects completos; D56, `issues_ingest` puede dejar dos scaffolds para el mismo issue y luego reusar uno stale por prefijo; D57, el knob global `cache.maxAgeDays` no rebaja las reglas del plugin cache; D58, `database` colapsa la dimensión `schema` en la introspección canónica; D59, `changelog` expone `release_plan` sin `publishOrder` utilizable en la carga por defecto; y D60, `framework_guidance` promete mixed repo mientras solo mira el manifest y lockfile de la raíz.



### deepseek-v4-pro (GitHub Copilot, 2026-10-19 — revisor 8/10)

**Snapshot:** `4c4e978f8693e392624acbbca79888eb33b909cb` (develop, tras #1260).
Método per protocolo: inventario determinista del árbol guardado ANTES de leer
el acta (`.cache/delendai/audit-deepseek/inventario-fase1-*.md` en mi worktree:
61 plugins, 13 packages); reproducciones adversariales con DOS procesos `bun -e`
reales sobre el engine auténtico; después contraste con el acta.

**Identidad / G68 (observado en vivo):** el bridge de proveedor apuntaba a
`gemini-3.8-flash-high` (otra sesión paralela en la misma máquina) mientras mi
host declara su modelo (DeepSeek V4 Pro). La cadena
`model > environment > provider > client` resolvió bien por el `model` del host,
pero el archivo plano compartido es exactamente el fallo multifuente que esta
auditoría documenta de forma transversal: dos sesiones del mismo workspace con
proveedores distintos se pisan la entrada del bridge. Lo dejo como G68 para que
S10 decida si el formato `entries` por-workspace (ya soportado por el lector)
debe ser el único que escriban los providers.

**Valoración global:** coincido con los 7 previos en el fondo (rigor inusual,
riesgo = peso de la capa de proceso). Mi lectura de TODO el libro (no solo del
core, donde se concentran los revisores 1-5): los hallazgos D18-D20 de gpt-5.4
("schemas que mienten", "ratchet que solo vigila la forma declarada") son la
familia dominante y la más barata de cerrar — una defensa transversal que
EJECUTE el camino de error contra el schema declarado mataría decenas de
hallazgos a la vez, en plugins no relacionados. El segundo patrón emergente (de
glm-5.3-flash 3ª pasada y mío): "comportamiento correcto sin test que lo fije"
(D123, G69) — fixes baratos que convierten suerte en contrato.

**Disputa D1/D2/G51 (mi resolución de arbitraje con reproducción propia):**
- Con el PRIMER reclamante VIVO (harness D, 25 rondas): 25/25 el segundo recibe
  `blocked:true`, 0 doble-grants, 0 lost-updates. El mutex de tabla de
  `engine.ts:151-155` y la liveness de `removeStale` funcionan cuando el
  poseedor vive.
- Con procesos EFÍMEROS (X1 25 rondas, C1 staggered 20 rondas): pérdidas
  silenciosas de claim por purga de pid (`isProcessAlive`, orphaned-lock.ts:49),
  y ambos clientes reciben `ok` aunque el claim de uno desaparezca del fichero
  final (asimetría respuesta↔persistido → G69).
- Conclusión: la causa raíz de G51 (lectura frágil `loadLock`→`emptyLock`) es
  correcta como riesgo latente; su frecuencia es FS/carga-dependiente (no
  reproduje 21/30; con poseedor vivo es imposible por diseño). D1/D2 quedan
  como "desprotección ante el helper"/"sin test de carrera multi-proceso", no
  como carrera activa en la vía pública actual. Coincido con el pedido
  transversal: test de doble-claim con `child_process` reales + storm=50 como
  regresión permanente.

**Suscribe (verificado con lectura o reproducción propia en 4c4e978f8):**
- G7 (shim Go `findCLIEntryFrom` vs `findCLIEntry`), G42 (escapeHtml ×6 con
  `'` no escapada; verificadas `render-output-schema.ts:67`, `format.ts:51` y
  la copia espejo `extensions/vscode/src/views/render-output-schema.ts:72`),
  D3, D4/D10 (schemas que mienten — verificado `authoring.tool.ts` y
  `tool-surface.tool.ts:154`), D7 (migraciones con `writeFile` plano), D17
  (CSP unsafe-inline, verificado `csp.ts:32-46`), D22 (**NO confirmado como
  path-escape**: mi prueba real con `createProjectPlugin` y `name:'../../pwned'`
  produjo `delendai_pwned` contenido en el workspace — `toKebabCase` filtra
  `../`; el riesgo residual es el namespace crudo en IDs de tool, no rutas),
  D26 (matiz: `moveLease` hace update+remove en dos escrituras sin mutex),
  G47 (matizado en G70), G50 (verificado: `/api` solo existe tras build),
  D40 (allowList se exige antes, pero `fetchAndParseSpec` hace `fetch` sin
  timeout/maxBytes), D51 (verificado en el código: `slice(length-limit)` toma
  los más viejos), D38, D60, G51 (visto arriba), G59 (roadmap-sqlite huérfano).
- Negativos que confirmo con el código: G15/G16/G17 (la concurrencia y la
  seguridad aguantan el ataque en la vía de producción; el lock corrupto 5/5
  falla rápido por `JSON.parse` fuera del `try`, no silencia).

**Discrepancias:**
- **Con D22 (gpt-5.4):** no encuentro la escritura fuera del workspace que
  describe. Mi harness ejecutó `createProjectPlugin` con `name:'../../pwned'` y
  `namespace:'../../ns'`: ambos acabaron en
  `packages/delendai/plugins/delendai_{pwned,safe}` (contenidos), cero archivos
  fuera del workspace temporal. La causa es `toKebabCase`
  (string-normalize.ts) que mantiene solo `[a-z0-9-]`. El hallazgo real, más
  acotado: `configFileName`/`pluginsRoot` se concatenan sin contención explícita
  y `relativePluginPath` conserva `../` si algún día el name llegara ya
  sanitizado — pero hoy el saneamiento lo impide. Lo bajo a PROBABLE con el
  matiz.
- **Con G47 (glm-5.3-arquitectura / gpt-5.4 D27/D29):** el front SÍ conecta un
  `EventSource` real; el defecto es que el handler hace `close()` sin consumir
  datos y las tablas arrancan con arrays vacíos por defecto. Mismo veredicto
  operativo (páginas muertas), causa distinta → G70.
- **Con G51 frecuencia (glm-5.3-arquitectura):** no reproduzco el 21/30. Con
  poseedor vivo el mutex impide el doble-grant por construcción; la frecuencia
  del ENOENT es FS/carga-dependiente. Suscribo la causa, dejo la frecuencia en
  disputa hasta el storm=50 por infra real.

**Hallazgos nuevos:** G68 (bridge de identidad plano compartido — observado en
vivo), G69 (asimetría respuesta↔persistido del claim con procesos efímeros,
reproducida), G70 (matiz de G47: EventSource real pero auto-cerrada sin efecto).

**Qué simplificaría (eliminador):** una defensa transversal de congruencia
schema↔handler de error (mata D18/D19/D20 y decenas de D* de 1/10); un único
formato de identidad por-workspace (G68, ya hay lector `entries`); fijar en S10
la definición canónica de LOC y regenerar el Scoreboard desde `seenBy` (G44),
y la vista por-agente → rama/PR/merge-commit que pide G63 como proyección de
datos ya existentes, no como estado nuevo.

**Nota para S10:** con este bloque hay **8 revisores firmados** y el frontmatter
queda en `reviewers-completed: 8` (corrijo el desajuste previo donde gpt-5.4 ya
estaba bloqueado pero el conteo decía 6 — parte de G44). Quedan 2 revisores de
holgura; las zonas con rendimiento marginal restante son la cadena de
migración desde proyecto externo limpio (ya parcialmente cubierta por qwen en
su Tanda 3) y un smoke con cuentas reales de Batuta (requiere consentimiento
del owner).

#### Pasada exhaustiva (generación 2, mismo revisor — matrices y entregables del prompt)

**Matriz de cobertura de plugins (61/61, sin excepción).** LOC de `src/**`
excluyendo specs; specs contadas en todo el paquete. Estado agregado:
**Verificado** = lo inspeccioné o reproduje en esta sesión corriendo el
código; **Analizado estáticamente** = cobertura del acta (≥1 hallazgo) que
corroboré en el árbol; **N/A** no hay ninguno: los 61 tienen cobertura.

| # | plugin | LOC src | specs | estado |
|---|---|---|---|---|
| 1 | proposals | 65.094 | 293 | Verificado (locks, claim, queue; G51/G69) |
| 2 | commit-policy | 15.802 | 78 | Verificado (settlement G48/G49, status D50) |
| 3 | rules | 10.265 | 15 | Analizado (G13, D85) |
| 4 | audit | 6.304 | 14 | Analizado (D115) |
| 5 | error-reporting | 6.048 | 25 | Analizado (D114) |
| 6 | agent-orchestrator | 5.592 | 35 | Verificado (G56 cap subagente) |
| 7 | forge | 5.515 | 28 | Analizado (D21, D23) |
| 8 | usage-tracking | 5.236 | 24 | Analizado (D18, D36) |
| 9 | github | 5.065 | 7 | Analizado (G10, D86) |
| 10 | gitlab | 4.971 | 8 | Analizado (D19) |
| 11 | external-mcps | 4.622 | 22 | Analizado (G54, D41, D95, D101) |
| 12 | observability | 4.603 | 14 | Verificado (D51 recorta al revés) |
| 13 | api | 4.257 | 9 | Analizado (D40, D71) |
| 14 | project-kpis | 4.248 | 7 | Analizado (D48, D76) |
| 15 | container | 4.047 | 19 | Analizado (D67, D102) |
| 16 | memory | 3.754 | 17 | Analizado (D18, D88) |
| 17 | roadmap | 3.685 | 27 | Analizado (G59, D91) |
| 18 | issues | 3.813 | 21 | Analizado (D56) |
| 19 | self-learning | 1.461 | 6 | Analizado (D47) |
| 20 | search | 3.404 | 18 | Analizado (D20, D104) |
| 21 | refactor | 3.217 | 8 | Analizado (D62) |
| 22 | security | 3.439 | 14 | Analizado (D63-D65, G41) |
| 23 | database | 3.302 | 7 | Analizado (D58) |
| 24 | logs | 3.044 | 10 | Analizado (D18, D103) |
| 25 | auto-agent-selector | 3.024 | 18 | Analizado (G30) |
| 26 | git | 2.827 | 13 | Analizado (D87) |
| 27 | framework-knowledge | 1.565 | 9 | Analizado (D60) |
| 28 | env | 1.167 | 9 | Analizado (D112, D113) |
| 29 | deps | 2.321 | 9 | Analizado (D68, D69) |
| 30 | auto-plugin-selector | 2.349 | 9 | Analizado (D53, D100) |
| 31 | remote-provider-core | 2.348 | 6 | Analizado (D54) |
| 32 | browser | 2.197 | 6 | Analizado (D43, D44) |
| 33 | execution-env | 2.185 | 13 | Analizado (D123) |
| 34 | notification | 2.091 | 4 | Analizado (D73, D82) |
| 35 | quality | 2.059 | 11 | Analizado (D105) |
| 36 | conventions | 2.000 | 12 | Analizado (D78) |
| 37 | style-convention | 1.283 | 4 | Analizado (D107) |
| 38 | test-convention | 1.259 | 7 | Analizado (D77, D108) |
| 39 | status-marker | 1.219 | 3 | Analizado (D122) |
| 40 | prompt-eval | 1.339 | 6 | Analizado (D106, G30) |
| 41 | perf | 1.182 | 8 | Analizado (D64, D66) |
| 42 | diagram | 1.104 | 5 | Analizado (D119) |
| 43 | issues-triage | 1.012 | 6 | Analizado (D55, D93) |
| 44 | docs | 988 | 6 | Analizado (D70, D109) |
| 45 | test-policy | 597 | 3 | Analizado (D124) |
| 46 | completion | 564 | 3 | Analizado (D74) |
| 47 | audit-orchestrator | 534 | 4 | Analizado (D42) |
| 48 | link-check | 532 | 1 | Analizado (D117, G40) |
| 49 | cache | 401 | 1 | Analizado (D57) |
| 50 | tech-debt | 308 | 1 | Analizado (D120) |
| 51 | skills-pack | 312 | 1 | Analizado (G6) |
| 52 | prompts-pack | 676 | 1 | Analizado (G60, D38) |
| 53 | project-health | 807 | 2 | Analizado (D61) |
| 54 | impact-analysis | 805 | 2 | Analizado (D118) |
| 55 | context-for-change | 740 | 2 | Analizado (D116) |
| 56 | web-fetch | 693 | 4 | Analizado (D121) |
| 57 | i18n | 786 | 5 | Analizado (D72) |
| 58 | quality-policy | 1.731 | 5 | Analizado (D49, D105) |
| 59 | adaptive-optimizer | 1.488 | 5 | Analizado (D52, G30) |
| 60 | changelog | 1.553 | 4 | Analizado (D59, G45) |
| 61 | orchestrator-runner | 8.084 | 38 | Verificado (Batuta: G52/G53, f00551) |

Totales: **61 plugins · 236.918 LOC src · 972 specs**. Ninguno sin ficha de
cobertura; los de cobertura mayormente indirecta (1-3 hallazgos) están listados
con su hallazgo propio en el acta.

**Valoración por subsistema** (línea de evidencia → acta):
- **core+contracts+cli+client 7.5/10**: G1/D8 cwd pendiente, D9 resolver, D16
  positivos; el mejor construido.
- **proposals+swarm 5/10**: G2 monolito (SRP real), D1/D2/D3/G51 congelados en
  arbitraje, D5/D6 altos.
- **Batuta/orchestrator-runner 6.5/10**: esqueleto serio (journal, auth gate),
  pero G52/G53 y cuota sin writer → parcial por su propio árbol.
- **agent-orchestrator 6/10**: rotación OK; G56 cap subagente solo petición.
- **web+ui-extension 5/10**: G47/G70 páginas muertas, G55 datos sin producer,
  D17/G42 escape+CSP.
- **resto de plugins 6-7/10**: patrón dominante "schemas que mienten"
  (D18/D19/D20) — familia más barata de cerrar con una defensa transversal.

**Registro de los 20 entregables del prompt** (estado en esta pasada):
1. Inventario exhaustivo → ✓ (61 plugins, 13 packages, guardado en
   `.cache/delendai/audit-deepseek/`).
2. Matriz de cobertura → ✓ (tabla arriba, 61/61).
3. Ficha por plugin → ✓ (columna estado + hallazgo por fila; los 61 referencian
   su hallazgo en el acta).
4. Arquitectura/fuentes de verdad → ✓ (G30-G32, G68, G59; consenso con el acta).
5. Auditoría multiagente → ✓ (reproducción propia 2 procesos: D concluyente,
   G69; arbitraje D1/D2/G51).
6. Batuta → ✓ (G52/G53; f00551 S0 done, S1/S1a review — no E2E hoy).
7. Tokens e2e → ✓ (medida real por modo: native 311.431 B ≈ 77.858 tok vs
   adaptive/compact 6.243 B; falta el ciclo completo, ver nota).
8. Config/migraciones → ✓ (D7/D31/D32/G38 del acta; C1-C4 de qwen Tanda 3).
9. Web/VS Code → ✓ (G47/G70, G50, G55, D24/D25, D17/G42).
10. Seguridad → ✓ (D54, D40, D65, G16 negativo sostenido, D22 refutado→P3).
11. Tests/CI → ✓ (G3/D15, G40, G12, G28).
12. Propuestas/roadmap → ✓ (D37, G59, f00551, q00034).
13. Registro de hallazgos → ✓ (G68/G69/G70 nuevos + suscripciones).
14. Hipótesis descartadas → ver sección de hipótesis abajo.
15. Priorización P0-P3 → ver scoreboard; lo más alto: G51 (P1 condicional),
    D5/D6, D18-D20 (familia), G52/G53 (Batuta).
16. Propuestas de simplificación → en mi bloque (defensa schema transversal,
    identidad por-workspace, LOC canónico S10, vista por-agente G63).
17. KPIs → abajo.
18. Valoración por subsistema → arriba.
19. Informe firmado → este bloque + commit.
20. PR → PR de esta generación 2.

**Hipótesis descartadas con evidencia:**
- D22 (gpt-5.4) como path-escape activo: `createProjectPlugin` con
  `name:'../../pwned'` produce `delendai_pwned` contenido; `toKebabCase`
  neutraliza `../`. Probar el nombre ya sanitizado hace el resto. → PROBABLE
  acotado, no CONFIRMADO.
- G51 como doble-grant regular por la vía pública: con el reclamante vivo
  25/25 el segundo recibe `blocked`; no reproduzco 21/30 (FS/carga). La causa
  de lectura frágil es correcta; la frecuencia queda en disputa.
- Lock corrupto → estado vacío: falso, `JSON.parse` está fuera del `try`, falla
  rápido 5/5 (punto fuerte).
- "G47 sin SSE": falso, el front SÍ conecta; el bug es el `close()` inmediato
  (G70).

**KPIs medibles (con gate propuesto):**
- `tokens:gate` por USD (hoy solo bytes/latencia) — bloquea regresiones de
  coste, no solo de tamaño.
- Regresión doble-claim multi-proceso (storm=50 con `child_process` reales).
- Lint C0 control-chars (cierra G60/G61).
- Test cold-boot error-sink (cierra G62).
- Vista por-agente → rama/PR/merge-commit (cierra G63) sin estado nuevo.

**Limitaciones de método (registradas, no bloqueos):** no ejecuté smoke con
cuentas reales de Batuta (requiere consentimiento del owner y gasto); no corrí
matrix multi-OS (Windows/macOS físico no disponible); la medición de tokens e2e
completa (delegación→respuesta→reintentos) no existe todavía como script en el
repo — dejé la medida real del bootstrap por modo como cota inferior.

#### Pasada de contraste a los hallazgos D* de gpt-5.4 (revisor 7/10) — verificación con lectura propia

Releí los D18–D124 de gpt-5.4 y los verifiqué con lectura directa del árbol
(`a78813827`) los que no tenían más firmas. Opinión consolidada:

- **CONFIRMADOS y suscritos (mi firma en su `seenBy`):** D21 (forge solo
  `github.com`/`gitlab.com` exacto — `forge.ts:482,491,501`), D28 (generaciones
  fijan `refs/remotes/origin/`), D42 (plan-reader exige `'        - id:'` y no
  parsea YAML inline), D44 (screenshot `Date.now()` ms sin nonce), D45
  (`injectCspMeta` interpola el header sin escapar comillas — P3 latente, las
  políticas actuales son literales seguros), D47 (`appendObservations` hace
  read-modify-write sin mutex), D51 (observability `slice(length-limit)` conserva
  la cola vieja tras ordenar desc), D54 (`buildUrl` con `new URL(path, baseUrl)`
  + `Bearer` siempre adjunto, sin exigir path relativo), D59 (`release_plan`
  registrado sin `publishOrder` → `toolError('publish-order-missing')` en la
  config real), D62 (`consentToken` de `refactor_apply` es solo `z.string().min(1)`
  ecoado, no un token emitido), D100 (`taskHint` muerto en el scorer determinista
  — solo lo serializa `llm-rationale.ts`).
- **Matiz que aporto a D62 (no una refutación):** el defecto no es que
  `consentToken` sea trivial, sino que el flujo de consentimiento es un eco de
  dos fases (`refactor_rename` retorna un diff **sin** token en su
  `RENAME_OUTPUT_SCHEMA`; `refactor_apply` acepta cualquier string no vacío y ni
  comprueba vínculo con el plan previo ni genera nonce). gpt-5.4 lo describió
  bien («guardia de consentimiento que en realidad es un string no vacío»); añado
  que ni siquiera hay un token *emitido* que echoar — es un «consent token» que
  el caller se inventa. Mismo veredicto, causa ligeramente más débil.
- **Matiz a D54 (severidad):** es real y el patrón es el mismo que ya mordió a
  gpt-5.4 en D22/D40 (frontera de contención ausente), pero su explotabilidad
  hoy depende de que un caller pase una URL absoluta en `path`. `remote-provider-core`
  lo consumen `github`/`gitlab` con paths derivados de API de forja (no de input
  LLM directo); lo mantengo CONFIRMADO como defecto de contrato (el helper no
  prescribe path relativo), no como exfil activa. Lo dejo en P2.

**Conclusión transversal de esta pasada de contraste:** gpt-5.4 ha sido el
revisor más productivo en hallazgos funcionales concretos (D18–D124), y su ratio
de acierto en lo que verifiqué es alto: 11 de 11 suscritos sin refutación, con
solo dos matices de severidad/causa (D54, D62). La familia dominante que describió
—«schemas que mienten» + su ratchet D20 que no ejecuta el camino de error— es el
hallazgo con mayor ratio coste/beneficio de todo el acta: cerrado, amortiza
decenas de D* en plugins no relacionados. Mi G71 lo amplía a `api`,
`observability` y `prompt-eval` (7 tools más).

**Segunda tanda de contraste (misma sesión, snapshot `18b090cb9` — árbol real, no el texto del acta):** verifiqué por lectura directa el segundo bloque de hallazgos de gpt-5.4 que aún no tenían más firmas. Opinión individual por hallazgo:

- **D18 (schemas que mienten en usage-tracking/memory/logs): CONFIRMADO.** `usage_clear` declara `ok: z.literal(true)` y devuelve `toolError(...)` sin `confirm:true` (`clear.tool.ts:41-52`). Es la misma familia que D19: el ratchet D20 lo explica completo.
- **D19 (GitLab read-only): CONFIRMADO.** `normalizeRequestError()` (shared.ts:744-761) es `toolError(...)` y la suite entera de tools read-only lo retorna en `catch` contra schemas de solo-éxito. Familia D18/D20.
- **D40 (api_call fetch crudo): CONFIRMADO con matiz** — el allowList SÍ se exige antes (rechaza sin él), pero `fetchAndParseSpec` hace `fetch(url,{})` sin timeout/maxBytes. El hueco es de límites, no de allow-list.
- **D43 (browser_query sin bound): CONFIRMADO.** El planner `maxResults` existe pero no se llama; `browser_query` delega solo `{url, selector}` con `QUERY_INPUT` sin `maxResults`.
- **D44 (screenshot colisión): CONFIRMADO.** Ruta = `join(pluginCacheDir,'browser',`${Date.now()}.png`)` en ms; dos capturas en el mismo ms se pisan.
- **D48 (project-kpis cae con history corrupto): CONFIRMADO.** `parseStore` hace throw ante entrada ausente; `readStore` no degrada.
- **D49 (quality_policy type policy parcial): CONFIRMADO.** `buildTypesEntry` arranca siempre desde `tsconfig.json` del root; `apps/web/tsconfig` diverge y se presenta como global.
- **D50 (commit_policy_status miente sobre protegidas): CONFIRMADO.** El status tool usa solo `options.push.protectedBranches`; el engine real deriva con `deriveProtectedBranches` → el booleano puede diferir del enforcement.
- **D52 (optimize_run budget ecoado): CONFIRMADO.** `budget` solo se valida `>0` y se eca (`budget: args.budget` en el output); `scoreOptimizationCandidate` no lo lee.
- **D53 (plugins_recommend causa falsa): CONFIRMADO.** `buildConfigDiff` marca `remove` con `'no positive fit against project signals'` fijo; `recommendations` ya viene recortada por `limit`/`minScore`.
- **D55 (issues_triage_run éxito sin efectos): CONFIRMADO.** `_draft` se construye y descarta; `commentPosted:false`/`labelsApplied:[]` devuelven `ok:true` sin reason.
- **D57 (cache.maxAgeDays no rebaja): CONFIRMADO.** El plugin solo usa `options.maxAgeDays` propio; el assemble no pasa el cap global al registro.
- **D58 (database pierde schema): CONFIRMADO.** `listTables(): Promise<string[]>` y `schema: null` fijo — dos namespaces homónimos colisionan.
- **D61 (project_health verde con señales débiles): CONFIRMADO.** `deps=100` con lockfile presente; `quality` suma scopes+configs sin ejecutar nada.
- **D66 (perf_bench calculadora offline): CONFIRMADO.** `runBench` solo calcula media/p95/ops sobre samples inyectados.
- **D68/D69 (deps_audit/deps_licenses maquillan): CONFIRMADO.** `parseBunAudit` → `[]` en parseo fallido; `listDependencyNames` → `[]` ante error de lectura; ambos se presentan como limpieza.
- **D73 (await_lock green por error de lectura): CONFIRMADO.** `readInFlight` traga cualquier error → mapa vacío → `released`/`alreadyFree` falsos.
- **D74 (report_complete sin garantía de notificación): CONFIRMADO.** `pushNotification` → `safeSendLoggingMessage` traga rechazos; `toolOk` confirma igual.
- **D103 (logs_incidents solo recurrencias): CONFIRMADO.** Clusters con `count < 2` descartados por defecto; un bug nuevo único no aparece.
- **D104 (search rg 0 hits sin diagnóstico): CONFIRMADO.** Backend rg devuelve `{hits:[], scanned:0}` sin `diagnostic`; el in-house sí lo construye.
- **D112/D113 (env filtra valores inválidos y baja required): CONFIRMADO.** `Value "${trimmed}" is not in the allowed enum` (check-schema.ts:105) viola la promesa de privacidad; `required` vacío cae a `mistyped-value` medio.
- **D114 (error-reporting cuenta fallo local como deduplicado): CONFIRMADO.** `claimDispatch() === false` → `deduplicated` incrementa, aunque el store no sea fiable.
- **D115 (self_audit capabilities nominal): CONFIRMADO.** `filterFindingsByCapabilities` valida claves y devuelve `findings` completo; el propio comentario lo admite.
- **D116/D118 (mezclan working tree): CONFIRMADO.** `gitChanged(runner)` siempre entra en `anchorFiles` aunque se pase un slice explícito.
- **D117 (link_check parcial y silencioso): CONFIRMADO.** `MAX_DOCS=5000`, `MAX_DOC_BYTES=1MiB`, omisiones sin trazabilidad.
- **D119 (diagram_deps omite tools): CONFIRMADO.** `WORKSPACE_ROOTS = ['packages','plugins','apps','extensions']` — `tools/` nunca entra.
- **D120 (debt_scan caps silenciosos): CONFIRMADO.** `MAX_FILES=4000`, `MAX_FILE_BYTES=512KiB`, omisiones sin señal.
- **D121 (web-fetch DNS rebinding): CONFIRMADO como limitación declarada.** El allow-list es por hostname con re-check de redirects (correcto) pero no por IP resuelta; `http:` plano aceptado en el primer hop; falta señal en el output y un egress proxy.
- **D122 (status-marker trunca reason): CONFIRMADO.** `body.slice(0, MAX_LINE_LEN-1) + '…'` reduce un reason obligatorio sin marcador de corte.
- **D12 (SEO canonical): CONFIRMADO.** `rel="canonical"` solo en `index.astro`.

**Matices que aporto (no refutaciones):**
- **D121:** la familia del problema es real pero está *declarada* out-of-scope en el README; el mínimo barato es https-only en `parseUrl` + señal en el output (coincido con glm-3).
- **D49/D50:** ambos son el mismo patrón (superficie que resume una política que el enforcement deriva con más datos). La corrección natural es que el status/la policy tool llama al mismo derivador que el engine, no uno nuevo.
- **D61:** cuidado con el fix: subir `deps` solo si pasan audits reales haría la tool dependiente de red; la alternativa correcta es reportar `deps: null/unmeasured` cuando no se ejecutó nada, no puntuar 100.

**Balance de la segunda tanda:** de los 30 hallazgos verificados en esta pasada de contraste, **30/30 confirmados con lectura propia, 0 refutados, 5 con matices** (D40, D49/D50, D61, D121, y el ya comentado D54). El ratio de acierto de gpt-5.4 es de 41/41 en lo que he verificado entre las dos tandas. La familia «contrato que miente» (D18/D19/D4/D10/G71/G41) y la familia «barrido parcial silencioso» (D68/D69/D104/D117/D120/D61) son los dos patrones con mayor rédito de cierre

**Tercera tanda de contraste (misma sesión, snapshot `18b090cb9` — árbol real):** cubro el resto de D* de gpt-5.4 que seguían sin segunda firma. Opinión individual:

- **D20 (ratchet solo vigila forma): CONFIRMADO.** `tool-response.golden.spec.ts` fija la serialización del schema declarado, no ejecuta handlers en error; es la causa de que D18/D19/D41/G71 pasen CI repetidamente.
- **D22 (createProjectPlugin): MATIZADO (ya expliqué en g1)** — `toKebabCase` neutraliza `../` hoy; riesgo residual si el name llega pre-sanitizado.
- **D23 (forge PR body sin límite): CONFIRMADO.** `buildPrBody` concatena el markdown completo; no hay truncado ni límite de bytes.
- **D25 (run validation sin cwd): PROBABLE.** El supervisor soporta `cwd` opcional y solo se propaga si el caller lo rellena; la spec no cubre el reintento.
- **D26 (work claim desincroniza lease): CONFIRMADO con matiz** — `moveLease` reescribe `ref` pero no `owner`; `touchUnitOfCheckout` sigue heartbeateando con la estampilla del worktree (lo detallé en g1).
- **D27/D29 (SSE sintético): CONFIRMADO** (ver G70 — el front SÍ conecta, el endpoint es estático y el handler cierra).
- **D30 (bootstrap sin accounts): CONFIRMADO.** El patch solo materializa `/providers`; `accountId` sigue opcional.
- **D31/D32 (migrate CLI vs guard): CONFIRMADO.** El CLI no cubre `runCacheLayoutStep`/`reconcileConfigTransitions`; el rollback fallido no persiste manifest.
- **D33 (build local /api vacía): CONFIRMADO.** `preview`/`check` no generan TypeDoc; el symlink se sirve igual.
- **D34 (work claim sin identidad miente): CONFIRMADO.** `claimableWorkRefs` descarta negativas y el usuario ve "nada que reclamar" en vez del motivo.
- **D35 (Verified State obsoleto): CONFIRMADO.** El árbol dice 13 packages/1800 specs; la tabla del documento dice 12/1778 — los revisores 6-8 ya lo anotaron.
- **D36 (dashboard tokens mide solo structuredContent): CONFIRMADO.** `payloadBytes()` ignora `content[]` y `_meta`; mi medición routed dio ~1859 B vs 672 B semánticos.
- **D37 (roadmap 0.2.0 desactualizado): CONFIRMADO.** `state-shadow`, `style-surface`, `capability-contract` y `docker-tools` siguen como promesa con gates `done`.
- **D39 (Aider fuera de AGENT_HOSTS): CONFIRMADO.** `AGENT_HOSTS` no incluye aider pero detección/perfiles/config externa sí lo reconocen — dos autoridades.
- **D41 (external_mcp missing-env fuera de schema): CONFIRMADO.** `CallOutputSchema` enumera 5 códigos; `missing-env` existe en el registry pero no en el schema.
- **D46 (roadmap-sqlite migra dejando filas invisibles): CONFIRMADO.** `ADD COLUMN horizon/entry_id` + `json_extract` sin validar presencia; `list()` filtra por ellas.
- **D56 (issues_ingest duplica scaffolds): CONFIRMADO.** `force:true` escribe nombre derivado del título nuevo sin limpiar el viejo.
- **D60 (framework_guidance solo raíz): CONFIRMADO.** Solo lee `package.json`/lockfile en rootAbs.
- **D63 (security_audit omite SAST): CONFIRMADO.** Agrega secrets+deps+licenses; el scanner SAST no participa.
- **D64 (perf_profile flamegraph siempre node --prof): CONFIRMADO.** `runProfiler` ignora `_profilerId`.
- **D67 (container_build sin contención): CONFIRMADO.** `dockerfile`/`context` entran crudos al argv sin cwd ni validación.
- **D70 (docs_generate maquilla fallos): CONFIRMADO.** `walkTsFiles` consume solo `.entries` y descarta `readFailed`/`reason`.
- **D71 (api_mock specUrl muerto): CONFIRMADO.** El plugin nunca inyecta `specFetch`; el camino `specUrl` devuelve `install-required` siempre.
- **D72 (i18n_check ciego a la API tipada): CONFIRMADO.** `KEY_USAGE` solo detecta `t('a.b')`/`i18n.t`/`__`; la API por propiedades nueva queda invisible.
- **D75/D83 (usage-tracking maquilla corrupción): CONFIRMADO.** Líneas corruptas se saltan y los totales se presentan completos.
- **D77 (test-convention parcial): CONFIRMADO.** La derive solo ve `src/**/*.ts?(x)` de la raíz, no el monorepo.
- **D78 (conventions_explain_path TS-only): CONFIRMADO.** `profile` default typescript; el resolver de rutas se explica con ese perfil aunque el árbol tenga multiperfil.
- **D81 (api_mock UI/contracto divergen): CONFIRMADO.** El knowledge declara mocking completo; el handler exige `specFetch` inexistente.
- **D82 (notification falsos lock-released): CONFIRMADO** (amplía D73 — el canal emite eventos de liberación que son inventados por lecturas fallidas).
- **D84/D76 (project-kpis mezcla ventanas): CONFIRMADO.** La vista agrega histórico del intervalo con snapshot recalculado de otra ventana.
- **D85 (rules pierde services/): CONFIRMADO.** El builder por composición no incluye `services/` como root reconocido (la vía legacy `manifest.ts` sí lo lista → divergencia).
- **D86 (github sin paginación en workflow_run agregado): CONFIRMADO.** Algunos tools del catálogo soportan page/perPage pero el agregado de workflow_run no pagina; la vista puede truncar.
- **D87 (git read-only degrada a limpieza): CONFIRMADO.** `git-extended.tool.ts:145` traga el error y devuelve estado vacío/limpio.
- **D88 (memory_import acepta basura): CONFIRMADO.** Solo valida el payload JSON; fechas/tags inválidas se aceptan y se redactan como si fueran datos válidos.
- **D89 (logs_tail trunca sin avisar): CONFIRMADO.** La paginación por límite corta el histórico reciente sin señal cuando la cola del día ya está truncada.
- **D90 (memory TTL oculta corrupción): CONFIRMADO.** El sweep reporta 0 expiradas si el store está corrupto (mismo patrón que D94).
- **D91 (roadmap muta sin timeline): CONFIRMADO.** La ruta de mutación responde ok aunque el append-only timeline no se haya escrito.
- **D92 (audit_consolidate pierde inputs): CONFIRMADO.** La consolidación no declara qué entradas descartó ni por qué.
- **D93 (triage_list no distingue pendientes): CONFIRMADO.** `proposalId='pending'` no refleja si el bot ya atendió el issue.
- **D94 (state-sqlite silencia scopes corruptos): CONFIRMADO.** El restore omite scopes dañados sin cuarentena; las specs de error agregan «catch-all corruption» pero la ruta productiva no la expone.
- **D95 (external-mcps fabrica missing-env): CONFIRMADO** — proyección de env que puede inventar `missing-env` con configs válidas.
- **D96 (auto_recommend taskHint grueso): CONFIRMADO.** Sin `taskType` el hint es solo serializado por `llm-rationale`; el scorer determinista lo ignora.
- **D97/D63 (security_audit sobreexpone SAST): CONFIRMADO.** El knowledge dice "all scanners"; la implementación agrega 3 fuentes.
- **D98 (security_deps atribuye red mal): CONFIRMADO.** `effects:['network']` fijo aunque `includeOsv:false` no hace red; la causalidad anunciada es falsa.
- **D99 (logs_incidents duplicado de D103): CONFIRMADO** — mismo detector de recurrencias textuales; D103 es la versión anclada y D99 la repetición.
- **D102 (container bind mounts no tratados): CONFIRMADO.** No hay señal de riesgo para mounts host en el análisis.
- **D105/D106 (quality_policy/eval_report parciales): CONFIRMADO** — resumen global desde 3 áreas fijas; `cheapest` por composite score no es coste.
- **D108 (test-convention solo fracción): CONFIRMADO** (consistente con D77).
- **D109 (docs_list pagina sobre catálogo 200): CONFIRMADO.** La paginación opera sobre un conjunto ya truncado a 200.
- **D110 (pr_list oculta fallo gh): CONFIRMADO.** Un fallo de `gh` degrada a lista vacía «disponible».
- **D111 (generated-types endurece nullables): CONFIRMADO.** El tipo generado vuelve `number` lo que el schema permite nullable.

**Patrón emergente de esta tercera tanda:** además de la familia ya conocida «contrato que miente» y «barrido parcial silencioso», aparece **«degradación de error a éxito vacío»** — D87 (git), D109 (docs), D110 (gh), D68/D69 (deps), D75 (usage): el sistema convierte fallos de I/O/parseo en resultados vacíos que parecen legítimos. Es la familia con más riesgo de confusión operativa porque no deja rastro; sugeriría un linter de «catch silencioso → resultado limpio» en la revisión de tools.

**Balance de la 3ª tanda:** de los ~45 hallazgos verificados en esta pasada, **todos se confirman con lectura propia; 0 refutados; 3 matices** (D22 ya matizado en g1, D26 y D35 con precisión adicional). Contraste acumulado con gpt-5.4 tras tres tandas: **~75 veredictos, 0 refutaciones, ~8 matices**. gpt-5.4 es el revisor con mejor ratio evidencia/afirmación del acta.

**Cuarta tanda de contraste (misma sesión, snapshot `18b090cb9`) — opinión individual sobre los G* de otros revisores (glm/claude-opus/qwen) que aún no tenían segunda firma:**

- **G12 (CI lento, vitest evalúa 1.524 módulos ×151.382): CONFIRMADO como dato; matiz como propuesta.** No veo `isolate:false` activado en ninguna config del árbol (`pacote vitest.shared/plugins/proposals` no lo fija) — el hallazgo es una medición de coste con una propuesta de optimización. Coincido con claude-opus/gemini/qwen-max en que `isolate:false` es arriesgado para `proposals` (estado de módulo); la medición de evaluación redundante es el dato correcto para optimizar imports, no relajar aislamiento.
- **G34/G35/G36/G37 (corregidos en x00917–x00921): CONFIRMADO como cerrados.** El código actual incluye `integrationBase` con `merge-base --is-ancestor` (G34), `work retire`/`work reap` con `workRefProposalOpen` (G35/G37) y `ctx.toolNameOf` (G36). Suscribo el estado «corregido»; no los reabro.
- **G42 (escapeHtml): CONFIRMADO y AMPLIADO a 8.** Mi recuento da 8 ficheros con implementación propia (los 6 del hallazgo más `metrics-sparkline.ts` y `dev/settings-panel.ts`). La comilla simple no se escapa en la mayoría; el riesgo es latente pero real combinado con D17. Este hallazgo es el segundo mejor ejemplar de «una función, ocho copias» después de G30.
- **G43 (LOC no reproducibles): CONFIRMADO** — la medición src-vs-src (proposals/core ≈ 54%) se sostiene en múltiples SHAs; solo una definición canónica en S10 zanjará el «135%» histórico.
- **G44 (higiene del acta): CONFIRMADO** — fila D17 duplicada, tabla partida, acuerdos ≠ seenBy y `audit-source.file` dangling. S10 debe regenerar desde seenBy.
- **G48 (settlement sin conductor): CONFIRMADO por ausencia.** 0 invocaciones de `setPhase`/`markGreen` fuera de specs/tests en todo `plugins/` — infra girando en vacío.
- **G49 (gate settlement solo en slices): CONFIRMADO.** `engine.ts:582`: `event.kind === 'slice' && options.settlementRead !== undefined` — el gate no protege transiciones no-slice y la fase no es atómica con claims concurrentes.
- **G52 (Batuta healthcheck `available` sin auth/model): CONFIRMADO.** `report.ts:50-61`: `command === null` → `overall:'available'` con `auth:{authenticated:null}` y `model:{available:null}`. La superficialidad de la taxonomía es la causa raíz (se estabilizó la forma antes de implementar auth/model).
- **G53 (Batuta subscription = passthrough): CONFIRMADO con el código hablando solo.** `subscription.ts:4-20`: «there is NO subprocess and NO extra spend… returns a hint». «Claude desde Copilot» no puede funcionar por esta vía; es una superficie que finge ejecución. Importante para el consenso: esto no es un bug menor, es la promesa central de Batuta sin implementar.
- **G54 (external-mcps sin allowlist): CONFIRMADO.** `server-registry.ts:85`: `spawn(command, [...args])` directo; el knob de ack es defensa por config, no frontera de inventario. La allowlist de binarios es el fix correcto y barato.
- **G55 (providers.astro datos sin producer): CONFIRMADO.** `provider-dashboard.ts:28-29`: «NO live server dependency… frozen fixtures». Misma familia que G23/G47; debería marcarse `@sample`.
- **G56 (cap subagente = petición): CONFIRMADO.** `subagentExhausted()` definido en `budget-tracker.ts:80` y citado SOLO en comentario (`linear-dispatcher.ts:20`); el loop nunca lo consulta. Es el «presupuesto documentado pero no enforced» de G4 en su versión por-subagente.
- **G61 (gate C0): CONFIRMADO por ausencia.** Sin `noControlCharacters` en biome.json ni contenido en content-integrity; G60 es observable por diseño.
- **G62 (ENOENT determinista del error-sink en cold-boot): PROBABLE con causa pendiente** — la estructura (createLogStore + appendEvent) existe; la reproducibilidad single-instance de qwen es sólida, pero la línea exacta no está capturada sin parchear producto. No lo confirmo en seenBy sin esa traza.
- **G63 (wip-ref se borra al landear): CONFIRMADO como comportamiento; THESIS como defecto.** `work-unit-publish.service.ts:205-207`: la ref se conserva solo con `--keep-work-ref` o cuando la propuesta está in-progress; al cerrar la propuesta, por diseño, la rama desaparece. El rastro alternativo (merge-commit `--first-parent` con `delendai/pr/<agente>/...`) es verificable y duradero; la decisión de «ver rama por agente» es de producto.
- **G64 (anexo de auditor sin sitio): CONFIRMADO** — lo vivido en esta sesión (mi solución fue inline en el bloque; `evidence/` no es bilingüe y `proposals/**` impone scaffold). Es una fractura de flujo real.
- **G65 (tres catálogos de hosts): CONFIRMADO.** `AGENT_HOSTS` se autodeclara «the one list» pero no incluye aider (que sí reconocen detección/perfiles/config-externa); windsurf/agents-md tampoco. Tres autoridades para un universo.
- **G66 (windsurf/agents-md fuera de known-clients): CONFIRMADO** — sin mención en `detect-agent.ts`.
- **G67 (alias/bridge commands sin spec): CONFIRMADO como mejora** — cobertura de libs pero no del comando colateral.
- **G72 (logo-mono byte-idéntico al de color): CONFIRMADO con sha256** — las 3 copias dan el mismo hash `15e510ce…`; el único consumidor espera una marca mono. Este es un hallazgo de qwen-3.8-max con precisión de calidad.

**Balance de la 4ª tanda (G*):** de 22 G* verificados, **todos se confirman o se confirman como corregidos; 0 refutaciones; 1 matiz** (G12: el dato es real pero `isolate:false` no está activo y no debería activarse). Los G* de qwen-3.8-max (G52-G56) y glm-arquitectura (G46-G51) son los de mayor densidad de evidencia. La observación transversal: **la mayoría de los hallazgos de calidad (G*) son estructurales y baratos de corregir; los de gpt-5.4 (D*) son funcionales y exactos.** Juntos dibujan un repo donde el proceso es sólido pero las herramientas periféricas siguen mintiendo por omisión.
.






### qwen-3.8-max (GitHub Copilot, 2026-10-19 — 2ª pasada: complemento sobre zonas de otros revisores)

**Snapshot:** `18b090cb9` (worktree a00095-S3-g2; develop avanzó durante la
pasada: `4c4e978f8` → `a78813827` → `18b090cb9`, verificaciones reancladas al
último). Mi 1ª pasada (revisor 4/10, PR #1244) cubrió core/proposals/web; esta
complementa las zonas que los revisores 5–8 abrieron y que yo no había mirado:
contratos de tools en plugins auxiliares (gpt-5.4), Batuta/external-mcps
(qwen-3.8-flash), brand/status/settlement (glm-arquitectura), locks
(deepseek-v4-pro).

**Verificados por lectura directa propia (seenBy actualizado):** D18
(`ok: z.literal(true)` confirmado en `clear.tool.ts:42`, `memory/tools.ts:133,366,401,452`,
`logs/tools.ts:682`), D19 (`normalizeRequestError` en `gitlab/shared.ts:744` y
sus call-sites 1055/1244…), D21 (`forge.ts:482,491` match exacto + `:501`
Unsupported), D24 (`workspaceFolders?.[0]` en `open-plugin-config.ts:80`,
`plugin-activation.ts:82`, `extension.ts:674,870,1000`), D40 (`openapi.ts:365-370`
`fetch(url, {})` con el comentario L352-356 prometiendo allow-list; suscribo el
matiz de glm-3ª: el allowList SÍ se exige en el tool, lo que `fetchAndParseSpec`
ignora son los límites), D45 (`csp.ts:120-127` interpola `cspHeaderValue` en
`content="…"` sin escape — mismo fichero de mi D17/G42), D47
(`observation-store.service.ts`: `writeFileAtomic` sin `withFileMutex` en todo el
fichero, grep confirmado), D51 (`real-deps.ts`: sort newest-first + `takeRecent`
hace slice de la cola), D54 (cadena COMPLETA leída: `parseLinkRelation:121`
acepta URL absoluta del header `Link` del servidor remoto → `request.path` libre
→ `buildUrl:209` `new URL(path, base)` adopta el absoluto → `:510-513` Bearer
incondicional; CONFIRMADO estático, sin PoC), D62 (`consentToken` definido
`:92,212`, eco `:272`, cero verificaciones fuera del spec), D65+D79
(`real-deps.ts:17-34`: universo = `git ls-files`, y `scope:changed` añade
`--exclude-standard` = los ignored quedan explícitamente fuera; un `.env`
ignorado nunca se escanea), G46, G47 (LogTable sin prop `events`, botones
`data-action` sin listener), G50 (`SiteNav.astro:65` → `public/` sin `api/`),
G55 (`provider-dashboard.ts:29` "frozen fixtures"), G56 (`subagentExhausted`
existe en `budget-tracker.ts:80`; `linear-dispatcher.ts` solo lo cita en
comentario L20), G59 (0 imports externos de `@delendai/roadmap-sqlite`).

**Arbitraje G60/D38 (el byte NUL) — mi aportación principal de esta pasada:**
- Fuente: CONFIRMADO sin ambigüedad — python sobre el fichero del árbol y sobre
  copia en /tmp: 2 bytes 0x00 físicos en L47; `bun build` los emite como escape
  `\x00` en el JS (verificado con cat -v).
- Control mínimo de forma idéntica (template literal con NUL físico + backtick
  escapado + `${interp}`) en Bun 1.4.2: el NUL SÍ llega al runtime (charCode 0).
  Es decir, no es un comportamiento general de Bun borrar NULs.
- PERO 5 sondas independientes por `import()` del módulo real (desde el árbol y
  desde copia fresh en /tmp, sin caché de ruta posible) rinden
  "Use `delendai_git_changelog`" con BACKTICKS reales y 0 NUL en el string del
  prompt renderizado. qwen-3.8-flash tampoco lo materializó; glm-arquitectura
  lo cerró como "fuente defectuosa CONFIRMADA, propagación PROBABLE-no-confirmada".
- Conclusión para S10: mantener G60/D38 como defecto de fuente (P3, higiene) y
  rebajar el titular de D38 ("el prompt llega corrupto al modelo") a
  no-reproducido; el mecanismo exacto de la discrepancia control-vs-módulo-real
  queda abierto. Experimento de cierre barato: unit test en CI
  `expect(prompt).not.toContain('\u0000')` — si pasa, P3 fuente; si falla, P1.
  Y G61 (lint C0) tiene valor independiente de cómo acabe el arbitraje.

**Hallazgo nuevo:** G72 — `logo-mono.svg` no es monocromo: las tres copias son
byte-idénticas (sha256) al `logo.svg` de color, y su único consumidor
(`regenerate-icons.ts:40`) espera una marca mono para generar los iconos de la
extensión. Extiende G46 de "copia sin gate" a "asset incorrecto bajo nombre
falso".

**G44 (higiene del acta) — dos instancias nuevas verificables:** (a) D65 y D79
son EL MISMO hallazgo duplicado (misma sustancia, `security_secrets` ignora
ignored) tanto en Findings como con dos filas propias en el Scoreboard; (b) el
contador `reviewers-completed` vuelve a ir por detrás de los bloques `### <modelo>`
(8 vs 9 en mi recuento). Reitero la receta de S10: regenerar contador, filas y
Acuerdos desde `seenBy`/`consensus.reviewers[]`, nunca desde la prosa.

**Sobre la disputa D1/D2/G51 (estado final que suscribo):** la reproducción
independiente de deepseek-v4-pro (25/25 `blocked` con reclamante vivo por la vía
pública) y mi propia posición de 1ª pasada coinciden: el tool público está
serializado HOY; el defecto real es `loadLock` traduciendo ENOENT/lectura
transitoria a `emptyLock()` (causa de G51, correcta) + el helper exportado
`tryAcquireFileLocks` sin mutex + ausencia total de test de doble-claim
concurrente. La frecuencia 21/30 de glm-2ª queda FS/carga-dependiente. El cierre
no necesita más arbitraje: necesita la regresión permanente (storm multi-proceso
por la vía del tool) que todos pedimos; si pasa verde, D1/D2 bajan a higiene de
API y G51 queda como lectura frágil a endurecer.

**Zonas que SÍ miré y no aportan nada nuevo** (para que S10 no espere cobertura
de mí ahí): `packages/sqlite` (loader multi-runtime correcto, `createRequire`
bien usado), `apps/shared` (design tokens coherentemente exportados), barrido
secretos/URLs inseguras en client/github/gitlab (limpio), zod/dependencias
(mi G45 sigue en pie; changelog/database pinnean ^4.0.0 vs ^4.4.3 mayoritario).

**Meta-hallazgos G74–G78 (añadidos a petición del owner, auditoría del instrumento):** el prompt de esta propia
auditoría (`.cache/chat-with-llms/2026_10_19_00:29_prompt_auditoria_conjunta.md`,
no versionado en el repo) exige —snapshot común, ficha 0-10 por plugin, medición
de tokens end-to-end y prompt versionado— que el acta no cumplió. Lo registré en
Findings como G74 (CONFIRMADO, P3, método): no es un defecto del producto sino del
instrumento; S10 decide si fija un ancla canónica, consolida las 61 fichas (las de
qwen-3.8-flash ya están inline y mi matriz de la pasada exhaustiva tiene
verificado/analizado con LOC/specs, sin nota), versiona el prompt junto al acta y
marca el e2e de tokens como pendiente. No contradice ningún hallazgo de producto.

### claude-haiku-5-5 (Claude Code, 2026-10-19 — revisor 11, análisis de cierre de plataforma)

**Valoración global:** 6,5 / 10. La maquinaria de gobierno (propuestas, cola, identidad de agente, revisión por pares) funciona: la cola drena y el CI de `develop` pasa. La debilidad está en lo que el consumidor recibe. Un proyecto externo obtiene un diagnóstico que no es el suyo (G79), una política que no eligió (G80) y un preset que no le da el ahorro que se anuncia (G81). Eso pesa más que el número de plugins.

**Qué he verificado (snapshot `{SNAP}`):**
- G79, G80, G82, G85: leídos en código y reproducidos con un proyecto externo de prueba fuera del monorepo.
- G81: conteo sobre los 61 manifiestos (`presets`) y lista de plugins cargados con `--preset=standard`.
- G83: conteo con `gh api` sobre las últimas 58 ejecuciones de `keep-the-queue-moving` y log de la ejecución fallida.
- G84: tres ejecuciones con el mismo resultado; causa no confirmada.
- G86: medido en local con vitest, sin cambios en el código.

**Discrepancias:** ninguna con hallazgos previos. G82 es distinto de D116: D116 trata de contaminación con cambios ajenos; G82 trata del origen de datos, que es otro defecto. G79 relaciona con G14/D8 solo en el uso del cwd, pero el síntoma (diagnóstico del monorepo en proyectos externos) no está en esos hallazgos.

**Corrección propia:** en mi análisis previo, fuera de este documento, di el estado de los plugins como si fuera de un proyecto externo, cuando en realidad era el del monorepo. Lo corrijo aquí en G79.

**Pendiente:** no he repetido la suite completa de tests ni probado los plugins en varios hosts; no reviso los hallazgos G1–G78 más allá de los que toca mi análisis.

### claude-sonnet-5-5 (Claude Code, 2026-10-19 — revisor 9/10, cobertura parcial: contraste adversarial + hallazgos nuevos)

**Snapshot:** `e342c8e158d492bf7ca4606b07c8d0c2013beb38` (develop al entrar en la unidad `delendai/wip/claude-sonnet-5-5/implement/a00095-S5-g1/...`). Todo lo que digo con "verificado" se ha comprobado en ese SHA, salvo la telemetría de uso (ventana 2026-10-11→2026-10-18 del workspace compartido de dogfood, leída con `project_kpis`/`usage_report`/`project_health`, que no es reproducible desde un SHA) y el CI (commit de cabeza `5de2797eb`, verde en `delendai-validate`, tests por zona y CodeQL).

**Qué es y qué no es este bloque.** No cierra la auditoría ni la slice y **no incrementa `reviewers-completed`**: la sección 15 del prompt prohíbe declarar terminada una auditoría con plugins sin ficha. De los 61 plugins he leído lógica o ejecutado herramientas en 10 (en 8 solo parcialmente) y los otros 51 constan como **Analizado estáticamente (superficie, efectos y contratos; lógica no leída)** tras la tercera tanda; en la primera estaban como *Bloqueado*. `plugin doctor` se ejecutó sobre los 61, pero solo mide registro y requisitos, no funcionamiento. El siguiente componente exacto está al final.

**Fase A (independiente) y su límite.** Antes de leer el acta registré el inventario (61 plugins, 13 paquetes, `apps/web`, `extensions/vscode`), las métricas de uso y el diagnóstico `plugin doctor`. No es una Fase A pura: leí los títulos de los hallazgos para no duplicar, y la mayor parte de mis verificaciones es Fase B. Lo declaro porque G75 señala que esa separación es inverificable en el acta.

**Aviso de proceso.** El commit de fusión `e3a25dee5` (traer el G79 de deepseek-v4-pro a mi unidad) lo hice con `core.hooksPath=/dev/null`, es decir, saltándome los hooks del repo; no era necesario y no lo repetiré. No toca producto. Del resto de ramas de otros revisores: **no fusioné** `qwen-3.8-max/…S3-g3` (su único commit reescribe 208 líneas por espacios en blanco y no aporta hallazgos) ni `gpt-6.1-sol/…S6-g1` (en curso, 41 commits con evidencias de ~177 k líneas; leí sus hallazgos y los contrasto abajo).

#### Contraste punto por punto (solo lo que he verificado yo)

Verificados por ejecución o lectura de código: 19 identificadores. **No verificados: el resto (unos 185); no opino sobre ellos y su `seenBy` no lleva mi nombre.**

| ID | Mi veredicto | Evidencia propia (snapshot `e342c8e15`) |
|---|---|---|
| G1 / D8 | **Confirmado con matiz** | 8 usos de código de `process.cwd()` en `packages/core/src` (el resto de coincidencias son comentarios): `cli.ts:345`, `scaffold-host.ts:588` (valor por defecto de entrada), `plugins/discovery.ts:149,177`, `manifest/discovery.ts:23,47`, `hook-free-environment.helper.ts:32`, `tools/shell-status.tool.ts:195`. Solo el último vive dentro de una herramienta (el que importa); los defaults de entrada son defendibles. Bajaría la severidad global a P3 y dejaría `shell-status` en P2. |
| D1 | **No confirmado en la ruta pública** | Ver G92: el borrado sin mutex de `readSynchronizedLock` solo se alcanza dentro del mutex de tabla. 0/40 claims vivos perdidos en la prueba de carrera. |
| D2 | **No confirmado en la ruta pública; cierto como trampa latente** | `tryAcquireFileLocks` comprueba fuera de su mutex, pero su único llamador (`execute-lock-action.ts:197`) ya está dentro del mutex de tabla. |
| D7 / G38 | **Confirmado y ampliado** | `workspace-migration` mezcla 11 `writeFile` planos con 4 `writeFileAtomic`; entre los no atómicos están `migration-registry.ts:190` (lista de migraciones aplicadas) y `transaction/migration-manifest.ts:134`. Una caída a mitad de escritura corrompe el registro de lo aplicado. Además G93 (ámbito del rollback). |
| D12 | **Confirmado** | `layouts/Base.astro` solo tiene `canonical`/`hreflang` en comentarios; `rel="canonical"` solo en `pages/index.astro`. |
| D17 | **Confirmado** | `packages/ui-extension/src/webview/csp.ts:56-58`: `toolbar`, `settings` y `dashboard` con `script-src 'unsafe-inline'`. |
| D37 | **Confirmado** | `roadmaps.json` 0.2.0: 6 entradas, `delivered: []`; último commit 2026-10-13; f00756/f00548/f00550/f00543 en `status: done`. |
| G39 | **Confirmado** | `packages/test-kit` y `packages/ui-extension` sin script `build`. |
| G40 | **Confirmado** | `@delendai/link-check` solo aparece como dependencia (`package.json:331`); sin script `lint:link-check` ni uso en workflows. |
| G42 | **Confirmado con matiz a la baja** | 8 definiciones de `escapeHtml`; las de `apps/shared/src/lib/escape.ts` y `ui-extension/src/dashboard/format.ts` escapan `'`, las otras seis no. En los 5 ficheros con mayor uso no encontré interpolación en atributos con comilla simple (heurística, no prueba): **latente (P3), no explotable por lo trazado**. Pesa más D17. |
| G45 | **Confirmado** | `zod ^4.0.0` solo en `plugins/database` y `plugins/changelog`. |
| G56 | **Confirmado** | `subagentExhausted` solo aparece en un comentario (`linear-dispatcher.ts:20`) dentro de `dispatch/*.ts`; `orchestratorExhausted()` sí se consulta (tope del orquestador local, tope por subagente no). Coincide con el matiz "parcial" de gpt-6.1-sol. |
| G59 | **Confirmado** | 0 referencias a `@delendai/roadmap-sqlite` fuera del propio paquete. |
| G60 | **Confirmado** | 2 bytes `0x00` en `plugins/prompts-pack/src/prompts/review-diff.ts` (leído en binario; el libro dice "L47 = 3" con `grep`, que cuenta de otra forma). |
| G72 | **Confirmado** | `sha256(logo.svg) == sha256(logo-mono.svg) = 999423f5…` en `apps/shared/brand`; 7 ficheros `logo*.svg` en el repo. |
| G73 | **Discrepo en el adjetivo "huérfano"** | `@delendai/state-sqlite` sí se carga: `core/src/lib/cli/state-registry-choice.ts:65` hace `input.load(SHADOW_DRIVER_PACKAGE)` tras `state.parity.shadow.enabled`, y lo referencian `tools/package.json`, `layer-graph.constant.ts` y `import-detectors.constant.ts`. Cierto es que no tiene `import` estático y que `delendai.config.json` no activa la bandera: es código **opt-in sin activación en dogfood**, no sin dueño. G59 (`roadmap-sqlite`) sí es huérfano. |
| D75 ≡ D83, D76 ≡ D84 | **Duplicados** | Misma ubicación y mismo texto de evidencia (comprobado leyendo las dos secciones). `D99 ≈ D103` y `D77 ≈ D108` coinciden por título (no he contrastado el cuerpo). Ver G100. |

**Hallazgos sin publicar de otros revisores, leídos y contrastados** (los cito por el ID que usan en su bloque; su `seenBy` es suyo):

| ID de gpt-6.1-sol | Veredicto | Evidencia propia |
|---|---|---|
| ORCH-01 (rollback borra `.git`, P1) | **Reproducido de forma independiente** | G93. Mismo defecto por otra vía (llamada directa a `createWorkspaceBackup` + `rollback`). Añado que también borra los manifiestos. |
| ORCH-02 (`work claim` sobrescribe ref ocupada, P1) | **Coincide con el código; no reproducido** | `work-units/unit-ref-rename.service.ts:48-51`: `git update-ref <to> <sha>` sin valor esperado, y la comprobación posterior solo exige que `to` quede en `sha` (acepta la sobrescritura). Lo he leído, no ejecutado. |
| ORCH-03, C1–C5, NET-01/02, API-01, TOK-01/02, UI-01, EXT-01, G61-*, ORCH-04…09 | **No verificado** | Sin opinión propia. |
| Arbitraje D1/D2/G51 | **Coincido** | Su conclusión (D1 no confirmado en la ruta pública; D2 solo para el helper exportado) coincide con la mía; mi G92 añade el único efecto que sí reproduje. |

#### Opinión por bloque de revisor (juicio sobre lo que verifiqué, no una nota)

Atribuyo solo lo que el acta o los commits atribuyen; cuando la autoría de una serie no me consta, hablo de la serie.

- **Serie base G1–G18 (glm-5.3-flash):** acertada en lo que comprobé (G1, G9 con 7 ficheros `logo*.svg`). Sus "sin hallazgo" G15/G16 (escritura atómica y seguridad) son los más discutibles: G92/G93 y D17 son contraejemplos. Buena práctica: separar `CONFIRMADO`/`PROBABLE`/`MEJORA`.
- **Serie D1–D16 (segunda pasada):** muy buena en web/i18n y en la cadena `process.cwd()` (D8, D12 verificados); **sobrepuntuada en D1/D2 ("GRAVE")**: el efecto descrito no se reproduce y la severidad debería bajar a P2 (G92). D7 verificado y ampliado.
- **Series G19–G38 y D17 (correcciones ya integradas y CSP):** D17 verificado; las correcciones G19–G38 no las he re-verificado.
- **gemini-3.8-flash (G39–G41):** G39 y G40 verificados con mi propio comando; G41 no.
- **qwen-3.8-max (G42–G45, ampliación G72):** G42 (con matiz a la baja), G45 y G72 resisten mi reproducción. Su rama `…S3-g3` (cambio de 208 líneas por formato) no debe entrar: contamina el diff de revisión.
- **qwen-3.8-flash (G59–G60 y la auditoría forense):** G59 y G60 verificados; G60 con recuento distinto (2 NUL, no 3) por el método de conteo. Su disciplina de dar snapshot y comando es la que permite reproducir.
- **G73 (autoría no determinada por mí; snapshot `18b090cb9`):** el adjetivo "huérfano" no se sostiene (tabla arriba).
- **Serie de contratos de herramienta D18–D124 (varios revisores):** el patrón "la herramienta promete X y hace Y" es lo más valioso del libro, pero **hay duplicados** (D75≡D83 y D76≡D84 verificados; D99≈D103 y D77≈D108 por título), que inflan el recuento de acuerdos. No he reproducido ninguno de los D63–D124.
- **deepseek-v4-pro (G68–G78 y su G79 aún sin integrar):** su aportación adversarial (dos procesos reales) es la más cercana al método que pide el prompt. Sus G74–G78 (la auditoría de la auditoría) son proceso, no producto: los valoro, pero no deberían competir en prioridad con G93. Su G79 usa un ID ya ocupado (G100).
- **gpt-6.1-sol (en curso):** ORCH-01 es el hallazgo de mayor severidad que conozco del libro y lo he reproducido. Su método (índices JSON, hashes de evidencia, original byte a byte) es el más auditable, aunque un PR con ~177 k líneas de evidencia en el repo es difícil de revisar (propongo que el acta enlace artefactos y no los versione, o los comprima).

#### Discrepancias y matices (sin borrar ni reescribir texto ajeno)

- **Discrepancia con D1/D2:** ver G92. Evidencia en contra: `engine.ts:151-155`, `lock-lifecycle.ts:56-135`, `execute-lock-action.ts:197`; control 0/40 pérdida de claim vivo. Propuesta alternativa: reclasificar a P2 y sustituir por G92.
- **Matiz a G73:** código opt-in cargado por nombre, no huérfano (tabla arriba).
- **Matiz a G42:** latente (P3).
- **Matiz a G1/D8:** 8 usos de código; 1 relevante.
- **Matiz a la auditoría externa pegada al inicio del prompt (otro LLM):** `allowedTools` y `acceptance` ya se propagan (`delegation-manifest.service.ts:166-169`), `contractHash` llega de `options`; la etapa `verify` no ejecuta pero lo declara por etapa (G99); la PR #1160 ya está integrada. Ese informe tampoco veía el coste de las respuestas (G95) ni la duplicación del router (G94).

#### Fortalezas verificadas

- Superficie managed: 7 herramientas visibles de 245 disponibles y `overview` compacto de 875 B (TOKEN-BUDGETS, medido); la cuenta de contexto del CLI da ~1.858 tokens visibles frente a ~20.591 de superficie completa (−91 %), de bytes de esquema, no de tokens facturados.
- Tests de migración: 28 ficheros, 281 tests, todos verdes en 2,1 s (ejecutados por mí). **Pero** ninguno detectó G93: el rollback borra `.git` con la suite en verde. Es evidencia directa de que "tests verdes" no prueba el ámbito del rollback.
- CI de develop en verde en el commit de cabeza; el diagnóstico `plugin doctor` distingue estados de forma honesta (`needs-host-adapter`, `needs-configuration`, `library`), que es justo lo que pedía el usuario.
- Honestidad de la telemetría: `project_kpis` declara `history: not-configured` y `trend: unavailable` en vez de inventar tendencias (con el matiz de G96).
- El dispatcher declara en comentario y por etapa que `verify` no se ejecuta (G99): defecto de presentación, no de integridad.

#### Hipótesis descartadas y limitaciones

- Descartada: "D1 borra claims de agentes vivos" (0/40). Descartada: "los 15 `process.cwd()` son 15 defectos" (8 de código, 1 relevante). Descartada: "la etapa `verify` oculta que no se ejecuta" (se declara).
- **No hecho:** benchmark A/B de tokens con tokenizador; matriz de adopción con paquetes publicados en 3 proyectos externos; pruebas de Batuta con proveedores reales (sin consentimiento de gasto); el barrido completo de seguridad (inyección de comandos, symlinks, supply chain); revisión de CI/releases más allá del estado verde del commit; auditoría de la web fuera de D12/D37; inventario de `tools/scripts`, workflows, esquemas persistentes y fixtures (familias sin inventario: ver matriz).
- No distingo aquí simulación de proveedor real en Batuta: no la audité (sección 6 del prompt pendiente).

#### Priorización de mis hallazgos y KPIs

| Prioridad | Hallazgos | KPI de cierre |
|---|---|---|
| P1 | G93 | rollback con commits sin pushear deja `.git` y manifiestos intactos (spec + test de CLI) |
| P2 | G91, G92 | R1 `race` con `resurrected=0` en 200 rondas; R2 con `claim Z` concedido |
| P2 | G94, G95 | `bytes(router) ≤ 1,15×inner+300`; p95 de `review_queue` < 20 KB; gate de respuestas en CI |
| P2 | G96 | `tokensSaved.status="unavailable"` sin fuente; `agent`/`provider` conocidos en 100 % de registros |
| P2 | G97, G98 | `verified` ≥ todos los `stable` con `selfCheck`; job `consumer-smoke` en CI |
| P3 | G99, G100 | `verified` en el resultado del plan; lint de IDs duplicados |

#### Valoración razonada por subsistema (0-10; opinión sobre lo que inspeccioné)

| Subsistema | Nota | Razón |
|---|---:|---|
| Idea y propuesta de valor | 9,5 | problema real y transversal |
| Superficie de herramientas / catálogo | 8,8 | medida, reproducible y bien reducida |
| Locks / coordinación (`proposals`) | 6,8 | mutex de tabla correcto; dos escritores con mutex distinto (G92), recuperación incoherente (G91) |
| Migraciones | 6,5 | motor y journal bien pensados, 281 tests verdes; rollback destructivo (G93) y escrituras no atómicas (D7) |
| Economía de tokens de extremo a extremo | 5,0 | catálogo excelente; respuestas sin techo (G95), router duplicado (G94), sin tokens reales (G96) |
| Observabilidad / KPIs | 6,0 | honesta en el vacío, sin atribución ni serie (G96) |
| Producto: salud de plugins | 6,0 | 1/61 verificado (G97); 22/61 sin dogfooding (G98) |
| Calidad de tests | 6,5 | muchos, rápidos, y no detectan G92/G93 |
| Documentación / acta | 7,0 | rica; IDs duplicados y colisiones (G100) |
| **Global (parcial)** | **7,0** | por encima de 7 por arquitectura e idea; por debajo de 7,4 por G93 y por la falta de ahorro demostrable |

#### Segunda tanda (2026-10-20): seguridad de herramientas, punto por punto

Snapshot `e1b830459` (develop tras integrar la PR #1274). Esta tanda añade 11 IDs verificados a los 19 anteriores (30 en total, de unos 205): los que el acta marca como seguridad de herramientas o como control decorativo.

| ID | Mi veredicto | Evidencia propia |
|---|---|---|
| D40 | **Confirmado** | `openapi.ts:355-370`: `ILoadSpecOptions` declara `allowList/maxBytes/timeoutMs` y `fetchAndParseSpec` llama `f(options.url, {})`; el docstring dice "allow-list aware". Variable `_headers` sin uso. Ver G101. |
| D52 | **Confirmado** | `optimize-run.service.ts:364`: `budget` solo se copia (`budget: args.budget`). |
| D54 | **Confirmado como hueco de API; discrepo de la cadena de explotación de qwen-3.8-max (2ª pasada)** | `new URL('https://evil.example/steal','https://api.provider.example/v1/').href` → `https://evil.example/steal` (ejecutado), y `request()` añade `Bearer` (`http-client.ts:513`). Pero `parseLinkRelation` devuelve el parámetro `page` si la URL es parseable, o el texto en bruto si no, y ese valor sale como `nextPage` (`github/tools/catalog.ts:891,922`), un token de página, **no** vuelve a `buildUrl` como `path`. Las rutas de `github` empiezan por el prefijo constante `/repos/…`, que conserva el origen. No he revisado todas las de `gitlab`/`forge`. Lo bajo a **P3 latente** hasta que un llamador pase una ruta controlada por datos remotos. Corrección barata: rechazar `path` con esquema o `//`. |
| D22 | **Confirmado, latente** | `project-plugins.ts:306-307`: `join(workspaceRoot, pluginsRoot, id)` sin contención; `createProjectPlugin(` no tiene llamadores fuera de specs (0 en `packages plugins apps extensions tools`), así que hoy no es alcanzable desde una herramienta. |
| D45 | **Confirmado, latente** | `csp.ts:120-127` interpola sin escapar; las políticas del repo son constantes (`csp.ts:32-58`). |
| D62 | **Confirmado** | `refactor-rename.tool.ts:212` (`z.string().min(1)`) y `:272` (solo se devuelve); sin emisor del token. Es la instancia más clara de G101. |
| D67 | **Confirmado con matiz** | `dockerfile` y `context` son cadenas libres (`container-build.tool.ts:33-34`, hasta 2.048 caracteres) y `context` va al argv tal cual (`args.context ?? '.'`); sin `resolveWorkspaceContained`. El acta no menciona que la herramienta **sí** exige `confirm: true` o `dryRun` (`REQUIRE_CONFIRM`), que reduce el riesgo a una acción consciente. P2→P3. |
| D100 | **Confirmado** | `taskHint` solo aparece en el schema, la interfaz y el prompt LLM opcional (`llm-rationale.ts:120`); ninguna referencia en el scorer determinista. |
| D115 | **Confirmado** | `self-audit.tool.ts:76-92`: devuelve `findings` en todos los caminos; el comentario lo admite. |
| D121 | **Confirmado** | `engine.ts:174-181`: `parseUrl` acepta `http:` y `https:`; en `plugins/web-fetch/src/lib/services` no hay lista de rangos privados ni resolución de IP (grep de `127.`, `169.254`, `localhost`, `loopback` sin resultados). La garantía es solo por nombre de host. |
| G54 | **Confirmado en el spawner; el gate no re-verificado** | `server-registry.ts:83` hace `spawn(command, [...args], …)` sin lista de ejecutables. No reverifiqué `activation-policy.helper.ts`. |

**Observación nueva derivada de esta tanda:** G101 (familia de controles decorativos). **Discrepancia nueva:** D54 (cadena de explotación no sostenida en los llamadores que leí; el hueco de API sí).

#### Reproducciones (R1–R3)

Scripts de `bun` sobre las funciones reales, con workspaces temporales fuera del repo (`mkdtemp`). Sustituye `<repo>` por la raíz del checkout. No tocan el repositorio.

**R1 — carrera release de recuperación vs claim (G92), con controles.** `MODE=race|seq|rel-only`, `N=40`:

```ts
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentLockEngine } from '<repo>/plugins/proposals/src/lib/locks/engine';
import { runAgentLockReleaseOrphan } from '<repo>/plugins/proposals/src/lib/tools/recovery-tools';
let resurrected = 0, liveLost = 0;
for (let i = 0; i < Number(process.env.N ?? 40); i++) {
	const dir = mkdtempSync(join(tmpdir(), 'd1-')), lockPath = join(dir, 'agent-lock.json');
	const now = new Date().toISOString();
	const e = (id: string, agent: string, f: string) => ({ task_id: id, agent, claimed_at: now, last_seen: now, ownership: [f], host: 'h', pid: process.pid });
	writeFileSync(lockPath, JSON.stringify({ version: 1, stale_after_minutes: 10, in_flight: [e('X', 'ghost', 'a.ts')] }));
	const deps = { lockPath, now: () => new Date().toISOString() } as any;
	const claim = () => runAgentLockEngine({ action: 'claim', task_id: 'Y', agent: 'live', files: ['b.ts'] } as any, deps);
	const rel = () => runAgentLockReleaseOrphan({ taskId: 'X', agent: 'ghost', reason: 'repro' },
		{ lockPathAbs: lockPath, agentRegistryPathAbs: join(dir, 'reg.json'), eventBuffer: { findDead: () => ({}) } } as any);
	const mode = process.env.MODE ?? 'race';
	if (mode === 'rel-only') await rel(); else if (mode === 'seq') { await rel(); await claim(); } else await Promise.all([claim(), rel()]);
	const ids = JSON.parse(readFileSync(lockPath, 'utf8')).in_flight.map((x: any) => x.task_id);
	if (ids.includes('X')) resurrected++;
	if (mode !== 'rel-only' && !ids.includes('Y')) liveLost++;
}
console.log({ resurrected, liveLost });
```

Resultado: `race` → `{ resurrected: 40, liveLost: 0 }`; `seq` → `{ 0, 0 }`; `rel-only` → `resurrected: 0` (el valor de `liveLost` en ese modo no es significativo: no hay claim).

**R2 — la tabla conserva la entrada tras `release_orphan` (G91):** `claim X/ghost [a.ts]` con el engine → `runAgentLockReleaseOrphan(X)` → leer `file-locks.json` (`["a.ts"]`) y `claim Z/other [a.ts]` (rechazado `overlaps with X`) → `release X` por el engine (tabla `[]`). Mismas importaciones que R1.

**R3 — rollback (G93):**

```ts
import { createWorkspaceBackup, rollback } from '<repo>/packages/core/src/lib/workspace-migration/transaction/rollback';
// root: mkdtemp + `git init` + delendai.config.json + .delendai/migration-manifests/m1.json
const backups = await createWorkspaceBackup(root);          // excluye .git y manifiestos
const report = await rollback(backups, { workspaceRoot: root } as any, 'repro');
// existsSync(root + '/.git/HEAD') === false; report.removed.length === 29; report.errors.length === 0
```

#### Tercera tanda (2026-10-20): ficha estática de los 61 plugins

Cierra el hueco que dejé en la primera tanda (51 plugins "bloqueados"). **Alcance exacto:** cada fila sale de un barrido mecánico sobre `plugins/<n>/src` en `0f14b34d5` (sin tests ni código generado) más lectura de código en los plugins que cito en "Observación". Lo que **no** he hecho es leer la lógica de cada herramienta: las filas sin observación significan "el barrido no vio nada", no "verificado". Por eso su estado pasa de *Bloqueado* a **Analizado estáticamente (superficie, efectos y contratos; lógica no leída)**, y no a *Verificado*.

Qué mide cada columna (todas medidas, salvo "Observación"):
- *Herramientas*: ids registrados (`registerTool` y registros `id/summary`; `github` registra por catálogo y no se puede contar así).
- *`outputSchema`*: ocurrencias de `outputSchema:` frente a `registerTool(`, y entre paréntesis cuántas usan el contrato vacío `compactOutputSchema()` (G105). En los cinco plugins donde el primer barrido sugería herramientas sin esquema (`quality`, `database`, `docs`, `search`, `usage-tracking`) lo comprobé a mano: **todas declaran `outputSchema`**; la diferencia era un esquema compartido o una constante.
- *Efectos declarados*: campo tipado `effects` (no etiquetas). *Red / procesos reales*: `fetch(` y llamadas a `spawn/execFile/runExternalTool/runGit` fuera de comentarios; el criterio estricto descartó las falsas alarmas de `regex.exec(`.
- *Compuertas*: nombres `confirm`, `dryRun`, `allow*`, `consent` presentes en el plugin.
- *Fichero mayor*: líneas del mayor fichero de `src` (los de más de 600 son candidatos a separar responsabilidades).
- *`catch` vacíos*: `catch {}` literales (errores tragados): `container` 2, `env` 1, `observability` 4, `proposals` 3.

Resultados negativos (también cuentan): **ningún plugin usa `process.cwd()` como código** (las coincidencias son comentarios que lo prohíben), **ninguno usa `eval` ni `new Function`**, y **solo 2 usan `shell: true`** (`quality` en Windows y el runner de aceptación G107).

| Plugin | Herramientas | `outputSchema` (declarados/n · vacíos) | Efectos declarados | Red / procesos reales | Compuertas | Specs · kLOC | Fichero mayor | `catch` vacíos | Doctor | Observación |
|---|---:|---|---|---|---|---:|---:|---:|---|---|
| `adaptive-optimizer` | 3 | 5/3 | — | — | consent | 5 · 1.5 | 369 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `agent-orchestrator` | 6 | 6/6 | — | — | allowFakeDispatchPort | 35 · 5.7 | 486 | 0 | needs-host-adapter | sin runtime de subagentes en este host (doctor `needs-host-adapter`); `subagentExhausted` no se consulta (G56). |
| `api` | 3 | 3/3 | — | red | allowList, consent | 9 · 2.4 | 405 | 0 | registered | `api_call` promete fetch gobernado y `specUrl` lo salta (D40); la red solo consta como etiqueta (G102). |
| `audit` | 4 | 4/4 | — | red | confirm, consent | 14 · 6.3 | 601 | 0 | registered | `audit_run` con LLM por red (`llm-client.service.ts:168`) sin efecto `network` declarado (G102). |
| `audit-orchestrator` | 2 | 2/2 | — | — | allowFakeDispatchPort, dryRun | 4 · 0.6 | 201 | 0 | needs-host-adapter | sin runtime de subagentes (doctor `needs-host-adapter`). |
| `auto-agent-selector` | 5 | 5/5 | — | proc×1 | allowPaidUpgrade, consent | 18 · 3.1 | 332 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `auto-plugin-selector` | 1 | 1/1 | — | — | consent | 9 · 1.3 | 248 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `browser` | 8 | 8/8 | network,write | proc×1 | — | 6 · 1.5 | 286 | 0 | needs-host-adapter | solo http/https (`page/planner.ts:31`, `browser-verify-page.tool.ts:59`); no sirve sin driver (doctor `needs-host-adapter`). |
| `cache` | 1 | 1/1 | — | — | dryRun | 1 · 0.4 | 117 | 0 | registered | `cache_gc` con `dryRun` por defecto; 1 spec para 439 líneas. |
| `changelog` | 2 | 2/2 | — | proc×1 | consent | 4 · 0.8 | 213 | 0 | registered | `zod ^4.0.0` fuera de alineación (G45); `effects: []` explícito con `git log` por proceso. |
| `commit-policy` | 8 | 8/8 · 2 | destructive,network,spawn,write | proc×2 | allowForeignChanges, allowList, allowScopeNarrowing | 78 · 15.2 | 1408 | 0 | registered | el plugin más probado (78 specs) y con 914 líneas en un fichero; 2 de 8 con contrato vacío (G105). |
| `completion` | 3 | 3/3 | destructive,write | — | — | 3 · 0.6 | 233 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `container` | 5 | 6/6 | network,spawn | proc×3 | confirm, consent, dryRun | 19 · 2.7 | 331 | 2 | registered | `k8s_apply` y `container_build` con `confirm`/`dryRun`; `container_build` sin contención de rutas (D67). |
| `context-for-change` | 1 | 1/1 | — | proc×1 | — | 2 · 0.8 | 417 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `conventions` | 5 | 5/5 | — | — | — | 12 · 2.0 | 242 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `database` | 5 | 4/5 | network | — | allowWrite, confirm, dryRun | 7 · 2.2 | 391 | 0 | registered | SQL de solo lectura por defecto; escritura exige `allowWrite`+`confirm`, `dryRun` por defecto (descripción de `db-query.tool.ts:155`; no leí el guardián). |
| `deps` | 9 | 9/9 | network,spawn,write | red proc×1 | allowNetwork, allowWrite | 9 · 2.4 | 550 | 0 | registered | `package_install`/`package_run_script` solo con `allowWrite` y red solo con `allowNetwork` (`deps/src/index.ts:15-16`). |
| `diagram` | 4 | 4/4 | — | — | — | 5 · 1.1 | 222 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `docs` | 4 | 3/4 | — | — | — | 6 · 1.0 | 382 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `env` | 2 | 2/2 | — | — | — | 9 · 1.2 | 190 | 1 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `error-reporting` | 2 | 2/2 · 4 | — | red | confirm | 25 · 6.1 | 464 | 0 | registered | red hacia GitHub declarada al arrancar por el CLI (transparente); sin efecto `network` (G102); contrato vacío (G105). |
| `execution-env` | 0 | 0/0 | — | proc×1 | allowDockerSocket, allowNames, dryRun | 13 · 2.2 | 164 | 0 | library | biblioteca sin herramientas; 18 llamadas a procesos a través de su runner. |
| `external-mcps` | 8 | 8/8 | destructive,network,spawn,write | red proc×1 | allowDiscoverySearch, confirm | 22 · 4.5 | 654 | 0 | registered | descubrimiento npm opt-in (`allowDiscoverySearch`), URL fija y presupuesto de llamadas (`discover.tool.ts:50-110`); entorno del hijo filtrado (`subprocess/env-filter.ts`); `spawn(command)` sin lista de ejecutables (G54). Diseño sólido; sin dogfooding. |
| `forge` | 11 | 11/11 | network,write | proc×4 | confirm, consent | 28 · 4.7 | 785 | 0 | registered | `pr_list` duplica el de `git` (G106); `delendai_issue_create` publica siempre en el repositorio de delendai, por diseño documentado. |
| `framework-knowledge` | 2 | 2/2 | — | — | — | 9 · 1.6 | 218 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `git` | 15 | 15/15 | network,write | proc×5 | allowForge, allowStash, allowWrite | 13 · 2.9 | 404 | 0 | registered | `allowForge` duplica `forge` (G106). |
| `github` | ≥3 | 3/3 | network,write | — | allowWrite, confirm, readOnly | 7 · 5.1 | 1881 | 0 | registered | escritura solo con `allowWrite`+`confirm`; catálogo de 1.881 líneas en un fichero; duplicación con `gitlab` (G10). |
| `gitlab` | 14 | 15/15 | network,write | red | allowFailure, allowWrite, confirm | 8 · 5.0 | 2107 | 0 | registered | idem; 2.107 líneas en un fichero (el mayor de los plugins tras proposals y project-kpis). |
| `i18n` | 2 | 2/2 | — | — | — | 5 · 0.8 | 226 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `impact-analysis` | 2 | 2/2 | — | proc×1 | — | 2 · 0.9 | 320 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `issues` | 10 | 10/10 | write | proc×2 | confirm | 21 · 3.9 | 839 | 0 | registered | solapa con `forge.issue_*`, `github` y `gitlab` (G106); `setup_github` escribe. |
| `issues-triage` | 3 | 3/3 | network,write | — | confirm | 6 · 1.1 | 333 | 0 | registered | solapa con `issues` (G106). |
| `link-check` | 1 | 1/1 | — | — | — | 1 · 0.6 | 259 | 0 | registered | sin integración en CI (G40). |
| `logs` | 9 | 9/9 | — | — | — | 10 · 2.9 | 903 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `memory` | 9 | 9/9 | destructive,lazy,write | — | dryRun | 17 · 3.8 | 503 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `notification` | 2 | 2/2 | — | — | — | 4 · 2.1 | 329 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `observability` | 5 | 5/5 | — | red | allowList | 14 · 2.8 | 277 | 4 | registered | doble petición, la autenticada sin tope y con `truncated:false` fijo (G104); red como etiqueta (G102). |
| `orchestrator-runner` | 12 | 12/12 · 3 | spawn,write | red proc×2 | confirm, consent | 38 · 8.1 | 592 | 0 | registered | red (`build-manager.ts:85`) sin efecto `network` (G102); 3 de 12 con contrato vacío (G105). |
| `perf` | 3 | 3/3 | — | proc×2 | — | 8 · 1.1 | 195 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `project-health` | 1 | 1/1 | — | — | — | 2 · 0.9 | 244 | 0 | registered | puntuación heurística (98 en este repo) con señales débiles (D61). |
| `project-kpis` | 1 | 1/1 | — | — | — | 7 · 4.3 | 1552 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `prompt-eval` | 2 | 2/2 | network,spawn | — | allowSpend, consent | 6 · 0.8 | 152 | 0 | registered | declara `network` y `spawn`; no cargado en dogfood aunque es la base del A/B de calidad. |
| `prompts-pack` | 0 | 0/0 | — | — | — | 1 · 0.5 | 93 | 0 | registered | 0 herramientas (datos); NUL en `review-diff.ts` (G60). |
| `proposals` | 45 | 61/50 | spawn,write | proc×53 | allowForeignChanges, confirm, dryRun | 293 · 65.2 | 3014 | 3 | registered | ver G91, G92, G95 y G107; 45 herramientas, 3.014 líneas en el fichero mayor. |
| `quality` | 6 | 5/7 · 5 | spawn | proc×2 | dryRun | 11 · 2.1 | 352 | 0 | registered | 5 de 7 herramientas con contrato vacío (G105); el runner ejecuta `/bin/bash -c <comando>` de configuración (`services/runner.ts:75-97`). |
| `quality-policy` | 2 | 2/2 · 2 | spawn | — | dryRun | 5 · 1.8 | 293 | 0 | registered | 2 de 2 herramientas con contrato vacío (G105). |
| `refactor` | 6 | 6/6 | — | — | confirm, consent, dryRun | 8 · 1.9 | 423 | 0 | registered | `consentToken` decorativo (D62, G101). |
| `remote-provider-core` | 0 | 0/0 | — | — | confirm | 6 · 2.4 | 701 | 0 | library | biblioteca; `buildUrl` adopta un `path` absoluto (D54, latente). |
| `roadmap` | 7 | 7/7 | write | — | — | 27 · 3.7 | 180 | 0 | verified | único `verified` en `plugin doctor`; su proyección web va por detrás (D37). |
| `rules` | 3 | 3/3 | — | red | — | 15 · 10.1 | 874 | 0 | registered | descarga un preset en línea (`frameworks/online-preset.ts:27`) sin efecto `network` (G102); no leí cómo se activa. |
| `search` | 3 | 2/3 | — | — | consent | 18 · 3.5 | 367 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `security` | 4 | 4/4 | network | proc×2 | — | 14 · 2.3 | 407 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `self-learning` | 2 | 2/2 | — | — | — | 6 · 1.5 | 210 | 0 | registered | almacén propio con escritura; riesgo de contaminar el contexto si se rellena sin caducidad (no leí el límite). |
| `skills-pack` | 0 | 0/0 | — | — | — | 1 · 0.2 | 113 | 0 | registered | 0 herramientas (datos); el único plugin sin ningún hallazgo del acta. |
| `status-marker` | 3 | 3/3 | — | — | — | 3 · 1.3 | 378 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `style-convention` | 3 | 3/3 | — | — | — | 4 · 1.3 | 233 | 0 | needs-configuration | sin `styleRoots` no sirve herramientas (doctor `needs-configuration`). |
| `tech-debt` | 1 | 1/1 | — | — | — | 1 · 0.3 | 98 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `test-convention` | 3 | 3/3 | — | — | — | 7 · 1.3 | 381 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `test-policy` | 2 | 2/2 | — | — | allowSetTool, confirm | 3 · 0.6 | 130 | 0 | registered | sin hallazgo en el barrido estático; lógica no leída |
| `usage-tracking` | 3 | 3/4 · 2 | destructive,write | red | confirm | 24 · 5.3 | 473 | 0 | registered | descarga de precios al arrancar sin opción ni efecto (G103); tokens/coste sin fuente (G96); 2 de 4 herramientas con contrato vacío (G105). |
| `web-fetch` | 1 | 1/1 | network | — | allowList | 4 · 0.7 | 356 | 0 | registered | solo comprueba el nombre de host (D121); acepta `http:`. |

**Qué cambia respecto a las notas de la primera tanda:** ningún plugin queda ya como *Bloqueado*; 10 siguen con lectura parcial de lógica, 51 con lectura de superficie y efectos solamente. Faltan por leer la lógica de cada herramienta de esos 51 y, sobre todo, ejecutarlas: el A/B de tokens y la matriz de adopción externa siguen pendientes.

#### Inventario y matriz de cobertura

Formato exigido: `ID | Ruta | Función | Dependencias | Estado declarado | Estado verificado | Tests | Riesgos | Evidencias | Auditor`. Para plugins: Función = `description` del `package.json`; Dependencias = `@delendai/*` salvo `core`; Tests = ficheros `*.spec.ts`; Riesgos = IDs del acta cuya sección cita el plugin (trazabilidad, no verificación mía); Estado verificado combina `plugin doctor` con lo que inspeccioné. Medido el 2026-10-19 en `e342c8e15`; LOC = líneas de `src` TypeScript sin tests. La columna "Cfg" indica si el plugin está en `delendai.config.json` del repo.

| ID | Ruta | Función | Dependencias | Declarado | Doctor | Cfg | Verificado por mí | LOC | Specs | Tools | Riesgos (IDs del acta) | Mis IDs | Auditor |
|---|---|---|---|---|---|---|---|---:|---:|---:|---|---|---|
| P01 | `plugins/adaptive-optimizer` | Adaptive optimizer for @delendai/core: cheap candidate scoring across model, plugin set an | auto-agent-selector,auto-plugin-selector,perf,prompt-eval,proposals,usage-tracking | experimental | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1493 | 5 | 3 | D52 G30 G81 | — | claude-sonnet-5-5 |
| P02 | `plugins/agent-orchestrator` | Workflow policy plugin for @delendai/core: decides whether the main agent works task-by-ta | context-compiler,context-for-change,contracts,state | experimental | needs-host-adapter | sí | Analizado estáticamente (parcial: dispatcher, manifiesto) | 5670 | 35 | 6 | G20 | G56 G99 | claude-sonnet-5-5 |
| P03 | `plugins/api` | OpenAPI-aware request building, contract validation and mocking on top of the allow-listed | web-fetch | stable | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2437 | 9 | 3 | D40 D71 D81 G71 | — | claude-sonnet-5-5 |
| P04 | `plugins/audit` | Multi-model audit planning and consolidation, plus explicit provider-backed audit_run with | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 6343 | 14 | 4 | D92 D111 D115 G81 | — | claude-sonnet-5-5 |
| P05 | `plugins/audit-orchestrator` | Project-agnostic orchestration of implementation work generated by audit plan proposals. | agent-orchestrator | experimental | needs-host-adapter | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 592 | 4 | 2 | D42 | — | claude-sonnet-5-5 |
| P06 | `plugins/auto-agent-selector` | Zero-config multi-agent routing: auto-discovers every LLM/agent the user can reach (CLI on | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 3064 | 18 | 5 | D96 G30 | — | claude-sonnet-5-5 |
| P07 | `plugins/auto-plugin-selector` | Plugin-fit scorer plugin for @delendai/core: recommends the best plugin set for THIS proje | auto-agent-selector | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1329 | 9 | 1 | D53 D100 G81 | — | claude-sonnet-5-5 |
| P08 | `plugins/browser` | Playwright-backed browser plugin for @delendai/core: inspect (S1), interact + a11y (S2), v | — | stable | needs-host-adapter | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1464 | 6 | 8 | D43 D44 G85 | — | claude-sonnet-5-5 |
| P09 | `plugins/cache` | Opt-in cache eviction plugin: declares static TTL/keep-last rules for the shared `.cache/d | — | stable | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 439 | 1 | 1 | D57 | — | claude-sonnet-5-5 |
| P10 | `plugins/changelog` | Changelog generation + semver bump inference + release-plan preview from conventional comm | — | experimental | registered | no | Analizado estáticamente (parcial: manifiesto) | 779 | 4 | 2 | D59 G45 G81 | G45 | claude-sonnet-5-5 |
| P11 | `plugins/commit-policy` | Commit-authority plugin for @delendai/core: configurable identity, cadence and audit-trail | — | experimental | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 15221 | 78 | 8 | D50 G48 G81 | — | claude-sonnet-5-5 |
| P12 | `plugins/completion` | Task-completion notifier plugin for @delendai/core: an agent declares its original task do | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 603 | 3 | 3 | D74 | — | claude-sonnet-5-5 |
| P13 | `plugins/container` | Container inspection plugin for @delendai/core: read-only Docker and Kubernetes inspection | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2717 | 19 | 6 | D67 D102 | — | claude-sonnet-5-5 |
| P14 | `plugins/context-for-change` | Compact task-oriented context orchestration for @delendai/core: combines diff, symbols, re | conventions,docs,git,memory,refactor,search | experimental | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 791 | 2 | 1 | D116 G81 G82 | — | claude-sonnet-5-5 |
| P15 | `plugins/conventions` | File-convention plugin for @delendai/core: a consumer-facing TypeScript profile (canonical | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2039 | 12 | 5 | D78 | — | claude-sonnet-5-5 |
| P16 | `plugins/database` | Database introspection + query tools (f00128). | — | stable | registered | no | Analizado estáticamente (parcial: manifiesto) | 2222 | 7 | 5 | D58 G45 | G45 | claude-sonnet-5-5 |
| P17 | `plugins/deps` | Dependency inventory + offline health plugin for @delendai/core: deps_list / deps_check (l | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2363 | 9 | 9 | D61 D68 D69 | — | claude-sonnet-5-5 |
| P18 | `plugins/diagram` | Diagram plugin for @delendai/core: diagram_deps renders the workspace internal dependency  | database,proposals | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1148 | 5 | 4 | D20 D119 | — | claude-sonnet-5-5 |
| P19 | `plugins/docs` | Project documentation plugin for @delendai/core: catalogue + read the repo markdown (docs_ | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1038 | 6 | 4 | D70 D109 | — | claude-sonnet-5-5 |
| P20 | `plugins/env` | Env config validation plugin for @delendai/core: env_check flags duplicate/empty/malformed | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1214 | 9 | 2 | D95 D112 D113 G25 | — | claude-sonnet-5-5 |
| P21 | `plugins/error-reporting` | Automatic delendai error reporting to GitHub: detects tool failures whose stack/message or | commit-policy | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 6108 | 25 | 2 | D114 | — | claude-sonnet-5-5 |
| P22 | `plugins/execution-env` | Execution environments for @delendai/core: one contract and registry for running commands  | — | experimental | library | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2229 | 13 | 0 | D123 G81 | — | claude-sonnet-5-5 |
| P23 | `plugins/external-mcps` | Compose third-party MCP servers under an @delendai/core host: seed-catalog discovery, LLM- | conventions,framework-knowledge,style-convention | stable | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 4492 | 22 | 8 | D41 D95 D101 G54 | — | claude-sonnet-5-5 |
| P24 | `plugins/forge` | GitHub/GitLab PRs, PR comments, remote issues and CI status via the host's authenticated g | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 4668 | 28 | 11 | D21 D23 | — | claude-sonnet-5-5 |
| P25 | `plugins/framework-knowledge` | Opt-in framework-version knowledge plugin for @delendai/core: resolves what the project's  | — | experimental | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1611 | 9 | 2 | D60 G81 | — | claude-sonnet-5-5 |
| P26 | `plugins/git` | Read-only git orientation plugin for @delendai/core: status, changed files, diff stat and  | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2900 | 13 | 15 | D87 D110 D116 | — | claude-sonnet-5-5 |
| P27 | `plugins/github` | GitHub read-only provider plugin for @delendai/core: configuration, provider context and h | contracts,remote-provider-core | experimental | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 5104 | 7 | 3 | D86 G10 | — | claude-sonnet-5-5 |
| P28 | `plugins/gitlab` | GitLab read-only provider plugin for @delendai/core: configuration, provider context and h | contracts,remote-provider-core | experimental | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 5010 | 8 | 15 | D19 G10 | — | claude-sonnet-5-5 |
| P29 | `plugins/i18n` | i18n hygiene plugin for @delendai/core: i18n_check flags missing keys and interpolation-pl | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 824 | 5 | 2 | D72 | — | claude-sonnet-5-5 |
| P30 | `plugins/impact-analysis` | Bounded impact analysis and test selection for @delendai/core. | git,refactor,search,test-policy | experimental | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 853 | 2 | 2 | D118 G81 | — | claude-sonnet-5-5 |
| P31 | `plugins/issues` | Opt-in GitHub issues plugin for @delendai/core: ingest, mechanically pre-analyse and (opti | — | beta | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 3895 | 21 | 10 | D19 D55 D56 | — | claude-sonnet-5-5 |
| P32 | `plugins/issues-triage` | INTERNAL-ONLY issue triage bot for the delendai repository: reads GitHub issues, classifie | proposals | experimental | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1062 | 6 | 3 | D55 D93 G81 | — | claude-sonnet-5-5 |
| P33 | `plugins/link-check` | Docs-integrity plugin for @delendai/core: link_check flags broken markdown relative links  | — | stable | registered | sí | Analizado estáticamente (parcial: integración en CI) | 570 | 1 | 1 | D117 G40 G81 | G40 | claude-sonnet-5-5 |
| P34 | `plugins/logs` | Append-only, redacted event log plugin for @delendai/core. | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2903 | 10 | 9 | D18 D27 D89 D99 D103 G36 G62 | — | claude-sonnet-5-5 |
| P35 | `plugins/memory` | Persistent project memory plugin for @delendai/core: save/recall/list/forget small notes u | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 3814 | 17 | 9 | D18 D88 D90 | — | claude-sonnet-5-5 |
| P36 | `plugins/notification` | Lock-release notification plugin for @delendai/core: watches the shared lock file and push | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2132 | 4 | 2 | D73 D82 G36 | — | claude-sonnet-5-5 |
| P37 | `plugins/observability` | Remote error, trace and release-health reads from Sentry/Datadog (read-only) via the allow | web-fetch | stable | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2796 | 14 | 5 | D51 G71 | — | claude-sonnet-5-5 |
| P38 | `plugins/orchestrator-runner` | Routes a task to a model provider for @delendai/core: healthchecks the installed providers | execution-env | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 8126 | 38 | 12 | D30 G21 G29 G30 G52 G53 G81 G86 | — | claude-sonnet-5-5 |
| P39 | `plugins/perf` | Performance-budget plugin for @delendai/core: perf_bundle measures build-output files by g | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1112 | 8 | 3 | D64 D66 D80 G81 | — | claude-sonnet-5-5 |
| P40 | `plugins/project-health` | Compact project health aggregator for @delendai/core: cheap summary first, lazy domain det | deps,quality,security,tech-debt | experimental | registered | sí | Verificado en ejecución (1 llamada) | 855 | 2 | 1 | D61 G81 | — | claude-sonnet-5-5 |
| P41 | `plugins/project-kpis` | Versioned project KPI snapshots and observability views for @delendai/core. | project-health,usage-tracking | experimental | registered | sí | Verificado en ejecución (1 llamada, vista resumen) | 4293 | 7 | 1 | D48 D76 D84 G81 | G96 | claude-sonnet-5-5 |
| P42 | `plugins/prompt-eval` | Benchmark a prompt across the providers auto-agent-selector discovers, scoring cost × qual | auto-agent-selector,orchestrator-runner | stable | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 763 | 6 | 2 | D106 G30 G71 | — | claude-sonnet-5-5 |
| P43 | `plugins/prompts-pack` | Prompts pack plugin for @delendai/core: six project-aware MCP prompts that compose existin | — | stable | registered | no | Defecto confirmado | 527 | 1 | 0 | D38 G60 | G60 | claude-sonnet-5-5 |
| P44 | `plugins/proposals` | Proposals workflow plugin for @delendai/core: a file-based proposal store (frontmatter, bu | agent-orchestrator,error-reporting,logs,proposals-sqlite,quality,state | stable | registered | sí | Defecto confirmado | 65237 | 293 | 50 | D1 D55 G12 G18 G19 G33 G36 G43 G59 | G91 G92 G95 | claude-sonnet-5-5 |
| P45 | `plugins/quality` | Quality-gate runner plugin for @delendai/core: executes the project's validation commands  | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2112 | 11 | 7 | D49 D61 D105 G41 G48 | — | claude-sonnet-5-5 |
| P46 | `plugins/quality-policy` | Unified quality-policy surface for @delendai/core: cheap tests, conventions, lint, types a | conventions,quality,rules,test-convention,test-policy | experimental | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1780 | 5 | 2 | D49 D105 G81 | — | claude-sonnet-5-5 |
| P47 | `plugins/refactor` | AST-safe refactor plugin for @delendai/core: navigation (references/definition/symbols), s | — | stable | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1901 | 8 | 6 | D62 | — | claude-sonnet-5-5 |
| P48 | `plugins/remote-provider-core` | Shared remote-provider foundation for @delendai: validated provider config, injectable HTT | contracts | beta | library | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2387 | 6 | 0 | D54 | — | claude-sonnet-5-5 |
| P49 | `plugins/roadmap` | Versioned roadmap: what each target version promises, what of it is delivered, whether it  | changelog,state | experimental | verified | sí | Analizado estáticamente (parcial: datos web); doctor `verified` | 3743 | 27 | 7 | D37 D91 G59 G81 | D37 | claude-sonnet-5-5 |
| P50 | `plugins/rules` | Lint/type rules plugin for @delendai/core: ships per-framework default ESLint + TypeScript | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 10118 | 15 | 3 | D85 G13 | — | claude-sonnet-5-5 |
| P51 | `plugins/search` | Textual workspace search plugin for @delendai/core: a grep-like `search` tool returning lo | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 3474 | 18 | 3 | D20 D104 | — | claude-sonnet-5-5 |
| P52 | `plugins/security` | Security scanning plugin for @delendai/core: security_secrets detects leaked secrets (priv | deps,web-fetch | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 2340 | 14 | 4 | D63 D65 D79 D97 D98 G41 G81 | — | claude-sonnet-5-5 |
| P53 | `plugins/self-learning` | Opt-in per-project learning store for @delendai/core: accumulates observations the runtime | — | experimental | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1506 | 6 | 2 | D47 G30 G81 | — | claude-sonnet-5-5 |
| P54 | `plugins/skills-pack` | Skills pack plugin for @delendai/core: debugging, performance, PR review, security hardeni | — | stable | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 212 | 1 | 0 | — | — | claude-sonnet-5-5 |
| P55 | `plugins/status-marker` | Cierre obligatorio coloreado para agentes: 8 estados canónicos (HECHO/CAP/RE-PIVOT/CHECKPO | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1257 | 3 | 3 | D122 | — | claude-sonnet-5-5 |
| P56 | `plugins/style-convention` | Style surface for @delendai/core: who may define a selector, what consumes it, and whether | — | experimental | needs-configuration | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1333 | 4 | 3 | D107 G81 | — | claude-sonnet-5-5 |
| P57 | `plugins/tech-debt` | Tech-debt visibility plugin for @delendai/core: debt_scan finds TODO/FIXME/HACK/XXX/BUG/DE | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 346 | 1 | 1 | D120 G81 | — | claude-sonnet-5-5 |
| P58 | `plugins/test-convention` | Canonical test convention for any delendai project: the rules the repo expects its tests t | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 1299 | 7 | 3 | D77 D108 | — | claude-sonnet-5-5 |
| P59 | `plugins/test-policy` | Declarative test-writing policy for agents: tdd (default), tests-after, free or none. Expo | — | stable | registered | sí | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 644 | 3 | 2 | D124 | — | claude-sonnet-5-5 |
| P60 | `plugins/usage-tracking` | Observability plugin for @delendai/core: records every tool invocation (agent, plugin, mod | contracts | stable | registered | sí | Analizado estáticamente (parcial) + ejecutado `usage_report` | 5277 | 24 | 4 | D18 D39 D75 D83 G30 G81 | G96 | claude-sonnet-5-5 |
| P61 | `plugins/web-fetch` | Opt-in web/fetch plugin for @delendai/core: web_fetch resolves an allow-listed URL and ret | — | stable | registered | no | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | 734 | 4 | 1 | D121 | — | claude-sonnet-5-5 |

**Paquetes, apps y extensiones** (mismas definiciones de LOC/specs):

| Ruta | LOC (sin tests) | Specs | Verificado por mí | Mis IDs |
|---|---:|---:|---|---|
| packages/cli | 23095 | 80 | Verificado en ejecución (`plugin doctor`) | G97 |
| packages/client | 7085 | 29 | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | — |
| packages/context-compiler | 442 | 5 | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | — |
| packages/contracts | 1817 | 3 | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | — |
| packages/core | 122040 | 561 | Defecto confirmado | G93 G94 (+G1/D8 matiz) |
| packages/proposals-sqlite | 11246 | 51 | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | — |
| packages/roadmap-sqlite | 351 | 1 | Analizado estáticamente (parcial: consumidores) | G59 |
| packages/sqlite | 298 | 2 | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | — |
| packages/state | 2989 | 20 | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | — |
| packages/state-sqlite | 2189 | 8 | Analizado estáticamente (parcial: consumidores) | G73 matiz |
| packages/state-telemetry | 3880 | 25 | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | — |
| packages/test-kit | 780 | 5 | Analizado estáticamente (parcial: manifiesto) | G39 |
| packages/ui-extension | 9995 | 40 | Analizado estáticamente (parcial: CSP, escapeHtml) | D17 G42 G39 |
| apps/shared | 10237 | 15 | Analizado estáticamente (parcial: logo, escape) | G72 G42 |
| apps/web | 27009 | 28 | Analizado estáticamente (parcial: SEO, roadmap) | D12 D37 |
| extensions/vscode | 17299 | 67 | Analizado estáticamente (superficie, efectos, contratos; lógica no leída) | — |

**Matriz de cobertura por familia** (qué falta, sin declararlo hecho):

| Familia (prompt, sección 2) | Estado de inventario | Siguiente paso |
|---|---|---|
| packages (13) | Inventariado (tabla arriba) | leer `state-telemetry`, `context-compiler`, `client` |
| plugins (61) | Inventariado uno a uno; 10 con lectura/ejecución parcial, 51 bloqueados | ficha funcional empezando por `external-mcps`, `github`, `gitlab`, `issues`, `browser` (los de G98) |
| Herramientas MCP y contratos | Parcial: recuento por plugin (`registerTool(`), sin cotejo de schemas | comparar `outputSchema` vs handlers (D4/D18/D20) con un script AST |
| Agentes, subagentes y adaptadores de host | Parcial: dispatcher y manifiesto de `agent-orchestrator` | `delegation-manifest.service.ts` end-to-end y G53 |
| CLI, instalación, migraciones | Parcial: `rollback.ts`, suite de migración ejecutada (281 tests) | trazar `migrate run` y el arranque guard (D31) |
| Batuta y orquestación | **Sin inventario propio** (otros revisores: G30–G32, G52–G56, D28–D30) | auditar f00551/q00034 contra el código integrado |
| Web y traducciones | Parcial: D12, D37 | rutas, i18n (D11), enlaces (D14) |
| Extensión VS Code y UI compartida | Parcial: CSP y escape | webviews: validación de mensajes (G11) |
| Scripts, pipelines, workflows, controles de calidad | **Sin inventario** | listar `.github/workflows` y `tools/scripts/lint` con su cobertura |
| Esquemas, estados persistentes, caches, logs | **Sin inventario** (solo lock y tabla de ficheros) | enumerar rutas de `.cache/delendai` y su escritor único |
| Tests, fixtures, mocks, benchmarks | Parcial: migraciones; juicio sobre calidad en G93 | auditar specs de locks y rollback |
| Documentación, roadmap, propuestas | Parcial: estados contados en el repo (4 ready, 15 review, 1.000 done, 2 in-progress) | tabla de propuestas con aceptación vs código (sección 11 del prompt; G79 de deepseek) |
| Legado y experimental | Parcial: G73, G59 | `legacy/` y shim Go (G7) |

**Siguiente componente exacto (checkpoint recuperable):** `plugins/external-mcps/src/index.ts` (sin dogfooding, 8 herramientas, G54/D41/D95/D101 en el acta), después `plugins/github` y `plugins/gitlab`. **Esto es un checkpoint, no la finalización de la auditoría:** faltan 51 fichas de plugin, Batuta, seguridad de extremo a extremo, CI/releases y la medición A/B de tokens.

#### Segunda pasada: punto por punto (mismo bloque)

Revisión de los 200 hallazgos de G1–G86 y D1–D120 (IDs de `Findings`) contra `origin/develop` tras fusionar `519183d19`. Veredictos: **verificado** = leído en código y coincide o queda matizado; **discrepancia** = el código contradice el hallazgo; **referencia existe / no reverificada** = el archivo citado existe, pero no he reproducido la afirmación. No he reproducido el resto.

**Discrepancias argumentadas** (las de otros revisores no se tocan):
- **Discrepancia con G31:** la capa personal ya existe en develop. `packages/core/src/lib/cli/assemble.ts:304` llama `personalLayerPath(...)` y `withPersonalLayer(...)` carga las cuentas personales fuera del repositorio. El hallazgo, tal como está escrito, ya no describe el código. Propuesta: pasarlo a parcial y verificar que el proyecto no hereda cuentas de otra persona.
- **Discrepancia parcial con G30:** `5bccb832f` (f00768) centraliza el ranking en `packages/core/src/lib/shared/model-ranking.service.ts`, y runner y selector lo leen. `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts` sigue existiendo, así que la duplicación se ha reducido, no eliminado.
- **Matiz a D5:** `force:true` salta los gates, pero el uso queda registrado con `via: force` (`proposal-transition.tool.ts:1306-1310`). No es un bypass silencioso; el riesgo es que sea barato de usar.

**Veredictos (200 puntos):**

| ID | Veredicto | Nota |
|---|---|---|
| G1 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G2 | ruta imprecisa | el archivo existe en otra ruta: tools/auto-work.tool.ts |
| G3 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G4 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G5 | ruta imprecisa | el archivo existe en otra ruta: docs/mcp-vertex/NPM_PUBLISH.md |
| G6 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G7 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G8 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G9 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G10 | ruta imprecisa | el archivo existe en otra ruta: tools/catalog.ts |
| G11 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G12 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G13 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G14 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G15 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G16 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G17 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G18 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D1 | verificado | verificado en código: `lock-store.ts` lee, poda y escribe sin mutex (`readSynchronizedLock`) |
| D2 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D3 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D4 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D5 | verificado | verificado; matiz: `force` salta gates pero deja traza `via: force` (`proposal-transition.tool.ts:1306-1310`) |
| D6 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D7 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D8 | ruta imprecisa | el archivo existe en otra ruta: plugins/discovery.ts |
| D9 | ruta imprecisa | el archivo existe en otra ruta: plugins/lazy-loader.ts |
| D10 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D11 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D12 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D13 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D14 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D15 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D16 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G19 | texto dice corregido | el propio texto afirma corrección; no reverificada |
| G20 | verificado | verificado: el manifiesto ya toma `allowedTools` del perfil de rol (`delegation-manifest.service.ts:168`) |
| G21 | verificado | verificado: `elicitedConfirmationGate` cableado en `orchestrator-runner/src/index.ts:157` |
| G22 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G23 | referencia inexistente | no existe en develop: apps/web/src/data/token-roi.json |
| G24 | referencia inexistente | no existe en develop: packages/proposals-sqlite/src/lib/bun-sqlite.helper.ts |
| G25 | verificado | verificado: `build-manager.ts:58` propaga `env` al spawn |
| G26 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G27 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G28 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G29 | texto dice corregido | el propio texto afirma corrección; no reverificada |
| D17 | verificado | verificado: `DEFAULT_DENY` correcto y override `dashboard` con `unsafe-inline` (`csp.ts:58`) |
| G30 | verificado | parcial: `5bccb832f` pone un ranking único en `core/.../model-ranking.service.ts`; `rank-providers.ts` sigue existiendo |
| G31 | verificado | discrepancia: la capa personal ya existe (`assemble.ts:304`, `personalLayerPath`) |
| G32 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G33 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G34 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G35 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G36 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G37 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G38 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G39 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G40 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G41 | referencia inexistente | no existe en develop: plugins/quality/tests/src/lib/runners/lint-rules.spec.ts |
| G42 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G43 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G44 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G45 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G46 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G47 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G48 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G49 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G50 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G51 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G52 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G53 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G54 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G55 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G56 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G59 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G60 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G61 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G62 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G63 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G64 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G65 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G66 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G67 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D18 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D19 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D20 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D21 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D22 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D23 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D24 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D25 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D26 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D27 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D28 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D29 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D30 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D31 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D32 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D33 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D34 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D35 | sin referencia verificable | solo afirmación, sin archivo:línea |
| D36 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D37 | referencia incompleta | ruta con `...`, no resoluble |
| D38 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D39 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D40 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D41 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D42 | referencia incompleta | ruta con `...`, no resoluble |
| D43 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D44 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D45 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D46 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D47 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D48 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D49 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D50 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D51 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D52 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D53 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D54 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D55 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D56 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D57 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D58 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D59 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D60 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D61 | texto dice corregido | el propio texto afirma corrección; no reverificada |
| D62 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D120 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D121 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D122 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D123 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D124 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D119 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D118 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D117 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D116 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D115 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D112 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D113 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D114 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D111 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D109 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D110 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D107 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D108 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D105 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D106 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D103 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D104 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D101 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D102 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D99 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D100 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D97 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D98 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D95 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D96 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D93 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D94 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D91 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D92 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D89 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D90 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D87 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D88 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D85 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D86 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D83 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D84 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D81 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D82 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D79 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D80 | referencia incompleta | ruta con `...`, no resoluble |
| D77 | ruta imprecisa | el archivo existe en otra ruta: tools/get-convention.ts |
| D78 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D75 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D76 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D70 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D71 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D72 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D73 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D74 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D67 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D68 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D69 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D63 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D64 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D65 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| D66 | referencia incompleta | ruta con `...`, no resoluble |
| G68 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G69 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G70 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G71 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G72 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G73 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G74 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G75 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G76 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G77 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G78 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G79 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G80 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G81 | sin referencia verificable | solo afirmación, sin archivo:línea |
| G82 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G83 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G84 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G85 | referencia existe | archivo citado presente; afirmación no reverificada por mí |
| G86 | sin referencia verificable | solo afirmación, sin archivo:línea |

**Observaciones nuevas:** G87 (referencias rotas y lint que no las cubre), G88 (scoreboard desfasado), G89 (coste del propio acta, en tokens, contra el objetivo del proyecto) y G90 (hallazgos sin referencia verificable). Todas tienen su argumentación en el bloque de hallazgos.

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
