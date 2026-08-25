# CI Gates

Este documento define qué validaciones locales bloquean pull requests en GitHub Actions y qué checks deben marcarse como required en las ramas protegidas.

## Mapeo validación local -> job CI

| Validación local | Job CI | Comando en CI |
| --- | --- | --- |
| `typecheck` | `typecheck` | `bun run typecheck` |
| `test` | `tests` | `bun run test` |
| `test:coverage` | `tests` | `bun run test:coverage` |
| `lint` | `lint-biome` | `bun run lint` |
| `lint:scss` | `lint-biome` | `bun run lint:scss` |
| `lint:cli-imports` | `lint-architecture` | `bun run lint:cli-imports` |
| `lint:cli-coverage` | `lint-architecture` | `bun run lint:cli-coverage` |
| `lint:tools` | `lint-architecture` | `bun run lint:tools` |
| `lint:self-host-dogfood` | `lint-architecture` | `bun run lint:self-host-dogfood` |
| `lint:solid` | `lint-architecture` | `bun run lint:solid` |
| `lint:no-any` | `lint-architecture` | `bun run lint:no-any` |
| `lint:cli-shape` | `lint-architecture` | `bun run lint:cli-shape` |
| `lint:cli-ui-parity` | `lint-architecture` | `bun run lint:cli-ui-parity` |
| `lint:shared-ui-ratchet` | `lint-architecture` | `bun run lint:shared-ui-ratchet` |
| `lint:types-in-contracts` | `lint-architecture` | `bun run lint:types-in-contracts` |
| `lint:file-conventions` | `lint-architecture` | `bun run lint:file-conventions` |
| `lint:setup` | `lint-presets` | `bun run lint:setup` |
| `lint:dependency-versions` | `lint-presets` | `bun run lint:dependency-versions` |
| `lint:core-version-pin` | `lint-presets` | `bun run lint:core-version-pin` |
| `lint:feature-flags` | `lint-presets` | `bun run lint:feature-flags` |
| `lint:compat-window` | `lint-presets` | `bun run lint:compat-window` |
| `verify:stable-manifest` | `lint-presets` | `bun run verify:stable-manifest` |
| `catalog:check` | `lint-presets` | `bun run catalog:check` |
| `catalog:hints:check` | `lint-presets` | `bun run catalog:hints:check` |
| `lint:cli:i18n` | `lint-docs` | `bun run lint:cli:i18n` |
| `lint:style-integrity` | `lint-docs` | `bun run lint:style-integrity` |
| `lint:content-integrity` | `lint-docs` | `bun run lint:content-integrity` |
| `lint:web` | `lint-docs` | `bun run lint:web` |
| `lint:workflow` | `lint-docs` | `bun run lint:workflow` |
| `lint:brand-hex` | `lint-docs` | `bun run lint:brand-hex` |
| `lint:skills` | `lint-docs` | `bun run lint:skills` |
| `lint:host-instructions` | `lint-docs` | `bun run lint:host-instructions` |
| `lint:prompt-size` | `lint-docs` | `bun run lint:prompt-size` |
| `lint:no-cleartext-secrets` | `lint-security` | `bun run lint:no-cleartext-secrets` |
| `lint:ephemeral` | `lint-security` | `bun run lint:ephemeral` |
| `lint:stray-cache-files` | `lint-security` | `bun run lint:stray-cache-files` |
| `lint:no-tracked-ignored-files` | `lint-security` | `bun run lint:no-tracked-ignored-files` |
| `lint:proposals` | `lint-governance` | `bun run lint:proposals` |
| `lint:mass-content-removal` | `lint-governance` | `bun run lint:mass-content-removal` |
| `lint:scaffolds` | `lint-governance` | `bun run lint:scaffolds` |
| `lint:agents` | `lint-governance` | `bun run lint:agents` |
| `lint:audit-ids` | `lint-governance` | `bun run lint:audit-ids` |
| `lint:cache` | `lint-governance` | `bun run lint:cache` |
| `lint:proposal-id-drift` | `lint-governance` | `bun run lint:proposal-id-drift` |
| `lint:proposal-cited-commits` | `lint-governance` | `bun run lint:proposal-cited-commits` |
| `lint:reap-legacy-proposals` | `lint-governance` | `bun run lint:reap-legacy-proposals` |
| `lint:closed-frozen-guard` | `lint-governance` | `bun run lint:closed-frozen-guard` |
| `lint:user-markers` | `lint-governance` | `bun run lint:user-markers` |
| `lint:proposal-slice-completeness` | `lint-governance` | `bun run lint:proposal-slice-completeness` |
| `lint:commit-branch` | `lint-governance` | `bun run lint:commit-branch` |
| `lint:push-to-develop` | `lint-governance` | `bun run lint:push-to-develop` |
| `lint:agent-branch-naming` | `lint-governance` | `bun run lint:agent-branch-naming` |
| `quality:gate` | `quality-gate` | `bun run quality:gate` |
| `verify:tools` | `verify-runtime` | `bun run verify:tools` |
| `verify:plugin-wiring:advisory` | `verify-runtime` | `bun run verify:plugin-wiring:advisory` |
| `verify:cache` | `verify-runtime` | `bun run verify:cache` |
| `verify:external-install` | `verify-runtime` | `bun run verify:external-install` |
| `verify:scaffolds` | `verify-runtime` | `bun run verify:scaffolds` |
| `verify:dev-bundles` | `verify-runtime` | `bun run verify:dev-bundles` |
| `verify:host-capability-packs` | `verify-runtime` | `bun run verify:host-capability-packs` |
| `token-budget.e2e.spec.ts` | `tokens-budget-real` | `bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts` |
| `plugin-manifest lint` | `manifests-check` | `bun tools/scripts/lint/plugin-manifest.script.ts` |
| `from-manifests --check` | `manifests-check` | `bun tools/scripts/generate/from-manifests.script.ts --check` |
| `generated artifact drift` | `generated-artifacts-check` | `bun tools/scripts/generate/from-manifests.script.ts --check` + token dashboard drift check |

## Checks operativos que se mantienen

Estos checks no sustituyen validaciones locales; protegen rutas de publicación y build reales que ya estaban cubiertas en CI y deben seguir bloqueando:

| Check | Objetivo |
| --- | --- |
| `web site build` | Build real del sitio Astro y verificación de páginas generadas. |
| `pack smoke (publishable packages)` | Smoke bajo Node, instalación desde tarball y `npm pack --dry-run` de paquetes publicables. |
| `metrics longitudinal regression gate (f00027)` | Regresión longitudinal de latencia, bytes y presupuesto de tokens. |

## DAG actual

El workflow es una fan-out plana: todos los jobs son raíces independientes y GitHub puede ejecutarlos en paralelo. No se usa `needs` porque cada runner instala dependencias y construye el estado mínimo que necesita dentro de su propio sandbox.

Jobs paralelos:

| Job | needs |
| --- | --- |
| `lint-biome` | none |
| `lint-architecture` | none |
| `lint-presets` | none |
| `lint-docs` | none |
| `lint-security` | none |
| `lint-governance` | none |
| `typecheck` | none |
| `tests` | none |
| `quality-gate` | none |
| `verify-runtime` | none |
| `tokens-budget-real` | none |
| `manifests-check` | none |
| `generated-artifacts-check` | none |
| `web site build` | none |
| `pack smoke (publishable packages)` | none |
| `metrics longitudinal regression gate (f00027)` | none |

## Required checks para ramas protegidas

`develop` y `main` deben exigir exactamente la misma lista de checks required:

| Rama | Required checks |
| --- | --- |
| `develop` | `lint-biome`, `lint-architecture`, `lint-presets`, `lint-docs`, `lint-security`, `lint-governance`, `typecheck`, `tests`, `quality-gate`, `verify-runtime`, `tokens-budget-real`, `manifests-check`, `generated-artifacts-check`, `web site build`, `pack smoke (publishable packages)`, `metrics longitudinal regression gate (f00027)` |
| `main` | `lint-biome`, `lint-architecture`, `lint-presets`, `lint-docs`, `lint-security`, `lint-governance`, `typecheck`, `tests`, `quality-gate`, `verify-runtime`, `tokens-budget-real`, `manifests-check`, `generated-artifacts-check`, `web site build`, `pack smoke (publishable packages)`, `metrics longitudinal regression gate (f00027)` |

Además de marcar estos checks como required, la protección de ramas debe exigir branch actualizado antes de integrar. En `develop` no se exige review humana obligatoria: el control es la batería de checks required más `enforce_admins: true`.