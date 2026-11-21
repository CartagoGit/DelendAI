---
id: f00105
kind: feat
status: done
type: proposal
track: config+install+dogfood+workflow
date: 2026-07-08
title: "Self-host config coherence — dogfood the external flow, one plugin set per host"
shipped-in: []
recan: []
related:
    - f00104 # external consumption — the self-host configs must match what init writes for others
    - f00095 # self-adoption plan — this repo running its own generator is the dogfood surface
ownership:
    - { agent: implementation_runner, task: 'S1: unify the two self-host launch configs (preset + args drift)' }
    - { agent: implementation_runner, task: 'S2: dogfood gate — self-host configs must equal `mcpv init` output' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
---

# f00105 — Self-host config coherence (the mcp that uses itself)

## goal

The repo runs mcp-vertex on itself — the "mcp that uses itself." That
self-host setup should be (a) internally consistent (the same plugin set no
matter which IDE opens the repo) and (b) the living reference for what
`mcpv init` produces for an external project (dogfooding). Today it is
neither.

## why

Evidence (2026-07-08):

1. **The two self-host launch configs disagree on the plugin set.**
   `.mcp.json` (Claude Code / generic host) launches with `--preset=swarm`.
   `.vscode/mcp.json` (VS Code host) passes **no `--preset`**, so it falls
   back to the default preset `vertex` (`preset-catalog.ts:41,172`). Opening
   the SAME repository in two hosts loads two different plugin overlays on
   top of the 13 plugins pinned in `mcp-vertex.config.json` (git, search,
   memory, docs, rules, quality, deps, proposals, notification, logs,
   status-marker, test-convention, conventions). A contributor's tool
   surface — and which lint/quality gates the agent even sees — depends on
   their editor. That is a silent, confusing inconsistency in the project's
   own dogfood.
2. **The self-host configs are hand-written and drift from the installer.**
   They point at `tools/scripts/host/host-server.script.ts` directly (the
   dev entry). `mcpv init` writes something different for external projects
   (see f00104). Because the two are maintained by hand, nothing keeps the
   repo's own config aligned with the flow it ships to users — so a break in
   the external flow (like the one f00104 documents) is invisible from
   inside the repo.
3. **Self-host references plugins that never publish.** Of the 13 pinned
   plugins, `logs`, `status-marker`, `test-convention`, `conventions` are
   NOT in `PUBLISH_ORDER` (`release-plan.ts:14`). Self-host works because
   they resolve locally, but it means the dogfood config exercises a plugin
   set an external user could never assemble — the opposite of dogfooding.
   (The publish gap itself is f00104 S2; here it is evidence the self-host
   config is not a faithful reference.)

## non-goals

- **No change to which plugins the repo actually wants** — S1 picks ONE
  coherent set and applies it to both configs; it does not add/remove
  capability, only removes the by-host divergence.
- **No new host-launch mechanism** (f00104 owns the canonical command).

## Slices

- global_gate: validate

### S1 — Unify the two self-host launch configs

- **Status**: done
- **Files**: `.mcp.json`, `.vscode/mcp.json`
- **Gate**: bun run test
- **Acceptance**:
  - "Both configs launch with the SAME resolved plugin set (same `--preset` and/or explicit `--plugins`), so the repo presents one tool surface regardless of host. The chosen preset is documented inline with a one-line rationale."
  - "If the pinned `plugins` block in `mcp-vertex.config.json` is the intended source of truth, drop the divergent `--preset` from `.mcp.json` (or add the matching one to `.vscode/mcp.json`) — decide and make them equal."
- **Decision**: The checked-in `mcp-vertex.config.json#plugins` block is the one plugin-set source of truth. Both clients therefore use the canonical published CLI launch without a preset overlay; their only intentional difference is the host-specific workspace placeholder and VS Code's unrelated filesystem server sibling.
- **Evidence**: The preceding external-launch work migrated both files to `bunx --package @mcp-vertex/cli mcpv __serve --workspace …` and removed the old asymmetric preset/script arguments. The core repo-config regression now pins the exact canonical argv for both host shapes.

### S2 — Dogfood gate: self-host configs must equal `mcpv init` output

- **Status**: done
- **Files**: `tools/scripts/lint/self-host-dogfood.script.ts`, `tools/scripts/lint/self-host-dogfood.script.spec.ts`, `package.json`
- **Depends on**: S1, f00104 S1
- **Gate**: bun run validate
- **Acceptance**:
  - "A lint asserts the repo's own `.vscode/mcp.json` + `.mcp.json` launch entry equals what `buildCanonicalLaunch` / `mcpv init` would generate for this workspace (allowing the documented dev-mode host-server override). So the repo cannot ship an external flow it does not itself run — a break in the installer fails the repo's own gate."
  - "Wired into `bun run validate`. Passes once S1 + f00104 S1 land."
- **Evidence**: `lint:self-host-dogfood` reads both checked-in clients, derives each host's expected argv through `buildCanonicalLaunch`, and rejects missing/invalid JSON, non-stdio entries, command drift or argument drift while preserving unrelated sibling servers. Three focused regressions cover parity, independent command/argv failures and malformed/missing configs; the gate is wired immediately after setup drift checks in `validate`.

## acceptance

- `bun run validate` → exit 0.
- One plugin set for the repo regardless of host.
- A gate proves the self-host config tracks the shipped `mcpv init` output
  (dogfood), so the external flow is verified from inside every CI run.
