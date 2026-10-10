# Branch policy: develop

`develop` is the integration branch for direct agent work. The current
declarative policy keeps it open for direct pushes and uses the CI workflow as
the source of truth for what must stay green before release branches advance.

## Current policy

- `develop`: `protected: false`, so GitHub branch protection does not name any
  required checks on this branch today.
- `main`: `protected: true` with a single required check, `ci-complete`.

## CI coverage

The aggregate `ci-complete` check in [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)
requires every upstream CI job to succeed. The workflow currently includes 16
distinct prerequisite jobs, so it exceeds the proposal threshold of at least 14
checks without duplicating every job name in branch settings.

The upstream jobs are:

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

- `enforce_admins: true` is declared in the shared defaults in
  [.github/branch-protection.ts](../../../.github/branch-protection.ts), so no
  protected branch has an admin bypass.
- `required_linear_history: true`, `allow_force_pushes: false`, and
  `allow_deletions: false` are also enforced from the same defaults.
- `required_pull_request_reviews` is not the mechanism used here; the repo
  relies on the CI aggregate and branch-specific protection state instead.

## Operational note

The declarative source of truth lives in [.github/branch-protection.ts](../../../.github/branch-protection.ts).
The verifier in `tools/scripts/ci/verify-branch-protection.script.ts` checks the
live GitHub settings against that file, and the `ci-complete` job is the only
required status check that protected branches need to name explicitly.
