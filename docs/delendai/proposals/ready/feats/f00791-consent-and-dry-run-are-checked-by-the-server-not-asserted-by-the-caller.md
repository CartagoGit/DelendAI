---
id: f00791
title: "Consent and dry-run are checked by the server, not asserted by the caller"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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
- **Status**: pending
- **Files**: `plugins/refactor/src/lib/tools/refactor-rename.tool.ts`, `plugins/orchestrator-runner/src/lib/services/spend-confirmation.service.ts`, `packages/core/src/lib/consent/consent-token.service.ts`, `packages/core/src/lib/contracts/interfaces/consent-signer.interface.ts`, `packages/core/src/runtime/index.ts`, `packages/core/tests/src/lib/consent/consent-token.service.spec.ts`, `plugins/orchestrator-runner/src/lib/invoke/token.ts`, `plugins/refactor/src/lib/tools/refactor-rename.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "A core service issues a token bound to the action digest and verifies it on apply. `refactor_rename` returns one for its exact plan, and `refactor_apply` refuses a token it did not issue or a diff edited since (D62, G121). The token proves the diff is the plan the server made, not that a person approved it: a person's approval remains the spend gate's elicitation."
  - "Spend confirmation uses the same service."

### S2 — dry-run before the effect
- **Status**: pending
- **Files**: `packages/core/src/lib/dry-run/enforce.ts`, `packages/core/src/lib/project/tool-surface-runtime.service.ts`
- **Gate**: type
- acceptance:
  - "A registration with effects and dryRun support is short-circuited before its handler runs when dryRun is true; the count of effectful registrations without it is printed and ratcheted (G122)."
  - "Each decorative parameter G101 lists is enforced or removed, recorded per tool in the closing evidence."

## acceptance

- A core service issues a token bound to the action digest and verifies it on apply. `refactor_rename` returns one for its exact plan, and `refactor_apply` refuses a token it did not issue or a diff edited since (D62, G121). The token proves the diff is the plan the server made, not that a person approved it: a person's approval remains the spend gate's elicitation.
- Spend confirmation uses the same service.
- A registration with effects and dryRun support is short-circuited before its handler runs when dryRun is true; the count of effectful registrations without it is printed and ratcheted (G122).
- Each decorative parameter G101 lists is enforced or removed, recorded per tool in the closing evidence.
