---
id: x00552
title: "A human may close a repair task the reconciler cannot"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-19
tags:
    - startup
    - reconciler
    - degraded
    - recovery
shipped-in:
  - 71a83785da584c6ddc31d1e3bf70ccf89ded9fc6
last-transition-id: 6d49ead2-32e7-4823-87e2-aef9955d6f92
last-correlation-id: 6d49ead2-32e7-4823-87e2-aef9955d6f92
last-transition-from: review
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

- **Status**: done
  code, subject and message, and the boot report prints it. A resolution
  can then name exactly what it answered, and evidence that changes
  invalidates the answer automatically.
- **Files**: `packages/core/src/lib/startup-reconciler/finding-catalog.ts`,
  `packages/core/src/lib/startup-reconciler/contracts.interface.ts`,
  `packages/core/src/lib/startup-gate/render-gate.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler/repair-resolutions.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. The queue named merge 5e578c922 (no content); git log traces all three slices to the single delivery commit 71a83785d, full stat read. S1 verified: (1) every repair task carries its evidence digest — finding-catalog.ts and contracts.interface.ts define evidenceDigest per finding and repair-resolutions.ts derives it from the finding's evidence, with the design comment (lines 12-14) explaining WHY pinned to a digest and not to code/identity: 'the NEXT vanishing of the same ref at a different checkpoint' must re-block; (2) render-gate.ts prints the exact decision command in the DEGRADED report; (3) the spec 'ties the digest to the evidence, not to the task identity' pins it. All three slice gates run verbatim together: repair-resolutions.spec.ts + repair-resolutions-seam.spec.ts + repair.command.spec.ts = 28/28 exit 0. bun run typecheck exit 0. No out-of-scope changes beyond the proposal doc, catalog regeneration and one bootstrap line.
- review-attribution: unrecorded — nothing in Git names who delivered 71a83785da584c6ddc31d1e3bf70ccf89ded9fc6: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S2 — The reconciler honours a recorded resolution

- **Status**: done
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
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. Same delivery commit 71a83785d as S1, stat read. S2 verified in the current tree: (1) all seven declared files exist — repair-resolutions.ts/.interface.ts/.constant.ts, build-report.ts, reconcile-startup.ts, startup-gate/repair-resolutions-seam.ts and run-startup-gate.ts; (2) a tracked workspace file (config/delendai/repair-resolutions.json, version+resolutions schema) records decisions — deliberate choice documented in the commit: git-derived blockers appear on every clone, so the decision must travel with the repository and arrive through review, rather than sitting in a local journal; the live file in this checkout carries one real decision (taskId 3ef6bab0..., evidenceDigest d718bf3e..., decision accepted-loss, with decidedBy/decidedAt/reason); (3) acceptance item 1: a blocker with no recorded decision stays DEGRADED and keeps blocking — spec 'leaves a blocker nobody answered blocking'; (4) acceptance item 2: a decision matching BOTH task id and digest closes the blocker and the report restates who decided what, when and why while the original observation stays visible — spec 'closes the blocker a decision answered and keeps the record'; (5) acceptance item 3: the same decision stops applying the moment the evidence changes — specs 'keeps blocking when the evidence changed under the decision' and 'resolves nothing for a different task'; (6) malformed/unreadable files are reported and honoured nowhere ('reports every malformed entry and honours none of them', 'refuses a file it does not understand rather than guessing'). Gate run verbatim: repair-resolutions-seam.spec.ts included in the 28/28 combined run, exit 0. bun run typecheck exit 0.
- review-attribution: unrecorded — nothing in Git names who delivered 71a83785da584c6ddc31d1e3bf70ccf89ded9fc6: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S3 — Recording a decision needs no host

- **Status**: done
  decision can be taken from a console, from Claude, Codex or Copilot,
  with no MCP server and no database. The DEGRADED report prints the
  exact command.
- **Files**: `packages/cli/src/commands/repair.command.ts`,
  `packages/cli/src/commands/groups/core.ts`,
  `packages/cli/src/contracts/constants/help-translation.constant.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/repair.command.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. Same delivery commit 71a83785d, stat read. S3 verified in the current tree: (1) all three declared files exist — packages/cli/src/commands/repair.command.ts (+193 lines), commands/groups/core.ts (+16, command registered in the core group) and help-translation.constant.ts (+1 line); (2) `delendai repair` lists and records resolutions over the tracked store file with NO MCP server and NO database — the commit states this is precisely what makes a decision reachable from a console, Claude, Codex or Copilot alike (the slice title 'recording a decision needs no host'); (3) gate run verbatim: npx vitest run packages/cli/src/commands/repair.command.spec.ts is included in the combined 28/28 exit-0 run with the S1/S2 gates (227 lines of command specs in the commit, covering list/resolve flows and malformed-store refusals); (4) registry.spec.ts and groups/core.spec.ts updates in the same commit keep the CLI surface gates green (unregistered-tools parity). bun run typecheck exit 0. The one real case recorded in the store (x00545-S1 discarded work that had kept this repository DEGRADED) demonstrates the command operating end-to-end, not just under test.
- review-attribution: unrecorded — nothing in Git names who delivered 71a83785da584c6ddc31d1e3bf70ccf89ded9fc6: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
## acceptance

- A blocker with no recorded decision keeps the workspace DEGRADED and
  keeps mutations blocked, exactly as before.
- A decision recorded with `delendai repair resolve` against the task id
  and evidence digest the boot printed closes that blocker on the next
  boot, and the report still shows the original observation plus who
  decided what, when and why.
- The same decision stops applying the moment the evidence changes.
