---
id: x00607
title: "Reading a project is not permission to write in it"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
shipped-in: ["1308d13ca"]
---

# x00607 — Reading a project is not permission to write in it

## goal

The first time delendai looks at a workspace it creates
`.delendai/applied-config.json` there, and reports that nothing happened.
Whatever the file is for, the project's owner must be able to find out
that it exists and why — from the report, on the run that created it.

## why

Driven against a throwaway project (a `delendai.config.json` naming one
plugin, a README, no `.delendai`):

```
{ "previousSource": "inferred", "outcomes": [], "acted": false }
```

and afterwards the project contains `.delendai/applied-config.json` —
which it did not before. Three layers of silence stack up:

1. `reconcileConfigTransitions` returns `acted: outcomes.length > 0`.
   Recording the snapshot is not an outcome, so a run whose only effect
   was creating a file reports `acted: false`.
2. `legacy-migration.service.ts` gates the whole report on that flag:
   `if (result.acted) input.report?.(result)`. False means **nothing is
   reported at all** — not the write, not the run.
3. The directory is self-ignoring (x00596 writes `.gitignore` with `*`
   inside it), so `git status` in that project shows zero changes. That
   part is right — delendai's state does not belong in somebody's
   commits — but it removes the last chance the owner had to notice.

So the one surface that could have said "I created this" says the
opposite. A tool that writes in a repository and reports `acted: false`
has told its user something untrue, and the user's complaint about the
guard hooks was this same sentence in a different place: delendai should
migrate what we already have, not quietly furnish the project.

## why this design

**Not by withholding the write.** That was the first instinct and it is
wrong, which is worth recording so nobody re-proposes it. The snapshot is
how "the previous configuration" is known: write it on run 1, and a
`cacheDir` edit before run 2 is *detected*; withhold it, and run 2 falls
back to inferring the previous configuration as the current one, so the
edit is **missed** and the old cache is silently orphaned. Suppressing
the write to look polite would disable config-change detection on exactly
the run that needs it. The file earns its place.

**Not by relocating it either** — at least not here. `.delendai/` for
runtime state rather than the cache directory is a real question, but
`cacheDir` is itself one of the values these transitions move, so the
snapshot cannot live inside the thing it is used to relocate. x00596
deferred it for the same reason and it stays deferred.

What is wrong is not the write. It is that the write is unreported while
a boolean called `acted` says it did not happen. So: say it.

## non-goals

- Moving runtime state out of `.delendai/` (see above).
- Changing the self-ignoring directory: delendai's state staying out of
  the project's commits is correct.
- Asking permission before writing. A project carrying a
  `delendai.config.json` has adopted delendai; the fix is disclosure, not
  a prompt nobody can answer on a server boot.

## Slices

- global_gate: none

### S1 — A run that wrote something never reports that it did not

- **Status**: done — `IConfigTransitionRunResult` now carries `recorded`
  and `recordPath`, and `acted` is `outcomes.length > 0 || willWrite`.
  Verified against a throwaway project with no `.delendai`: run 1 answers
  `acted: true, recorded: "written", recordPath: ".delendai/applied-config.json"`,
  run 2 over the unchanged config answers `acted: false, recorded: "unchanged"`.
  One existing assertion had to change — it read `acted: false` under the
  title "records the configuration and changes nothing else", pinning the
  defect; it now asserts the invariant a first pass really has, which is
  that nothing was *transitioned*. A dry run records nothing, and a
  workspace with neither config nor record still records nothing, because
  writing defaults there would read back later as a choice nobody made.
- **Gate**: `npx vitest run packages/core/tests/src/lib/workspace-migration/config-transitions.service.spec.ts`
- **Files**: `packages/core/src/lib/workspace-migration/config-transitions.service.ts`,
  `packages/core/src/lib/contracts/interfaces/config-transition.interface.ts`,
  `packages/core/tests/src/lib/workspace-migration/config-transitions.service.spec.ts`
- `IConfigTransitionRunResult` carries `recorded: 'written' | 'unchanged'
  | 'withheld'`, and `acted` is true whenever the snapshot was written,
  not only when a transition ran. A first-sight run against a project
  with a config file reports `acted: true` and `recorded: 'written'`; a
  second run over an unchanged config reports `recorded: 'unchanged'` and
  does not claim to have acted.

### S2 — The report names the file and why it is there

- **Status**: done — as built the renderer is `describeMigrationRun` in
  `tools/scripts/host/host-server.script.ts`, not the migration service the
  slice guessed: the service decides whether to report, the script decides
  what the reader sees, and the missing sentence was the reader's. It now
  emits one line naming the path and the reason, only when `recorded` is
  `written` — a second boot stays silent, because a report that speaks
  every time teaches its reader to skip it.
- **Gate**: `npx vitest run tools/scripts/host/host-server.script.spec.ts`
- **Files**: `tools/scripts/host/host-server.script.ts`,
  `tools/scripts/host/host-server.script.spec.ts`
- With S1's flag true, the existing `if (result.acted)` gate already
  fires; what reaches the reader must name the path that was created and
  the one sentence of reason (it records the configuration this workspace
  now reflects, so a later edit can be acted on) rather than an empty
  outcome list that reads as "nothing happened".

## acceptance

Driving the real reconciler against a project that has no `.delendai`:

- the result says `acted: true` and `recorded: 'written'`, and the
  reported text names `.delendai/applied-config.json`;
- running it again over an unchanged config says `recorded: 'unchanged'`
  and `acted: false`, and reports nothing — a second boot is not news;
- editing `cacheDir` between the two runs is still detected, proving the
  snapshot kept doing its job.
