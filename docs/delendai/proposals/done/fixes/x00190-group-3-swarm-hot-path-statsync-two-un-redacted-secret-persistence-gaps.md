---
id: x00190
title: "x00190 — Group 3: swarm hot-path statSync + two un-redacted secret-persistence gaps"
kind: fix
status: done
type: proposal
track: general
date: 2026-07-29
shipped-in:
    - ac0fcbe5 # S1-S3 — statSync hot-path fix + test-policy/auto-agent-selector redaction gaps
---

# x00190 — Group 3: swarm hot-path statSync + two un-redacted secret-persistence gaps

## Goal

Fix three findings from the ongoing dogfooding audit: (1) proposal-completeness.ts's two real production entry points (guardTransitionToDone, verifyCompletedProposalAsync) fell through to a synchronous statSync per declared file on every real `done` transition — a swarm-hot path every agent hits; (2) test-policy's set_test_policy `reason` field was persisted verbatim to a durable, later-re-surfaced file (get_test_policy echoes it back to every future caller) with zero redactSecrets call; (3) auto-agent-selector's calibration store (shared by auto_record and prompt-eval's eval_run) persisted the free-text `taskType` field the same way, un-redacted, into an append-only log blended into future routing decisions.

## why

Continues this session's dogfooding audit pattern (x00166-x00169, x00184). REPO-RULES rule: "secrets never persisted un-redacted (redactSecrets)" and rule: "async I/O only in hot paths" are both repo-wide hard rules; these three are concrete, independently-verified violations, not speculative.

## non-goals

- Making guardSlicesComplete itself async — it stays sync/pure by design (its own tests call it synchronously with no injected predicate); only the two real production entry points that used to fall through to its sync default now pre-resolve files with async stat first.
- A general content-based heuristic to stop expandDeclaredFiles from treating backtick-wrapped prose fragments as declared files — investigated and reverted: the real historical proposal corpus legitimately uses extension-less directory declarations (e.g. `docs/mcp-vertex/examples/`), so any 'must look like a file' filter silently weakens the completeness gate for those. The false-positive hit this session was this agent's own prose style (backticking a non-file word on the same bullet line as a real Files: entry), not a systemic parser bug worth a corpus-wide behavior change.

## Slices

- global_gate: type

### S1 — proposal-completeness.ts: remove sync statSync from the swarm hot path
- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/proposal-completeness.ts`, `plugins/proposals/tests/src/lib/services/proposal-completeness.spec.ts`
- **Gate**: none
- acceptance:
  - "guardTransitionToDone and verifyCompletedProposalAsync pre-resolve every done-slice declared file via async node:fs/promises stat before calling the sync guardSlicesComplete with a pre-resolved Set-backed predicate"
  - "guardSlicesComplete itself is untouched (still sync/pure, same default fallback, same existing tests unchanged)"
  - "New tests spy on node:fs's statSync and assert it is never called by either production entry point during a real transition"

### S2 — test-policy: redact set_test_policy's reason before persisting
- **Status**: done
- **Files**: `plugins/test-policy/src/lib/policy-store.ts`, `plugins/test-policy/tests/src/lib/policy-store.spec.ts`
- **Gate**: none
- acceptance:
  - "writePolicyOverride runs reason through redactSecrets before writing policy.json"
  - "New test proves a high-confidence secret pattern in reason is redacted both in the read-back value and in the raw file on disk"

### S3 — auto-agent-selector: redact the calibration store's taskType before persisting
- **Status**: done
- **Files**: `plugins/auto-agent-selector/src/lib/calibrate/store.ts`, `plugins/auto-agent-selector/tests/src/lib/calibrate/store.spec.ts`
- **Gate**: none
- acceptance:
  - "realCalibrationStore.append runs taskType through redactSecrets before writing calibration.jsonl"
  - "Fix is at the shared store used by both auto_record and prompt-eval's eval_run (single chokepoint, no per-caller duplication)"
  - "New test proves a high-confidence secret pattern in taskType is redacted both in the read-back value and in the raw file on disk"

## acceptance

- guardTransitionToDone and verifyCompletedProposalAsync pre-resolve every done-slice declared file via async node:fs/promises stat before calling the sync guardSlicesComplete with a pre-resolved Set-backed predicate
- guardSlicesComplete itself is untouched (still sync/pure, same default fallback, same existing tests unchanged)
- New tests spy on node:fs's statSync and assert it is never called by either production entry point during a real transition
- writePolicyOverride runs reason through redactSecrets before writing policy.json
- New test proves a high-confidence secret pattern in reason is redacted both in the read-back value and in the raw file on disk
- realCalibrationStore.append runs taskType through redactSecrets before writing calibration.jsonl
- Fix is at the shared store used by both auto_record and prompt-eval's eval_run (single chokepoint, no per-caller duplication)
- New test proves a high-confidence secret pattern in taskType is redacted both in the read-back value and in the raw file on disk
