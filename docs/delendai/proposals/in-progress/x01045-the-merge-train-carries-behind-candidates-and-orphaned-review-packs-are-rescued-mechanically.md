---
id: x01045
title: "The merge train carries behind candidates and orphaned review packs are rescued mechanically"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-07
last-transition-id: 6217d9a9-89c8-40af-ac4d-8230988e85d3
last-correlation-id: 6217d9a9-89c8-40af-ac4d-8230988e85d3
last-transition-from: review
last-transition-at: 2026-11-08T01:29:00.740Z
---

# x01045 — The merge train carries behind candidates and orphaned review packs are rescued mechanically

## goal

The queue is organic, fast and cheap in every project. A train is the integration tip with each candidate merged onto it, so its one full run proves every member against the current tip: behind candidates ride trains, a conflict confined to derived files is regenerated once on the train, and per-PR bring-forward with a local proof is left for the candidate that cannot ride one. An orphaned review pack that conflicts is merged with the integration branch with its verdict and claim lines kept, its derived files regenerated and republished, never inventing or altering a verdict; a verdict on a closed proposal, or on a slice whose content changed since, is dropped with a note.

## why

Evidence 2026-11-07. The merge train (q00045 S6: tools/scripts/forge/queue-order.ts, keep-the-queue-moving.script.ts) took only candidates disjoint from what the integration branch gained since they left (acceptIndependent). Candidates behind on a change that can reach every zone were excluded and went one at a time through refresh-candidate-artifacts, which merges develop, runs a full local publication-proof and pushes, on the owner's machine: hours, with the machine loaded. Orphaned review packs by gpt-5.3-codex (#1778, #1800, #1802, #1808) sat DIRTY or red: #1800 and #1808 conflict only on verdict lines that another round of the same reviewer landed on develop, and dropConflictingVerdicts dropped every verdict on a conflicting document instead of keeping the pack's lines. #1778 is red on proposal-slice-completeness (its own f00796 S1 verdict leaves a pending slice in review/), and #1802 changes f00796, f00797 and x01006 without claiming them (closed-with-independent-approval), judging the same slices #1778 claims: those two need a person, not a mechanical rescue.

## non-goals

- Changing what a verdict says, or adding claims a pack never made.
- Removing the per-PR bring-forward: it stays for a candidate that cannot ride a train.

## slices

- global_gate: type

### S1 — Behind candidates ride trains; derived conflicts are regenerated on the train
- **Status**: review
- **Files**: `tools/scripts/forge/independent-candidates.ts`, `tools/scripts/forge/independent-candidates.spec.ts`, `tools/scripts/forge/queue-acceptance.ts`, `tools/scripts/forge/queue-acceptance.spec.ts`, `tools/scripts/forge/train-assembly.ts`, `tools/scripts/forge/train-assembly.spec.ts`, `tools/scripts/forge/queue-order.ts`, `tools/scripts/forge/queue-order.interface.ts`, `tools/scripts/forge/keep-the-queue-moving.script.ts`
- **Gate**: type
- acceptance:
  - "A candidate behind on a change that can reach every zone rides a train with the others and lands with it; it leaves the train only when it overlaps an earlier member or does not merge onto the tip plus the earlier members (independent-candidates.spec.ts, queue-acceptance.spec.ts)."
  - "A member whose merge conflicts only in derived files is merged with the integration side of those files, the generators run once on the train, and the train is pushed with the regeneration commit; a conflict in any other file leaves the member out (train-assembly.spec.ts)."
  - "The bring-forward machine skips every candidate that rides a train (queue-acceptance.spec.ts)."
- shipped-in: `95515cbb9538`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — Orphaned review packs are rescued with their verdicts byte-identical
- **Status**: review
- **Files**: `tools/scripts/git/stale-verdict-conflicts.ts`, `tools/scripts/git/stale-verdict-conflicts.spec.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/lint/biome-baseline.script.ts`
- **Gate**: type
- acceptance:
  - "A review pack that conflicts with the integration branch in a proposal document is merged with the pack's verdict, claim and transition lines kept over the integration branch's and the integration branch's text elsewhere; the verdict lines of every slice it judged are byte-identical to the pack's (stale-verdict-conflicts.spec.ts)."
  - "A verdict on a proposal closed on the integration branch, or on a slice whose files, gate, acceptance or shipped-in changed there since the pack left, is dropped with a note in the merge message, and the document is the integration branch's (stale-verdict-conflicts.spec.ts)."
  - "`biome-baseline` refuses a tree without its scan roots before its changed-file path, so `no-silent-gates` no longer fails every change confined to tools/ whose files carry no Biome diagnostic (found while proving this slice)."
  - "A pack that changes a proposal its own commits do not claim gets the reviewer's own `Claims:` commit for it from any of its units, found through its maker notes and cherry-picked with its author unchanged; a verdict the reviewer claimed nowhere is dropped with a note (stale-verdict-conflicts.spec.ts)."
  - "A refused push reports every failing line of the gate in full, with no cap on how many lines or how long they are (refresh-candidate-artifacts.script.spec.ts)."
- shipped-in: `f5568e77084e`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A candidate behind on a change that can reach every zone rides a train with the others and lands with it; it leaves the train only when it overlaps an earlier member or does not merge onto the tip plus the earlier members (independent-candidates.spec.ts, queue-order.spec.ts).
- A member whose merge conflicts only in derived files is merged with the integration side of those files, the generators run once on the train, and the train is pushed with the regeneration commit; a conflict in any other file leaves the member out (train-assembly.spec.ts).
- The bring-forward machine skips every candidate that rides a train.
- A review pack that conflicts with the integration branch in a proposal document is merged with the pack's verdict, claim and transition lines kept over the integration branch's and the integration branch's text elsewhere; the verdict lines of every slice it judged are byte-identical to the pack's (stale-verdict-conflicts.spec.ts).
- A verdict on a proposal closed on the integration branch, or on a slice whose files, gate, acceptance or shipped-in changed there since the pack left, is dropped with a note in the merge message, and the document is the integration branch's (stale-verdict-conflicts.spec.ts).
