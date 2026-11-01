---
id: f00791
title: "Consent and dry-run are checked by the server, not asserted by the caller"
kind: feat
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 422237f7-6c24-441c-93e2-7845c875ff17
last-correlation-id: 422237f7-6c24-441c-93e2-7845c875ff17
last-transition-from: in-progress
last-transition-at: 2026-11-01T04:33:30.397Z
---

# f00791 — Consent and dry-run are checked by the server, not asserted by the caller

## goal

A consent token is issued and verified by the server for every risky action, dry-run is decided before the effect runs, and parameters that look like governance are either enforced or removed.

## why

Joint audit a00095. G121: consent a person can verify exists only for spending (elicitation in orchestrator-runner); docker confirm/confirmRisk and other confirms are booleans the caller sets. G122: the dryRun protocol detects only after executing; 120 of 125 registrations with effects lack a pre-execution check. D62: refactor_apply requires consentToken but never checks or issues one. G101: the decorative-governance family: the schema asks for the parameter, the text promises it, the code ignores it.

## non-goals

- Network and filesystem policy (x00951, x00952).

## slices

- global_gate: type

### S1 — A server-issued consent token
- **Status**: review
- **Files**: `plugins/refactor/src/lib/tools/refactor-rename.tool.ts`, `plugins/orchestrator-runner/src/lib/services/spend-confirmation.service.ts`, `packages/core/src/lib/consent/consent-token.service.ts`, `packages/core/src/lib/contracts/interfaces/consent-signer.interface.ts`, `packages/core/src/runtime/index.ts`, `packages/core/tests/src/lib/consent/consent-token.service.spec.ts`, `plugins/orchestrator-runner/src/lib/invoke/token.ts`, `plugins/refactor/src/lib/tools/refactor-rename.tool.spec.ts`, `plugins/refactor/src/lib/tools/refactor-consent.spec.ts`
- **Gate**: type
- acceptance:
  - "A core service issues a token bound to the action digest and verifies it on apply. `refactor_rename` returns one for its exact plan, and `refactor_apply` refuses a token it did not issue or a diff edited since (D62, G121). The token proves the diff is the plan the server made, not that a person approved it: a person's approval remains the spend gate's elicitation."
  - "Spend confirmation uses the same service."
- shipped-in: `bb57c75d7494`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — dry-run before the effect
- **Status**: review
- **Files**: `packages/core/src/lib/dry-run/enforce.ts`, `packages/core/src/lib/dry-run/protocol.ts`, `packages/core/src/lib/project/tool-surface-runtime.service.ts`, `packages/core/src/lib/contracts/constants/dry-run-plan-fields.constant.ts`, `packages/core/src/lib/contracts/constants/plugin-wiring-schemas.constant.ts`, `tools/scripts/lint/dry-run-coverage.script.ts`, `tools/scripts/lint/dry-run-coverage.script.spec.ts`, `tools/scripts/lint/dry-run-coverage.baseline.json`, `docs/delendai/security/dry-run-contract.md`, `packages/core/src/lib/scaffold/create-plugin.tool.ts`, `plugins/container/src/lib/run/docker-command.service.ts`, `plugins/container/src/lib/tools/container-build.tool.ts`, `plugins/container/src/lib/tools/container-docker.tool.ts`, `plugins/database/src/lib/tools/db-query.tool.ts`, `plugins/proposals/src/lib/tools/branch-gc.tool.ts`, `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/quality/src/index.ts`
- **Gate**: type
- acceptance:
  - "A dryRun call to a tool whose input schema does not accept the flag is refused before its handler runs, a plan without its lists is refused instead of throwing, and tools that honour dryRun return the contract plan; `lint:dry-run-coverage` prints and ratchets the count of effectful registrations without support (G122)."
  - "Each decorative parameter G101 lists is enforced, removed or owned by a named proposal, recorded per tool in the notes."
- shipped-in: `db27f9e2426d`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A core service issues a token bound to the action digest and verifies it on apply. `refactor_rename` returns one for its exact plan, and `refactor_apply` refuses a token it did not issue or a diff edited since (D62, G121). The token proves the diff is the plan the server made, not that a person approved it: a person's approval remains the spend gate's elicitation.
- Spend confirmation uses the same service.
- A dryRun call to a tool whose input schema does not accept the flag is refused before its handler runs, a plan without its lists is refused instead of throwing, and tools that honour dryRun return the contract plan; `lint:dry-run-coverage` prints and ratchets the count of effectful registrations without support (G122).
- Each decorative parameter G101 lists is enforced, removed or owned by a named proposal, recorded per tool in the notes.

## notes

G101, per tool, read in the code at hand-over:

- `refactor_apply` `consentToken`: enforced here (S1).
- `api` `allowList`, `maxBytes`, `timeoutMs`: already enforced; `fetchAndParseSpec` passes them to the fetch engine.
- `adaptive-optimizer` `budget`: already enforced by `withinBudget`.
- `plugins_recommend` `taskHint`: already enforced; `taskMatches` scores it.
- `external-mcps` spawn: already gated by `allowedCommands`.
- `self_audit` `capabilities`: still decorative; x00962 owns it (AUD-02, D115), so it is not fixed twice.
