---
id: d00015
title: "Invariantes explícitos por subsistema, cada uno con su test"
kind: docs
status: ready
type: proposal
track: governance
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-G05
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, f00279]
---

# d00015 — Invariantes explícitos por subsistema, cada uno con su test

## Goal

Convertir los invariantes que hoy sólo viven en la cabeza del autor
—los mismos que esta auditoría fue encontrando falsos uno a uno— en
documentos explícitos por subsistema, cada invariante con un test que
falla si se rompe. Empezar por los cuatro subsistemas que la propia
auditoría ya enumera con evidencia (`plugin lifecycle`, `effects`,
`adaptive`, `external MCP`).

## why

**Verificación de la premisa — con evidencia empírica de esta misma
auditoría, no sólo de la afirmación general.** Los cuatro ejemplos que
`AUD-G05` cita como invariantes-que-el-autor-daría-por-ciertos-y-son-falsos
están, a fecha de este triage, verificados individualmente por otros
hallazgos del mismo informe:

- *"eager y lazy tienen semántica idéntica"* → falso, `AUD-E01`.
- *"ningún efecto real evita el policy engine"* → falso, `AUD-D01`.
- *"dry-run no puede producir efectos"* → falso, `AUD-D02` (y su
  propuesta `r00037`, ya escrita, documenta la brecha exacta:
  `guardEffectCapability` existe pero no tiene consumidores en el
  runtime).
- *"todo proceso tiene propietario"* / *"todo propietario tiene
  teardown"* → falso, `AUD-D05`/`AUD-E02`.

**Por qué es el riesgo más importante a medio plazo.** No es un bug
puntual: es la ausencia de un mecanismo que impida que un invariante
roto vuelva a esconderse. Cada uno de los cuatro ejemplos anteriores
ya tiene su propia propuesta de fix — lo que falta es el documento que
declare la propiedad **antes** de que se rompa de nuevo, con un test
que la vigile de forma permanente, no sólo la corrección puntual del
bug ya encontrado.

## why this design

Se descarta escribir un único documento monolítico de "invariantes del
sistema": la auditoría organiza los ejemplos por subsistema
(lifecycle, effects, adaptive, external MCP) precisamente porque cada
grupo tiene un propietario natural (el módulo que lo implementa) y un
conjunto de tests que ya existen parcialmente sobre ese módulo — un
documento por subsistema, colocado junto al código al que describe, es
más fácil de mantener sincronizado que un documento central que nadie
recuerda actualizar.

Se prioriza documentar primero los cuatro invariantes **ya falsos y ya
verificados** (con sus proposals de fix existentes) en vez de
inventariar exhaustivamente todos los invariantes del sistema de una
vez: son los que tienen evidencia concreta hoy, y cada uno se puede
enlazar directamente a su fix (`r00037` para dry-run, y las
propuestas de `AUD-E01`/`AUD-D01`/`AUD-D05`/`AUD-E02` del resto del
plan) para que el documento no describa una aspiración sino un estado
verificado y su plan de corrección.

## non-goals

- Inventariar exhaustivamente todos los invariantes posibles de los 51
  plugins — esta propuesta cubre los cuatro subsistemas núcleo que la
  auditoría documenta con evidencia (lifecycle, effects, adaptive,
  external MCP); otros subsistemas se documentan como trabajo de
  seguimiento cuando su propio triage los toque.
- Escribir los fixes de los invariantes rotos — son las propuestas ya
  existentes (`r00037` y las de `AUD-E01`/`D01`/`D05`/`E02`); esta
  propuesta sólo documenta el invariante y referencia el fix, no lo
  implementa.
- Construir un runner automático que extraiga invariantes del código —
  el documento es prosa curada, no generado.

## architecture

```
docs/mcp-vertex/architecture/invariants/
    plugin-lifecycle.md
    effects.md
    adaptive-surface.md
    external-mcp.md

cada documento:
    ## Invariante
    <enunciado>
    **Estado actual**: CIERTO | FALSO (con referencia AUD-XXX)
    **Test que lo vigila**: <ruta al spec>
    **Si es FALSO**: <proposal que lo corrige>
```

## slices

### S1 — `plugin-lifecycle.md` + `effects.md`

- **Status**: pending
- **Files**:
    - `docs/mcp-vertex/architecture/invariants/plugin-lifecycle.md` (nuevo)
    - `docs/mcp-vertex/architecture/invariants/effects.md` (nuevo)
    - `packages/core/tests/src/lib/plugins/lifecycle-invariants.spec.ts` (nuevo,
      cubre "register ocurre exactamente una vez", "dispose ocurre
      como máximo una vez" — los dos invariantes de lifecycle que la
      auditoría no marca ya como falsos, para que existan protegidos
      desde el día uno)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/plugins/lifecycle-invariants.spec.ts`

### S2 — `adaptive-surface.md` + `external-mcp.md`

- **Status**: pending
- **Files**:
    - `docs/mcp-vertex/architecture/invariants/adaptive-surface.md` (nuevo,
      documenta explícitamente "visible ≠ loaded ≠ active ≠ callable"
      como CIERTO hoy — el único de los ejemplos de la auditoría que
      ya está bien diseñado, para que quede como referencia positiva)
    - `docs/mcp-vertex/architecture/invariants/external-mcp.md` (nuevo)
    - `packages/core/tests/src/lib/project/adaptive-surface-invariants.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/project/adaptive-surface-invariants.spec.ts`

### S3 — Enlazar cada invariante roto con su proposal de fix y verificar que no hay huérfanos

- **Status**: pending
- **Files**:
    - los cuatro documentos de S1/S2 (añadir la referencia cruzada a
      `r00037` y a las propuestas de `AUD-E01`/`D01`/`D05`/`E02`)
    - `tools/scripts/lint/invariants-link-fix.script.ts` (nuevo: falla
      si un invariante marcado `FALSO` no referencia ningún proposal
      existente)
- **Gate**: `bun tools/scripts/lint/invariants-link-fix.script.ts`

## dependency graph

Independiente en su redacción, pero su valor depende de que las
propuestas que corrigen los invariantes falsos (`r00037` ya escrita;
las de `AUD-E01`/`AUD-D01`/`AUD-D05`/`AUD-E02`, fuera de este
territorio) existan para poder enlazarlas en S3 — si alguna no existe
todavía cuando se implemente S3, el documento la marca como "fix
pendiente de proposal" en vez de bloquear el slice. Dentro de esta
propuesta: S1 y S2 son independientes entre sí; S3 depende de ambos.

## acceptance

- Cada uno de los cuatro subsistemas tiene un documento de invariantes
  bajo `docs/mcp-vertex/architecture/invariants/`.
- Cada invariante enunciado tiene un test que lo vigila (spec de S1/S2
  para los dos invariantes de lifecycle que hoy son ciertos y para el
  invariante de superficie adaptativa) o, si está marcado `FALSO`,
  referencia el proposal que lo corrige (S3).
- El lint de S3 falla si un invariante `FALSO` queda sin proposal
  enlazada.

## risks and mitigations

- **Riesgo: el documento se queda desactualizado en cuanto un fix
  cambia el estado de `FALSO` a `CIERTO` (nadie actualiza la
  prosa).** Mitigación: el `Gate` de cada slice de fix relacionado
  (p. ej. `r00037`) debería, como parte de su propia definición de
  aceptación, actualizar el documento correspondiente — se anota como
  nota de coordinación en `notes`, no se fuerza aquí sobre proposals
  ajenas.
- **Riesgo: documentar un invariante "CIERTO hoy" (adaptive-surface)
  sin test de regresión da falsa sensación de permanencia.**
  Mitigación: S2 incluye explícitamente un spec para ese invariante,
  no sólo para los rotos — es el invariante que la auditoría destaca
  como bien diseñado, y esta propuesta lo protege en vez de darlo por
  sentado.

## notes

Esta propuesta responde directamente al hallazgo más caro del informe
según la propia auditoría: la mitad de los invariantes que el autor
daría por ciertos son falsos hoy, y esta auditoría los encontró uno a
uno. El objetivo no es escribir prosa — es que la próxima vez que
alguien (agente o humano) asuma un invariante, haya un documento y un
test que lo confirmen o lo desmientan, en vez de descubrirlo en la
siguiente auditoría externa.
