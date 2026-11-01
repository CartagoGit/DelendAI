---
id: x00967
title: "A git, forge or dependency read that fails says so instead of reporting clean"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 4ad6e68f-3b17-4776-8adc-be08ce68d034
last-correlation-id: 4ad6e68f-3b17-4776-8adc-be08ce68d034
last-transition-from: in-progress
last-transition-at: 2026-11-01T04:00:12.751Z
---

# x00967 — A git, forge or dependency read that fails says so instead of reporting clean

## goal

When git, gh, bun audit or a manifest read fails, the tool returns an error or an explicit unknown state; nothing turns a failed read into a clean tree, an empty PR list, zero vulnerabilities or no licences, and branch protection is not forgotten when a refresh fails.

## why

Joint audit a00095 and gpt-6.1-sol. D68: deps_audit degrades run or parse failures to 'no findings'. sol G61-DEPS-01: an audit failure or timeout is presented without findings. D69: deps_licenses returns clean when the manifest or node_modules are unreadable. D87: git's read layer turns git failures into a clean tree. D110: pr_list degrades a real gh failure to available:true with an empty list. sol CP-01: a failed remote refresh drops the branch protections previously known.

## non-goals

- Stores (the failures-stores proposal).

## slices

- global_gate: type

### S1 — deps
- **Status**: review
- **Files**: `plugins/deps/src/lib/services/audit.ts`, `plugins/deps/src/lib/services/licenses.ts`, `plugins/deps/src/lib/tools/tools.ts`, `plugins/deps/src/public/index.ts`
- **Gate**: type
- acceptance:
  - "A failed or unparsable audit is an error with the cause (D68, G61-DEPS-01)."
  - "An unreadable manifest or node_modules is an error, not zero licences (D69)."
- shipped-in: `48a4f5c96a9d`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — git and forge reads
- **Status**: review
- **Files**: `plugins/git/src/lib/services/git.ts`, `plugins/git/src/lib/services/forge.ts`
- **Gate**: type
- acceptance:
  - "A git status that fails returns an error, never clean (D87)."
  - "A gh failure returns available:false with the reason (D110)."
- shipped-in: `0b0c4aaa1b75`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Branch protection survives a failed refresh
- **Status**: review
- **Files**: `plugins/commit-policy/src/lib/services/branch-protection-adapter.ts`
- **Gate**: type
- acceptance:
  - "A refresh failure keeps the last known protections and reports the failure (CP-01)."
- shipped-in: `0b0c4aaa1b75`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A failed or unparsable audit is an error with the cause (D68, G61-DEPS-01).
- An unreadable manifest or node_modules is an error, not zero licences (D69).
- A git status that fails returns an error, never clean (D87).
- A gh failure returns available:false with the reason (D110).
- A refresh failure keeps the last known protections and reports the failure (CP-01).
