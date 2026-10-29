---
name: delendai-orchestrator-runner-playbook
plugin: orchestrator-runner
tools: ['delendai_orchestrator-runner_invoke', 'delendai_orchestrator-runner_advise_routing', 'delendai_orchestrator-runner_advise_spend', 'delendai_orchestrator-runner_format_handoff', 'delendai_orchestrator-runner_list_models', 'delendai_orchestrator-runner_get_quota', 'delendai_orchestrator-runner_accounts', 'delendai_orchestrator-runner_discover_providers', 'delendai_orchestrator-runner_healthcheck_providers', 'delendai_orchestrator-runner_bootstrap_providers', 'delendai_orchestrator-runner_set_provider_state', 'delendai_orchestrator-runner_cancel_invocation', 'delendai_orchestrator-runner_onboard_agent']
appliesTo: ['@delendai/orchestrator-runner']
description: How to route a task to a model provider with the orchestrator-runner tools, from setting up the roster to advising, handing off or invoking, without spending by accident.
---

# orchestrator-runner playbook

The tools split into setup, advice (free) and execution (can spend).

## Setup, once per project

1. `discover_providers`: which provider CLIs are installed. Needs the person's consent.
2. `bootstrap_providers`: draft a roster and a config patch; the person confirms it.
3. `healthcheck_providers`: which providers are usable right now.

## Every task

1. `advise_routing` scores the confirmed roster for the task and names the winner. No spend.
2. Then choose:
   - `format_handoff` turns the decision into a command you or the person runs. The safe
     path, and the only one when `executeApi` is false.
   - `invoke` runs it, with a fallback chain and a timeout. It never spends the person's API
     money without a signed confirmation token; do not try to get around that.
3. `cancel_invocation` stops one in flight, by id.
4. `onboard_agent` makes a project able to use another agent (its client and models) so routing can pick it.

## Looking before you spend

`list_models` (roster and reachability), `get_quota` (limits per window, may be empty),
`accounts` (credential and billing mode per account), `advise_spend` (recorded spend against
the caps, with risk-graded actions).

## When a provider misbehaves

`set_provider_state` overrides availability, with an `until` time and a `reason`. It is a
manual override: say why, and bound it.
