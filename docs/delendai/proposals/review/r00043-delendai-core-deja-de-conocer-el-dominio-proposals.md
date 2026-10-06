---
id: r00043
title: "`@delendai/core` deja de conocer el dominio `proposals`"
kind: refactor
status: review
type: proposal
track: architecture
date: 2026-08-30
parent-plan: q00011
priority: P2
audit-source:
    file: docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E05
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
related: [q00011, r00040, r00041, r00042, r00034]
last-transition-id: 3a18803f-e028-4ca4-ae61-ade2700db73a
last-correlation-id: 3a18803f-e028-4ca4-ae61-ade2700db73a
last-transition-from: in-progress
shipped-in:
  - "dc61a40ec"
  - "7c861d2f9"
  - "039bb517e"
  - "b7dcf3901f55b3b42f6bbd51e1d491a93e67ef1c"
  - "522aabfc31e6"
---

# r00043 — `@delendai/core` deja de conocer el dominio `proposals`

## Goal

Restablecer una frontera arquitectónica explícita entre el núcleo agnóstico
`@delendai/core` y el plugin de dominio `proposals`, sin romper la
compatibilidad del servidor ni eliminar las capacidades de adopción,
orientación o fachada estable que los hosts actuales ya consumen.

El resultado deseado es que el core defina contratos, puntos de extensión y
composición genérica, mientras que `proposals` aporte mediante un adaptador
sus herramientas, su índice, su bootstrap de estado y sus operaciones de
ciclo de vida. Un proyecto que use el core sin cargar `proposals` no debería
necesitar conocer la estructura de propuestas ni recibir rutas o mensajes
específicos de ese plugin.

## Why

La separación declarada entre core y plugins no es completa. Existen
acoplamientos de dominio en varios puntos de `packages/core`:

- `packages/core/src/lib/adopt/adopt-project.tool.ts` crea y modifica la
  configuración de `proposals` de forma explícita, asume que `issues` depende
  de `proposals` y genera pasos de adopción ligados a ese flujo.
- `packages/core/src/lib/api/stable-facade.ts` mantiene descriptores de
  herramientas cuyo `plugin` es literalmente `proposals`, aunque la fachada
  viva en el core.
- `packages/core/src/lib/cli/assemble-skills.ts` lee el índice de propuestas
  desde el ensamblador general y deriva `recommendedNextAction` a partir de
  si `proposals` está cargado.
- El contrato de composición actual permite que el core termine siendo el
  lugar donde se decide qué significa una propuesta, en vez de limitarse a
  ofrecer una extensión de capacidades.

Estos puntos funcionan hoy y algunos fueron diseñados como integraciones
prácticas, pero hacen que el core deje de ser agnóstico: una nueva máquina de
trabajo, otro plugin de workflow o un host que no use propuestas debe cargar
con vocabulario, rutas y supuestos que no le pertenecen.

El acoplamiento tiene cuatro costes concretos:

1. **Dependencia invertida.** El core conoce nombres, rutas y estados del
   plugin, mientras que la composición genérica debería depender de contratos
   y capacidades, no de una implementación concreta.
2. **Adopción no portable.** `adopt_project` no describe sólo cómo adoptar
   delendai; prescribe también cómo se inicializa el almacén de propuestas.
3. **Fachada estable mezclada.** Una API declarada por el core publica
   herramientas de un plugin concreto y hace que la estabilidad del core
   dependa de cambios en `proposals`.
4. **Evolución más cara.** Cambiar el índice, los estados o el layout de
   propuestas obliga a revisar el ensamblado del core aunque el contrato MCP
   general no haya cambiado.

El objetivo no es conseguir una pureza teórica ni dividir el repositorio en
micro-paquetes. Es colocar cada decisión en el dueño correcto y conservar una
integración explícita, testeable y reversible.

## Why this design

Se adopta una migración incremental en cuatro movimientos:

1. **Inventario antes de mover.** Identificar imports, strings de dominio,
   rutas, mensajes, tipos y pruebas que hacen que `packages/core` conozca
   `proposals`. El inventario será la fuente de verdad para evitar que una
   búsqueda parcial deje acoplamientos invisibles.
2. **Contratos pequeños en el core.** Introducir interfaces agnósticas para
   capacidades como `adoption extensions`, `workflow summaries`, `stable tool
   descriptors` y `next-action providers`. El core define el contrato; el
   plugin implementa el adaptador.
3. **Registro de capacidades en la composición.** El ensamblador recibe
   contribuciones de plugins cargados, en lugar de importar o inspeccionar
   `proposals` directamente. La ausencia del plugin debe producir una
   experiencia válida y genérica, no un camino especial roto.
4. **Compatibilidad durante una ventana.** Se mantienen los nombres públicos
   y el comportamiento observable cuando `proposals` está cargado. Las rutas
   internas específicas se deprecian sólo después de que el adaptador y los
   tests de equivalencia estén activos.

Se descarta una reescritura total de `adopt_project`, `stable-facade` y
`assemble-skills` en una sola slice: esos módulos tienen distinto riesgo,
distintos consumidores y distintas condiciones de arranque. La propuesta
entrega primero el contrato y después migra cada punto de acoplamiento con
una prueba de equivalencia.

## Non-goals

- No eliminar el plugin `proposals` ni sus herramientas MCP.
- No mover toda la lógica de `proposals` a un nuevo paquete en una sola fase.
- No cambiar la máquina de estados, el layout o la semántica de persistencia
  de propuestas salvo que una migración concreta lo necesite.
- No eliminar inmediatamente los descriptores estables de propuestas; durante
  la compatibilidad pueden seguir siendo visibles mediante un registro
  aportado por el plugin.
- No resolver en esta propuesta la reducción del barrel `core/public`; ese
  trabajo pertenece a `r00040`, aunque los nuevos contratos deben poder
  exponerse por los subpaths adecuados.
- No resolver el acoplamiento del cliente al core; ese trabajo pertenece a
  `r00041`.
- No convertir automáticamente `issues` en un plugin independiente de
  propuestas; sólo se elimina del core el supuesto de que esa relación sea
  necesaria para cualquier host.

## Architecture

```text
packages/core/
  adopt/adopt-project.tool.ts       conoce config + proposals + issues
  api/stable-facade.ts              enumera tools del plugin proposals
  cli/assemble-skills.ts            lee proposals index y decide next action
  plugins/load-*                    compone plugins y capacidades

plugins/proposals/
  proposal store, index, workflow,
  adoption extension, stable-tool descriptors,
  workflow summary / next-action provider

Objetivo:

packages/core/                         plugins/proposals/
  contratos agnósticos  <-------------  adaptadores de dominio
  composición genérica                 implementaciones concretas
  fallback sin plugin                  registro opcional al cargar plugin
```

## Slices

### S0 — Inventario ejecutable de acoplamientos core → proposals

- **Status**: done
- shipped-in: `420e86f48`
- **Files**:
    - `tools/scripts/inspect/core-proposals-boundary.script.ts` (nuevo)
    - `packages/core/tests/src/architecture/core-proposals-boundary.spec.ts` (nuevo)
    - `docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md` (generado)
- **Gate**: `bun tools/scripts/inspect/core-proposals-boundary.script.ts`
- **Acceptance**:
    - El inventario distingue imports, rutas, nombres de plugin, tipos,
      mensajes y acceso a índices.
    - Cada hallazgo incluye fichero, símbolo o literal, categoría y destino
      propuesto: `contract`, `adapter`, `composition` o `intentional-compat`.
    - El script falla si aparece un acoplamiento nuevo no clasificado en
      `packages/core/src`.
- review-state: done
- review-implementer: technical-investigator
- review-reviewer: GitHub Copilot
- review-log: approved by GitHub Copilot — Revisión limitada a S0. Verificado el inventario comprometido, el script tools/scripts/inspect/core-proposals-boundary.script.ts, la spec packages/core/tests/src/architecture/core-proposals-boundary.spec.ts y el gate manual core-proposals-boundary. Resultados observados: bun tools/scripts/inspect/core-proposals-boundary.script.ts => inventario regenerado sin unclassified ni regressions; bun x vitest run --config ./vitest.config.ts ./tests/src/architecture/core-proposals-boundary.spec.ts (desde packages/core) => 7/7 tests passing; bun tools/scripts/lint/core-proposals-boundary.script.ts => ok, 394 files scanned, 51 explicit exceptions active, 0 expired. No se revisó S1+ ni se editaron archivos ajenos.
### S1 — Contratos agnósticos de contribuciones de workflow y adopción

- **Status**: done
- shipped-in: `7c861d2f9`
- **DependsOn**: [S0]
- **Files**:
    - `packages/core/src/lib/contracts/interfaces/workflow-contribution.interface.ts` (nuevo)
    - `packages/core/src/lib/contracts/interfaces/adoption-extension.interface.ts` (nuevo)
    - `packages/core/src/lib/contracts/index.ts`
    - `packages/core/tests/src/lib/contracts/workflow-contribution.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/contracts/workflow-contribution.spec.ts`
- **Acceptance**:
    - Los contratos no importan tipos, constantes ni rutas de
      `@delendai/proposals`.
    - Un proveedor puede aportar resumen de workflow, herramientas estables,
      pasos de adopción y `recommendedNextAction` sin que el core conozca su
      vocabulario interno.
    - La ausencia de proveedores devuelve listas vacías o un fallback genérico
      y no lanza excepciones.
- review-state: done
- review-implementer: delendai-impl-r00043-s1-20260907
- review-reviewer: delendai-review-r00043-s1-20260907
- review-log: approved by delendai-review-r00043-s1-20260907 — Independent verification approved. Contracts remain proposals-agnostic, provider contracts cover workflow and adoption contributions generically, and safe empty fallbacks pass the slice gate.
### S2 — Extraer la adopción específica de proposals a un adaptador

- **Status**: done
- **DependsOn**: [S1]
- **Files**:
    - `packages/core/src/lib/adopt/adopt-project-write-estimate.ts`
    - `packages/core/src/lib/adopt/adoption-assessment.service.ts`
    - `packages/core/src/lib/adopt/adoption-extension-registry.ts`
    - `packages/core/src/lib/cli/assemble-core-tools.ts`
    - `packages/core/src/lib/contracts/interfaces/adoption-extension.interface.ts`
    - `packages/core/src/lib/contracts/interfaces/adoption-assessment.interface.ts`
    - `packages/core/src/lib/contracts/constants/adoption-assessment-schema.constant.ts`
    - `packages/core/tests/src/lib/adopt/adoption-assessment.spec.ts`
    - `plugins/proposals/tests/src/lib/adoption/proposals-adoption-extension.spec.ts`
    - `tools/scripts/inspect/core-proposals-boundary.script.ts`
    - `docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md`
- **Gate**: `bunx vitest run packages/core/tests/src/lib/adopt/adoption-assessment.spec.ts plugins/proposals/tests/src/lib/adoption/proposals-adoption-extension.spec.ts`
- **Acceptance**:
    - `adopt_project` puede generar una adopción válida sin que
      `packages/core/src` contenga `proposals` hardcodeado.
    - Cuando `proposals` está cargado, el adaptador conserva el bootstrap del
      store y sus pasos de adopción actuales.
    - Cuando `proposals` no está cargado, la adopción no crea rutas ni bloques
      de configuración de propuestas.
    - El comportamiento de `issues` queda expresado como una extensión
      explícita del host/plugin, no como una dependencia asumida por el core.

Delivered 2026-09-25. The adapter (`proposals-adoption-extension.ts`,
registered by the plugin) already bootstrapped the store; what kept
`packages/core/src` knowing proposals was a second copy of it. The
adoption write estimate built its own proposals-store file list and
README and counted those eight files whether or not the plugin was
loaded. The estimate now counts what each loaded adoption extension adds
to the same plan `adopt_project` builds (`countAdoptionFileContributions`,
breakdown kind `plugin`), so it is exact with the plugin and adds nothing
without it; a spec asserts it equals the files the real plan writes. The
assessment summary and the `adopt_project` help name no plugin. Nine
inventory findings are resolved by S2. The `issues` acceptance item is
not part of this delivery; it moves to S6.
- shipped-in: `bb60f4954b62`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — Verifiqué que la estimación y la adopción pasan a depender de extensiones cargadas, no de proposals hardcodeado en core; gate declarado de S2 verde: 8/8.
- review-attribution: claude-opus-5-5 from Merge pull request #434 from CartagoGit/delendai/pr/claude-opus-5-5/r00043-S2-g1/adoption-knows-no-plugin (refs/heads/delendai/wip/claude-opus-5-5/r00043-S2-g1/adoption-knows-no-plugin) (dc61a40ec20129f7b422bee0f63e957164c0a930), opened by gpt-5.4

### S3 — Convertir stable-facade en un registro de contribuciones

- **Status**: done
- shipped-in: `7c861d2f9`
- **DependsOn**: [S1]
- **Files**:
    - `packages/core/src/lib/api/stable-facade.ts`
    - `packages/core/src/lib/api/stable-facade-registry.ts` (nuevo)
    - `plugins/proposals/src/lib/api/proposals-stable-tools.ts` (nuevo)
    - `packages/core/tests/src/lib/api/stable-facade.spec.ts`
    - `plugins/proposals/tests/src/lib/api/proposals-stable-tools.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/api/stable-facade.spec.ts plugins/proposals/tests/src/lib/api/proposals-stable-tools.spec.ts`
- **Acceptance**:
    - `packages/core/src` no enumera directamente herramientas con
      `plugin: 'proposals'`.
    - El manifiesto estable conserva las mismas entradas cuando el plugin
      está cargado.
    - Un host que no cargue `proposals` puede construir su fachada estable
      sin descriptores de propuestas ni imports del plugin.
    - Se mantiene la versión y la garantía semver del manifiesto durante la
      ventana de compatibilidad.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — Verifiqué que stable-facade usa un registro genérico y que proposals aporta sus descriptores desde el plugin; gate declarado de S3 verde: 14/14.
- review-attribution: unrecorded — nothing in Git names who delivered 7c861d2f9e0762dfdcaa3e11e9017c62ab6b40af: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by gpt-5.4

### S4 — Hacer agnóstico el ensamblado de skills y recommendedNextAction

- **Status**: done
- **DependsOn**: [S1, S2]
- **Files**:
    - `packages/core/src/lib/cli/assemble-skills.ts`
    - `packages/core/src/lib/cli/workflow-contribution-assembly.ts` (nuevo)
    - `plugins/proposals/src/lib/skills/proposals-workflow-contribution.ts` (nuevo)
    - `packages/core/tests/src/lib/cli/assemble-skills.spec.ts`
    - `plugins/proposals/tests/src/lib/skills/proposals-workflow-contribution.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/cli/assemble-skills.spec.ts plugins/proposals/tests/src/lib/skills/proposals-workflow-contribution.spec.ts`
- **Acceptance**:
    - `assemble-skills.ts` no lee directamente el índice de propuestas ni
      comprueba `isLoaded('proposals')` para decidir la acción recomendada.
    - Los proveedores registrados pueden aportar sus resúmenes y su acción
      siguiente mediante el contrato común.
    - Con `proposals` cargado, la acción recomendada sigue siendo equivalente
      a la actual.
    - Sin `proposals`, el core ofrece una acción genérica y válida basada en
      las capacidades realmente disponibles.

Delivered 2026-09-25. The contribution assembly (`workflow-contribution-assembly.ts`,
`proposals-workflow-contribution.ts`) was already in the tree and meets
the first three acceptance items: `assemble-skills.ts` neither reads the
index nor checks `isLoaded('proposals')`, and the gate passes. What was
left were two messages that still named the proposals store and
proposal files; they now speak of what loaded plugins contribute and of
workflow files. Both inventory findings are resolved by S4.
- shipped-in: `1059c6ce4311`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.4
- review-log: approved by gpt-5.4 — Verifiqué que assemble-skills ya no decide la next action leyendo proposals directamente y que la contribución llega por el ensamblado genérico; gate declarado de S4 verde: 6/6.
- review-attribution: claude-opus-5-5 from Merge pull request #435 from CartagoGit/delendai/pr/claude-opus-5-5/r00043-S4-g1/the-next-action-names-no-plugin (refs/heads/delendai/wip/claude-opus-5-5/r00043-S4-g1/the-next-action-names-no-plugin) (039bb517ef66fc73d51f9da59d44a12136969a85), opened by gpt-5.4

### S5 — Lint de frontera y documentación de compatibilidad

- **Status**: done
- **DependsOn**: [S2, S3, S4]
- **Files**:
    - `tools/scripts/lint/core-proposals-boundary.script.ts`
    - `tools/scripts/lint/index.ts` o el registro de lints equivalente
    - `packages/core/tests/src/architecture/core-proposals-boundary.spec.ts`
    - `docs/delendai/ARCHITECTURE.md`
    - `docs/delendai/adr/d00014-core-plugin-boundary.md` (nuevo)
- **Gate**: `bun run lint:core-proposals-boundary`
- **Acceptance**:
    - Ningún import, ruta o literal de dominio nuevo entra en `packages/core`
      sin una excepción clasificada y revisable.
    - El lint permite sólo adaptadores, fixtures o compatibilidad marcados
      explícitamente y con fecha de retirada.
    - El ADR documenta la dirección de dependencia:
      `core contracts → plugin adapters → host composition`.
    - La documentación explica cómo añadir un nuevo plugin de workflow sin
      editar el núcleo.

Progress 2026-09-25: the lint now also fails on a **stale** exception —
one for a file under the scan root that no match uses any more. Eighteen
such exceptions had outlived the couplings they excused (five already on
develop, the rest removed by S2 and S4) and would have silently excused
those couplings again had they come back. They are removed.

Delivered 2026-09-25. The lint, its registration and its spec were in
place (S0 onward, stale exceptions added with S4), and
`docs/delendai/adr/d00014-core-plugin-boundary.md` already stated the
direction `core contracts → plugin adapters → host composition`. What was
missing is the guide: `ARCHITECTURE.md` now says how a workflow plugin
plugs in without editing the core, through the three registries the
proposals plugin uses (adoption extensions, workflow contribution, stable
tool descriptors), with its files as the reference.
- shipped-in: `f99521d1bf31`
- review-attribution: unrecorded — no delivering commit was named for r00043 S5; independence could not be verified, opened by gpt-5.4
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: requested_changes by gpt-5.4 — El lint real está verde (bun tools/scripts/lint/core-proposals-boundary.script.ts), pero la slice declara como gate bun run lint:core-proposals-boundary y ese comando no existe en package.json; reproduzco Script not found "lint:core-proposals-boundary". Ajustad el gate declarado o exponed el script para que la aceptación sea reproducible.
- review-log: approved by glm-5.3-flash — verified at b7dcf3901f55, validate exit 0, tests 13/13 — Declared gate lint:core-proposals-boundary is green on the current tip (830 files scanned, 37 active exceptions, 0 expired, exit 0); the gate script is registered in package.json (gpt-5.4's earlier defect is fixed). ADR d00014 documents the dependency direction core contracts -> plugin adapters -> host composition. ARCHITECTURE.md explains the three registries a workflow plugin uses to plug in without editing the core. Boundary spec 13/13 passing.

### S6 — The GitHub issues hint of an adoption comes from the issues plugin's declaration

- **Status**: done
- **DependsOn**: [S2]
- **Files**:
    - `packages/core/src/lib/contracts/interfaces/plugin-manifest.interface.ts`
    - `packages/core/src/lib/contracts/interfaces/plugin-registry.interface.ts`
    - `packages/core/src/lib/contracts/interfaces/adopt-project.interface.ts`
    - `packages/core/src/lib/manifest/define-plugin-manifest.ts`
    - `packages/core/src/lib/adopt/declared-adoptions.service.ts`
    - `packages/core/src/lib/adopt/adopt-project.tool.ts`
    - `packages/core/src/lib/registry/generated/first-party-manifest-entries.generated.ts`
    - `tools/scripts/generate/from-manifests.script.ts`
    - `plugins/issues/plugin.manifest.ts`
    - `plugins/proposals/src/lib/adoption/proposals-adoption-extension.ts`
    - `packages/core/tests/src/lib/adopt/adopt-project.spec.ts`
    - `packages/core/tests/src/lib/adopt/declared-adoptions.spec.ts`
    - `packages/core/tests/src/lib/manifest/define-plugin-manifest.spec.ts`
    - `plugins/proposals/tests/src/lib/adoption/proposals-adoption-extension.spec.ts`
- **Gate**: `bunx vitest run packages/core/tests/src/lib/adopt packages/core/tests/src/lib/manifest plugins/proposals/tests/src/lib/adoption`

`adopt_project` still wrote `(Optional) Wire GitHub issues later: run
setup_github, then set plugins.issues.options.repo …` from the core, and
the proposals extension wired `plugins.issues` when `repo` was given. The
issues plugin cannot contribute this itself the way proposals does: the
point of `repo` is to wire issues for a later launch, and during adoption
the plugin is usually not loaded. So the hint and the wiring now live in
something the issues plugin declares without being loaded: its manifest,
read through the first-party index. The core and the proposals adapter
no longer name it.

Delivered:

- `IPluginAdoption` in the manifest. It declares which request field
  wires the plugin (`repo`), which option it sets, the launch preset, and
  the texts for the wired and not-wired cases. `launchPreset` is checked
  against the manifest's own `presets`, so a declaration cannot launch a
  preset that leaves the plugin out.
- `from-manifests` carries the declaration into the first-party index.
  `declaredAdoptions` applies every declaration. The core names no plugin,
  and its spec drives the function with a fictional one.
- The adoption stage is respected. A plugin the stage defers is not
  wired, launched or verified, and it gets its "wire it later" step. At
  the default stage (`core`), the old path through the proposals
  extension promised `--preset full` and "Verify GitHub issues" for an
  `issues` plugin the stage filter had just removed.
- The steps keep their wording. The rationale line no longer mentions
  proposals: "GitHub issues wired for {repo}; launch with --preset full
  (or add issues to --plugins)."
- Without `proposals` loaded, a `repo` at a stage that includes issues
  now wires issues. Before, it did nothing. That is the point of the
  slice: the wiring belongs to issues, not to proposals.
- shipped-in: `522aabfc31e6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at 522aabfc31e6, validate exit 0, tests 75/75 — Slice gate green: adopt+manifest+adoption suites 9 files / 75 tests passing. The GitHub-issues adoption hint and wiring moved into IPluginAdoption on the issues plugin manifest (repo field, plugins.issues.options.repo option, both case texts); from-manifests carries it into the first-party index and declaredAdoptions applies it. No setup_github hint or issues wiring remains in packages/core/src or the proposals adapter; core spec drives declaredAdoptions with a fictional plugin. Minimax-3 approved the slice commit; b7dcf3901f55 only added inventory/docs churn and S8 code.
- review-attribution: claude-opus-5-5 from commit 522aabfc31e6 names refs/heads/delendai/wip/claude-opus-5-5/r00043-S6-g1/the-issues-hint-comes-from-its-manifest (522aabfc31e65d303e7e77fbf16f6cd6f4c84fdf), opened by glm-5.3-flash

## Dependency graph

```text
S0 ──► S1 ──► S2 ──► S4 ──► S5
          └──► S3 ────────┘
```

S0 es sólo inventario y puede ejecutarse sin modificar código productivo.
S2 y S3 son independientes después de S1. S4 necesita que exista el
registro de contribuciones y que adopción tenga un proveedor real para
validar la composición. S5 ratifica la frontera después de las migraciones.

### S8 — The proposals index reader lives in the plugin
- **Status**: review
- **Files**: `plugins/proposals/src/lib/proposals/proposal-summaries.service.ts`, `plugins/proposals/tests/src/lib/proposals/proposal-summaries.service.spec.ts`, `plugins/proposals/src/lib/skills/proposals-workflow-contribution.ts`, `tools/scripts/catalog/generate-agent-catalog.script.ts`, `packages/core/src/public/index.ts`, `tools/scripts/lint/core-proposals-boundary.script.ts`, `tools/scripts/inspect/core-proposals-boundary.script.ts`, `docs/delendai/CORE-PROPOSALS-BOUNDARY-INVENTORY.md`
- **Gate**: `npx vitest run --project core packages/core/tests/src/architecture/core-proposals-boundary.spec.ts`
- Done 2026-10-05. `readProposalsIndex` read the proposals plugin's registry from core and was exported by core's barrel; its callers were the plugin itself and the agent-catalog generator. It moved to the plugin (`proposal-summaries.service.ts`) with its spec, and both callers import it from there. Core no longer knows where the plugin keeps its registry or what its entries hold. The two dated exceptions `lint:core-proposals-boundary` kept for it are gone (nothing matched them any more), and the boundary inventory marks its 17 entries resolved by this slice. `IProposalSummary` stays in core: it is the agent catalog's contract, not the plugin's.
- review-state: in_review
- review-implementer: claude-opus-5-5

## Acceptance

Durante la migración se mantienen estas garantías:

- Las herramientas MCP calificadas no cambian de nombre ni de schema.
- `adopt_project` conserva su salida y sus pasos cuando `proposals` está
  cargado.
- El manifiesto estable conserva las entradas de propuestas mediante el
  adaptador del plugin, no mediante imports del core.
- El catálogo de skills sigue cargando skills de core, plugins y overrides
  locales con la misma precedencia.
- Un host minimalista que no cargue `proposals` no intenta leer su índice ni
  crea su estructura de directorios.
- Las excepciones de compatibilidad son temporales, explícitas y tienen
  fecha o condición de retirada.

## Risks and mitigations

- **Riesgo: romper `adopt_project` en proyectos nuevos.** Mitigación:
  comparación E2E con y sin `proposals`, manteniendo el fixture de adopción
  actual como golden output durante S2.
- **Riesgo: perder herramientas estables del manifiesto.** Mitigación:
  snapshot de la fachada antes/después y prueba de equivalencia con el
  plugin activado.
- **Riesgo: introducir un registro global mutable.** Mitigación: usar
  contribuciones inmutables creadas durante el ensamblado y pasar el registro
  explícitamente a los consumidores.
- **Riesgo: esconder un acoplamiento detrás de un string genérico.**
  Mitigación: el inventario clasifica también literals, rutas y mensajes,
  no sólo imports; el lint ratchetea el resultado.
- **Riesgo: duplicar lógica entre core y proposals.** Mitigación: el core
  conserva sólo contratos y composición; la implementación de bootstrap,
  índices y workflow vive una sola vez en el adaptador del plugin.
- **Riesgo: solapamiento con `r00040`/`r00041`/`r00042`.** Mitigación: esta
  propuesta no migra el barrel, el cliente ni el interior de `proposals`;
  consume los subpaths y adaptadores que esos trabajos proporcionen.

Cada slice debe poder revertirse de forma independiente:

- S0 y S5 son artefactos de análisis/lint y pueden retirarse sin tocar runtime.
- S1 puede conservar los contratos sin activar ningún proveedor.
- S2-S4 deben mantener un adaptador de compatibilidad hasta que las pruebas
  de equivalencia pasen; si una migración falla, se restaura el compositor
  anterior sin eliminar los contratos.
- No se modifica el formato de los documentos de propuestas ni el índice
  regenerable durante esta propuesta.

- `packages/core/src` no contiene imports ni conocimiento directo del dominio
  `proposals`, salvo excepciones de compatibilidad clasificadas y temporales.
- La adopción, la fachada estable y el ensamblado de skills funcionan con y
  sin el plugin `proposals`.
- Existe un lint ejecutable que impide que el acoplamiento vuelva a crecer.
- El ADR y la documentación explican el patrón de extensión.
- Las suites de core, proposals y los E2E de ensamblado pasan sin cambios
  observables en la ruta compatible.
