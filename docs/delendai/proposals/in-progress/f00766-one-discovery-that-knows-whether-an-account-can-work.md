---
id: f00766
title: "One discovery that knows whether an account can work"
kind: feat
status: in-progress
type: proposal
track: batuta
date: 2026-10-18
parent: q00034
last-transition-id: 89ec509f-69b1-4609-8c04-faddfd9c3b6d
last-correlation-id: 89ec509f-69b1-4609-8c04-faddfd9c3b6d
last-transition-from: ready
last-transition-at: 2026-10-18T22:03:33.937Z
---

# f00766 — One discovery that knows whether an account can work

## goal

One catalogue says which vendor clients delendai knows and how each answers "are you installed, logged in, and able to work now"; one discovery service asks them and returns, per client, a verdict with its evidence. Every plugin that discovers providers reads that service, so the same machine reads the same everywhere. This is q00034 S2.

## why

Two catalogues of known clients exist and disagree: `orchestrator-runner` probes `claude, codex, copilot, aider, cn, agent` (`plugins/orchestrator-runner/src/lib/bootstrap.ts:37`, with its own auth-status commands at `:103`), `auto-agent-selector` probes `claude, codex, copilot, gemini, aider` and a list of API keys (`plugins/auto-agent-selector/src/lib/contracts/constants/known-providers.constant.ts`). Each probes the PATH its own way (`healthcheck/probe.ts`, `discovery/real-deps.ts`). Neither knows OpenCode, which this machine has installed without a paid plan (2026-10-18); neither can tell an installed, logged-in client from one that can do work. Copilot holds hosted models and BYOK ones (qwen, glm) behind its own configuration, and nothing asks it which.

Asked on 2026-10-18, OpenCode on this machine answered `auth list` with one MiniMax API credential and listed MiniMax models beside its own (`opencode/…`, which need its plan): what can run is a provider reached through a client, not the client itself.

## non-goals

- Reading any credential or any client's configuration values: a verdict comes from what the client answers when asked.
- Guessing: when a client offers no way to tell, the verdict is `unknown`, with that said.

## slices

- global_gate: type

### S1 — One catalogue of clients

- **Status**: review
- **Files**: `packages/core/src/lib/contracts/constants/known-clients.constant.ts`, `packages/core/src/lib/contracts/interfaces/known-client.interface.ts`, `packages/core/src/lib/shared/known-client.helper.ts`, `packages/core/src/contracts/index.ts`, `packages/core/tests/src/lib/contracts/known-clients.spec.ts`, `plugins/auto-agent-selector/src/lib/contracts/constants/known-providers.constant.ts`, `plugins/auto-agent-selector/src/lib/discovery/install-provider.ts`, `plugins/orchestrator-runner/src/lib/bootstrap.ts`, `plugins/orchestrator-runner/src/lib/healthcheck/install-hints.ts`, `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`, `plugins/orchestrator-runner/tests/src/lib/bootstrap.spec.ts`
- **Gate**: type
- acceptance:
  - "One catalogue in core contracts lists each known client once: its command, how to read its version, how to ask whether it is logged in, how (if at all) to ask whether its plan can work now, and the variable that points it at a profile. Both plugins read it and keep no list of their own; it includes OpenCode and every client either list had. A spec holds that no plugin source declares a client list."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — One discovery with a verdict per client

- **Status**: review
- **Files**: `packages/core/src/lib/shared/client-discovery.service.ts`, `packages/core/src/runtime/index.ts`, `packages/core/tests/src/lib/shared/client-discovery.service.spec.ts`, `plugins/orchestrator-runner/src/lib/healthcheck/probe.ts`, `plugins/orchestrator-runner/src/lib/tools/bootstrap.tool.ts`, `plugins/auto-agent-selector/src/lib/discovery/real-deps.ts`, `plugins/auto-agent-selector/src/index.ts`, `plugins/auto-agent-selector/src/lib/services/discover-ranked-providers.service.ts`, `plugins/auto-agent-selector/src/lib/tools/auto-status.tool.ts`, `plugins/auto-agent-selector/src/lib/tools/auto-evaluate.tool.ts`, `plugins/auto-agent-selector/src/lib/tools/auto-recommend.tool.ts`, `plugins/auto-agent-selector/src/lib/tools/auto-run.tool.ts`, `plugins/adaptive-optimizer/src/lib/services/optimize-run.service.ts`
- **Gate**: type
- acceptance:
  - "One service, consented as today, answers per client: `usable`, `needs-login`, `needs-plan`, `quota-exhausted`, `not-installed` or `unknown`, each with the command it ran and the line of its answer that decided it, never a credential. `auto-agent-selector` and `orchestrator-runner` call it and keep no probe of their own."
  - "Specs over recorded answers hold each verdict, an installed client with no plan read as `needs-plan` from its own answer, and a client that cannot tell read as `unknown`."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — A host client's models are listed through it

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`, `plugins/orchestrator-runner/src/lib/schemas.ts`, `plugins/orchestrator-runner/src/lib/discovery.schema.ts`, `plugins/orchestrator-runner/tests/src/lib/tools/discover.tool.spec.ts`, `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_discover_providers.ts`
- **Gate**: type
- acceptance:
  - "For a client that hosts several models (Copilot, OpenCode), discovery lists the model ids the client itself reports, when it offers a listing, each as a candidate of that client's account; when it offers none, discovery says so. No configuration file of the client is opened."

## acceptance

- On this machine, discovery reports Claude Code and Codex with their real verdicts, OpenCode as `needs-plan` or `unknown` from its own answer, and the same report reaches every plugin that asks.
