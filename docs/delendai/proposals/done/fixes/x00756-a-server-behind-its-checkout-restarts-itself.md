---
id: x00756
title: "A server behind its checkout restarts itself"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-29
priority: P1
related: [x00701, x00709]
last-transition-id: 7857f596-e191-40b1-b2d6-f2405ec710f6
last-correlation-id: 7857f596-e191-40b1-b2d6-f2405ec710f6
last-transition-from: review
shipped-in:
  - "1b4aeb82fe6006dca42c79d2e7b772f02844f937"
---

# x00756 — A server behind its checkout restarts itself

## goal

A delendai server whose code the checkout has moved past moves onto the
current code by itself, without the host losing its connection and
without a person restarting it.

## why

On 2026-09-29, after every merge into `develop`, each running server
logged:

    {"event":"work-checkouts.published","moved":[{"ref":"*","outcome":"skipped",
     "reason":"This delendai server started at ec98c0d31; the checkout is at
     b89776120, and 18 source file(s) it runs have changed since. It still
     applies the rules it started with. It pushes no work ref until it is
     restarted."}]}

x00701 made the server say it was behind, and x00709 made it stop pushing
work refs on old rules. Both left the restart to a person, in every
session, on every machine, every time the integration branch moved. Until
then, fixes merged on `develop` did not apply to the agents using it.

A second defect: the watch compared the workspace's commits. When delendai
serves another project from a delendai checkout, the workspace is that
project, and its commits say nothing about the code the server runs.

## why this design

- **A supervisor in front of the server.** The process the host starts
  relays the host's messages (one JSON-RPC message per line on stdio) to
  a server child. It keeps the host's `initialize` and
  `notifications/initialized`.
- **Restart without a gap.** When the code the child runs is behind its
  checkout (checked once a minute, on the delendai checkout, with the
  x00701 watch), a new child boots while the old one keeps serving. The
  host's `initialize` is replayed to it, and its answer is not relayed.
  New host requests are held only while the old child finishes the
  requests it holds. Then traffic switches, the old child stops, and the
  host gets `tools`, `prompts` and `resources` `list_changed` for each
  list the server declares as changing.
- **Failure keeps what works.** A new child that does not answer
  `initialize` in time is stopped, and the current one keeps serving. A
  child that dies is replaced the same way, and the requests it held are
  answered with an error instead of hanging.
- **Any host.** Nothing depends on the host: it sees one server process
  and one connection. `DELENDAI_SUPERVISE=0` serves without a supervisor,
  and `kill -USR2 <pid>` (POSIX) restarts on demand.
- The server's advisory tells a supervised agent there is nothing to do.

## non-goals

- Keeping per-session server state (warm plugins, resource subscriptions)
  across a restart. A restart starts them fresh, as a manual one did.

## architecture

- `tools/scripts/host/host-supervisor.ts` (relay and switch, pure over its
  children), `host-supervisor-process.ts` (real processes, stdio, the
  minute check), `host-server.script.ts` (supervises unless it is the
  child), `packages/core/src/lib/development-policy/stale-runtime-advisory.ts`.

## Slices

- global_gate: none

### S1 — The server moves onto the checkout's code by itself

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/host packages/core/tests/src/lib/development-policy/stale-runtime-advisory.spec.ts`
- **Files**:
  - `tools/scripts/host/host-supervisor.ts`
  - `tools/scripts/host/host-supervisor.interface.ts`
  - `tools/scripts/host/host-supervisor.spec.ts`
  - `tools/scripts/host/host-supervisor-process.ts`
  - `tools/scripts/host/host-supervisor-process.spec.ts`
  - `tools/scripts/host/host-server.script.ts`
  - `packages/core/src/lib/development-policy/stale-runtime-advisory.ts`
  - `packages/core/src/public/index.ts`
  - `packages/core/tests/src/lib/development-policy/stale-runtime-advisory.spec.ts`
- shipped-in: `1b4aeb82fe60`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: MiniMaxM3
- review-log: approved by MiniMaxM3 — x00756 S1 delivered at 1b4aeb82fe60: host-supervisor.ts (relay+switch), host-supervisor-process.ts (real processes, stdio, minute check), host-server.script.ts supervises unless it is the child, stale-runtime-advisory.ts tells the supervised agent there is nothing to do. 5 files / 39 tests green in tools/scripts/host + stale-runtime-advisory.spec.ts.
- review-attribution: claude-opus-5-5 from Merge pull request #649 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00756-S1-g1/a-server-behind-its-checkout-restarts-itself (refs/heads/delendai/wip/claude-opus-5-5/implement/x00756-S1-g1/a-server-behind-its-checkout-restarts-itself) (1b4aeb82fe6006dca42c79d2e7b772f02844f937), opened by MiniMaxM3

## dependency graph

None.

## acceptance

- Driven over real stdio: after `initialize` and `tools/list`, a restart
  (SIGUSR2) switches to a new server on the same connection; the host
  receives the three `list_changed` notifications, and `tools/list` answers
  as before. Measured on 2026-09-29: 7 tools before and after.
- A host request in flight is answered by the old server, and requests
  that arrive during the switch are served by the new one.
- A new server that does not start leaves the old one serving; a dead one
  is replaced, and its pending requests get an error.
