# Invariants — effects

> Part of `d00015` (AUD-G05): invariants that used to live only in the
> author's head. Each one below has a test that fails if it breaks.

## Invariante: ningún efecto real evita el policy engine

**Estado actual**: CIERTO — corregido por `x00288` (lint de fronteras
de efectos). **Era FALSO en la auditoría** (`AUD-D01`): nada impedía
que un plugin importara `node:child_process`, `node:fs`, `node:net` o
`node:http` directamente, saltándose por completo el broker de
efectos y su policy engine.

**Test que lo vigila**: `tools/scripts/lint/effect-boundaries.script.ts`
(ratchet con baseline — 0 violaciones nuevas permitidas) +
`tools/scripts/lint/effect-boundaries.script.spec.ts`. Corre en
`bun run validate` (`lint:effect-boundaries`) y en el step "lint
architecture" de `.github/workflows/ci.yml`.

## Invariante: dry-run no puede producir efectos

**Estado actual**: CIERTO — corregido por `r00037`
(`EffectBroker`/`createDryRunGatedGitRunner`). **Era FALSO en la
auditoría** (`AUD-D02`): `guardEffectCapability`/`runWithDryRunGate`
existían como primitivas pero no tenían consumidores reales en el
runtime — un `dry-run: true` no prevenía nada por sí mismo, dependía
de que cada caller recordara invocar el guard.

**Test que lo vigila**: `packages/core/tests/src/lib/dry-run/*`
(50/50 casos) y
`packages/core/tests/src/lib/capabilities/effect-broker.spec.ts`
(incluye la property test sobre las 5 categorías de
`TEffectCapabilityKind`).

## Invariante: las capacidades concedidas son observables

**Estado actual**: CIERTO.

**Test que lo vigila**:
`packages/core/tests/src/lib/capabilities/effect-broker.spec.ts`,
`packages/core/tests/src/lib/capabilities/versioning.spec.ts`,
`packages/core/tests/src/lib/capabilities/shim.spec.ts` y
`packages/core/tests/src/lib/capabilities/adversarial.spec.ts` (casos
adversariales sobre el shim de capacidades).
