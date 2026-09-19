---
id: x00552
title: "A human may close a repair task the reconciler cannot"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-19
tags:
    - startup
    - reconciler
    - degraded
    - recovery
---

# x00552 — A human may close a repair task the reconciler cannot

## goal

A blocker whose truth only a human holds can be answered, once, in a form
the reconciler honours on every boot and every clone. A workspace stops
being DEGRADED when the question has actually been answered — and only
then.

## why

Measured on 2026-09-19 in this repository. Every boot reports:

```
startup-reconciliation: DEGRADED (mode=incremental, blockers=1, repairTasks=1)
integration-evidence.ref-vanished: refs/wip/DESKTOP-9CTQRS7/x00545-S1-g1:
  The ref no longer exists and its checkpoint 9421185e... is NOT contained
  in the integration branch.
Mutations blocked: true
```

The reconciler is right to refuse: it cannot prove what happened to that
ref. But the work *was* deliberately discarded in an earlier session and
the conclusion was recorded in prose, in a proposal — a place no boot
reads. There is no way to tell the reconciler "this was investigated, the
loss is accepted, here is who decided it and why", so the blocker is
permanent, mutations stay blocked forever, and the honest DEGRADED signal
degrades into noise the operator learns to ignore. A gate that can never
turn green stops being a gate.

Two properties the answer needs and the current state cannot give:

- **It must not be a mute button.** A resolution has to be pinned to the
  exact evidence it answered. `ref-vanished` on the same ref with a
  *different* checkpoint is a different loss, and must block again.
- **It must travel with the repository.** The blocker is derived from git
  and reappears on every clone; the local SQLite journal does not leave
  this machine, so a decision recorded only there leaves every teammate
  DEGRADED for a question already settled.

## non-goals

- **No weakening of any gate.** A resolution never suppresses a finding
  class, never lowers a threshold and never turns a blocker off by code.
  It answers one task, once, against one piece of evidence.
- **No automatic resolution.** Nothing in the reconciler ever writes a
  resolution; the reconciler only reads them. Recording one is a
  deliberate human act with a reason attached.
- **No recovery of lost work.** Accepting a loss is a record of a
  decision, not a repair.

## slices

### S1 — A repair task carries the digest of the evidence it rests on

- **Status**: done — every repair task gains an `evidenceDigest`, derived from the finding's
  code, subject and message, and the boot report prints it. A resolution
  can then name exactly what it answered, and evidence that changes
  invalidates the answer automatically.
- **Files**: `packages/core/src/lib/startup-reconciler/finding-catalog.ts`,
  `packages/core/src/lib/startup-reconciler/contracts.interface.ts`,
  `packages/core/src/lib/startup-gate/render-gate.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler/repair-resolutions.spec.ts`

### S2 — The reconciler honours a recorded resolution

- **Status**: done — a tracked workspace file records resolutions. A blocker whose task id
  *and* evidence digest match a recorded resolution is reported as
  `repair.resolved-by-human` — an acknowledged finding carrying who
  decided, when and why — instead of a blocker. A resolution whose digest
  no longer matches is reported as stale and blocks as before.
- **Files**: `packages/core/src/lib/startup-reconciler/repair-resolutions.ts`,
  `packages/core/src/lib/startup-reconciler/repair-resolutions.interface.ts`,
  `packages/core/src/lib/startup-reconciler/repair-resolutions.constant.ts`,
  `packages/core/src/lib/startup-reconciler/build-report.ts`,
  `packages/core/src/lib/startup-reconciler/reconcile-startup.ts`,
  `packages/core/src/lib/startup-gate/repair-resolutions-seam.ts`,
  `packages/core/src/lib/startup-gate/run-startup-gate.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-gate/repair-resolutions-seam.spec.ts`

### S3 — Recording a decision needs no host

- **Status**: done — `delendai repair` lists and records resolutions over that file, so the
  decision can be taken from a console, from Claude, Codex or Copilot,
  with no MCP server and no database. The DEGRADED report prints the
  exact command.
- **Files**: `packages/cli/src/commands/repair.command.ts`,
  `packages/cli/src/commands/groups/core.ts`,
  `packages/cli/src/contracts/constants/help-translation.constant.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/repair.command.spec.ts`

## acceptance

- A blocker with no recorded decision keeps the workspace DEGRADED and
  keeps mutations blocked, exactly as before.
- A decision recorded with `delendai repair resolve` against the task id
  and evidence digest the boot printed closes that blocker on the next
  boot, and the report still shows the original observation plus who
  decided what, when and why.
- The same decision stops applying the moment the evidence changes.
