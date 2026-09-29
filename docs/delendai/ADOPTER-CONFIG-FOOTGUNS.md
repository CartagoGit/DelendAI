# Adopter config footguns

Two `delendai.config.json` shapes that look right at first read and then refuse
to boot. Each section names the contradiction, the rationale, the two recovery
paths, and the source-of-truth in the codebase that drives the refusal.

If you hit one of these on a fresh clone, the fix is **config, not code** — do
not start editing delendai to "make it accept" the config, because the refusal
is the engine being correct.

---

## 1. `push.branch` × `shared-checkout-merge`

### Symptom

Boot fails closed with:

```text
[push-target-contradicts-policy] plugins.commit-policy.options.push.branch:
`shared-checkout-merge` reaches `develop` through the forge and never by a
direct push, but this config names `develop` as the push target. The push can
never succeed, and the setting says the opposite of the profile.
```

### Why

`shared-checkout-merge` is a development profile where work reaches the
integration branch (`develop` by default) via the integration engine's local
merge cycle, not via `git push`. Naming `push.branch: "develop"` asks
commit-policy to push directly to a branch whose development policy never
permits a direct push — so the push would always be refused, the scheduler
would retry the same identical refusal, and the work would never land.

The two settings are not contradictory in isolation; they are contradictory
**as a pair**, and the policy-alignment guard in `assemble.ts:411` runs on
boot to catch the pair before work starts.

### Recovery (pick one)

| Path | When to pick it |
|---|---|
| **Remove `push.branch`** from `plugins.commit-policy.options` | You want the work to land on `develop` through the integration engine (the default `shared-checkout-merge` flow). commit-policy will still push WIP refs and protected-branch rules apply; only the integration branch is no longer named twice. |
| **Switch `development.profile` to `shared-direct`** | You genuinely want to commit and push directly to `develop`. This is a different development model and unlocks `commit.enabled: true` against the integration branch. Do not change profile if the team's workflow is "merge on the integration branch after a local gate". |

The policy-alignment guard is the single source of truth: see
[`packages/core/src/lib/development-policy/validate.ts:294`](packages/core/src/lib/development-policy/validate.ts#L294-L294)
and the test that pins the rule in
[`packages/core/tests/src/lib/development-policy/validate.spec.ts:286`](packages/core/tests/src/lib/development-policy/validate.spec.ts#L286-L286).

---

## 2. `state-database.corrupt` on a fresh clone

### Symptom

Boot reaches `En ejecución` but reports:

```text
[ERROR] startup-reconciliation.state-database.corrupt:
  /<workspace>/.cache/delendai/state/proposals.sqlite:
  The state database could not be opened: unable to open database file.
  The file was left untouched.
```

…followed by `Mutations blocked: true | recovery required: true` and
`Phases NOT EXECUTED: forge, journal`.

### Why

`proposals.sqlite` is a **derived, rebuildable projection** of the proposal
markdown tree — markdown stays the source of truth. A fresh clone, a CI
runner, or a worktree has never built it. The boot reconciliation opens it
read-only and reports its absence as a `state-database.corrupt` blocker
because the SQLite error code (`SQLITE_CANTOPEN`) is indistinguishable from
"file exists but is unreadable" until something has actually tried to
build it. The block is correct behaviour, but the remedy is **build the
projection**, not "the database is broken".

The same code path is treated as benign by `db-doctor` once you give it
something to look at: see the explicit `SQLITE_CANTOPEN` branch in
[`plugins/proposals/src/lib/services/db-doctor.ts:51`](plugins/proposals/src/lib/services/db-doctor.ts#L51-L51).

### Recovery

Call the `proposals_db_reconcile` tool. The first invocation creates the
file, and subsequent invocations update it. The tool is idempotent — two
runs over the same tree yield the same logical digest and duplicate no
rows. Files the projection cannot accept (unknown `kind`, unknown
`status`, unreadable frontmatter) come back in `excluded[]` rather than
being silently dropped, so the next step after a clean reconcile is
"investigate the exclusions", not "trust the database blindly".

If the reconcile reports `status: rejected` with
`reason: shadow reconciliation status is degraded`, the projection was
built but some files in your tree sit outside the projection's
vocabulary. The reconcile pipeline is doing the right thing — fixing
those files is a separate, visible decision.
