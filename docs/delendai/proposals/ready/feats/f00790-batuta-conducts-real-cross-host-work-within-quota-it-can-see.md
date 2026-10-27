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
- **Files**: `packages/core/src/runtime/index.ts`, `plugins/orchestrator-runner/src/lib/bootstrap.ts`, `plugins/orchestrator-runner/src/lib/services/providers-patch.helper.ts`, `plugins/orchestrator-runner/src/public/index.ts`, `plugins/orchestrator-runner/src/lib/contracts/constants/subscription-hosts.constant.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/provider-checks.interface.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/subscription-host.interface.ts`, `plugins/orchestrator-runner/src/lib/healthcheck/report.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/lib/invoke/manager.ts`, `plugins/orchestrator-runner/src/lib/subprocess/cli.ts`, `plugins/orchestrator-runner/src/lib/subprocess/subscription.ts`, `plugins/orchestrator-runner/src/lib/tools/bootstrap.tool.ts`, `plugins/orchestrator-runner/src/lib/tools/healthcheck-providers.tool.ts`, `plugins/orchestrator-runner/tests/src/lib/bootstrap.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/healthcheck/report.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/subprocess/cli.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/subprocess/subscription.spec.ts`
- **Gate**: type
- acceptance:
  - "available requires auth and model checks to pass (G52)."
  - "A subscription launches its own host CLI (G53)."
  - "Plain-text output is captured (G132)."
  - "The bootstrap patch covers /accounts (D30)."
  - "Spend confirmation can be given and is verified (G21)."

### S2 — Quota
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/index.ts`, `plugins/orchestrator-runner/src/lib/contracts/constants/quota-ledger.constant.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/quota-ledger.interface.ts`, `plugins/orchestrator-runner/src/lib/services/quota-ledger.helper.ts`, `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`, `plugins/orchestrator-runner/tests/src/lib/services/quota-ledger.helper.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/services/quota-reservation.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Reservations live in a machine-scoped ledger (sol C3); a quarantined ledger refuses instead of reading empty (sol C4)."
  - "Quota is observed from provider headers or usage where available and unattended jumps use it (G32)."

### S3 — Dispatch
- **Status**: pending
- **Files**: `packages/contracts/src/host-subagent-runtime.interface.ts`, `plugins/agent-orchestrator/src/lib/dispatch/contracts.ts`, `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.helper.ts`, `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`, `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts`, `plugins/agent-orchestrator/src/lib/telemetry/decision-receipt.ts`, `plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts`, `plugins/agent-orchestrator/tests/src/lib/dispatch/linear-dispatcher-limits.spec.ts`, `plugins/agent-orchestrator/tests/src/lib/dispatch/linear-dispatcher.spec.ts`, `plugins/agent-orchestrator/tests/src/lib/tools/dispatch-telemetry.spec.ts`, `plugins/agent-orchestrator/tests/src/lib/tools/dispatch.tool.spec.ts`, `plugins/orchestrator-runner/src/lib/router/advise.ts`, `plugins/orchestrator-runner/src/lib/tools/advise-routing.tool.ts`, `plugins/orchestrator-runner/tests/src/lib/tools/advise-routing.tool.spec.ts`, `plugins/audit-orchestrator/src/lib/tools/orchestrate.tool.ts`, `plugins/audit-orchestrator/tests/src/lib/orchestrate.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "The dispatcher cuts a subagent at maxTokensPerSubagent (G56)."
  - "A timeout cancels before rotating (ORCH-07)."
  - "A plan with an unrun verify stage is not ok (G99)."
  - "advise_routing without providers says there is nothing to route to (G123)."

### S4 — The offer stops where the person says
- **Status**: pending
- **Files**: `packages/cli/src/lib/init/account-prompts.service.spec.ts`, `packages/cli/src/lib/init/account-prompts.service.ts`, `packages/cli/src/lib/init/init-prompts.service.ts`
- **Gate**: type
- acceptance:
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
- q at the payment question quits (CLI-OFFER01).

## notes

- G30 (three components rank, three keep what they learn) is cut from this proposal: q00034 already plans it (its point 4, "three components choose a model and three keep what was learned"), and making it here would duplicate that plan. Nothing of it shipped in f00790.
- G21 needed no change: `spend-confirmation.service.spec.ts` ("asks the user, and a yes mints the token the manager verifies") proves a confirmation can be given and is verified.
- G32: quota is observed from API responses (`quotaSink`) and from plan tools (`observePlanQuota`), and unattended hops reserve against those observations; this proposal moved the reservations to one machine ledger (C3) and kept a set-aside ledger refusing (C4).
- G52: a known client nobody can ask stays available with `auth.authenticated: null`; one that answers needs-login, needs-plan or quota-exhausted is not available, nor one whose model list lacks the provider's model.
- G53: the current host handles its own subscription in context; another host's CLI is started; a host with no CLI (Copilot in an editor) is refused. A subscription stays outside the spend guard: what it runs is paid by its plan.
- G99: a plan whose verify step has not run reports `unverified`, is not ok, and its receipt reads `unverified`, so the learning store sees neither a success nor a failure.
- The quota ledger moved from the workspace cache to the machine's (`~/.cache/delendai/orchestrator-runner/quota-reservations.json`, `DELENDAI_QUOTA_LEDGER` to override); a workspace ledger from before is merged in at start and journalled in the plugin's `migrations.jsonl`.
