---
id: x00629
title: "A check observes, and never repairs what it checks"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-24
---

# x00629 — A check observes, and never repairs what it checks

## goal

`catalog:check`, `gen:all --check` and every other `check`, `lint`,
`doctor` or `validate` command read the state they judge and never
change it. Repair belongs to commands that say so (`sync`, `generate`,
`--apply`, `--fix`).

## why

Reported by an external review of x00625, and correct. x00625 made the
catalog generator bring the proposal registry up to date before reading
it, which removed three disagreeing paths. It did so by calling
`syncProposalRegistry`, which is not a reader. It can archive completed
root proposals, move files whose folder disagrees with their status,
resolve `blocked` to `ready`, rewrite the index and reconcile SQLite. The
generator is also what `catalog:check` and `gen:all --check` run. So
checking whether the catalog is stale can move proposals and rewrite
state, in CI and in a pre-push hook. A check that repairs its subject
cannot fail in the way it exists to fail.

## why this design

- **Split the registry sync into a read and a reconcile.** A pure
  `scanProposalRegistry(root)` builds the registry snapshot from the
  markdown and writes nothing. `syncProposalRegistry` is that scan
  followed by reconciliation and writes.
- **The generator reads the snapshot.** In generate mode it may write its
  artifact; in check mode it writes nothing at all, compares, and fails
  if stale. Neither mode reconciles proposals.
- This keeps x00625's property: every path derives the catalog from the
  proposals that exist, because the scan reads the markdown, not the
  cached index.

## non-goals

- Changing what `sync:proposals` does.

## Slices

- global_gate: none

### S1 — A read-only registry scan, and the generator uses it

- **Status**: done (#372)
- **Gate**: `npx vitest run tools/scripts/catalog/generate-agent-catalog.spec.ts`
- **Files**: `plugins/proposals/src/lib/contracts/interfaces/registry-snapshot.interface.ts`,
  `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`,
  `plugins/proposals/tests/src/lib/proposals/scan-proposal-registry.spec.ts`,
  `tools/scripts/catalog/generate-agent-catalog.script.ts`,
  `tools/scripts/catalog/generate-agent-catalog.spec.ts`
- A spec pins that `--check` over a repository with a misfiled proposal
  leaves every file where it was, and still reports the catalog as stale
  when it is.

## acceptance

- Running `catalog:check` or `gen:all --check` changes no file and no
  ref.
- The catalog is still derived from the proposals on disk on every path.
