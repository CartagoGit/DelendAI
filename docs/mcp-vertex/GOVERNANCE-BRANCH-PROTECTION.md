# Branch protection governance — `develop` & `main`

> **Owner:** repository administrators.
> **Source of truth:** [`.github/branch-protection.ts`](../../.github/branch-protection.ts).
> **Verifier:** [`tools/scripts/ci/verify-branch-protection.script.ts`](../../tools/scripts/ci/verify-branch-protection.script.ts).
> **Audit refs:** c00130 / AUD-P0-001.

## Goal

`develop` and `main` MUST be protected on GitHub with:

1. **Required status checks** matching the names declared in
   [`.github/branch-protection.ts`](../../.github/branch-protection.ts).
2. **`enforce_admins: true`** — admins are subject to the same
   checks (no "I'm an admin so I'll bypass it" loophole).
3. **`required_linear_history: true`** — merge commits are not
   allowed; squash or rebase only.
4. **`allow_force_pushes: false`** — no rewrite of history.
5. **`allow_deletions: false`** — branches cannot be deleted
   through the UI/API.

The verifier (`verify-branch-protection.script.ts`) fetches the
live GitHub state and exits non-zero when the actual policy
diverges from the file.

## Why CI does not apply the policy

GitHub exposes branch protection via REST endpoints that require
the `admin:repo` (and for some settings `repo:invite`) OAuth
scopes. CI never holds these scopes because they would let a
malicious workflow write to the repo. The verifier is therefore
**read-only**: it checks whether the operator-applied policy is
correct, but never mutates it.

A malicious PR that bypasses CI cannot bypass the gate either —
the next CI run will catch the drift before any merge happens.

## Operator playbook

### Step 1 — Open the branch protection UI

1. Visit <https://github.com/CartagoGit/mcp-vertex/settings/branches>.
2. Click **Add rule** (or edit the existing rule for `develop` and `main`).

### Step 2 — Match the YAML file

Match every field in
[`.github/branch-protection.ts`](../../.github/branch-protection.ts):

- **Branch name pattern:** `develop` (repeat for `main`).
- **Require status checks to pass before merging:** ✅ ON.
- **Require branches to be up to date before merging:** ✅ ON
  (this is the `strict: true` flag — checks the latest commit).
- **Required checks:** add every name in `branches[].required_checks`.
  These names MUST match the `name:` field in
  `.github/workflows/*.yml` exactly (case-sensitive).
- **Require linear history:** ✅ ON.
- **Do not allow force pushes:** ✅ ON.
- **Do not allow deletions:** ✅ ON.
- **Allow specified actors to bypass pull request requirements:**
  leave empty.
- **Enforce admins:** ✅ ON.

### Step 3 — Run the verifier

Locally, with the operator's own GitHub PAT:

```bash
GITHUB_TOKEN=<your-pat-here> \
  bun tools/scripts/ci/verify-branch-protection.script.ts \
    --repo CartagoGit/mcp-vertex
```

Expected output:

```text
verify-branch-protection: 2 branch(es) match the declared policy ✓
```

If anything diverges, the script exits 1 and prints a per-branch
drift detail. Fix the UI to match and re-run.

### Step 4 — Wire the verifier into CI

Add the verifier to the `quality-gate` job's `Run configured
quality scopes` step (see [`c00132`](../proposals/ready/chores/c00132-quality-gate-pre-merge-jobs-reales.md)).
It must run on every PR that touches
`.github/branch-protection.ts` AND on a daily cron (so manual
drift in the UI is caught without a code change).

## When to update the YAML file

Update [`branch-protection.ts`](../../.github/branch-protection.ts)
whenever:

- A new required status check is added to the workflows.
- An existing check is renamed or removed.
- A new branch needs protection (e.g. a release branch).

The PR adding the change MUST include the verifier's output
showing both branches still match. The verifier is the contract.

## Failure mode: "the verifier says drift but I just fixed it"

Re-run the verifier after a short delay (GitHub API caches the
protection response for ~30 seconds). If the drift persists:

1. Re-read the UI: every check name is exactly the same as in
   `.github/branch-protection.ts` (case-sensitive, no extra
   spaces).
2. Confirm `enforce_admins` is ON, not OFF.
3. Check the API response manually with `gh api`:

   ```bash
   gh api repos/CartagoGit/mcp-vertex/branches/develop/protection
   ```

   Compare to the YAML file field-by-field.

## Rollback

If the verifier breaks the gate and blocks a legitimate merge:

1. Open a hotfix PR that:
   - Removes the failing check from `branch-protection.ts`.
   - Adds a follow-up TODO proposal to add it back after the
     underlying issue is fixed.
2. Get the hotfix reviewed and merged.
3. Fix the underlying issue, then re-add the check.

Do **not** disable the verifier in CI to make the gate green —
that defeats the audit goal.

## Related

- [c00131 — `develop` en `commit-policy.protectedBranches` por defecto](../proposals/ready/chores/c00131-develop-protectedbranches-default.md) (defensa en profundidad a nivel plugin).
- [x00257 — Eliminar `force-with-lease` para ramas protegidas](../proposals/ready/fixes/x00257-eliminar-force-with-lease-ramas-protegidas.md).
- [x00258 — Bloquear push directo a `develop`](../proposals/ready/fixes/x00258-bloquear-push-directo-develop-commit-policy.md).
- [v00125 — Verificar estado real de `develop`](../proposals/ready/verifications/v00125-verificar-estado-real-develop-verde-protegida.md).
