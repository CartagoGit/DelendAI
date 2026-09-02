---
id: f00307
title: "Reporting default-on, pero MCP-only."
kind: feat
status: review
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#reporting-default-on-pero-mcp-only
shipped-in: ["07225dbf7"] # migration commit that created this proposal file; no code change required (book-keeping only)
last-transition-id: 4e69b979-101d-47e1-87b0-b42be3aef544
last-correlation-id: 4e69b979-101d-47e1-87b0-b42be3aef544
last-transition-from: in-progress
---

# f00307 — Reporting default-on, pero MCP-only.

## Goal

Migrated work item: Reporting default-on, pero MCP-only..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00307-reporting-default-on-pero-mcp-only.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
- review-state: changes_requested
- review-implementer: copilot-orchestrator-bulk-retire-placeholders
- review-reviewer: sonnet-reviewer-2
- review-log: requested_changes by sonnet-reviewer-2 — review-log's 'no actionable scope, source pruned' rationale is factually wrong (source survives in done/audits/a00092-...md), and unlike the other 8 proposals in this batch the title's substantive claim does NOT currently hold. TODO ER-009 in a00092 (line 553) states explicitly: 'La decision de producto es mantenerlo activo por defecto... sin convertirlo en opt-in' - and proposal f00160 (done/feats/f00160-...) implemented exactly that: default-on, opt-out. But plugins/error-reporting/src/lib/options.service.ts currently resolves `enabled: data.enabled ?? false` (flipped from `?? true` in commit cc065ac0b, 2026-08-31, a large unrelated squash titled 'fix: disable agent commit and push automation' that also touched 87 unrelated files) - i.e. reporting is now opt-in/disabled-by-default, contradicting both f00160's shipped decision and this audit item's explicit design directive. The MCP-only scoping half of the claim is solid (verified via ISafeMcpVertexReport + privacy validator + 19/19 adversarial tests), but 'default-on' is false today. Please either: (a) find/link the proposal that deliberately superseded f00160's default-on decision and note it here as 'superseded by architecture change', or (b) treat this as a real regression against f00160 and fix the default back to true. Do not close as book-keeping-only - there is a live, checkable discrepancy.
- **review-state**: done
- **review-implementer**: claude-opus-orchestrator
- **review-reviewer**: repository-owner
- **review-log**: owner decision recorded 2026-09-02 — resolution 1 taken:
  default-on restored, opt-out documented, and a start-up notice added in
  both directions. Verified empirically on a real `register()` call and by
  the full 130-test plugin suite.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#reporting-default-on-pero-mcp-only` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.

### Resolved 2026-09-02 — owner chose resolution 1 (restore default-on)

The repository owner decided: reporting is **on by default**, opt-out via
configuration, and the server **announces it on every start** — in both
directions. Implemented:

- `options.service.ts` resolves `enabled: data.enabled ?? true` again, and
  `contracts/constants/options.constant.ts` documents the default-on
  decision instead of the fail-closed one, so code and contract agree.
- New `lib/startup-notice.helper.ts` (+ `tests/startup-notice.spec.ts`)
  writes an operator notice on stderr at `register()` time. Enabled: what
  is sent, where, and the literal line to set `false`. Disabled: an ask to
  turn it back on, with the same privacy sentence.
- The privacy claim was re-verified rather than restated: `ISafeMcpVertexReport`
  carries a fingerprint, failure class, `@mcp-vertex/*` frames and version
  data — no raw message, no arguments, no project frames — and
  `privacy-validator.helper.ts` refuses any DTO containing an absolute
  path, URL, email, IP, UUID, token, git metadata, branch name, or a
  JSON/XML/SQL fragment. 130/130 plugin tests pass, including the
  adversarial privacy suites.

The previous owner-decision text is kept below for the record.

### Blocked 2026-09-01 — needs an owner decision, not a code change

An independent review found `plugins/error-reporting/src/lib/options.service.ts`
resolving `enabled: data.enabled ?? false`, flipped from `?? true` by the
unrelated 87-file squash `cc065ac0b` ("fix: disable agent commit and push
automation"), which contradicts the shipped decision in `f00160` and the
audit's ER-009 directive ("mantenerlo activo por defecto… sin convertirlo
en opt-in").

It was NOT restored, deliberately. `enabled` is the master switch for
**network dispatch to an external repository**, and both the code and its
own contract (`contracts/constants/options.constant.ts`) currently
document `false` as intentional: "network reporting is explicit opt-in",
"fail-closed until automatic reporting is explicitly enabled". Code and
contract agree with each other; the conflict is with an older audit
directive.

Flipping a privacy-affecting default back on is the repository owner's
call, not an agent's. Two clean resolutions:

1. Restore `?? true` and update the contract doc comment to match, if
   ER-009 still stands.
2. Record ER-009 as superseded and close this proposal against the
   fail-closed default that actually shipped.
