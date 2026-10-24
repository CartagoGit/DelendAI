---
id: x00937
title: "A version reaching main becomes a GitHub Release with its changelog, and npm is published only when the owner asks for it"
kind: fix
status: done
type: proposal
track: release
date: 2026-10-23
last-transition-id: 93d259b4-86cf-4623-9237-1862fb28b8d8
last-correlation-id: 93d259b4-86cf-4623-9237-1862fb28b8d8
last-transition-from: review
last-transition-at: 2026-10-24T17:40:48.661Z
shipped-in:
  - "3df878ba206ecca806cff991f6553e6e6c3d1fef"
---

# x00937 — A version reaching main becomes a GitHub Release with its changelog, and npm is published only when the owner asks for it

## goal

Merging a promotion that carries a new version tags `vX.Y.Z` and creates its GitHub Release, with that version's CHANGELOG section as notes and marked pre-release until the owner says otherwise, without anyone pushing a tag; publishing to npm happens only from a manual run with `publish_npm: true`, never from a tag or a merge.

## why

On 2026-10-23 the owner asked for the 0.2.0 GitHub Release and its changelog. The only path the workflow offered was pushing `v0.2.0`, and `release.yml` treats a tag as the order to publish every PUBLISH_ORDER package to npm: the run reached `release --publish --tool=npm` and was cancelled during its validate step, before any package was published (`@delendai/contracts` still 404 on the registry). The owner's decision is that nothing goes to npm until a robust beta. The GitHub Release had to be created by hand, and the workflow's own release step would have used `--generate-notes` (GitHub's list of pull requests) instead of the CHANGELOG section `release:prepare` writes (f00787).

The owner also expects every version that reaches main to be released without a separate manual act. The tag is today a person's job; nothing creates it when a promotion carrying 0.2.0 merges.

## non-goals

- Changing how `release:prepare` derives the version or writes the section.
- Removing npm publishing: it stays, behind an explicit manual input.

## slices

- global_gate: type

### S1 — The release notes are the CHANGELOG section
- **Status**: done
- **Files**: `tools/scripts/release/release-notes.script.ts`, `tools/scripts/release/release-notes.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "`bun run release:notes --version=X.Y.Z` prints the body of the `## [X.Y.Z]` CHANGELOG section and fails, naming the version, when there is none."
  - "A spec reads a fixture CHANGELOG and asserts the section between its heading and the next one is returned, and a missing version fails."
- shipped-in: `7cad519b52ef`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 3df878ba206e, validate exit 0 and tests 2/2 claimed, no recorded run cited; acceptance 2/2: (1) release-notes.script.ts + release:notes in package.json; spec 'returns the section between heading and next' and 'nothing for a version the changelog does not … (2) release-notes.spec reads a fixture CHANGELOG, asserts section and missing version; 2 pass — verified by code reading and spec runs

### S2 — main tags and releases its version; npm waits for the owner
- **Status**: done
- **Files**: `.github/workflows/release.yml`
- **Gate**: type
- acceptance:
  - "A push to main whose core version has no `vX.Y.Z` tag yet creates that tag on the pushed commit and a GitHub Release from `release:notes`, marked pre-release; a push whose version is already tagged does nothing."
  - "A tag push no longer publishes: the npm steps run only on `workflow_dispatch` with the input `publish_npm: true`, and a manual run without it only (re)creates the GitHub Release."
  - "The workflow header says the npm decision is the owner's, and that no tag or merge publishes."
- shipped-in: `7cad519b52ef`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 3df878ba206e, validate exit 0 and tests 2/2 claimed, no recorded run cited; acceptance 3/3: (1) release.yml tags the pushed commit when v$VERSION is untagged and creates a Release from release:notes; skipped if tagged. (Candidate marked pre-release; later… (2) npm job only if workflow_dispatch and inputs.publish_npm == true (3) header lines 15-20 say the npm decision is the owner's and no tag or merge publishes — verified by code reading and spec runs

## acceptance

- `bun run release:notes --version=X.Y.Z` prints the body of the `## [X.Y.Z]` CHANGELOG section and fails, naming the version, when there is none.
- A spec reads a fixture CHANGELOG and asserts the section between its heading and the next one is returned, and a missing version fails.
- A push to main whose core version has no `vX.Y.Z` tag yet creates that tag on the pushed commit and a GitHub Release from `release:notes`, marked pre-release; a push whose version is already tagged does nothing.
- A tag push no longer publishes: the npm steps run only on `workflow_dispatch` with the input `publish_npm: true`, and a manual run without it only (re)creates the GitHub Release.
- The workflow header says the npm decision is the owner's, and that no tag or merge publishes.
