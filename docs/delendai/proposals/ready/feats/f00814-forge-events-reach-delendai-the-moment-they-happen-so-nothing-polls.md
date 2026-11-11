---
id: f00814
title: "Forge events reach delendai the moment they happen, so nothing polls"
kind: feat
status: ready
type: proposal
track: general
date: 2026-11-09
---

# f00814 — Forge events reach delendai the moment they happen, so nothing polls

## goal

The forge tells delendai when issues, pull requests, checks or reviews change, and subscribed sessions and agents receive it as an MCP notification at once. No agent and no product watcher polls the forge.

## why

The owner wants it to work like a websocket subscription: GitHub says instantly what changed. Today agents and watchers ask the forge again and again, which burns tokens and API quota and still lags. The integrator `land` is already triggered by events in CI; this proposal is about local sessions and agents. It builds on the forge adapter (plugins/forge), the github and gitlab plugins, the issues plugin and the notification plugin, and adds no second adapter.

## non-goals

- Changing the CI-triggered integrator: it already reacts to events.
- Storing forge credentials: none goes in config or logs; secrets come from the environment or the forge CLI session.
- Events for forges other than GitHub in the first slices: GitLab hooks come later through the same port.

## slices

- global_gate: type

### S1 — A forge-agnostic event port and normalised events
- **Status**: pending
- **Files**: `plugins/forge/src/lib/contracts/interfaces/forge-event-port.interface.ts`, `plugins/forge/src/lib/contracts/constants/forge-event.constant.ts`, `plugins/forge/src/lib/services/forge-event-normaliser.ts`, `plugins/forge/src/public/index.ts`, `plugins/forge/tests/forge-event-normaliser.spec.ts`
- **Gate**: type
- acceptance:
  - "The port declares subscribe and a normalised event: pr.opened, pr.updated, pr.ready, pr.merged, pr.closed, check.completed, review.submitted, issue.opened, issue.updated, issue.closed, branch.pushed, pr.commented."
  - "An adapter that implements the port needs no change elsewhere; the event shape carries no forge-specific field."
  - "A payload that fits no event is dropped with a counted reason, not thrown."

### S2 — GitHub webhooks feed the port
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/github/src/lib/webhook-events.service.ts`, `plugins/github/src/lib/contracts/constants/github-webhook.constant.ts`, `plugins/github/src/index.ts`, `plugins/github/package.json`, `bun.lock`, `plugins/github/tests/webhook-events.service.spec.ts`
- **Gate**: type
- acceptance:
  - "GitHub push, pull_request, check_run, pull_request_review, issues and issue_comment payloads map to the normalised events."
  - "A delivery whose signature does not verify is refused; the secret is generated per connection and kept in memory, never in config, and never logged."

### S3 — Events reach a dev machine with no public address
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/forge/src/lib/services/forge-event-receiver.ts`, `plugins/forge/tests/forge-event-receiver.spec.ts`, `plugins/github/src/lib/webhook-forward.service.ts`, `plugins/github/src/lib/contracts/interfaces/webhook-forward.interface.ts`, `plugins/github/tests/webhook-forward.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The architecture recommendation is implemented behind the port: the receiver connects out, so no inbound port or public IP is needed."
  - "A dropped connection reconnects and asks the forge once for what was missed; it does not poll."

### S4 — Sessions subscribe and are notified
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/notification/src/lib/services/forge-event-bridge.ts`, `plugins/notification/tests/forge-event-bridge.spec.ts`, `plugins/notification/src/lib/tools/tools.ts`, `plugins/notification/src/lib/tools/forge-events.tool.ts`, `plugins/notification/src/lib/tools/index.ts`, `plugins/notification/src/index.ts`, `plugins/notification/plugin.manifest.ts`, `plugins/notification/src/lib/contracts/constants/forge-event-bridge.constant.ts`, `plugins/notification/src/lib/contracts/interfaces/forge-event-bridge.interface.ts`, `packages/core/src/lib/forge-events/forge-event-store.service.ts`, `packages/core/src/lib/contracts/constants/forge-event-store.constant.ts`, `packages/core/src/lib/contracts/interfaces/forge-event-store.interface.ts`, `packages/core/src/runtime/index.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/forge-events/forge-event-store.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A session subscribes to events by repository, pull request or issue; only subscribed sessions receive the MCP notification."
  - "A policy toggle turns the feature on per project and it is off until a project opts in."
  - "No credential appears in a notification, a log line or the config."
  - "`work publish` and `work deliver` subscribe the publishing agent to the pull request they open."
  - "A notification names the outcome: merged, a check failed with its name, a label, or the reason `land` gave."
  - "An agent waits for an outcome in one blocking call (`forge_await`) that costs it nothing until the forge speaks."

### S5 — The remaining polling watchers are removed
- **Status**: pending
- **DependsOn**: [S3, S4]
- **Files**: `plugins/notification/src/lib/services/watcher.ts`, `plugins/notification/src/lib/services/handoff-watcher.ts`
- **Gate**: type
- acceptance:
  - "An inventory lists every product watcher that asks the forge on a timer; each one is replaced by an event subscription or deleted."
  - "With events flowing, no product code path polls the forge, and a lint fails if one is added."

### S6 — The host follows the integration branch and brings labelled pull requests forward on forge events, not on a timer
- **Status**: pending
- **DependsOn**: [S2, S3]
- **Files**: `tools/scripts/host/forge-event-follow.service.ts`, `tools/scripts/host/forge-event-follow.interface.ts`, `tools/scripts/host/forge-event-follow.service.spec.ts`, `tools/scripts/host/host-server.script.ts`, `tools/scripts/host/host-server.script.spec.ts`, `tools/package.json`, `bun.lock`, `packages/core/src/lib/startup-reconciler/hydration-watch.ts`, `packages/core/tests/src/lib/startup-reconciler/hydration-watch.spec.ts`, `packages/core/src/lib/startup-gate/start-checkout-hydration.ts`, `packages/core/src/lib/startup-gate/start-checkout-hydration.interface.ts`, `packages/core/src/lib/contracts/interfaces/integration-engine.interface.ts`, `packages/core/src/lib/development-policy/resolve.interface.ts`, `packages/core/src/lib/development-policy/resolve.ts`, `packages/core/src/lib/development-policy/profiles.ts`, `packages/core/src/lib/plugins/development-delivery-schema.constant.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/tests/src/lib/development-policy/resolve.spec.ts`, `delendai.config.json`
- **Gate**: type
- acceptance:
  - "With events flowing, a push to the integration branch runs the follow (fetch and fast-forward) and the follow-ups `--on=move`."
  - "A pull request labelled `delendai:needs-update`, or synchronized by a bot, runs the follow-ups `--on=event`."
  - "The 60 s watch is a fallback: it runs only while no event connection is up, and logs that it is the fallback; while connected no timer runs."
  - "A reconnection asks the forge once for what was missed: one follow pass and one `--on=event` run."
  - "Only the server that holds the maintenance lease runs the receiver."
  - "The policy key `development.integration.forgeEvents` turns it on per project; it is off until a project opts in."

## acceptance

- The port declares subscribe and a normalised event: pr.opened, pr.updated, pr.ready, pr.merged, pr.closed, check.completed, review.submitted, issue.opened, issue.updated, issue.closed, branch.pushed, pr.commented.
- An adapter that implements the port needs no change elsewhere; the event shape carries no forge-specific field.
- A payload that fits no event is dropped with a counted reason, not thrown.
- GitHub push, pull_request, check_run, pull_request_review, issues and issue_comment payloads map to the normalised events.
- A delivery whose signature does not verify is refused; the secret is generated per connection and kept in memory, never in config, and never logged.
- The architecture recommendation is implemented behind the port: the receiver connects out, so no inbound port or public IP is needed.
- A dropped connection reconnects and asks the forge once for what was missed; it does not poll.
- A session subscribes to events by repository, pull request or issue; only subscribed sessions receive the MCP notification.
- A policy toggle turns the feature on per project and it is off until a project opts in.
- No credential appears in a notification, a log line or the config.
- `work publish` and `work deliver` subscribe the publishing agent to the pull request they open.
- A notification names the outcome: merged, a check failed with its name, a label, or the reason `land` gave.
- An agent waits for an outcome in one blocking call (`forge_await`) that costs it nothing until the forge speaks.
- An inventory lists every product watcher that asks the forge on a timer; each one is replaced by an event subscription or deleted.
- With events flowing, no product code path polls the forge, and a lint fails if one is added.
- With events flowing, a push to the integration branch runs the follow (fetch and fast-forward) and the follow-ups `--on=move`.
- A pull request labelled `delendai:needs-update`, or synchronized by a bot, runs the follow-ups `--on=event`.
- The 60 s watch is a fallback: it runs only while no event connection is up, and logs that it is the fallback; while connected no timer runs.
- A reconnection asks the forge once for what was missed: one follow pass and one `--on=event` run.
- Only the server that holds the maintenance lease runs the receiver.
- The policy key `development.integration.forgeEvents` turns it on per project; it is off until a project opts in.
## architecture

Options for receiving events on a machine with no public address:

- **Relay service**: the forge posts to a hosted endpoint and the machine connects out to it. Works anywhere, but adds a service to run and trust.
- **`gh webhook forward`**: the forge CLI opens an outbound connection and delivers events to a local port. No service of ours, GitHub only, needs the CLI and a login.
- **CI step pushing to a channel**: a workflow forwards events to a channel the machine subscribes to. Needs no tunnel, but waits for a CI job and is slower.

Recommendation: the outbound-connection receiver behind the port, with `gh webhook forward` as the first transport. It needs no inbound port, public IP or relay of ours, and the session's CLI login supplies the credential. A relay or channel transport is added later behind the same port, for forges whose CLI has no equivalent such as GitLab.

## notes

- Existing pieces to build on: the forge adapter and its seam in `plugins/forge`, the `plugins/github` and `plugins/gitlab` clients, and the notification plugin that already delivers MCP notifications such as lock release.
- The integrator `land` is already triggered by events in CI and stays as it is.
