---
id: v00150
title: "A configuration change runs only what it configures"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# v00150 — A configuration change runs only what it configures

## goal

A change to a configuration file runs the specs that configuration can affect, not every zone.

## why

Since v00146 a change to prose at the root reaches only the specs that read it. Configuration still runs all 16 shards (about 33 runner-minutes and the slowest shard's wall time), because no read shows how it acts:

- `bun.lock` and the dependency fields of a `package.json` change which code every import loads.
- `tsconfig*.json` changes how every import resolves.
- the vitest configs change how every spec runs.
- `delendai.config.json` is read by the CLI and MCP server the specs spawn, and the read recorder sees only the vitest workers.

Eight of the last 40 merged pull requests touched one of these. Most `package.json` edits change only `scripts`, and most lockfile edits move a few packages that few workspaces depend on.

## non-goals

- Narrowing `tsconfig*.json` or the vitest configs: they act on every spec, and they keep running everything.

## slices

- global_gate: type

### S1 — A package.json change reaches what its changed fields reach
- **Status**: pending
- **Files**: `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/zone-reads.spec.ts`, `tools/scripts/ci/test-zones.script.ts`
- **Gate**: type
- acceptance:
  - "A root `package.json` change whose only changed fields are `scripts` reaches only the specs that read the file; a workspace's `package.json` reaches its workspace and what depends on it; a dependency change at the root still runs everything (zone-reads.spec.ts)."

### S2 — A lockfile change reaches the workspaces of the packages it moved
- **Status**: pending
- **Files**: `tools/scripts/ci/lockfile-diff.ts`, `tools/scripts/ci/lockfile-diff.spec.ts`, `tools/scripts/ci/test-zones.script.ts`
- **Gate**: type
- acceptance:
  - "`lockfile-diff.ts` names the packages whose resolved version changed between two `bun.lock` texts; the planner runs the zones of the workspaces depending on them, directly or through another workspace, and everything when the lockfile does not parse (lockfile-diff.spec.ts)."

### S3 — The read map sees what spawned processes read
- **Status**: pending
- **Files**: `tools/scripts/lib/record-reads-setup.ts`, `tools/scripts/lib/record-reads-preload.ts`, `tools/scripts/ci/zone-reads.script.ts`, `tools/scripts/ci/zone-reads.ts`
- **Gate**: type
- acceptance:
  - "With `DELENDAI_RECORD_READS` set, a Bun or Node process a spec spawns inherits a preload that records its reads under the spawning spec, so the regenerated map lists the specs whose spawned CLI reads `delendai.config.json`, and a change to it reaches only those (zone-reads.spec.ts)."

## acceptance

- A root `package.json` change whose only changed fields are `scripts` reaches only the specs that read the file; a workspace's `package.json` reaches its workspace and what depends on it; a dependency change at the root still runs everything (zone-reads.spec.ts).
- `lockfile-diff.ts` names the packages whose resolved version changed between two `bun.lock` texts; the planner runs the zones of the workspaces depending on them, directly or through another workspace, and everything when the lockfile does not parse (lockfile-diff.spec.ts).
- With `DELENDAI_RECORD_READS` set, a Bun or Node process a spec spawns inherits a preload that records its reads under the spawning spec, so the regenerated map lists the specs whose spawned CLI reads `delendai.config.json`, and a change to it reaches only those (zone-reads.spec.ts).
