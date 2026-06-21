---
id: l116
status: ready
type: proposal
track: release+ci
date: 2026-06-21
kind: feat
title: Release provenance: switch final publish step to npm publish --provenance
---

# l116 — Release provenance: switch final publish step to `npm publish --provenance`

## Goal

Close the master audit's `[ ]` on Release/CI provenance
(`docs/proposals/audits/a1-16-06-2026…md` line 248) by making the
`release.yml` workflow actually produce **npm provenance attestations** on
each published artefact. Today the workflow ends with `bun publish`, which
does **not** support `--provenance` (bun 1.3.x limitation). The repo already
declares `id-token: write` on the workflow, so the permission is sitting
unused.

## Why

- Provenance is the *attestable link* between the published tarball and the
  exact commit + workflow run that produced it. It's the modern npm
  supply-chain expectation (SLSA-style).
- The permission is granted but inert — `id-token: write` without
  `npm publish --provenance` is just dead YAML.
- The cost of switching is low: the only reason `bun publish` is used today
  is to rewrite `workspace:*` dependencies into versions on publish (bun
  ships that automatically; `npm publish` does **not**).

## The trade-off (must be acknowledged)

`npm publish --provenance` requires either:
1. The packages to have **resolved versions** (no `workspace:*`) in
   `package.json` at publish time, or
2. A custom `--workspace` flag (npm 10.x) that is **not** equivalent to bun's
   rewrite.

Two viable approaches:

- **Approach A (preferred)**: a tiny **pre-publish script** that walks the
  10 packages, resolves every `workspace:*` to the corresponding version
  from `bun run build`'s `dist/manifest.json`, and writes them in place
  *just for the publish step* (then restores via `git checkout --`). Then
  `npm publish --provenance` is the final command.
- **Approach B**: keep `bun publish` for the *workspace rewrite*, and add a
  **post-publish** `npm dist-tag add --provenance` step. **Drawback:** npm
  does not support adding provenance to an already-published version
  retroactively. **Approach B is a dead end.** Do not pursue.

So: **Approach A**.

## Non-goals

- Re-bumping versions. The semver flow is unchanged.
- Touching the 10 packages' runtime code.
- Adding OIDC tokens for non-npm registries (out of scope until we ship to
  another registry).

## Slices

### S1 — Pre-publish rewrite script
  - **Status**: ready
  - **Files**: `scripts/release/resolve-workspace-deps.ts` (new),
    `scripts/release/resolve-workspace-deps.spec.ts` (new, 6 cases: pinned
    version, missing peer, `workspace:*` for a package not in the build,
    multiple references, idempotent, restore-on-failure).
  - **Command**: `bunx vitest run scripts/release`
  - **Expect**: pass; the script is a pure function over the build manifest.

### S2 — Wire into `release.yml`
  - **Status**: ready
  - **Files**: `.github/workflows/release.yml` (replace the `bun publish`
    line with `bun scripts/release/resolve-workspace-deps.ts` →
    `npm publish --provenance --access public` per package, then
    `git checkout --` to restore).
  - **Command**: `bun run validate`
  - **Expect**: green; no static-analysis regression.

### S3 — Replay test (dry-run in CI)
  - **Status**: ready
  - **Files**: `.github/workflows/release.yml` (add a `release-dry-run` job
    that runs the new publish pipeline against a **fixture** package in
    `/tmp`, asserting the tarball would be `npm view`'d as having a
    provenance attestation). New file:
    `scripts/release/dry-run-provenance.ts`.
  - **Command**: `bun run smoke:release`
  - **Expect**: green; the dry-run job in CI is a non-publish sanity check.

### S4 — Audit close
  - **Status**: ready
  - **Files**: `docs/proposals/audits/a1-16-06-2026-…md` (line 248 → `[x]`
    with link to this proposal; remove the "provenance NOT implemented"
    note at line 855).
  - **Command**: none.
  - **Expect**: master audit `release provenance` checkbox is now `[x]`.

## Acceptance

- [ ] `npm view <pkg>@<v> dist.integrity` shows a non-empty
      `dist.signature` / `npm-signature` field.
- [ ] `npm view <pkg>@<v> --json | jq .dist.attestations` returns the
      provenance attestation payload.
- [ ] `release.yml` runs end-to-end in CI on a tag.
- [ ] Master audit line 248 is `[x]`.
- [ ] Master audit line 855 (provenance NOT implemented) is removed.

## Risk register

- **R1 — `npm publish` doesn't understand `workspace:` at all**: confirmed,
  hence the resolve script. Tests cover it.
- **R2 — `git checkout --` after a partial publish leaves the repo dirty
  if a step fails mid-way**: the resolve script is wrapped in
  `try/finally` that **always** restores. S1 spec covers the
  restore-on-failure case explicitly.
- **R3 — OIDC token not available in self-hosted runners**: workflow stays
  on `ubuntu-latest` GitHub-hosted. Documented in the workflow comment.

## Linked references

- Master audit: `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (lines 248, 855).
- Current release pipeline: `.github/workflows/release.yml`,
  `scripts/release.ts`.
- npm provenance docs:
  <https://docs.npmjs.com/generating-provenance-statements> (cited for the
  implementer; not fetched at proposal time on purpose — keep this
  proposal self-contained for the agent that will own the slice).
