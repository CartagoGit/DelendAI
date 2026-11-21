---
name: delendai-conventional-commits-and-release
appliesTo: ['@delendai/core']
description: How a commit message is written, how `release:prepare` picks the version and the CHANGELOG section from finished proposals, how a push to main becomes a tag and a GitHub Release, and why npm publishing is a separate manual act. Use before writing a commit message or running anything under `bun run release`.
---

# delendai conventional commits + release

## Decision tree

1. About to commit? -> pick the Conventional Commit type from the table below.
   Never hand-edit a `package.json` `version` field.
2. Preparing a promotion to `main`? -> `bun run release:prepare` (prints the
   version and the CHANGELOG section, writes nothing). Read it.
3. Plan looks right? -> `bun run release:prepare --write` applies the lockstep
   version (through `release.script.ts --set=<version> --write`) and writes the
   CHANGELOG section. `release:check` / the `release-pr-gate` check that the
   promotion carries both.
4. Merged to `main`? -> the `Release` workflow tags the commit `vX.Y.Z` and
   opens the GitHub Release by itself. Nothing is pushed by hand.
5. npm is a separate decision: only a manual `Release` run with
   `publish_npm: true` publishes; no tag and no merge does.

## Commit type -> bump `derive-version` would compute

| Commit prefix | Bump | Notes |
|---|---|---|
| `fix:` / `perf:` | patch | |
| `feat:` | minor | |
| `feat!:` / any `!:` / body has `BREAKING CHANGE:` | major | breaking always wins, regardless of type |
| `docs:` `chore:` `ci:` `test:` `style:` `build:` `refactor:` `revert:` | none | recognised but non-releasable — contributes nothing to the bump |
| anything else with real content (non-Conventional-Commit message) | patch | safe default in `classifyBump` (`derive-version.script.ts`), because automated commits sometimes don't follow the convention |

`classifyBump` in `tools/scripts/release/derive-version.script.ts` still
classifies commits this way (the strongest bump wins; merge commits are
skipped), but the release workflow no longer runs it: the version of a
release comes from `release:prepare`, below. The commit type still matters for
commit-lint and for readable history.

## `release:prepare` decides the version

- Unit of change is the **proposal**, not the commit: every proposal that
  reached `done/` or `review/` between the last `vX.Y.Z` tag (`origin/main`
  when there is none) and HEAD, and that an earlier CHANGELOG section does not
  already list, gives one line, grouped Keep-a-Changelog style by its kind
  (`feat` -> Added, `fix` -> Fixed, ...; plans and audits are listed by id).
  No such proposal -> it exits 1: nothing to release.
- Bump: a **minor**, or a **patch** when every proposal is a `fix`; a
  `breaking` proposal is a **major** from 1.0 on (a minor below it).
- A version already prepared and not yet tagged is refreshed in place, not
  bumped again.
- The lockstep lives in `tools/scripts/release/release-plan.ts`
  (`computeReleasePlan`): every package in `PUBLISH_ORDER` moves to the SAME
  target version, and any package with a `peerDependencies['@delendai/core']`
  gets that range rewritten to `^<target>`. `release.script.ts` is the writer.
- First release ever (no tag yet): the version declared in
  `packages/core/package.json` is the base.

## Flow: prepare -> merge to main -> GitHub Release -> (owner) npm

```
bun run release:prepare                    # print version + CHANGELOG section
bun run release:prepare --write            # apply lockstep version + write the section
bun run release:notes --version=X.Y.Z      # a version's CHANGELOG section (the Release notes)
```

`.github/workflows/release.yml`, on a push to `main`: read the version of
`packages/core/package.json`; if `vX.Y.Z` is not tagged yet, tag the pushed
commit and `gh release create` it (title `vX.Y.Z`, notes from `release:notes`,
marked latest). A push whose version is already tagged does nothing. A manual
run refreshes the notes of the current version (`gh release edit`).

npm: only `workflow_dispatch` with `publish_npm: true`, which runs
`bun run release --set="$VERSION" --write --publish --tool=npm --provenance`
on the tagged ref. The lower-level `bun run release` (dry-run without flags;
`--bump=`/`--set=` mutually exclusive; `--write`; `--publish`;
`--no-validate`; `--tool=bun|npm`) is what that run drives. `--publish` alone
publishes the CURRENT versions as-is, for a re-run after a failed publish.

## `PUBLISH_ORDER` (66 packages, fixed order)

From `tools/scripts/release/release-plan.ts` — leaf packages first
(`packages/contracts`, `packages/state`, `packages/sqlite`,
`packages/context-compiler`, `packages/core`, ...), then `packages/cli` and
the `plugins/*`. Read the file for the list; do not copy it here.

## Risks

- **A malformed header** (missing the trailing `:`, or `Chore:` capitalised)
  falls through `parseHeader`'s regex and CI's commit-lint may fail it. Keep
  the exact lowercase `type:` / `type(scope):` / `type!:` shape.
- **Misclassifying the proposal kind** — the release bump comes from the
  proposal `kind` (`fix` only -> patch, otherwise minor), so a `feat`
  proposal filed as `fix` ships a patch where a minor was due.

## Never do

- Never hand-edit a `version` field in any `package.json` — `release:prepare`
  / `release.script.ts` own that field exclusively.
- Never push a `vX.Y.Z` tag by hand or start an npm publish without the
  owner's decision: the tag is the workflow's act, npm is manual.
- Never run `--publish` without first reading the dry-run plan it prints.
- Never reorder `PUBLISH_ORDER` locally to "fix" a perceived dependency
  issue — it is derived from the real `peerDependencies` graph; if it looks
  wrong, that's a finding for a proposal, not a one-off local edit.

## Smoke

```
bunx vitest run tools/scripts/release/*.spec.ts
bun run release:prepare   # prints the plan, writes nothing
```
