---
id: v00136
title: "Un techo de bytes plano sobre una lista cuya longitud es una decisión de producto obliga a subirlo cada vez que nace una tool"
kind: perf
status: ready
type: proposal
track: architecture
date: 2026-09-10
---

# v00136 — Los techos de `overview` miden el número de tools, no su coste

## Goal

Que las puertas `overviewFullNative` / `overviewCompactNative` (y sus
hermanas de la misma familia) midan **bytes por tool**, de modo que
fallen cuando una fila engorda y no cuando el producto gana una
capacidad legítima.

## why

Hoy `token-budget.e2e` falló así:

```
overview full (native) = 13.786B: expected 13.786 <= 12.650
```

Al medirlo, el diagnóstico fue el contrario del que sugiere el fallo:

| | tools | payload | B/tool |
|---|---:|---:|---:|
| medición de x00296 | 63 | 12.024 B | 190,9 |
| medición de hoy | 87 | 13.786 B | **158,5** |

Las filas se abarataron un 17%. El total subió porque hay 24 tools más
—work model, forge governance, integration engine—. La puerta se puso
roja precisamente cuando el sistema mejoró en lo que la puerta dice
vigilar.

De los 13.786 B, 12.923 B son el array `tools`. Una fila ya es
`{name, summary truncado, tags}` y nada más: no hay descripción
duplicada, ni schema, ni annotations. No hay compensación que aplicar
(paso 2 del `bumpPolicy`), así que el único movimiento disponible fue
subir el techo — el tercer bump documentado de esta misma puerta.

Ese es el problema. Un techo plano sobre una lista cuya longitud es una
decisión de producto **tiene** que subirse cada vez que se publica una
tool, y cada subida gasta un poco de la señal: al tercer bump nadie
distingue ya "creció porque hay más tools" de "creció porque las filas
engordaron". Sólo lo segundo es una regresión.

## Non-goals

- No reduce el número de tools. Eso es `v00135`, y es una decisión de
  superficie, no de medición.
- No toca los techos de `tools/list` por preset (`tokens:gate`), donde el
  número de tools **sí** es lo que se quiere acotar.

## Slices

### S1 — Techo por fila para la familia `overview`

- **Status**: pending
- **Files**: [`packages/core/src/lib/contracts/constants/token-budgets.constant.ts`, `packages/core/src/lib/contracts/interfaces/token-budgets.interface.ts`, `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`]

- `ITokenBudgetSurface` admite `hardPerItem` / `warningPerItem` además
  del absoluto, y `expectWithinBudget` acepta un recuento.
- `overviewFullNative` / `overviewCompactNative` se expresan por tool,
  fijados sobre la medición de hoy (158,5 y 25,1 B/tool) con el mismo
  guard band del 5%.
- Se conserva un techo absoluto **holgado** como red de seguridad: el
  payload no puede crecer sin límite aunque cada fila sea barata.
- Acceptance: "añadir una tool al roster no mueve el veredicto de la
  puerta; engordar `summary` en 40 B por fila sí lo pone rojo."
- **Gate**: `bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`

### S2 — Registrar el recuento en la evidencia

- **Status**: pending
- **Files**: [`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`]

- La aserción publica `tools` junto a `bytes`, para que el histórico
  permita separar las dos causas de crecimiento sin reconstruirlas a
  mano.
- Acceptance: "el journal de la puerta contiene bytes y recuento en cada
  medición."
- **Gate**: `bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`

## Acceptance

- Una tool nueva en el roster de `fixturePluginIds` no cambia el
  veredicto de `overviewFullNative` / `overviewCompactNative`.
- Un aumento de 40 B por fila en `summary` sí lo pone rojo.
- La evidencia de la puerta registra bytes y recuento de tools.

## Notes

El comentario de `token-budgets.constant.ts` sobre `overviewFullNative`
lleva el registro completo del bump de hoy (`bumpPolicy` pasos 1-4) y
apunta a esta propuesta.
