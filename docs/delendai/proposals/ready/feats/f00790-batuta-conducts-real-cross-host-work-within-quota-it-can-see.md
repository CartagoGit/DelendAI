---
id: f00790
title: "Batuta conducts real cross-host work within quota it can see"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# f00790 — Batuta conducts real cross-host work within quota it can see

## goal

Batuta reports a provider available only after checking its auth and model, runs subscriptions on the host they belong to, enforces the subagent token cap locally, reserves quota per machine, sees quota, completes the multi-account bootstrap, refuses to route without providers, reads plain-text CLI output, stops a subagent on timeout, never ends a plan ok with verify unrun, and keeps one learning store.

## why

Joint audit a00095 and gpt-6.1-sol. G52: the healthcheck marks available without auth or model. G53: subscription is a passthrough to the current host. G56: maxTokensPerSubagent is a request to the host, not a local cut. D30: the multi-account bootstrap patches /providers only, not /accounts. G123: with no providers, advise_routing returns an executable-looking decision. G132: a cli provider writing plain text returns text "" as success. sol C3: ledgers per workspace allow reserving one shared pool twice. sol C4: a retry after ledger quarantine reads an empty quota. sol ORCH-07: timeout does not cancel the subagent before rotating. G30: three components choose models and three keep what they learn. G32: nothing observes quota; every unattended jump is refused. sol CLI-OFFER01: the payment question ignores q. G99: a plan can end ok:true with verify unrun. G21: spend confirmation could never be given (fixed in f00551 S6; verify).

## non-goals

- Selector inputs (the selectors proposal).
- Paid provider calls in tests.

## slices

- global_gate: type

### S1 — Health, subscription and bootstrap
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/healthcheck/report.ts`, `plugins/orchestrator-runner/src/lib/subprocess/subscription.ts`, `plugins/orchestrator-runner/src/lib/subprocess/cli.ts`, `plugins/orchestrator-runner/src/lib/bootstrap.ts`, `packages/core/src/lib/contracts/constants/provider-entry-schema.constant.ts`, `plugins/orchestrator-runner/src/lib/invoke/token.ts`
- **Gate**: type
- acceptance:
  - "available requires auth and model checks to pass (G52)."
  - "A subscription launches its own host CLI (G53)."
  - "Plain-text output is captured (G132)."
  - "The bootstrap patch covers /accounts (D30)."
  - "Spend confirmation can be given and is verified (G21)."

### S2 — Quota
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`, `plugins/orchestrator-runner/src/index.ts`, `packages/core/src/lib/plugins/personal-layer.service.ts`, `docs/delendai/batuta/guide.md`
- **Gate**: type
- acceptance:
  - "Reservations live in a machine-scoped ledger (sol C3); a quarantined ledger refuses instead of reading empty (sol C4)."
  - "Quota is observed from provider headers or usage where available and unattended jumps use it (G32)."

### S3 — Dispatch
- **Status**: pending
- **Files**: `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`, `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts`, `packages/contracts/src/host-subagent-runtime.interface.ts`, `plugins/agent-orchestrator/src/lib/budget/budget-tracker.ts`
- **Gate**: type
- acceptance:
  - "The dispatcher cuts a subagent at maxTokensPerSubagent (G56)."
  - "A timeout cancels before rotating (ORCH-07)."
  - "A plan with an unrun verify stage is not ok (G99)."
  - "advise_routing without providers says there is nothing to route to (G123)."

### S4 — One selector and one learning store
- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`, `docs/delendai/batuta/reconciliation.md`, `packages/cli/src/lib/init/account-prompts.service.ts`, `packages/cli/src/lib/init/init-prompts.service.ts`
- **Gate**: type
- acceptance:
  - "One component ranks and one store learns; the others read it (G30)."
  - "q at the payment question quits (CLI-OFFER01)."

## acceptance

- available requires auth and model checks to pass (G52).
- A subscription launches its own host CLI (G53).
- Plain-text output is captured (G132).
- The bootstrap patch covers /accounts (D30).
- Spend confirmation can be given and is verified (G21).
- Reservations live in a machine-scoped ledger (sol C3); a quarantined ledger refuses instead of reading empty (sol C4).
- Quota is observed from provider headers or usage where available and unattended jumps use it (G32).
- The dispatcher cuts a subagent at maxTokensPerSubagent (G56).
- A timeout cancels before rotating (ORCH-07).
- A plan with an unrun verify stage is not ok (G99).
- advise_routing without providers says there is nothing to route to (G123).
- One component ranks and one store learns; the others read it (G30).
- q at the payment question quits (CLI-OFFER01).
