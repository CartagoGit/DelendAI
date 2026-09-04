# Branch protection governance — `develop` & `main`

> **Owner:** repository administrators.
> **Source of truth:** [`.github/branch-protection.yml`](../../.github/branch-protection.yml).
> **Verifier:** [`tools/scripts/ci/verify-branch-protection.script.ts`](../../tools/scripts/ci/verify-branch-protection.script.ts).
> **Audit refs:** c00130 / AUD-P0-001.

## Goal

`develop` is the open working branch. `main` is the protected release boundary.
The policy is declarative in [`.github/branch-protection.yml`](../../.github/branch-protection.yml)
and operationally applied by a human in the GitHub UI or API.
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

## Why this is declarative + manual

GitHub branch-protection writes require repository administration scope.
CI must not hold that permission. The repository therefore stores the intended
policy in version control and verifies the live state, but does not mutate the
GitHub settings itself.

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

For `develop`, leave required status checks, admin enforcement, linear
history, and "Require a pull request before merging" all disabled. `develop`
is deliberately the operator's flexible working branch, not a second `main`
— see [ADR 0019](adr/0019-branch-model-develop-lab-main-release.md) for the
decision and its trigger for reversal. This keeps ordinary development
commits and pushes flexible; CI may still provide advisory feedback through
the development workflows. If the UI wording changes, the canonical values
still live in [`.github/branch-protection.yml`](../../.github/branch-protection.yml).

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
      --repo mcp-vertex
```

## CI usage

Run the verifier in any governance or nightly workflow that is allowed to use
an admin-scoped token. A failing run means the live GitHub branch-protection
state has drifted from the committed policy and must be corrected before the
repository is treated as compliant.

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

Ramas `release/{patch|minor|major}/{kebab-slug}` se tratan igual que `main`:

- Push directo a `release/*` o `main` está bloqueado localmente por
   `tools/scripts/lint/push-to-develop-discipline.script.ts` y por
   `tools/scripts/lint/release-pr-gate.script.ts`.
- Push desde `release/*` hacia cualquier destino que no sea `main` está
   bloqueado (release no anida ni se mergea a develop directamente).
- El gate `release-pr-gate` corre en `lefthook` (pre-push) **bloqueante**
   para `release/*` y `main`, y vuelve a correr en CI como
   `.github/workflows/release-pr-gate.yml`.

Bypass de emergencia: `LEFTHOOK_BYPASS=1 git push …`. CI re-confirma.

## Related

- [ADR 0019 — Modelo de ramas: `develop` es laboratorio, `main` es publicación](adr/0019-branch-model-develop-lab-main-release.md)
- [c00145 — `develop` no está protegida por defecto en `commit-policy`](../proposals/ready/chores/c00145-protectedbranches-default-main-only.md)
- [x00257 — Eliminar `force-with-lease` para ramas protegidas](../proposals/ready/fixes/x00257-eliminar-force-with-lease-ramas-protegidas.md)
- [x00299 — Permitir persistencia configurada hacia `develop`](../proposals/ready/fixes/x00299-permitir-persistencia-configurada-hacia-develop.md)
- [v00125 — Verificar estado real de `develop`](../proposals/ready/verifications/v00125-verificar-estado-real-develop-verde-protegida.md)
