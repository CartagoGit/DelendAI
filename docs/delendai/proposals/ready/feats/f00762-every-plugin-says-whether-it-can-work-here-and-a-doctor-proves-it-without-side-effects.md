---
id: f00762
title: "every plugin says whether it can work here, and a doctor proves it without side effects"
kind: feat
status: ready
type: proposal
track: general
date: 2026-10-14
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

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/plugin-availability.interface.ts`
  - `packages/core/src/lib/plugins/plugin-contract.ts`
- **Gate**: type
- acceptance:
  - A plugin may return `availability()` with one state from a fixed set (`library`, `needs-configuration`, `needs-installation`, `needs-host-adapter`, `registered`, `verified`, `degraded`), what is missing, and the command or option that fixes it. A plugin that returns nothing is `registered`.

### S2 — The plugins that are not plainly usable say why

- **Status**: pending
- **Files**:
  - `plugins/roadmap/src/index.ts`
  - `plugins/style-convention/src/index.ts`
  - `plugins/browser/src/index.ts`
  - `plugins/agent-orchestrator/src/index.ts`
  - `plugins/audit-orchestrator/src/index.ts`
  - `plugins/execution-env/src/index.ts`
  - `plugins/remote-provider-core/src/index.ts`
- **Gate**: type
- acceptance:
  - Each of these reports its real state and what is missing in this project, read from its own options and the host's capabilities.

### S3 — A plugin doctor proves availability without side effects

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/plugins/plugin-doctor.service.ts`
  - `packages/cli/src/commands/plugins-doctor.command.ts`
- **Gate**: type
- acceptance:
  - `delendai plugins doctor` lists every configured plugin with its state, the missing piece and the fix; a plugin that declares a probe has it run (read-only by contract), and a passing probe makes it `verified` with the time it last passed.
  - The overview and the configuration center show the same states, from the same source.

## acceptance

- No plugin is shown as usable when its tools cannot work in this project, and the user is told what to do about it.
