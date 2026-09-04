---
id: r00046
title: "Cuatro gates conservan walkers privados con su propia noción de fuente autorada"
kind: refactor
status: ready
type: proposal
track: general
date: 2026-09-04
related:
    - x00424 # consolidó file-conventions; este es el resto
---

# r00046 — Cuatro gates conservan walkers privados

## Goal

Que exista **un** recorrido del árbol TypeScript y **una** definición de
"fichero fuente autorado", en vez de cinco copias que se corrigen por
separado.

## why

`x00424` consolidó `file-conventions` en el walker compartido tras una
revisión independiente que detectó que la propuesta afirmaba haberlo hecho
sin haberlo hecho. Esa misma revisión encontró cuatro gates más con la
misma estructura duplicada:

- `tools/scripts/lint/type-naming.script.ts`
- `tools/scripts/lint/types-in-contracts.script.ts`
- `tools/scripts/lint/effect-boundaries.script.ts`
- `tools/scripts/lint/core-proposals-boundary.script.ts`

Cada uno tiene su propio `readdirSync`, su propia lista de directorios
ignorados y su propio predicado de exclusión. Son anteriores a x00424 y
quedaron fuera de su alcance: el blocker de `validate` afectaba solo a los
cuatro gates que sí consumen el walker compartido.

Lo que los hace merecedores de una propuesta y no de un parche es que
**tienen una noción que el walker compartido no tiene**: excluyen
`.generated.ts` y el segmento `generated/`, además de `.d.ts`. El walker
compartido solo excluye `.d.ts`.

Por eso esto no es un `sed`. Enrutarlos sin más por `walkTsFiles` haría que
empezasen a examinar artefactos generados y produjesen hallazgos sobre
código que nadie escribió — exactamente el defecto que x00424 arregló, en
espejo. Y añadir la exclusión de generados **al default** del walker
ampliaría en silencio lo que los otros cuatro gates dejan de mirar, que es
el modo de fallo que este repositorio no deja de encontrar: un gate que
deja de mirar algo sin decirlo.

Hay además una diferencia mecánica: los tres primeros son síncronos
(`readdirSync`) y `walkTsFiles` es asíncrono.

## non-goals

- NO se cambia el default del walker compartido. Los cuatro gates que ya lo
  consumen deben seguir viendo exactamente lo mismo.
- NO se unifican los predicados de "qué es una violación" de cada gate;
  esto es solo el recorrido y la noción de fuente autorada.
- NO se tocan los baselines: si la consolidación cambia lo que un gate ve,
  eso es un fallo de la consolidación, no una deuda que baselinear.

## Architecture

El walker compartido gana una opción, no un default nuevo:

```ts
walkTsFiles(rootDir, roots, { authoredOnly?: boolean })
```

`authoredOnly` excluye además `.generated.ts` y el segmento `generated/`.
Los cuatro consumidores actuales no lo pasan y no cambian. Los cuatro
gates migrados sí lo pasan, y su comportamiento se conserva.

La prueba de que la migración es correcta no es que el gate siga en verde
—un gate que dejó de mirar también sale verde—: es que el **conjunto de
ficheros recorridos** sea idéntico antes y después, comparado fichero a
fichero.

## Slices

- global_gate: validate

### S1 — `authoredOnly` en el walker compartido
- **Status**: pending
- **Files**: `packages/core/src/lib/scan/ts-walker.ts`, `packages/core/tests/src/lib/scan/ts-walker.spec.ts`
- **Gate**: validate

Añadir la opción y sus tests, sin tocar el comportamiento por defecto.
- acceptance:
  - "`walkTsFiles` acepta `{ authoredOnly }` y excluye `.generated.ts` y el segmento `generated/` solo cuando es `true`."
  - "Un test fija que la llamada SIN opciones devuelve exactamente lo que devolvía antes, incluidos los generados."

### S2 — Migrar los cuatro gates, probando igualdad de conjuntos
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `tools/scripts/lint/type-naming.script.ts`, `tools/scripts/lint/types-in-contracts.script.ts`, `tools/scripts/lint/effect-boundaries.script.ts`, `tools/scripts/lint/core-proposals-boundary.script.ts`
- **Gate**: validate

Sustituir cada walker privado por el compartido con `authoredOnly: true`.
Los tres síncronos pasan a asíncronos.

Antes de cada sustitución, capturar la lista de ficheros que el walker
privado recorre; después, comparar con la del compartido. Deben ser
iguales. Si difieren, la diferencia se explica y se resuelve — no se
baselinea.
- acceptance:
  - "Ninguno de los cuatro ficheros contiene ya `readdirSync` ni una lista propia de directorios ignorados."
  - "Para cada gate, la lista de ficheros recorridos es idéntica antes y después de la migración, comparada elemento a elemento."
  - "Los cuatro gates siguen produciendo exactamente los mismos hallazgos sobre el árbol actual, y sus baselines no cambian."

## Acceptance

- Existe un solo recorrido del árbol TypeScript en el repositorio y una
  sola definición de "fuente autorada".
- Ningún gate ve un fichero distinto de los que veía antes, demostrado por
  comparación de conjuntos y no por el color del gate.
- `bun run validate` en verde.

## Risks and mitigations

- **Riesgo**: la consolidación amplía o reduce en silencio lo que un gate
  examina. **Mitigación**: la aceptación exige igualdad de conjuntos
  fichero a fichero, no que el gate siga verde.
- **Riesgo**: pasar de síncrono a asíncrono cambia el orden de los
  hallazgos y hace ruido en los baselines. **Mitigación**: el walker
  compartido ya devuelve la lista ordenada por ruta.
