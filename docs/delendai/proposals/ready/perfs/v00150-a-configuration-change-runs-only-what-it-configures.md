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

The most common configuration change, adding or editing a script in the root `package.json`, runs the specs that read that file, not every zone. The configuration that really acts on every spec keeps running everything.

## why

Since v00146 a change to prose at the root reaches only the specs that read it. Configuration still ran all 16 shards. Eight of the last 40 merged pull requests touched a configuration file, and three of those touched only the root `package.json`, which most often gains or changes a lint script. Such a script changes no code any spec loads.

## non-goals

Each of these was measured on 2026-10-31 and left out. Narrowing them costs more than it saves, or risks skipping a spec that needed to run.

- **`bun.lock`.** One of the 40 pull requests touched it. 702 of the 814 external packages are reachable from the root manifest, so a moved package would still run everything in most cases. `vitest --changed` also follows imports and does not see a lockfile, so a zone reached this way would need to run unfiltered anyway.
- **`delendai.config.json`, through a read map that sees spawned processes.** One of the 40 pull requests touched it. It would put a preload into every process a spec spawns, and any read the map missed would skip a spec that needed to run. The forge's full run would catch that only after the merge.
- **`tsconfig*.json` and the vitest configs.** They act on every spec.

A mixed pull request is not narrowed further: when other code changed too, `vitest --changed` keeps its default of rerunning a project whose `package.json` changed.

## slices

- global_gate: type

### S1 — A package.json change reaches what its changed fields reach
- **Status**: pending
- **Files**: `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/zone-reads.spec.ts`, `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.interface.ts`
- **Gate**: type
- acceptance:
  - "A root `package.json` change whose only changed fields are scripts no test run or install uses reaches only the specs that read the file. A change to a test script, an install hook or any other field, or a side that does not parse, still runs every zone (zone-reads.spec.ts)."

## acceptance

- A root `package.json` change whose only changed fields are scripts no test run or install uses reaches only the specs that read the file. A change to a test script, an install hook or any other field, or a side that does not parse, still runs every zone (zone-reads.spec.ts).
