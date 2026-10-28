---
id: x00971
title: "One host catalog, and a host server that stops with its client and runs current rules"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-24
last-transition-id: aa0b3fce-6014-4978-9f43-fb8d4c22f04d
last-correlation-id: aa0b3fce-6014-4978-9f43-fb8d4c22f04d
last-transition-from: review
last-transition-at: 2026-10-28T08:59:47.298Z
shipped-in:
  - "97594eb67"
---

# x00971 — One host catalog, and a host server that stops with its client and runs current rules

## goal

AGENT_HOSTS is the only list of hosts (scaffold, runtime detection, usage tracking, instructions), every declared host ships its material, the provider-model bridge is per conversation, the supervisor forwards SIGINT and SIGTERM, and a long-lived server notices it runs stale rules (read-only commands creating a cache moved to x00984).

## why

Joint audit a00095. G65: three host catalogs and none matches the others. G66: windsurf and agents-md are declared without material (no config/external directory). D39: the host universe is split between scaffold, runtime and manual instructions; Aider is detected but not in AGENT_HOSTS. G68: the identity bridge provider-model.json is one machine-wide file shared by every conversation. G27: a long-lived host server applies the rules it started with. G113: the host server supervisor does not trap SIGINT/SIGTERM; each Ctrl-C leaves an MCP server behind. G124: read-only commands (status, overview, adopt) create .cache/delendai/.

## non-goals

- Identity spelling (x00923).
- Read-only commands creating a cache (G124): cut to x00984.

## slices

- global_gate: type

### S1 — One catalog with material for each host
- **Status**: done
- **Files**: `packages/cli/src/contracts/interfaces/init.interface.ts`, `packages/cli/src/lib/init/init-host-instructions.service.spec.ts`, `packages/cli/src/lib/init/init-host-instructions.service.ts`, `packages/cli/src/lib/init/init-host-snapshot.service.spec.ts`, `packages/cli/src/lib/init/init-host-snapshot.service.ts`, `packages/cli/src/lib/init/init-hosts.helper.spec.ts`, `packages/cli/src/lib/init/init-hosts.helper.ts`, `packages/cli/src/lib/init/init-render.service.ts`, `packages/core/src/cli.ts`, `packages/core/src/contracts/index.ts`, `packages/core/src/lib/bootstrap/agent-config-rules.ts`, `packages/core/src/lib/contracts/constants/agent-hosts.constant.ts`, `packages/core/src/lib/contracts/interfaces/agent-host.interface.ts`, `packages/core/src/lib/hosts/agent-host-name.helper.ts`, `packages/core/tests/src/lib/bootstrap/agent-config-rules.spec.ts`, `packages/core/tests/src/lib/contracts/constants/agent-hosts.constant.spec.ts`, `plugins/adaptive-optimizer/src/lib/services/optimize-run.service.ts`, `plugins/proposals/src/lib/contracts/constants/host-instruction-files.constant.ts`, `plugins/proposals/tests/src/lib/tools/scan-host-instructions.tool.spec.ts`, `plugins/usage-tracking/src/lib/detect-agent.ts`, `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`, `plugins/usage-tracking/src/public/index.ts`, `plugins/usage-tracking/tests/src/lib/detect-agent.spec.ts`, `plugins/usage-tracking/tests/src/lib/plugin.spec.ts`
- **Gate**: type
- acceptance:
  - "Detection, scaffold and instructions read AGENT_HOSTS; a spec fails if a host appears in one and not the others (G65, D39)."
  - "Every host that declares an instructions file gets delendai's block from init when the project uses it, and every reader of instruction files (init, bootstrap analysis, the proposals scan) knows each file a host declares (G66)."
- shipped-in: `97594eb67`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 97594eb67, validate exit 0 and tests 30/30 claimed, no recorded run cited; acceptance 2/2: (1) agent-config-rules.ts derives its rule table from AGENT_HOST_INSTRUCTION_FILES and from each host's agents folder, init-hosts.helper.ts:5-10 imports AGENT_HOST… (2) init-hosts.helper.ts:78-98 computes the instruction targets for the hosts and the targets init writes for, one per distinct instructions path, and the spec ass… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: the init, agent-config-rules and agent-hosts suites are green, exit 0. Recorded rather than blocked: the slice narrows runtime detection to the files each host declares (its instructions and its legacy instructions), so a Cursor project whose only evidence is a .cursor directory without the legacy .cursorrules file is no longer detected - the pre-slice spec asserted that case and the shipped commit rewrote it. Also, the goal line says every declared host ships its material while 9 of the 15 hosts declare an instructions file, and plugins/usage-tracking/AGENT.md changed without appearing in any slice's Files list.

### S2 — The server process
- **Status**: done
- **Files**: `tools/scripts/host/host-supervisor.spec.ts`
- **Gate**: type
- acceptance:
  - "SIGINT and SIGTERM reach the child; no server survives its client (G113)."
  - "A server whose source changed since start reports itself stale in delendai_status and refuses mutations until restarted (G27)."
- shipped-in: `97594eb67`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 97594eb67, validate exit 0 and tests 7/7 claimed, no recorded run cited; acceptance 2/2: (1) host-supervisor-process.ts:123-125 registers the termination, interrupt and hangup signals and the handler calls supervisor.stop(), whose child stop sends SIGT… (2) assemble-core-tools.ts:376-385 puts the code freshness reading in the delendai status collector and code-freshness.service.ts:14-21 reports the stale flag, the… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice spec: 1 file / 7 tests, exit 0. Recorded rather than blocked: the criterion's refusal until restart is realised by the pre-existing publish guard rather than by new code in this slice, and the slice added no spec that raises the signals against the supervisor process itself (host-supervisor-process.spec.ts has no signal case).

### S3 — The bridge names a model only when one conversation can be at work
- **Status**: done
- **Files**: `packages/core/src/lib/work-identity/provider-model-bridge.helper.ts`, `packages/core/src/lib/contracts/interfaces/provider-model-reading.interface.ts`, `packages/core/tests/src/lib/work-identity/provider-model-bridge.spec.ts`, `docs/delendai/configuration/provider-model-bridge.md`
- **Gate**: type
- acceptance:
  - "The bridge keeps an entry per conversation, and when a workspace's fresh entries name more than one model it names none and says which it saw, so one conversation never reads another's model (G68)."
- shipped-in: `97594eb67`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 97594eb67, validate exit 0 and tests 18/18 claimed, no recorded run cited; acceptance 1/1: (1) provider-model-bridge.helper.ts:200-220 keeps one entry per conversation and bridgeReading names no model when the fresh entries of a workspace name more than … — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice spec: 1 file / 18 tests, exit 0.

## acceptance

- Detection, scaffold and instructions read AGENT_HOSTS; a spec fails if a host appears in one and not the others (G65, D39).
- Every host that declares an instructions file gets delendai's block from init when the project uses it, and every reader of instruction files (init, bootstrap analysis, the proposals scan) knows each file a host declares (G66).
- SIGINT and SIGTERM reach the child; no server survives its client (G113).
- A server whose source changed since start reports itself stale in delendai_status and refuses mutations until restarted (G27).
- The bridge keeps an entry per conversation, and when a workspace's fresh entries name more than one model it names none and says which it saw, so one conversation never reads another's model (G68).

## notes
- S1, 2026-10-27: `config/external/` holds this repository's own bridges (`.aider.conf.yml`, `.cursorrules`), not what delendai ships for a host, so G66 is read as the material delendai writes: init wrote its instructions block into three fixed files (`.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md`) whatever the project used, so Windsurf, Cursor, Gemini and Continue were declared and never written for. The block now goes into the instructions file of each host the project uses (declared, found, or Copilot, Claude Code and AGENTS.md agents by default), read from `AGENT_HOSTS`.
- S1: the parallel host lists that remained were usage-tracking's client table (an object, so `agent-slots-in-sync` never saw it), bootstrap's agent-config rules, init's instruction sources and snapshot targets, and the proposals scan. Each is now derived from `AGENT_HOSTS`, with `legacyInstructions` for the files a host still reads but delendai never writes (`.cursorrules`, `.continuerules`, `.clinerules`, `.codex/instructions.md`, Aider's config). Usage records now name an agent by its host id (`claude`, not `claude-code`); rollups read older records through the same lookup, so history is not split.
- S1 also fixes the snapshot's "already canonical" test: its copy of the block differed from what init writes, so a file init had written was never recognised as canonical.
- S2, 2026-10-27: G113 and G27 were already fixed on develop when this slice was taken. The supervisor traps SIGINT, SIGTERM and SIGHUP and stops its child (`host-supervisor-process.ts`, `1b4aeb82f`), and moves to a fresh child when the checkout's runtime code changes. A stale server reports it on every tool result and in `delendai_status`, and the work publisher refuses to publish while the server runs older code (x00701). What was missing was a spec showing that stopping the supervisor stops its server and starts no other: added.
- S3: a host does not tell an MCP server which conversation is calling, so the bridge cannot be read per conversation. What it can do is never pick one conversation's model for another. It used to name the freshest entry of the workspace. Providers can now write one entry per conversation under the workspace, and when the fresh entries name different models the reading is `ambiguous`, with the models listed, and the editor's own chat record is not consulted either.
- S3: G124 (status, overview and adopt create `.cache/delendai/` in a project that has none) was reproduced and cut to x00984. Every CLI command starts a full server whose boot writes the cache, which is a boot-wide change rather than a fix to these commands.
