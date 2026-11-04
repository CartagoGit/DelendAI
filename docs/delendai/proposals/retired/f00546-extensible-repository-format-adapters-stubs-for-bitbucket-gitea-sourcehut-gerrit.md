---
id: f00546
title: "Extensible repository format adapters (stubs for Bitbucket, Gitea, SourceHut, Gerrit)"
kind: feat
status: retired
type: proposal
track: general
date: 2026-09-15
last-transition-id: 5874df87-a338-4317-bc02-f304fc012ec3
last-correlation-id: 5874df87-a338-4317-bc02-f304fc012ec3
last-transition-from: ready
---

# f00546 — Extensible repository format adapters (stubs for Bitbucket, Gitea, SourceHut, Gerrit)

> **Retired 2026-09-30**: `plugins/repo-formats/` was never created
> (`git ls-tree -r origin/develop -- plugins` has no such directory);
> all slices are still `pending`. This proposal is speculative empty
> stubs for VCS backends (Gerrit, SourceHut, Fossil, pijul) with zero
> current consumer demand, and it depends on `f00540`
> (`IGitHostProvider`), which is itself retired as never-built and
> superseded by the shipped `plugins/forge` design. Building fixtures
> and conformance tests for formats nobody has asked to use directly
> contradicts the current owner priority to simplify and consolidate
> before adding new surface.

## Goal

Define the IRepoFormatAdapter contract with capability flags so future backends (Bitbucket, Gitea, SourceHut, Gerrit, Phabricator, Fossil, pijul) integrate as plugins rather than additions to delendai core. Deliver empty stubs (no implementation) for 4 strategic formats to act as fixtures, conformance tests, and living documentation. The contract is what ships today; implementations land when a consumer needs them.

## why

Many VCSes do not fit the GitHub PR mental model: Gerrit uses patch series and Change-Id, SourceHut separates tickets from builds, pijul has channels, Fossil bundles everything. Forcing them into a PR-shaped abstraction would invent semantics. Capability flags let delendai degrade gracefully while keeping the door open. The stubs prevent an accidental rewrite later.

## non-goals

- Not implementing any real VCS adapter; only stubs and conformance tests.
- Not inventing fictional backends.
- Not coupling to P2 directly; IRepoFormatAdapter stays orthogonal to IGitHostProvider.

## Slices

- global_gate: type

### S1 — RepoFormatAdapter contract and capability flags
- **Status**: pending
- **Files**: `plugins/repo-formats/contract.ts`, `plugins/repo-formats/types.ts`, `plugins/repo-formats/package.json`
- **Gate**: type
- acceptance:
  - "Capability flags enumerated: pullRequest, directMerge, patchSeries, tickets, ciHosted, reviewThreads, requiredChecks, approvals, drafts, repoStorage (git or hg or fossil or pijul), signedCommitsRequired."
  - "Adapter exposes detect, openChange, mergeChange, getChange, optionally getTickets."
  - "RepoStorageCapability is a discriminated union."

### S2 — Registry and detectors
- **Status**: pending
- **Files**: `plugins/repo-formats/registry.ts`, `plugins/repo-formats/detect.ts`, `plugins/repo-formats/tests/registry.spec.ts`, `plugins/repo-formats/tests/detect.spec.ts`
- **Gate**: type
- acceptance:
  - "Registry accepts registrations and exposes resolve(formatId)."
  - "detect(remoteUrl) returns the adapter with highest confidence > 0.5 when none is pinned."
  - "Errors suggest plausible alternatives when ambiguous."

### S3 — Strategic stubs (Bitbucket, Gitea, SourceHut, Gerrit) + authoring guide
- **Status**: pending
- **Files**: `plugins/repo-formats/stubs/bitbucket.ts`, `plugins/repo-formats/stubs/gitea.ts`, `plugins/repo-formats/stubs/sourcehut.ts`, `plugins/repo-formats/stubs/gerrit.ts`, `plugins/repo-formats/tests/conformance.spec.ts`, `docs/delendai/authoring-repo-format.md`
- **Gate**: lint
- acceptance:
  - "Each stub declares its capabilities faithfully."
  - "Conformance suite verifies each stub exposes the contract surface; detect returns matched=false because no implementation."
  - "authoring-repo-format.md walks through adding a new format adapter in under 2 hours."

## acceptance

- Capability flags enumerated: pullRequest, directMerge, patchSeries, tickets, ciHosted, reviewThreads, requiredChecks, approvals, drafts, repoStorage (git or hg or fossil or pijul), signedCommitsRequired.
- Adapter exposes detect, openChange, mergeChange, getChange, optionally getTickets.
- RepoStorageCapability is a discriminated union.
- Registry accepts registrations and exposes resolve(formatId).
- detect(remoteUrl) returns the adapter with highest confidence > 0.5 when none is pinned.
- Errors suggest plausible alternatives when ambiguous.
- Each stub declares its capabilities faithfully.
- Conformance suite verifies each stub exposes the contract surface; detect returns matched=false because no implementation.
- authoring-repo-format.md walks through adding a new format adapter in under 2 hours.
