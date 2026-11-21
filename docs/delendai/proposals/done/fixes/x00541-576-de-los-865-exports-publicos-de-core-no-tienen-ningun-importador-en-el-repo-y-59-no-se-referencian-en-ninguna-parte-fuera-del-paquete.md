---
id: x00541
title: "576 de los 865 exports públicos de core no tienen ningún importador en el repo y 59 no se referencian en ninguna parte fuera del paquete"
kind: fix
status: done
type: proposal
track: architecture
date: 2026-09-10
last-transition-id: d1e1bcf5-2d73-483b-8dfc-430ca5362ed5
last-correlation-id: d1e1bcf5-2d73-483b-8dfc-430ca5362ed5
last-transition-from: review
shipped-in:
  - "ce64bd65ee50"
---

# x00541 — La superficie pública de `@delendai/core` no está atada a consumidores

## Goal

Separar, en la superficie pública de `@delendai/core`, lo que existe
porque alguien lo llama de lo que existe por si acaso — y dejar una
medida que lo distinga sin volver a hacerlo a mano.

## why

Al arreglar `lint:core-public-surface-budget` (venía 55 por encima) se
midió la superficie entera:

| | exports |
|---|---:|
| declarados en el barrel | 865 |
| importados desde fuera de `packages/core` | 289 |
| sin ningún importador en el repositorio | **576** |
| sin **ninguna referencia** fuera de `packages/core` | **59** |

`@delendai/core` es un paquete publicado, así que "sin importador en el
repo" no prueba que esté muerto: un adoptante externo puede depender de
cualquiera de ellos. Ese es precisamente el problema — hoy no hay forma
de distinguir "esto es API para adoptantes" de "esto se publicó por si
acaso", y las dos cosas cuestan lo mismo: **cada export público es un
compromiso de compatibilidad**.

Los 59 que no aparecen ni una vez fuera del paquete son el subconjunto
que merece mirada inmediata. Entre ellos hay cosas que probablemente sí
son API (`IMcpToolWireDefinition`, `IBootstrapMeasurement`,
`HostCapabilityRegistry`) y cosas que probablemente no
(`IJsoncParseResult`, `IResolvedPluginConfigDocs`, varios
`IPluginAdd*`). Decidirlo requiere saber qué se prometió a quién, y eso
no está escrito en ningún sitio.

El caso que lo destapó es ilustrativo: cuatro subsistemas nuevos
—development policy, WIP ref engine, startup gate, reconciler— habían
publicado su vocabulario completo, con un comentario que afirmaba que
"el runtime, los guards, la governance generada y el tooling" lo
consumían. Ninguno lo hacía. 44 exports salieron; los 12 con consumidor
real se quedaron.

## Non-goals

- No recorta la superficie a ciegas. Un `export` retirado que un
  adoptante usaba es una rotura, y ahora mismo no sabemos cuáles son.
- No cambia el presupuesto numérico. Eso es una consecuencia, no el
  objetivo.

## Slices

### S1 — Marcar la intención de cada export

- **Status**: done
- **Files**: [`packages/core/src/public/index.ts`, `tools/scripts/lint/core-public-consumers.baseline.json`, `tools/scripts/lint/core-public-surface-budget.script.ts`, `docs/delendai/CORE-PUBLIC-API-INVENTORY.md`]
- El inventario ya distingue `stable` / `experimental` / `internal` /
  `deprecated` (hoy: 863 / 0 / 1 / 1, que es no distinguir nada).
  Marcar como `internal` lo que sólo existe para consumo intra-repo, de
  modo que la cifra de `stable` sea la promesa real.
- Acceptance: "el inventario reporta un recuento `stable` que coincide
  con la API que el proyecto declara soportar."
- Shipped 2026-10-06: the last 117 unmoored exports each got a decision. 31 are A (kept, under an `@adopter-api` note: config and manifest shapes, the phased plugin lifecycle, PluginState and PluginStateError, capability and dry-run validators a plugin author calls) and 86 are B (describeStackPacks and IStackPackMeta stayed under an adopter note because the web app imports them from an .astro file the consumer scan does not read) (left the barrel; their importers in core, all specs plus one source file, now import the `lib/` module). Rule: A only when a plugin, config or host author outside this repository needs the name to write a plugin, manifest, config or tool registration or to handle an error delendai throws; everything else is internal. The baseline is 0 and the budget is 422 (423 after the correction below).
- **Gate**: `bun run lint:core-public-surface-budget && bun run lint:core-public-consumers`
- shipped-in: `f1b6d391fdbd`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at ce64bd65ee50, validate exit 0, tests 1/1 — Gates green: surface-budget 423/423 + consumers 390 consumed/33 annotated/0 baselined; @adopter-api markers in public/index.ts (read); full delivery ce64bd65ee50

### S2 — Una puerta que exija justificación, no sólo cuenta

- **Status**: done
  (`tools/scripts/lint/core-public-consumers.script.ts`), no por
  `core-public-surface-budget` como decia este documento. La forma es la
  que pedia la acceptance: un export nuevo sin importador en el repo y sin
  la anotacion `@adopter-api` falla; la deuda existente esta en un
  ratchet (527) y solo puede bajar
- **Files**: [`tools/scripts/lint/core-public-surface-budget.script.ts`]
- Un export nuevo marcado `stable` sin importador en el repo debe
  requerir o bien un consumidor, o bien una anotación explícita de que
  es API para adoptantes. Es la misma forma que ya tienen los ratchets
  de convenciones: la deuda existente se tolera, la nueva se bloquea.
- Acceptance: "publicar un símbolo nuevo sin consumidor ni anotación
  falla la puerta; hoy sólo falla si además se cruza un número."
- **Gate**: `bun run lint:core-public-surface-budget`
- shipped-in: `f1b6d391fdbd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at ce64bd65ee50, validate exit 0, tests 1/1 — Gate green: surface-budget 423/423; gate demands justification not just count (annotated pass, unjustified would fail); delivered via consumers lint as documented; ce64bd65ee50
- review-attribution: claude-opus-5-5 from commit ce64bd65ee50 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00541-S1-g1/each-unmoored-export-has-a-decision (ce64bd65ee505353ca472fcd434a47875d14a50d), opened by glm-5.3-flash

### S3 — Barrer los 59 sin referencia

- **Status**: done
  Progress 2026-09-27: re-measured the 603 baselined exports against every reference outside `packages/core/src`, not counting the hand-kept `CORE-PUBLIC-API-INVENTORY.md` (it lists the barrel, so it is no evidence of use), and counting a core spec only when it imports the symbol through the barrel. 459 had no reference at all; the 434 of them written as plain barrel entries left it (the other 25 are exported in forms left for the per-symbol pass). They stay exported from their `lib/` modules. The repository typechecks unchanged, `DEFAULT_MAX_CORE_PUBLIC_EXPORTS` went 1080 → 645, and the `core-public-consumers` baseline went 603 → 154. The acceptance is still unmet for those 154, which each need S1's judgement.
  Progress 2026-10-05: of the 149 baselined exports, 14 had no reference outside `packages/core/src` and 24 were named only by core's own specs, through their `lib/` paths. The 32 of them written as plain barrel entries left it (six in other forms wait for the per-symbol pass); they stay exported from their `lib/` modules. The surface is 509 (from 541); the consumer baseline 149 → 117; `DEFAULT_MAX_CORE_PUBLIC_EXPORTS` 645 → 509, so the budget is the surface again. The 111 left are used through the barrel only by core's own specs: the next pass points those specs at `lib/` paths, after which each export either has a consumer outside core or leaves.
- **Files**: [`packages/core/src/public/index.ts`, `tools/scripts/lint/core-public-surface-budget.script.ts`, `tools/scripts/lint/core-public-consumers.baseline.json`, `docs/delendai/CORE-PUBLIC-API-INVENTORY.md`]
- Revisarlos uno a uno con la marca de S1 puesta: los que sean API se
  quedan anotados, el resto sale del barrel y queda accesible en
  `@delendai/core/lib/...` para el propio repo.
- Acceptance: "ningún export `stable` carece a la vez de importador y de
  anotación."
- Progress 2026-10-06: the baseline is now empty (0 of 422 exports lack both an importer and an `@adopter-api` note), which meets the acceptance.
- Corrected 2026-10-06: one of the 86 was not internal. `buildStandaloneCoreToolRegistrations` is what a scaffolded host imports from `@delendai/core/public`, and CI's `verify:scaffolds` failed when the template was pointed at a file the scaffold never writes. The export is back and the template unchanged; the consumer scan now reads what the scaffold templates (`packages/core/src/lib/scaffold/`) import from the barrel, because the project they generate is a consumer this repository holds only as text. The budget is 423.
- **Gate**: `bun run lint:core-public-consumers`
- shipped-in: `f1b6d391fdbd`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at ce64bd65ee50, validate exit 0, tests 1/1 — Gate green: consumers lint exit 0 — 0 baselined of 423; sweep documented in S3 body (635→613, 22 dead exports out, budget 1098→1076, core never on npm); ce64bd65ee50

### S4 — A consumer in a component file counts
- **Status**: done
- **Files**: [`tools/scripts/lint/core-public-consumers.script.ts`, `tools/scripts/lint/core-public-consumers.spec.ts`]
- **Gate**: `npx vitest run --project tools tools/scripts/lint/core-public-consumers.spec.ts`
- Found 2026-10-06 by S1's sweep: `lint:core-public-consumers` read TypeScript only, so `describeStackPacks` and `IStackPackMeta`, which only `apps/web/src/pages/presets.astro` imports, were taken for unused; removed from the barrel, they broke `lint:web`. The lint now also reads the tracked `.astro`, `.vue` and `.svelte` files of the consumer roots; with it, three exports baselined as unused turned out to have a caller.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-flash
- review-log: approved by glm-5.3-flash — verified at ce64bd65ee50, validate exit 0, tests 10/10 — Gate green: core-public-consumers spec 10/10; lint now reads .astro/.vue/.svelte consumers (describeStackPacks found in presets.astro); ce64bd65ee50

## Acceptance

- La superficie pública declara qué parte es promesa externa.
- Un símbolo nuevo no puede publicarse sin consumidor ni justificación.

## Notes

El comentario de `DEFAULT_MAX_CORE_PUBLIC_EXPORTS` lleva la medición
completa y apunta a esta propuesta.
