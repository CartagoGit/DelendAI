# Branch protection governance — `develop` & `main`

> **Owner:** repository administrators.
> **Sources of truth:** [`.github/branch-protection.yml`](../../.github/branch-protection.yml) for `main`; [`.github/settings.yml`](../../.github/settings.yml) for `develop`.
> **Verifier:** [`tools/scripts/ci/verify-branch-protection.script.ts`](../../tools/scripts/ci/verify-branch-protection.script.ts).
> **Develop guard:** [`tools/scripts/lint/branch-protection-guard.script.ts`](../../tools/scripts/lint/branch-protection-guard.script.ts).
> **Audit refs:** c00130 / AUD-P0-001.

## Goal

`develop` and `main` are protected integration boundaries. `main` remains the
release boundary; `develop` requires the aggregate `delendai-validate` check.
The policy is declarative in the matching settings file and operationally
applied by a human in the GitHub UI or API.
The verifier is read-only and fails when the live GitHub rule diverges from
the committed policy.

Required protection for `main`:

1. `required_status_checks.strict: true`
2. Required checks:
   - `ci-complete` (full CI matrix)
   - `release-pr-gate` (typecheck + lint re-run, mirrors the local pre-push gate)
3. `enforce_admins: true`
4. `required_linear_history: true`
5. `allow_force_pushes: false`
6. `allow_deletions: false`
7. `restrictions: null`

## Declarative versus live verification

GitHub branch-protection writes require repository administration scope.
CI must not hold that permission. The repository therefore stores the intended
policy in version control and verifies the live state, but does not mutate the
GitHub settings itself.

The local declaration check answers “is the committed policy shaped correctly?”
It does not prove that GitHub has applied the rule. The `develop-protection-live`
CI job answers the second question when `BRANCH_PROTECTION_TOKEN` is configured;
it fails if the branch is unprotected or its required checks drift.

That split gives two guarantees:

1. The intended policy is reviewable in Git.
2. Drift in the GitHub UI/API becomes detectable by CI and local verification.

## Local plugin default (`commit-policy.protectedBranches`)

The `commit-policy` plugin has its own **local** push-protection layer that
mirrors this GitHub policy. Its default (c00145) is deliberately narrower than
the GitHub UI rule:

- `main` and `master` are protected by default (matching the release branch).
- `develop` is **NOT** protected by default — the human/agent workflow keeps
  `develop` flexible. An owner who wants `develop` treated like `main` must
  opt in explicitly (add `develop` to `push.protectedBranches` or the
  `includeDevelop` switch).
- `agent/*` and `worktree/*` branches are **never** protected (isolation).

The effective list is resolved by `resolveProtectedBranches` in
`plugins/commit-policy/src/lib/contracts/constants/protected-branches.ts`;
an explicit config override wins over the default.

## Operator playbook

### Step 1 — Open GitHub settings

1. Visit <https://github.com/CartagoGit/delendai/settings/branches>.
2. Create or edit one rule for `main`.
3. Create or edit one rule for `develop`.

### Step 2 — Match the declarative policy exactly

For `main`, configure:

- **Require a pull request before merging:** ON — this is the setting that
  closes the fast-forward gap: `required_checks` alone only demands that
  `ci-complete` be green for the landing SHA, it does not demand that the SHA
  arrived via a pull request. A SHA that already ran green on another branch
  (e.g. `wip`) can otherwise land on `main` by a direct fast-forward push
  with no pull request ever opened. See ADR 0019 for why `main`, and only
  `main`, needs this toggle.
- **Require status checks to pass before merging:** ON
- **Require branches to be up to date before merging:** ON
- **Required status checks:** `ci-complete`, `release-pr-gate`
- **Require linear history:** ON
- **Allow force pushes:** OFF
- **Allow deletions:** OFF
- **Restrict who can push to matching branches:** OFF / empty
- **Do not allow bypassing the above settings:** ON for admins

For `develop`, configure the rule from [`.github/settings.yml`](../../.github/settings.yml):
require `delendai-validate`, enforce administrators, require linear history,
reject force pushes and deletions, and leave restrictions empty. There is no
generic bypass for agents, Copilot, Renovate, or other bots. Any emergency
exception must be an explicitly authorized repository-administrator action,
outside the committed policy and without adding a bypass entry.

### Step 3 — Apply via API if preferred

With a PAT that can administer the repository:

```bash
gh api \
   --method PUT \
   -H "Accept: application/vnd.github+json" \
   repos/CartagoGit/delendai/branches/main/protection \
   --input .github/branch-protection-main.payload.json

gh api \
   --method PUT \
   -H "Accept: application/vnd.github+json" \
   repos/CartagoGit/delendai/branches/develop/protection \
   --input .github/branch-protection-develop.payload.json
```

Construct each payload from the matching branch entry in
[`.github/branch-protection.yml`](../../.github/branch-protection.yml).
The repo deliberately does not store ready-to-post payload files because the
YAML file is the canonical reviewed source.

### Step 4 — Verify after applying

The verifier defaults to the current repository and reads
`GITHUB_TOKEN`, `BRANCH_PROTECTION_TOKEN`, or `--token` in that order.
Use a PAT with repository administration scope if the ambient token cannot read
protection settings.

```bash
GITHUB_TOKEN=<admin-pat> \
   bun tools/scripts/ci/verify-branch-protection.script.ts
```

Expected success output:

```text
verify-branch-protection: 2 of 2 branch(es) read match the declared policy ✓
```

To target another repository explicitly:

```bash
GITHUB_TOKEN=<admin-pat> \
   bun tools/scripts/ci/verify-branch-protection.script.ts \
      --owner CartagoGit \
      --repo delendai
```

## CI usage

The `delendai-validate` job is the required aggregate check for `develop`.
The separate `develop-protection-live` job runs on `develop` and invokes the
live guard when `BRANCH_PROTECTION_TOKEN` is available. A failing live run
means the GitHub branch-protection state has drifted from the committed policy
and must be corrected before the repository is treated as compliant.

## Updating the policy

Update [`.github/branch-protection.yml`](../../.github/branch-protection.yml)
whenever:

- A required status check is renamed.
- A required status check is added or removed.
- A branch should gain or lose the shared protection policy.

Every policy change should be followed by a fresh verifier run against the live
repository settings.

## Failure modes

If the verifier reports drift immediately after a UI change:

1. Re-check the exact required-check names for typos or case drift.
2. Confirm that `Require branches to be up to date before merging` is ON.
3. Confirm that force-push and deletion exceptions are disabled.
4. Re-read the API response directly:

    ```bash
    gh api repos/CartagoGit/delendai/branches/develop/protection
    gh api repos/CartagoGit/delendai/branches/main/protection
    ```

If the verifier reports an auth or rate-limit problem, that is not policy drift;
it means the verification run itself lacked enough GitHub API access to assert
the repository state.

## Release-branch discipline

`release/{patch|minor|major}/{kebab-slug}` branches are treated the same as `main`:

- Direct push to `release/*` or `main` is blocked locally by
   `tools/scripts/lint/push-to-develop-discipline.script.ts` and by
   `tools/scripts/lint/release-pr-gate.script.ts`.
- Push from `release/*` to any destination other than `main` is
   blocked (release does not nest and does not merge into develop directly).
- The `release-pr-gate` gate runs in `lefthook` (pre-push) as **blocking**
   for `release/*` and `main`, and runs again in CI as
   `.github/workflows/release-pr-gate.yml`.

Bypass de emergencia: `LEFTHOOK_BYPASS=1 git push …`. CI re-confirma.

## Related

- [ADR 0019 — Branch model: `develop` is the lab, `main` is publication](adr/0019-branch-model-develop-lab-main-release.md)
- [c00145 — `develop` is not protected by default in `commit-policy`](../proposals/ready/chores/c00145-protectedbranches-default-main-only.md)
- [x00257 — Eliminar `force-with-lease` para ramas protegidas](../proposals/ready/fixes/x00257-eliminar-force-with-lease-ramas-protegidas.md)
- [x00299 — Permitir persistencia configurada hacia `develop`](../proposals/ready/fixes/x00299-permitir-persistencia-configurada-hacia-develop.md)
- [v00125 — Verificar estado real de `develop`](../proposals/ready/verifications/v00125-verificar-estado-real-develop-verde-protegida.md)
