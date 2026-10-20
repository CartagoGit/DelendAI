---
id: x00928
title: "markdown-it moves to its patched versions"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-20
---

# x00928 — markdown-it moves to its patched versions

## goal

The lockfile carries no advisory again, and every pull request's `lint-security` job passes.

## why

On 2026-10-20 the advisory GHSA-r7fv-28h4-cvq7 was published: markdown-it has quadratic complexity in `smartquotes` with unmatched closing quotes. It is rated high. Patched releases are 15.0.2 and 14.3.2.

The lockfile held markdown-it 15.0.1 (apps/web) and 14.3.1 (under `@vscode/vsce` and `typedoc`). So `lint:dependency-advisories` failed in every pull request's `lint-security` job: #1318 failed on it, and the queue (`keep-the-queue-moving`) has failed on develop since the morning.

A root `overrides` pin would force one version on both majors, and vsce and typedoc ask for `^14`. So each range moves within itself instead.

`bun install` would have re-resolved hundreds of unrelated entries and bumped `lockfileVersion` past what CI runs. The entries are therefore edited directly, with the registry's own integrity hashes:

- markdown-it 15.0.3, plus argparse 3.0.3 and entities 8.1.0, the minimums 15.0.3 raises;
- markdown-it 14.3.3 for both nested copies, with the same dependencies as 14.3.1.

`bun install --frozen-lockfile` accepts the result.

## slices

- global_gate: none

### S1 — Patched versions in the lockfile

- **Status**: in-progress
- **Files**: `bun.lock`
- **Gate**: none
- acceptance:
  - "`bun run lint:dependency-advisories` passes (only braces is excepted, as before)."
  - "`bun install --frozen-lockfile` accepts the lockfile."
  - "markdown-it 15.0.3 renders from `apps/web`."

## acceptance

- `lint-security` passes on this pull request.
