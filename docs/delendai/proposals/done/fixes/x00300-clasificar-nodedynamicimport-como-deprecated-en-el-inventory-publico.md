---
id: x00300
title: "Clasificar nodeDynamicImport como deprecated en el inventory publico"
kind: fix
status: done
type: proposal
track: audit-stabilization
priority: P0
date: 2026-08-29
parent-plan: q00012
related: [F-001, b00237]
shipped-in:
    - f5836e9 # S1 extractor + inventory regenerado con nodeDynamicImport deprecated
---

# x00300 — Clasificar nodeDynamicImport como deprecated

## goal

Hacer que el inventario publico reconozca el alias `nodeDynamicImport` conservado por compatibilidad y lo marque como `deprecated`.

## why

El export existe en `packages/core/src/public/index.ts`, pero `tests/inspect/core-public-inventory.spec.ts` no encuentra una entrada para el nombre y falla antes de comprobar la madurez.

## why this design

La correccion se limita al extractor o metadata que ya alimenta el inventory; no cambia el runtime ni elimina el alias de compatibilidad.

## non-goals

- Eliminar el export.
- Cambiar la implementacion de dynamic import.
- Reformatear el monorepo.

## architecture

El inventory contiene una entrada estable para `nodeDynamicImport` con `maturity: deprecated`, sin duplicar exports ni cambiar el runtime del alias.

## slices

### S1 — Corregir extractor y regenerar inventory

- **Status**: done
- **Files**: `tools/scripts`, `packages/core`, `packages/core/tests`
- **Gate**: `bunx vitest run tools/tests/inspect/core-public-inventory.spec.ts packages/core/tests/src/public/deprecation.spec.ts`
- Actualizar el extractor o metadata de deprecacion.
- Mantener o ampliar los tests de inventory/deprecation.
- Regenerar solo los artefactos afectados.
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: el inventory publico contiene nodeDynamicImport exactamente una vez con maturity deprecated, deprecation.spec pasa y no hay duplicados para ese export.
## acceptance

- [ ] El test de `core-public-inventory` encuentra `nodeDynamicImport`.
- [ ] La madurez es exactamente `deprecated`.
- [ ] `deprecation.spec.ts` sigue pasando.
- [ ] No aparecen entradas duplicadas.
- [ ] Typecheck y build pasan.

### Required tests

- `bunx vitest run tools/tests/inspect/core-public-inventory.spec.ts packages/core/tests/src/public/deprecation.spec.ts`
- `bunx tsc --noEmit -p tsconfig.json`

## risks and mitigations

- Revertir el commit de esta hija y regenerar solo el inventory afectado.
- El extractor puede tener otras formas de alias o re-export; no ampliar el cambio a toda la API publica.

### Completion evidence

Registrar diff, comandos, resultados y hash del commit en el cierre de la slice.
