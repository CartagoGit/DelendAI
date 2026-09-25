---
id: x00644
title: "El presupuesto de exports publicos de core vuelve a verde"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
last-transition-id: 45d2346d-f1f3-423d-930c-6e1eb9cd90f5
last-correlation-id: 45d2346d-f1f3-423d-930c-6e1eb9cd90f5
last-transition-from: ready
---

# x00644 — El presupuesto de exports publicos de core vuelve a verde

## Goal

Restaurar el gate de superficie publica de core despues de los exports agregados con posterioridad a x00567, conservando los tipos de startup report correctamente retirados en ese slice.

## why

La verificacion de x00567 confirma que el diff de 4bbfd3f8b retiro diez exports duplicados y que los consumidores y typecheck pasan. En el arbol actual bun run lint:core-public-surface-budget falla: 1080 exports frente al limite 1077. El incremento procede de commits posteriores, por lo que corresponde un ajuste independiente y trazable antes de certificar el gate actual.

## non-goals

- Reintroducir los diez tipos de startup report en el barrel.
- Subir el limite sin justificar una necesidad publica real.
- Modificar x00567 para ocultar la regresion posterior.

## Slices

- global_gate: type

### S1 — Auditar los tres exports excedentes y recuperar el limite
- **Status**: pending
- **Files**: `packages/core/src/public/index.ts`, `tools/scripts/lint/core-public-consumers.baseline.json`, `tools/scripts/lint/core-public-surface-budget.script.ts`
- **Gate**: type
- acceptance:
  - "bun run lint:core-public-surface-budget pasa con la cifra real de exports y un limite justificado; cualquier cambio del limite explica el contrato publico que lo requiere."
  - "bun run lint:core-public-consumers y bun run typecheck pasan; ningun consumidor publico pierde un simbolo que utiliza."
  - "El diff identifica los commits posteriores a 4bbfd3f8b que elevaron la superficie y no revierte el trabajo correcto de x00567."

## acceptance

- bun run lint:core-public-surface-budget pasa con la cifra real de exports y un limite justificado; cualquier cambio del limite explica el contrato publico que lo requiere.
- bun run lint:core-public-consumers y bun run typecheck pasan; ningun consumidor publico pierde un simbolo que utiliza.
- El diff identifica los commits posteriores a 4bbfd3f8b que elevaron la superficie y no revierte el trabajo correcto de x00567.
