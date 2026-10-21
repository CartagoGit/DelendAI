---
id: f00784
title: "Batuta runs its hops on any ACP agent and any catalogue provider: an acp kind, an invoker over the ACP driver, and a roster fed by what is detected"
kind: feat
status: in-progress
type: proposal
track: batuta
date: 2026-10-21
last-transition-id: f8e9b53c-af74-4da6-b829-e2d373ee1d89
last-correlation-id: f8e9b53c-af74-4da6-b829-e2d373ee1d89
last-transition-from: ready
last-transition-at: 2026-10-21T20:47:01.606Z
---

# f00784 — Batuta runs its hops on any ACP agent and any catalogue provider: an acp kind, an invoker over the ACP driver, and a roster fed by what is detected

## goal

A hop Batuta routes can run on any agent the ACP registry or a declaration describes, and on any models.dev provider whose key is set, with the same routing, quota holds, spend checks, journal and cancel as the four kinds it has today. The roster is fed by what `delendai agents list` finds, so an agent installed tomorrow is a routable provider without a delendai release.

## why

f00783 lets delendai find, declare, install and greet any agent (ACP registry, declarations, PATH, IDEs, packages) and call any catalogue provider through its API family. Batuta does not use any of that yet: `InvocationManager.runOne` picks an invoker by `ProviderKind` (`api`, `subscription`, `cli`, `mcp-server`), and each client still needs its own argv in KNOWN_CLIENTS. The owner, 2026-10-21: 'lo que quiero realmente es que el sistema sea capaz de detectar y configurar para su uso cualquier llm, agente, cli, host o lo que sea para que delendai y batuta en específico puedan usarlo y trabajar con ellos'.

## non-goals

- Replacing the existing kinds: a `cli` or `subscription` entry keeps working as it does.
- Unattended spend without the person's consent: an ACP hop goes through the same spend check, quota hold and confirmBeforeExecute as any other.
- Auto-approving what an agent asks to do: permission requests follow the hop's toolsAllow and are refused otherwise.

## slices

- global_gate: type

### S1 — An acp provider kind and its invoker
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts`, `packages/core/src/lib/contracts/constants/provider-entry-schema.constant.ts`, `packages/core/src/lib/shared/acp-client.service.ts`, `packages/core/src/contracts/index.ts`, `plugins/orchestrator-runner/src/lib/invoke/acp-invoker.service.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/acp-invoker.interface.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`, `plugins/orchestrator-runner/src/lib/invoke/handoff.ts`, `plugins/orchestrator-runner/src/lib/healthcheck/report.ts`, `plugins/orchestrator-runner/src/lib/router/advise.ts`, `plugins/orchestrator-runner/src/lib/schemas.ts`, `plugins/orchestrator-runner/src/index.ts`, `plugins/usage-tracking/src/lib/record.ts`
- **Gate**: type
- acceptance:
  - "`ProviderKind` gains `acp`; a roster entry `invoke.acp` names an agent id (registry or declared) or a command with args. The acp invoker starts it through the f00783 driver, sends the hop's prompt, streams its text, maps its usage to the journal, and cancels on timeout or user cancel."
  - "A permission request is allowed only when the tool it names is in the hop's `toolsAllow`; every other request is refused, and the refusals are listed in the hop's result."

### S2 — Catalogue providers as api hops
- **Status**: pending
- **Files**: `packages/core/src/lib/shared/provider-api-client.service.ts`, `packages/core/src/cli.ts`, `plugins/orchestrator-runner/src/lib/subprocess/api.ts`
- **Gate**: type
- acceptance:
  - "An `api` roster entry whose `invoke.family` is `openai` or `anthropic` (the family models.dev names for its provider) is called at `url` as that family's chat for the entry's `modelId`, built and read by the same core functions as the f00783 adapter, with the key read from `invoke.envVar` at call time; usage is returned; an entry without a family keeps the original request."

### S3 — A roster fed by what is detected
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/acp-roster.service.ts`, `plugins/orchestrator-runner/src/lib/contracts/interfaces/acp-roster.interface.ts`, `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`, `plugins/orchestrator-runner/src/lib/discovery.schema.ts`, `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_discover_providers.ts`
- **Gate**: type
- acceptance:
  - "`discover_providers` returns, after the existing discovery consent, `proposed`: a roster entry for every agent `listAgents` can start over ACP and for every catalogue provider whose key is set (with its family), each validated against the roster schema and with default capabilities and cost tier for the person to adjust; nothing is written."

### S4 — One real hop, proved
- **Status**: pending
- **Files**: `plugins/orchestrator-runner/tests/src/lib/invoke/acp-invoker.service.spec.ts`, `plugins/orchestrator-runner/tests/src/lib/invoke/fixtures/fake-acp-coder.ts`, `docs/delendai/batuta/guide.md`
- **Gate**: type
- acceptance:
  - "A spec drives a full invoke through the manager to a fake ACP agent process over stdio (prompt, streamed text, one permission refused and one allowed by `toolsAllow`, usage in the result); cancellation is specced on `runAcpAgent`. The Batuta guide says how an ACP agent and a catalogue provider become routable. A consented paid hop on a real agent (OpenCode over ACP) is left for the owner to run: the guide lists it under "Not proved yet"."

## acceptance

- `ProviderKind` gains `acp`; a roster entry `invoke.acp` names an agent id (registry or declared) or a command with args. The acp invoker starts it through the f00783 driver, sends the hop's prompt, streams its text, maps its usage to the journal, and cancels on timeout or user cancel.
- A permission request is allowed only when the tool it names is in the hop's `toolsAllow`; every other request is refused, and the refusals are listed in the hop's result.
- An `api` roster entry whose `invoke.family` is `openai` or `anthropic` (the family models.dev names for its provider) is called at `url` as that family's chat for the entry's `modelId`, built and read by the same core functions as the f00783 adapter, with the key read from `invoke.envVar` at call time; usage is returned; an entry without a family keeps the original request.
- `discover_providers` returns, after the existing discovery consent, `proposed`: a roster entry for every agent `listAgents` can start over ACP and for every catalogue provider whose key is set (with its family), each validated against the roster schema and with default capabilities and cost tier for the person to adjust; nothing is written.
- A spec drives a full invoke through the manager to a fake ACP agent process over stdio (prompt, streamed text, one permission refused and one allowed by `toolsAllow`, usage in the result); cancellation is specced on `runAcpAgent`. The Batuta guide says how an ACP agent and a catalogue provider become routable. A consented paid hop on a real agent (OpenCode over ACP) is left for the owner to run: the guide lists it under "Not proved yet".
