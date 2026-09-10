---
id: x00541
title: "576 de los 865 exports públicos de core no tienen ningún importador en el repo y 59 no se referencian en ninguna parte fuera del paquete"
kind: fix
status: ready
type: proposal
track: architecture
date: 2026-09-10
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

- **Status**: pending
- **Files**: [`packages/core/src/public/index.ts`, `tools/scripts/inspect/core-public-inventory.script.ts`]
- El inventario ya distingue `stable` / `experimental` / `internal` /
  `deprecated` (hoy: 863 / 0 / 1 / 1, que es no distinguir nada).
  Marcar como `internal` lo que sólo existe para consumo intra-repo, de
  modo que la cifra de `stable` sea la promesa real.
- Acceptance: "el inventario reporta un recuento `stable` que coincide
  con la API que el proyecto declara soportar."
- **Gate**: `bun run lint:core-public-surface-budget`

### S2 — Una puerta que exija justificación, no sólo cuenta

- **Status**: pending
- **Files**: [`tools/scripts/lint/core-public-surface-budget.script.ts`]
- Un export nuevo marcado `stable` sin importador en el repo debe
  requerir o bien un consumidor, o bien una anotación explícita de que
  es API para adoptantes. Es la misma forma que ya tienen los ratchets
  de convenciones: la deuda existente se tolera, la nueva se bloquea.
- Acceptance: "publicar un símbolo nuevo sin consumidor ni anotación
  falla la puerta; hoy sólo falla si además se cruza un número."
- **Gate**: `bun run lint:core-public-surface-budget`

### S3 — Barrer los 59 sin referencia

- **Status**: pending
- **Files**: [`packages/core/src/public/index.ts`]
- Revisarlos uno a uno con la marca de S1 puesta: los que sean API se
  quedan anotados, el resto sale del barrel y queda accesible en
  `@delendai/core/lib/...` para el propio repo.
- Acceptance: "ningún export `stable` carece a la vez de importador y de
  anotación."
- **Gate**: `bun run validate`

## Acceptance

- La superficie pública declara qué parte es promesa externa.
- Un símbolo nuevo no puede publicarse sin consumidor ni justificación.

## Notes

El comentario de `DEFAULT_MAX_CORE_PUBLIC_EXPORTS` lleva la medición
completa y apunta a esta propuesta.
