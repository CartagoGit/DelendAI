---
id: f00416
title: "Token estimate nomenclature technical follow-up"
kind: feat
status: retired
type: proposal
track: general
date: 2026-09-02
last-transition-id: 88a64c30-faea-4106-8eba-581b38388e5d
last-correlation-id: 88a64c30-faea-4106-8eba-581b38388e5d
last-transition-from: ready
---

# f00416 — Token estimate nomenclature technical follow-up

## Goal

Separar bytes medidos, estimación heurística de tokens y conteo real del modelo en las superficies públicas de coste de respuesta.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## Slices

- global_gate: none

### S1 — TODO
- **Status**: pending
- **Files**: `TODO`
- **Gate**: none

## acceptance

- TODO: observable acceptance criteria.

## notes

- Originally created as `f00415` (an empty TODO-template stub with no
  filled-in `why`/`Files`/acceptance), colliding with the pre-existing,
  unrelated `f00415-diagnostico-reutilizable-de-pipelines-y-workflows-remotos.md`
  (dated 2026-08-31, real content). Renumbered to `f00416` on 2026-09-02
  to resolve the `lint:proposals` duplicate-id error; counter in
  `.cache/mcp-vertex/proposal-id-counters.json` bumped `f: 415 -> 416`
  to match.
- This stub's stated goal — "separar bytes medidos, estimación
  heurística de tokens y conteo real del modelo en las superficies
  públicas de coste de respuesta" — is the exact scope already verified
  implemented and closed under `f00332`
  (`docs/mcp-vertex/proposals/done/feats/f00332-token-estimate-nomenclature.md`):
  `estimateResultCost` in `packages/core/src/lib/metrics/metrics-registry.ts`
  already exposes `contentTextBytes`/`structuredJsonBytes`/
  `wireEstimateBytes`/`estimatedTokens.estimatedTokens4B`/
  `estimatedTokens.actualModelTokens`, propagated through
  `metrics-tool.ts`, `tool-outputs.ts` (generated), and the
  client/UI consumers. `bytes-and-errors.spec.ts` +
  `metrics.spec.ts` pass (32/32, run 2026-09-02). Leaving this as an
  empty TODO stub in `ready/` would misrepresent the state of the
  work — it is not derivable as distinct scope beyond what f00332
  already covers, so it is being retired rather than filled in or
  closed as done in its own right.
