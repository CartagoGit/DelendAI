---
id: v00150
title: "A configuration change runs only what it configures"
kind: perf
status: done
type: proposal
track: ci
date: 2026-10-29
last-transition-id: b9cbe144-085d-4c09-a49d-227d9ae0462d
last-correlation-id: b9cbe144-085d-4c09-a49d-227d9ae0462d
last-transition-from: review
last-transition-at: 2026-11-03T00:54:38.825Z
shipped-in:
  - "39995a022c492cfb6c87f2e644ceae9c3a049e87"
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
- **Status**: done
- **Files**: `tools/scripts/ci/zone-reads.ts`, `tools/scripts/ci/zone-reads.spec.ts`, `tools/scripts/ci/test-zones.script.ts`, `tools/scripts/ci/test-zones.interface.ts`
- **Gate**: type
- acceptance:
  - "A root `package.json` change whose only changed fields are scripts no test run or install uses reaches only the specs that read the file. A change to a test script, an install hook or any other field, or a side that does not parse, still runs every zone (zone-reads.spec.ts)."
- shipped-in: `8866a9564388`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 39995a022c49, validate exit 0 and tests 22/22 claimed, no recorded run cited; acceptance 1/1: (1) At 39995a02 the root manifest is excused from running every zone only when the two sides differ in nothing but scripts that no test run or install uses, while … — Approved on the delivered state of 39995a022c492cfb6c87f2e644ceae9c3a049e87. A configuration change runs only what it configures. The type gate exited 0 and the slice spec passes 22 of 22. Two residuals, recorded and not blocking: no spec drives the planner with a manifest change, so the wiring is unpinned; and the reader that decides this matches any script whose name begins with pre or post, so a formatting script is treated as a runner, which is the conservative side.

## acceptance

- A root `package.json` change whose only changed fields are scripts no test run or install uses reaches only the specs that read the file. A change to a test script, an install hook or any other field, or a side that does not parse, still runs every zone (zone-reads.spec.ts).
