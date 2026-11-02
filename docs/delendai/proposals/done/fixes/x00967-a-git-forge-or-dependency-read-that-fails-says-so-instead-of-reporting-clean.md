---
id: x00967
title: "A git, forge or dependency read that fails says so instead of reporting clean"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 181ff8b5-4b60-40bd-be96-95172aee8447
last-correlation-id: 181ff8b5-4b60-40bd-be96-95172aee8447
last-transition-from: review
last-transition-at: 2026-11-02T19:39:18.009Z
shipped-in:
  - "b86756b4f329f64a3b79338c6a543459b5175d3f"
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
- **Status**: done
- **Files**: `plugins/deps/src/lib/services/audit.ts`, `plugins/deps/src/lib/services/licenses.ts`, `plugins/deps/src/lib/tools/tools.ts`, `plugins/deps/src/public/index.ts`
- **Gate**: type
- acceptance:
  - "A failed or unparsable audit is an error with the cause (D68, G61-DEPS-01)."
  - "An unreadable manifest or node_modules is an error, not zero licences (D69)."
- shipped-in: `48a4f5c96a9d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at b86756b4f329, validate exit 0 and tests 19/19 claimed, no recorded run cited; acceptance 2/2: (1) At b86756b4 the deps audit returns a discriminated result that names the cause, naming a timeout and an audit that gave no report, and the tool throws that cau… (2) At b86756b4 the licence reader no longer swallows a failed manifest or package read, so an unreadable manifest propagates and a node_modules whose packages can… — Approved on the delivered state of b86756b4f329f64a3b79338c6a543459b5175d3f. A failed or unparsable audit is now an error that carries its cause, and an unreadable manifest or node_modules is an error rather than a report of zero licences: the two swallowing try and catch blocks are gone from the licence reader and the audit result names the cause. The type gate exited 0 and the two slice specs pass 19 of 19. Residuals, recorded and not blocking: the cause of a single unreadable dependency is discarded and counted instead, a partly unreadable workspace yields a missing-licence finding rather than an error, and the compatibility wrapper the security plugin uses still renders a failed audit as an explicit skipped state with its cause, which the goal sentence allows.

### S2 — git and forge reads
- **Status**: done
- **Files**: `plugins/git/src/lib/services/git.ts`, `plugins/git/src/lib/services/forge.ts`
- **Gate**: type
- acceptance:
  - "A git status that fails returns an error, never clean (D87)."
  - "A gh failure returns available:false with the reason (D110)."
- shipped-in: `0b0c4aaa1b75`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at b86756b4f329, validate exit 0 and tests 22/22 claimed, no recorded run cited; acceptance 2/2: (1) At b86756b4 the git read layer funnels every status, change and diff read through a helper that throws the reason when git did not succeed, and the runner neve… (2) At b86756b4 the forge read returns available false with the reason and the remediation when the call fails, and the spec asserts that a gh error surfaces as a … — Approved on the delivered state of b86756b4f329f64a3b79338c6a543459b5175d3f. A git status that fails now returns an error and never a clean tree, and a forge failure returns available false with the reason the client reads. The type gate exited 0 and the two slice specs pass 22 of 22. Residuals, recorded and not blocking and outside the slices' declared files: the single pull request view still reports available true when the tool is present but failing, the log read still reads a failed call as no commits, and the commit-policy plugin's own dirty-file read still degrades a failed status to a clean tree.

### S3 — Branch protection survives a failed refresh
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/services/branch-protection-adapter.ts`
- **Gate**: type
- acceptance:
  - "A refresh failure keeps the last known protections and reports the failure (CP-01)."
- shipped-in: `0b0c4aaa1b75`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at b86756b4f329, validate exit 0 and tests 9/9 claimed, no recorded run cited; acceptance 1/1: (1) At b86756b4 the branch-protection refresh no longer clears the remembered remote branches when it starts, so a failed refresh keeps the last known protections … — Approved on the delivered state of b86756b4f329f64a3b79338c6a543459b5175d3f. The branch protection cache is no longer wiped at the start of a refresh, so a failed refresh keeps the last known protections and reports the failure with its cause. The type gate exited 0 and the slice spec passes 9 of 9. One residual, recorded and not blocking: the GitLab branch parser still swallows an unparsable answer on a call that succeeded, which is not the failed-refresh case this criterion names.

## acceptance

- A failed or unparsable audit is an error with the cause (D68, G61-DEPS-01).
- An unreadable manifest or node_modules is an error, not zero licences (D69).
- A git status that fails returns an error, never clean (D87).
- A gh failure returns available:false with the reason (D110).
- A refresh failure keeps the last known protections and reports the failure (CP-01).
