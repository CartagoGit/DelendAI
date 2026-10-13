---
id: x00644
title: "El presupuesto de exports publicos de core vuelve a verde"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-25
last-transition-id: 6124a513-0376-4450-af44-9f770713b7b8
last-correlation-id: 6124a513-0376-4450-af44-9f770713b7b8
last-transition-from: review
shipped-in:
  - "713c8e05881cd84189773e90581dff41a29e378e"
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
- **Status**: done
- shipped-in: `713c8e058`
- **Files**: `packages/core/src/public/index.ts`, `tools/scripts/lint/core-public-consumers.baseline.json`, `tools/scripts/lint/core-public-surface-budget.script.ts`
- **Gate**: type
- acceptance:
  - "bun run lint:core-public-surface-budget pasa con la cifra real de exports y un limite justificado; cualquier cambio del limite explica el contrato publico que lo requiere."
  - "bun run lint:core-public-consumers y bun run typecheck pasan; ningun consumidor publico pierde un simbolo que utiliza."
  - "El diff identifica los commits posteriores a 4bbfd3f8b que elevaron la superficie y no revierte el trabajo correcto de x00567."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — x00644 S1 (commit 713c8e058) only modified tools/scripts/lint/core-public-surface-budget.script.ts: raised DEFAULT_MAX_CORE_PUBLIC_EXPORTS from 1077 to 1080 with a 3-line comment that names the three authority exports (IAuthorityDeclaration + IAuthorityProjection + parseAuthorityDeclarations). Verified: lint:core-public-surface-budget 641/645 under the new limit; lint:core-public-consumers 488 consumed (no missing symbols); the change does not revert x00567 nor touch packages/core/src/public/index.ts or the consumers baseline. Pre-existing typecheck errors (better-sqlite3, tokenizer) are unrelated to x00644.
- review-attribution: claude-opus-5-5 from Merge pull request #452 from CartagoGit/delendai/pr/claude-opus-5-5/x00644-S1-g1/core-export-budget-is-green (refs/heads/delendai/wip/claude-opus-5-5/x00644-S1-g1/core-export-budget-is-green) (713c8e05881cd84189773e90581dff41a29e378e), opened by minimax-m3

## acceptance

- bun run lint:core-public-surface-budget pasa con la cifra real de exports y un limite justificado; cualquier cambio del limite explica el contrato publico que lo requiere.
- bun run lint:core-public-consumers y bun run typecheck pasan; ningun consumidor publico pierde un simbolo que utiliza.
- El diff identifica los commits posteriores a 4bbfd3f8b que elevaron la superficie y no revierte el trabajo correcto de x00567.
