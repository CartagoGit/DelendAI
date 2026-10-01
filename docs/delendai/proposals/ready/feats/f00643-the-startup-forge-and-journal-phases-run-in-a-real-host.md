---
id: f00643
title: "The startup forge and journal phases run in a real host"
kind: feat
status: ready
type: proposal
track: trust
date: 2026-09-26
---

# f00643 — The startup forge and journal phases run in a real host

## Goal

A host boot runs the startup reconciler's forge phase against the real forge, and its journal phase against a real journal source, instead of reporting both NOT EXECUTED on every boot.

## why

Every MCP boot logs `phases NOT EXECUTED: forge, journal` (seen again on 2026-09-26). The report is honest: `runStartupGate` has no input for either collaborator, and the only implementations of `IStartupForgeSeam` and `IStartupJournalSource` are test fakes. The phases themselves (`reconcile-forge.ts`, `import-journal.ts`) are built and specified: the first mirrors pull requests and check runs with conditional reads (ETag), and the second replays coordination events that git and the forge cannot re-derive. So a fresh machine rebuilds its state database without the forge's view of merges and checks, and without the meaning of past recoveries and hand-overs. No proposal tracked the gap.

## non-goals

- Any write to the forge: the phase is read-only by design.
- Choosing where the journal ships without the maintainer: it is the one input a rebuild cannot re-derive, so its home (a ref, a release asset, a bucket) is a policy decision.

## Slices

- global_gate: none

### S1 — A read-only forge seam is bound in the host
- **Status**: pending
- **Files**: `packages/core/src/lib/startup-gate/run-startup-gate.ts`, `packages/core/src/lib/startup-gate/run-startup-gate.interface.ts`, `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "`runStartupGate` accepts a forge seam and passes it to the reconciler; the forge phase is no longer listed NOT EXECUTED when one is bound."
  - "The host binds a seam that lists pull requests and check runs through the forge's API with the previous ETag, and answers `unavailable` (never throws) without credentials or network."
  - "A warm boot with nothing changed costs one conditional request and writes no rows."

### S2 — A journal source is bound once its home is decided
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/startup-reconciler/seams.interface.ts`
- **Gate**: type
- acceptance:
  - "The maintainer's decision on where the coordination journal ships is recorded in this proposal."
  - "The host binds an `IStartupJournalSource` reading from there, and replaying the same events twice imports them once."

## acceptance

- `runStartupGate` accepts a forge seam and passes it to the reconciler; the forge phase is no longer listed NOT EXECUTED when one is bound.
- The host binds a seam that lists pull requests and check runs through the forge's API with the previous ETag, and answers `unavailable` (never throws) without credentials or network.
- A warm boot with nothing changed costs one conditional request and writes no rows.
- The maintainer's decision on where the coordination journal ships is recorded in this proposal.
- The host binds an `IStartupJournalSource` reading from there, and replaying the same events twice imports them once.
