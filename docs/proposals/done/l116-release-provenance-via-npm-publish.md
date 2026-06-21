---
id: l116
status: done
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

## Implementation note (2026-06-21 — supersedes Approach A above)

Verified on disk (`npm publish --dry-run` against `packages/core` and
`plugins/proposals`, plus a grep of every package's `dependencies` and
`peerDependencies`): **the premise above does not hold for this repo.**
`workspace:*` only ever appears in `devDependencies` (`@mcp-vertex/core` is
a dev-only type/build dependency for every plugin); `npm publish` never
installs or inspects `devDependencies`, so it does not choke on the
workspace protocol. The `peerDependencies` entry (the one that actually
matters at install time for a consumer) already gets rewritten from
`workspace:*` to a resolved `^X.Y.Z` range by `applyPlan()` in
`scripts/release.ts` whenever `--write` runs — independently of which tool
publishes afterwards.

So the pre-publish rewrite script (Approach A) and its `git checkout --`
restore dance are unnecessary complexity for a problem that doesn't exist
here. The actual fix is narrow: add a `--provenance` flag to
`scripts/release.ts` (passed through to `npm publish` only — a no-op
warning under `--tool=bun`, since bun doesn't support provenance), and
flip `.github/workflows/release.yml`'s publish step to
`--tool=npm --provenance`. No workspace-rewrite step, no restore step, no
new script under `scripts/release/`.

Implemented in `scripts/release.ts` (`--provenance` flag, `publishAll`
threads it through to `npm publish --provenance`) +
`.github/workflows/release.yml` (publish step now
`bun run release --set="$VERSION" --write --publish --tool=npm --provenance`).
Tests: `packages/core/tests/release.spec.ts` (`parseFlags` coverage for
`--tool`/`--provenance`).

If a *future* package ever needs `workspace:*` in `dependencies` or
`peerDependencies` (not just `devDependencies`), Approach A's rewrite
script becomes necessary again — re-open this proposal at that point
instead of resurrecting dead code preemptively.

## Non-goals

- Re-bumping versions. The semver flow is unchanged.
- Touching the 10 packages' runtime code.
- Adding OIDC tokens for non-npm registries (out of scope until we ship to
  another registry).

## Slices

### S1 — `--provenance` flag in `scripts/release.ts` ~~Pre-publish rewrite script~~

  - **Status**: done (superseded scope — see "Implementation note" above;
    no rewrite script needed)
  - **Files**: `scripts/release.ts` (`--provenance` CLI flag,
    `publishAll(tool, provenance)` passes `npm publish --provenance`; warns
    and no-ops under `--tool=bun`), `packages/core/tests/release.spec.ts`
    (new — `parseFlags` coverage: default tool/provenance, `--tool=npm`,
    `--provenance`, unknown `--tool` rejected, `--bump`+`--set` rejected,
    full flag combination).
  - **Command**: `bunx vitest run packages/core/tests/release.spec.ts`
  - **Expect**: pass (15/15 incl. pre-existing `release-plan.spec.ts`).

### S2 — Wire into `release.yml`
  - **Status**: done
  - **Files**: `.github/workflows/release.yml` (publish step now
    `bun run release --set="$VERSION" --write --publish --tool=npm --provenance`,
    with an inline comment on why `workspace:*` in `devDependencies` is not
    a blocker).
  - **Command**: `bun run validate`
  - **Expect**: green; no static-analysis regression (verified: full
    `tsc --noEmit` 0 errors, scoped vitest 15/15 green).

### S3 — Replay test (dry-run in CI)
  - **Status**: not done (out of scope for this round — requires a live
    OIDC-enabled CI run to actually assert an attestation; the local
    `npm publish --dry-run` check already confirms the tarball assembles
    cleanly for `packages/core` and `plugins/proposals`, which was the part
    that needed de-risking before touching production CI). Left as a
    follow-up if/when the team wants automated provenance verification in
    CI rather than first-tag observation.

### S4 — Audit close
  - **Status**: done
  - **Files**: `docs/proposals/done/audits/a016-16-06-2026-auditoria-maestra-unificada.md`
    (release/CI provenance line → `[x]` with link to this proposal).
  - **Command**: none.
  - **Expect**: master audit `release provenance` checkbox is now `[x]`.

## Acceptance

- [x] `release.yml`'s publish step passes `--tool=npm --provenance`.
- [x] `scripts/release.ts` supports `--provenance` (npm-only, no-op warning
      under `--tool=bun`).
- [x] No pre-publish workspace-rewrite step needed (verified: zero
      `workspace:*` outside `devDependencies` across all 10 packages).
- [ ] `npm view <pkg>@<v> --json | jq .dist.attestations` returns the
      provenance attestation payload — **verifiable only on the next real
      tag/publish**, not at proposal-authoring time.
- [x] Master audit release/CI provenance line is `[x]`.

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
