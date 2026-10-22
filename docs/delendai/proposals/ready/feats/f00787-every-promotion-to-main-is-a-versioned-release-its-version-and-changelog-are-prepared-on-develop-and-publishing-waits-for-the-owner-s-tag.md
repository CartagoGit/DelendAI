---
id: f00787
title: "Every promotion to main is a versioned release: its version and changelog are prepared on develop, and publishing waits for the owner's tag"
kind: feat
status: ready
type: proposal
track: release
date: 2026-10-22
---

# f00787 — Every promotion to main is a versioned release: its version and changelog are prepared on develop, and publishing waits for the owner's tag

## goal

A promotion from develop to main carries a lockstep version and a CHANGELOG section written for it, both prepared by one command from what reached done or review since the last release; the promotion gate refuses a promotion without them; and the tag that publishes stays the owner's act. The first application is 0.2.0.

## why

main is 2,594 commits and 356 merged pull requests behind develop (2026-10-22), and nothing says what version that is. There is no `vX.Y.Z` tag at all, so `derive-version.script.ts` would publish whatever `package.json` declares (0.1.1 for core, 0.1.0 for the root). `CHANGELOG.md` was last written for `@mcp-vertex/core` before the rebrand: its [Unreleased] section describes features from August under the old name, and nothing has added to it since.

The parts exist and are not joined. `release.script.ts` bumps every package in lockstep (`--bump=minor --write`); `derive-version.script.ts` maps Conventional Commits to a bump (feat → minor, fix/perf → patch, breaking → major); the git plugin builds a conventional-commit changelog for a range (`plugins/git/src/lib/services/changelog.ts`); `release.yml` publishes 61 packages only when a `vX.Y.Z` tag is pushed, deliberately not on a push to main, because a promotion and a public npm release are two decisions. Nobody runs the first three before a promotion, so main receives code with no version and no account of what changed.

A commit-level changelog of 356 pull requests is thousands of lines nobody reads. The unit that says what changed here is the proposal: each one that reached done or review since the last release has a kind (feat, fix, perf, refactor…) and a title written for a reader. The changelog is built from those, grouped the Keep-a-Changelog way, with the proposal id beside each line.

The owner's rule (2026-10-22): while the product is new, a release is a minor unless it carries only fixes, then a patch; every promotion to main is versioned.

## non-goals

- Publishing without the owner. The tag push stays a person's act; this proposal prepares the version and the notes the tag will publish.
- Changing `release.yml`'s publish chain, the npm token or provenance.
- Rewriting the history of earlier releases: the old [Unreleased] section is kept under its own heading as what it was.

## slices

- global_gate: type

### S1 — One command prepares a release on develop
- **Status**: pending
- **Files**: `tools/scripts/release/prepare-release.script.ts`, `tools/scripts/release/prepare-release.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`bun run release:prepare` reads the proposals that reached done or review between the last `vX.Y.Z` tag (or main, when there is none) and develop, derives the bump by the owner's rule — minor if any is not a fix, patch if all are fixes, major only for a `breaking` kind — and prints the version and the section it would write; `--write` applies the lockstep version through `release.script.ts` and writes the section into `CHANGELOG.md`."
  - "The section groups entries as Added (feat), Fixed (fix), Changed (refactor, perf, breaking), Documentation (docs), each line the proposal's title and id; plans and audits are listed under their own heading by id only."
  - "A spec drives it over a fixture of proposals and asserts the bump for an all-fix set, a mixed set and a breaking one, and the grouping of the section."

### S2 — The promotion gate refuses an unversioned promotion
- **Status**: pending
- **Files**: `.github/workflows/release-pr-gate.yml`, `tools/scripts/release/release-pr-check.script.ts`
- **Gate**: type
- acceptance:
  - "A pull request into main fails `release-pr-gate` unless its head declares a lockstep version greater than main's and `CHANGELOG.md` has a section headed with that version and today's or an earlier date."
  - "The check names what is missing and the command that prepares it (`bun run release:prepare --write`)."

### S3 — 0.2.0 is prepared and the changelog speaks the current name
- **Status**: pending
- **Files**: `CHANGELOG.md`
- **Gate**: type
- acceptance:
  - "Every package carries 0.2.0 in lockstep and `CHANGELOG.md` opens with a `## [0.2.0] — <date>` section built by S1; the stale `@mcp-vertex` [Unreleased] section is kept below under a heading that says it predates the rebrand."
  - "`bun run release` (dry-run) prints 0.2.0 for every package in PUBLISH_ORDER, and no tag is pushed by this slice."

## acceptance

- `bun run release:prepare` reads the proposals that reached done or review between the last `vX.Y.Z` tag (or main, when there is none) and develop, derives the bump by the owner's rule — minor if any is not a fix, patch if all are fixes, major only for a `breaking` kind — and prints the version and the section it would write; `--write` applies the lockstep version through `release.script.ts` and writes the section into `CHANGELOG.md`.
- The section groups entries as Added (feat), Fixed (fix), Changed (refactor, perf, breaking), Documentation (docs), each line the proposal's title and id; plans and audits are listed under their own heading by id only.
- A spec drives it over a fixture of proposals and asserts the bump for an all-fix set, a mixed set and a breaking one, and the grouping of the section.
- A pull request into main fails `release-pr-gate` unless its head declares a lockstep version greater than main's and `CHANGELOG.md` has a section headed with that version and today's or an earlier date.
- The check names what is missing and the command that prepares it (`bun run release:prepare --write`).
- Every package carries 0.2.0 in lockstep and `CHANGELOG.md` opens with a `## [0.2.0] — <date>` section built by S1; the stale `@mcp-vertex` [Unreleased] section is kept below under a heading that says it predates the rebrand.
- `bun run release` (dry-run) prints 0.2.0 for every package in PUBLISH_ORDER, and no tag is pushed by this slice.
