---
id: f00273
title: "Ranking, umbral de confianza e histéresis en `tool_search`"
kind: feat
status: in-progress
type: proposal
track: adaptive
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-C03
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, f00272, f00198]
---

# f00273 — Ranking, umbral de confianza e histéresis en `tool_search`

## Goal

Que `tool_search` deje de devolver los primeros 20 resultados por
orden de inserción filtrados por subcadena, y en su lugar puntúe y
ordene por relevancia, declare un umbral de confianza bajo el cual
avisa en vez de devolver ruido, y que el runtime de superficie
adaptativa no pueda activar/desactivar el mismo plugin dos veces en
menos de `minWarmMs` (histéresis).

## why

**Verificación de la premisa.** Confirmado contra
`packages/core/src/lib/project/tool-surface-runtime.service.ts`:
`matchesFilter()` hace `includes()` (subcadena, sin puntuación) sobre
`name/toolId/pluginId/namespace/summary/tags`, y `searchTools()`
aplica `.slice(0, limit)` sobre el resultado del filtro **sin
ordenar** — el orden final es el de inserción en
`MANAGED_LAZY_PLUGIN_CATALOG`, no relevancia. No existe ningún
concepto de histéresis: nada impide activar un plugin, desactivarlo
en la siguiente evicción y reactivarlo en el ciclo siguiente.

**Por qué es un problema.** El modo `managed` (superficie adaptativa)
depende de que `tool_search` devuelva la tool correcta en primera
posición: si no lo hace, el modelo activa el plugin equivocado, paga
el coste de activación, y vuelve a buscar — exactamente el patrón que
`activation churn` (de `f00198`, pendiente) mediría.

## why this design

Se descarta construir un índice invertido + BM25 completo como primer
slice: es la "solución arquitectónica ideal" citada por la auditoría,
pero un ranking heurístico simple (coincidencia exacta > prefijo >
tag > subcadena) ya resuelve el caso dominante (el modelo busca por un
nombre o concepto que aparece literalmente en el catálogo) sin la
complejidad de mantener un índice en memoria. BM25 queda como mejora
de seguimiento si el ranking heurístico no basta — medible con
`activation churn` una vez exista.

La histéresis se separa en su propio slice porque vive en un punto
distinto del código (`evictIdlePlugins`/`touchPlugin`, no
`searchTools`) y tiene su propio riesgo: una `minWarmMs` mal calibrada
podría reintroducir el problema que `AUD-C02` (working set inerte)
ya describe desde el otro lado (plugins que nunca se sueltan).

## non-goals

- Índice invertido / BM25 sobre `summary`+`tags` — queda como mejora
  de seguimiento si el ranking heurístico no es suficiente.
- Medir `activation churn` en sí — es `f00198` (dependencia de
  facto: sin esa métrica no hay forma numérica de validar que la
  histéresis reduce oscilación, sólo tests unitarios de la propiedad).
- Tocar `isToolExposed` — es `x00287`, ortogonal.

## architecture

```
query → matchesFilter (ya existe, se mantiene como filtro previo)
      → scoreCandidate(query, record):
            exact toolId match   → 100
            name prefix match    → 80
            tag exact match      → 60
            summary substring    → 30
      → sort desc por score
      → si max(score) < CONFIDENCE_THRESHOLD:
            responder { found: false, suggestion: "..." }
        si no:
            responder resultados ordenados con `score`

activación de plugin → registrar `activatedAt`
evicción de plugin   → si (now - activatedAt) < minWarmMs: no evictar
```

## slices

### S1 — Puntuación y orden en `searchTools`

- **Status**: done — verified 2026-09-15 by an evidence pass. The one change the review requested is in the tree: ties now break with a binary comparison (`left < right ? -1 : 1` in `tool-surface-runtime.service.ts`) instead of `localeCompare`, and a regression with non-ASCII names pins it. `tool-surface-runtime.search.spec.ts` 4/4: for the query `search` an exact `toolId` ranks first, then a name prefix, then a tag, then a summary match; equal scores break by name; a blank query stays alphabetical.
- **Files**:
    - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
      (`searchTools`, `matchesFilter` → nueva `scoreCandidate`)
    - `packages/core/tests/src/lib/project/tool-surface-runtime.search.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/project/tool-surface-runtime.search.spec.ts`
- review-state: in_review
- review-implementer: copilot
- review-log: requested_changes by delivery_verifier — El ranking usa localeCompare sin locale fijo en el desempate; eso puede variar según ICU/locale del runtime. Cambiar el comparador a un criterio portable independiente del entorno y añadir una regresión con nombres no ASCII o comparación sensible a locale. El resto de la slice está correcto; no aprobar hasta corregir este punto.
### S2 — Umbral de confianza con respuesta explícita "no encontrado"

- **Status**: review
- **Files**:
    - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
    - `packages/core/src/lib/contracts/interfaces/tool-search-result.interface.ts`
    - `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`
    - `packages/core/src/lib/tools/tool-surface.tool.ts`
    - `packages/core/src/generated/tool-outputs.ts`
    - `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts`
    - `packages/core/tests/src/lib/project/tool-surface-runtime.search-confidence.spec.ts`
- **Gate**: `bunx vitest run packages/core/tests/src/lib/project/tool-surface-runtime.search-confidence.spec.ts`

Implementado: `rankTools` devuelve `{ entries, found, suggestion? }` y
`tool_search` lo expone tal cual. Con consulta, la mejor coincidencia
debe puntuar al menos `tokenInName` (8): una palabra de la consulta en
el id o nombre, o la consulta entera en un tag o en el summary. Por
debajo, las coincidencias débiles no se devuelven; la sugerencia nombra
los plugins donde están para acotar la siguiente búsqueda. `minScore: 0`
desactiva el umbral y sin consulta no se aplica. `searchTools` (usado
por el capability resolver) sigue devolviendo todas las coincidencias.
El spec comprueba que cada tool se encuentra por su id, su nombre y
cada tag.

### S3 — Histéresis: `minWarmMs` antes de evictar

- **Status**: done
- **Files**:
    - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
    - `packages/core/src/lib/contracts/constants/working-set-policy.constant.ts`
    - `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`
    - `packages/core/src/lib/plugins/config-file-schema.ts`
    - `packages/core/src/lib/plugins/load-config-file.ts`
    - `packages/core/src/lib/cli/assemble.ts`
    - `packages/core/src/lib/startup-report/assembly.ts`
    - `packages/core/schema/delendai.config.schema.json`
    - `docs/delendai/ADOPTER-SURFACE-MODE.md`
    - `packages/core/tests/src/lib/project/tool-surface-runtime.hysteresis.spec.ts`
    - `packages/core/tests/src/lib/e2e/plugin-disposer-wiring.e2e.spec.ts`
- **Gate**: `bunx vitest run packages/core/tests/src/lib/project/tool-surface-runtime.hysteresis.spec.ts`

Implementado: el suelo aplica a las dos ramas automáticas (TTL y LRU);
durante `minWarmMs` el working set puede superar `maxWarmPlugins`, y
`plugin_deactivate` explícito no lo respeta (es decisión del llamante).
Los valores por defecto (5 min, 8, 30 s) viven ahora en un único
`DEFAULT_WORKING_SET_POLICY` de contracts; antes estaban copiados en el
runtime, `assemble.ts` y el startup report. Un plan sin `minWarmMs`
conserva el comportamiento anterior.

## dependency graph

Independiente de `f00272`/`f00198` para implementar, pero su criterio
de éxito completo (churn medible y acotado) depende de que `f00198`
exista para poder medirlo en producción. Dentro de esta propuesta: S1
no depende de nada; S2 depende de S1 (reutiliza `scoreCandidate`); S3
es independiente de S1/S2 (toca un punto distinto del runtime) y
puede implementarse en paralelo.

## acceptance

- Spec: consultas de referencia (nombre exacto, prefijo, tag) devuelven
  la tool correcta en la posición 1.
- Spec: una consulta sin ningún candidato por encima del umbral
  devuelve `{ found: false, suggestion }` en vez de resultados de baja
  calidad.
- Property test: para cualquier secuencia de activaciones/evicciones
  generada por fast-check, ninguna produce
  activar→desactivar→activar en menos de `minWarmMs`.

## risks and mitigations

- **Riesgo: el umbral de confianza rechaza una consulta legítima que
  hoy sí encontraba algo por subcadena parcial.** Mitigación: el
  umbral se calibra empezando bajo (S2 lo deja configurable) y el
  spec de S2 incluye casos de la suite actual de `tool_search` como
  regresión — ninguna consulta que hoy encuentra su tool puede pasar
  a `found: false`.
- **Riesgo: `minWarmMs` mal calibrado deja plugins calientes más
  tiempo del necesario, empeorando el problema de `AUD-C02`.**
  Mitigación: default conservador (p. ej. 30s) documentado y
  overrideable; el property test de S3 verifica sólo la cota inferior
  (no evictar antes de tiempo), no impone un máximo.

## notes

`AUD-C03` cita el `activation churn` de `AUD-B05`/`f00198` como la
métrica que "mediría exactamente esto" — esta propuesta implementa el
mecanismo, no la métrica; sin `f00198` la validación en producción
queda limitada a los tests unitarios y de propiedad de esta propuesta.
