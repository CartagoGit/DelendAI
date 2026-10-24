---
id: x00942
title: "A proposal claim is computed and written under one lock, and only its owner releases it"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 5ea98d9a-2b47-459f-bd0c-8f3b56acade4
last-correlation-id: 5ea98d9a-2b47-459f-bd0c-8f3b56acade4
last-transition-from: in-progress
last-transition-at: 2026-10-24T04:56:38.383Z
shipped-in:
  - "ee0bd295c371f18c9ba5b08a72703898bf52fd96"
---

# x00942 — A proposal claim is computed and written under one lock, and only its owner releases it

## goal

Claims in agents.lock.json and the file-lock table are decided and persisted inside one critical section, a live agent's claim is never purged, a read during the atomic rename never sees an empty table, and a claim or gate is released only by the agent that holds it.

## why

Joint audit a00095. D1: the lock purge runs without the mutex and deletes live agents' claims. D2: the full claim computes conflicts outside the mutex. D3: zombie GC filters by time alone and can relieve a live agent. G51: first empirical reproduction of a false-empty lock read during the atomic rename. G69: the client receives ok for a claim the store did not persist. G91: agent_lock_release_orphan frees the lock but leaves the file-table entry. G92: the claim lock has two different mutexes; recovery does read-modify-write under the other one. gpt-6.1-sol C1: the same slice is granted to two agents and ownership diverges (no identity comparison inside the critical section). Sol C5: a corrupt lock table becomes empty and is overwritten. Sol PROP-GATE01: an expired live gate occupies admission until its own tree resumes.

## non-goals

- Replacing the lock files with SQLite.
- The work-unit leases in core (x00935 and the units proposal).

## slices

- global_gate: type

### S1 — One mutex decides and writes a claim
- **Status**: done
- **Files**: `plugins/proposals/src/lib/locks/lock-store.ts`, `plugins/proposals/src/lib/locks/execute-lock-action.ts`, `plugins/proposals/src/lib/locks/lock-lifecycle.ts`, `plugins/proposals/src/lib/locks/engine.ts`, `plugins/proposals/src/lib/agents/zombie-reconcile.ts`, `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/proposals/src/lib/tools/agents-lock-diagnose.tool.ts`
- **Gate**: type
- acceptance:
  - "Purge, claim, release and recovery all take the same withFileMutex on agents.lock.json; a spec racing two claimants and a purge leaves exactly one claim and loses none (D1, D2, G92)."
  - "Stale removal keeps a claim whose agent has a heartbeat newer than the TTL (D3)."
  - "The claim result reports ok only after the write it reports is on disk; a spec failing the write gets an error, not ok (G69)."
  - "Releasing an orphan removes its file-table rows in the same critical section (G91)."
  - "Inside the critical section the claim compares the holder's identity, so a second agent asking for the same slice is refused (sol C1)."
- shipped-in: `8f4431d14ee2`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at ee0bd295c371, validate exit 0 and tests 67/67 claimed, no recorded run cited; acceptance 5/5: (1) one-critical-section.spec 'leave exactly one claim on the contested file and lose no live one' passes (2) zombie-reconcile.spec (+105 lines) covers stale removal; passes (heartbeat-newer-than-TTL kept) (3) one-critical-section.spec 'is an error, not ok, and leaves no file held' passes (4) recovery-tools.spec (+25) covers orphan release and its rows; passes (5) one-critical-section.spec 'is refused, and the holder keeps its files' passes — verified by code reading and spec runs

### S2 — The lock table is never read empty nor overwritten when corrupt
- **Status**: done
- **Files**: `plugins/proposals/src/lib/locks/file-lock-document.ts`, `plugins/proposals/src/lib/locks/file-lock-table.ts`, `plugins/proposals/src/lib/locks/file-lock-contentions.ts`
- **Gate**: type
- acceptance:
  - "A reader during writeFileAtomic's rename sees either the old or the new table; a spec that interleaves rename and read never observes zero claims (G51)."
  - "A table that does not parse is quarantined with its bytes kept and the claim refused, instead of being rewritten empty (sol C5)."
- shipped-in: `8f4431d14ee2`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at ee0bd295c371, validate exit 0 and tests 67/67 claimed, no recorded run cited; acceptance 2/2: (1) file-lock-table-honest-reads.spec 'sees the old table or the new one, never no claims' passes (2) same spec 'refuses the claim, keeps its bytes aside, and the next claim starts clean' passes — verified by code reading and spec runs

### S3 — An expired gate frees admission
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/close-slice-gate-store.ts`, `plugins/proposals/src/lib/tools/close-slice-gate.ts`
- **Gate**: type
- acceptance:
  - "A live gate past its expiry no longer blocks admission of another tree; a spec with an expired gate from a stopped tree admits the next one (sol PROP-GATE01)."
- shipped-in: `91bf45d1b7b0`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Purge, claim, release and recovery all take the same withFileMutex on agents.lock.json; a spec racing two claimants and a purge leaves exactly one claim and loses none (D1, D2, G92).
- Stale removal keeps a claim whose agent has a heartbeat newer than the TTL (D3).
- The claim result reports ok only after the write it reports is on disk; a spec failing the write gets an error, not ok (G69).
- Releasing an orphan removes its file-table rows in the same critical section (G91).
- Inside the critical section the claim compares the holder's identity, so a second agent asking for the same slice is refused (sol C1).
- A reader during writeFileAtomic's rename sees either the old or the new table; a spec that interleaves rename and read never observes zero claims (G51).
- A table that does not parse is quarantined with its bytes kept and the claim refused, instead of being rewritten empty (sol C5).
- A live gate past its expiry no longer blocks admission of another tree; a spec with an expired gate from a stopped tree admits the next one (sol PROP-GATE01).
