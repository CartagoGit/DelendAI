---
id: r00043
title: "`@delendai/core` deja de conocer el dominio `proposals`"
kind: refactor
status: in-progress
type: proposal
track: architecture
date: 2026-08-30
parent-plan: q00011
priority: P2
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E05
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
related: [q00011, r00040, r00041, r00042, r00034]
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
   mcp-vertex; prescribe también cómo se inicializa el almacén de propuestas.
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
- **Files**:
    - `tools/scripts/inspect/core-proposals-boundary.script.ts` (nuevo)
    - `packages/core/tests/src/architecture/core-proposals-boundary.spec.ts` (nuevo)
    - `docs/mcp-vertex/CORE-PROPOSALS-BOUNDARY-INVENTORY.md` (generado)
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

- **Status**: pending
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

### S2 — Extraer la adopción específica de proposals a un adaptador

- **Status**: pending
- **DependsOn**: [S1]
- **Files**:
    - `packages/core/src/lib/adopt/adopt-project.tool.ts`
    - `packages/core/src/lib/adopt/adoption-extension-registry.ts` (nuevo)
    - `plugins/proposals/src/lib/adoption/proposals-adoption-extension.ts` (nuevo)
    - `plugins/proposals/src/index.ts`
    - `packages/core/tests/src/lib/adopt/adopt-project.tool.spec.ts`
    - `plugins/proposals/tests/src/lib/adoption/proposals-adoption-extension.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/adopt/adopt-project.tool.spec.ts plugins/proposals/tests/src/lib/adoption/proposals-adoption-extension.spec.ts`
- **Acceptance**:
    - `adopt_project` puede generar una adopción válida sin que
      `packages/core/src` contenga `proposals` hardcodeado.
    - Cuando `proposals` está cargado, el adaptador conserva el bootstrap del
      store y sus pasos de adopción actuales.
    - Cuando `proposals` no está cargado, la adopción no crea rutas ni bloques
      de configuración de propuestas.
    - El comportamiento de `issues` queda expresado como una extensión
      explícita del host/plugin, no como una dependencia asumida por el core.

### S3 — Convertir stable-facade en un registro de contribuciones

- **Status**: pending
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

### S4 — Hacer agnóstico el ensamblado de skills y recommendedNextAction

- **Status**: pending
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

### S5 — Lint de frontera y documentación de compatibilidad

- **Status**: pending
- **DependsOn**: [S2, S3, S4]
- **Files**:
    - `tools/scripts/lint/core-proposals-boundary.script.ts`
    - `tools/scripts/lint/index.ts` o el registro de lints equivalente
    - `packages/core/tests/src/architecture/core-proposals-boundary.spec.ts`
    - `docs/mcp-vertex/ARCHITECTURE.md`
    - `docs/mcp-vertex/adr/d00014-core-plugin-boundary.md` (nuevo)
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

## Dependency graph

```text
S0 ──► S1 ──► S2 ──► S4 ──► S5
          └──► S3 ────────┘
```

S0 es sólo inventario y puede ejecutarse sin modificar código productivo.
S2 y S3 son independientes después de S1. S4 necesita que exista el
registro de contribuciones y que adopción tenga un proveedor real para
validar la composición. S5 ratifica la frontera después de las migraciones.

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
