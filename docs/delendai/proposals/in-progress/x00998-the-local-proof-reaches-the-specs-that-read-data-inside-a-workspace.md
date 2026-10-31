---
id: x00998
title: "The local proof reaches the specs that read data inside a workspace"
kind: fix
status: in-progress
type: proposal
track: ci
date: 2026-10-31
last-transition-id: 5fe38192-ad70-41a6-b9d4-90fd29bbb8e4
last-correlation-id: 5fe38192-ad70-41a6-b9d4-90fd29bbb8e4
last-transition-from: ready
last-transition-at: 2026-10-31T23:35:55.498Z
---

# x00998 — The local proof reaches the specs that read data inside a workspace

## goal

A change to a data file inside a workspace runs the specs that read it in the local proof, so the forge is not the first to find out.

## why

#1591 added two skills to `packages/core/skills/manifest.json` and went red on the forge: a spec counts the catalogue's artifacts. The proof had passed. No import reaches a JSON file, and the read recorder dropped every path inside a workspace, so the read map did not know that spec read it. It cost a forge cycle and a repair, as #1593 did for a file outside the workspaces before the proof read that map.

## non-goals

- Recording code inside a workspace: its imports already lead to it.
- Changing what the planner selects on the forge: it reads the same map for root files only.

## slices

- global_gate: type

### S1 — The read map holds a workspace's data files
- **Status**: pending
- **Files**: `tools/scripts/lib/record-reads-setup.ts`, `tools/scripts/ci/zone-reads.generated.json`
- **Gate**: type
- acceptance:
  - "The recorder keeps `.json`, `.md`, `.yml` and `.yaml` paths inside a workspace, the committed map is recorded with it, and it names the spec that reads `packages/core/skills/manifest.json`, so `bun run prove` runs that spec for a change to it."

## acceptance

- The recorder keeps `.json`, `.md`, `.yml` and `.yaml` paths inside a workspace, the committed map is recorded with it, and it names the spec that reads `packages/core/skills/manifest.json`, so `bun run prove` runs that spec for a change to it.
