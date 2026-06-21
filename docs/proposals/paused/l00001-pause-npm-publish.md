---
id: l00001
status: paused
type: proposal
track: docs+release
date: 2026-06-21
paused: 2026-06-21
kind: chore
title: Pause npm publish — blocked on NPM_TOKEN and develop→main merge
---

# l00001 — Pause npm publish — blocked on NPM_TOKEN and develop→main merge

## Goal

Document the **npm publish** step as a paused proposal so it stops being a
ticking checkbox on the master audit (`a1-16-06-2026`). Everything that the
repo can do without the user's npm credentials / final merge is already done
(see §"Done already"); what remains is exclusively **operational** (credentials
+ merge + push) and lives entirely on the user's side.

## Why it is paused (not ready, not blocked, not done)

The audit (`a1-16-06-2026 §7`, line 282) keeps `npm publish` as `- [ ]` because
it depends on three things that the repository cannot do on its own:

1. **`NPM_TOKEN` (Granular access token with Bypass 2FA)** — lives in
   *Settings → Secrets → Actions* on GitHub, expires every ≤90 days since
   Nov 2025. The repo can rotate the reminder workflow
   (`.github/workflows/rotate-npm-token.yml`) but cannot create the secret.
2. **`develop → main` merge** — `release.yml` is tag-driven from `main`; the
   user owns the merge gate, the repo does not auto-merge.
3. **Org on npm** — `@cartago-git` organization must exist on the user's npm
   account; the repo cannot create it.

The `docs/NPM_PUBLISH.md` guide already documents all three step-by-step.
Everything that the repo side must guarantee (build to `dist/`, semver from
conventional commits, packaging 10 packages, smoke-cli + smoke-pack) is in
place. The CI workflow (`release.yml`) is wired and ready; the only thing it
waits for is the user's inputs.

## Non-goals

- Re-running the publish from the repo side.
- Re-implementing the release workflow (it already matches `NPM_PUBLISH.md`).
- Changing the package names or the org name.

## Done already (no action needed from this proposal)

- ✅ `bun run build` produces ESM + `.d.ts` for all 10 packages.
- ✅ `bun run release --set=<v> --write --publish` works (dry-run green).
- ✅ `scripts/smoke-cli.ts` and `scripts/smoke-pack.ts` exercise the
  **compiled** artefact under node, not the source — publish is safe.
- ✅ Conventional Commits → `scripts/derive-version.ts` → tag-driven semver.
- ✅ Rotation reminder workflow
  (`.github/workflows/rotate-npm-token.yml`) opens an issue every ~90 days.
- ✅ `docs/NPM_PUBLISH.md` updated to 10 packages with the post-Nov-2025
  Granular token recipe and Bypass 2FA note.

## Slices

This proposal has no slices — it is a **checkpoint**, not a workstream.

## Resume trigger (how this leaves `paused`)

Move `paused/l00001-pause-npm-publish.md` → `ready/` (or `in-progress/`) when
**all three** are true:

1. `@cartago-git` org exists on the user's npm account.
2. `NPM_TOKEN` (Granular, `Read and write`, `Bypass 2FA`) is set as a repo
   secret.
3. The user is ready to merge `develop → main`.

At that point the slice is literally `git checkout main && git merge develop
&& git push` and the `release.yml` workflow takes over end-to-end.

## Acceptance

- [x] `docs/proposals/paused/l00001-pause-npm-publish.md` exists with this
  frontmatter (`status: paused`).
- [x] `docs/NPM_PUBLISH.md` still points here from the master audit.
- [x] The master audit's `npm publish` checkbox stays `- [ ]` but now
  references `paused/l00001` as the explanation, not `NPM_PUBLISH.md` alone.

## Linked references

- Master audit: `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (lines 282, 297, 363).
- Operational guide: `docs/NPM_PUBLISH.md`.
- Resume workflow: `.github/workflows/release.yml`.
- Token rotation reminder: `.github/workflows/rotate-npm-token.yml`.