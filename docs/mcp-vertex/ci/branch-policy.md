# Branch policy: develop

`develop` is the integration branch for direct agent work. Its protection must
block drift in the same places the local repo treats as non-negotiable: types,
tests, governance, runtime verification, token budgets, manifest integrity, and
generated artifacts.

## Required checks

The canonical required checks for `develop` are:

- `lint-biome`
- `lint-architecture`
- `lint-presets`
- `lint-docs`
- `lint-security`
- `lint-governance`
- `typecheck`
- `tests`
- `quality-gate`
- `verify-runtime`
- `tokens-budget-real`
- `manifests-check`
- `generated-artifacts-check`
- `web site build`
- `pack smoke (publishable packages)`
- `metrics longitudinal regression gate (f00027)`

## Enforcement

- `strict: true` so the branch must be up to date before a green merge.
- `enforce_admins: true` so there is no privileged bypass.
- `required_pull_request_reviews: null` because this repo explicitly allows
  direct agent pushes to `develop`; correctness is enforced by the required
  checks, not by a mandatory human review step.

## Operational note

The declarative source of truth lives in [.github/branch-protection.yml](../../../.github/branch-protection.yml).
GitHub branch settings or rulesets must mirror that file.
