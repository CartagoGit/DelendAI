---
id: f00762
title: "every plugin says whether it can work here, and a doctor proves it without side effects"
kind: feat
status: review
type: proposal
track: general
date: 2026-10-14
last-transition-id: c567099b-4587-45e1-abfe-f8c4c93ffe7d
last-correlation-id: c567099b-4587-45e1-abfe-f8c4c93ffe7d
last-transition-from: in-progress
last-transition-at: 2026-10-14T08:49:47.848Z
shipped-in:
  - "2374bc17274e665ccaa33cb93fc35a466e5929bd"
---

# f00762 — every plugin says whether it can work here, and a doctor proves it without side effects

## goal

Each plugin reports one of a fixed set of availability states (library, needs configuration, needs an installation, needs a host adapter, registered but unverified, verified, degraded) with what is missing, and a plugin doctor runs a harmless probe per plugin, so a registered plugin is never mistaken for one that works.

## why

The owner, 2026-10-13: "there are many plugins that are there but do not work". The outside review the same day (x00894) found at least five different situations behind that, all shown the same way today, as a registered plugin with tools:

| What is true | Example | What the user needs to hear |
|---|---|---|
| A library with no tools of its own | `execution-env`, `remote-provider-core` | available to other plugins, not callable |
| Needs configuration | `roadmap` (no `file`), `style-convention` (no style roots) | which option is missing |
| Needs an installation | `browser` (a driver) | what to install |
| Needs a host adapter | `agent-orchestrator`, `audit-orchestrator` (a subagent port) | which adapter is missing, and that it only plans |
| Registered, never proven | any plugin without a real smoke | when it last worked, if ever |

The configuration center only knows `active` and `schemaStatus`. A manifest that validates, a build that passes and a tool that is registered are three different facts, and none of them is "it works here".

## non-goals

- Probes with side effects: no paid calls, no remote writes, no commits, no destructive writes.
- Changing what any plugin does when it works.

## slices

- global_gate: type

### S1 — One availability contract every plugin answers

- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/plugin-availability.interface.ts`
  - `packages/core/src/lib/contracts/constants/plugin-availability.constant.ts`
  - `packages/core/src/lib/plugins/plugin-contract.ts`
  - `packages/core/src/lib/plugins/plugin-availability.service.ts`
  - `packages/core/tests/src/lib/plugins/plugin-availability.service.spec.ts`
- **Gate**: type
- acceptance:
  - A plugin may declare `availability(ctx)`, read from the same context `register` gets and without side effects, returning one state from a fixed set (`library`, `needs-configuration`, `needs-installation`, `needs-host-adapter`, `registered`, `verified`, `degraded`), what is missing, and the option or command that fixes it.
  - `availabilityOf` is the one reading of it: a plugin that does not answer is `registered`, and one whose answer throws is `degraded`, with the reason.
- shipped-in: `c783f75cb2eb`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 2374bc17274e, validate exit 0, tests 19/19 — Delivery attribution: this slice's work landed across three pull requests of the same unit - #1080 for the contract and the plugins, #1083 for the overview, #1088 for the VS Code tree and the probe - and the merge 2374bc17274e665ccaa33cb93fc35a466e5929bd (PR #1088) is the newest candidate that changes this slice's declared files, so the guard names it and that is the commit approved here. I read the tree at that commit rather than a single branch diff, because the slice was split across those three. Gate type: `bun x vitest run --root packages/core` over plugin-availability.service.spec.ts, plugin-availability-record.service.spec.ts and activation-report.spec.ts -> 3 files / 19 tests, exit 0; and `bun run typecheck` exit 0 in the pack worktree. I delegated the first read of this slice and it attributed the slice to the probe commit, which is wrong: the contract itself landed earlier, in #1080. I re-ran the attribution myself over every candidate and read each criterion against the tree at the merge.

### S2 — The plugins that are not plainly usable say why

- **Status**: review
- **Files**:
  - `plugins/roadmap/src/index.ts`
  - `plugins/style-convention/src/index.ts`
  - `plugins/browser/src/index.ts`
  - `plugins/agent-orchestrator/src/index.ts`
  - `plugins/audit-orchestrator/src/index.ts`
  - `plugins/execution-env/src/index.ts`
  - `plugins/remote-provider-core/src/index.ts`
  - `plugins/roadmap/tests/src/availability.spec.ts`
  - `plugins/style-convention/tests/src/availability.spec.ts`
  - `plugins/browser/tests/src/availability.spec.ts`
  - `plugins/browser/vitest.config.ts`
  - `plugins/agent-orchestrator/tests/src/availability.spec.ts`
  - `plugins/audit-orchestrator/tests/src/availability.spec.ts`
  - `plugins/execution-env/tests/src/availability.spec.ts`
  - `plugins/remote-provider-core/tests/availability.spec.ts`
- **Gate**: type
- acceptance:
  - Each of these reports its real state and what is missing in this project, read from its own options and the host's ports: roadmap without `file` and style-convention without `styleRoots` need configuration; browser without a driver, and agent-orchestrator or audit-orchestrator without a subagent runtime or port factory, need a host adapter; execution-env and remote-provider-core are libraries.
  - audit-orchestrator dispatches through the host's subagent runtime when there is one, as agent-orchestrator does; it ignored the runtime, so it could only ever refuse.

- decision (2026-10-14): one record. Every registration reads the plugin's availability with its own context and keeps it with the time, one file per plugin in the workspace's records (`<cacheDir>/records/plugin-availability/`). `plugin doctor`, the overview and the configuration center read that record, so a lazy plugin nobody loaded this start shows its last known state and when it was read, instead of a second computation that could disagree.
- shipped-in: `c783f75cb2eb`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Every registration keeps what the plugin said, and a doctor lists it

- **Status**: review
- **Files**:
  - `packages/core/src/lib/plugins/plugin-availability-record.service.ts`
  - `packages/core/src/lib/contracts/interfaces/plugin-availability-record.interface.ts`
  - `packages/core/src/lib/plugins/load-plugins-runtime.helper.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/commands/groups/plugins.ts`
  - `packages/cli/src/contracts/constants/help-translation.constant.ts`
  - `packages/cli/src/commands/registry.spec.ts`
  - `packages/core/tests/src/lib/plugins/plugin-availability-record.service.spec.ts`
  - `packages/cli/src/commands/groups/plugins.spec.ts`
- **Gate**: type
- acceptance:
  - Every registration, eager or lazy, reads the plugin's availability with the context it registered with and keeps it, with the time, in one file per plugin in the workspace's records (`<cacheDir>/records/plugin-availability/`). Plugins register side by side, and one shared file would lose writers. A failure to keep it never fails the registration.
  - `delendai plugin doctor` lists every plugin that has registered in this workspace with its state, what is missing, the fix and when it was read, and says how to get an answer when none has.
- shipped-in: `c783f75cb2eb`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — The overview shows the same states, from the same record

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/activation-report.interface.ts`
  - `packages/core/src/lib/plugins/activation-report.ts`
  - `packages/core/src/lib/cli/assemble-plugins.ts`
  - `packages/core/tests/src/lib/plugins/activation-report.spec.ts`
  - `packages/core/tests/src/lib/cli/core-meta-tools.spec.ts`
- **Gate**: type
- acceptance:
  - Each entry of the activation report (the overview with `activation: true`, eager or lazy surface) carries the plugin's kept availability record when it has one: the same record `plugin doctor` lists.
- shipped-in: `c03b522535b9`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — The VS Code configuration center shows each plugin's state

- **Status**: review
- **Files**:
  - `packages/client/src/lib/contracts/interfaces/plugin-availability.interface.ts`
  - `packages/client/src/lib/services/overview.service.ts`
  - `packages/client/src/public/index.ts`
  - `packages/client/tests/services/overview.service.spec.ts`
  - `extensions/vscode/src/providers/tool-tree-node.ts`
  - `extensions/vscode/src/providers/tool-tree-data-provider.ts`
  - `extensions/vscode/src/test/tool-tree-data-provider.spec.ts`
- **Gate**: type
- acceptance:
  - `OverviewService.pluginAvailability()` reads each plugin's kept record from the overview's activation report.
  - The plugin tree shows a state that is not plainly usable next to the tool count (`3 tools · needs configuration`), with what is missing and the fix as its tooltip; a server that cannot answer leaves the tree as it was.
- shipped-in: `064976f5134c`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — A read-only probe proves a plugin

- **Status**: review
- **Files**:
  - `packages/core/src/lib/plugins/plugin-contract.ts`
  - `packages/core/src/lib/plugins/plugin-availability.service.ts`
  - `packages/core/src/lib/plugins/plugin-availability-record.service.ts`
  - `packages/core/tests/src/lib/plugins/plugin-availability.service.spec.ts`
  - `plugins/roadmap/src/index.ts`
  - `plugins/roadmap/tests/src/availability.spec.ts`
- **Gate**: type
- acceptance:
  - A plugin may declare `probe(ctx)`, read-only by contract. When it registers and says nothing worse than `registered`, the probe runs within 5 seconds: a pass records `verified` with the time, a throw or a timeout `degraded` with the reason, and a plugin that already says what it is missing is not probed.
  - roadmap proves a declared roadmap by reading it through the workspace's safe reader, so a configured file that is not there shows as degraded instead of registered.
- shipped-in: `c783f75cb2eb`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- No plugin is shown as usable when its tools cannot work in this project, and the user is told what to do about it.
