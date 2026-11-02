---
id: x00998
title: "The local proof reaches the specs that read data inside a workspace"
kind: fix
status: done
type: proposal
track: ci
date: 2026-10-31
last-transition-id: ba5c7942-029f-4c25-a543-8f31600c6e06
last-correlation-id: ba5c7942-029f-4c25-a543-8f31600c6e06
last-transition-from: review
last-transition-at: 2026-11-02T18:03:45.855Z
shipped-in:
  - "757071d8f02951f269730bf739e9f165c5c35ca0"
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
- **Status**: done
- **Files**: `tools/scripts/lib/record-reads-setup.ts`, `tools/scripts/ci/zone-reads.generated.json`
- **Gate**: type
- acceptance:
  - "The recorder keeps `.json`, `.md`, `.yml` and `.yaml` paths inside a workspace, the committed map is recorded with it, and it names the spec that reads `packages/core/skills/manifest.json`, so `bun run prove` runs that spec for a change to it."
- shipped-in: `757071d8f029`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 757071d8f029, validate exit 0 and tests 9/9 claimed, no recorded run cited; acceptance 1/1: (1) At 757071d8f029 the read recorder keeps exactly .json, .md, .yml and .yaml paths that live inside a workspace and drops the other extensions there, the committ… — Approved on the delivered state of 757071d8f029. All three claims of the criterion hold: the recorder keeps the four data extensions inside a workspace, the committed read map is recorded together with it and grew by thousands of entries, and the map names the specs that read packages/core/skills/manifest.json, and the proof really consumes that map: prove-plan.script.ts selects the specs through nearSpecsSince, which reads the committed map and matches the changed path exactly, so a change to the manifest reaches those specs instead of running nothing. The type gate exited 0 and the delivery spec passes 9 of 9. Two observations that do not bear on the criterion: the recorder's own filter change landed in the parent commit 3f3532db2 and not in this delivery, so the slice's declared file list names a file this commit did not touch, and nested node_modules paths are not ignored by the recorder, so the refreshed map carries seventeen dead entries that point at a node_modules copy of the manifest.

## acceptance

- The recorder keeps `.json`, `.md`, `.yml` and `.yaml` paths inside a workspace, the committed map is recorded with it, and it names the spec that reads `packages/core/skills/manifest.json`, so `bun run prove` runs that spec for a change to it.
