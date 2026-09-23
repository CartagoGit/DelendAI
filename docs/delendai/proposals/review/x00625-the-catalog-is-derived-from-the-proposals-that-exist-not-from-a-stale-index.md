---
id: x00625
title: "The catalog is derived from the proposals that exist, not from a stale index"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
---

# x00625 — The catalog is derived from the proposals that exist, not from a stale index

## goal

However the agent catalog is produced (`gen:all`, `catalog:generate`, the
post-merge hydration, or `catalog:check` in CI), it is derived from the
proposal markdown as it stands, so every path produces the same file.

## why

Measured on 2026-09-23. After the integration branch took #364, which
moved four proposals, #362's branch was merged forward and regenerated
with `gen:all`. It passed locally and failed `drift` and `catalog:check`
in CI on the same file, `agent-catalog.generated.json`. It has done the
same to other open pull requests all week; the fix each time was
`sync:proposals` by hand, then regenerate.

There were three ways to produce the file, and they disagreed on one
step:

| Path | Synced the registry first? |
| --- | --- |
| `gen:all` (step `agent-catalog`) | only when the index file was absent |
| `catalog:generate` (hydration) | yes, via a `sync:proposals &&` prefix |
| `catalog:check` (CI) | yes, via the same prefix |

The generator reads the gitignored registry index and synced it only if
the file did not exist, which is the fresh-checkout case. An index that
existed but was stale, as it is right after a merge that moves
proposals, was read as it stood. The two package scripts compensated by
syncing before calling the generator; `gen:all` did not. The dependency
of the catalog on a current registry was declared in two script prefixes
and missing from the third caller.

## why this design

The generator owns the dependency: it syncs the registry every time,
before reading it. The two prefixes are then redundant and are removed,
so the dependency is stated once, in the code that has it. Sync goes
through the generator's existing I/O seam (`IGeneratorIo.syncRegistry`),
so the spec fixtures that feed the registry as their input say so
explicitly instead of the generator guessing from whether a file exists.

## non-goals

- Changing what the catalog contains.

## Slices

- global_gate: none

### S1 — The generator brings the registry level before reading it

- **Status**: done — the new spec case fails with the old
  sync-only-when-absent rule and passes with this change.
- **Gate**: `npx vitest run tools/scripts/catalog/generate-agent-catalog.spec.ts`
- **Files**: `tools/scripts/catalog/generate-agent-catalog.script.ts`,
  `tools/scripts/catalog/generate-agent-catalog.spec.ts`,
  `package.json`
- `buildAgentCatalogArtifact` syncs through `io.syncRegistry` (defaults to
  the real sync) on every run. `catalog:check` and `catalog:generate`
  drop their `sync:proposals &&` prefix.

## acceptance

- A branch regenerated with `gen:all` after a merge that moves proposals
  passes `catalog:check`.
- The spec pins that a stale index with different markdown behind it
  yields the markdown's proposals.
