---
id: x00928
title: "markdown-it, the MCP SDK and vite move to their patched versions"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-20
last-transition-id: f3faff24-801c-4ba7-ad15-c91901812fd9
last-correlation-id: f3faff24-801c-4ba7-ad15-c91901812fd9
last-transition-from: in-progress
last-transition-at: 2026-10-20T21:12:28.974Z
---

# x00928 — markdown-it, the MCP SDK and vite move to their patched versions

## goal

The lockfile carries no advisory again, and every pull request's `lint-security` job passes.

## why

On 2026-10-20 the advisory GHSA-r7fv-28h4-cvq7 was published: markdown-it has quadratic complexity in `smartquotes` with unmatched closing quotes. It is rated high. Patched releases are 15.0.2 and 14.3.2.

The lockfile held markdown-it 15.0.1 (apps/web) and 14.3.1 (under `@vscode/vsce` and `typedoc`). So `lint:dependency-advisories` failed in every pull request's `lint-security` job: #1318 failed on it, and the queue (`keep-the-queue-moving`) has failed on develop since the morning.

A root `overrides` pin would force one version on both majors, and vsce and typedoc ask for `^14`. So each range moves within itself instead.

`bun install` would have re-resolved hundreds of unrelated entries and bumped `lockfileVersion` past what CI runs. The entries are therefore edited directly, with the registry's own integrity hashes:

- markdown-it 15.0.3, plus argparse 3.0.3 and entities 8.1.0, the minimums 15.0.3 raises;
- markdown-it 14.3.3 for both nested copies, with the same dependencies as 14.3.1.

While #1321 ran, three more advisories were published:

- `@modelcontextprotocol/sdk` < 1.32.0: GHSA-22jm-h49p-29qw (high; experimental tasks not tied to the session that created them) and GHSA-6prh-2h8m-c8cw (moderate; cross-origin redirects re-sending headers and bodies). The lockfile held 1.31.0, pinned exactly in `package.json` and `apps/web/package.json`.
- vite ≤ 8.2.3: GHSA-698v-4r3x-3vcv (moderate, through launch-editor). The lockfile held 8.2.2.

1.32.0 declares the same dependencies and peers as 1.31.0, and vite 8.2.4 the same as 8.2.2. So each takes its new version and integrity, and the two exact pins move to 1.32.0. The core suite (4,779 tests) passes on SDK 1.32.0.

`bun install --frozen-lockfile` accepts the result.

## non-goals

- Lifting the braces exception. It has no patched version and stays until its review date.

## slices

- global_gate: none

### S1 — Patched versions in the lockfile

- **Status**: review
- **Files**: `bun.lock`, `package.json`, `apps/web/package.json`, `docs/delendai/DEPENDENCY-VERSIONS.md`
- **Gate**: none
- acceptance:
  - "`bun run lint:dependency-advisories` passes (only braces is excepted, as before)."
  - "`bun install --frozen-lockfile` accepts the lockfile."
  - "markdown-it 15.0.3 renders from `apps/web`."
- shipped-in: `ed4fac194caf`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `lint-security` passes on this pull request.
