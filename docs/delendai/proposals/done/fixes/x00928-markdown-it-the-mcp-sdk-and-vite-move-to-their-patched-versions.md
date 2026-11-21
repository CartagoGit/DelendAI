---
id: x00928
title: "markdown-it, the MCP SDK and vite move to their patched versions"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-20
last-transition-id: 3bb32da0-e7f5-4a8a-afbf-6904ec061b3b
last-correlation-id: 3bb32da0-e7f5-4a8a-afbf-6904ec061b3b
last-transition-from: review
last-transition-at: 2026-10-23T07:58:05.232Z
shipped-in:
  - "ed4fac194caf"
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

- **Status**: done
- **Files**: `bun.lock`, `package.json`, `apps/web/package.json`, `docs/delendai/DEPENDENCY-VERSIONS.md`
- **Gate**: none
- acceptance:
  - "`bun run lint:dependency-advisories` passes (only braces is excepted, as before)."
  - "`bun install --frozen-lockfile` accepts the lockfile."
  - "markdown-it 15.0.3 renders from `apps/web`."
- shipped-in: `ed4fac194caf`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ed4fac194caf, validate exit 0, tests 4/4; acceptance 3/3: (1) Run in this worktree: `bun run lint:dependency-advisories` exits 0 and reports 'excepted braces: high GHSA-vfj7-8cjw-p6xm - braces vulnerable to stack-exhausti… (2) Run in this worktree: `bun install --frozen-lockfile` exits 0 and reports 'Checked 912 installs across 973 packages (no changes)'. The lockfile is unchanged by… (3) markdown-it 15.0.3 is what apps/web resolves and renders: the lockfile's top-level entry is "markdown-it": ["markdown-it@15.0.3", ...] (bun.lock:2743), `requir… — Gate is `none`. Verified in this worktree: `bun run lint:dependency-advisories` exit 0 (1 excepted - braces only, the exception the non-goal keeps); `bun install --frozen-lockfile` exit 0 with 'no changes' and the lockfile byte-identical afterwards; the apps/web markdown-it render spec 4/4 with markdown-it resolving to 15.0.3 (the two nested copies on the patched 14.3.3). The rest of the proposal's why is visible in the tree too: @modelcontextprotocol/sdk is 1.32.0 in the lockfile and pinned exactly to 1.32.0 in package.json:345 and apps/web/package.json:51, and vite is 8.2.4. Note for the queue: this slice's files were later touched by unrelated dependency work on develop (the lockstep-release and advisory-floor commits), so the slice as it now stands is not ed4fac194caf alone; the versions this slice pinned are all still in place. Delivery: the lockfile and pin change landed in merge 3523da1f3 (PR #1321) and the pin allowance in ed4fac194caf; merge fa605058c8be is PR #1323.

## acceptance

- `lint-security` passes on this pull request.
