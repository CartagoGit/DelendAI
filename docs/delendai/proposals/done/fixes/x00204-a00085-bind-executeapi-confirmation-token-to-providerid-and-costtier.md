---
id: x00204
title: "a00085: bind executeApi confirmation token to providerId and costTier"
kind: fix
status: done
type: proposal
track: plugins+fix
date: 2026-08-23
shipped-in: [5fcfdd59b]
related:
  - a00085
acceptance:
  - { command: bunx vitest run plugins/orchestrator-runner/tests/src/lib/invoke/token.spec.ts plugins/notification/tests/src/lib/notification.spec.ts packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts packages/client/tests/transport/mcp-stdio-client.spec.ts, expect: exit0 }
last-transition-id: 68d65379-a2b3-4da7-8a04-5886791827b1
last-correlation-id: 68d65379-a2b3-4da7-8a04-5886791827b1
last-transition-from: review
---

# x00204 — a00085: bind executeApi confirmation token + remaining BAD follow-ups

## Goal

HMAC confirmation tokens currently sign only invocationId, so a fallback hop can spend on a different provider/cost after one approval. Sign and verify invocationId|providerId|estimatedCostTier on every hop. Also close a00085 #7 (watcher stop baseline), #8 (stdio connect leak), #9 (scaffold ping outputSchema).

## why

a00085 finding #5: IConfirmationGate receives provider and cost but ConfirmationSigner drops them. Default deny mitigates dogfooding; hosts with elicitation+fallback can overspend.

## non-goals

- Log-store read contention (`onContention: 'fail'`).
- MINOR i18n / kebab / dashboard schema / CLI *Sync / create-plugin cwd.

## Slices

- global_gate: lint

### S1 — Bind HMAC payload to invocation+provider+tier
- **Status**: done
- **Files**: `plugins/orchestrator-runner/src/lib/invoke/token.ts`, `plugins/orchestrator-runner/src/lib/invoke/manager.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/token.spec.ts`
- **Gate**: lint
- acceptance:
  - "mint/verify include providerId and estimatedCostTier"
  - "fallback hop with a different provider fails the previous token"
  - "existing denyAll default unchanged"
- review-state: done
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
### S2 — ReleaseWatcher.stop resets prev
- **Status**: done
- **Files**: `plugins/notification/src/lib/services/watcher.ts`, `plugins/notification/tests/src/lib/notification.spec.ts`
- **Gate**: lint
- review-state: done
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
### S3 — Stdio connect closes transport on handshake failure
- **Status**: done
- **Files**: `packages/client/src/lib/transport/mcp-stdio-client.ts`
- **Gate**: lint
- review-state: done
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
### S4 — Scaffold plugin ping declares outputSchema
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`, `packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts`
- **Gate**: lint
- review-state: done
- review-implementer: proposal_guardian
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier
## acceptance

- mint/verify include providerId and estimatedCostTier
- fallback hop with a different provider fails the previous token
- existing denyAll default unchanged
- watcher stop() clears prev
- ping template has outputSchema
